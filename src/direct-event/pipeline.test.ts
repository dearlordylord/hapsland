import { describe, expect, it } from "@effect/vitest"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as TestClock from "effect/testing/TestClock"
import type * as DecisionModel from "effect/ai/DecisionModel"
import { execFileAsync } from "../../scripts/test-harness/process.mjs"
import { writeFile, rm, symlink, rename, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { configuredRules } from "../test-support/default-rules.ts"
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "../runtime/review-config.ts"
import {
  controlledDecisionModelLayer,
  type ControlledDecisionModelOptions
} from "../test-support/controlled-decision-model.ts"
import {
  DIRECT_EVENT_DEADLINE_MS,
  encodedPreparedProviderInputBytes,
  evaluatePrepared,
  prepareObservation,
  revalidateEvaluations,
  reviewCodexDirectEvent,
  reviewObservation,
  type DirectReviewContext,
  type EvaluationEvidence
} from "./pipeline.ts"
import { claimDemoBudget, readDemoBudgetUsage, writeDemoBudget } from "../onboarding/demo-budget.ts"
import { attemptCodexHostOutput } from "./writer.ts"
import { Writable } from "node:stream"
import { addEvent, makeGitFixture, put, advicee, updateEvent } from "./test-fixtures.ts"
import { adaptCodexAdd } from "./adapter.ts"
import { TYPE_INPUT_CONTRACT } from "../rules/targets.ts"

const findingAnswers = (): Readonly<Record<string, DecisionModel.ProviderAnswer>> =>
  Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability" as const, probability: 0.91 }]))

const settings = { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }
const currentResidentPublication = { isCurrentWork: () => Effect.succeed(true) } as const

const enabledReview = (
  root: string,
  event: unknown,
  modelOptions: ControlledDecisionModelOptions = { answers: findingAnswers() },
  extend: (base: DirectReviewContext) => DirectReviewContext = (base) => base
) =>
  Effect.gen(function* () {
    return yield* reviewCodexDirectEvent(
      event,
      extend({ controlledWriter: true, advicee: advicee(), settings, rules: configuredRules })
    )
  }).pipe(Effect.provide(controlledDecisionModelLayer(modelOptions)))

describe("direct-event vertical slice", () => {
  it.effect("charges recursively expanded evidence and rejects over-budget input before dispatch", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      const leaves = Array.from(
        { length: 8 },
        (_, index) =>
          `interface Leaf${index} { ${Array.from(
            { length: 24 },
            (_unused, field) => `field${field}: "${"x".repeat(20)}"`
          ).join("; ")} }`
      )
      const source = [
        ...leaves,
        `interface Root { ${leaves.map((_unused, index) => `leaf${index}: Leaf${index}`).join("; ")} }`
      ].join("\n")
      yield* Effect.promise(() => put(root, "type.ts", source))
      const observation = yield* adaptCodexAdd(addEvent(root))
      expect(observation).toBeDefined()
      if (observation === undefined) return
      const prepared = yield* prepareObservation(observation, {
        controlledWriter: true,
        advicee: observation.advicee,
        settings,
        rules: configuredRules
      })
      const rootUnit = prepared.outcomes.find(
        (outcome) => outcome.status === "ready" && outcome.prepared.input.declaration.name === "Root"
      )
      expect(rootUnit?.status).toBe("ready")
      if (rootUnit?.status !== "ready") return
      const bytes = encodedPreparedProviderInputBytes(rootUnit.prepared)
      expect(bytes).toBeGreaterThan(4_096)
      expect(Buffer.byteLength(rootUnit.prepared.input.declaration.source, "utf8")).toBeLessThan(4_096)
      const budgetPath = join(root, "demo-budget.json")
      writeDemoBudget(budgetPath, {
        root,
        expiresAt: Date.now() + 60_000,
        sourceByteBudget: 4_096,
        providerCallBudget: 2
      })
      let providerCalls = 0
      const result = yield* evaluatePrepared(
        rootUnit.prepared,
        Effect.try(() => claimDemoBudget(budgetPath, root, bytes))
      ).pipe(
        Effect.provide(
          controlledDecisionModelLayer({
            answers: findingAnswers(),
            onRequest: Effect.sync(() => {
              providerCalls += 1
            })
          })
        )
      )
      expect(result.status).toBe("backend")
      expect(providerCalls).toBe(0)
      expect(readDemoBudgetUsage(budgetPath)).toEqual({ sourceBytes: 0, providerCalls: 0 })
    })
  )
  it.effect("runs one Add declaration from native adapter to attempted output", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "type.ts", "// file context\ntype OrderCount = number\n"))
      let state: unknown
      const result = yield* enabledReview(root, addEvent(root), {
        answers: findingAnswers(),
        inspectRequest: (request) =>
          Effect.sync(() => {
            state = request.state
          })
      })
      expect(result.status).toBe("ready")
      if (result.status !== "ready") return
      expect(result.findings.length).toBeGreaterThan(0)
      expect(result.output).toMatchObject({ hookSpecificOutput: { hookEventName: "PostToolUse" } })
      expect(state).toMatchObject({
        artifact: { domain: "type.ts", kind: "type-alias", name: "OrderCount", source: "type OrderCount = number" },
        evidence: { rootId: "type.ts:type-alias:OrderCount", nodes: [], edges: [] },
        inputContract: { id: "direct-event/type-shape/v1", completeness: "complete" }
      })
    })
  )

  it.effect("requires controlled-writer authority and exact advicee association", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number"))
      let calls = 0
      const model = {
        answers: findingAnswers(),
        onRequest: Effect.sync(() => {
          calls += 1
        })
      }
      const uncontrolled = yield* enabledReview(root, addEvent(root), model, (base) => ({
        ...base,
        controlledWriter: false
      }))
      const wrongAdvicee = yield* enabledReview(root, addEvent(root), model, (base) => ({
        ...base,
        advicee: advicee({ sessionId: "someone-else" })
      }))
      expect(uncontrolled.status).toBe("unattributed")
      expect(wrongAdvicee.status).toBe("unattributed")
      expect(calls).toBe(0)
    })
  )

  it.effect("keeps malformed and mixed native Add syntax out of capture and backend", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number"))
      let reads = 0
      let calls = 0
      const commands = [
        "*** Begin Patch\n*** Add File: type.ts\ntype Raw = number\n*** End Patch",
        "*** Begin Patch\n*** Add File: type.ts\n+x\n*** Unknown Control\n*** End Patch",
        "*** Begin Patch\n*** Add File:\n+x\n*** End Patch"
      ]
      for (const command of commands) {
        const result = yield* enabledReview(
          root,
          addEvent(root, ["type.ts"], { tool_input: { command } }),
          {
            answers: findingAnswers(),
            onRequest: Effect.sync(() => {
              calls += 1
            })
          },
          (base) => ({
            ...base,
            captureHooks: {
              sourceRead: () => {
                reads += 1
              }
            }
          })
        )
        expect(result.status).toBe("unsupported")
      }
      expect(reads).toBe(0)
      expect(calls).toBe(0)
    })
  )

  it.effect("does zero source reads and backend calls for excluded paths", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, ".env.local", "type Secret = string"))
      let reads = 0
      let calls = 0
      const result = yield* enabledReview(
        root,
        addEvent(root, [".env.local"]),
        {
          answers: findingAnswers(),
          onRequest: Effect.sync(() => {
            calls += 1
          })
        },
        (base) => ({
          ...base,
          captureHooks: {
            sourceRead: () => {
              reads += 1
            }
          }
        })
      )
      expect(result.status).toBe("no-advice")
      expect(reads).toBe(0)
      expect(calls).toBe(0)
    })
  )

  it.effect("enforces every selection gate before source reads and backend work", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      const outsideRoot = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, ".gitignore", "ignored.ts\n"))
      yield* Effect.promise(() => put(root, "ignored.ts", "type OrderCount = number"))
      yield* Effect.promise(() => put(root, "real.ts", "type OrderCount = number"))
      yield* Effect.promise(() => symlink(join(root, "real.ts"), join(root, "link.ts")))
      yield* Effect.promise(() => put(root, "policy.ts", "type OrderCount = number"))
      const outside = yield* Effect.promise(() => put(outsideRoot, "outside.ts", "type OrderCount = number"))
      let reads = 0
      let calls = 0
      const gated: ReadonlyArray<{ readonly path: string; readonly policy?: DirectReviewContext["policy"] }> = [
        { path: "ignored.ts" },
        { path: "link.ts" },
        { path: ".git/config" },
        { path: outside },
        { path: "policy.ts", policy: { includes: ["**/*"], excludes: ["policy.ts"] } }
      ]
      for (const gate of gated) {
        const result = yield* enabledReview(
          root,
          addEvent(root, [gate.path]),
          {
            answers: findingAnswers(),
            onRequest: Effect.sync(() => {
              calls += 1
            })
          },
          (base) => ({
            ...base,
            ...(gate.policy === undefined ? {} : { policy: gate.policy }),
            captureHooks: {
              sourceRead: () => {
                reads += 1
              }
            }
          })
        )
        expect(result.status).toBe("no-advice")
      }
      expect(reads).toBe(0)
      expect(calls).toBe(0)

      yield* Effect.promise(() => execFileAsync("git", ["-C", root, "add", "-f", "ignored.ts"]))
      const tracked = yield* enabledReview(
        root,
        addEvent(root, ["ignored.ts"]),
        {
          answers: findingAnswers(),
          onRequest: Effect.sync(() => {
            calls += 1
          })
        },
        (base) => ({
          ...base,
          captureHooks: {
            sourceRead: () => {
              reads += 1
            }
          }
        })
      )
      expect(tracked.status).toBe("ready")
      expect(reads).toBeGreaterThan(0)
      expect(calls).toBe(1)
    })
  )

  it.effect("keeps independent candidate outcomes when another path is unsupported", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "good.ts", "type OrderCount = number"))
      yield* Effect.promise(() => put(root, "bad.ts", "interface A { missing: Missing }"))
      const result = yield* enabledReview(root, addEvent(root, ["bad.ts", "good.ts"]))
      expect(result.status).toBe("ready")
      if (result.status === "ready") {
        expect(new Set(result.findings.map(({ path }) => path))).toEqual(new Set(["good.ts"]))
      }
    })
  )

  it.effect("sends one request per Add unit with recursive supporting evidence", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() =>
        put(root, "types.ts", "interface Account { owner: Owner }\ninterface Owner { name: string }")
      )
      const states: Array<unknown> = []
      let calls = 0
      const result = yield* enabledReview(root, addEvent(root, ["types.ts"]), {
        answers: findingAnswers(),
        onRequest: Effect.sync(() => {
          calls += 1
        }),
        inspectRequest: (request) =>
          Effect.sync(() => {
            states.push(request.state)
          })
      })
      expect(result.status).toBe("ready")
      expect(calls).toBe(2)
      expect(states).toHaveLength(2)
      if (result.status === "ready") {
        expect(result.output.hookSpecificOutput.additionalContext).toContain("types.ts :: Account")
        expect(result.output.hookSpecificOutput.additionalContext).toContain("types.ts :: Owner")
      }
      expect(states[0]).toMatchObject({
        artifact: { domain: "types.ts", source: "interface Account { owner: Owner }" },
        evidence: {
          rootId: "types.ts:interface:Account",
          nodes: [{ name: "Owner" }],
          edges: [{ kind: "expanded", symbol: "Owner" }]
        }
      })
    })
  )

  it.effect("selects only an Update root uniquely corroborated by a nonempty added line", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() =>
        put(
          root,
          "types.ts",
          ["interface Account {", "  count: number", "}", "interface Sibling {", "  label: string", "}"].join("\n")
        )
      )
      let calls = 0
      const result = yield* enabledReview(root, updateEvent(root, "types.ts", ["  count: number"]), {
        answers: findingAnswers(),
        onRequest: Effect.sync(() => {
          calls += 1
        })
      })
      expect(result.status).toBe("ready")
      if (result.status === "ready") {
        expect(new Set(result.findings.map(({ declaration }) => declaration))).toEqual(new Set(["Account"]))
      }
      expect(calls).toBe(1)

      yield* Effect.promise(() =>
        put(
          root,
          "types.ts",
          ["interface Account {", "  value: string", "}", "interface Sibling {", "  value: string", "}"].join("\n")
        )
      )
      const ambiguous = yield* enabledReview(root, updateEvent(root, "types.ts", ["  value: string"]), {
        answers: findingAnswers(),
        onRequest: Effect.sync(() => {
          calls += 1
        })
      })
      expect(ambiguous.status).toBe("no-advice")
      expect(calls).toBe(1)
    })
  )

  it.effect("does not capture metadata-only, Delete, or move candidates even if paths exist", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      for (const path of ["types.ts", "deleted.ts", "old.ts", "new.ts"]) {
        yield* Effect.promise(() => put(root, path, "type OrderCount = number"))
      }
      const commands = [
        "*** Begin Patch\n*** Update File: types.ts\n@@\n*** End Patch",
        "*** Begin Patch\n*** Delete File: deleted.ts\n*** End Patch",
        "*** Begin Patch\n*** Update File: old.ts\n*** Move to: new.ts\n*** End Patch"
      ]
      let reads = 0
      let calls = 0
      for (const command of commands) {
        const result = yield* enabledReview(
          root,
          addEvent(root, ["types.ts"], { tool_input: { command } }),
          {
            answers: findingAnswers(),
            onRequest: Effect.sync(() => {
              calls += 1
            })
          },
          (base) => ({
            ...base,
            captureHooks: {
              sourceRead: () => {
                reads += 1
              }
            }
          })
        )
        expect(result.status).toBe("unsupported")
      }
      expect(reads).toBe(0)
      expect(calls).toBe(0)
    })
  )

  it.effect("keeps valid work in an incomplete mixed-file observation without a ChangeSet", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "good.ts", "type OrderCount = number"))
      const native = addEvent(root, ["missing.ts", "good.ts"])
      const observation = yield* adaptCodexAdd(native)
      expect(observation).toBeDefined()
      if (observation === undefined) return
      const prepared = yield* prepareObservation(observation, {
        controlledWriter: true,
        advicee: advicee(),
        settings,
        rules: configuredRules
      })
      expect(prepared.observation.status).toBe("incomplete")
      expect(prepared.outcomes.filter(({ status }) => status === "ready")).toHaveLength(1)
      if (prepared.observation.status === "incomplete") {
        expect(prepared.observation.units.map(({ root: unitRoot }) => unitRoot.artifact.name)).toEqual(["OrderCount"])
        expect("changeSet" in prepared.observation).toBe(false)
      }
    })
  )

  it.effect("keeps analyzer failures incomplete with their reasons and no ChangeSet", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      const cases = [
        ["interface Good { value: string }\ninterface Broken { missing: Missing }", "missing-evidence"],
        ["import type { Missing } from './missing'; interface Broken { value: Missing }", "missing-evidence"],
        ["type Broken = import('./missing').Value", "import"],
        ["export import Broken = Missing.Value", "import"],
        ["type Broken = typeof import('./missing')", "import"],
        ["interface Merged {}\ninterface Merged { value: string }", "declaration-merge"],
        ["const Shape = Schema.Struct({ value: Schema.String })", "no-declarations"],
        ["interface Broken {", "parse"],
        [
          [
            `interface Root { ${Array.from({ length: 17 }, (_, index) => `p${index}: T${index}`).join("; ")} }`,
            ...Array.from({ length: 17 }, (_, index) => `interface T${index} { value: string }`)
          ].join("\n"),
          "reference-limit"
        ]
      ] as const
      for (const [source, reason] of cases) {
        yield* Effect.promise(() => put(root, "types.ts", source))
        const observation = yield* adaptCodexAdd(addEvent(root, ["types.ts"]))
        expect(observation).toBeDefined()
        if (observation === undefined) continue
        const prepared = yield* prepareObservation(observation, {
          controlledWriter: true,
          advicee: advicee(),
          settings,
          rules: configuredRules
        })
        expect(prepared.observation.status).toBe("incomplete")
        expect("changeSet" in prepared.observation).toBe(false)
        const observed = prepared.observation.outcomes.find((outcome) => outcome.status === "observed")
        expect(observed?.status).toBe("observed")
        if (observed?.status === "observed") {
          expect(observed.analysis.status).toBe("incomplete")
          if (observed.analysis.status === "incomplete") {
            expect(observed.analysis.failures.some((failure) => failure.reason === reason)).toBe(true)
          }
        }
        if (source.startsWith("interface Good") && prepared.observation.status === "incomplete") {
          expect(prepared.observation.units.map(({ root: unitRoot }) => unitRoot.artifact.name)).toEqual([
            "Good",
            "Broken"
          ])
          expect(
            prepared.outcomes.some(
              (outcome) => outcome.status === "ready" && outcome.prepared.input.declaration.name === "Broken"
            )
          ).toBe(false)
        }
      }
    })
  )

  it.effect("makes no backend request for embedded import evidence", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      let calls = 0
      for (const source of [
        "type Broken = import('./missing').Value",
        "export import Broken = Missing.Value",
        "type Broken = typeof import('./missing')",
        "interface Broken { value: import('./missing').Value }"
      ]) {
        yield* Effect.promise(() => put(root, "types.ts", source))
        const result = yield* enabledReview(root, addEvent(root, ["types.ts"]), {
          answers: findingAnswers(),
          onRequest: Effect.sync(() => {
            calls += 1
          })
        })
        expect(result.status).toBe("no-advice")
      }
      expect(calls).toBe(0)
    })
  )

  it.effect("rejects a structured in-root Git directory before source reads", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(async () => {
        await rename(join(root, ".git"), join(root, "git-admin"))
        await writeFile(join(root, ".git"), "gitdir: git-admin\n")
        await put(root, "git-admin/recreated.ts", "type SecretCount = number")
      })
      let reads = 0
      let calls = 0
      const result = yield* enabledReview(
        root,
        addEvent(root, ["git-admin/recreated.ts"]),
        {
          answers: findingAnswers(),
          onRequest: Effect.sync(() => {
            calls += 1
          })
        },
        (base) => ({
          ...base,
          captureHooks: {
            sourceRead: () => {
              reads += 1
            }
          }
        })
      )
      expect(result.status).toBe("no-advice")
      expect(reads).toBe(0)
      expect(calls).toBe(0)
    })
  )

  it.effect("treats an unsupported sibling as Update ambiguity before readiness filtering", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() =>
        put(
          root,
          "types.ts",
          [
            "interface Account {",
            "  value: string",
            "}",
            "interface Broken {",
            "  value: string",
            "  missing: Missing",
            "}"
          ].join("\n")
        )
      )
      let calls = 0
      const result = yield* enabledReview(root, updateEvent(root, "types.ts", ["  value: string"]), {
        answers: findingAnswers(),
        onRequest: Effect.sync(() => {
          calls += 1
        })
      })
      expect(result.status).toBe("no-advice")
      expect(calls).toBe(0)
    })
  )

  it.effect("keeps the initially established Update subject despite later sibling ambiguity", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      const path = join(root, "types.ts")
      yield* Effect.promise(() =>
        put(
          root,
          "types.ts",
          [
            "interface Account {",
            "  value: string",
            "}",
            "interface Broken {",
            "  other: string",
            "  missing: Missing",
            "}"
          ].join("\n")
        )
      )
      let calls = 0
      const result = yield* enabledReview(
        root,
        updateEvent(root, "types.ts", ["  value: string"]),
        {
          answers: findingAnswers(),
          onRequest: Effect.sync(() => {
            calls += 1
          })
        },
        (base) => ({
          ...base,
          beforeHandoff: Effect.promise(() =>
            writeFile(
              path,
              [
                "interface Account {",
                "  value: string",
                "}",
                "interface Broken {",
                "  value: string",
                "  missing: Missing",
                "}"
              ].join("\n")
            )
          )
        })
      )
      expect(result.status).toBe("ready")
      if (result.status === "ready") {
        expect(new Set(result.findings.map(({ declaration }) => declaration))).toEqual(new Set(["Account"]))
      }
      expect(calls).toBe(1)
    })
  )

  it.effect("keeps current sibling advice when another evaluated identity changes", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      const path = join(root, "types.ts")
      yield* Effect.promise(() => put(root, "types.ts", "type ACount = number\ntype BCount = number"))
      let calls = 0
      const result = yield* enabledReview(
        root,
        addEvent(root, ["types.ts"]),
        {
          answers: findingAnswers(),
          onRequest: Effect.sync(() => {
            calls += 1
          })
        },
        (base) => ({
          ...base,
          beforeHandoff: Effect.promise(() => writeFile(path, "type ACount = number\ntype BCount = string"))
        })
      )
      expect(calls).toBe(2)
      expect(result.status).toBe("ready")
      if (result.status === "ready") {
        expect(new Set(result.findings.map(({ declaration }) => declaration))).toEqual(new Set(["ACount"]))
        expect(result.output.hookSpecificOutput.additionalContext).not.toContain("BCount")
      }
    })
  )

  it.effect("reviews an independent Add without reading either move path", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "old.ts", "type Old = number"))
      yield* Effect.promise(() => put(root, "new.ts", "type New = number"))
      yield* Effect.promise(() => put(root, "good.ts", "type GoodCount = number"))
      const command = [
        "*** Begin Patch",
        "*** Update File: old.ts",
        "*** Move to: new.ts",
        "@@",
        "-type Old = string",
        "+type Old = number",
        "*** Add File: good.ts",
        "+type GoodCount = number",
        "*** End Patch"
      ].join("\n")
      const reads: Array<string> = []
      let calls = 0
      const result = yield* enabledReview(
        root,
        addEvent(root, ["ignored.ts"], { tool_input: { command } }),
        {
          answers: findingAnswers(),
          onRequest: Effect.sync(() => {
            calls += 1
          })
        },
        (base) => ({
          ...base,
          captureHooks: {
            sourceRead: (path) => {
              reads.push(path)
            }
          }
        })
      )
      expect(result.status).toBe("ready")
      expect(calls).toBe(1)
      expect(new Set(reads)).toEqual(new Set(["good.ts"]))
    })
  )

  it.effect("keeps unsupported analyzer input quiet with no backend call", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "type.ts", "interface A { missing: Missing }"))
      let calls = 0
      const result = yield* enabledReview(root, addEvent(root), {
        answers: findingAnswers(),
        onRequest: Effect.sync(() => {
          calls += 1
        })
      })
      expect(result.status).toBe("no-advice")
      expect(calls).toBe(0)
    })
  )

  it.effect("does not opt schema-v1 rules into a different review input contract", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number"))
      let calls = 0
      const result = yield* enabledReview(
        root,
        addEvent(root),
        {
          answers: findingAnswers(),
          onRequest: Effect.sync(() => {
            calls += 1
          })
        },
        (base) => ({ ...base, inputContract: "direct-event/function/v1" })
      )
      expect(result.status).toBe("no-advice")
      expect(calls).toBe(0)
    })
  )

  it.effect("preserves all standalone direct findings after canonical rule decisions", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number"))
      const result = yield* enabledReview(root, addEvent(root), {
        answers: Object.fromEntries(
          configuredRules.map((rule) => [rule.id, { _tag: "Probability" as const, probability: 0.9 }])
        )
      })
      expect(result.status).toBe("ready")
      if (result.status === "ready") expect(result.findings).toHaveLength(configuredRules.length)
    })
  )

  it.effect("observes no-applicable-rule preparation without letting the observer change review behavior", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number;\n"))
      const observation = yield* adaptCodexAdd(addEvent(root))
      if (observation === undefined) throw new Error("missing observation")
      for (const throws of [false, true]) {
        const omissions: Array<unknown> = []
        const prepared = yield* prepareObservation(observation, {
          controlledWriter: true,
          advicee: observation.advicee,
          settings,
          rules: [],
          inputContract: TYPE_INPUT_CONTRACT,
          observePreparationOmission: (path, declaration, reason) => {
            omissions.push({ path, declaration, reason })
            if (throws) throw new Error("optional observer failure")
          }
        })
        expect(omissions).toEqual([{ path: "type.ts", declaration: "OrderCount", reason: "no-applicable-rule" }])
        expect(prepared.observation.status).toBe("complete")
        expect(prepared.outcomes).toEqual([])
      }
    })
  )

  it.effect("keeps file selection distinct from analyzer applicability", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "README.md", "type OrderCount = number"))
      let calls = 0
      const reads: Array<string> = []
      const result = yield* enabledReview(
        root,
        addEvent(root, ["README.md"]),
        {
          answers: findingAnswers(),
          onRequest: Effect.sync(() => {
            calls += 1
          })
        },
        (base) => ({
          ...base,
          captureHooks: {
            sourceRead: (path) => {
              reads.push(path)
            }
          }
        })
      )
      expect(reads).toEqual(["README.md", "README.md"])
      expect(result.status).toBe("no-advice")
      expect(calls).toBe(0)
    })
  )

  it.effect("rejects qualified and value-query references without a backend call", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      let calls = 0
      for (const source of [
        "interface Root { child: NS.B }",
        "interface Root extends NS.B { count: number }",
        "type Root = typeof external",
        "interface Root { [external]: string }",
        "interface Root { [NS.key]: string }",
        "interface Root { value: T; fn: <T>() => T }"
      ]) {
        yield* Effect.promise(() => put(root, "type.ts", source))
        const result = yield* enabledReview(root, addEvent(root), {
          answers: findingAnswers(),
          onRequest: Effect.sync(() => {
            calls += 1
          })
        })
        expect(result.status).toBe("no-advice")
      }
      expect(calls).toBe(0)
    })
  )

  it.effect("rejects a remapped canonical root before source or backend use", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number"))
      const observation = yield* adaptCodexAdd(addEvent(root))
      expect(observation).toBeDefined()
      if (observation === undefined) return
      let reads = 0
      let calls = 0
      const result = yield* Effect.gen(function* () {
        return yield* reviewObservation(observation, {
          controlledWriter: true,
          advicee: observation.advicee,
          settings,
          rules: configuredRules,
          captureHooks: {
            sourceRead: () => {
              reads += 1
            }
          },
          beforePrepare: Effect.promise(async () => {
            const original = `${root}-original`
            await rename(root, original)
            await mkdir(root)
            await execFileAsync("git", ["init", "-q", root])
            await put(root, "type.ts", "type CrossRoot = string")
            await put(root, ".hapsland.jsonc", "{ invalid")
          })
        })
      }).pipe(
        Effect.provide(
          controlledDecisionModelLayer({
            answers: findingAnswers(),
            onRequest: Effect.sync(() => {
              calls += 1
            })
          })
        )
      )
      expect(result.status).toBe("no-advice")
      expect(reads).toBe(0)
      expect(calls).toBe(0)
    })
  )

  it.effect("rechecks physical root identity immediately before backend dispatch", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number"))
      let reads = 0
      let calls = 0
      const result = yield* enabledReview(
        root,
        addEvent(root),
        {
          answers: findingAnswers(),
          onRequest: Effect.sync(() => {
            calls += 1
          })
        },
        (base) => ({
          ...base,
          captureHooks: {
            sourceRead: () => {
              reads += 1
            }
          },
          beforeDispatch: Effect.promise(async () => {
            const original = `${root}-before-dispatch`
            await rename(root, original)
            await mkdir(root)
            await execFileAsync("git", ["init", "-q", root])
            await put(root, "type.ts", "type CrossRoot = string")
          })
        })
      )
      expect(result).toEqual({ status: "unavailable", reason: "stale", output: undefined })
      expect(reads).toBe(2)
      expect(calls).toBe(0)
    })
  )

  it.effect("binds Git administration identity before the first source read", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number"))
      const observation = yield* adaptCodexAdd(addEvent(root))
      expect(observation).toBeDefined()
      if (observation === undefined) return
      let reads = 0
      let calls = 0
      const result = yield* Effect.gen(function* () {
        return yield* reviewObservation(observation, {
          controlledWriter: true,
          advicee: observation.advicee,
          settings,
          rules: configuredRules,
          captureHooks: {
            sourceRead: () => {
              reads += 1
            }
          },
          beforePrepare: Effect.promise(async () => {
            await rename(join(root, ".git"), join(root, ".git-original"))
            await execFileAsync("git", ["init", "-q", root])
          })
        })
      }).pipe(
        Effect.provide(
          controlledDecisionModelLayer({
            answers: findingAnswers(),
            onRequest: Effect.sync(() => {
              calls += 1
            })
          })
        )
      )
      expect(result.status).toBe("no-advice")
      expect(reads).toBe(0)
      expect(calls).toBe(0)
    })
  )

  it.effect("emits no empty advice after a successful clear", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number"))
      const result = yield* enabledReview(root, addEvent(root), {})
      expect(result).toEqual({ status: "no-advice", output: undefined })
    })
  )

  it.effect("rejects missing/extra keys and non-finite/out-of-range probabilities", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number"))
      const variants: ReadonlyArray<Readonly<Record<string, DecisionModel.ProviderAnswer>>> = [
        {},
        Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: Number.NaN }])),
        Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 2 }]))
      ]
      for (const answers of variants) {
        const result = yield* enabledReview(root, addEvent(root), { answers })
        expect(result.status).toBe("unavailable")
      }
      const extra = yield* enabledReview(root, addEvent(root), {
        answers: findingAnswers(),
        extraDecisionKey: "unexpected"
      })
      expect(extra.status).toBe("unavailable")
    })
  )

  it.effect("uses a 15-second deadline and performs zero retries", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* Effect.promise(makeGitFixture)
        yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number"))
        const called = yield* Deferred.make<void>()
        let calls = 0
        const program = enabledReview(root, addEvent(root), {
          answers: findingAnswers(),
          delayMs: DIRECT_EVENT_DEADLINE_MS + 1,
          onRequest: Effect.sync(() => {
            calls += 1
          }).pipe(Effect.andThen(Deferred.succeed(called, undefined)))
        })
        const fiber = yield* program.pipe(Effect.forkChild)
        yield* Deferred.await(called)
        yield* TestClock.adjust(`${DIRECT_EVENT_DEADLINE_MS - 1} millis`)
        expect(calls).toBe(1)
        yield* TestClock.adjust("1 millis")
        const result = yield* Fiber.join(fiber)
        expect(result).toEqual({ status: "unavailable", reason: "timeout", output: undefined })
        expect(calls).toBe(1)
      })
    )
  )

  it.effect("distinguishes canceled inspection requests from deadline expiry", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* Effect.promise(makeGitFixture)
        yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number\n"))
        const observation = yield* adaptCodexAdd(addEvent(root))
        expect(observation).toBeDefined()
        if (observation === undefined) return
        const prepared = yield* prepareObservation(observation, {
          controlledWriter: true,
          advicee: observation.advicee,
          settings,
          rules: configuredRules
        })
        const ready = prepared.outcomes.find((outcome) => outcome.status === "ready")
        expect(ready?.status).toBe("ready")
        if (ready?.status !== "ready") return
        for (const cancellation of ["interrupt", "deadline"] as const) {
          const entered = yield* Deferred.make<void>()
          const evidence: Array<EvaluationEvidence> = []
          const fiber = yield* evaluatePrepared(ready.prepared, Effect.void, (event) => evidence.push(event)).pipe(
            Effect.provide(
              controlledDecisionModelLayer({
                answers: findingAnswers(),
                delayMs: DIRECT_EVENT_DEADLINE_MS + 1,
                onRequest: Deferred.succeed(entered, undefined)
              })
            ),
            Effect.forkChild
          )
          yield* Deferred.await(entered)
          if (cancellation === "interrupt") yield* Fiber.interrupt(fiber)
          else {
            yield* TestClock.adjust(`${DIRECT_EVENT_DEADLINE_MS} millis`)
            expect(yield* Fiber.join(fiber)).toEqual({ status: "timeout" })
          }
          expect(evidence.filter((event) => event.kind !== "model-input")).toEqual([
            { kind: "evaluation-outcome", outcome: cancellation === "interrupt" ? "interrupted" : "timeout" }
          ])
        }
      })
    )
  )

  it.effect("does not retry a backend failure", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number"))
      let calls = 0
      const result = yield* enabledReview(root, addEvent(root), {
        failure: "controlled failure",
        onRequest: Effect.sync(() => {
          calls += 1
        })
      })
      expect(result).toEqual({ status: "unavailable", reason: "backend", output: undefined })
      expect(calls).toBe(1)
    })
  )

  it.effect("allows unrelated file-context edits but suppresses relevant semantic changes", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      const path = join(root, "type.ts")
      yield* Effect.promise(() => put(root, "type.ts", "// old\ntype OrderCount = number\n"))
      const unrelated = yield* enabledReview(root, addEvent(root), undefined, (base) => ({
        ...base,
        beforeHandoff: Effect.promise(() => writeFile(path, "// new\ntype OrderCount = number\n"))
      }))
      expect(unrelated.status).toBe("ready")
      yield* Effect.promise(() => writeFile(path, "type OrderCount = number\n"))
      const sibling = yield* enabledReview(root, addEvent(root), undefined, (base) => ({
        ...base,
        beforeHandoff: Effect.promise(() =>
          writeFile(path, "type OrderCount = number\ninterface Unrelated { label: string }\n")
        )
      }))
      expect(sibling.status).toBe("ready")
      yield* Effect.promise(() => writeFile(path, "type OrderCount = number\n"))
      const relevant = yield* enabledReview(root, addEvent(root), undefined, (base) => ({
        ...base,
        beforeHandoff: Effect.promise(() => writeFile(path, "type OrderCount = string\n"))
      }))
      expect(relevant).toEqual({ status: "unavailable", reason: "stale", output: undefined })
    })
  )

  it.effect("suppresses handoff on deletion, analyzer loss, or rule identity change", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      const path = join(root, "type.ts")
      const scenarios: ReadonlyArray<() => Effect.Effect<void>> = [
        () => Effect.promise(() => rm(path)),
        () => Effect.promise(() => writeFile(path, "const unrelated = true")),
        () => Effect.promise(() => writeFile(path, "type OrderCount = number\ntype OrderCount = string"))
      ]
      for (const mutate of scenarios) {
        yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number"))
        const result = yield* enabledReview(root, addEvent(root), undefined, (base) => ({
          ...base,
          beforeHandoff: mutate()
        }))
        expect(result).toEqual({ status: "unavailable", reason: "stale", output: undefined })
      }
      yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number"))
      let rules = configuredRules
      const changedRules = yield* enabledReview(root, addEvent(root), undefined, (base) => ({
        ...base,
        rules: () => rules,
        beforeHandoff: Effect.sync(() => {
          rules = configuredRules.slice(0, -1)
        })
      }))
      expect(changedRules).toEqual({ status: "unavailable", reason: "stale", output: undefined })
      let excludes: ReadonlyArray<string> = []
      const changedSelection = yield* enabledReview(root, addEvent(root), undefined, (base) => ({
        ...base,
        policy: () => ({ includes: ["**/*"], excludes }),
        beforeHandoff: Effect.sync(() => {
          excludes = ["type.ts"]
        })
      }))
      expect(changedSelection).toEqual({ status: "unavailable", reason: "stale", output: undefined })

      const ruleMutations: ReadonlyArray<(rules: typeof configuredRules) => typeof configuredRules> = [
        (rulesValue) =>
          rulesValue.map((rule, index) =>
            index === 0
              ? {
                  ...rule,
                  decision: {
                    ...rule.decision,
                    criteria: { ...rule.decision.criteria, true: `${rule.decision.criteria.true} changed` }
                  }
                }
              : rule
          ),
        (rulesValue) =>
          rulesValue.map((rule, index) =>
            index === 0 ? { ...rule, threshold: rule.threshold === 0.8 ? 0.81 : 0.8 } : rule
          ),
        (rulesValue) =>
          rulesValue.map((rule, index) => (index === 0 ? { ...rule, message: `${rule.message} changed` } : rule))
      ]
      for (const mutateRules of ruleMutations) {
        yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number"))
        let mutableRules = configuredRules
        const result = yield* enabledReview(root, addEvent(root), undefined, (base) => ({
          ...base,
          rules: () => mutableRules,
          beforeHandoff: Effect.sync(() => {
            mutableRules = mutateRules(configuredRules)
          })
        }))
        expect(result).toEqual({ status: "unavailable", reason: "stale", output: undefined })
      }

      let contract: string = TYPE_INPUT_CONTRACT
      const changedContract = yield* enabledReview(root, addEvent(root), undefined, (base) => ({
        ...base,
        inputContract: () => contract,
        beforeHandoff: Effect.sync(() => {
          contract = "unsupported-input-contract"
        })
      }))
      expect(changedContract).toEqual({ status: "unavailable", reason: "stale", output: undefined })
    })
  )

  it.effect("revalidates delayed Add, Update, and multi-file work through deterministic backend gates", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const scenarios = [
          {
            name: "add",
            paths: ["type.ts"],
            source: "type OrderCount = number\n",
            event: (root: string) => addEvent(root),
            mutate: (root: string) => writeFile(join(root, "type.ts"), "type OrderCount = string\n")
          },
          {
            name: "update",
            paths: ["type.ts"],
            source: "interface Order { count: number }\n",
            event: (root: string) => updateEvent(root, "type.ts", ["interface Order { count: number }"]),
            mutate: (root: string) => writeFile(join(root, "type.ts"), "interface Order { count: string }\n")
          },
          {
            name: "multi-file",
            paths: ["a.ts", "b.ts"],
            source: "type OrderCount = number\n",
            event: (root: string) => addEvent(root, ["a.ts", "b.ts"]),
            mutate: (root: string) => writeFile(join(root, "a.ts"), "type OrderCount = string\n")
          }
        ] as const
        for (const scenario of scenarios) {
          const root = yield* Effect.promise(makeGitFixture)
          for (const path of scenario.paths) yield* Effect.promise(() => put(root, path, scenario.source))
          const entered = yield* Deferred.make<void>()
          const release = yield* Deferred.make<void>()
          const reviewing = yield* enabledReview(root, scenario.event(root), {
            answers: findingAnswers(),
            inspectRequest: () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)))
          }).pipe(Effect.forkChild)
          yield* Deferred.await(entered)
          yield* Effect.promise(() => scenario.mutate(root))
          yield* Deferred.succeed(release, undefined)
          const result = yield* Fiber.join(reviewing)
          if (scenario.name === "multi-file") {
            expect(result.status).toBe("ready")
            if (result.status === "ready") {
              expect(new Set(result.findings.map(({ path }) => path))).toEqual(new Set(["b.ts"]))
            }
          } else {
            expect(result).toEqual({ status: "unavailable", reason: "stale", output: undefined })
          }
        }
      })
    )
  )

  it.effect("rejects late superseded and unknown evaluations at the currentness boundary", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number\n"))
      const observation = yield* adaptCodexAdd(addEvent(root))
      expect(observation).toBeDefined()
      if (observation === undefined) return
      const context: DirectReviewContext = {
        controlledWriter: true,
        advicee: observation.advicee,
        settings,
        rules: configuredRules
      }
      const result = yield* reviewObservation(observation, context)
      expect(result.status).toBe("ready")
      if (result.status !== "ready") return

      const superseded = yield* revalidateEvaluations(observation, result.evaluations, context, {
        isCurrentWork: () => Effect.succeed(false)
      })
      expect(superseded.status).toBe("stale")

      const [first] = result.evaluations
      expect(first).toBeDefined()
      if (first === undefined) return
      const unknown = yield* revalidateEvaluations(
        observation,
        [{ ...first, prepared: { ...first.prepared, identity: "unknown-semantic-identity" } }],
        context,
        currentResidentPublication
      )
      expect(unknown.status).toBe("unavailable")

      const uncertain = yield* revalidateEvaluations(
        observation,
        result.evaluations,
        { ...context, controlledWriter: false },
        currentResidentPublication
      )
      expect(uncertain.status).toBe("unattributed")

      const wrongRoot = yield* revalidateEvaluations(
        observation,
        result.evaluations.map((evaluation) => ({
          ...evaluation,
          prepared: { ...evaluation.prepared, root: `${root}-other` }
        })),
        context,
        currentResidentPublication
      )
      expect(wrongRoot.status).toBe("unattributed")

      yield* Effect.promise(() => rm(join(root, "type.ts")))
      const unavailable = yield* revalidateEvaluations(
        observation,
        result.evaluations,
        context,
        currentResidentPublication
      )
      expect(unavailable.status).toBe("unavailable")
    }).pipe(Effect.provide(controlledDecisionModelLayer({ answers: findingAnswers() })))
  )

  it.effect("never publishes a late completion superseded while its backend call is gated", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* Effect.promise(makeGitFixture)
        yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number\n"))
        const observation = yield* adaptCodexAdd(addEvent(root))
        expect(observation).toBeDefined()
        if (observation === undefined) return
        const context: DirectReviewContext = {
          controlledWriter: true,
          advicee: observation.advicee,
          settings,
          rules: configuredRules
        }
        const prepared = yield* prepareObservation(observation, context)
        const ready = prepared.outcomes.find((outcome) => outcome.status === "ready")
        expect(ready?.status).toBe("ready")
        if (ready?.status !== "ready") return
        const entered = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        let isLatest = true
        const evaluating = yield* evaluatePrepared(ready.prepared).pipe(
          Effect.provide(
            controlledDecisionModelLayer({
              answers: findingAnswers(),
              inspectRequest: () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)))
            })
          ),
          Effect.forkChild
        )
        yield* Deferred.await(entered)
        isLatest = false
        yield* Deferred.succeed(release, undefined)
        const evaluation = yield* Fiber.join(evaluating)
        expect(evaluation.status).toBe("evaluated")
        if (evaluation.status !== "evaluated") return
        const revalidated = yield* revalidateEvaluations(
          observation,
          [{ prepared: ready.prepared, findings: evaluation.findings }],
          context,
          { isCurrentWork: () => Effect.sync(() => isLatest) }
        )
        expect(revalidated.status).toBe("stale")
      })
    )
  )

  it.effect("recaptures only paths and units retained for publication", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "a.ts", "type ACount = number\n"))
      yield* Effect.promise(() => put(root, "b.ts", "type BCount = number\n"))
      const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts", "b.ts"]))
      expect(observation).toBeDefined()
      if (observation === undefined) return
      const context: DirectReviewContext = {
        controlledWriter: true,
        advicee: observation.advicee,
        settings,
        rules: configuredRules
      }
      const result = yield* reviewObservation(observation, context)
      expect(result.status).toBe("ready")
      if (result.status !== "ready") return
      const retained = result.evaluations.filter(({ prepared }) => prepared.input.path === "a.ts")
      const reads: Array<string> = []
      const revalidated = yield* revalidateEvaluations(
        observation,
        retained,
        {
          ...context,
          captureHooks: {
            sourceRead: (path) => {
              reads.push(path)
            }
          }
        },
        currentResidentPublication
      )
      expect(revalidated.status).toBe("current")
      expect(reads).toEqual(["a.ts", "a.ts"])

      const partiallySuperseded = yield* revalidateEvaluations(observation, result.evaluations, context, {
        isCurrentWork: (prepared) => Effect.succeed(prepared.input.path === "a.ts")
      })
      expect(partiallySuperseded.status).toBe("current")
      if (partiallySuperseded.status === "current") {
        expect(new Set(partiallySuperseded.findings.map(({ path }) => path))).toEqual(new Set(["a.ts"]))
      }
    }).pipe(Effect.provide(controlledDecisionModelLayer({ answers: findingAnswers() })))
  )

  it.effect("retires advice when recursive supporting evidence changes", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      const path = join(root, "types.ts")
      yield* Effect.promise(() =>
        put(root, "types.ts", ["interface Account { owner: Owner }", "interface Owner { name: string }"].join("\n"))
      )
      const result = yield* enabledReview(root, addEvent(root, ["types.ts"]), undefined, (base) => ({
        ...base,
        beforeHandoff: Effect.promise(() =>
          writeFile(path, ["interface Account { owner: Owner }", "interface Owner { name: number }"].join("\n"))
        )
      }))
      expect(result).toEqual({ status: "unavailable", reason: "stale", output: undefined })
    })
  )

  it.effect("states the handoff boundary truthfully: later edits cannot revoke returned output", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number\n"))
      const result = yield* enabledReview(root, addEvent(root))
      expect(result.status).toBe("ready")
      if (result.status !== "ready") return
      const handedOff = result.output
      yield* Effect.promise(() => writeFile(join(root, "type.ts"), "type OrderCount = string\n"))
      // Revalidation is immediately before handoff. The host owns the tool loop
      // after this value is returned; the product makes no post-handoff claim.
      expect(handedOff.hookSpecificOutput.additionalContext).toContain("OrderCount")
    })
  )
})

describe("controlled host writer", () => {
  it("captures the exact synchronous Codex payload without claiming completion", () => {
    const bytes: Buffer[] = []

    const stream = new Writable({
      write: (chunk, _encoding, complete) => {
        bytes.push(Buffer.from(chunk))
        complete()
      }
    })
    const output = {
      hookSpecificOutput: { hookEventName: "PostToolUse" as const, additionalContext: "Inspect 日本語\r\n\tcases" }
    }
    const result = attemptCodexHostOutput(output, (encoded) => {
      stream.write(encoded)
    })
    stream.end()
    expect(result.status).toBe("attempted-unacknowledged")

    expect(bytes[0]?.toString("utf8")).toBe(JSON.stringify(output) + "\n")
  })
  it("records attempted-unacknowledged only after the write invocation", () => {
    const events: Array<string> = []
    const attempt = attemptCodexHostOutput(
      { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "advice" } },
      (encoded) => {
        events.push(encoded)
      }
    )
    expect(events).toHaveLength(1)
    expect(attempt.status).toBe("attempted-unacknowledged")
    expect(attempt.encodedBytes).toBe(Buffer.byteLength(events[0] ?? ""))
  })

  it("does not manufacture an attempt record when the writer throws", () => {
    expect(() =>
      attemptCodexHostOutput(
        { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "advice" } },
        () => {
          throw new Error("closed writer")
        }
      )
    ).toThrow("closed writer")
  })
})
