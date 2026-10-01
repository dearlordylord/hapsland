import type { RoundCloseReason } from "../activity/status.ts";
import { hookProcessStartedAt } from "./hook-clock.ts";
import { createHash, randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import { Context, Layer } from "effect";
import { HookOutput } from "./hook-output.ts";
import { recordActivity } from "../activity/status.ts";
import { adaptComposedHookIdentity } from "../direct-event/adapter.ts";
import type { CodexHostVersion } from "../direct-event/model.ts";
import type { ControlledDecisionModelOptions } from "../test-support/controlled-decision-model.ts";
import {
  acknowledgeAdviceEffect,
  registerComposedEditEffect,
  composedStopBoundaryEffect,
  beginComposedSubmissionEffect,
  claimComposedBackgroundEffect,
  collectAdviceeOutcomeEffect,
  makeResidentDispatchContextEffect,
  markComposedUserPromptEffect,
  releaseComposedSubmissionEffect,
  releaseComposedBackgroundEffect,
} from "./client.ts";
import { residentPaths } from "./paths.ts";
import { composedClaudeHostOutput } from "./collection.ts";

export class ComposedHookRuntime extends Context.Service<ComposedHookRuntime, {
  readonly now: () => number;
  readonly identity: typeof adaptComposedHookIdentity;
  readonly client: {
    readonly acknowledgeAdviceEffect: typeof acknowledgeAdviceEffect;
    readonly registerComposedEditEffect: typeof registerComposedEditEffect;
    readonly composedStopBoundaryEffect: typeof composedStopBoundaryEffect;
    readonly beginComposedSubmissionEffect: typeof beginComposedSubmissionEffect;
    readonly claimComposedBackgroundEffect: typeof claimComposedBackgroundEffect;
    readonly collectAdviceeOutcomeEffect: typeof collectAdviceeOutcomeEffect;
    readonly makeResidentDispatchContextEffect: typeof makeResidentDispatchContextEffect;
    readonly markComposedUserPromptEffect: typeof markComposedUserPromptEffect;
    readonly releaseComposedSubmissionEffect: typeof releaseComposedSubmissionEffect;
    readonly releaseComposedBackgroundEffect: typeof releaseComposedBackgroundEffect;
  };
}>()("Hapsland/ComposedHookRuntime") {}

export const composedHookRuntimeLayer = Layer.succeed(ComposedHookRuntime, ComposedHookRuntime.of({
  now: () => performance.now(),
  identity: adaptComposedHookIdentity,
  client: {
    acknowledgeAdviceEffect, registerComposedEditEffect, composedStopBoundaryEffect,
    beginComposedSubmissionEffect, claimComposedBackgroundEffect, collectAdviceeOutcomeEffect,
    makeResidentDispatchContextEffect, markComposedUserPromptEffect,
    releaseComposedSubmissionEffect, releaseComposedBackgroundEffect,
  },
}));

export type ComposedHookKind = "background" | "stop" | "prompt" | "before-edit";
export type ComposedHookHost = "codex-cli" | "claude-code";

const record = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>> : undefined;
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
const promptMarker = Effect.fn("ComposedHook.promptMarker")(function* (event: Readonly<Record<string, unknown>>, host: ComposedHookHost): Effect.fn.Return<string | undefined> {
  if (typeof event.prompt !== "string") return undefined;
  if (host === "codex-cli") {
    // Native Codex turn identity identifies this prompt notification. It is not
    // a virtual round ID: a virtual round may span multiple runtime turns.
    const runtimeTurnId = event.turn_id;
    return typeof runtimeTurnId === "string" && runtimeTurnId.length > 0
      ? digest(`codex-turn:${runtimeTurnId}`) : undefined;
  }
  if (typeof event.transcript_path !== "string" || event.transcript_path.length === 0) {
    return digest(`claude-prompt:${event.session_id}:${event.prompt}`);
  }
  const transcriptPath = event.transcript_path;
  const metadata = yield* Effect.tryPromise(() => stat(transcriptPath))
    .pipe(Effect.catch(() => Effect.succeed(undefined)));
  return metadata === undefined
    ? digest(`claude-prompt:${event.session_id}:${event.transcript_path}:${event.prompt}`)
    : digest(`claude-prompt:${event.session_id}:${event.transcript_path}:${metadata.size}:${event.prompt}`);
});

export const runComposedHookEffect = Effect.fn("ComposedHook.run")(function* (input: {
  readonly kind: ComposedHookKind;
  readonly host: ComposedHookHost;
  readonly event: unknown;
  readonly codexVersion?: CodexHostVersion;
  readonly statePath: string;
  readonly activityPath: string;
  readonly userConfigPath?: string;
  readonly controlled?: ControlledDecisionModelOptions;
}) {
  const runtime = yield* ComposedHookRuntime;
  const {
    acknowledgeAdviceEffect, registerComposedEditEffect, composedStopBoundaryEffect,
    beginComposedSubmissionEffect, claimComposedBackgroundEffect, collectAdviceeOutcomeEffect,
    makeResidentDispatchContextEffect, markComposedUserPromptEffect,
    releaseComposedSubmissionEffect, releaseComposedBackgroundEffect,
  } = runtime.client;
  const deadlineAt = input.kind === "background" ? 20_000 : input.kind === "stop" ? 4_200 : 2_500;
  const output = yield* HookOutput;
  const writeJson = output.write;
  let beforeQuiet = () => Effect.void;
  const quiet = () => Effect.gen(function* () {
    yield* beforeQuiet();
    if (input.kind !== "background") yield* writeJson({}, deadlineAt);
  });
  const event = record(input.event);
  if (event === undefined) return yield* quiet();
  const eventName = input.kind === "before-edit" ? "PreToolUse" : input.kind === "background" ? "PostToolUse"
    : input.kind === "stop" ? (event.hook_event_name === "SubagentStop" ? "SubagentStop" : "Stop") : "UserPromptSubmit";
  const identity = yield* runtime.identity(
    event, input.host, eventName, input.codexVersion,
  ).pipe(Effect.catch(() => Effect.succeed(undefined)));
  if (identity === undefined) return yield* quiet();
  const { root, advicee } = identity;
  const paths = residentPaths();

  if (input.kind === "before-edit") {
    yield* registerComposedEditEffect(root, advicee, hookProcessStartedAt, paths, input.activityPath,
      input.userConfigPath ?? undefined).pipe(Effect.catch(() => Effect.succeed(false)));
    return yield* quiet();
  }
  if (input.kind === "prompt") {
    const marker = yield* promptMarker(event, input.host);
    if (marker !== undefined) {
      const promptDigest = digest(String(event.prompt));
      yield* markComposedUserPromptEffect(root, advicee, marker, paths, promptDigest).pipe(Effect.catch(() => Effect.succeed(false)));
    }
    return yield* quiet();
  }
  // stop_hook_active means a prior hook requested continuation. It must not
  // bypass this virtual round's remaining wait, cleanup, or four-request budget.
  // Some agents never receive UserPromptSubmit. Identity can initialize only
  // their first virtual round; a closed virtual round requires fresh edit occurrence evidence.
  if ((eventName === "SubagentStop" || input.kind === "background") && advicee.subagentId !== null) {
    yield* markComposedUserPromptEffect(root, advicee,
      digest(`subagent:${input.host}:${advicee.sessionId}:${advicee.subagentId}`), paths, undefined, true)
      .pipe(Effect.catch(() => Effect.succeed(false)));
  }
  // Codex's native turn ID is only a fallback marker for the candidate's Stop
  // budget, not evidence that a virtual round started or ended. Initialize
  // missing state if UserPromptSubmit could not reach the resident; ensure mode
  // preserves an existing virtual round budget even if the runtime turn ID changed.
  const runtimeTurnId = event.turn_id;
  if (input.kind === "stop" && input.host === "codex-cli" &&
      typeof runtimeTurnId === "string" && runtimeTurnId.length > 0) {
    yield* markComposedUserPromptEffect(root, advicee, digest(`codex-turn:${runtimeTurnId}`), paths, undefined, true)
      .pipe(Effect.catch(() => Effect.succeed(false)));
  }
  const dispatch = yield* makeResidentDispatchContextEffect(
    root, input.statePath, input.activityPath, input.userConfigPath, input.controlled,
  ).pipe(Effect.catch(() => Effect.succeed(undefined)));
  if (dispatch === undefined) return yield* quiet();

  const collectorKind = input.kind;
  const stopToken = collectorKind === "stop" ? randomUUID() : undefined;
  let continued = false;
  let closeReason: RoundCloseReason = "no-advice";
  let stopFinished = false;
  const finishStop = () => Effect.gen(function* () {
    if (stopToken === undefined || stopFinished) return;
    stopFinished = yield* composedStopBoundaryEffect("finish-stop", root, advicee, stopToken, !continued, paths, closeReason)
      .pipe(Effect.catch(() => Effect.succeed(false)));
  });
  if (stopToken !== undefined) {
    const acquired = yield* Effect.acquireRelease(
      composedStopBoundaryEffect("begin-stop", root, advicee, stopToken).pipe(Effect.catch(() => Effect.succeed(false))),
      (acquired) => acquired && (continued || stopFinished || runtime.now() < deadlineAt - 550)
        ? finishStop() : Effect.void,
    );
    if (!acquired) return yield* quiet();
    beforeQuiet = finishStop;
  }
  const backgroundToken = collectorKind === "background" ? randomUUID() : undefined;
  if (backgroundToken !== undefined) {
    const acquired = yield* Effect.acquireRelease(
      claimComposedBackgroundEffect(root, advicee, backgroundToken, paths).pipe(Effect.catch(() => Effect.succeed(false))),
      (acquired) => acquired
        ? releaseComposedBackgroundEffect(root, advicee, backgroundToken, paths).pipe(Effect.asVoid, Effect.catch(() => Effect.void))
        : Effect.void,
    );
    if (!acquired) return yield* quiet();
  }

  const admissionGraceAt = Math.min(deadlineAt,
    runtime.now() + (input.host === "claude-code" ? 5_000 : 2_000));
  const pass = Effect.gen(function* () {
    if (runtime.now() >= deadlineAt - 150) {
      closeReason = "deadline";
      yield* quiet();
      return true;
    }
    const outcome = yield* collectAdviceeOutcomeEffect(
      root, advicee, dispatch, paths,
      collectorKind === "stop" ? "turn-end" : "ordinary", deadlineAt,
      stopToken === undefined ? undefined : {
        token: stopToken,
        // Leave time for final eligibility checks, output authorization and write.
        deadlineReached: runtime.now() >= deadlineAt - 750,
      },
    ).pipe(Effect.catch(() => Effect.succeed(undefined)));
    if (outcome === undefined) { closeReason = "unavailable"; yield* quiet(); return true; }
    if (outcome.status === "advice") {
      const advice = outcome.advice;
      const message = advice.output.hookSpecificOutput.additionalContext;
      if (advice.findingCount > 0) {
        const begun = yield* beginComposedSubmissionEffect(advice, collectorKind).pipe(Effect.catch(() => Effect.succeed(false)));
        if (!begun) { closeReason = "unavailable"; yield* quiet(); return true; }
      }
      const output = input.host === "claude-code"
        ? composedClaudeHostOutput(advice.output, advice.findingCount,
            collectorKind === "background" ? "background" : "stop")
        : collectorKind === "background" ? advice.output
          : advice.findingCount > 0 ? { decision: "block", reason: message }
            : { systemMessage: message };
      if (collectorKind === "stop" && advice.findingCount === 0) {
        // A zero-finding delivery here carries operational failure notices.
        closeReason = "unavailable";
        yield* finishStop();
      }
      // Once output may have started, interruption is an uncertain submission.
      // Preserve the Stop attempt unless the output port proves a pre-write refusal.
      if (collectorKind === "stop" && advice.findingCount > 0) continued = true;
      const written = yield* writeJson(output, deadlineAt);
      if (written === "failed") {
        continued = false;
        closeReason = "output-failed";
      }
      if (written === "written") {
        recordActivity({ statePath: input.activityPath, root, advicee, lifetime: advice.lifetime,
          stage: "submitted", submittedFindings: advice.findingCount });
        yield* acknowledgeAdviceEffect(advice).pipe(Effect.catch(() => Effect.succeed(false)));
      }
      else if (written === "failed") yield* releaseComposedSubmissionEffect(advice).pipe(Effect.catch(() => Effect.succeed(false)));
      return true;
    }
    if (outcome.status === "empty" && (collectorKind === "stop" || runtime.now() >= admissionGraceAt)) {
      if (runtime.now() >= deadlineAt - 200) closeReason = "deadline";
      yield* quiet(); return true;
    }
    return false;
  });
  yield* pass.pipe(Effect.repeat({ schedule: Schedule.spaced("50 millis"), until: (done) => done }));
}, Effect.scoped);
