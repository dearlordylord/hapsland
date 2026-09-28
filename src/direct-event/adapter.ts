import { execFile } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import * as Effect from "effect/Effect";
import type {
  DirectCandidate,
  DirectObservation,
  DirectAdvicee,
  PhysicalRootIdentity,
  CodexHostVersion,
} from "./model.ts";
import { MAX_SOURCE_BYTES, captureStable } from "./capture.ts";
import { eligibleNamedPath } from "./selection.ts";

const execFileAsync = promisify(execFile);
export const MAX_CODEX_COMMAND_BYTES = 65_536;
export const MAX_CODEX_CANDIDATES = 16;

const record = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

// A child marker without a usable child ID cannot safely become parent advice.
const ambiguousAgentIdentity = (event: Readonly<Record<string, unknown>>): boolean =>
  !nonEmpty(event.agent_id) &&
  (nonEmpty(event.agent_type) || nonEmpty(event.agent_transcript_path));

export const isCodexNativeApplyPatch = (value: unknown): boolean => {
  const event = record(value);
  return event?.hook_event_name === "PostToolUse" && event.tool_name === "apply_patch";
};

export const nativeDirectCandidates = (command: string): ReadonlyArray<DirectCandidate> | undefined => {
  if (Buffer.byteLength(command, "utf8") > MAX_CODEX_COMMAND_BYTES) return undefined;
  const lines = command.replaceAll("\r\n", "\n").split("\n");
  // Codex may include the conventional final line terminator after the patch.
  // Keep the grammar strict: only one empty terminal line is ignored.
  if (lines.at(-1) === "") lines.pop();
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
    if (current.operation === "delete") return undefined;
    if (current.operation === "move") {
      if (line.startsWith("@@")) continue;
      if (!line.startsWith("+") && !line.startsWith("-") && !line.startsWith(" ")) return undefined;
      continue;
    }
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

/** Strictly adapts the bounded native patch profile for the selected host version. */
export const adaptCodexDirectEvent = Effect.fn("DirectEvent.adaptCodexDirectEvent")(function* (
  value: unknown,
  hostVersion: CodexHostVersion = "0.155.1",
) {
  const event = record(value);
  if (event === undefined || !isCodexNativeApplyPatch(event)) return undefined;
  if (
    !nonEmpty(event.session_id) ||
    !nonEmpty(event.turn_id) ||
    !nonEmpty(event.tool_use_id) ||
    !nonEmpty(event.cwd) ||
    ((event.agent_id !== undefined && !nonEmpty(event.agent_id)) || ambiguousAgentIdentity(event))
  ) return undefined;
  const input = record(event.tool_input);
  if (input === undefined || !nonEmpty(input.command)) return undefined;
  const cwd = event.cwd as string;
  const response = record(event.tool_response);
  // The accepted native payload records a successful apply_patch response. Be
  // conservative when Codex explicitly reports failure, while retaining the
  // observed 0.155.1 response variants which do not expose a Boolean status.
  if (response?.success === false || response?.is_error === true) return undefined;
  const candidates = nativeDirectCandidates(input.command);
  if (candidates === undefined) return undefined;
  const rootOption = yield* canonicalGitRoot(cwd);
  if (rootOption._tag === "None") return undefined;
  // Codex can name a changed file with an absolute path based on the lexical
  // spelling of cwd. On macOS that spelling may be `/var/...` while Git's
  // physical root is `/private/var/...`. Convert only paths under that exact
  // event cwd to root-relative paths; selection still checks every path
  // component for symlinks and verifies the captured file's physical path.
  const canonicalCwd = yield* Effect.tryPromise({
    try: () => realpath(cwd),
    catch: () => new Error("working directory unavailable"),
  }).pipe(Effect.option);
  if (canonicalCwd._tag === "None") return undefined;
  const cwdFromRoot = relative(rootOption.value.root, canonicalCwd.value);
  if (cwdFromRoot === ".." || cwdFromRoot.startsWith(`..${sep}`) || isAbsolute(cwdFromRoot)) return undefined;
  const normalizedCandidates = candidates.map((candidate) => {
    if (!isAbsolute(candidate.path)) return candidate;
    const fromCwd = relative(resolve(cwd), resolve(candidate.path));
    if (fromCwd === ".." || fromCwd.startsWith(`..${sep}`) || isAbsolute(fromCwd)) return candidate;
    const path = [cwdFromRoot, fromCwd].filter(Boolean).join(sep).replaceAll(sep, "/");
    return { ...candidate, path };
  });
  const advicee: DirectAdvicee = Object.freeze({
    host: "codex-cli",
    hostVersion,
    sessionId: event.session_id,
    turnId: event.turn_id,
    toolUseId: event.tool_use_id,
    subagentId: event.agent_id ?? null,
  });
  return Object.freeze({
    root: rootOption.value.root,
    rootIdentity: rootOption.value.rootIdentity,
    advicee,
    candidates: Object.freeze(normalizedCandidates.map((candidate) => Object.freeze(candidate))),
  } satisfies DirectObservation);
});

/** Identity-only adaptation for later reply opportunities. It never supplies paths. */
export const adaptCodexReply = Effect.fn("DirectEvent.adaptCodexReply")(function* (
  value: unknown,
  hostVersion: CodexHostVersion = "0.155.1",
) {
  const event = record(value);
  if (
    event === undefined || event.hook_event_name !== "PostToolUse" ||
    !nonEmpty(event.session_id) || !nonEmpty(event.turn_id) ||
    !nonEmpty(event.tool_use_id) || !nonEmpty(event.cwd) ||
    ((event.agent_id !== undefined && !nonEmpty(event.agent_id)) || ambiguousAgentIdentity(event))
  ) return undefined;
  const rootOption = yield* canonicalGitRoot(event.cwd);
  if (rootOption._tag === "None") return undefined;
  return Object.freeze({
    root: rootOption.value.root,
    advicee: Object.freeze({
      host: "codex-cli",
      hostVersion,
      sessionId: event.session_id,
      turnId: event.turn_id,
      toolUseId: event.tool_use_id,
      subagentId: event.agent_id ?? null,
    } satisfies DirectAdvicee),
  });
});

/** Identity-only mapping for composed background, Stop, and prompt hooks. */
export const adaptComposedHookIdentity = Effect.fn("DirectEvent.adaptComposedHookIdentity")(function* (
  value: unknown,
  host: "codex-cli" | "claude-code",
  eventName: "PreToolUse" | "PostToolUse" | "Stop" | "SubagentStop" | "UserPromptSubmit",
  codexVersion: CodexHostVersion = "0.155.1",
) {
  const event = record(value);
  if (event?.hook_event_name !== eventName || !nonEmpty(event.session_id) ||
      !nonEmpty(event.cwd) ||
      ((event.agent_id !== undefined && !nonEmpty(event.agent_id)) || ambiguousAgentIdentity(event))) return undefined;
  if (eventName === "SubagentStop" && !nonEmpty(event.agent_id)) return undefined;
  if (eventName === "PostToolUse" || eventName === "PreToolUse") {
    if (!nonEmpty(event.tool_use_id)) return undefined;
    if (host === "codex-cli" && event.tool_name !== "apply_patch") return undefined;
    if (host === "claude-code" && event.tool_name !== "Edit" && event.tool_name !== "Write") return undefined;
  }
  const root = yield* canonicalGitRoot(event.cwd);
  if (root._tag === "None") return undefined;
  const advicee: DirectAdvicee = host === "codex-cli"
    ? {
        host, hostVersion: codexVersion, sessionId: event.session_id,
        turnId: nonEmpty(event.turn_id) ? event.turn_id : "delivery-opportunity",
        toolUseId: nonEmpty(event.tool_use_id) ? event.tool_use_id : "delivery-opportunity",
        subagentId: event.agent_id ?? null,
      }
    : {
        host, hostVersion: "2.1.218", sessionId: event.session_id,
        turnId: null,
        toolUseId: nonEmpty(event.tool_use_id) ? event.tool_use_id : "delivery-opportunity",
        subagentId: event.agent_id ?? null,
      };
  return Object.freeze({ root: root.value.root, advicee: Object.freeze(advicee) });
});

/** Compatibility name retained for callers introduced by the Add-only slice. */
export const adaptCodexAdd = adaptCodexDirectEvent;

const changedWholeLines = (before: string, after: string): ReadonlyArray<string> => {
  const prior = new Set(before.split(/\r?\n/u).map((line) => line.trim()));
  return after.split(/\r?\n/u).filter((line) => line.trim().length > 0 && !prior.has(line.trim()));
};

const boundedSource = (value: unknown): value is string =>
  typeof value === "string" && Buffer.byteLength(value, "utf8") <= MAX_SOURCE_BYTES;

/** Claude has no observed turn ID; preserve supplied child identity. */
export const adaptClaudeDirectEvent = Effect.fn("DirectEvent.adaptClaudeDirectEvent")(function* (value: unknown) {
  const event = record(value);
  if (event?.hook_event_name !== "PostToolUse" ||
    (event.tool_name !== "Edit" && event.tool_name !== "Write") ||
    !nonEmpty(event.session_id) || !nonEmpty(event.tool_use_id) || !nonEmpty(event.cwd) ||
    event.turn_id !== undefined ||
    ((event.agent_id !== undefined && !nonEmpty(event.agent_id)) || ambiguousAgentIdentity(event))) return undefined;
  const input = record(event.tool_input);
  const response = record(event.tool_response);
  if (input === undefined || response === undefined ||
    !nonEmpty(input.file_path) || !isAbsolute(input.file_path) ||
    input.file_path !== response.filePath ||
    response.userModified !== false || response.success === false || response.is_error === true) return undefined;
  const path = input.file_path;
  if (Buffer.byteLength(path) > 16_384) return undefined;
  if (event.tool_name === "Edit") {
    if (!boundedSource(input.old_string) || !boundedSource(input.new_string) ||
      !boundedSource(response.originalFile) ||
      !boundedSource(response.oldString) || !boundedSource(response.newString)) return undefined;
  } else if (!boundedSource(input.content) || !boundedSource(response.content) ||
    (response.originalFile !== null && !boundedSource(response.originalFile))) return undefined;
  const root = yield* canonicalGitRoot(event.cwd);
  if (root._tag === "None") return undefined;
  const cwd = yield* Effect.tryPromise(() => realpath(event.cwd as string)).pipe(Effect.option);
  if (cwd._tag === "None") return undefined;
  const fromRoot = relative(root.value.root, cwd.value);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) return undefined;
  const fromCwd = relative(resolve(event.cwd), resolve(path));
  if (fromCwd === ".." || fromCwd.startsWith(`..${sep}`) || isAbsolute(fromCwd)) return undefined;
  const relativePath = [fromRoot, fromCwd].filter(Boolean).join(sep).replaceAll(sep, "/");
  const eligible = yield* eligibleNamedPath(root.value.root, relativePath, undefined, root.value.rootIdentity);
  if (eligible === undefined) return undefined;
  const content = yield* captureStable(root.value.root, eligible, undefined, root.value.rootIdentity);
  if (content === undefined) return undefined;
  let candidate: DirectCandidate;
  if (event.tool_name === "Edit") {
    if (!nonEmpty(input.old_string) || !nonEmpty(input.new_string) ||
      typeof response.originalFile !== "string" ||
      response.oldString !== input.old_string || response.newString !== input.new_string ||
      input.replace_all !== response.replaceAll ||
      (input.replace_all !== undefined && typeof input.replace_all !== "boolean")) return undefined;
    const original = response.originalFile;
    if (!original.includes(input.old_string)) return undefined;
    if (input.replace_all === true) {
      const occurrences = original.split(input.old_string).length - 1;
      const estimated = Buffer.byteLength(original) + occurrences *
        (Buffer.byteLength(input.new_string) - Buffer.byteLength(input.old_string));
      if (estimated > MAX_SOURCE_BYTES) return undefined;
    }
    const expected = input.replace_all === true
      ? original.replaceAll(input.old_string, input.new_string)
      : original.replace(input.old_string, input.new_string);
    if (!boundedSource(expected) || content.text !== expected || expected === original) return undefined;
    candidate = { operation: "update", path, addedLines: changedWholeLines(original, expected) };
  } else {
    if (typeof input.content !== "string" || input.content !== response.content ||
      content.text !== input.content ||
      (response.originalFile !== null && typeof response.originalFile !== "string") ||
      (typeof response.originalFile === "string" && response.originalFile === input.content)) return undefined;
    candidate = response.originalFile === null
      ? { operation: "add", path, addedLines: input.content.split(/\r?\n/u) }
      : { operation: "update", path, addedLines: changedWholeLines(response.originalFile, input.content) };
  }
  return Object.freeze({
    root: root.value.root,
    rootIdentity: root.value.rootIdentity,
    advicee: Object.freeze({
      host: "claude-code", hostVersion: "2.1.218",
      sessionId: event.session_id, turnId: null, toolUseId: event.tool_use_id,
      subagentId: event.agent_id ?? null,
    } satisfies DirectAdvicee),
    candidates: Object.freeze([Object.freeze({ ...candidate, path: relativePath })]),
  } satisfies DirectObservation);
});
