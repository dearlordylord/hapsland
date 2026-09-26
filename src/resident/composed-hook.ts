import { createHash, randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import * as Effect from "effect/Effect";
import { adaptComposedHookIdentity } from "../direct-event/adapter.ts";
import type { CodexHostVersion } from "../direct-event/model.ts";
import type { ControlledDecisionModelOptions } from "../test-support/controlled-decision-model.ts";
import {
  acknowledgeAdvice,
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

export type ComposedHookKind = "background" | "stop" | "prompt";
export type ComposedHookHost = "codex-cli" | "claude-code";

const record = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>> : undefined;
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** A write callback records host submission, not model visibility. */
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
    const onError = () => finish("failed");
    const timer = setTimeout(() => finish("uncertain"), remaining);
    process.stdout.once("error", onError);
    try {
      process.stdout.write(`${JSON.stringify(value)}\n`, (error?: Error | null) => finish(error == null ? "written" : "failed"));
    } catch {
      finish("failed");
    }
  });
};

const promptMarker = async (event: Readonly<Record<string, unknown>>, host: ComposedHookHost): Promise<string | undefined> => {
  if (typeof event.prompt !== "string") return undefined;
  if (host === "codex-cli") {
    return typeof event.turn_id === "string" && event.turn_id.length > 0
      ? digest(`codex-turn:${event.turn_id}`) : undefined;
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
  const quiet = async () => {
    if (input.kind !== "background") await writeJson({}, deadlineAt);
  };
  const event = record(input.event);
  if (event === undefined) return quiet();
  const eventName = input.kind === "background" ? "PostToolUse"
    : input.kind === "stop" ? (event.hook_event_name === "SubagentStop" ? "SubagentStop" : "Stop") : "UserPromptSubmit";
  const identity = await Effect.runPromise(adaptComposedHookIdentity(
    event, input.host, eventName, input.codexVersion,
  )).catch(() => undefined);
  if (identity === undefined) return quiet();
  const { root, advicee } = identity;
  const paths = residentPaths();

  if (input.kind === "prompt") {
    const marker = await promptMarker(event, input.host);
    if (marker !== undefined) {
      const promptDigest = digest(String(event.prompt));
      await markComposedUserPrompt(root, advicee, marker, paths, promptDigest).catch(() => false);
    }
    return quiet();
  }
  if (input.kind === "stop" && event.stop_hook_active === true) return quiet();
  // A child may never receive UserPromptSubmit. Its explicit native identity
  // permits one initial allowance; repeated tool/Stop events must not reset it.
  // Initialize before background submission too, so Stop does not accidentally
  // change its generation and bypass submitted-finding suppression.
  // Resumed children remain capped until an explicit prompt advances their chain.
  if ((eventName === "SubagentStop" || input.kind === "background") && advicee.subagentId !== null) {
    await markComposedUserPrompt(root, advicee,
      digest(`subagent:${input.host}:${advicee.sessionId}:${advicee.subagentId}`), paths, undefined, true)
      .catch(() => false);
  }
  // Codex supplies a stable native turn ID on Stop. Reasserting that marker
  // recovers if UserPromptSubmit could not reach the resident under load;
  // advance() keeps the existing one-continuation cap for the same marker.
  if (input.kind === "stop" && input.host === "codex-cli" &&
      typeof event.turn_id === "string" && event.turn_id.length > 0) {
    await markComposedUserPrompt(root, advicee, digest(`codex-turn:${event.turn_id}`), paths, undefined, true)
      .catch(() => false);
  }
  const dispatch = await makeResidentDispatchContext(
    root, input.statePath, input.activityPath, input.userConfigPath, input.controlled,
  ).catch(() => undefined);
  if (dispatch === undefined) return quiet();

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
      if (outcome === undefined) return quiet();
      if (outcome.status === "advice") {
        const advice = outcome.advice;
        const message = advice.output.hookSpecificOutput.additionalContext;
        if (advice.findingCount > 0 && input.kind === "stop") {
          const allowed = await consumeComposedStopAllowance(root, advicee, paths, digest(message)).catch(() => false);
          if (!allowed) {
            await releaseComposedSubmission(advice).catch(() => false);
            return quiet();
          }
        }
        if (advice.findingCount > 0) {
          const begun = await beginComposedSubmission(advice, input.kind).catch(() => false);
          if (!begun) return quiet();
        }
        const output = input.kind === "background" ? advice.output
          : advice.findingCount > 0 ? { decision: "block", reason: message }
            : { systemMessage: message };
        const written = await writeJson(output, deadlineAt);
        if (written === "written") await acknowledgeAdvice(advice).catch(() => false);
        else if (written === "failed") await releaseComposedSubmission(advice).catch(() => false);
        return;
      }
      if (outcome.status === "empty" && (input.kind === "stop" || performance.now() >= admissionGraceAt)) return quiet();
      await sleep(Math.min(50, Math.max(1, deadlineAt - performance.now() - 150)));
    }
    await quiet();
  } finally {
    if (backgroundToken !== undefined) {
      await releaseComposedBackground(root, advicee, backgroundToken, paths).catch(() => false);
    }
  }
};
