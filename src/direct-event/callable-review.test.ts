import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { rm } from "node:fs/promises"
import { addEvent, updateEvent, makeGitFixture, put } from "@hapsland/build-tooling/test-support/test-fixtures"
import { configuredRules } from "@hapsland/build-tooling/test-support/default-rules"
import { adaptCodexDirectEvent } from "@hapsland/native-observation/direct-event/adapter"
import { prepareObservation, evaluatePrepared } from "@hapsland/review-execution/direct-event/pipeline"
import { controlledDecisionModelLayer } from "@hapsland/review-execution/review-execution/controlled-decision-model"
import { FUNCTION_INPUT_CONTRACT } from "@hapsland/review-definition/rules/targets"
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "@hapsland/review-definition/runtime/review-config"

const settings = { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }
const rules = configuredRules.filter((rule) => rule.id === "body_reaches_undeclared")

describe("bounded const callable review", () => {
  it.effect("keeps a changed span across adjacent callable roots ambiguous", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      try {
        const lines = [
          "export const first = (value: number) => value + 2;",
          "export const second = (value: number) => value + 2;"
        ]
        yield* Effect.promise(() => put(root, "type.ts", lines.join("\n")))
        const observation = yield* adaptCodexDirectEvent(updateEvent(root, "type.ts", lines))
        if (observation === undefined) throw new Error("Native patch fixture unavailable")
        const prepared = yield* prepareObservation(observation, {
          controlledWriter: true,
          advicee: observation.advicee,
          settings,
          rules,
          inputContract: FUNCTION_INPUT_CONTRACT
        })
        expect(prepared.outcomes.filter((outcome) => outcome.status === "ready")).toEqual([])
        expect(prepared.observation.outcomes).toContainEqual(
          expect.objectContaining({
            status: "observed",
            analysis: { status: "incomplete", failures: [{ reason: "ambiguous-update", root: undefined }] }
          })
        )
      } finally {
        yield* Effect.promise(() => rm(root, { recursive: true, force: true }))
      }
    })
  )
  it.effect("attributes an arrow update among 128 siblings and reviews only its imported helper", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      try {
        yield* Effect.promise(() =>
          put(
            root,
            "support.ts",
            "export interface Item { value: number }\nexport const helper = (value: Item): Item => value;"
          )
        )
        const changed = "  return helper({ value: item.value + 2 });"
        yield* Effect.promise(() =>
          put(
            root,
            "type.ts",
            [
              "import { helper, type Item } from './support';",
              "export const run = (item: Item): Item => {",
              changed,
              "};",
              ...Array.from({ length: 128 }, (_, index) => `export const sibling${index} = (value: number) => value;`)
            ].join("\n")
          )
        )
        const observation = yield* adaptCodexDirectEvent(updateEvent(root, "type.ts", [changed]))
        if (observation === undefined) throw new Error("Native patch fixture unavailable")
        const prepared = yield* prepareObservation(observation, {
          controlledWriter: true,
          advicee: observation.advicee,
          settings,
          rules
        })
        const ready = prepared.outcomes.filter((outcome) => outcome.status === "ready")
        expect(ready.map((outcome) => outcome.prepared.input.declaration.name)).toEqual(["run"])
        expect(ready[0]?.prepared.input.rootLocation).toMatchObject({ start: { line: 2, column: 1 } })
        expect(JSON.stringify(ready[0]?.prepared.input.unit)).toContain("export const helper")
        if (ready[0] === undefined) throw new Error("Callable did not prepare")
        const result = yield* evaluatePrepared(ready[0].prepared).pipe(
          Effect.provide(
            controlledDecisionModelLayer({
              answers: { body_reaches_undeclared: { _tag: "Probability", probability: 0 } }
            })
          )
        )
        expect(result).toMatchObject({ status: "evaluated", findings: [] })
      } finally {
        yield* Effect.promise(() => rm(root, { recursive: true, force: true }))
      }
    })
  )

  it.effect("isolates changed overload and mutable callable exclusions from a supported Effect wrapper", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      try {
        yield* Effect.promise(() =>
          put(
            root,
            "type.ts",
            [
              'import { Effect } from "effect";',
              "function legacy(value: string): string;",
              "function legacy(value: number): number;",
              "function legacy(value: unknown) { return value }",
              'export const run = Effect.fn("run")(function* (value: number) { return value + 1 });',
              "let mutable = (value: number) => value;"
            ].join("\n")
          )
        )
        const observation = yield* adaptCodexDirectEvent(addEvent(root))
        if (observation === undefined) throw new Error("Native add fixture unavailable")
        const prepared = yield* prepareObservation(observation, {
          controlledWriter: true,
          advicee: observation.advicee,
          settings,
          rules,
          inputContract: FUNCTION_INPUT_CONTRACT
        })
        expect(
          prepared.outcomes
            .filter((outcome) => outcome.status === "ready")
            .map((outcome) => outcome.prepared.input.declaration.name)
        ).toEqual(["run"])
        const observed = prepared.observation.outcomes.find((outcome) => outcome.status === "observed")
        expect(observed?.status === "observed" && observed.analysis).toMatchObject({
          status: "incomplete",
          failures: [
            { root: "legacy", reason: "function-overload" },
            { root: "mutable", reason: "unsupported-callable" }
          ]
        })
      } finally {
        yield* Effect.promise(() => rm(root, { recursive: true, force: true }))
      }
    })
  )
})
