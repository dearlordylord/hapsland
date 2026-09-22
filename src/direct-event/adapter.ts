import { execFile } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { promisify } from "node:util";
import * as Effect from "effect/Effect";
import type {
  DirectCandidate,
  DirectObservation,
  DirectRecipient,
  PhysicalRootIdentity,
} from "./model.ts";

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

export const nativeDirectCandidates = (command: string): ReadonlyArray<DirectCandidate> | undefined => {
  if (Buffer.byteLength(command, "utf8") > MAX_CODEX_COMMAND_BYTES) return undefined;
  const lines = command.replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== "*** Begin Patch" || lines.at(-1) !== "*** End Patch") return undefined;
  const candidates: Array<{ operation: DirectCandidate["operation"]; path: string; addedLines: Array<string> }> = [];
  const paths = new Set<string>();
  let current: (typeof candidates)[number] | undefined;
  for (const line of lines.slice(1, -1)) {
    const header = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line);
    if (header !== null) {
      const path = header[2]?.trim();
      if (path === undefined || path.length === 0 || paths.has(path)) return undefined;
      paths.add(path);
      current = {
        operation: header[1] === "Add" ? "add" : header[1] === "Update" ? "update" : "delete",
        path,
        addedLines: [],
      };
      candidates.push(current);
      continue;
    }
    if (current === undefined) return undefined;
    if (line.startsWith("*** Move to: ")) {
      if (current.operation !== "update" || line.slice("*** Move to: ".length).trim().length === 0) return undefined;
      current.operation = "move";
      continue;
    }
    if (line.startsWith("***")) return undefined;
    if (current.operation === "delete" || current.operation === "move") return undefined;
    if (current.operation === "add") {
      if (!line.startsWith("+")) return undefined;
      current.addedLines.push(line.slice(1));
      continue;
    }
    if (line.startsWith("@@")) continue;
    if (!line.startsWith("+") && !line.startsWith("-") && !line.startsWith(" ")) return undefined;
    if (line.startsWith("+")) current.addedLines.push(line.slice(1));
  }
  if (candidates.length < 1 || candidates.length > MAX_CODEX_CANDIDATES) return undefined;
  if (!candidates.some((candidate) =>
    candidate.operation === "add" ||
    (candidate.operation === "update" && candidate.addedLines.some((line) => line.trim().length > 0)))) {
    return undefined;
  }
  return candidates.map((candidate): DirectCandidate => {
    if (candidate.operation === "add") {
      return { operation: "add", path: candidate.path, addedLines: Object.freeze([...candidate.addedLines]) };
    }
    if (candidate.operation === "update") {
      return { operation: "update", path: candidate.path, addedLines: Object.freeze([...candidate.addedLines]) };
    }
    return { operation: candidate.operation, path: candidate.path, addedLines: [] };
  });
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
    rootIdentity: Object.freeze({
      rootDevice: String(rootStatus.dev),
      rootInode: String(rootStatus.ino),
      gitDirectory,
      gitDevice: String(gitStatus.dev),
      gitInode: String(gitStatus.ino),
    } satisfies PhysicalRootIdentity),
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
        current.rootIdentity.rootDevice === observation.rootIdentity.rootDevice &&
        current.rootIdentity.rootInode === observation.rootIdentity.rootInode &&
        current.rootIdentity.gitDirectory === observation.rootIdentity.gitDirectory &&
        current.rootIdentity.gitDevice === observation.rootIdentity.gitDevice &&
        current.rootIdentity.gitInode === observation.rootIdentity.gitInode;
    },
    catch: () => new Error("working tree identity unavailable"),
  }).pipe(Effect.catch(() => Effect.succeed(false)));

/** Strictly adapts the bounded, successful Codex CLI 0.155.1 native patch profile. */
export const adaptCodexDirectEvent = Effect.fn("DirectEvent.adaptCodexDirectEvent")(function* (
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
  const candidates = nativeDirectCandidates(input.command);
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

/** Compatibility name retained for callers introduced by the Add-only slice. */
export const adaptCodexAdd = adaptCodexDirectEvent;
