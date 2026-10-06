import { it } from "@effect/vitest"
import { expect } from "vitest"
import { Deferred, Effect, Fiber } from "effect"
import { ComposedHookRuntime, runComposedHookEffect } from "./composed-hook.ts"
import { HookOutput } from "./hook-output.ts"
import type { DirectAdvicee } from "../direct-event/observation.ts"
import { ResidentIpcError, type AdviceeCollectionOutcome } from "./client.ts"
import { residentPaths } from "./paths.ts"
import { hookMonotonicMillis } from "./hook-clock.ts"
import * as TestClock from "effect/testing/TestClock"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const input = (kind: "stop" | "background", host: "claude-code" | "codex-cli" = "claude-code") => ({
  kind,
  host,
  event: {},
  statePath: "/fixture/state",
  activityPath: "/fixture/activity"
})
const hookAdvicee = {
  host: "claude-code",
  hostVersion: "2.1.218",
  sessionId: "session",
  turnId: null,
  toolUseId: "tool",
  subagentId: null
} as const
const unused = () => Effect.die("unexpected hook port")
const runtime = (
  client: Partial<ComposedHookRuntime["Service"]["client"]>,
  advicee: Extract<DirectAdvicee, { host: "codex-cli" | "claude-code" }> = hookAdvicee
) =>
  ComposedHookRuntime.of({
    now: Effect.succeed(0),
    startedAt: 0,
    identity: () => Effect.succeed({ root: "/fixture", advicee }),
    client: {
      acknowledgeAdviceEffect: unused,
      registerComposedEditEffect: unused,
      composedStopBoundaryEffect: unused,
      beginComposedSubmissionEffect: unused,
      claimComposedBackgroundEffect: unused,
      collectAdviceeOutcomeEffect: unused,
      makeResidentDispatchContextEffect: () =>
        Effect.succeed({
          statePath: "/fixture/state",
          activityPath: "/fixture/activity",
          userConfigPath: null,
          credential: null,
          controlled: {}
        }),
      markComposedUserPromptEffect: unused,
      releaseComposedSubmissionEffect: unused,
      releaseComposedBackgroundEffect: unused,
      ...client
    }
  })
const finding: AdviceeCollectionOutcome = {
  status: "advice",
  advice: {
    output: { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "review finding" } },
    token: "advice",
    lifetime: "origin",
    paths: residentPaths("/fixture/resident"),
    root: "/fixture",
    advicee: hookAdvicee,
    activityPath: undefined,
    findingCount: 1
  }
}

it.effect("counts startup elapsed time against the unchanged absolute Stop budget", () =>
  Effect.gen(function* () {
    const finished: Array<boolean> = []
    const deadlines: Array<number> = []
    const service = runtime({
      composedStopBoundaryEffect: (operation, _root, _advicee, _token, close = false) =>
        Effect.sync(() => {
          if (operation === "finish-stop") finished.push(close)
          return true
        })
    })
    yield* TestClock.adjust("104050 millis")
    yield* runComposedHookEffect(input("stop")).pipe(
      Effect.provideService(ComposedHookRuntime, { ...service, startedAt: 100_000, now: hookMonotonicMillis }),
      Effect.provideService(
        HookOutput,
        HookOutput.of({
          writeEncoded: unused,
          write: (_value, deadlineAt) =>
            Effect.sync(() => {
              deadlines.push(deadlineAt)
              return "written" as const
            })
        })
      )
    )
    expect(deadlines).toEqual([104_200])
    expect(finished).toEqual([true])
  })
)

it.effect("finishes the acquired Stop attempt when collection is interrupted", () =>
  Effect.gen(function* () {
    const collecting = yield* Deferred.make<void>()
    const finished: Array<boolean> = []
    const service = runtime({
      composedStopBoundaryEffect: (operation, _root, _advicee, _token, close = false) =>
        Effect.sync(() => {
          if (operation === "finish-stop") finished.push(close)
          return true
        }),
      collectAdviceeOutcomeEffect: () => Deferred.succeed(collecting, undefined).pipe(Effect.andThen(Effect.never))
    })
    const hook = yield* runComposedHookEffect(input("stop")).pipe(
      Effect.provideService(ComposedHookRuntime, service),
      Effect.provideService(HookOutput, HookOutput.of({ writeEncoded: unused, write: unused })),
      Effect.forkChild
    )
    yield* Deferred.await(collecting)
    yield* Fiber.interrupt(hook)
    expect(finished).toEqual([true])
  })
)

it.effect("releases a background claim even when interrupted during its acquisition acknowledgement", () =>
  Effect.gen(function* () {
    const claiming = yield* Deferred.make<void>()
    const acknowledged = yield* Deferred.make<void>()
    let releases = 0
    const service = runtime(
      {
        claimComposedBackgroundEffect: () =>
          Effect.gen(function* () {
            yield* Deferred.succeed(claiming, undefined)
            yield* Deferred.await(acknowledged)
            return true
          }),
        releaseComposedBackgroundEffect: () =>
          Effect.sync(() => {
            releases += 1
            return true
          }),
        collectAdviceeOutcomeEffect: () => Effect.never
      },
      {
        host: "codex-cli",
        hostVersion: "0.155.1",
        sessionId: "session",
        turnId: "turn",
        toolUseId: "tool",
        subagentId: null
      }
    )
    const hook = yield* runComposedHookEffect(input("background", "codex-cli")).pipe(
      Effect.provideService(ComposedHookRuntime, service),
      Effect.provideService(HookOutput, HookOutput.of({ writeEncoded: unused, write: unused })),
      Effect.forkChild
    )
    yield* Deferred.await(claiming)
    const interrupting = yield* Fiber.interrupt(hook).pipe(Effect.forkChild({ startImmediately: true }))
    yield* Deferred.succeed(acknowledged, undefined)
    yield* Fiber.join(interrupting)
    expect(releases).toBe(1)
  })
)

it.effect("collects accepted Bash advice without registering edits or starting review work", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.acquireRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "hapsland-bash-delivery-"))),
      (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true }))
    )
    const calls: string[] = []
    const advicee = {
      host: "codex-cli",
      hostVersion: "0.155.1",
      sessionId: "session",
      turnId: "turn",
      toolUseId: "bash",
      subagentId: null
    } as const
    const accepted: AdviceeCollectionOutcome = { status: "advice", advice: { ...finding.advice, advicee } }
    const service = runtime(
      {
        claimComposedBackgroundEffect: () =>
          Effect.sync(() => {
            calls.push("claim")
            return true
          }),
        collectAdviceeOutcomeEffect: (_root, target, _dispatch, _paths, mode) =>
          Effect.sync(() => {
            expect(target).toEqual(advicee)
            expect(mode).toBe("ordinary")
            calls.push("collect")
            return accepted
          }),
        beginComposedSubmissionEffect: (_advice, surface) =>
          Effect.sync(() => {
            expect(surface).toBe("background")
            calls.push("submit")
            return true
          }),
        acknowledgeAdviceEffect: () =>
          Effect.sync(() => {
            calls.push("acknowledge")
            return true
          }),
        releaseComposedBackgroundEffect: () =>
          Effect.sync(() => {
            calls.push("release")
            return true
          })
      },
      advicee
    )
    yield* runComposedHookEffect({
      ...input("background", "codex-cli"),
      event: { hook_event_name: "PostToolUse", tool_name: "Bash" },
      activityPath: join(directory, "activity")
    }).pipe(
      Effect.provideService(ComposedHookRuntime, service),
      Effect.provideService(
        HookOutput,
        HookOutput.of({
          writeEncoded: unused,
          write: (value) =>
            Effect.sync(() => {
              expect(value).toEqual(accepted.advice.output)
              calls.push("write")
              return "written" as const
            })
        })
      )
    )
    // All admission/prompt/Stop ports remain the failing `unused` implementations.
    expect(calls).toEqual(["claim", "collect", "submit", "write", "acknowledge", "release"])
  }).pipe(Effect.scoped)
)

it.effect("preserves Stop continuation when output observation is interrupted after submission starts", () =>
  Effect.gen(function* () {
    const writing = yield* Deferred.make<void>()
    const finished: Array<boolean> = []
    const service = runtime({
      composedStopBoundaryEffect: (operation, _root, _advicee, _token, close = false) =>
        Effect.sync(() => {
          if (operation === "finish-stop") finished.push(close)
          return true
        }),
      collectAdviceeOutcomeEffect: () => Effect.succeed(finding),
      beginComposedSubmissionEffect: () => Effect.succeed(true)
    })
    const hook = yield* runComposedHookEffect(input("stop")).pipe(
      Effect.provideService(ComposedHookRuntime, service),
      Effect.provideService(
        HookOutput,
        HookOutput.of({
          writeEncoded: unused,
          write: () => Deferred.succeed(writing, undefined).pipe(Effect.andThen(Effect.never))
        })
      ),
      Effect.forkChild
    )
    yield* Deferred.await(writing)
    yield* Fiber.interrupt(hook)
    expect(finished).toEqual([false])
  })
)

it.effect("releases a refused submission and closes its Stop attempt", () =>
  Effect.gen(function* () {
    const finished: Array<boolean> = []
    let releases = 0
    const service = runtime({
      composedStopBoundaryEffect: (operation, _root, _advicee, _token, close = false) =>
        Effect.sync(() => {
          if (operation === "finish-stop") finished.push(close)
          return true
        }),
      collectAdviceeOutcomeEffect: () => Effect.succeed(finding),
      beginComposedSubmissionEffect: () => Effect.succeed(true),
      releaseComposedSubmissionEffect: () =>
        Effect.sync(() => {
          releases += 1
          return true
        })
    })
    yield* runComposedHookEffect(input("stop")).pipe(
      Effect.provideService(ComposedHookRuntime, service),
      Effect.provideService(HookOutput, HookOutput.of({ writeEncoded: unused, write: () => Effect.succeed("failed") }))
    )
    expect(releases).toBe(1)
    expect(finished).toEqual([true])
  })
)

it.effect("disables Claude background collection before acquiring any ports", () =>
  runComposedHookEffect(input("background")).pipe(
    Effect.provideService(ComposedHookRuntime, { ...runtime({}), identity: unused }),
    Effect.provideService(HookOutput, HookOutput.of({ writeEncoded: unused, write: unused }))
  )
)

it.effect("marks prompt identity without starting collection, including unavailable Claude transcripts", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.acquireRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "hapsland-prompt-marker-"))),
      (directory) => Effect.sync(() => rmSync(directory, { recursive: true, force: true }))
    )
    const transcript = join(directory, "transcript")
    yield* Effect.sync(() => writeFileSync(transcript, "native transcript"))
    const markers: Array<string> = []
    const cases = [
      { host: "codex-cli", event: { prompt: "hello", turn_id: "turn" } },
      { host: "codex-cli", event: { prompt: "hello", turn_id: "" } },
      { host: "claude-code", event: { prompt: "hello" } },
      { host: "claude-code", event: { prompt: "hello", transcript_path: `${transcript}-missing` } },
      { host: "claude-code", event: { prompt: "hello", transcript_path: transcript } },
      { host: "claude-code", event: { prompt: undefined } }
    ] as const
    for (const entry of cases) {
      let writes = 0
      yield* runComposedHookEffect({ ...input("stop", entry.host), kind: "prompt", event: entry.event }).pipe(
        Effect.provideService(
          ComposedHookRuntime,
          runtime({
            markComposedUserPromptEffect: (_root, _advicee, marker, _paths, promptDigest) =>
              Effect.sync(() => {
                expect(promptDigest).toMatch(/^[a-f0-9]{64}$/u)
                markers.push(marker)
                return true
              })
          })
        ),
        Effect.provideService(
          HookOutput,
          HookOutput.of({
            writeEncoded: unused,
            write: (value) =>
              Effect.sync(() => {
                expect(value).toEqual({})
                writes++
                return "written" as const
              })
          })
        )
      )
      expect(writes).toBe(1)
    }
    expect(markers).toHaveLength(4)
    expect(new Set(markers).size).toBe(4)
  }).pipe(Effect.scoped)
)

it.effect("registers before-edit evidence without collecting advice", () =>
  Effect.gen(function* () {
    const calls: string[] = []
    yield* runComposedHookEffect({ ...input("stop"), kind: "before-edit" }).pipe(
      Effect.provideService(
        ComposedHookRuntime,
        runtime({
          registerComposedEditEffect: () =>
            Effect.sync(() => {
              calls.push("register")
              return true
            })
        })
      ),
      Effect.provideService(
        HookOutput,
        HookOutput.of({
          writeEncoded: unused,
          write: () =>
            Effect.sync(() => {
              calls.push("quiet")
              return "written" as const
            })
        })
      )
    )
    expect(calls).toEqual(["register", "quiet"])
  })
)

it.effect("closes an empty or unavailable Stop opportunity without attempting submission", () =>
  Effect.gen(function* () {
    for (const outcome of [{ status: "empty" as const }, undefined]) {
      const calls: string[] = []
      yield* runComposedHookEffect(input("stop")).pipe(
        Effect.provideService(
          ComposedHookRuntime,
          runtime({
            composedStopBoundaryEffect: (operation, _root, _advicee, _token, close, _paths, _reason) =>
              Effect.sync(() => {
                calls.push(operation)
                if (operation === "finish-stop") expect(close).toBe(true)
                return true
              }),
            collectAdviceeOutcomeEffect: () =>
              outcome === undefined
                ? Effect.fail(new ResidentIpcError({ message: "fixture unavailable" }))
                : Effect.succeed(outcome)
          })
        ),
        Effect.provideService(
          HookOutput,
          HookOutput.of({
            writeEncoded: unused,
            write: (value) =>
              Effect.sync(() => {
                expect(value).toEqual({})
                calls.push("quiet")
                return "written" as const
              })
          })
        )
      )
      expect(calls).toEqual(["begin-stop", "finish-stop", "quiet"])
    }
  })
)
