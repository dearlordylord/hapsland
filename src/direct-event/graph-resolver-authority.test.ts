import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { vi } from "vitest"
import { makeGitFixture, put, addEvent } from "./test-fixtures.ts"
import { adaptCodexAdd } from "./adapter.ts"
import { captureStable } from "./capture.ts"
import { resolveGraphUnit } from "./graph-resolver.ts"
import { DEFAULT_DIRECT_FILE_POLICY, eligibleNamedPath } from "./selection.ts"
import { GRAPH_LIMIT_CEILINGS } from "../configuration/graph-limits.ts"

const gate = vi.hoisted(() => ({
  denyAtLocalWork: 0,
  denyAtDepth: 0,
  observedWork: [] as number[],
  observedDepth: [] as number[],
  measuredCaptures: [] as { sourceBytes: number; reason: string | undefined }[]
}))

vi.mock("../canonical/graph-adapter.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../canonical/graph-adapter.ts")>()
  return {
    ...actual,
    permitLocalGraphFacts: (...args: Parameters<typeof actual.permitLocalGraphFacts>) => {
      gate.observedWork.push(args[1])
      gate.observedDepth.push(args[2])
      return (gate.denyAtLocalWork > 0 && args[1] >= gate.denyAtLocalWork) ||
        (gate.denyAtDepth > 0 && args[2] >= gate.denyAtDepth)
        ? false
        : actual.permitLocalGraphFacts(...args)
    },
    stepImportGraph: (...args: Parameters<typeof actual.stepImportGraph>) => {
      const result = actual.stepImportGraph(...args)
      if (args[1].kind === "captured")
        gate.measuredCaptures.push({
          sourceBytes: args[1].sourceBytes,
          reason: result.command.kind === "unitIncomplete" ? result.command.reason : undefined
        })
      return result
    }
  }
})

describe("checked local graph budget authority", () => {
  it.effect("does not use a partial root when Bend rejects the root capture", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "a.ts", "interface A { missing: Missing }"))
      const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const selected = yield* eligibleNamedPath(root, "a.ts", DEFAULT_DIRECT_FILE_POLICY, observation.rootIdentity)
      if (selected === undefined) throw new Error("root was not eligible")
      const capture = yield* captureStable(root, selected, {}, observation.rootIdentity)
      if (capture === undefined) throw new Error("root capture failed")
      const unit = yield* resolveGraphUnit("a.ts", capture, "A", {
        root,
        rootIdentity: observation.rootIdentity,
        policy: DEFAULT_DIRECT_FILE_POLICY,
        limits: { ...GRAPH_LIMIT_CEILINGS, sourceBytes: 1 }
      })
      expect(unit).toBeUndefined()
    })
  )

  it.effect("obeys a Bend gate denial at measured local work before recursing", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() =>
        put(root, "a.ts", "interface A { b: B } interface B { c: C } interface C { value: string }")
      )
      const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const selected = yield* eligibleNamedPath(root, "a.ts", DEFAULT_DIRECT_FILE_POLICY, observation.rootIdentity)
      if (selected === undefined) throw new Error("root was not eligible")
      const capture = yield* captureStable(root, selected, {}, observation.rootIdentity)
      if (capture === undefined) throw new Error("root capture failed")
      const context = {
        root,
        rootIdentity: observation.rootIdentity,
        policy: DEFAULT_DIRECT_FILE_POLICY,
        limits: GRAPH_LIMIT_CEILINGS
      }
      gate.observedWork.length = 0
      gate.denyAtLocalWork = 1
      try {
        const denied = yield* resolveGraphUnit("a.ts", capture, "A", context)
        expect(denied).toBeUndefined()
        expect(gate.observedWork.length).toBeGreaterThan(0)
        expect(gate.observedWork.every((work) => work === 1)).toBe(true)
      } finally {
        gate.denyAtLocalWork = 0
        gate.observedWork.length = 0
        gate.observedDepth.length = 0
      }
      const allowed = yield* resolveGraphUnit("a.ts", capture, "A", context)
      expect(allowed?.root.references[0]?.kind).toBe("expanded")
      expect(gate.observedWork).toContain(2)
    })
  )

  it.effect("obeys a Bend depth denial before a supporting-file read", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b'; interface A { b: B }"))
      yield* Effect.promise(() => put(root, "b.ts", "export interface B { value: string }"))
      const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const selected = yield* eligibleNamedPath(root, "a.ts", DEFAULT_DIRECT_FILE_POLICY, observation.rootIdentity)
      if (selected === undefined) throw new Error("root was not eligible")
      const capture = yield* captureStable(root, selected, {}, observation.rootIdentity)
      if (capture === undefined) throw new Error("root capture failed")
      const reads: string[] = []
      gate.observedWork.length = 0
      gate.observedDepth.length = 0
      gate.denyAtDepth = 1
      try {
        const denied = yield* resolveGraphUnit("a.ts", capture, "A", {
          root,
          rootIdentity: observation.rootIdentity,
          policy: DEFAULT_DIRECT_FILE_POLICY,
          limits: GRAPH_LIMIT_CEILINGS,
          captureHooks: {
            sourceRead: (path) => {
              reads.push(path)
            }
          }
        })
        expect(denied).toBeUndefined()
        expect(gate.observedDepth.length).toBeGreaterThan(0)
        expect(gate.observedDepth.every((depth) => depth === 1)).toBe(true)
        expect(reads).toEqual([])
      } finally {
        gate.denyAtDepth = 0
        gate.observedDepth.length = 0
      }
    })
  )

  it.effect("sends measured oversized supporting bytes to Bend before parsing", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b'; interface A { b: B }"))
      yield* Effect.promise(() => put(root, "b.ts", "export interface B { value: string }".padEnd(127, " ")))
      const observation = yield* adaptCodexAdd(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const selected = yield* eligibleNamedPath(root, "a.ts", DEFAULT_DIRECT_FILE_POLICY, observation.rootIdentity)
      if (selected === undefined) throw new Error("root was not eligible")
      const capture = yield* captureStable(root, selected, {}, observation.rootIdentity)
      if (capture === undefined) throw new Error("root capture failed")
      const reads: string[] = []
      gate.measuredCaptures.length = 0
      const result = yield* resolveGraphUnit("a.ts", capture, "A", {
        root,
        rootIdentity: observation.rootIdentity,
        policy: DEFAULT_DIRECT_FILE_POLICY,
        limits: { ...GRAPH_LIMIT_CEILINGS, sourceBytes: 80 },
        captureHooks: {
          sourceRead: (path) => {
            reads.push(path)
          }
        },
        captureSource: ((...args: Parameters<typeof captureStable>) =>
          Effect.gen(function* () {
            // Fixture-only capture deliberately bypasses the native configured cap
            // so this test can exercise Bend's measured-overlimit decision.
            const source = yield* captureStable(args[0], args[1], args[2], args[3])
            if (source === undefined) return undefined
            return {
              ...source,
              get text(): string {
                throw new Error("oversized source was parsed")
              }
            }
          })) as typeof captureStable
      })
      expect(result?.root.references[0]).toMatchObject({ kind: "omitted" })
      expect(reads).toEqual(["b.ts", "b.ts"])
      expect(gate.measuredCaptures).toEqual([{ sourceBytes: 127, reason: "ReadLimit" }])
    })
  )
})
