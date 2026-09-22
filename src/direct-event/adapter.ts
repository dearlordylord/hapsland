import { execFile } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { promisify } from "node:util";
import * as Effect from "effect/Effect";
import type { AddCandidate, DirectObservation, DirectRecipient } from "./model.ts";

const execFileAsync = promisify(execFile);
export const MAX_CODEX_COMMAND_BYTES = 65_536;
export const MAX_CODEX_CANDIDATES = 16;

const record = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export const isCodexNativeApplyPatch = (value: unknown): boolean => {
  const event = record(value);
  return event?.hook_event_name === "PostToolUse" && event.tool_name === "apply_patch";
};

const nativeAddCandidates = (command: string): ReadonlyArray<AddCandidate> | undefined => {
  if (Buffer.byteLength(command, "utf8") > MAX_CODEX_COMMAND_BYTES) return undefined;
  const lines = command.replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== "*** Begin Patch" || lines.at(-1) !== "*** End Patch") return undefined;
  const candidates: Array<AddCandidate> = [];
  for (const line of lines) {
    const anyOperation = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line);
    if (anyOperation !== null) {
      if (anyOperation[1] !== "Add") return undefined;
      const path = anyOperation[2]?.trim();
      if (path === undefined || path.length === 0) return undefined;
      candidates.push({ operation: "add", path });
    }
    if (line.startsWith("*** Move to:")) return undefined;
  }
  if (candidates.length < 1 || candidates.length > MAX_CODEX_CANDIDATES) return undefined;
  const unique = new Map(candidates.map((candidate) => [candidate.path, candidate]));
  return [...unique.values()];
};

const discoverRoot = async (cwd: string) => {
  const physicalCwd = await realpath(cwd);
  const rootResult = await execFileAsync(
    "git",
    ["--literal-pathspecs", "-C", physicalCwd, "rev-parse", "--show-toplevel"],
    { timeout: 2_000, maxBuffer: 65_536 },
  );
  const reported = rootResult.stdout.trim();
  if (reported.length === 0) throw new Error("not a Git working tree");
  const root = await realpath(reported);
  const gitResult = await execFileAsync(
    "git",
    ["--literal-pathspecs", "-C", root, "rev-parse", "--absolute-git-dir"],
    { timeout: 2_000, maxBuffer: 65_536 },
  );
  const gitDirectory = await realpath(gitResult.stdout.trim());
  const [rootStatus, gitStatus] = await Promise.all([
    stat(root, { bigint: true }),
    stat(gitDirectory, { bigint: true }),
  ]);
  return {
    root,
    rootIdentity: [
      rootStatus.dev,
      rootStatus.ino,
      gitStatus.dev,
      gitStatus.ino,
    ].map(String).join(":"),
  };
};

const canonicalGitRoot = (cwd: string) =>
  Effect.tryPromise({
    try: () => discoverRoot(cwd),
    catch: () => undefined,
  }).pipe(Effect.option);

export const verifyObservationRoot = (observation: DirectObservation) =>
  Effect.tryPromise({
    try: async () => {
      const current = await discoverRoot(observation.root);
      return current.root === observation.root &&
        current.rootIdentity === observation.rootIdentity;
    },
    catch: () => new Error("working tree identity unavailable"),
  }).pipe(Effect.catch(() => Effect.succeed(false)));

/** Strictly adapts the bounded, successful Codex CLI 0.155.1 native Add profile. */
export const adaptCodexAdd = Effect.fn("DirectEvent.adaptCodexAdd")(function* (
  value: unknown,
) {
  const event = record(value);
  if (event === undefined || !isCodexNativeApplyPatch(event)) return undefined;
  if (
    !nonEmpty(event.session_id) ||
    !nonEmpty(event.turn_id) ||
    !nonEmpty(event.tool_use_id) ||
    !nonEmpty(event.cwd) ||
    (event.agent_id !== undefined && !nonEmpty(event.agent_id))
  ) return undefined;
  const input = record(event.tool_input);
  if (input === undefined || !nonEmpty(input.command)) return undefined;
  const response = record(event.tool_response);
  // The accepted native payload records a successful apply_patch response. Be
  // conservative when Codex explicitly reports failure, while retaining the
  // observed 0.155.1 response variants which do not expose a Boolean status.
  if (response?.success === false || response?.is_error === true) return undefined;
  const candidates = nativeAddCandidates(input.command);
  if (candidates === undefined) return undefined;
  const rootOption = yield* canonicalGitRoot(event.cwd);
  if (rootOption._tag === "None") return undefined;
  const recipient: DirectRecipient = Object.freeze({
    host: "codex-cli",
    hostVersion: "0.155.1",
    sessionId: event.session_id,
    turnId: event.turn_id,
    toolUseId: event.tool_use_id,
    agentId: event.agent_id ?? null,
  });
  return Object.freeze({
    root: rootOption.value.root,
    rootIdentity: rootOption.value.rootIdentity,
    recipient,
    candidates: Object.freeze(candidates.map((candidate) => Object.freeze(candidate))),
  } satisfies DirectObservation);
});
