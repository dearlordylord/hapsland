import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { Decision, DecisionModel } from "effect/ai"
import { controlledDecisionModelLayer } from "@hapsland/review-execution/review-execution/controlled-decision-model"

const before = "type OrderCount = number"
const after = 'type OrderCount = number & { readonly __brand: "OrderCount" }'
const definition = Decision.make({
  input: Schema.Json,
  decisions: {
    bare_domain_value: Decision.probability({
      instructions: "Is this a bare domain value?",
      criteria: { true: "bare", false: "branded" }
    })
  }
})

const decide = (source: string, scenario: "control" | "finding", domain = "order-count.ts") =>
  Effect.gen(function* () {
    const model = yield* DecisionModel.DecisionModel
    return yield* model.decide(definition, { input: { artifact: { domain, source } } })
  }).pipe(Effect.provide(controlledDecisionModelLayer({ syntheticR6BrandedRepair: scenario })))

describe("source-sensitive synthetic r6 fixture", () => {
  it.effect("classifies each exact line ending for bare and branded snapshots", () =>
    Effect.gen(function* () {
      for (const ending of ["", "\n", "\r\n"]) {
        const initial = yield* decide(`${before}${ending}`, "finding")
        const repaired = yield* decide(`${after}${ending}`, "finding")
        const control = yield* decide(`${before}${ending}`, "control")
        expect(initial.answers.bare_domain_value.probability).toBe(0.9)
        expect(repaired.answers.bare_domain_value.probability).toBe(0)
        expect(control.answers.bare_domain_value.probability).toBe(0)
      }
    })
  )

  it("rejects an unknown snapshot instead of returning a clear answer", async () => {
    for (const source of ["type OrderCount = string", `${before}\n\n`, `${after} `, `${after}\r`]) {
      await expect(Effect.runPromise(decide(source, "finding"))).rejects.toThrow()
    }
    await expect(Effect.runPromise(decide(`${after}\n`, "control"))).rejects.toThrow()
    await expect(Effect.runPromise(decide(before, "finding", "other.ts"))).rejects.toThrow()
  })
})

describe("source-sensitive native stale-result control", () => {
  it.effect("returns a finding for the old declaration and clear for the new declaration", () =>
    Effect.gen(function* () {
      const model = yield* DecisionModel.DecisionModel
      const paymentDefinition = Decision.make({
        input: Schema.Json,
        decisions: {
          meaningless_combinations: Decision.probability({
            instructions: "Can this state admit impossible combinations?",
            criteria: { true: "yes", false: "no" }
          })
        }
      })
      const initial = yield* model.decide(paymentDefinition, {
        input: { artifact: { source: "export interface PaymentState { status: string }" } }
      })
      const repaired = yield* model.decide(paymentDefinition, {
        input: { artifact: { source: "export type PaymentState = { status: 'pending' }" } }
      })
      expect(initial.answers.meaningless_combinations.probability).toBe(0.91)
      expect(repaired.answers.meaningless_combinations.probability).toBe(0)
    }).pipe(Effect.provide(controlledDecisionModelLayer({ findingOnSourceIncludes: "interface PaymentState" })))
  )
})

const summaryDirectories: string[] = []
afterEach(() => {
  for (const directory of summaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe("controlled request summaries", () => {
  it.effect("records graph counts and source matching without retaining source", () =>
    Effect.gen(function* () {
      const directory = mkdtempSync(join(tmpdir(), "haps-request-summary-"))
      summaryDirectories.push(directory)
      const requestSummaryPath = join(directory, "summary.jsonl")
      const layer = controlledDecisionModelLayer({ requestSummaryPath, findingOnSourceIncludes: "private source" })
      const inputs = [
        null,
        {},
        {
          artifact: { kind: "datatype", source: "private source" },
          evidence: {
            nodes: [{}, {}],
            edges: [{ kind: "expanded" }, { kind: "included" }, { kind: "omitted" }, { kind: "other" }]
          }
        }
      ]
      for (const input of inputs) {
        yield* Effect.gen(function* () {
          const model = yield* DecisionModel.DecisionModel
          yield* model.decide(definition, { input })
        }).pipe(Effect.provide(layer))
      }
      const text = readFileSync(requestSummaryPath, "utf8")
      const summaries = text
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
      for (let index = 0; index < inputs.length; index++) {
        expect(summaries[index].inputBytes).toBe(Buffer.byteLength(JSON.stringify(inputs[index]), "utf8"))
        expect(summaries[index].evidenceBytes).toBe(
          Buffer.byteLength(JSON.stringify(inputs[index]?.evidence) ?? "null", "utf8")
        )
        expect(summaries[index].crossFileEvidenceNodes).toBe(0)
      }
      const empty = {
        rootKind: "unknown",
        conditionalFindingSourceMatched: false,
        evidenceNodes: 0,
        expandedEdges: 0,
        includedEdges: 0,
        omittedEdges: 0
      }
      expect(
        text
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      ).toMatchObject([
        empty,
        empty,
        {
          rootKind: "datatype",
          conditionalFindingSourceMatched: true,
          evidenceNodes: 2,
          expandedEdges: 1,
          includedEdges: 1,
          omittedEdges: 1
        }
      ])
      expect(text).not.toContain("private source")
    })
  )

  it.effect("keeps the controlled decision available when summary storage fails", () =>
    Effect.gen(function* () {
      const directory = mkdtempSync(join(tmpdir(), "haps-request-summary-failure-"))
      summaryDirectories.push(directory)
      const result = yield* Effect.gen(function* () {
        const model = yield* DecisionModel.DecisionModel
        return yield* model.decide(definition, { input: {} })
      }).pipe(
        Effect.provide(
          controlledDecisionModelLayer({ requestSummaryPath: join(directory, "missing", "summary.jsonl") })
        )
      )
      expect(result.answers.bare_domain_value.probability).toBe(0)
    })
  )
})
