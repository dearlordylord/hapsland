import { randomUUID } from "node:crypto"
import { it } from "@effect/vitest"
import { expect } from "vitest"
import { Deferred, Effect } from "effect"
import { makeInspectionWriterClient } from "./inspection-writer-client.ts"
import { InspectionSubmissionObservation } from "../inspection/writer.ts"
import { submitDirectHookOutput, DirectHookSubmission } from "./direct-hook-output.ts"
import { HookOutput, makeHookOutput } from "./hook-output.ts"
import { advicee } from "../direct-event/test-fixtures.ts"
import { residentPaths } from "./paths.ts"
import type { ResidentRequest } from "./protocol.ts"

const attempt = () => ({
  batchId: "original",
  attemptId: randomUUID(),
  endpoint: "/fixture/runtime/resident.sock",
  lifetime: "owner",
  root: "/fixture",
  advicee: advicee(),
  findingCount: 1,
  noticeOnly: false,
  recording: true as const
})

it.effect("submits native output while optional reporting is stalled and refuses unrequested capture", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const reporting = yield* makeInspectionWriterClient(() =>
        Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never))
      )
      const { recording: _recording, ...disabled } = attempt()
      expect(reporting.forAttempt(disabled)).toBeUndefined()
      const observer = reporting.forAttempt(attempt())
      if (!observer) throw new Error("missing opted-in reporter")
      observer.observe({ state: "ready" })
      yield* Deferred.await(started)
      const value = {
        hookSpecificOutput: { hookEventName: "PostToolUse" as const, additionalContext: "Inspect 日本語\r\n\tcases" }
      }
      const bytes: string[] = []
      const result = yield* submitDirectHookOutput(
        {
          value,
          collected: {
            output: value,
            token: "original",
            lifetime: "owner",
            root: "/fixture",
            advicee: advicee(),
            paths: residentPaths("/fixture/runtime"),
            activityPath: undefined,
            findingCount: 1,
            inspectionReporting: true
          }
        },
        { composed: false, claude: true, deadlineAt: 10000 }
      ).pipe(
        Effect.provideService(InspectionSubmissionObservation, reporting),
        Effect.provideService(
          HookOutput,
          makeHookOutput({
            writable: () => true,
            write: (encoded, complete) => {
              bytes.push(encoded)
              complete()
            },
            onError: () => () => {},
            settleErrors: () => Effect.void
          })
        ),
        Effect.provideService(DirectHookSubmission, {
          begin: () => Effect.die("unexpected begin"),
          release: () => Effect.die("unexpected release"),
          writeCodex: () => Effect.die("unexpected Codex writer"),
          record: () => Effect.void,
          acknowledge: () => Effect.succeed(false)
        })
      )
      expect(result).toBe("written")
      expect(bytes).toEqual([JSON.stringify(value) + "\n"])
    })
  )
)

it.effect.each([
  { items: 2, bytes: 4096 },
  { items: 16, bytes: 1024 }
])("bounds queued and active reports (%j) without retaining oversized source", (limits) =>
  Effect.scoped(
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const finished = yield* Deferred.make<void>()
      const sent: ResidentRequest[] = []
      const reporting = yield* makeInspectionWriterClient(
        (request) =>
          Effect.gen(function* () {
            sent.push(request)
            if (sent.length === 1) {
              yield* Deferred.succeed(started, undefined)
              yield* Deferred.await(release)
            }
            if (sent.length === 2) yield* Deferred.succeed(finished, undefined)
          }),
        limits
      )
      const first = reporting.forAttempt(attempt())
      if (!first) throw new Error("missing first reporter")
      first.observe({ state: "ready" })
      yield* Deferred.await(started)
      const next = reporting.forAttempt(attempt())
      if (!next) throw new Error("missing next reporter")
      next.observe({ state: "written", encoded: "oversized source".repeat(2000) })
      for (let index = 0; index < 100; index++)
        reporting.forAttempt(attempt())?.observe({ state: "written", encoded: "overflow source" })
      yield* Deferred.succeed(release, undefined)
      yield* Deferred.await(finished)
      expect(sent).toHaveLength(2)
      expect(sent[1]).toMatchObject({ state: "written", outputMissing: "oversized" })
      expect(sent[1]).not.toHaveProperty("encoded")
      expect(JSON.stringify(sent)).not.toContain("oversized source")
      expect(JSON.stringify(sent)).not.toContain("overflow source")
    })
  )
)
