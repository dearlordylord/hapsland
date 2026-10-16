import { afterEach, describe, expect, it } from "vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Cause from "effect/Cause"
import { rm } from "node:fs/promises"
import { makeGitFixture, put, advicee } from "@hapsland/build-tooling/test-support/test-fixtures"
import { configuredRules } from "@hapsland/build-tooling/test-support/default-rules"
import { captureStable } from "@hapsland/native-observation/direct-event/capture"
import { discoverPhysicalWorkingTreeRoot } from "@hapsland/native-observation/repository/root"
import type { DirectObservation } from "@hapsland/native-observation/direct-event/observation"
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "@hapsland/review-definition/runtime/review-config"
import { TYPE_INPUT_CONTRACT, FUNCTION_INPUT_CONTRACT } from "@hapsland/review-definition/rules/targets"
import { prepareSource, type SourcePreparationContext } from "@hapsland/review-execution/direct-event/preparation"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
const fixture = async (files: Readonly<Record<string, string>>, paths = Object.keys(files)) => {
  const root = await makeGitFixture()
  roots.push(root)
  for (const [path, source] of Object.entries(files)) await put(root, path, source)
  const repository = await Effect.runPromise(discoverPhysicalWorkingTreeRoot(root))
  const observation: DirectObservation = {
    ...repository,
    advicee: advicee(),
    candidates: paths.map((path) => ({ operation: "add", path }))
  }
  return { repository, observation }
}
const context: SourcePreparationContext = {
  settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
  rules: configuredRules,
  inputContract: TYPE_INPUT_CONTRACT
}

describe("Canonical-owned public preparation regressions", () => {
  for (const [language, path, source, support] of [
    ["typescript", "root.ts", "export interface Root { value: string }\n", {}],
    ["python", "root.py", "class Root:\n value: str\n", {}],
    [
      "go",
      "root.go",
      "package fixture\ntype Root struct { Value string }\n",
      { "go.mod": "module example.test/fixture\ngo 1.27\n" }
    ],
    ["rust", "root.rs", "pub struct Root { pub value: String }\n", {}],
    ["bend", "root.bend", "type Root is Data:\n  Root{}\n", {}]
  ] as const) {
    it(`prepares ${language} roots and frozen inputs through packaged Canonical execution`, async () => {
      const { observation } = await fixture({ ...support, [path]: source }, [path])
      const actual = await Effect.runPromise(prepareSource(observation, context))
      expect(actual.observation.status).toBe("complete")
      expect(actual.outcomes).toHaveLength(1)
      expect(actual.outcomes[0]).toMatchObject({
        status: "ready",
        path,
        prepared: { input: { contract: TYPE_INPUT_CONTRACT, path, declaration: { name: "Root" } } }
      })
      expect(actual.ambiguousLine).toBe(false)
      for (const outcome of actual.outcomes)
        if (outcome.status === "ready") {
          expect(Object.isFrozen(outcome.prepared.input)).toBe(true)
          expect(Object.isFrozen(outcome.prepared.input.rules)).toBe(true)
          expect("advicee" in outcome.prepared).toBe(false)
        }
    })
  }
  it("preserves all candidates and shared-contract materialization chronology", async () => {
    const { observation } = await fixture({
      "first.ts": "export interface First { value: string }\n",
      "second.ts": "export function second(value: string): string { return value }\n"
    })
    const calls: string[] = []
    const { inputContract: _inputContract, ...bothContracts } = context
    const ctx: SourcePreparationContext = {
      ...bothContracts,
      beforeAnalyze: (path) =>
        Effect.sync(() => {
          calls.push(path)
          return { status: "admitted" as const }
        })
    }
    const actual = await Effect.runPromise(prepareSource(observation, ctx))
    expect(
      actual.outcomes.flatMap((outcome) =>
        outcome.status === "ready" ? [outcome.prepared.input.declaration.name] : []
      )
    ).toEqual(["First", "second"])
    expect(calls).toEqual(["first.ts", "second.ts"])
  })
  it("preserves frozen name selection including an empty selection", async () => {
    const { observation } = await fixture({
      "root.ts": "interface First { x: string }\ninterface Second { y: number }\n"
    })
    for (const names of [new Set(["Second"]), new Set<string>()]) {
      const frozenNames = new Map([["root.ts", names]])
      const actual = await Effect.runPromise(prepareSource(observation, context, { frozenNames }))
      expect(
        actual.outcomes.flatMap((outcome) =>
          outcome.status === "ready" ? [outcome.prepared.input.declaration.name] : []
        )
      ).toEqual([...names])
    }
  })
  it("preserves line selection and cross-root ambiguity without an agent identity", async () => {
    for (const [source, line, ambiguous] of [
      ["interface First { x: string }\ninterface Second { y: number }\n", 2, false],
      ["interface First { x: string }; interface Second { y: number }\n", 1, true]
    ] as const) {
      const { observation } = await fixture({ "root.ts": source })
      const { advicee: _advicee, ...sourceObservation } = observation
      const actual = await Effect.runPromise(prepareSource(sourceObservation, context, { line }))
      expect(actual.ambiguousLine).toBe(ambiguous)
      expect(
        actual.outcomes.flatMap((outcome) =>
          outcome.status === "ready" ? [outcome.prepared.input.declaration.name] : []
        )
      ).toEqual(ambiguous ? [] : ["Second"])
    }
  })
  it("round-trips every original admission diagnostic without narrowing its cause", async () => {
    const { observation } = await fixture({ "root.ts": "interface Root { value: string }\n" })
    for (const diagnostic of [
      {
        stage: "preparation",
        code: "preparation-resource-refused",
        args: { phase: "materialization", requestedBytes: 999 }
      },
      { stage: "preparation", code: "preparation-unavailable", args: { reason: "stale-round" } },
      { stage: "preparation", code: "panic", args: { boundary: "review-preparation" } }
    ] as const) {
      const ctx: SourcePreparationContext = {
        ...context,
        beforeAnalyze: () => Effect.succeed({ status: "refused", diagnostic })
      }
      const actual = await Effect.runPromise(prepareSource(observation, ctx))
      expect(actual.observation.outcomes).toEqual([{ status: "incomplete", path: "root.ts", diagnostic }])
      expect(actual.outcomes.some((outcome) => outcome.status === "ready")).toBe(false)
    }
  })
  it("preserves the complete original hook Cause and does not duplicate it at cleanup", async () => {
    const { observation } = await fixture({ "root.ts": "interface Root { value: string }\n" })
    const first = new Error("first materialization defect"),
      second = new Error("second materialization defect")
    const cause = Cause.combine(Cause.die(first), Cause.die(second))
    const ctx: SourcePreparationContext = { ...context, beforeAnalyze: () => Effect.failCause(cause) }
    const exit = await Effect.runPromiseExit(prepareSource(observation, ctx))
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit))
      expect(exit.cause.reasons.map((reason) => (reason._tag === "Die" ? reason.defect : reason))).toEqual([
        first,
        second
      ])
  })
  it("preserves the complete Cause from a nested Graph capture", async () => {
    const { observation } = await fixture(
      {
        "root.ts": "import type { Support } from './support'; export interface Root { value: Support }\n",
        "support.ts": "export interface Support { value: string }\n"
      },
      ["root.ts"]
    )
    const first = new Error("nested capture first defect"),
      second = new Error("nested capture second defect")
    const cause = Cause.combine(Cause.die(first), Cause.die(second))
    let captures = 0
    const ctx: SourcePreparationContext = {
      ...context,
      captureSource: () => {
        captures += 1
        return Effect.failCause(cause)
      }
    }
    const exit = await Effect.runPromiseExit(prepareSource(observation, ctx))
    expect(captures).toBe(1)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit))
      expect(exit.cause.reasons.map((reason) => (reason._tag === "Die" ? reason.defect : reason))).toEqual([
        first,
        second
      ])
  })
  it("cancels and awaits an active nested Graph capture", async () => {
    const { observation } = await fixture(
      {
        "root.ts": "import type { Support } from './support'; export interface Root { value: Support }\n",
        "support.ts": "export interface Support { value: string }\n"
      },
      ["root.ts"]
    )
    let entered!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    let settled = 0
    const ctx: SourcePreparationContext = {
      ...context,
      captureSource: (...args) =>
        Effect.gen(function* () {
          entered()
          return yield* captureStable(...args).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(
              Effect.sync(() => {
                settled += 1
              })
            )
          )
        })
    }
    const controller = new AbortController()
    const completion = Effect.runPromiseExit(prepareSource(observation, ctx), { signal: controller.signal })
    await started
    controller.abort()
    const exit = await completion
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect(Cause.hasInterrupts(exit.cause)).toBe(true)
    expect(settled).toBe(1)
  })
  it("keeps the function contract distinct from the type contract", async () => {
    const { observation } = await fixture({
      "root.ts": "export function root(value: number): number { return value + 1 }\n"
    })
    const ctx = { ...context, inputContract: FUNCTION_INPUT_CONTRACT }
    const actual = await Effect.runPromise(prepareSource(observation, ctx))
    expect(actual.outcomes).toHaveLength(1)
    expect(actual.outcomes[0]).toMatchObject({
      status: "ready",
      prepared: { input: { contract: FUNCTION_INPUT_CONTRACT, declaration: { name: "root", kind: "function" } } }
    })
  })
})
