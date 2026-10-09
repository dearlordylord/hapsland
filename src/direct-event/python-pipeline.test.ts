import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { adaptCodexDirectEvent } from "@hapsland/native-observation/direct-event/adapter"
import { analyzeTypeFile, inspectGraphFile } from "@hapsland/source-analysis/direct-event/analyzer"
import {
  prepareObservation,
  preparedProviderInput,
  evaluatePrepared,
  preparedUnitStillCurrent,
  reviewCodexDirectEvent
} from "@hapsland/review-execution/direct-event/pipeline"
import { controlledDecisionModelLayer } from "@hapsland/review-execution/review-execution/controlled-decision-model"
import { configuredRules } from "@hapsland/build-tooling/test-support/default-rules"
import { resolveConfiguration } from "@hapsland/runtime-inputs/configuration/resolve"
import { selectEditedRoots } from "@hapsland/native-observation/direct-event/edit-attribution"
import { TYPE_INPUT_CONTRACT } from "@hapsland/review-definition/rules/targets"
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "@hapsland/review-definition/runtime/review-config"
import { addEvent, makeGitFixture, put, updateEvent } from "@hapsland/build-tooling/test-support/test-fixtures"

const prepare = (event: unknown) =>
  Effect.gen(function* () {
    const observation = yield* adaptCodexDirectEvent(event)
    if (!observation) throw new Error("fixture adaptation failed")
    return yield* prepareObservation(observation, {
      controlledWriter: true,
      advicee: observation.advicee,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
      rules: configuredRules.filter((rule) =>
        ["meaningless_combinations", "absence_confusion", "bare_domain_value"].includes(rule.id)
      ),
      inputContract: TYPE_INPUT_CONTRACT
    })
  })
const familySource = `from dataclasses import dataclass as dc
from typing import TypedDict as TD, TypeAlias as TA, NewType as NT, Literal
from pydantic import BaseModel as BM
class Annotated:
    user_id: str
@dc(frozen=True)
class Data:
    tags: list[str] | None
class Mapping(TD, total=False):
    state: Literal["pending", "done"]
class Schema(BM):
    user_id: str
class Derived(Annotated):
    pass
Alias: TA = Annotated | Data
UserId = NT("UserId", str)
type Modern = Annotated | Mapping
class Arbitrary:
    def method(self):
        self.value = 1
`

describe("Python same-file shipped review", () => {
  it("preserves identities, complete exact source and declaration ranges for every root family", () => {
    const facts = inspectGraphFile("model.py", familySource)
    expect([...facts!.declarations.keys()]).toEqual([
      "Annotated",
      "Data",
      "Mapping",
      "Schema",
      "Derived",
      "Alias",
      "UserId",
      "Modern"
    ])
    for (const declaration of facts!.declarations.values()) {
      const lines = familySource.split("\n")
      const { start, end } = declaration.location
      const selected = lines.slice(start.line - 1, end.line).join("\n")
      expect(selected.slice(start.column - 1, selected.length - (lines[end.line - 1]!.length - end.column + 1))).toBe(
        declaration.artifact.source
      )
      expect(declaration.artifact.id).toBe(`model.py:${declaration.artifact.kind}:${declaration.artifact.name}`)
    }
    expect(analyzeTypeFile("model.py", familySource)).toMatchObject({
      status: "analyzed",
      units: expect.arrayContaining([expect.objectContaining({ status: "ready" })])
    })
  })
  it.effect(
    "admits all families with shipped rules, exposes same-file support and produces controlled finding/clear outcomes",
    () =>
      Effect.gen(function* () {
        const root = yield* Effect.promise(makeGitFixture)
        yield* Effect.promise(() => put(root, "model.py", familySource))
        const prepared = yield* prepare(addEvent(root, ["model.py"]))
        const ready = prepared.outcomes.filter((outcome) => outcome.status === "ready")
        expect(ready.map((outcome) => outcome.prepared.input.declaration.name)).toEqual([
          "Annotated",
          "Data",
          "Mapping",
          "Schema",
          "Derived",
          "Alias",
          "UserId",
          "Modern"
        ])
        for (const outcome of ready)
          expect(outcome.prepared.input.rules.map((rule) => rule.id).sort()).toEqual([
            "absence_confusion",
            "bare_domain_value",
            "meaningless_combinations"
          ])
        const alias = ready.find((outcome) => outcome.prepared.input.declaration.name === "Alias")!
        expect(preparedProviderInput(alias.prepared)).toMatchObject({
          artifact: { kind: "type-alias" },
          evidence: { nodes: expect.arrayContaining([expect.objectContaining({ name: "Annotated", kind: "class" })]) },
          inputContract: { completeness: "complete" }
        })
        const aliasInput = preparedProviderInput(alias.prepared)
        expect(aliasInput?.artifact.source).toBe("Alias: TA = Annotated | Data")
        expect(aliasInput?.evidence?.nodes.map((node) => ({ name: node.name, source: node.source }))).toEqual([
          { name: "Annotated", source: "class Annotated:\n    user_id: str" },
          { name: "Data", source: "@dc(frozen=True)\nclass Data:\n    tags: list[str] | None" }
        ])
        for (const probability of [0.95, 0.01]) {
          let calls = 0
          const result = yield* evaluatePrepared(alias.prepared).pipe(
            Effect.provide(
              controlledDecisionModelLayer({
                answers: Object.fromEntries(
                  alias.prepared.input.rules.map((rule) => [rule.id, { _tag: "Probability", probability }])
                ),
                inspectRequest: (request) =>
                  Effect.sync(() => {
                    expect(request.state).toEqual(preparedProviderInput(alias.prepared))
                    expect(Object.keys(request.decisions).sort()).toEqual([
                      "absence_confusion",
                      "bare_domain_value",
                      "meaningless_combinations"
                    ])
                  }),
                onRequest: Effect.sync(() => {
                  calls++
                })
              })
            )
          )
          expect(result.status).toBe("evaluated")
          expect(calls).toBe(1)
          if (result.status === "evaluated")
            expect(result.findings.map((finding) => finding.ruleId).sort()).toEqual(
              probability > 0.7 ? ["absence_confusion", "bare_domain_value", "meaningless_combinations"] : []
            )
        }
      })
  )
  it.effect("fieldless and nominal roots admit shipped rules with a controlled clear outcome", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() =>
        put(
          root,
          "model.py",
          'from dataclasses import dataclass\nfrom typing import NewType\n@dataclass\nclass Empty:\n    pass\nUserId = NewType("UserId", str)\n'
        )
      )
      const result = yield* prepare(addEvent(root, ["model.py"]))
      const ready = result.outcomes.filter((outcome) => outcome.status === "ready")
      expect(ready.map((outcome) => outcome.prepared.input.declaration.name)).toEqual(["Empty", "UserId"])
      for (const outcome of ready) {
        expect(outcome.prepared.input.rules.map((rule) => rule.id).sort()).toEqual([
          "absence_confusion",
          "bare_domain_value",
          "meaningless_combinations"
        ])
        const evaluation = yield* evaluatePrepared(outcome.prepared).pipe(
          Effect.provide(
            controlledDecisionModelLayer({
              answers: Object.fromEntries(
                outcome.prepared.input.rules.map((rule) => [rule.id, { _tag: "Probability", probability: 0.01 }])
              )
            })
          )
        )
        expect(evaluation).toMatchObject({ status: "evaluated", findings: [] })
      }
    })
  )
  it.effect("field/header updates select once; method-only updates and unchanged siblings are not targets", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      const source =
        "class Model:\n    user_id: str\n    def label(self):\n        return 'new'\nclass Sibling:\n    value: int\n"
      yield* Effect.promise(() => put(root, "model.py", source))
      const method = yield* prepare(updateEvent(root, "model.py", ["        return 'new'"]))
      expect(method.outcomes.filter((outcome) => outcome.status === "ready")).toHaveLength(0)
      const field = yield* prepare(updateEvent(root, "model.py", ["    user_id: str"]))
      const ready = field.outcomes.filter((outcome) => outcome.status === "ready")
      expect(ready.map((outcome) => outcome.prepared.input.declaration.name)).toEqual(["Model"])
      expect(preparedProviderInput(ready[0]!.prepared)?.artifact.source).toContain("def label")
      yield* Effect.promise(() => put(root, "model.py", source.replace("user_id: str", "user_id: int")))
      const observation = yield* adaptCodexDirectEvent(updateEvent(root, "model.py", ["    user_id: str"]))
      if (!observation) throw new Error("fixture adaptation failed")
      expect(
        yield* preparedUnitStillCurrent(observation, ready[0]!.prepared, {
          controlledWriter: true,
          advicee: observation.advicee,
          settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
          rules: configuredRules,
          inputContract: TYPE_INPUT_CONTRACT
        })
      ).toBe(false)
    })
  )
  it.effect("unknown external evidence, executable metadata and oversized roots omit independently", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() =>
        put(
          root,
          "model.py",
          "from remote import Foreign\nclass Missing:\n    value: Foreign\nclass Dynamic:\n    value: str = helper()\nclass Good:\n    user_id: str\n"
        )
      )
      const prepared = yield* prepare(addEvent(root, ["model.py"]))
      expect(
        prepared.outcomes
          .filter((outcome) => outcome.status === "ready")
          .map((outcome) => outcome.prepared.input.declaration.name)
      ).toEqual(["Good"])
      yield* Effect.promise(() =>
        put(
          root,
          "large.py",
          `class Large:\n    value: str\n    def body(self):\n        return '${"a".repeat(22000)}'`
        )
      )
      expect(
        (yield* prepare(addEvent(root, ["large.py"]))).outcomes.filter((outcome) => outcome.status === "ready")
      ).toHaveLength(0)
    })
  )
  it.effect("returns finding advice, clear and provider failure through the public review seam", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "model.py", "class Model:\n    user_id: str\n"))
      const event = addEvent(root, ["model.py"])
      const observation = yield* adaptCodexDirectEvent(event)
      if (!observation) throw new Error("fixture adaptation failed")
      const context = {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules: configuredRules,
        inputContract: TYPE_INPUT_CONTRACT
      }
      for (const mode of ["finding", "clear", "failure"] as const) {
        const result = yield* reviewCodexDirectEvent(event, context).pipe(
          Effect.provide(
            controlledDecisionModelLayer(
              mode === "failure"
                ? { failure: "offline failure" }
                : {
                    answers: Object.fromEntries(
                      configuredRules.map((rule) => [
                        rule.id,
                        { _tag: "Probability", probability: mode === "finding" ? 0.95 : 0 }
                      ])
                    )
                  }
            )
          )
        )
        if (mode === "finding") {
          expect(result.status).toBe("ready")
          expect(JSON.stringify(result.output)).toContain("domain value")
        } else if (mode === "clear") expect(result).toEqual({ status: "no-advice", output: undefined })
        else expect(result).toEqual({ status: "unavailable", reason: "backend", output: undefined })
      }
    })
  )
  it.effect("public admission prevents reads/requests for exclusions and configured source/tree/work budgets", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      const source = "class Model:\n    user_id: str\n"
      yield* Effect.promise(() => put(root, "model.py", source))
      const event = addEvent(root, ["model.py"])
      const observation = yield* adaptCodexDirectEvent(event)
      if (!observation) throw new Error("fixture adaptation failed")
      for (const restriction of ["excluded", "sourceBytes", "treeBytes", "work"] as const) {
        let reads = 0,
          requests = 0
        const graphLimits =
          restriction === "sourceBytes"
            ? { sourceBytes: 8 }
            : restriction === "treeBytes"
              ? { treeBytes: 8 }
              : restriction === "work"
                ? { work: 1 }
                : {}
        const configuration = {
          policy: resolveConfiguration(
            [
              {
                name: "user",
                source: "python-negative",
                document: { version: 1, graphLimits: { version: 1, ...graphLimits } }
              }
            ],
            root
          )
        }
        const budgetEvent = restriction === "work" ? updateEvent(root, "model.py", ["    receipt: Receipt"]) : event
        yield* Effect.promise(() =>
          put(
            root,
            "model.py",
            restriction === "work"
              ? "class Receipt:\n    id: str\nclass Failure:\n    reason: str\nclass Model:\n    receipt: Receipt\n    failure: Failure\n"
              : source
          )
        )
        const result = yield* reviewCodexDirectEvent(budgetEvent, {
          controlledWriter: true,
          advicee: observation.advicee,
          settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION, configuration },
          rules: configuredRules,
          inputContract: TYPE_INPUT_CONTRACT,
          ...(restriction === "excluded" ? { policy: { includes: ["**/*"], excludes: ["model.py"] } } : {}),
          captureHooks: {
            sourceRead: () => {
              reads++
            }
          }
        }).pipe(
          Effect.provide(
            controlledDecisionModelLayer({
              onRequest: Effect.sync(() => {
                requests++
              })
            })
          )
        )
        expect(result.output).toBeUndefined()
        expect(requests, restriction).toBe(0)
        if (restriction === "excluded") expect(reads).toBe(0)
      }
    })
  )
  it.effect("suppresses findings when source changes before advice handoff", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "model.py", "class Model:\n    user_id: str\n"))
      const event = addEvent(root, ["model.py"])
      const observation = yield* adaptCodexDirectEvent(event)
      if (!observation) throw new Error("fixture adaptation failed")
      const result = yield* reviewCodexDirectEvent(event, {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules: configuredRules,
        inputContract: TYPE_INPUT_CONTRACT,
        beforeHandoff: Effect.promise(() => put(root, "model.py", "class Model:\n    user_id: int\n"))
      }).pipe(
        Effect.provide(
          controlledDecisionModelLayer({
            answers: Object.fromEntries(
              configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0.95 }])
            )
          })
        )
      )
      expect(result).toEqual({ status: "unavailable", reason: "stale", output: undefined })
    })
  )
  it("model defining ranges distinguish decorators/header/base/field/configuration from methods and validators", () => {
    const source =
      "from pydantic import BaseModel, ConfigDict, field_validator\nclass Model(BaseModel):\n    value: str\n    model_config = ConfigDict(strict=True)\n    @field_validator('value')\n    def validate(cls, value):\n        return value\n"
    const facts = inspectGraphFile("model.py", source)!
    const declarations = [...facts.declarations.values()].map((fact) => ({
      path: "model.py",
      kind: fact.artifact.kind,
      name: fact.artifact.name,
      location: fact.location,
      ...(fact.selectionLocations === undefined ? {} : { selectionLocations: fact.selectionLocations })
    }))
    for (const line of [2, 3, 4, 5, 6, 7]) {
      const selected = selectEditedRoots(
        { path: "model.py", operation: "update", source },
        [
          {
            path: "model.py",
            verified: true,
            location: { start: { line, column: 1 }, end: { line, column: source.split("\n")[line - 1]!.length + 1 } }
          }
        ],
        declarations
      )
      expect(selected.selected.map((root) => root.name)).toEqual(line <= 4 ? ["Model"] : [])
    }
  })
  it("keeps type-bearing configuration references and class-local shadows honest", () => {
    const shadowed = analyzeTypeFile("model.py", "class Model:\n    def str(self):\n        pass\n    value: str\n")
    expect(shadowed).toMatchObject({ status: "analyzed", units: [expect.objectContaining({ status: "unsupported" })] })
    expect(
      analyzeTypeFile("model.py", "from pydantic import Field as str\nclass Model:\n    value: str\n")
    ).toMatchObject({ status: "analyzed", units: [expect.objectContaining({ status: "unsupported" })] })
    const configured = analyzeTypeFile(
      "model.py",
      "from pydantic import BaseModel, ConfigDict\nclass Tag:\n    id: str\nclass Model(BaseModel):\n    value: str\n    model_config = ConfigDict(ignored_types=(Tag,))\n"
    )
    expect(
      inspectGraphFile(
        "model.py",
        "from pydantic import BaseModel, ConfigDict\nclass Tag:\n    id: str\nclass Model(BaseModel):\n    value: str\n    model_config = ConfigDict(ignored_types=(Tag,))\n"
      )!.declarations.get("Model")?.references
    ).toContainEqual({ kind: "named", name: "Tag" })
    expect(configured).toMatchObject({
      status: "analyzed",
      units: expect.arrayContaining([expect.objectContaining({ status: "ready" })])
    })
    const facts = inspectGraphFile("model.py", "type Alias = str\nAlias = helper\nclass Model:\n    value: Alias\n")!
    expect(facts.declarations.get("Alias")?.references).toContainEqual({ kind: "unsupported", name: "namespace" })
    expect(analyzeTypeFile("model.py", "type Generic[T = str] = list[T]\n")).toMatchObject({
      status: "unsupported",
      reason: "parse"
    })
  })
  it.effect("a first method in an inherited model does not overlap its class header", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() =>
        put(
          root,
          "model.py",
          "class Base[T]:\n    value: T\nclass Child(Base[str]):\n    def method(self):\n        return 'new'\n"
        )
      )
      const result = yield* prepare(updateEvent(root, "model.py", ["    def method(self):"]))
      expect(result.outcomes.filter((outcome) => outcome.status === "ready")).toHaveLength(0)
      const header = yield* prepare(updateEvent(root, "model.py", ["class Child(Base[str]):"]))
      expect(
        header.outcomes
          .filter((outcome) => outcome.status === "ready")
          .map((outcome) => outcome.prepared.input.declaration.name)
      ).toEqual(["Child"])
    })
  )
  it.effect("lexical rebindings cannot turn fieldless classes into framework review requests", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      for (const rebinding of [
        "ignored = (dataclass := lambda cls: cls)",
        "dataclass += helper",
        "ignored = dataclass = helper",
        "ignored = lambda value=(dataclass := helper): value",
        "del dataclass"
      ]) {
        yield* Effect.promise(() =>
          put(root, "model.py", `from dataclasses import dataclass\n${rebinding}\n@dataclass\nclass Empty:\n    pass\n`)
        )
        const event = addEvent(root, ["model.py"])
        const observation = yield* adaptCodexDirectEvent(event)
        if (!observation) throw new Error("fixture adaptation failed")
        let requests = 0
        const result = yield* reviewCodexDirectEvent(event, {
          controlledWriter: true,
          advicee: observation.advicee,
          settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
          rules: configuredRules,
          inputContract: TYPE_INPUT_CONTRACT
        }).pipe(
          Effect.provide(
            controlledDecisionModelLayer({
              onRequest: Effect.sync(() => {
                requests++
              })
            })
          )
        )
        expect(result.output, rebinding).toBeUndefined()
        expect(requests, rebinding).toBe(0)
      }
      expect(
        analyzeTypeFile(
          "model.py",
          "from dataclasses import dataclass\ndef helper():\n    dataclass = other\n@dataclass\nclass Empty:\n    pass\n"
        )
      ).toMatchObject({ status: "analyzed", units: [expect.objectContaining({ status: "ready" })] })
    })
  )
  it.effect("generic binders preserve local bounds and omit opaque external bounds for shipped rules", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() =>
        put(
          root,
          "model.py",
          "class Bound:\n    id: str\nclass Model[T: Bound]:\n    value: T\ntype Alias[T: (Bound, str)] = list[T]\nclass Primitive[T: str]:\n    value: T\n"
        )
      )
      const local = yield* prepare(addEvent(root, ["model.py"]))
      const ready = local.outcomes.filter((outcome) => outcome.status === "ready")
      expect(ready.map((outcome) => outcome.prepared.input.declaration.name)).toEqual([
        "Bound",
        "Model",
        "Alias",
        "Primitive"
      ])
      for (const name of ["Model", "Alias"]) {
        const unit = ready.find((outcome) => outcome.prepared.input.declaration.name === name)!.prepared
        expect(unit.input.rules.map((rule) => rule.id).sort()).toEqual([
          "absence_confusion",
          "bare_domain_value",
          "meaningless_combinations"
        ])
        expect(preparedProviderInput(unit)?.evidence?.nodes).toEqual([
          expect.objectContaining({ name: "Bound", source: "class Bound:\n    id: str" })
        ])
      }
      yield* Effect.promise(() =>
        put(
          root,
          "model.py",
          "from external import Foreign\nclass Model[T: Foreign]:\n    value: str\ntype Alias[T: Foreign] = str\nclass Good:\n    id: str\n"
        )
      )
      const external = yield* prepare(addEvent(root, ["model.py"]))
      expect(
        external.outcomes
          .filter((outcome) => outcome.status === "ready")
          .map((outcome) => outcome.prepared.input.declaration.name)
      ).toEqual(["Good"])
    })
  )
  it("does not resolve class-local values to same-named module models", () => {
    for (const binding of ["Tag = helper", "def Tag(self): pass"]) {
      const result = analyzeTypeFile(
        "model.py",
        `class Tag:\n    id: str\nclass Model:\n    ${binding}\n    value: Tag\nclass Good:\n    id: str\n`
      )
      expect(result).toMatchObject({
        status: "analyzed",
        units: [
          expect.objectContaining({ status: "ready" }),
          expect.objectContaining({ status: "unsupported" }),
          expect.objectContaining({ status: "ready" })
        ]
      })
    }
    expect(
      analyzeTypeFile("model.py", "class Tag:\n    id: str\nclass Child(Tag):\n    Tag = helper\n    value: str\n")
    ).toMatchObject({
      status: "analyzed",
      units: [expect.objectContaining({ status: "ready" }), expect.objectContaining({ status: "ready" })]
    })
  })
  it("does not recognize shadowed markers or infer fields from methods", () => {
    for (const source of [
      "from dataclasses import dataclass\ndataclass = helper\n@dataclass\nclass Empty:\n    pass",
      "from pydantic import BaseModel\nBaseModel = helper\nclass Empty(BaseModel):\n    pass",
      "class Empty:\n    def f(self):\n        self.value = 1",
      "class Empty:\n    target.value: str"
    ])
      expect(inspectGraphFile("model.py", source)).toBeUndefined()
  })
})
