import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { captureConfiguration, resolveConfiguration } from "@hapsland/runtime-inputs/configuration/index"
import { captureStable } from "@hapsland/native-observation/direct-event/capture"
import type { SourcePreparationContext } from "@hapsland/review-execution/direct-event/pipeline"
import { rm } from "node:fs/promises"
import { compileRule } from "@hapsland/review-definition/rules/compiler"
import { TYPE_INPUT_CONTRACT } from "@hapsland/review-definition/rules/targets"
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "@hapsland/review-definition/runtime/review-config"
import { adaptCodexDirectEvent } from "@hapsland/native-observation/direct-event/adapter"
import {
  prepareObservation,
  preparedProviderInput,
  preparedUnitStillCurrent,
  evaluatePrepared
} from "@hapsland/review-execution/direct-event/pipeline"
import { controlledDecisionModelLayer } from "@hapsland/review-execution/review-execution/controlled-decision-model"
import { addEvent, makeGitFixture, put, updateEvent } from "@hapsland/build-tooling/test-support/test-fixtures"
import { configuredRules } from "@hapsland/build-tooling/test-support/default-rules"
const rules = [
  compileRule(
    {
      version: 1,
      id: "model",
      question: "Does the type admit invalid states?",
      criteria: { false: "No", true: "Yes" },
      message: "Represent the states distinctly.",
      inputs: [
        {
          languages: ["go"],
          kind: "type",
          requires: ["root-declaration", "resolved-outbound-types", "selected-source-type-closure"]
        }
      ]
    },
    "go-test"
  )
]
const context = {
  settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
  rules,
  inputContract: TYPE_INPUT_CONTRACT
}
const prepare = (event: unknown, overrides: Partial<SourcePreparationContext> = {}) =>
  Effect.gen(function* () {
    const observation = yield* adaptCodexDirectEvent(event)
    if (observation === undefined) throw new Error("adaptation")
    return {
      observation,
      result: yield* prepareObservation(observation, {
        ...context,
        ...overrides,
        advicee: observation.advicee,
        controlledWriter: true
      })
    }
  })
const support =
  "package payment\ntype Status int\nconst (\n Pending Status = iota\n Paid\n Failed\n)\ntype Receipt struct { Value string }\n"
const source = "package payment\ntype Payment struct { Status Status; Receipt *Receipt; Failure *string }\n"
describe("Go active local package review", () => {
  it.effect("captures split-package types and exact iota group through the provider boundary", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      try {
        yield* Effect.promise(() => put(root, "payment.go", source))
        yield* Effect.promise(() => put(root, "support.go", support))
        const { result } = yield* prepare(addEvent(root, ["payment.go"]))
        const ready = result.outcomes.filter((outcome) => outcome.status === "ready")
        expect(ready).toHaveLength(1)
        const unit = ready[0]
        if (unit?.status !== "ready") throw new Error("missing unit")
        const input = JSON.stringify(preparedProviderInput(unit.prepared))
        expect(input).toContain("constant-group")
        expect(input).toContain("Pending Status = iota")
        expect(input).toContain("type Receipt struct")
        expect(input).not.toContain("package payment")
        expect(unit.prepared.input.unit.sourceDependencies).toEqual(["support.go"])
        const evaluated = yield* evaluatePrepared(unit.prepared).pipe(
          Effect.provide(
            controlledDecisionModelLayer({ answers: { model: { _tag: "Probability", probability: 0.99 } } })
          )
        )
        expect(evaluated.status).toBe("evaluated")
        if (evaluated.status === "evaluated") expect(evaluated.findings).toHaveLength(1)
      } finally {
        yield* Effect.promise(() => rm(root, { recursive: true, force: true }))
      }
    })
  )
  it.effect("rechecks alternative package identities and restored source", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      try {
        yield* Effect.promise(() => put(root, "payment.go", source))
        yield* Effect.promise(() => put(root, "support.go", support))
        const { result, observation } = yield* prepare(addEvent(root, ["payment.go"]))
        const unit = result.outcomes.find((outcome) => outcome.status === "ready")
        if (unit?.status !== "ready") throw new Error("missing unit")
        expect(
          yield* preparedUnitStillCurrent(observation, unit.prepared, {
            ...context,
            controlledWriter: true,
            advicee: observation.advicee
          })
        ).toBe(true)
        yield* Effect.promise(() => put(root, "variant.go", "package payment\ntype Receipt struct { Other int }\n"))
        expect(
          yield* preparedUnitStillCurrent(observation, unit.prepared, {
            ...context,
            controlledWriter: true,
            advicee: observation.advicee
          })
        ).toBe(false)
        yield* Effect.promise(() => rm(`${root}/variant.go`))
        expect(
          yield* preparedUnitStillCurrent(observation, unit.prepared, {
            ...context,
            controlledWriter: true,
            advicee: observation.advicee
          })
        ).toBe(true)
      } finally {
        yield* Effect.promise(() => rm(root, { recursive: true, force: true }))
      }
    })
  )
  for (const [label, name, extra] of [
    ["ambiguous bindings", "support.go", "package payment\ntype Receipt struct { Value string }\ntype Receipt int\n"],
    ["missing target context", "support_linux.go", "package payment\ntype Receipt struct { Value string }\n"],
    ["external fields", "support.go", 'package payment\nimport "time"\ntype Receipt struct { Value time.Time }\n']
  ])
    it.effect(`omits ${label}`, () =>
      Effect.gen(function* () {
        const root = yield* Effect.promise(makeGitFixture)
        try {
          yield* Effect.promise(() =>
            put(root, "payment.go", "package payment\ntype Payment struct { Receipt *Receipt }\n")
          )
          yield* Effect.promise(() => put(root, name!, extra!))
          const { result } = yield* prepare(addEvent(root, ["payment.go"]))
          expect(result.outcomes.filter((outcome) => outcome.status === "ready")).toHaveLength(0)
        } finally {
          yield* Effect.promise(() => rm(root, { recursive: true, force: true }))
        }
      })
    )
  it.effect("admits the shipped model rules with declared headers and exact field evidence", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      try {
        yield* Effect.promise(() =>
          put(
            root,
            "model.go",
            'package payment\ntype Model[T any] struct { Value T; Name string `json:"name"`; *Receipt }\n'
          )
        )
        yield* Effect.promise(() =>
          put(
            root,
            "receipt.go",
            "//go:build linux && arm64 && customer\n\npackage payment\ntype Receipt struct { ID string }\n"
          )
        )
        const configuration = captureConfiguration(
          resolveConfiguration(
            [
              {
                name: "project",
                source: "declared.json",
                document: { version: 1, analysis: { go: { goos: "linux", goarch: "arm64", tags: ["customer"] } } }
              }
            ],
            root
          )
        )
        const { result } = yield* prepare(addEvent(root, ["model.go"]), {
          rules: configuredRules,
          settings: { ...context.settings, configuration }
        })
        const ready = result.outcomes.find((outcome) => outcome.status === "ready")
        if (ready?.status !== "ready") throw new Error("missing unit")
        const input = JSON.stringify(preparedProviderInput(ready.prepared))
        expect(input).toContain("json:")
        expect(ready.prepared.input.rules.map((rule) => rule.id).sort()).toEqual([
          "absence_confusion",
          "bare_domain_value",
          "meaningless_combinations"
        ])
      } finally {
        yield* Effect.promise(() => rm(root, { recursive: true, force: true }))
      }
    })
  )
  it.effect("omits oversized constant groups while an independent type remains eligible", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      try {
        yield* Effect.promise(() =>
          put(root, "model.go", "package payment\ntype Status string\ntype Independent struct { Value int }\n")
        )
        yield* Effect.promise(() =>
          put(root, "constant.go", `package payment\nconst Huge Status = "${"x".repeat(22000)}"\n`)
        )
        const { result } = yield* prepare(addEvent(root, ["model.go"]))
        expect(
          result.outcomes
            .filter((outcome) => outcome.status === "ready")
            .map((outcome) => (outcome.status === "ready" ? outcome.prepared.input.declaration.name : ""))
        ).toEqual(["Independent"])
        expect(JSON.stringify(result.outcomes)).not.toContain('"name":"Huge"')
      } finally {
        yield* Effect.promise(() => rm(root, { recursive: true, force: true }))
      }
    })
  )
  it.effect("records constant-only demand without selecting an unchanged type", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      try {
        yield* Effect.promise(() => put(root, "support.go", support))
        const event = updateEvent(root, "support.go", [" Settled"])
        yield* Effect.promise(() => put(root, "support.go", support.replace(" Paid", " Settled")))
        const { result } = yield* prepare(event)
        expect(result.outcomes.filter((outcome) => outcome.status === "ready")).toHaveLength(0)
      } finally {
        yield* Effect.promise(() => rm(root, { recursive: true, force: true }))
      }
    })
  )
  it.effect("selects declared platform variants and rejects a stale configuration identity", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      try {
        yield* Effect.promise(() =>
          put(root, "payment.go", "package payment\ntype Payment struct { Receipt Receipt }\n")
        )
        yield* Effect.promise(() =>
          put(root, "receipt_linux.go", "package payment\ntype Receipt struct { Value string }\n")
        )
        yield* Effect.promise(() =>
          put(root, "receipt_windows.go", "package payment\ntype Receipt struct { Other int }\n")
        )
        const settings = {
          ...context.settings,
          configuration: captureConfiguration(
            resolveConfiguration(
              [
                {
                  name: "project",
                  source: "declared.json",
                  document: { version: 1, analysis: { go: { goos: "linux", goarch: "arm64", tags: [] } } }
                }
              ],
              root
            )
          )
        }
        const { result, observation } = yield* prepare(addEvent(root, ["payment.go"]), { settings })
        const ready = result.outcomes.find((outcome) => outcome.status === "ready")
        if (ready?.status !== "ready") throw new Error("declared platform missing")
        expect(JSON.stringify(preparedProviderInput(ready.prepared))).toContain("Value string")
        expect(JSON.stringify(preparedProviderInput(ready.prepared))).not.toContain("Other int")
        const changed = {
          ...context.settings,
          configuration: captureConfiguration(
            resolveConfiguration(
              [
                {
                  name: "project",
                  source: "declared.json",
                  document: { version: 1, analysis: { go: { goos: "windows", goarch: "arm64", tags: [] } } }
                }
              ],
              root
            )
          )
        }
        expect(
          yield* preparedUnitStillCurrent(observation, ready.prepared, {
            ...context,
            settings: changed,
            controlledWriter: true,
            advicee: observation.advicee
          })
        ).toBe(false)
      } finally {
        yield* Effect.promise(() => rm(root, { recursive: true, force: true }))
      }
    })
  )
  it.effect("refuses excluded evidence before capture and large inventories before sibling reads", () =>
    Effect.gen(function* () {
      for (const mode of ["excluded", "budget"]) {
        const root = yield* Effect.promise(makeGitFixture)
        const reads: string[] = []
        try {
          yield* Effect.promise(() => put(root, "payment.go", source))
          yield* Effect.promise(() => put(root, "support.go", support))
          if (mode === "budget")
            for (let i = 0; i < 8; i++)
              yield* Effect.promise(() => put(root, `sibling${i}.go`, `package payment\ntype Sibling${i} int\n`))
          const { result } = yield* prepare(addEvent(root, ["payment.go"]), {
            policy: {
              includes: ["**/*"],
              excludes: [],
              ...(mode === "excluded" ? { contextExcludes: ["support.go"] } : {})
            },
            captureSource: Effect.fn(function* (...args: Parameters<typeof captureStable>) {
              reads.push(args[1].relativePath)
              return yield* captureStable(...args)
            })
          })
          expect(result.outcomes.filter((outcome) => outcome.status === "ready")).toHaveLength(0)
          expect(reads).toEqual(["payment.go"])
        } finally {
          yield* Effect.promise(() => rm(root, { recursive: true, force: true }))
        }
      }
    })
  )
  it.effect("attributes header/field updates independently of a simultaneous constant edit", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      try {
        const edited =
          "package payment\ntype Model[T any] struct { Values []T }\ntype Unchanged int\nconst Marker = 2\n"
        yield* Effect.promise(() => put(root, "model.go", edited))
        const { result } = yield* prepare(
          updateEvent(root, "model.go", [], {
            tool_input: {
              command:
                "*** Begin Patch\n*** Update File: model.go\n@@\n-type Model[T any] struct { Value T }\n+type Model[T any] struct { Values []T }\n@@\n-const Marker = 1\n+const Marker = 2\n*** End Patch"
            }
          })
        )
        expect(
          result.outcomes
            .filter((outcome) => outcome.status === "ready")
            .map((outcome) => outcome.prepared.input.declaration.name)
        ).toEqual(["Model"])
        expect(JSON.stringify(result.observation)).toContain("constant-only-demand-gap")
      } finally {
        yield* Effect.promise(() => rm(root, { recursive: true, force: true }))
      }
    })
  )
})
