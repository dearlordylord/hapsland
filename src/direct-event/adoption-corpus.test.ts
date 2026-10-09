import { describe, expect, it } from "@effect/vitest"
import { readFile } from "node:fs/promises"
import * as Effect from "effect/Effect"
import { adaptCodexDirectEvent } from "@hapsland/native-observation/direct-event/adapter"
import {
  prepareObservation,
  preparedUnitStillCurrent,
  reviewObservation
} from "@hapsland/review-execution/direct-event/pipeline"
import { addEvent, makeGitFixture, put } from "@hapsland/build-tooling/test-support/test-fixtures"
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "@hapsland/review-definition/runtime/review-config"
import { compileRule } from "@hapsland/review-definition/rules/compiler"
import { FUNCTION_INPUT_CONTRACT, TYPE_INPUT_CONTRACT } from "@hapsland/review-definition/rules/targets"
import { controlledDecisionModelLayer } from "@hapsland/review-execution/review-execution/controlled-decision-model"
import { resolveConfiguration } from "@hapsland/runtime-inputs/configuration/resolve"
import { MAX_TYPE_DECLARATIONS } from "@hapsland/source-analysis/direct-event/analyzer"

type Case = {
  id: string
  branch: string
  event: { kind: "Add" | "Update"; patch: string }
  selectedRoot: { name: string }
  expectedCompleteness: string
  expectedBand: "<0.30" | ">0.70" | null
  sources: ReadonlyArray<{ path: string }>
}

const corpus = new URL("../test-support/fixtures/issue-138-adoption/", import.meta.url)
const manifest = JSON.parse(await readFile(new URL("manifest.json", corpus), "utf8")) as { cases: ReadonlyArray<Case> }
const sources = JSON.parse(await readFile(new URL("sources.json", corpus), "utf8")) as Readonly<Record<string, string>>
const offlineManifest = JSON.parse(await readFile(new URL("offline-manifest.json", corpus), "utf8")) as {
  cases: ReadonlyArray<{
    id: string
    branch: Case["branch"]
    event: Case["event"]
    sources: Case["sources"]
    policy: { includes: string[]; excludes: string[] } | null
    category: string
  }>
}
const readFixtureSource = (path: string): string => {
  const source = sources[path]
  if (source === undefined) throw new Error(`missing adoption source fixture: ${path}`)
  return source
}
const declarationLimitSource = (branch: Case["branch"]): string =>
  Array.from({ length: MAX_TYPE_DECLARATIONS + 1 }, (_, index) =>
    branch.split("/")[0] === "type-shape"
      ? `interface T${index} { x: string }`
      : `function T${index}(): number { return ${index} }`
  ).join("\n")
const declarationLimitPatch = (branch: Case["branch"]): string =>
  [
    "*** Begin Patch",
    "*** Add File: root.ts",
    ...declarationLimitSource(branch)
      .split("\n")
      .map((line) => `+${line}`),
    "*** End Patch"
  ].join("\n")
const rules = [
  {
    id: "type",
    question: "Is the shape meaningful?",
    criteria: { false: "No", true: "Yes" },
    message: "Review type",
    inputs: [
      {
        languages: ["typescript", "rust", "bend"],
        kind: "type",

        requires: ["root-declaration", "resolved-outbound-types"]
      }
    ]
  },
  {
    id: "function",
    question: "Is the body accounted for?",
    criteria: { false: "No", true: "Yes" },
    message: "Review function",
    inputs: [
      {
        languages: ["typescript"],
        kind: "function",

        requires: ["signature", "body", "resolved-local-calls"]
      }
    ]
  }
].map((rule) => compileRule({ version: 1, ...rule }, "fixture:adoption-corpus"))

describe("proposed adoption corpus native completeness", () => {
  for (const fixture of manifest.cases) {
    it.effect(fixture.id, () =>
      Effect.gen(function* () {
        const root = yield* Effect.promise(makeGitFixture)
        for (const source of fixture.sources) {
          const name = source.path.split("/").at(-1)
          if (name === undefined || name === "root.before.ts") continue
          const content = readFixtureSource(source.path)
          yield* Effect.promise(() => put(root, name, content))
        }
        const raw = addEvent(root, ["root.ts"], {
          tool_input: { command: fixture.event.patch },
          tool_response: { success: true }
        })
        const observation = yield* adaptCodexDirectEvent(raw)
        expect(observation).toBeDefined()
        if (observation === undefined) return
        const prepared = yield* prepareObservation(observation, {
          controlledWriter: true,
          advicee: observation.advicee,
          inputContract: fixture.branch.split("/")[0] === "type-shape" ? TYPE_INPUT_CONTRACT : FUNCTION_INPUT_CONTRACT,
          settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
          rules
        })
        const selected = prepared.observation.outcomes
          .filter((outcome) => outcome.status === "observed")
          .flatMap((outcome) => outcome.units.map((unit) => unit.root.artifact.name))
        if (fixture.expectedBand === null) {
          // The original declaration expected no Jev band. A bounded partial
          // graph can now retain its root while this probe rule still lacks evidence.
          expect(prepared.outcomes.filter((outcome) => outcome.status === "ready")).toHaveLength(0)
        } else {
          expect(fixture.expectedCompleteness).toBe("complete-candidate")
          expect(selected).toEqual([fixture.selectedRoot.name])
          expect(prepared.outcomes.filter((outcome) => outcome.status === "ready")).toHaveLength(1)
        }
      })
    )
  }
  for (const fixture of offlineManifest.cases) {
    it.effect(fixture.id, () =>
      Effect.gen(function* () {
        const id = fixture.id
        const root = yield* Effect.promise(makeGitFixture)
        const declarationOverflow = fixture.category === "declaration-cap"
        for (const source of fixture.sources) {
          const name = source.path.split("/").at(-1)
          if (name === undefined || name === "root.before.ts" || name.endsWith(".after.ts")) continue
          // Preserve the original 65-root fixture in sources.json. The current
          // accepted analyzer limit is 1,024 roots, so extend this deterministic
          // Add case just past that limit to keep its overflow assertion meaningful.
          const content = declarationOverflow ? declarationLimitSource(fixture.branch) : readFixtureSource(source.path)
          yield* Effect.promise(() => put(root, name, content))
        }
        const observation = yield* adaptCodexDirectEvent(
          addEvent(root, ["root.ts"], {
            tool_input: { command: declarationOverflow ? declarationLimitPatch(fixture.branch) : fixture.event.patch },
            tool_response: { success: true }
          })
        )
        expect(observation).toBeDefined()
        if (observation === undefined) return
        const reads: string[] = []
        const settings =
          fixture.category === "source-cap"
            ? {
                backend: DEFAULT_BACKEND,
                destination: DEFAULT_DESTINATION,
                configuration: {
                  policy: resolveConfiguration(
                    [
                      {
                        name: "project",
                        source: "fixture:adoption-corpus",
                        document: {
                          version: 1,
                          graphLimits: { version: 1, sourceBytes: 256 * 1024, readBytes: 256 * 1024 }
                        }
                      }
                    ],
                    root
                  )
                }
              }
            : { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }
        const context = {
          controlledWriter: true,
          advicee: observation.advicee,
          inputContract: fixture.branch.split("/")[0] === "type-shape" ? TYPE_INPUT_CONTRACT : FUNCTION_INPUT_CONTRACT,
          settings,
          rules: fixture.category === "no-target-rule" ? [] : rules,
          ...(fixture.policy === null ? {} : { policy: fixture.policy }),
          captureHooks: {
            sourceRead: (path: string) => {
              reads.push(path)
            }
          },
          allowCandidateCrossFileEgress: true
        } as const
        const prepared = yield* prepareObservation(observation, context)
        const selected = prepared.observation.outcomes
          .filter((outcome) => outcome.status === "observed")
          .flatMap((outcome) => outcome.units.map((unit) => unit.root.artifact.name))
        const ready = prepared.outcomes.filter((outcome) => outcome.status === "ready")
        const completeCycle = fixture.category === "cycle-complete-control"
        const multiRoot = fixture.category === "multi-root-add-control"
        const stale = fixture.category === "stale-support"
        const noRule = fixture.category === "no-target-rule"
        const partialRoot =
          ["excluded-transitive", "private-support", "tree-overflow-continue"].includes(fixture.category) ||
          (fixture.category === "package-import" && fixture.branch === "function/v1")
        expect(selected).toEqual(
          multiRoot
            ? ["A", "B"]
            : completeCycle || stale || noRule || partialRoot
              ? [fixture.branch.split("/")[0] === "type-shape" ? "A" : "run"]
              : []
        )
        expect(ready).toHaveLength(multiRoot ? 2 : completeCycle || stale ? 1 : 0)
        if (completeCycle) {
          const current = ready[0]
          if (current?.status !== "ready") throw new Error(`missing cycle unit ${id}`)
          const rootNode = current.prepared.input.unit.root
          expect(rootNode.references).toMatchObject([
            {
              kind: "expanded",
              node: {
                artifact: { id: `b.ts:${fixture.branch.split("/")[0] === "type-shape" ? "interface" : "function"}:B` },
                references: [{ kind: "included", target: rootNode.artifact.id }]
              }
            }
          ])
        }
        if (noRule) {
          expect(prepared.observation.status).toBe("complete")
        } else if (!completeCycle && !multiRoot && !stale) {
          expect(prepared.observation.status).toBe("incomplete")
        }
        if (fixture.category === "source-cap") {
          expect(prepared.observation.outcomes).toMatchObject([
            {
              status: "incomplete",
              diagnostic: {
                stage: "capture",
                code: "capture-size-limit",
                args: {
                  observedBytes: Buffer.byteLength(readFixtureSource(`offline/${id}/root.ts`)),
                  limitBytes: 256 * 1024
                }
              }
            }
          ])
        } else if (!completeCycle && !multiRoot && !stale && !noRule) {
          const observed = prepared.observation.outcomes.find((outcome) => outcome.status === "observed")
          const reason =
            fixture.category === "duplicate-update-location"
              ? "ambiguous-update"
              : fixture.category === "package-import" && fixture.branch.split("/")[0] === "type-shape"
                ? "import"
                : fixture.category === "declaration-cap"
                  ? fixture.branch.split("/")[0] === "type-shape"
                    ? "declaration-limit"
                    : "declaration-limit"
                  : fixture.category === "unsupported-binding"
                    ? fixture.branch.split("/")[0] === "type-shape"
                      ? "declaration-merge"
                      : "function-overload"
                    : "missing-evidence"
          expect(observed?.analysis).toMatchObject({
            status: "incomplete",
            failures: [expect.objectContaining({ reason })]
          })
        }
        const capturedReads = [...reads]
        if (fixture.category === "excluded-transitive") {
          expect(capturedReads).toEqual(["root.ts", "root.ts", "b.ts", "b.ts"])
          expect(capturedReads).not.toContain("c.ts")
        } else if (fixture.category === "tree-overflow-continue") {
          expect(capturedReads).toEqual(["root.ts", "root.ts", "huge.ts", "huge.ts", "later.ts", "later.ts"])
        } else if (fixture.category === "source-cap") {
          expect(capturedReads).toEqual([])
        } else if (["private-support", "cycle-complete-control", "stale-support"].includes(fixture.category)) {
          expect(capturedReads).toEqual(["root.ts", "root.ts", "b.ts", "b.ts"])
        } else {
          expect(capturedReads).toEqual(["root.ts", "root.ts"])
        }
        if (stale) {
          const current = ready[0]
          if (current?.status !== "ready") throw new Error(`missing ready stale fixture ${id}`)
          const after = readFixtureSource(`offline/${id}/b.after.ts`)
          yield* Effect.promise(() => put(root, "b.ts", after))
          expect(yield* preparedUnitStillCurrent(observation, current.prepared, context)).toBe(false)
          const original = readFixtureSource(`offline/${id}/b.ts`)
          yield* Effect.promise(() => put(root, "b.ts", original))
        }
        let calls = 0
        let handoffReached = false
        const review = yield* reviewObservation(observation, {
          ...context,
          ...(stale
            ? {
                beforeHandoff: Effect.promise(async () => {
                  handoffReached = true
                  const after = readFixtureSource(`offline/${id}/b.after.ts`)
                  await put(root, "b.ts", after)
                })
              }
            : {})
        }).pipe(
          Effect.provide(
            controlledDecisionModelLayer({
              onRequest: Effect.sync(() => {
                calls += 1
              }),
              ...(stale
                ? {
                    answers: Object.fromEntries(
                      rules.map((rule) => [rule.id, { _tag: "Probability" as const, probability: 0.95 }])
                    )
                  }
                : {})
            })
          )
        )
        if (stale) {
          expect(handoffReached).toBe(true)
          expect(review).toMatchObject({ status: "unavailable", reason: "stale", output: undefined })
        } else {
          expect(review.status).toBe("no-advice")
        }
        expect(calls).toBe(completeCycle || stale ? 1 : multiRoot ? 2 : 0)
      })
    )
  }
})
