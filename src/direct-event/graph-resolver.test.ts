import { resolveConfiguration } from "@hapsland/runtime-inputs/configuration/resolve"
import {
  resolvedDirectFilePolicy,
  DEFAULT_DIRECT_FILE_POLICY,
  eligibleNamedPath
} from "@hapsland/native-observation/direct-event/selection"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { put, makeGitFixture, addEvent } from "@hapsland/build-tooling/test-support/test-fixtures"
import { adaptCodexDirectEvent } from "@hapsland/native-observation/direct-event/adapter"
import {
  evaluatePrepared,
  prepareObservation,
  preparedProviderInput,
  preparedUnitStillCurrent
} from "@hapsland/review-execution/direct-event/pipeline"
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "@hapsland/review-definition/runtime/review-config"
import { configuredRules } from "@hapsland/build-tooling/test-support/default-rules"
import { inspectGraphFile } from "@hapsland/source-analysis/direct-event/analyzer"
import {
  captureStable,
  type CaptureDiagnostic,
  type StableCapture
} from "@hapsland/native-observation/direct-event/capture"
import { resolveGraphUnit } from "@hapsland/source-analysis/direct-event/graph-resolver"
import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-limits"
import { compileRule } from "@hapsland/review-definition/rules/compiler"
import { TYPE_INPUT_CONTRACT } from "@hapsland/review-definition/rules/targets"
import type { ReviewNode } from "@hapsland/source-artifacts/direct-event/artifact-model"
import { controlledDecisionModelLayer } from "@hapsland/review-execution/review-execution/controlled-decision-model"

const hasOmitted = (node: ReviewNode): boolean =>
  node.references.some(
    (reference) => reference.kind === "omitted" || (reference.kind === "expanded" && hasOmitted(reference.node))
  )

const candidateRules = [
  compileRule(
    {
      version: 1,
      id: "graph-shape",
      question: "Is the type clear?",
      criteria: { false: "No", true: "Yes" },
      message: "Clarify type",
      inputs: [
        {
          languages: ["typescript", "rust", "bend"],
          kind: "type",
          requires: ["root-declaration", "resolved-outbound-types"]
        }
      ]
    },
    "fixture-current"
  )
]
const rootOnlyRules = [
  compileRule(
    {
      version: 1,
      id: "root-only-shape",
      question: "Is the declaration clear?",
      criteria: { false: "No", true: "Yes" },
      message: "Clarify declaration",
      inputs: [{ languages: ["typescript", "rust", "bend"], kind: "type", requires: ["root-declaration"] }]
    },
    "fixture-current"
  )
]

describe("cross-file graph preparation", () => {
  it.effect("reports supporting capture refusal against its owning candidate and preserves partial preparation", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      const source = `//${"x".repeat(100)}\nexport interface B { value: string }`
      yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b'; export interface A { b: B }"))
      yield* Effect.promise(() => put(root, "b.ts", source))
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const configuration = {
        policy: resolveConfiguration(
          [
            {
              name: "user",
              source: "fixture:supporting-cap",
              document: { version: 1, graphLimits: { version: 1, sourceBytes: 80, readBytes: 1024 } }
            }
          ],
          root
        )
      }
      const diagnostics: { candidatePath: string; sourcePath: string; diagnostic: CaptureDiagnostic }[] = []
      const context = {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION, configuration },
        inputContract: TYPE_INPUT_CONTRACT,
        rules: rootOnlyRules
      } as const
      const prepared = yield* prepareObservation(observation, {
        ...context,
        observeCaptureDiagnostic: (candidatePath, sourcePath, diagnostic) =>
          diagnostics.push({ candidatePath, sourcePath, diagnostic })
      })
      expect(diagnostics).toEqual([
        {
          candidatePath: "a.ts",
          sourcePath: "b.ts",
          diagnostic: {
            stage: "capture",
            code: "capture-size-limit",
            args: { observedBytes: Buffer.byteLength(source), limitBytes: 80 }
          }
        }
      ])
      const ready = prepared.outcomes.filter((outcome) => outcome.status === "ready")
      expect(ready).toHaveLength(1)
      expect(ready[0]?.prepared.input.completeness).toBe("incomplete-irrelevant")
      const failedObserver = yield* prepareObservation(observation, {
        ...context,
        observeCaptureDiagnostic: () => {
          throw new Error("optional observer unavailable")
        }
      })
      expect(failedObserver.outcomes).toEqual(prepared.outcomes)
    })
  )

  for (const resource of ["files", "bytes"] as const) {
    it.effect(
      `reports aggregate supporting capture ${resource} refusal before reading without rejecting the root`,
      () =>
        Effect.gen(function* () {
          const root = yield* Effect.promise(makeGitFixture)
          const declaration = "import type { B } from './b'; export interface A { b: B }"
          const sourceBytes = resource === "bytes" ? 2_097_152 : Buffer.byteLength(declaration)
          const source =
            resource === "bytes"
              ? `${declaration}\n//${"x".repeat(sourceBytes - Buffer.byteLength(declaration) - 3)}`
              : declaration
          const count = resource === "bytes" ? 8 : 64
          const paths = ["a.ts", ...Array.from({ length: count - 1 }, (_, index) => `prior-${index}.ts`)]
          yield* Effect.promise(() => put(root, "a.ts", source))
          const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
          if (observation === undefined) throw new Error("fixture adaptation failed")
          const captures = new Map<string, StableCapture>()
          for (const path of paths) {
            if (path !== "a.ts") yield* Effect.promise(() => put(root, path, source))
            const selected = yield* eligibleNamedPath(root, path)
            if (selected === undefined) throw new Error("fixture path selection failed")
            const result = yield* captureStable(root, selected, {}, observation.rootIdentity)
            if (result.status !== "captured") throw new Error("fixture source capture failed")
            captures.set(path, result.capture)
          }
          yield* Effect.promise(() => put(root, "b.ts", "export interface B { value: string }"))
          const captured = captures.get("a.ts")
          if (captured === undefined) throw new Error("fixture root capture missing")
          const reads: string[] = []
          const diagnostics: { sourcePath: string; diagnostic: CaptureDiagnostic }[] = []
          const unit = yield* resolveGraphUnit("a.ts", captured, "A", {
            root,
            rootIdentity: observation.rootIdentity,
            policy: DEFAULT_DIRECT_FILE_POLICY,
            captureCache: captures,
            captureHooks: { sourceRead: (path) => reads.push(path) },
            observeCaptureDiagnostic: (sourcePath, diagnostic) => diagnostics.push({ sourcePath, diagnostic })
          })
          expect(reads).toEqual([])
          expect(diagnostics).toEqual([
            {
              sourcePath: "b.ts",
              diagnostic: {
                stage: "capture",
                code: "capture-budget-limit",
                args:
                  resource === "files"
                    ? { resource, used: 64, requested: 1, limit: 64 }
                    : { resource, used: 16_777_216, requested: 2_097_152, limit: 16_777_216 }
              }
            }
          ])
          expect(unit?.root.artifact.name).toBe("A")
          if (unit === undefined) throw new Error("supporting refusal rejected the root")
          expect(hasOmitted(unit.root)).toBe(true)
        })
    )
  }

  it.effect(
    "expands explicit supporting scope without reviewing its changed roots and vetoes privacy before reads",
    () =>
      Effect.gen(function* () {
        const root = yield* Effect.promise(makeGitFixture)
        yield* Effect.promise(() =>
          put(
            root,
            "src/order.ts",
            "import type { Customer } from '../shared/customer'; interface Order { customer: Customer }"
          )
        )
        yield* Effect.promise(() =>
          put(root, "shared/customer.ts", "export interface Customer { customerName: string }")
        )
        const observation = yield* adaptCodexDirectEvent(addEvent(root, ["src/order.ts", "shared/customer.ts"]))
        if (observation === undefined) throw new Error("fixture adaptation failed")
        const policy = resolvedDirectFilePolicy(
          resolveConfiguration([
            {
              name: "project",
              source: "fixture",
              document: {
                version: 1,
                includes: ["src/**"],
                languages: ["typescript"],
                contextIncludes: ["src/**", "shared/**"]
              }
            }
          ])
        )
        const base = {
          controlledWriter: true,
          advicee: observation.advicee,
          settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
          rules: candidateRules,
          inputContract: TYPE_INPUT_CONTRACT,
          policy
        } as const
        const prepared = yield* prepareObservation(observation, base)
        const ready = prepared.outcomes.filter((outcome) => outcome.status === "ready")
        expect(ready.map((outcome) => outcome.prepared.input.path)).toEqual(["src/order.ts"])
        const order = ready[0]
        if (order === undefined) throw new Error("order root did not prepare")
        expect(order.prepared.input.unit.root.references[0]).toMatchObject({
          kind: "expanded",
          node: { artifact: { id: "shared/customer.ts:interface:Customer" } }
        })
        expect(yield* preparedUnitStillCurrent(observation, order.prepared, base)).toBe(true)
        const privatePolicy = resolvedDirectFilePolicy(
          resolveConfiguration([
            {
              name: "project",
              source: "fixture",
              document: {
                version: 1,
                includes: ["src/**"],
                contextIncludes: ["src/**", "shared/**"],
                privacyExcludes: ["shared/**"]
              }
            }
          ])
        )
        expect(yield* preparedUnitStillCurrent(observation, order.prepared, { ...base, policy: privatePolicy })).toBe(
          false
        )
        const reads: string[] = []
        const privatePrepared = yield* prepareObservation(observation, {
          ...base,
          rules: rootOnlyRules,
          policy: privatePolicy,
          captureHooks: {
            sourceRead: (path: string) => {
              reads.push(path)
            }
          }
        })
        expect(reads).not.toContain("shared/customer.ts")
        const privateReady = privatePrepared.outcomes.find((outcome) => outcome.status === "ready")
        if (privateReady?.status !== "ready") throw new Error("root-only private graph did not prepare")
        expect(JSON.stringify(preparedProviderInput(privateReady.prepared))).not.toContain("customerName")
      })
  )

  it.effect("does not physically read an oversized supporting source", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b'; interface A { b: B }"))
      yield* Effect.promise(() => put(root, "b.ts", `// ${"x".repeat(100)}\nexport interface B { value: string }`))
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const selected = yield* eligibleNamedPath(root, "a.ts", DEFAULT_DIRECT_FILE_POLICY, observation.rootIdentity)
      if (selected === undefined) throw new Error("root path was not eligible")
      const captureResult = yield* captureStable(root, selected, {}, observation.rootIdentity)
      if (captureResult.status !== "captured") throw new Error("root capture failed")
      const capture = captureResult.capture
      const reads: string[] = []
      const unit = yield* resolveGraphUnit("a.ts", capture, "A", {
        root,
        rootIdentity: observation.rootIdentity,
        policy: DEFAULT_DIRECT_FILE_POLICY,
        limits: { ...GRAPH_LIMIT_CEILINGS, sourceBytes: 80, readBytes: 160 },
        captureHooks: {
          sourceRead: (path) => {
            reads.push(path)
          }
        }
      })
      expect(unit && hasOmitted(unit.root)).toBe(true)
      expect(reads).toEqual([])
    })
  )

  it.effect("lets Bend reserve the aggregate read cap before another supporting read", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      const a = "import type { B } from './b'; interface A { b: B }"
      const b = "import type { C } from './c'; export interface B { c: C }"
      yield* Effect.promise(() => put(root, "a.ts", a))
      yield* Effect.promise(() => put(root, "b.ts", b))
      yield* Effect.promise(() => put(root, "c.ts", "export interface C { value: string }"))
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const selected = yield* eligibleNamedPath(root, "a.ts", DEFAULT_DIRECT_FILE_POLICY, observation.rootIdentity)
      if (selected === undefined) throw new Error("root path was not eligible")
      const captureResult = yield* captureStable(root, selected, {}, observation.rootIdentity)
      if (captureResult.status !== "captured") throw new Error("root capture failed")
      const capture = captureResult.capture
      const reads: string[] = []
      const unit = yield* resolveGraphUnit("a.ts", capture, "A", {
        root,
        rootIdentity: observation.rootIdentity,
        policy: DEFAULT_DIRECT_FILE_POLICY,
        limits: { ...GRAPH_LIMIT_CEILINGS, readBytes: GRAPH_LIMIT_CEILINGS.sourceBytes + 100 },
        captureHooks: {
          sourceRead: (path) => {
            reads.push(path)
          }
        }
      })
      expect(unit && hasOmitted(unit.root)).toBe(true)
      expect(reads).toEqual(["b.ts", "b.ts"])
    })
  )

  it.effect("charges local work inside a supporting file before the next import", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b'; interface A { b: B }"))
      yield* Effect.promise(() =>
        put(
          root,
          "b.ts",
          "import type { D } from './d'; interface C { value: string } export interface B { c: C; d: D }"
        )
      )
      yield* Effect.promise(() => put(root, "d.ts", "import type { E } from './e'; export interface D { e: E }"))
      yield* Effect.promise(() => put(root, "e.ts", "export interface E { value: string }"))
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const selected = yield* eligibleNamedPath(root, "a.ts", DEFAULT_DIRECT_FILE_POLICY, observation.rootIdentity)
      if (selected === undefined) throw new Error("root path was not eligible")
      const captureResult = yield* captureStable(root, selected, {}, observation.rootIdentity)
      if (captureResult.status !== "captured") throw new Error("root capture failed")
      const capture = captureResult.capture
      const reads: string[] = []
      const base = {
        root,
        rootIdentity: observation.rootIdentity,
        policy: DEFAULT_DIRECT_FILE_POLICY,
        captureHooks: {
          sourceRead: (path: string) => {
            reads.push(path)
          }
        }
      }
      const exhausted = yield* resolveGraphUnit("a.ts", capture, "A", {
        ...base,
        limits: { ...GRAPH_LIMIT_CEILINGS, work: 3 }
      })
      expect(exhausted && hasOmitted(exhausted.root)).toBe(true)
      expect(reads).toEqual(["b.ts", "b.ts", "d.ts", "d.ts"])
      reads.length = 0
      const enough = yield* resolveGraphUnit("a.ts", capture, "A", {
        ...base,
        limits: { ...GRAPH_LIMIT_CEILINGS, work: 4 }
      })
      expect(enough?.root.references[0]?.kind).toBe("expanded")
      expect(reads).toEqual(["b.ts", "b.ts", "d.ts", "d.ts", "e.ts", "e.ts"])
    })
  )

  it.effect("keeps local and import work under one immutable total", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() =>
        put(root, "a.ts", "import type { B } from './b'; interface C { value: string } interface A { c: C; b: B }")
      )
      yield* Effect.promise(() => put(root, "b.ts", "export interface B { value: string }"))
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const selected = yield* eligibleNamedPath(root, "a.ts", DEFAULT_DIRECT_FILE_POLICY, observation.rootIdentity)
      if (selected === undefined) throw new Error("root path was not eligible")
      const captureResult = yield* captureStable(root, selected, {}, observation.rootIdentity)
      if (captureResult.status !== "captured") throw new Error("root capture failed")
      const capture = captureResult.capture
      const reads: string[] = []
      const base = {
        root,
        rootIdentity: observation.rootIdentity,
        policy: DEFAULT_DIRECT_FILE_POLICY,
        captureHooks: {
          sourceRead: (path: string) => {
            reads.push(path)
          }
        }
      }
      const exhausted = yield* resolveGraphUnit("a.ts", capture, "A", {
        ...base,
        limits: { ...GRAPH_LIMIT_CEILINGS, work: 1 }
      })
      expect(exhausted && hasOmitted(exhausted.root)).toBe(true)
      expect(reads).toEqual([])
      const sufficient = yield* resolveGraphUnit("a.ts", capture, "A", {
        ...base,
        limits: { ...GRAPH_LIMIT_CEILINGS, work: 2 }
      })
      expect(sufficient?.root.references.map((edge) => edge.kind)).toEqual(["expanded", "expanded"])
      expect(reads).toEqual(["b.ts", "b.ts"])
    })
  )

  it.effect("accepts a complete local unit when the graph has zero remaining work", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "a.ts", "interface C { value: string } interface A { c: C }"))
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const selected = yield* eligibleNamedPath(root, "a.ts", DEFAULT_DIRECT_FILE_POLICY, observation.rootIdentity)
      if (selected === undefined) throw new Error("root path was not eligible")
      const captureResult = yield* captureStable(root, selected, {}, observation.rootIdentity)
      if (captureResult.status !== "captured") throw new Error("root capture failed")
      const capture = captureResult.capture
      const complete = yield* resolveGraphUnit("a.ts", capture, "A", {
        root,
        rootIdentity: observation.rootIdentity,
        policy: DEFAULT_DIRECT_FILE_POLICY,
        limits: { ...GRAPH_LIMIT_CEILINGS, work: 1 }
      })
      expect(complete?.root.references[0]).toMatchObject({
        kind: "expanded",
        node: { artifact: { id: "a.ts:interface:C" } }
      })
    })
  )

  it.effect("applies the outgoing target cap per source file across A to B to C", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b'; interface A { b: B }"))
      yield* Effect.promise(() => put(root, "b.ts", "import type { C } from './c'; export interface B { c: C }"))
      yield* Effect.promise(() => put(root, "c.ts", "export interface C { value: string }"))
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const selected = yield* eligibleNamedPath(root, "a.ts", DEFAULT_DIRECT_FILE_POLICY, observation.rootIdentity)
      if (selected === undefined) throw new Error("root path was not eligible")
      const captureResult = yield* captureStable(root, selected, {}, observation.rootIdentity)
      if (captureResult.status !== "captured") throw new Error("root capture failed")
      const capture = captureResult.capture
      const unit = yield* resolveGraphUnit("a.ts", capture, "A", {
        root,
        rootIdentity: observation.rootIdentity,
        policy: DEFAULT_DIRECT_FILE_POLICY,
        limits: { ...GRAPH_LIMIT_CEILINGS, outgoingEdges: 1 }
      })
      expect(unit?.root.references[0]).toMatchObject({
        kind: "expanded",
        node: {
          artifact: { id: "b.ts:interface:B" },
          references: [{ kind: "expanded", node: { artifact: { id: "c.ts:interface:C" } } }]
        }
      })
      for (const tighter of [{ depth: 1 }, { work: 1 }, { treeBytes: 1 }] as const) {
        const denied = yield* resolveGraphUnit("a.ts", capture, "A", {
          root,
          rootIdentity: observation.rootIdentity,
          policy: DEFAULT_DIRECT_FILE_POLICY,
          limits: { ...GRAPH_LIMIT_CEILINGS, outgoingEdges: 1, ...tighter }
        })
        expect(denied === undefined || hasOmitted(denied.root)).toBe(true)
      }
    })
  )

  it.effect("rejects two distinct outgoing targets from one supporting file", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b'; interface A { b: B }"))
      yield* Effect.promise(() =>
        put(
          root,
          "b.ts",
          "import type { C } from './c'; import type { D } from './d'; export interface B { c: C; d: D }"
        )
      )
      yield* Effect.promise(() => put(root, "c.ts", "export interface C { value: string }"))
      yield* Effect.promise(() => put(root, "d.ts", "export interface D { value: string }"))
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const selected = yield* eligibleNamedPath(root, "a.ts", DEFAULT_DIRECT_FILE_POLICY, observation.rootIdentity)
      if (selected === undefined) throw new Error("root path was not eligible")
      const captureResult = yield* captureStable(root, selected, {}, observation.rootIdentity)
      if (captureResult.status !== "captured") throw new Error("root capture failed")
      const capture = captureResult.capture
      const reads: string[] = []
      const unit = yield* resolveGraphUnit("a.ts", capture, "A", {
        root,
        rootIdentity: observation.rootIdentity,
        policy: DEFAULT_DIRECT_FILE_POLICY,
        limits: { ...GRAPH_LIMIT_CEILINGS, outgoingEdges: 1 },
        captureHooks: {
          sourceRead: (path) => {
            reads.push(path)
          }
        }
      })
      expect(unit && hasOmitted(unit.root)).toBe(true)
      expect(reads).toEqual(["b.ts", "b.ts"])
    })
  )

  it.effect("does not select a declaration nested in a namespace for the active review", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "a.ts", "namespace N { export interface A { x: string } }"))
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const prepared = yield* prepareObservation(observation, {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules: configuredRules
      })
      expect(
        prepared.outcomes.some(
          (outcome) => outcome.status === "ready" && outcome.prepared.input.declaration.name === "A"
        )
      ).toBe(false)
    })
  )

  it("does not select a declaration nested in a namespace as a direct graph root", () => {
    expect(inspectGraphFile("a.ts", "namespace N { export interface A { x: string } }")).toBeUndefined()
  })

  it.effect("applies the evidence-tree limit to a large one-file declaration", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "a.ts", `type A = "${"x".repeat(24_000)}";\n`))
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const prepared = yield* prepareObservation(observation, {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules: configuredRules
      })
      expect(
        prepared.outcomes.some(
          (outcome) => outcome.status === "ready" && outcome.prepared.input.declaration.name === "A"
        )
      ).toBe(false)
    })
  )

  it.effect("expands allowed imported evidence and omits excluded supporting source", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b'; interface A { b: B }"))
      yield* Effect.promise(() => put(root, "b.ts", "export interface B { value: string }"))
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
      expect(observation).toBeDefined()
      if (observation === undefined) return
      const base = {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules: candidateRules,
        inputContract: TYPE_INPUT_CONTRACT
      } as const
      const prepared = yield* prepareObservation(observation, base)
      const a = prepared.outcomes.find((outcome) => outcome.status === "ready")
      expect(a?.status).toBe("ready")
      if (a?.status !== "ready") return
      expect(a.prepared.input.unit.root.references[0]).toMatchObject({
        kind: "expanded",
        node: { artifact: { id: "b.ts:interface:B" } }
      })
      const reads: string[] = []
      const excluded = yield* prepareObservation(observation, {
        ...base,
        policy: { includes: ["a.ts"], excludes: [] },
        captureHooks: {
          sourceRead: (path) => {
            reads.push(path)
          }
        }
      })
      expect(excluded.outcomes.some((outcome) => outcome.status === "ready")).toBe(false)
      expect(reads).toEqual(["a.ts", "a.ts"])
    })
  )

  it.effect("reviews a root-only rule with an excluded import marked as omitted", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b'; interface A { b: B }"))
      yield* Effect.promise(() => put(root, "b.ts", "export interface B { secret: string }"))
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const reads: string[] = []
      const prepared = yield* prepareObservation(observation, {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules: rootOnlyRules,
        inputContract: TYPE_INPUT_CONTRACT,
        policy: { includes: ["a.ts"], excludes: ["b.ts"] },
        captureHooks: {
          sourceRead: (path) => {
            reads.push(path)
          }
        }
      })
      const ready = prepared.outcomes.find((outcome) => outcome.status === "ready")
      expect(ready?.status).toBe("ready")
      if (ready?.status !== "ready") return
      expect(ready.prepared.input.completeness).toBe("incomplete-irrelevant")
      expect(preparedProviderInput(ready.prepared)?.evidence.edges).toContainEqual({
        from: "a.ts:interface:A",
        kind: "omitted",
        symbol: "B",
        reason: "unavailable",
        order: 0
      })
      expect(JSON.stringify(preparedProviderInput(ready.prepared))).not.toContain("secret")
      expect(reads).toEqual(["a.ts", "a.ts"])
      expect(
        yield* preparedUnitStillCurrent(observation, ready.prepared, {
          controlledWriter: true,
          advicee: observation.advicee,
          settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
          rules: rootOnlyRules,
          inputContract: TYPE_INPUT_CONTRACT,
          policy: { includes: ["a.ts"], excludes: ["b.ts"] }
        })
      ).toBe(true)
      const evaluated = yield* evaluatePrepared(ready.prepared).pipe(
        Effect.provide(
          controlledDecisionModelLayer({ answers: { "root-only-shape": { _tag: "Probability", probability: 0.91 } } })
        )
      )
      expect(evaluated.status).toBe("evaluated")
    })
  )

  it.effect("keeps a later resolved import when an earlier import is missing", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() =>
        put(
          root,
          "a.ts",
          "import type { B } from './missing'; import type { C } from './c'; interface A { b: B; c: C }"
        )
      )
      yield* Effect.promise(() => put(root, "c.ts", "export interface C { value: string }"))
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const prepared = yield* prepareObservation(observation, {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules: rootOnlyRules,
        inputContract: TYPE_INPUT_CONTRACT
      })
      const ready = prepared.outcomes.find((outcome) => outcome.status === "ready")
      expect(ready?.status).toBe("ready")
      if (ready?.status !== "ready") return
      expect(ready.prepared.input.unit.root.references.map((reference) => reference.kind)).toEqual([
        "omitted",
        "expanded"
      ])
      expect(preparedProviderInput(ready.prepared)?.evidence.nodes.map((node) => node.id)).toEqual(["c.ts:interface:C"])
    })
  )

  it.effect("does not read C when A imports B and B imports excluded C", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b'; interface A { b: B }"))
      yield* Effect.promise(() => put(root, "b.ts", "import type { C } from './c'; export interface B { c: C }"))
      yield* Effect.promise(() => put(root, "c.ts", "export interface C { value: string }"))
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
      expect(observation).toBeDefined()
      if (observation === undefined) return
      const reads: string[] = []
      const prepared = yield* prepareObservation(observation, {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules: candidateRules,
        inputContract: TYPE_INPUT_CONTRACT,
        policy: { includes: ["a.ts", "b.ts"], excludes: ["c.ts"] },
        captureHooks: {
          sourceRead: (path) => {
            reads.push(path)
          }
        }
      })
      expect(prepared.outcomes.some((outcome) => outcome.status === "ready")).toBe(false)
      expect(reads).toEqual(["a.ts", "a.ts", "b.ts", "b.ts"])
    })
  )

  it.effect("captures a source above the old 32 KiB limit when its evidence tree fits", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "a.ts", `${"/".repeat(40_000)}\ninterface A { value: string }`))
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
      expect(observation).toBeDefined()
      if (observation === undefined) return
      const prepared = yield* prepareObservation(observation, {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules: candidateRules,
        inputContract: TYPE_INPUT_CONTRACT
      })
      expect(prepared.outcomes.some((outcome) => outcome.status === "ready")).toBe(true)
    })
  )
  it.effect("resolves inline type imports and TypeScript sources named through .js", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() =>
        put(root, "a.ts", "import { type B as Renamed } from './b.js'; interface A { b: Renamed }")
      )
      yield* Effect.promise(() => put(root, "b.ts", "export interface B { value: string }"))
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const prepared = yield* prepareObservation(observation, {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules: candidateRules,
        inputContract: TYPE_INPUT_CONTRACT
      })
      expect(prepared.outcomes.some((outcome) => outcome.status === "ready")).toBe(true)
    })
  )
  it.effect("closes a cross-file cycle with an included root reference", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b'; export interface A { b: B }"))
      yield* Effect.promise(() => put(root, "b.ts", "import type { A } from './a'; export interface B { a: A }"))
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const prepared = yield* prepareObservation(observation, {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules: candidateRules,
        inputContract: TYPE_INPUT_CONTRACT
      })
      const a = prepared.outcomes.find((outcome) => outcome.status === "ready")
      expect(a?.status).toBe("ready")
      if (a?.status !== "ready") return
      const b = a.prepared.input.unit.root.references[0]
      expect(b?.kind).toBe("expanded")
      if (b?.kind === "expanded")
        expect(b.node.references[0]).toMatchObject({ kind: "included", target: "a.ts:interface:A" })
    })
  )
  it.effect("does not treat a private declaration in another file as imported evidence", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b'; interface A { b: B }"))
      yield* Effect.promise(() => put(root, "b.ts", "interface B { value: string }"))
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const prepared = yield* prepareObservation(observation, {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules: candidateRules,
        inputContract: TYPE_INPUT_CONTRACT
      })
      expect(prepared.outcomes.some((outcome) => outcome.status === "ready")).toBe(false)
    })
  )
  it.effect("refuses a fifth local edge even when the encoded tree fits", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      const source =
        "import type { External } from './unused';\n" +
        Array.from({ length: 6 }, (_, i) => `interface T${i} { next: ${i === 5 ? "string" : `T${i + 1}`} }`).join("\n")
      yield* Effect.promise(() => put(root, "a.ts", source))
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const prepared = yield* prepareObservation(observation, {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules: candidateRules,
        inputContract: TYPE_INPUT_CONTRACT
      })
      expect(
        prepared.outcomes.some(
          (outcome) => outcome.status === "ready" && outcome.prepared.input.declaration.name === "T0"
        )
      ).toBe(false)
      expect(
        prepared.outcomes.some(
          (outcome) => outcome.status === "ready" && outcome.prepared.input.declaration.name === "T1"
        )
      ).toBe(true)
    })
  )
  it.effect("stops graph analysis at its deadline before reading support", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b'; interface A { b: B }"))
      yield* Effect.promise(() => put(root, "b.ts", "export interface B { value: string }"))
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const reads: string[] = []
      let clock = 0
      const prepared = yield* prepareObservation(observation, {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules: candidateRules,
        inputContract: TYPE_INPUT_CONTRACT,
        graphNow: () => {
          const value = clock
          clock += 5_000
          return value
        },
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
  it.effect("shares one stable supporting capture across independently edited roots", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() =>
        put(root, "a.ts", "import type { B } from './b'; interface A { b: B }\ninterface D { b: B }")
      )
      yield* Effect.promise(() => put(root, "b.ts", "export interface B { value: string }"))
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const reads: string[] = []
      const prepared = yield* prepareObservation(observation, {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules: candidateRules,
        inputContract: TYPE_INPUT_CONTRACT,
        captureHooks: {
          sourceRead: (path) => {
            reads.push(path)
          }
        }
      })
      expect(prepared.outcomes.filter((outcome) => outcome.status === "ready")).toHaveLength(2)
      expect(reads.filter((path) => path === "b.ts")).toHaveLength(2)
    })
  )
  it.effect("caps the whole observation at 64 graph units", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() =>
        put(root, "a.ts", Array.from({ length: 64 }, (_, i) => `type T${i} = number`).join("\n"))
      )
      yield* Effect.promise(() => put(root, "b.ts", "type Extra = number"))
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts", "b.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const prepared = yield* prepareObservation(observation, {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules: candidateRules,
        inputContract: TYPE_INPUT_CONTRACT
      })
      expect(prepared.outcomes.filter((outcome) => outcome.status === "ready")).toHaveLength(64)
      expect(
        prepared.outcomes.some((outcome) => outcome.status === "ready" && outcome.prepared.input.path === "b.ts")
      ).toBe(false)
    })
  )
})
