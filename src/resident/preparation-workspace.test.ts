import { expect, it } from "vitest"
import fc from "fast-check"
import {
  captureWorkspaceBytes,
  analysisWorkspaceBytes
} from "@hapsland/resident-runtime/resident/preparation-workspace"
import { MAX_SOURCE_BYTES } from "@hapsland/native-observation/direct-event/capture"
import {
  MAX_TYPE_DECLARATIONS,
  type AnalyzerMaterializationPreflight
} from "@hapsland/source-analysis/direct-event/languages/contracts"
import { canonicalValue } from "@hapsland/review-definition/direct-event/model"
import { combinedAnalyzerMaterializationPreflight } from "@hapsland/source-analysis/direct-event/analyzer"

const bytes = (value: unknown): number => Buffer.byteLength(canonicalValue(value), "utf8")
const path = fc
  .array(fc.constantFrom("a", "/", ".", "é", "🌲", "\\", '"', "\n"), { maxLength: 64 })
  .map((parts) => parts.join(""))
const preflight = fc.option(
  fc.record({
    declarations: fc.integer({ min: 0, max: 2 * MAX_TYPE_DECLARATIONS }),
    expandedUnitBytes: fc.integer({ min: 0, max: 2 * MAX_TYPE_DECLARATIONS * MAX_SOURCE_BYTES }),
    hasImports: fc.boolean()
  }),
  { nil: undefined }
)
const rules = fc.array(fc.record({ question: fc.string({ maxLength: 64 }), enabled: fc.boolean() }), { maxLength: 16 })

it("charges measured empty TypeScript roots without the unknown-declaration fallback", () => {
  const source = "import './fixture'; const run = () => 1\n" + "// fixture padding\n".repeat(1500)
  const sourceBytes = Buffer.byteLength(source)
  const facts = combinedAnalyzerMaterializationPreflight("fixture.ts", source)
  expect(facts).toEqual({ declarations: 0, expandedUnitBytes: 0, hasImports: true })
  expect(analysisWorkspaceBytes("fixture.ts", sourceBytes, facts, [])).toBe(
    captureWorkspaceBytes("fixture.ts", sourceBytes) + 8 * 1024 * 1024
  )
  expect(analysisWorkspaceBytes("fixture.ts", sourceBytes, undefined, [])).toBeGreaterThan(32 * 1024 * 1024)
})

// Accepted pre-migration conservative bound, used only as an optimization oracle.
const previousAnalysisBound = (
  name: string,
  source: number,
  facts: AnalyzerMaterializationPreflight | undefined,
  policy: unknown
): number =>
  8 * MAX_SOURCE_BYTES +
  MAX_TYPE_DECLARATIONS * (bytes(name) + 512) +
  (facts?.hasImports ? 8 * 1024 * 1024 : 0) +
  (facts?.expandedUnitBytes ?? MAX_TYPE_DECLARATIONS * MAX_SOURCE_BYTES) +
  (facts?.declarations ?? MAX_TYPE_DECLARATIONS) * (bytes(policy) + source + 4 * bytes(name) + 4096)

it("preserves the full-source analysis bound and never increases the old charge", () => {
  fc.assert(
    fc.property(
      path,
      fc.integer({ min: 0, max: MAX_SOURCE_BYTES }),
      preflight,
      rules,
      (name, source, facts, policy) => {
        const measured = analysisWorkspaceBytes(name, source, facts, policy)
        expect(measured).toBeLessThanOrEqual(previousAnalysisBound(name, source, facts, policy))
        expect(analysisWorkspaceBytes(name, MAX_SOURCE_BYTES, facts, policy)).toBe(
          previousAnalysisBound(name, MAX_SOURCE_BYTES, facts, policy)
        )
        expect(measured).toBeGreaterThanOrEqual(
          8 * source + (facts?.expandedUnitBytes ?? MAX_TYPE_DECLARATIONS * MAX_SOURCE_BYTES)
        )
      }
    ),
    { numRuns: 200 }
  )
})

it("keeps source-size charges monotonic and retains the import-graph margin", () => {
  fc.assert(
    fc.property(
      path,
      fc.tuple(fc.integer({ min: 0, max: MAX_SOURCE_BYTES }), fc.integer({ min: 0, max: MAX_SOURCE_BYTES })),
      preflight,
      rules,
      (name, sizes, facts, policy) => {
        const low = Math.min(...sizes),
          high = Math.max(...sizes)
        expect(analysisWorkspaceBytes(name, high, facts, policy)).toBeGreaterThanOrEqual(
          analysisWorkspaceBytes(name, low, facts, policy)
        )
        const nonImport = { declarations: 1, expandedUnitBytes: 100, hasImports: false }
        expect(
          analysisWorkspaceBytes(name, low, { ...nonImport, hasImports: true }, policy) -
            analysisWorkspaceBytes(name, low, nonImport, policy)
        ).toBe(8 * 1024 * 1024)
        expect(captureWorkspaceBytes(name)).toBe(captureWorkspaceBytes(name, MAX_SOURCE_BYTES))
        expect(captureWorkspaceBytes(name, low)).toBeLessThanOrEqual(captureWorkspaceBytes(name))
      }
    ),
    { numRuns: 200 }
  )
})

it("fails closed on invalid measured source sizes", () => {
  for (const source of [-1, 0.5, NaN, Infinity, MAX_SOURCE_BYTES + 1]) {
    expect(() => analysisWorkspaceBytes("fixture.ts", source, undefined, [])).toThrow(
      "invalid captured source workspace measurement"
    )
  }
  expect(analysisWorkspaceBytes("fixture.ts", 0, { declarations: 0, expandedUnitBytes: 0 }, [])).toBe(
    captureWorkspaceBytes("fixture.ts", 0)
  )
})
