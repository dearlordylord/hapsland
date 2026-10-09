import { describe, expect, it } from "vitest"
import * as Effect from "effect/Effect"
import * as Deferred from "effect/Deferred"
import * as Fiber from "effect/Fiber"
import { checkHandoffSources, type HandoffSourceMember } from "@hapsland/review-execution/direct-event/handoff-sources"
import type { CaptureResult, captureStable } from "@hapsland/native-observation/direct-event/capture"

const members = (count: number): HandoffSourceMember[] =>
  Array.from({ length: count }, (_, index) => ({
    id: String(index),
    root: "/project",
    fingerprints: [{ path: "types.ts", contentHash: "original", byteLength: 7 }]
  }))

const captured = (contentHash: string): CaptureResult => ({
  status: "captured",
  capture: { contentHash, byteLength: 7, bytes: new Uint8Array(7), text: "source!", metadata: "descriptor" }
})

// The cache delegates semantic freshness to its caller. These fixtures use a
// small fingerprint predicate to isolate the capture lifetime and sharing laws.
const checkSources = (batch: readonly HandoffSourceMember[], options: { captureSource: typeof captureStable }) =>
  checkHandoffSources(batch, {
    ...options,
    verifyMember: (member, capture) =>
      Effect.gen(function* () {
        let matches = (member.fingerprints?.length ?? 0) > 0
        for (const fingerprint of member.fingerprints ?? []) {
          const result = yield* capture(
            member.root,
            { relativePath: fingerprint.path, absolutePath: `${member.root}/${fingerprint.path}` },
            {},
            member.rootIdentity
          )
          matches &&=
            result.status === "captured" &&
            result.capture.contentHash === fingerprint.contentHash &&
            result.capture.byteLength === fingerprint.byteLength
        }
        return matches
      })
  })

describe("final source verification", () => {
  it("shares one stable capture among seven findings in one delivery", async () => {
    const reads: string[] = []
    const current = await Effect.runPromise(
      checkSources(members(7), {
        captureSource: (_root, path) =>
          Effect.sync(() => {
            reads.push(path.relativePath)
            return captured("original")
          })
      })
    )
    expect([...current.values()]).toEqual([true, true, true, true, true, true, true])
    expect(reads).toEqual(["types.ts"])
  })

  it("rereads for a later delivery of three findings after delivering four", async () => {
    let reads = 0
    let hash = "original"
    const options = {
      captureSource: () =>
        Effect.sync(() => {
          reads++
          return captured(hash)
        })
    }
    expect([...(await Effect.runPromise(checkSources(members(4), options))).values()]).toEqual([true, true, true, true])
    hash = "changed"
    expect([...(await Effect.runPromise(checkSources(members(3), options))).values()]).toEqual([false, false, false])
    expect(reads).toBe(2)
  })

  it("checks shared supporting files and compares each finding with its own snapshot", async () => {
    const batch = members(2).map((member) => ({
      ...member,
      fingerprints: [...(member.fingerprints ?? []), { path: "shared.ts", contentHash: "original", byteLength: 7 }]
    }))
    const reads: string[] = []
    const current = await Effect.runPromise(
      checkSources(batch, {
        captureSource: (_root, path) =>
          Effect.sync(() => {
            reads.push(path.relativePath)
            return captured(path.relativePath === "shared.ts" ? "changed" : "original")
          })
      })
    )
    expect([...current.values()]).toEqual([false, false])
    expect(reads).toEqual(["types.ts", "shared.ts"])
  })

  it("does not share equal paths across physical roots or accept different expected fingerprints", async () => {
    const [first, second, third] = members(3)
    if (first === undefined || second === undefined || third === undefined) throw new Error("missing fixture member")
    let reads = 0
    const current = await Effect.runPromise(
      checkSources(
        [
          first,
          { ...second, fingerprints: [{ path: "types.ts", contentHash: "older", byteLength: 7 }] },
          { ...third, root: "/other-project" }
        ],
        {
          captureSource: () =>
            Effect.sync(() => {
              reads++
              return captured("original")
            })
        }
      )
    )
    expect([...current.values()]).toEqual([true, false, true])
    expect(reads).toBe(2)
  })

  it("shares an unavailable capture only within its current delivery", async () => {
    let reads = 0
    const options = {
      captureSource: () =>
        Effect.sync((): CaptureResult => {
          reads++
          return {
            status: "unavailable",
            diagnostic: { stage: "capture", code: "capture-unavailable", args: { reason: "missing" } }
          }
        })
    }
    expect([...(await Effect.runPromise(checkSources(members(7), options))).values()]).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false
    ])
    await Effect.runPromise(checkSources(members(1), options))
    expect(reads).toBe(2)
  })

  it("erases the last member's bytes and refuses use after the delivery closes", async () => {
    const snapshot = captured("original")
    if (snapshot.status !== "captured") throw new Error("missing snapshot")
    snapshot.capture.bytes.fill(7)
    let lateCapture: typeof captureStable | undefined
    await Effect.runPromise(
      checkHandoffSources(members(2), {
        captureSource: () => Effect.succeed(snapshot),
        verifyMember: (member, capture) =>
          Effect.gen(function* () {
            lateCapture = capture
            const result = yield* capture(member.root, { relativePath: "types.ts", absolutePath: "/project/types.ts" })
            expect(result.status).toBe("captured")
            expect(snapshot.capture.bytes[0]).toBe(7)
            return true
          })
      })
    )
    expect([...snapshot.capture.bytes]).toEqual(Array(7).fill(0))
    if (lateCapture === undefined) throw new Error("missing capture capability")
    expect(
      (
        await Effect.runPromise(
          lateCapture("/project", { relativePath: "types.ts", absolutePath: "/project/types.ts" })
        )
      ).status
    ).toBe("unavailable")
  })

  it("starts with fresh captures after interruption of a partially checked delivery", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const entered = yield* Deferred.make<void>()
          const reads: string[] = []
          const [member] = members(1)
          if (member === undefined) throw new Error("missing fixture member")
          const checking = yield* checkSources(
            [
              {
                ...member,
                fingerprints: [
                  ...(member.fingerprints ?? []),
                  { path: "shared.ts", contentHash: "original", byteLength: 7 }
                ]
              }
            ],
            {
              captureSource: (_root, path) =>
                Effect.gen(function* () {
                  reads.push(path.relativePath)
                  if (path.relativePath === "shared.ts") {
                    yield* Deferred.succeed(entered, undefined)
                    return yield* Effect.never
                  }
                  return captured("original")
                })
            }
          ).pipe(Effect.forkChild)
          yield* Deferred.await(entered)
          yield* Fiber.interrupt(checking)
          const retried = yield* checkSources(members(1), {
            captureSource: (_root, path) =>
              Effect.sync(() => {
                reads.push(path.relativePath)
                return captured("changed")
              })
          })
          expect([...retried.values()]).toEqual([false])
          expect(reads).toEqual(["types.ts", "shared.ts", "types.ts"])
        })
      )
    )
  })
})
