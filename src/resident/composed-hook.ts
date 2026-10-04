import type { RoundCloseReason } from "../activity/status.ts";
import { hookProcessStartedAt, hookMonotonicMillis } from "./hook-clock.ts";
import { createHash, randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import { HookOutput } from "./hook-output.ts";
import { recordActivity } from "../activity/status.ts";
import { adaptComposedHookIdentity } from "../direct-event/adapter.ts";
import type { CodexHostVersion } from "../direct-event/model.ts";
import type { ControlledDecisionModelOptions } from "../test-support/controlled-decision-model.ts";
import {
  type AdviceeCollectionOutcome,
  acknowledgeAdviceEffect,
  ResidentStartup,
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
import { resolveResidentPaths } from "./paths.ts";
import { claudeStopHostOutput } from "./collection.ts";

type BoundClient<F> = F extends (...args: infer Args) => Effect.Effect<infer A, infer E, unknown>
  ? (...args: Args) => Effect.Effect<A, E>
  : never;

export class ComposedHookRuntime extends Context.Service<
  ComposedHookRuntime,
  {
    readonly now: Effect.Effect<number>;
    readonly startedAt: number;
    readonly identity: typeof adaptComposedHookIdentity;
    readonly client: {
      readonly acknowledgeAdviceEffect: BoundClient<typeof acknowledgeAdviceEffect>;
      readonly registerComposedEditEffect: BoundClient<typeof registerComposedEditEffect>;
      readonly composedStopBoundaryEffect: BoundClient<typeof composedStopBoundaryEffect>;
      readonly beginComposedSubmissionEffect: BoundClient<typeof beginComposedSubmissionEffect>;
      readonly claimComposedBackgroundEffect: BoundClient<typeof claimComposedBackgroundEffect>;
      readonly collectAdviceeOutcomeEffect: BoundClient<typeof collectAdviceeOutcomeEffect>;
      readonly makeResidentDispatchContextEffect: BoundClient<typeof makeResidentDispatchContextEffect>;
      readonly markComposedUserPromptEffect: BoundClient<typeof markComposedUserPromptEffect>;
      readonly releaseComposedSubmissionEffect: BoundClient<typeof releaseComposedSubmissionEffect>;
      readonly releaseComposedBackgroundEffect: BoundClient<typeof releaseComposedBackgroundEffect>;
    };
  }
>()("Hapsland/ComposedHookRuntime") {}

export const composedHookRuntimeLayer = Layer.effect(
  ComposedHookRuntime,
  Effect.gen(function* () {
    const startup = yield* ResidentStartup;
    return ComposedHookRuntime.of({
      now: hookMonotonicMillis,
      startedAt: hookProcessStartedAt,
      identity: adaptComposedHookIdentity,
      client: {
        acknowledgeAdviceEffect,
        registerComposedEditEffect: (...args) =>
          registerComposedEditEffect(...args).pipe(Effect.provideService(ResidentStartup, startup)),
        composedStopBoundaryEffect,
        beginComposedSubmissionEffect,
        claimComposedBackgroundEffect: (...args) =>
          claimComposedBackgroundEffect(...args).pipe(Effect.provideService(ResidentStartup, startup)),
        collectAdviceeOutcomeEffect,
        makeResidentDispatchContextEffect,
        markComposedUserPromptEffect: (...args) =>
          markComposedUserPromptEffect(...args).pipe(Effect.provideService(ResidentStartup, startup)),
        releaseComposedSubmissionEffect,
        releaseComposedBackgroundEffect,
      },
    });
  }),
);

export type ComposedHookKind = "background" | "stop" | "prompt" | "before-edit";
export type ComposedHookHost = "codex-cli" | "claude-code";

const record = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
const codexPromptMarker = (turn: unknown): string | undefined =>
  typeof turn === "string" && turn.length > 0 ? digest(`codex-turn:${turn}`) : undefined;
const claudePromptMarker = Effect.fn("ComposedHook.claudePromptMarker")(function* (
  event: Readonly<Record<string, unknown>>,
) {
  if (typeof event.transcript_path !== "string" || event.transcript_path.length === 0)
    return digest(`claude-prompt:${event.session_id}:${event.prompt}`);
  const path = event.transcript_path;
  const metadata = yield* Effect.tryPromise(() => stat(path)).pipe(Effect.catch(() => Effect.succeed(undefined)));
  return metadata === undefined
    ? digest(`claude-prompt:${event.session_id}:${path}:${event.prompt}`)
    : digest(`claude-prompt:${event.session_id}:${path}:${metadata.size}:${event.prompt}`);
});
const promptMarker = Effect.fn("ComposedHook.promptMarker")(function* (
  event: Readonly<Record<string, unknown>>,
  host: ComposedHookHost,
): Effect.fn.Return<string | undefined> {
  if (typeof event.prompt !== "string") return undefined;
  if (host === "codex-cli") return codexPromptMarker(event.turn_id);
  return yield* claudePromptMarker(event);
});
const admissionGrace = (host: ComposedHookHost): number => (host === "claude-code" ? 5_000 : 2_000);
const hookDuration = (kind: ComposedHookKind): number => {
  if (kind === "background") return 20_000;
  return kind === "stop" ? 4_200 : 2_500;
};
const hookEventName = (kind: ComposedHookKind, event: Readonly<Record<string, unknown>>) => {
  if (kind === "before-edit") return "PreToolUse" as const;
  if (kind === "background") return "PostToolUse" as const;
  if (kind === "stop") return event.hook_event_name === "SubagentStop" ? ("SubagentStop" as const) : ("Stop" as const);
  return "UserPromptSubmit" as const;
};
const submissionOutput = (
  advice: Extract<AdviceeCollectionOutcome, { status: "advice" }>["advice"],
  host: ComposedHookHost,
  kind: ComposedHookKind,
) => {
  const message = advice.output.hookSpecificOutput.additionalContext;
  if (host === "claude-code") return claudeStopHostOutput(advice.output, advice.findingCount);
  if (kind === "background") return advice.output;
  return advice.findingCount > 0 ? { decision: "block", reason: message } : { systemMessage: message };
};

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
  } = runtime.client;
  const deadlineAt = runtime.startedAt + hookDuration(input.kind);
  const output = yield* HookOutput;
  const writeJson = output.write;
  let beforeQuiet = () => Effect.void;
  const quiet = () =>
    Effect.gen(function* () {
      yield* beforeQuiet();
      if (input.kind !== "background") yield* writeJson({}, deadlineAt);
    });
  if (input.host === "claude-code" && input.kind === "background") return;
  const resolveIdentity = Effect.fn("ComposedHook.resolveIdentity")(function* () {
    const event = record(input.event);
    if (event === undefined) return undefined;
    const eventName = hookEventName(input.kind, event);
    const identity = yield* runtime
      .identity(event, input.host, eventName, input.codexVersion)
      .pipe(Effect.catch(() => Effect.succeed(undefined)));
    if (identity === undefined) return undefined;
    return { event, eventName, ...identity };
  });
  const context = yield* resolveIdentity();
  if (context === undefined) return yield* quiet();
  const { event, eventName, root, advicee } = context;
  const paths = yield* resolveResidentPaths();

  const handleNotification = Effect.fn("ComposedHook.handleNotification")(function* () {
    if (input.kind === "before-edit") {
      yield* registerComposedEditEffect(
        root,
        advicee,
        runtime.startedAt,
        paths,
        input.activityPath,
        input.userConfigPath ?? undefined,
      ).pipe(Effect.catch(() => Effect.succeed(false)));
      return true;
    }
    if (input.kind === "prompt") {
      const marker = yield* promptMarker(event, input.host);
      if (marker !== undefined) {
        const promptDigest = digest(String(event.prompt));
        yield* markComposedUserPromptEffect(root, advicee, marker, paths, promptDigest).pipe(
          Effect.catch(() => Effect.succeed(false)),
        );
      }
      return true;
    }
    return false;
  });
  if (yield* handleNotification()) return yield* quiet();
  const initializeChildRound = Effect.fn("ComposedHook.initializeChildRound")(function* () {
    // stop_hook_active means a prior hook requested continuation. It must not
    // bypass this virtual round's remaining wait, cleanup, or four-request budget.
    // Some agents never receive UserPromptSubmit. Identity can initialize only
    // their first virtual round; a closed virtual round requires fresh edit occurrence evidence.
    if ((eventName === "SubagentStop" || input.kind === "background") && advicee.subagentId !== null) {
      yield* markComposedUserPromptEffect(
        root,
        advicee,
        digest(`subagent:${input.host}:${advicee.sessionId}:${advicee.subagentId}`),
        paths,
        undefined,
        true,
      ).pipe(Effect.catch(() => Effect.succeed(false)));
    }
  });
  const initializeCodexStop = Effect.fn("ComposedHook.initializeCodexStop")(function* () {
    // Codex's native turn ID is only a fallback marker for the candidate's Stop
    // budget, not evidence that a virtual round started or ended. Initialize
    // missing state if UserPromptSubmit could not reach the resident; ensure mode
    // preserves an existing virtual round budget even if the runtime turn ID changed.
    const runtimeTurnId = event.turn_id;
    if (
      input.kind === "stop" &&
      input.host === "codex-cli" &&
      typeof runtimeTurnId === "string" &&
      runtimeTurnId.length > 0
    ) {
      yield* markComposedUserPromptEffect(
        root,
        advicee,
        digest(`codex-turn:${runtimeTurnId}`),
        paths,
        undefined,
        true,
      ).pipe(Effect.catch(() => Effect.succeed(false)));
    }
  });
  yield* initializeChildRound();
  yield* initializeCodexStop();
  const dispatch = yield* makeResidentDispatchContextEffect(
    root,
    input.statePath,
    input.activityPath,
    input.userConfigPath,
    input.controlled,
  ).pipe(Effect.catch(() => Effect.succeed(undefined)));
  if (dispatch === undefined) return yield* quiet();

  const collectAndSubmit = Effect.fn("ComposedHook.collectAndSubmit")(function* () {
    const collectorKind = input.kind === "background" ? "background" : "stop";
    const stopToken = collectorKind === "stop" ? randomUUID() : undefined;
    let continued = false;
    let closeReason: RoundCloseReason = "no-advice";
    let stopFinished = false;
    const finishStop = () =>
      Effect.gen(function* () {
        if (stopToken === undefined || stopFinished) return;
        stopFinished = yield* composedStopBoundaryEffect(
          "finish-stop",
          root,
          advicee,
          stopToken,
          !continued,
          paths,
          closeReason,
        ).pipe(Effect.catch(() => Effect.succeed(false)));
      });
    const acquireStop = Effect.fn("ComposedHook.acquireStop")(function* () {
      if (stopToken === undefined) return true;
      const acquired = yield* Effect.acquireRelease(
        composedStopBoundaryEffect("begin-stop", root, advicee, stopToken).pipe(
          Effect.catch(() => Effect.succeed(false)),
        ),
        (acquired) =>
          Effect.gen(function* () {
            if (acquired && (continued || stopFinished || (yield* runtime.now) < deadlineAt - 550)) yield* finishStop();
          }),
      );
      if (!acquired) return false;
      beforeQuiet = finishStop;
      return true;
    });
    if (!(yield* acquireStop())) return yield* quiet();
    const backgroundToken = collectorKind === "background" ? randomUUID() : undefined;
    if (backgroundToken !== undefined) {
      const acquired = yield* Effect.acquireRelease(
        claimComposedBackgroundEffect(root, advicee, backgroundToken, paths).pipe(
          Effect.catch(() => Effect.succeed(false)),
        ),
        (acquired) =>
          acquired
            ? releaseComposedBackgroundEffect(root, advicee, backgroundToken, paths).pipe(
                Effect.asVoid,
                Effect.catch(() => Effect.void),
              )
            : Effect.void,
      );
      if (!acquired) return yield* quiet();
    }

    const admissionGraceAt = Math.min(deadlineAt, (yield* runtime.now) + admissionGrace(input.host));
    const recordSubmission = Effect.fn("ComposedHook.recordSubmission")(function* (
      advice: Extract<AdviceeCollectionOutcome, { status: "advice" }>["advice"],
      written: "written" | "failed" | "uncertain",
    ) {
      if (written === "written") {
        recordActivity({
          statePath: input.activityPath,
          root,
          advicee,
          lifetime: advice.lifetime,
          stage: "submitted",
          submittedFindings: advice.findingCount,
        });
        yield* acknowledgeAdviceEffect(advice).pipe(Effect.catch(() => Effect.succeed(false)));
      } else if (written === "failed")
        yield* releaseComposedSubmissionEffect(advice).pipe(Effect.catch(() => Effect.succeed(false)));
    });
    const prepareStopOutput = Effect.fn("ComposedHook.prepareStopOutput")(function* (
      advice: Extract<AdviceeCollectionOutcome, { status: "advice" }>["advice"],
    ) {
      if (collectorKind === "stop" && advice.findingCount === 0) {
        // A zero-finding delivery here carries operational failure notices.
        closeReason = "unavailable";
        yield* finishStop();
      }
      // Once output may have started, interruption is an uncertain submission.
      // Preserve the Stop attempt unless the output port proves a pre-write refusal.
      if (collectorKind === "stop" && advice.findingCount > 0) continued = true;
    });
    const submitAdvice = Effect.fn("ComposedHook.submitAdvice")(function* (
      advice: Extract<AdviceeCollectionOutcome, { status: "advice" }>["advice"],
    ) {
      if (advice.findingCount > 0) {
        const begun = yield* beginComposedSubmissionEffect(advice, collectorKind).pipe(
          Effect.catch(() => Effect.succeed(false)),
        );
        if (!begun) {
          closeReason = "unavailable";
          yield* quiet();
          return true;
        }
      }
      const output = submissionOutput(advice, input.host, collectorKind);
      yield* prepareStopOutput(advice);
      const written = yield* writeJson(output, deadlineAt);
      if (written === "failed") {
        continued = false;
        closeReason = "output-failed";
      }
      yield* recordSubmission(advice, written);
      return true;
    });
    const collectOutcome = Effect.fn("ComposedHook.collectOutcome")(function* () {
      return yield* collectAdviceeOutcomeEffect(
        root,
        advicee,
        dispatch,
        paths,
        collectorKind === "stop" ? "turn-end" : "ordinary",
        deadlineAt,
        stopToken === undefined
          ? undefined
          : {
              token: stopToken,
              // Leave time for final eligibility checks, output authorization and write.
              deadlineReached: (yield* runtime.now) >= deadlineAt - 750,
            },
      ).pipe(Effect.catch(() => Effect.succeed(undefined)));
    });
    const finishEmpty = Effect.fn("ComposedHook.finishEmpty")(function* (status: string) {
      if (status === "empty" && (collectorKind === "stop" || (yield* runtime.now) >= admissionGraceAt)) {
        if ((yield* runtime.now) >= deadlineAt - 200) closeReason = "deadline";
        yield* quiet();
        return true;
      }
      return false;
    });
    const pass = Effect.gen(function* () {
      if ((yield* runtime.now) >= deadlineAt - 150) {
        closeReason = "deadline";
        yield* quiet();
        return true;
      }
      const outcome = yield* collectOutcome();
      if (outcome === undefined) {
        closeReason = "unavailable";
        yield* quiet();
        return true;
      }
      if (outcome.status === "advice") return yield* submitAdvice(outcome.advice);
      return yield* finishEmpty(outcome.status);
    });
    yield* pass.pipe(Effect.repeat({ schedule: Schedule.spaced("50 millis"), until: (done) => done }));
  });
  yield* collectAndSubmit();
}, Effect.scoped);
