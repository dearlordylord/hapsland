import { symlink } from "node:fs/promises"
import { join } from "node:path"
import { captureStable } from "./capture.ts"
import { resolveGraphUnit } from "./graph-resolver.ts"
import { DEFAULT_DIRECT_FILE_POLICY, eligibleNamedPath } from "./selection.ts"
import { GRAPH_LIMIT_CEILINGS } from "../configuration/graph-limits.ts"
import type { ReviewNode } from "./model.ts"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { compileRule } from "../rules/compiler.ts"
import { TYPE_INPUT_CONTRACT } from "../rules/targets.ts"
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "../runtime/review-config.ts"
import { adaptCodexAdd } from "./adapter.ts"
import { prepareObservation, preparedProviderInput, preparedUnitStillCurrent, evaluatePrepared } from "./pipeline.ts"
import { controlledDecisionModelLayer } from "../test-support/controlled-decision-model.ts"
import { configuredRules } from "../test-support/default-rules.ts"
import { addEvent, makeGitFixture, put, updateEvent } from "./test-fixtures.ts"

const rules = (closure: boolean) =>
  [
    {
      id: "shape",
      question: "Does this type admit invalid states?",
      criteria: { false: "No", true: "Yes" },
      message: "Use a datatype",
      inputs: [
        {
          languages: ["typescript", "rust", "bend"],
          kind: "type",

          requires: closure ? ["root-declaration", "resolved-outbound-types"] : ["root-declaration"]
        }
      ]
    }
  ].map((rule) => compileRule({ version: 1, ...rule }, "bend-test"))
const prepare = (event: unknown, closure = true) =>
  Effect.gen(function* () {
    const observation = yield* adaptCodexAdd(event)
    if (observation === undefined) throw new Error("fixture adaptation failed")
    return yield* prepareObservation(observation, {
      controlledWriter: true,
      advicee: observation.advicee,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
      rules: rules(closure),
      inputContract: TYPE_INPUT_CONTRACT
    })
  })

describe("Bend direct review integration", () => {
  it.effect("prepares imported datatype evidence without unrelated literal-bearing functions", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      const receipt = "type Receipt is Data:\n  Receipt{id: U32}"
      const delivery = "type Delivery is Data:\n  Delivered{receipt: R.Receipt}"
      yield* Effect.promise(() =>
        put(root, "receipt.bend", `import Base\n${receipt}\ndef label() -> String:\n  "receipt # type Fake is Data:"`)
      )
      yield* Effect.promise(() =>
        put(root, "model.bend", `import ./receipt.bend as R\n${delivery}\ndef label() -> String:\n  "delivery"`)
      )
      const prepared = yield* prepare(addEvent(root, ["model.bend"]))
      const ready = prepared.outcomes.find((outcome) => outcome.status === "ready")
      if (ready?.status !== "ready") throw new Error("Bend datatype evidence was not prepared")
      const input = preparedProviderInput(ready.prepared)
      expect(input).toMatchObject({
        evidence: { nodes: [{ kind: "datatype", name: "Receipt" }] },
        inputContract: { completeness: "complete" }
      })
      expect(JSON.stringify(input)).toContain("Receipt{id: U32}")
      expect(JSON.stringify(input)).not.toContain("def label")
      expect(JSON.stringify(input)).not.toContain("Fake")
      let calls = 0
      const evaluated = yield* evaluatePrepared(ready.prepared).pipe(
        Effect.provide(
          controlledDecisionModelLayer({
            answers: Object.fromEntries(
              rules(true).map((rule) => [rule.id, { _tag: "Probability", probability: 0.91 }])
            ),
            onRequest: Effect.sync(() => {
              calls += 1
            })
          })
        )
      )
      expect(evaluated.status).toBe("evaluated")
      expect(calls).toBe(1)
    })
  )

  it.effect("does not bind TypeScript imports to Bend declarations", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b.bend'; interface A { b: B }"))
      yield* Effect.promise(() => put(root, "b.bend", "import Base\ntype B is Data:\n  B{value: U32}"))
      const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const reads: string[] = []
      const prepared = yield* prepareObservation(observation, {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules: configuredRules,
        captureHooks: {
          sourceRead: (path) => {
            reads.push(path)
          }
        }
      })
      expect(prepared.outcomes.some((outcome) => outcome.status === "ready")).toBe(false)
      expect(reads).toEqual(["a.ts", "a.ts"])
    })
  )
  it.effect("denies Noul dispatch for incomplete dependent and imported evidence", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      for (const source of [
        "import ./other.bend as M\ntype Root is Data:\n  Root{value: M.Missing}",
        "type Root is Data:\n  Root{value: Missing}",
        "type Root is Data:\n  Root{value: Word(32n)}",
        "type Root is Kind(a):\n  Root{}",
        "type T is Data:\n  C{}\ndef T() -> Data:\n  Data\ntype Root is Data:\n  Root{value: T}",
        "type Root is Data:\n  Root{n: Nat, value: Box<n>}"
      ]) {
        yield* Effect.promise(() => put(root, "model.bend", source))
        const observation = yield* adaptCodexAdd(addEvent(root, ["model.bend"]))
        if (observation === undefined) throw new Error("fixture adaptation failed")
        const prepared = yield* prepareObservation(observation, {
          controlledWriter: true,
          advicee: observation.advicee,
          settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
          rules: configuredRules
        })
        expect(prepared.outcomes.some((outcome) => outcome.status === "ready")).toBe(false)
      }
    })
  )
  it.effect("dispatches configured Noul questions with Bend datatype evidence", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() =>
        put(root, "model.bend", "import Base\ntype Delivery is Data:\n  Waiting{}\n  Delivered{receipt: String}")
      )
      const observation = yield* adaptCodexAdd(addEvent(root, ["model.bend"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const prepared = yield* prepareObservation(observation, {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules: configuredRules
      })
      const ready = prepared.outcomes.find((outcome) => outcome.status === "ready")
      if (ready?.status !== "ready") throw new Error("Noul Bend review was not prepared")
      let calls = 0
      const evaluated = yield* evaluatePrepared(ready.prepared).pipe(
        Effect.provide(
          controlledDecisionModelLayer({
            answers: Object.fromEntries(
              configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0.91 }])
            ),
            onRequest: Effect.sync(() => {
              calls += 1
            })
          })
        )
      )
      expect(evaluated.status).toBe("evaluated")
      expect(calls).toBe(1)
    })
  )
  it.effect("captures, projects, renders and revalidates same-file Bend evidence", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() =>
        put(
          root,
          "src/model.bend",
          "import Base\ntype Receipt is Data:\n  Receipt{id: String}\ntype Delivery is Data:\n  Waiting{}\n  Delivered{receipt: Receipt}"
        )
      )
      const prepared = yield* prepare(addEvent(root, ["src/model.bend"]))
      const delivery = prepared.outcomes.find(
        (outcome) => outcome.status === "ready" && outcome.prepared.input.declaration.name === "Delivery"
      )
      expect(delivery?.status).toBe("ready")
      if (delivery?.status !== "ready") throw new Error("Bend review was not prepared")
      expect(preparedProviderInput(delivery.prepared)).toMatchObject({
        artifact: { kind: "datatype", domain: "src/model.bend" },
        evidence: { nodes: [{ kind: "datatype", name: "Receipt" }] },
        inputContract: { completeness: "complete" }
      })
      const observation = yield* adaptCodexAdd(addEvent(root, ["src/model.bend"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const context = {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules: rules(true),
        inputContract: TYPE_INPUT_CONTRACT
      } as const
      expect(yield* preparedUnitStillCurrent(observation, delivery.prepared, context)).toBe(true)
      yield* Effect.promise(() =>
        put(
          root,
          "src/model.bend",
          "import Base\ntype Receipt is Data:\n  Receipt{id: U32}\ntype Delivery is Data:\n  Waiting{}\n  Delivered{receipt: Receipt}"
        )
      )
      expect(yield* preparedUnitStillCurrent(observation, delivery.prepared, context)).toBe(false)
    })
  )

  it.effect("omits unsupported context and denies closure-dependent rules", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "model.bend", "type Root is Data:\n  Root{remote: M.Remote}"))
      const denied = yield* prepare(addEvent(root, ["model.bend"]))
      expect(denied.outcomes.some((outcome) => outcome.status === "ready")).toBe(false)
      const partial = yield* prepare(addEvent(root, ["model.bend"]), false)
      const ready = partial.outcomes.find((outcome) => outcome.status === "ready")
      expect(ready?.status).toBe("ready")
      if (ready?.status !== "ready") throw new Error("root-only Bend review was not prepared")
      expect(ready.prepared.input.completeness).toBe("incomplete-irrelevant")
      expect(preparedProviderInput(ready.prepared)?.evidence.edges.every((edge) => edge.kind === "omitted")).toBe(true)
    })
  )

  it.effect("attributes a constructor update to the changed Bend datatype", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() =>
        put(
          root,
          "model.bend",
          "import Base\ntype Root is Data:\n  Root{value: U32}\ntype Untouched is Data:\n  Untouched{}"
        )
      )
      const event = updateEvent(root, "model.bend", ["  Root{value: U32}"], {
        tool_input: {
          command:
            "*** Begin Patch\n*** Update File: model.bend\n@@\n-  Root{value: String}\n+  Root{value: U32}\n type Untouched is Data:\n*** End Patch"
        }
      })
      const prepared = yield* prepare(event)
      expect(
        prepared.outcomes
          .filter((outcome) => outcome.status === "ready")
          .map((outcome) => (outcome.status === "ready" ? outcome.prepared.input.declaration.name : undefined))
      ).toEqual(["Root"])
    })
  )
})

const omitted = (node: ReviewNode): boolean =>
  node.references.some((edge) => edge.kind === "omitted" || (edge.kind === "expanded" && omitted(edge.node)))

describe("Bend cross-file review evidence", () => {
  it.effect("expands transitive aliases in nested payloads and captures support once for two changed roots", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() =>
        put(
          root,
          "src/model.bend",
          "import ./box.bend as B\nimport ../receipt.bend as R\ntype First is Data:\n  First{value: B.Box<R.Receipt>}\ntype Second is Data:\n  Second{value: R.Receipt}"
        )
      )
      yield* Effect.promise(() => put(root, "src/box.bend", "type Box<-A: Data> is Data:\n  Box{value: A}"))
      yield* Effect.promise(() =>
        put(root, "receipt.bend", "import ./identifier.bend as I\ntype Receipt is Data:\n  Receipt{id: I.Identifier}")
      )
      yield* Effect.promise(() =>
        put(root, "identifier.bend", "import Base\ntype Identifier is Data:\n  Identifier{value: String}")
      )
      const observation = yield* adaptCodexAdd(addEvent(root, ["src/model.bend"]))
      if (!observation) throw new Error("adaptation failed")
      const reads: string[] = []
      const prepared = yield* prepareObservation(observation, {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules: rules(true),
        inputContract: TYPE_INPUT_CONTRACT,
        captureHooks: {
          sourceRead: (path) => {
            reads.push(path)
          }
        }
      })
      const ready = prepared.outcomes.filter((outcome) => outcome.status === "ready")
      expect(ready.map((outcome) => outcome.prepared.input.declaration.name)).toEqual(["First", "Second"])
      expect(ready.every((outcome) => outcome.path === "src/model.bend")).toBe(true)
      for (const path of ["src/model.bend", "src/box.bend", "receipt.bend", "identifier.bend"]) {
        expect(reads.filter((read) => read === path)).toHaveLength(2)
      }
      const first = ready[0]
      if (!first) throw new Error("missing First")
      const input = preparedProviderInput(first.prepared)
      expect(input?.inputContract.completeness).toBe("complete")
      expect(input?.evidence.nodes.map((node) => node.name)).toEqual(["Box", "Receipt", "Identifier"])
      const context = {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules: rules(true),
        inputContract: TYPE_INPUT_CONTRACT
      } as const
      expect(yield* preparedUnitStillCurrent(observation, first.prepared, context)).toBe(true)
      yield* Effect.promise(() =>
        put(root, "identifier.bend", "import Base\ntype Identifier is Data:\n  Identifier{value: U32}")
      )
      expect(yield* preparedUnitStillCurrent(observation, first.prepared, context)).toBe(false)
    })
  )

  it.effect("withholds closure-dependent and Noul requests for a Base alias ambiguity", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() =>
        put(root, "model.bend", "import Base\nimport ./child.bend as Word\ntype Root is Data:\n  Root{value: Word.Nil}")
      )
      yield* Effect.promise(() => put(root, "child.bend", "type Nil is Data:\n  ChildNil{}"))
      const observation = yield* adaptCodexAdd(addEvent(root, ["model.bend"]))
      if (!observation) throw new Error("adaptation failed")
      for (const selectedRules of [rules(true), configuredRules]) {
        const reads: string[] = []
        const prepared = yield* prepareObservation(observation, {
          controlledWriter: true,
          advicee: observation.advicee,
          settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
          rules: selectedRules,
          inputContract: TYPE_INPUT_CONTRACT,
          captureHooks: {
            sourceRead: (path) => {
              reads.push(path)
            }
          }
        })
        expect(prepared.outcomes.some((outcome) => outcome.status === "ready")).toBe(false)
        expect(reads).toEqual(["model.bend", "model.bend"])
        let calls = 0
        for (const outcome of prepared.outcomes) {
          if (outcome.status === "ready") {
            yield* evaluatePrepared(outcome.prepared).pipe(
              Effect.provide(
                controlledDecisionModelLayer({
                  answers: Object.fromEntries(
                    selectedRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0.91 }])
                  ),
                  onRequest: Effect.sync(() => {
                    calls += 1
                  })
                })
              )
            )
          }
        }
        expect(calls).toBe(0)
      }
    })
  )

  it.effect("contains cross-file cycles and revalidates changed supporting import bindings", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() =>
        put(root, "model.bend", "import ./support.bend as S\ntype Root is Data:\n  Root{value: S.Support}")
      )
      yield* Effect.promise(() =>
        put(root, "support.bend", "import ./model.bend as M\ntype Support is Data:\n  Support{value: M.Root}")
      )
      const observation = yield* adaptCodexAdd(addEvent(root, ["model.bend"]))
      if (!observation) throw new Error("adaptation failed")
      const context = {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules: rules(true),
        inputContract: TYPE_INPUT_CONTRACT
      } as const
      const prepared = yield* prepareObservation(observation, context)
      const ready = prepared.outcomes.find((outcome) => outcome.status === "ready")
      if (ready?.status !== "ready") throw new Error("cycle was not prepared")
      expect(ready.prepared.input.completeness).toBe("complete")
      expect(yield* preparedUnitStillCurrent(observation, ready.prepared, context)).toBe(true)
      yield* Effect.promise(() => put(root, "other.bend", "type Root is Data:\n  Other{}"))
      yield* Effect.promise(() =>
        put(root, "support.bend", "import ./other.bend as M\ntype Support is Data:\n  Support{value: M.Root}")
      )
      expect(yield* preparedUnitStillCurrent(observation, ready.prepared, context)).toBe(false)
    })
  )

  it.effect("never reads excluded, ignored, symlinked, outside-root or cross-language targets", () =>
    Effect.gen(function* () {
      for (const mode of ["excluded", "ignored", "symlink", "outside", "typescript", "rust"] as const) {
        const root = yield* Effect.promise(makeGitFixture)
        const outside = yield* Effect.promise(makeGitFixture)
        const target =
          mode === "outside"
            ? `../${outside.split("/").at(-1)}/support.bend`
            : mode === "typescript"
              ? "./support.ts"
              : mode === "rust"
                ? "./support.rs"
                : "./support.bend"
        yield* Effect.promise(() =>
          put(root, "model.bend", `import ${target} as S\ntype Root is Data:\n  Root{value: S.Support}`)
        )
        if (mode === "symlink") {
          yield* Effect.promise(() => put(outside, "support.bend", "type Support is Data:\n  Support{}"))
          yield* Effect.promise(() => symlink(join(outside, "support.bend"), join(root, "support.bend")))
        } else
          yield* Effect.promise(() =>
            put(
              mode === "outside" ? outside : root,
              mode === "typescript" ? "support.ts" : mode === "rust" ? "support.rs" : "support.bend",
              "type Support is Data:\n  Support{}"
            )
          )
        if (mode === "ignored") yield* Effect.promise(() => put(root, ".gitignore", "support.bend\n"))
        const observation = yield* adaptCodexAdd(addEvent(root, ["model.bend"]))
        if (!observation) throw new Error("adaptation failed")
        const reads: string[] = []
        const prepared = yield* prepareObservation(observation, {
          controlledWriter: true,
          advicee: observation.advicee,
          settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
          rules: rules(true),
          inputContract: TYPE_INPUT_CONTRACT,
          policy: { includes: ["**/*"], excludes: mode === "excluded" ? ["support.bend"] : [] },
          captureHooks: {
            sourceRead: (path) => {
              reads.push(path)
            }
          }
        })
        expect(
          prepared.outcomes.some((outcome) => outcome.status === "ready"),
          mode
        ).toBe(false)
        expect(reads, mode).toEqual(["model.bend", "model.bend"])
      }
    })
  )

  it.effect("enforces file, read and work ceilings before supporting captures", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() =>
        put(root, "model.bend", "import ./support.bend as S\ntype Root is Data:\n  Root{value: S.Support}")
      )
      yield* Effect.promise(() =>
        put(root, "support.bend", "import ./tail.bend as T\ntype Support is Data:\n  Support{value: T.Tail}")
      )
      yield* Effect.promise(() => put(root, "tail.bend", "type Tail is Data:\n  Tail{}"))
      const observation = yield* adaptCodexAdd(addEvent(root, ["model.bend"]))
      if (!observation) throw new Error("adaptation failed")
      const selected = yield* eligibleNamedPath(
        root,
        "model.bend",
        DEFAULT_DIRECT_FILE_POLICY,
        observation.rootIdentity
      )
      if (!selected) throw new Error("selection failed")
      const capture = yield* captureStable(root, selected, {}, observation.rootIdentity)
      if (!capture) throw new Error("capture failed")
      for (const limits of [
        { ...GRAPH_LIMIT_CEILINGS, files: 1 },
        { ...GRAPH_LIMIT_CEILINGS, readBytes: GRAPH_LIMIT_CEILINGS.sourceBytes },
        { ...GRAPH_LIMIT_CEILINGS, work: 1 }
      ]) {
        const reads: string[] = []
        const unit = yield* resolveGraphUnit("model.bend", capture, "Root", {
          root,
          rootIdentity: observation.rootIdentity,
          policy: DEFAULT_DIRECT_FILE_POLICY,
          limits,
          captureHooks: {
            sourceRead: (path) => {
              reads.push(path)
            }
          }
        })
        expect(unit && omitted(unit.root)).toBe(true)
        expect(reads.includes("tail.bend")).toBe(false)
        if (limits.files === 1 || limits.readBytes === GRAPH_LIMIT_CEILINGS.sourceBytes) expect(reads).toEqual([])
        else expect(reads).toEqual(["support.bend", "support.bend"])
      }
    })
  )
})
