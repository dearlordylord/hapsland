import type { RoundCloseReason } from "../activity/status.ts";
import { hookProcessStartedAt } from "./hook-clock.ts";
import { createHash, randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import * as Effect from "effect/Effect";
import { recordActivity } from "../activity/status.ts";
import { adaptComposedHookIdentity } from "../direct-event/adapter.ts";
import type { CodexHostVersion } from "../direct-event/model.ts";
import type { ControlledDecisionModelOptions } from "../test-support/controlled-decision-model.ts";
import {
  acknowledgeAdvice,
  registerComposedEdit,
  composedStopBoundary,
  beginComposedSubmission,
  claimComposedBackground,
  collectAdviceeOutcome,
  consumeComposedStopAllowance,
  makeResidentDispatchContext,
  markComposedUserPrompt,
  releaseComposedSubmission,
  releaseComposedBackground,
} from "./client.ts";
import { residentPaths } from "./paths.ts";

export type ComposedHookKind = "background" | "stop" | "prompt" | "before-edit";
export type ComposedHookHost = "codex-cli" | "claude-code";

const record = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>> : undefined;
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** A write callback records runtime submission, not observation by the agent.
 * "failed" is only a pre-write refusal: no bytes were passed to stdout. */
type WriteOutcome = "written" | "failed" | "uncertain";
const writeJson = (value: unknown, deadlineAt: number): Promise<WriteOutcome> => {
  const remaining = deadlineAt - performance.now() - 50;
  if (remaining <= 0 || process.stdout.destroyed || process.stdout.writableEnded) return Promise.resolve("failed");
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: WriteOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.stdout.removeListener("error", onError);
      resolve(outcome);
    };
    const onError = () => finish("uncertain");
    const timer = setTimeout(() => finish("uncertain"), remaining);
    process.stdout.once("error", onError);
    try {
      process.stdout.write(`${JSON.stringify(value)}\n`, (error?: Error | null) => finish(error == null ? "written" : "uncertain"));
    } catch {
      finish("uncertain");
    }
  });
};

const promptMarker = async (event: Readonly<Record<string, unknown>>, host: ComposedHookHost): Promise<string | undefined> => {
  if (typeof event.prompt !== "string") return undefined;
  if (host === "codex-cli") {
    // Native Codex turn identity identifies this prompt notification. It is not
    // a Hapsland round ID: a round may span multiple runtime turns.
    const runtimeTurnId = event.turn_id;
    return typeof runtimeTurnId === "string" && runtimeTurnId.length > 0
      ? digest(`codex-turn:${runtimeTurnId}`) : undefined;
  }
  if (typeof event.transcript_path !== "string" || event.transcript_path.length === 0) {
    return digest(`claude-prompt:${event.session_id}:${event.prompt}`);
  }
  try {
    const metadata = await stat(event.transcript_path);
    return digest(`claude-prompt:${event.session_id}:${event.transcript_path}:${metadata.size}:${event.prompt}`);
  } catch {
    return digest(`claude-prompt:${event.session_id}:${event.transcript_path}:${event.prompt}`);
  }
};

export const runComposedHook = async (input: {
  readonly kind: ComposedHookKind;
  readonly host: ComposedHookHost;
  readonly event: unknown;
  readonly codexVersion?: CodexHostVersion;
  readonly statePath: string;
  readonly activityPath: string;
  readonly userConfigPath?: string;
  readonly controlled?: ControlledDecisionModelOptions;
}): Promise<void> => {
  const deadlineAt = input.kind === "background" ? 20_000 : input.kind === "stop" ? 4_200 : 2_500;
  let beforeQuiet = async (): Promise<void> => {};
  const quiet = async () => {
    await beforeQuiet();
    if (input.kind !== "background") await writeJson({}, deadlineAt);
  };
  const event = record(input.event);
  if (event === undefined) return quiet();
  const eventName = input.kind === "before-edit" ? "PreToolUse" : input.kind === "background" ? "PostToolUse"
    : input.kind === "stop" ? (event.hook_event_name === "SubagentStop" ? "SubagentStop" : "Stop") : "UserPromptSubmit";
  const identity = await Effect.runPromise(adaptComposedHookIdentity(
    event, input.host, eventName, input.codexVersion,
  )).catch(() => undefined);
  if (identity === undefined) return quiet();
  const { root, advicee } = identity;
  const paths = residentPaths();

  if (input.kind === "before-edit") {
    await registerComposedEdit(root, advicee, hookProcessStartedAt, paths, input.activityPath).catch(() => false);
    return quiet();
  }
  if (input.kind === "prompt") {
    const marker = await promptMarker(event, input.host);
    if (marker !== undefined) {
      const promptDigest = digest(String(event.prompt));
      await markComposedUserPrompt(root, advicee, marker, paths, promptDigest).catch(() => false);
    }
    return quiet();
  }
  // stop_hook_active means a prior hook requested continuation. It must not
  // bypass this round's remaining wait/cleanup or four-request allowance.
  // Some agents never receive UserPromptSubmit. Identity can initialize only
  // their first round; a closed round requires fresh edit occurrence evidence.
  if ((eventName === "SubagentStop" || input.kind === "background") && advicee.subagentId !== null) {
    await markComposedUserPrompt(root, advicee,
      digest(`subagent:${input.host}:${advicee.sessionId}:${advicee.subagentId}`), paths, undefined, true)
      .catch(() => false);
  }
  // Codex's native turn ID is only a fallback marker for the candidate's Stop
  // allowance, not evidence that a Hapsland round started or ended. Initialize
  // missing state if UserPromptSubmit could not reach the resident; ensure mode
  // preserves an existing allowance even if the runtime turn ID changed.
  const runtimeTurnId = event.turn_id;
  if (input.kind === "stop" && input.host === "codex-cli" &&
      typeof runtimeTurnId === "string" && runtimeTurnId.length > 0) {
    await markComposedUserPrompt(root, advicee, digest(`codex-turn:${runtimeTurnId}`), paths, undefined, true)
      .catch(() => false);
  }
  const dispatch = await makeResidentDispatchContext(
    root, input.statePath, input.activityPath, input.userConfigPath, input.controlled,
  ).catch(() => undefined);
  if (dispatch === undefined) return quiet();

  const stopToken = input.kind === "stop" ? randomUUID() : undefined;
  if (stopToken !== undefined &&
      !await composedStopBoundary("begin-stop", root, advicee, stopToken).catch(() => false)) return quiet();
  let continued = false;
  let closeReason: RoundCloseReason = "no-advice";
  let stopFinished = false;
  const finishStop = async (close: boolean): Promise<void> => {
    if (stopToken === undefined || stopFinished) return;
    stopFinished = await composedStopBoundary("finish-stop", root, advicee, stopToken, close, paths, closeReason).catch(() => false);
  };
  beforeQuiet = () => finishStop(true);
  const backgroundToken = input.kind === "background" ? randomUUID() : undefined;
  if (backgroundToken !== undefined &&
      !await claimComposedBackground(root, advicee, backgroundToken, paths).catch(() => false)) return quiet();

  const admissionGraceAt = Math.min(deadlineAt,
    performance.now() + (input.host === "claude-code" ? 5_000 : 2_000));
  try {
    while (performance.now() < deadlineAt - 150) {
      const outcome = await collectAdviceeOutcome(
        root, advicee, dispatch, paths,
        input.kind === "stop" ? "turn-end" : "ordinary", deadlineAt,
      ).catch(() => undefined);
      if (outcome === undefined) { closeReason = "unavailable"; return quiet(); }
      if (outcome.status === "advice") {
        const advice = outcome.advice;
        const message = advice.output.hookSpecificOutput.additionalContext;
        if (advice.findingCount > 0 && input.kind === "stop") {
          const allowed = await consumeComposedStopAllowance(root, advicee, paths, digest(message)).catch(() => false);
          if (!allowed) {
            closeReason = "limit";
            await releaseComposedSubmission(advice).catch(() => false);
            return quiet();
          }
        }
        if (advice.findingCount > 0) {
          const begun = await beginComposedSubmission(advice, input.kind).catch(() => false);
          if (!begun) { closeReason = "unavailable"; return quiet(); }
        }
        const output = input.kind === "background" ? advice.output
          : advice.findingCount > 0 ? { decision: "block", reason: message }
            : { systemMessage: message };
        if (input.kind === "stop" && advice.findingCount === 0) await finishStop(true);
        const written = await writeJson(output, deadlineAt);
        if (written === "failed") closeReason = "output-failed";
        if (input.kind === "stop" && advice.findingCount > 0 && written !== "failed") continued = true;
        if (written === "written") {
          recordActivity({ statePath: input.activityPath, root, advicee, lifetime: advice.lifetime,
            stage: "submitted", submittedFindings: advice.findingCount });
          await acknowledgeAdvice(advice).catch(() => false);
        }
        else if (written === "failed") await releaseComposedSubmission(advice).catch(() => false);
        return;
      }
      if (outcome.status === "empty" && (input.kind === "stop" || performance.now() >= admissionGraceAt)) {
        if (performance.now() >= deadlineAt - 200) closeReason = "deadline";
        return quiet();
      }
      await sleep(Math.min(50, Math.max(1, deadlineAt - performance.now() - 150)));
    }
    closeReason = "deadline";
    await quiet();
  } finally {
    // Retry an unacknowledged finish only when the native hook budget permits.
    // Otherwise the resident attempt timer owns conservative cleanup/recovery.
    if (continued || stopFinished || performance.now() < deadlineAt - 550) await finishStop(!continued);
    if (backgroundToken !== undefined) {
      await releaseComposedBackground(root, advicee, backgroundToken, paths).catch(() => false);
    }
  }
};
