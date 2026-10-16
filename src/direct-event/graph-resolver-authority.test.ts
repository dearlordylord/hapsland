import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { makeGitFixture, put, addEvent } from "@hapsland/build-tooling/test-support/test-fixtures"
import { adaptCodexDirectEvent } from "@hapsland/native-observation/direct-event/adapter"
import { captureStable } from "@hapsland/native-observation/direct-event/capture"
import { resolveCanonicalGraphFixture } from "@hapsland/source-analysis/testing/canonical-graph"
import { DEFAULT_DIRECT_FILE_POLICY, eligibleNamedPath } from "@hapsland/native-observation/direct-event/selection"
import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-limits"

describe("checked local graph budget authority", () => {
  it.effect("does not use a partial root when Bend rejects the root capture", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "a.ts", "interface A { missing: Missing }"))
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const selected = yield* eligibleNamedPath(root, "a.ts", DEFAULT_DIRECT_FILE_POLICY, observation.rootIdentity)
      if (selected === undefined) throw new Error("root was not eligible")
      const captureResult = yield* captureStable(root, selected, {}, observation.rootIdentity)
      if (captureResult.status !== "captured") throw new Error("root capture failed")
      const capture = captureResult.capture
      const unit = yield* resolveCanonicalGraphFixture("a.ts", capture, "A", {
        root,
        rootIdentity: observation.rootIdentity,
        policy: DEFAULT_DIRECT_FILE_POLICY,
        limits: { ...GRAPH_LIMIT_CEILINGS, sourceBytes: 1 }
      })
      expect(unit).toBeUndefined()
    })
  )

  it.effect("obeys the actual Bend local work budget before completing the root", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() =>
        put(root, "a.ts", "interface A { b: B } interface B { c: C } interface C { value: string }")
      )
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const selected = yield* eligibleNamedPath(root, "a.ts", DEFAULT_DIRECT_FILE_POLICY, observation.rootIdentity)
      if (selected === undefined) throw new Error("root was not eligible")
      const captureResult = yield* captureStable(root, selected, {}, observation.rootIdentity)
      if (captureResult.status !== "captured") throw new Error("root capture failed")
      const capture = captureResult.capture
      const context = {
        root,
        rootIdentity: observation.rootIdentity,
        policy: DEFAULT_DIRECT_FILE_POLICY,
        limits: GRAPH_LIMIT_CEILINGS
      }
      const denied = yield* resolveCanonicalGraphFixture("a.ts", capture, "A", {
        ...context,
        limits: { ...GRAPH_LIMIT_CEILINGS, work: 1 }
      })
      expect(denied).toBeUndefined()
      const allowed = yield* resolveCanonicalGraphFixture("a.ts", capture, "A", context)
      expect(allowed?.root.references[0]?.kind).toBe("expanded")
    })
  )

  it.effect("obeys a Bend depth denial before a supporting-file read", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b'; interface A { b: B }"))
      yield* Effect.promise(() => put(root, "b.ts", "export interface B { value: string }"))
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const selected = yield* eligibleNamedPath(root, "a.ts", DEFAULT_DIRECT_FILE_POLICY, observation.rootIdentity)
      if (selected === undefined) throw new Error("root was not eligible")
      const captureResult = yield* captureStable(root, selected, {}, observation.rootIdentity)
      if (captureResult.status !== "captured") throw new Error("root capture failed")
      const capture = captureResult.capture
      const reads: string[] = []
      const denied = yield* resolveCanonicalGraphFixture("a.ts", capture, "A", {
        root,
        rootIdentity: observation.rootIdentity,
        policy: DEFAULT_DIRECT_FILE_POLICY,
        limits: { ...GRAPH_LIMIT_CEILINGS, depth: 0 },
        captureHooks: {
          sourceRead: (path) => {
            reads.push(path)
          }
        }
      })
      expect(denied).toBeUndefined()
      expect(reads).toEqual([])
    })
  )

  it.effect("refuses measured oversized supporting bytes before reading their text", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "a.ts", "import type { B } from './b'; interface A { b: B }"))
      yield* Effect.promise(() => put(root, "b.ts", "export interface B { value: string }".padEnd(127, " ")))
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
      if (observation === undefined) throw new Error("fixture adaptation failed")
      const selected = yield* eligibleNamedPath(root, "a.ts", DEFAULT_DIRECT_FILE_POLICY, observation.rootIdentity)
      if (selected === undefined) throw new Error("root was not eligible")
      const captureResult = yield* captureStable(root, selected, {}, observation.rootIdentity)
      if (captureResult.status !== "captured") throw new Error("root capture failed")
      const capture = captureResult.capture
      const reads: string[] = []
      const measuredCaptures: number[] = []
      const result = yield* resolveCanonicalGraphFixture("a.ts", capture, "A", {
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
            const result = yield* captureStable(args[0], args[1], args[2], args[3])
            if (result.status === "unavailable") return result
            measuredCaptures.push(result.capture.byteLength)
            return {
              status: "captured",
              capture: {
                ...result.capture,
                get text(): string {
                  throw new Error("oversized source was parsed")
                }
              }
            }
          })) as typeof captureStable
      })
      expect(result?.root.references[0]).toMatchObject({ kind: "omitted" })
      expect(reads).toEqual(["b.ts", "b.ts"])
      expect(measuredCaptures).toEqual([127])
    })
  )
})
