import { it } from "@effect/vitest"
import { expect } from "vitest"
import { Deferred, Effect, Fiber } from "effect"
import { DirectHookSubmission, submitDirectHookOutput } from "./direct-hook-output.ts"
import { HookOutput } from "./hook-output.ts"
import { residentPaths } from "./paths.ts"
import type { CollectedAdvice } from "./client.ts"

const advice: CollectedAdvice = {
  output: { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "finding" } },
  token: "original-token",
  lifetime: "original-owner",
  paths: residentPaths("/fixture/resident"),
  root: "/fixture",
  advicee: {
    host: "claude-code",
    hostVersion: "2.1.218",
    sessionId: "session",
    turnId: null,
    toolUseId: "edit",
    subagentId: null
  },
  activityPath: undefined,
  findingCount: 1
}
const output = { value: advice.output, collected: advice }
const options = { composed: true, claude: true, deadlineAt: 4_000 }
const unused = () => Effect.die("unexpected submission port")
const service = (ports: Partial<DirectHookSubmission["Service"]>) =>
  DirectHookSubmission.of({
    begin: unused,
    release: unused,
    acknowledge: unused,
    writeCodex: unused,
    record: unused,
    ...ports
  })

it.effect("releases a refused admission once without writing or acknowledging", () =>
  Effect.gen(function* () {
    let released = 0
    const submission = service({
      begin: () => Effect.succeed(false),
      release: (item) =>
        Effect.sync(() => {
          expect(item).toBe(advice)
          released += 1
          return true
        })
    })
    const result = yield* submitDirectHookOutput(output, options).pipe(
      Effect.provideService(DirectHookSubmission, submission),
      Effect.provideService(HookOutput, HookOutput.of({ write: unused, writeEncoded: unused }))
    )
    expect(result).toBe("error")
    expect(released).toBe(1)
  })
)

it.effect("releases the original lease when interrupted before output can start", () =>
  Effect.gen(function* () {
    const beginning = yield* Deferred.make<void>()
    let released = 0
    const submission = service({
      begin: () => Deferred.succeed(beginning, undefined).pipe(Effect.andThen(Effect.never)),
      release: () =>
        Effect.sync(() => {
          released += 1
          return true
        })
    })
    const submitting = yield* submitDirectHookOutput(output, options).pipe(
      Effect.provideService(DirectHookSubmission, submission),
      Effect.provideService(HookOutput, HookOutput.of({ write: unused, writeEncoded: unused })),
      Effect.forkChild
    )
    yield* Deferred.await(beginning)
    yield* Fiber.interrupt(submitting)
    expect(released).toBe(1)
  })
)

it.effect("retains uncertainty when interrupted after output starts", () =>
  Effect.gen(function* () {
    const writing = yield* Deferred.make<void>()
    let releases = 0
    let acknowledged = 0
    const submission = service({
      begin: () => Effect.succeed(true),
      release: () =>
        Effect.sync(() => {
          releases += 1
          return true
        }),
      acknowledge: () =>
        Effect.sync(() => {
          acknowledged += 1
          return true
        })
    })
    const submitting = yield* submitDirectHookOutput(output, options).pipe(
      Effect.provideService(DirectHookSubmission, submission),
      Effect.provideService(
        HookOutput,
        HookOutput.of({
          write: unused,
          writeEncoded: () => Deferred.succeed(writing, undefined).pipe(Effect.andThen(Effect.never))
        })
      ),
      Effect.forkChild
    )
    yield* Deferred.await(writing)
    yield* Fiber.interrupt(submitting)
    expect(releases).toBe(0)
    expect(acknowledged).toBe(0)
  })
)

it.effect("releases a reported write error without recording submission or acknowledging", () =>
  Effect.gen(function* () {
    let released = 0
    const submission = service({
      begin: () => Effect.succeed(true),
      release: () =>
        Effect.sync(() => {
          released += 1
          return true
        })
    })
    const result = yield* submitDirectHookOutput(output, options).pipe(
      Effect.provideService(DirectHookSubmission, submission),
      Effect.provideService(HookOutput, HookOutput.of({ write: unused, writeEncoded: () => Effect.succeed("error") }))
    )
    expect(result).toBe("error")
    expect(released).toBe(1)
  })
)

it.effect("records a completed write before acknowledging its originating owner", () =>
  Effect.gen(function* () {
    const events: Array<string> = []
    const submission = service({
      begin: () => Effect.succeed(true),
      record: (item) =>
        Effect.sync(() => {
          expect(item).toBe(advice)
          events.push("record")
        }),
      acknowledge: (item) =>
        Effect.sync(() => {
          expect(item.lifetime).toBe("original-owner")
          events.push("acknowledge")
          return true
        })
    })
    const result = yield* submitDirectHookOutput(output, options).pipe(
      Effect.provideService(DirectHookSubmission, submission),
      Effect.provideService(
        HookOutput,
        HookOutput.of({
          write: unused,
          writeEncoded: (encoded) =>
            Effect.sync(() => {
              expect(encoded).toContain("finding")
              events.push("write")
              return "written" as const
            })
        })
      )
    )
    expect(result).toBe("written")
    expect(events).toEqual(["write", "record", "acknowledge"])
  })
)

it.effect("leaves a timed-out write unacknowledged for conservative resident recovery", () =>
  Effect.gen(function* () {
    const result = yield* submitDirectHookOutput(output, options).pipe(
      Effect.provideService(DirectHookSubmission, service({ begin: () => Effect.succeed(true) })),
      Effect.provideService(
        HookOutput,
        HookOutput.of({ write: unused, writeEncoded: () => Effect.succeed("timed-out") })
      )
    )
    expect(result).toBe("timed-out")
  })
)
