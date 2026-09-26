import { execFile } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import * as Effect from "effect/Effect";
import { captureStable, MAX_SOURCE_BYTES, type CaptureHooks } from "../../direct-event/capture.ts";
import { eligibleNamedPath } from "../../direct-event/selection.ts";
import type { DirectCandidate, DirectObservation, DirectAdvicee, PhysicalRootIdentity } from "../../direct-event/model.ts";

const exec = promisify(execFile);
const object = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const nonempty = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const MAX_ENVELOPE_TEXT = 256_000;
const boundedSource = (value: unknown): value is string =>
  typeof value === "string" && Buffer.byteLength(value, "utf8") <= MAX_SOURCE_BYTES;
const changedUniqueLines = (before: string, after: string, current: string): ReadonlyArray<string> | undefined => {
  const prior = new Set(before.split(/\r?\n/u).map((line) => line.trim()));
  const lines = after.split(/\r?\n/u).filter((line) => line.trim().length > 0 && !prior.has(line.trim()));
  if (lines.length === 0) return undefined;
  const counts = new Map<string, number>();
  for (const line of current.split(/\r?\n/u)) {
    const key = line.trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return lines.every((line) => counts.get(line.trim()) === 1) ? lines : undefined;
};

const rootFor = async (cwd: string) => {
  const physicalCwd = await realpath(cwd);
  const result = await exec("git", ["--literal-pathspecs", "-C", physicalCwd, "rev-parse", "--show-toplevel"],
    { timeout: 2_000, maxBuffer: 65_536 });
  const root = await realpath(result.stdout.trim());
  const gitResult = await exec("git", ["--literal-pathspecs", "-C", root, "rev-parse", "--absolute-git-dir"],
    { timeout: 2_000, maxBuffer: 65_536 });
  const gitDirectory = await realpath(gitResult.stdout.trim());
  const [rootStat, gitStat] = await Promise.all([stat(root, { bigint: true }), stat(gitDirectory, { bigint: true })]);
  const rootIdentity: PhysicalRootIdentity = {
    rootDevice: String(rootStat.dev), rootInode: String(rootStat.ino), gitDirectory,
    gitDevice: String(gitStat.dev), gitInode: String(gitStat.ino),
  };
  return { root, rootIdentity, physicalCwd };
};

/** Exact OpenCode 1.14.44 tool.execute.after shape. The tool call is the advice lifetime. */
export const adaptOpenCodeDirectEvent = Effect.fn("DirectEvent.adaptOpenCodeDirectEvent")(function* (
  value: unknown,
  captureHooks: CaptureHooks = {},
) {
  const envelope = object(value);
  const input = object(envelope?.input);
  const output = object(envelope?.output);
  const args = object(input?.args);
  const metadata = object(output?.metadata);
  if (input === undefined || output === undefined || args === undefined || metadata === undefined ||
    !nonempty(envelope?.cwd) || !nonempty(input.sessionID) || !nonempty(input.callID) ||
    (input.tool !== "edit" && input.tool !== "write") || !nonempty(args.filePath) ||
    !nonempty(output.output) || !nonempty(output.title) ||
    output.isError === true || output.error === true || metadata.truncated === true) return undefined;
  const cwd = envelope.cwd;
  const path = args.filePath;
  if (Buffer.byteLength(path) > 16_384 || Buffer.byteLength(output.output) > MAX_ENVELOPE_TEXT ||
      Buffer.byteLength(output.title) > 16_384) return undefined;
  if ((nonempty(metadata.diff) && Buffer.byteLength(metadata.diff) > MAX_ENVELOPE_TEXT) ||
      (nonempty(metadata.filediff) && Buffer.byteLength(metadata.filediff) > MAX_ENVELOPE_TEXT)) return undefined;
  if (input.tool === "edit" && (!boundedSource(args.oldString) || !boundedSource(args.newString))) return undefined;
  if (input.tool === "write" && !boundedSource(args.content)) return undefined;
  const root = yield* Effect.tryPromise(() => rootFor(cwd)).pipe(Effect.option);
  if (root._tag === "None") return undefined;
  const fromRoot = relative(root.value.root, root.value.physicalCwd);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) return undefined;
  const absolute = resolve(cwd, path);
  const fromCwd = relative(resolve(cwd), absolute);
  if (fromCwd === ".." || fromCwd.startsWith(`..${sep}`) || isAbsolute(fromCwd)) return undefined;
  const relativePath = [fromRoot, fromCwd].filter(Boolean).join(sep).replaceAll(sep, "/");
  const eligible = yield* eligibleNamedPath(root.value.root, relativePath, undefined, root.value.rootIdentity);
  if (eligible === undefined) return undefined;
  const current = yield* captureStable(root.value.root, eligible, captureHooks, root.value.rootIdentity);
  if (current === undefined) return undefined;
  let candidate: DirectCandidate;
  if (input.tool === "edit") {
    if (!nonempty(args.oldString) || !nonempty(args.newString) ||
      (args.replaceAll !== undefined && typeof args.replaceAll !== "boolean") ||
      current.text.includes(args.oldString) || !current.text.includes(args.newString) ||
      !nonempty(metadata.diff) && !nonempty(metadata.filediff)) return undefined;
    const addedLines = changedUniqueLines(args.oldString, args.newString, current.text);
    if (addedLines === undefined) return undefined;
    candidate = { operation: "update", path: relativePath, addedLines };
  } else {
    if (typeof args.content !== "string" || args.content !== current.text ||
      metadata.exists !== false) return undefined;
    candidate = { operation: "add", path: relativePath,
      addedLines: args.content.split(/\r?\n/u) };
  }
  const advicee: DirectAdvicee = Object.freeze({
    host: "opencode", hostVersion: "1.14.44", sessionId: input.sessionID,
    turnId: null, toolUseId: input.callID, subagentId: null,
  });
  return Object.freeze({ root: root.value.root, rootIdentity: root.value.rootIdentity,
    advicee, candidates: Object.freeze([Object.freeze(candidate)]) } satisfies DirectObservation);
});
