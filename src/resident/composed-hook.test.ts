import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Deferred, Effect, Fiber } from "effect";
import { ComposedHookRuntime, runComposedHookEffect } from "./composed-hook.ts";
import { HookOutput } from "./hook-output.ts";
import type { DirectAdvicee } from "../direct-event/model.ts";
import type { AdviceeCollectionOutcome } from "./client.ts";
import { residentPaths } from "./paths.ts";

const input = (kind: "stop" | "background", host: "claude-code" | "codex-cli" = "claude-code") => ({
  kind, host, event: {}, statePath: "/fixture/state", activityPath: "/fixture/activity",
});
const hookAdvicee = {
  host: "claude-code", hostVersion: "2.1.218", sessionId: "session", turnId: null, toolUseId: "tool", subagentId: null,
} as const;
const unused = () => Effect.die("unexpected hook port");
const runtime = (client: Partial<ComposedHookRuntime["Service"]["client"]>, advicee: Extract<DirectAdvicee, { host: "codex-cli" | "claude-code" }> = hookAdvicee) => ComposedHookRuntime.of({
  now: () => 0,
  identity: () => Effect.succeed({ root: "/fixture", advicee }),
  client: {
    acknowledgeAdviceEffect: unused,
    registerComposedEditEffect: unused,
    composedStopBoundaryEffect: unused,
    beginComposedSubmissionEffect: unused,
    claimComposedBackgroundEffect: unused,
    collectAdviceeOutcomeEffect: unused,
    makeResidentDispatchContextEffect: () => Effect.succeed({
      statePath: "/fixture/state", activityPath: "/fixture/activity", userConfigPath: null, credential: null, controlled: {},
    }),
    markComposedUserPromptEffect: unused,
    releaseComposedSubmissionEffect: unused,
    releaseComposedBackgroundEffect: unused,
    ...client,
  },
});
const finding: AdviceeCollectionOutcome = { status: "advice", advice: {
  output: { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "review finding" } },
  token: "advice", lifetime: "origin", paths: residentPaths("/fixture/resident"), root: "/fixture",
  advicee: hookAdvicee, activityPath: undefined, findingCount: 1,
} };

it.effect("finishes the acquired Stop attempt when collection is interrupted", () => Effect.gen(function* () {
  const collecting = yield* Deferred.make<void>();
  const finished: Array<boolean> = [];
  const service = runtime({
    composedStopBoundaryEffect: (operation, _root, _advicee, _token, close = false) => Effect.sync(() => {
      if (operation === "finish-stop") finished.push(close);
      return true;
    }),
    collectAdviceeOutcomeEffect: () => Deferred.succeed(collecting, undefined).pipe(Effect.andThen(Effect.never)),
  });
  const hook = yield* runComposedHookEffect(input("stop")).pipe(
    Effect.provideService(ComposedHookRuntime, service),
    Effect.provideService(HookOutput, HookOutput.of({ writeEncoded: unused, write: unused })),
    Effect.forkChild,
  );
  yield* Deferred.await(collecting);
  yield* Fiber.interrupt(hook);
  expect(finished).toEqual([true]);
}));

it.effect("releases a background claim even when interrupted during its acquisition acknowledgement", () => Effect.gen(function* () {
  const claiming = yield* Deferred.make<void>();
  const acknowledged = yield* Deferred.make<void>();
  let releases = 0;
  const service = runtime({
    claimComposedBackgroundEffect: () => Effect.gen(function* () {
      yield* Deferred.succeed(claiming, undefined);
      yield* Deferred.await(acknowledged);
      return true;
    }),
    releaseComposedBackgroundEffect: () => Effect.sync(() => { releases += 1; return true; }),
    collectAdviceeOutcomeEffect: () => Effect.never,
  }, { host: "codex-cli", hostVersion: "0.155.1", sessionId: "session", turnId: "turn", toolUseId: "tool", subagentId: null });
  const hook = yield* runComposedHookEffect(input("background", "codex-cli")).pipe(
    Effect.provideService(ComposedHookRuntime, service),
    Effect.provideService(HookOutput, HookOutput.of({ writeEncoded: unused, write: unused })),
    Effect.forkChild,
  );
  yield* Deferred.await(claiming);
  const interrupting = yield* Fiber.interrupt(hook).pipe(Effect.forkChild({ startImmediately: true }));
  yield* Deferred.succeed(acknowledged, undefined);
  yield* Fiber.join(interrupting);
  expect(releases).toBe(1);
}));

it.effect("preserves Stop continuation when output observation is interrupted after submission starts", () => Effect.gen(function* () {
  const writing = yield* Deferred.make<void>();
  const finished: Array<boolean> = [];
  const service = runtime({
    composedStopBoundaryEffect: (operation, _root, _advicee, _token, close = false) => Effect.sync(() => {
      if (operation === "finish-stop") finished.push(close);
      return true;
    }),
    collectAdviceeOutcomeEffect: () => Effect.succeed(finding),
    beginComposedSubmissionEffect: () => Effect.succeed(true),
  });
  const hook = yield* runComposedHookEffect(input("stop")).pipe(
    Effect.provideService(ComposedHookRuntime, service),
    Effect.provideService(HookOutput, HookOutput.of({
      writeEncoded: unused,
      write: () => Deferred.succeed(writing, undefined).pipe(Effect.andThen(Effect.never)),
    })),
    Effect.forkChild,
  );
  yield* Deferred.await(writing);
  yield* Fiber.interrupt(hook);
  expect(finished).toEqual([false]);
}));

it.effect("releases a refused submission and closes its Stop attempt", () => Effect.gen(function* () {
  const finished: Array<boolean> = [];
  let releases = 0;
  const service = runtime({
    composedStopBoundaryEffect: (operation, _root, _advicee, _token, close = false) => Effect.sync(() => {
      if (operation === "finish-stop") finished.push(close);
      return true;
    }),
    collectAdviceeOutcomeEffect: () => Effect.succeed(finding),
    beginComposedSubmissionEffect: () => Effect.succeed(true),
    releaseComposedSubmissionEffect: () => Effect.sync(() => { releases += 1; return true; }),
  });
  yield* runComposedHookEffect(input("stop")).pipe(
    Effect.provideService(ComposedHookRuntime, service),
    Effect.provideService(HookOutput, HookOutput.of({ writeEncoded: unused, write: () => Effect.succeed("failed") })),
  );
  expect(releases).toBe(1);
  expect(finished).toEqual([true]);
}));

it.effect("disables Claude background collection before acquiring any ports", () =>
  runComposedHookEffect(input("background")).pipe(
    Effect.provideService(ComposedHookRuntime, { ...runtime({}), identity: unused }),
    Effect.provideService(HookOutput, HookOutput.of({ writeEncoded: unused, write: unused })),
  ),
);
