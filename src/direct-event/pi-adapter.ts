import { relative, resolve, isAbsolute, sep } from "node:path";
import * as Effect from "effect/Effect";
import { discoverPhysicalWorkingTreeRoot } from "../repository/root.ts";
import { loadConfiguration } from "../configuration/load.ts";
import { captureStable, MAX_SOURCE_BYTES, type CaptureHooks } from "./capture.ts";
import { eligibleNamedPath, resolvedDirectFilePolicy } from "./selection.ts";
import type { DirectAdvicee, DirectObservation, PhysicalRootIdentity } from "./model.ts";
import type { VerifiedPatchHunk } from "./edit-attribution.ts";

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const nonempty = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const ascii = (value: string): boolean => /^[\x00-\x7f]*$/u.test(value);
const identity = (value: unknown) => {
  const event = record(value);
  if (event === undefined || event.host_version !== "1.0.0" || !nonempty(event.cwd) ||
    !nonempty(event.session_id) || !nonempty(event.tool_use_id) ||
    "parentToolCallId" in event || "agent_id" in event) return undefined;
  return { event, advicee: {
    host: "pi", hostVersion: "1.0.0", sessionId: event.session_id,
    turnId: null, toolUseId: event.tool_use_id, subagentId: null,
  } satisfies DirectAdvicee };
};
export const adaptPiHookIdentity = Effect.fn("DirectEvent.adaptPiHookIdentity")(function* (value: unknown) {
  const identified = identity(value);
  if (identified === undefined) return undefined;
  const root = yield* discoverPhysicalWorkingTreeRoot(identified.event.cwd as string).pipe(Effect.option);
  return root._tag === "None" ? undefined : { root: root.value.root, advicee: identified.advicee };
});

type NativeEdit = { oldText: string; newText: string };
type Replacement = NativeEdit & { start: number; index: number };
const normalizeLF = (text: string): string => text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
const matchingReplacements = (before: string, edits: readonly NativeEdit[], consumed: Set<number>): Replacement[] | undefined => {
  const matches: Replacement[] = [];
  for (const [index, edit] of edits.entries()) {
    const oldText = normalizeLF(edit.oldText);
    const start = before.indexOf(oldText);
    if (start < 0) continue;
    if (consumed.has(index) || before.indexOf(oldText, start + 1) >= 0) return undefined;
    matches.push({ start, oldText, newText: normalizeLF(edit.newText), index });
  }
  return matches.sort((a, b) => a.start - b.start);
};
const replaceHunkMaterial = (before: string, replacements: readonly Replacement[]): string | undefined => {
  let cursor = 0;
  let expected = "";
  for (const edit of replacements) {
    if (edit.start < cursor) return undefined;
    expected += before.slice(cursor, edit.start) + edit.newText;
    cursor = edit.start + edit.oldText.length;
  }
  return expected + before.slice(cursor);
};
/** Compare only native hunk material, never construct a previous file image. */
const verifyNativeReplacements = (before: string, after: string, edits: readonly NativeEdit[], consumed: Set<number>): boolean => {
  const replacements = matchingReplacements(before, edits, consumed);
  if (replacements === undefined || replaceHunkMaterial(before, replacements) !== after) return false;
  for (const edit of replacements) consumed.add(edit.index);
  return true;
};

type PatchFrame = {
  current: string[]; source: string; relativePath: string;
  hunks: VerifiedPatchHunk[]; addedLines: string[];
  priorOldEnd: number; priorNewEnd: number;
};
type Header = { oldPosition: number; newPosition: number; oldCount: number; newCount: number };
const parseHeader = (line: string): Header | undefined => {
  const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@$/u.exec(line);
  if (match === null) return undefined;
  const oldStart = Number(match[1]);
  const oldCount = Number(match[2] ?? 1);
  const newStart = Number(match[3]);
  const newCount = Number(match[4] ?? 1);
  if (![oldStart, oldCount, newStart, newCount].every(Number.isSafeInteger)) return undefined;
  return { oldCount, newCount, oldPosition: oldCount === 0 ? oldStart + 1 : oldStart,
    newPosition: newCount === 0 ? newStart + 1 : newStart };
};
const validCoordinates = (header: Header, frame: PatchFrame): boolean =>
  header.oldPosition >= frame.priorOldEnd && header.newPosition >= frame.priorNewEnd &&
  header.oldPosition - frame.priorOldEnd === header.newPosition - frame.priorNewEnd &&
  header.newPosition + header.newCount - 1 <= frame.current.length;
type Body = { oldLines: string[]; newLines: string[]; previousKind?: string; oldNoNewline: boolean; newNoNewline: boolean };
const noNewline = (body: Body, header: Header, frame: PatchFrame): boolean => {
  const kind = body.previousKind;
  if (kind === undefined) return false;
  if (kind !== "-" && (header.newPosition + body.newLines.length - 1 !== frame.current.length ||
    /[\r\n]$/u.test(frame.source))) return false;
  body.oldNoNewline ||= kind !== "+";
  body.newNoNewline ||= kind !== "-";
  delete body.previousKind;
  return true;
};
const postImageLine = (line: string, body: Body, header: Header, frame: PatchFrame): boolean => {
  const lineNumber = header.newPosition + body.newLines.length;
  if (frame.current[lineNumber - 1] !== line.slice(1)) return false;
  body.newLines.push(line.slice(1));
  if (line[0] !== "+") return true;
  frame.addedLines.push(line.slice(1));
  frame.hunks.push({ path: frame.relativePath, verified: true, location: {
    start: { line: lineNumber, column: 1 }, end: { line: lineNumber, column: line.length },
  } });
  return frame.hunks.length <= 64;
};
const bodyLine = (line: string, body: Body, header: Header, frame: PatchFrame): boolean => {
  if (line === "\\ No newline at end of file") return noNewline(body, header, frame);
  const kind = line[0];
  if (kind !== " " && kind !== "+" && kind !== "-") return false;
  body.previousKind = kind;
  if (kind !== "+") body.oldLines.push(line.slice(1));
  return kind === "-" || postImageLine(line, body, header, frame);
};
const bodyText = (lines: string[], noEnding: boolean): string => lines.join("\n") + (noEnding || lines.length === 0 ? "" : "\n");
const verifyPatchBody = (lines: string[], header: Header, frame: PatchFrame,
  edits: readonly { oldText: string; newText: string }[], consumed: Set<number>): boolean => {
  const body: Body = { oldLines: [], newLines: [], oldNoNewline: false, newNoNewline: false };
  for (const line of lines) if (!bodyLine(line, body, header, frame)) return false;
  if (body.oldLines.length !== header.oldCount || body.newLines.length !== header.newCount) return false;
  return verifyNativeReplacements(bodyText(body.oldLines, body.oldNoNewline), bodyText(body.newLines, body.newNoNewline), edits, consumed);
};
const patchBodyLines = (patch: string, path: string): string[] | undefined => {
  const lines = patch.split("\n");
  if (lines.pop() !== "" || lines.shift() !== `--- ${path}` || lines.shift() !== `+++ ${path}`) return undefined;
  return lines;
};
const patchBodyEnd = (lines: readonly string[], start: number): number => {
  let end = start;
  while (end < lines.length && !lines[end]!.startsWith("@@")) end += 1;
  return end;
};
const reviewablePatch = (frame: PatchFrame, consumed: Set<number>, editCount: number): boolean =>
  consumed.size === editCount && frame.addedLines.some((line) => line.trim().length > 0);
/** Pi's unified patch contains post-image coordinates, never display-diff coordinates. */
const verifyPatch = (patch: string, path: string, source: string, relativePath: string, edits: readonly { oldText: string; newText: string }[]) => {
  const lines = patchBodyLines(patch, path);
  if (lines === undefined) return undefined;
  const frame: PatchFrame = { current: source.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n"),
    source, relativePath, hunks: [], addedLines: [], priorOldEnd: 1, priorNewEnd: 1 };
  const consumed = new Set<number>();
  let index = 0;
  while (index < lines.length) {
    const header = parseHeader(lines[index++]!);
    if (header === undefined || !validCoordinates(header, frame)) return undefined;
    const start = index;
    index = patchBodyEnd(lines, index);
    if (!verifyPatchBody(lines.slice(start, index), header, frame, edits, consumed)) return undefined;
    frame.priorOldEnd = header.oldPosition + header.oldCount;
    frame.priorNewEnd = header.newPosition + header.newCount;
  }
  if (!reviewablePatch(frame, consumed, edits.length)) return undefined;
  return { hunks: frame.hunks, addedLines: frame.addedLines };
};
const boundedAscii = (value: unknown, maxBytes: number): value is string =>
  nonempty(value) && Buffer.byteLength(value) <= maxBytes && ascii(value);
const nativeEdit = (value: unknown): NativeEdit | undefined => {
  const edit = record(value);
  if (edit === undefined || !nonempty(edit.oldText) || typeof edit.newText !== "string") return undefined;
  if (!ascii(edit.oldText) || !ascii(edit.newText)) return undefined;
  return { oldText: edit.oldText, newText: edit.newText };
};
const nativeEdits = (value: unknown): NativeEdit[] | undefined => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64) return undefined;
  let bytes = 0;
  const edits: NativeEdit[] = [];
  for (const item of value) {
    const edit = nativeEdit(item);
    if (edit === undefined) return undefined;
    bytes += Buffer.byteLength(edit.oldText) + Buffer.byteLength(edit.newText);
    if (bytes > MAX_SOURCE_BYTES) return undefined;
    edits.push(edit);
  }
  return edits;
};
const successfulNativeEdit = (event: Record<string, unknown>): boolean => event.tool_name === "edit" && event.isError === false;
const payload = (event: Record<string, unknown>) => {
  if (!successfulNativeEdit(event)) return undefined;
  const input = record(event.input);
  const details = record(event.details);
  if (input === undefined || details === undefined) return undefined;
  if (!boundedAscii(input.path, 16_384) || !boundedAscii(details.patch, MAX_SOURCE_BYTES)) return undefined;
  const edits = nativeEdits(input.edits);
  return edits === undefined ? undefined : { path: input.path, patch: details.patch, edits };
};
type AdapterOptions = { readonly userConfigPath?: string; readonly captureHooks?: CaptureHooks };
const rootRelativePath = (root: string, cwd: string, namedPath: string): string | undefined => {
  const path = relative(root, resolve(cwd, namedPath));
  return isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`) ? undefined : path;
};
const captureSelectedPiFile = Effect.fn("DirectEvent.captureSelectedPiFile")(function* (
  root: {
    root: string; rootIdentity: PhysicalRootIdentity;
  }, cwd: string, namedPath: string, options: AdapterOptions,
) {
  const path = rootRelativePath(root.root, cwd, namedPath);
  if (path === undefined) return undefined;
  const configuration = yield* loadConfiguration(root.root, options.userConfigPath === undefined ? {} : { userConfigPath: options.userConfigPath });
  const eligible = yield* eligibleNamedPath(root.root, path, resolvedDirectFilePolicy(configuration.policy), root.rootIdentity);
  if (eligible === undefined) return undefined;
  const source = yield* captureStable(root.root, eligible, options.captureHooks, root.rootIdentity);
  return source === undefined || !ascii(source.text) ? undefined : { source, eligible };
});
export const adaptPiDirectEvent = Effect.fn("DirectEvent.adaptPiDirectEvent")(function* (
  value: unknown,
  options: { readonly userConfigPath?: string; readonly captureHooks?: CaptureHooks } = {},
) {
  const identified = identity(value);
  if (identified === undefined) return undefined;
  const input = payload(identified.event);
  if (input === undefined) return undefined;
  const cwd = identified.event.cwd as string;
  const root = yield* discoverPhysicalWorkingTreeRoot(cwd).pipe(Effect.option);
  if (root._tag === "None") return undefined;
  const captured = yield* captureSelectedPiFile(root.value, cwd, input.path, options);
  if (captured === undefined) return undefined;
  const { source, eligible } = captured;
  const evidence = verifyPatch(input.patch, input.path, source.text, eligible.relativePath, input.edits);
  if (evidence === undefined) return undefined;
  return {
    root: root.value.root, rootIdentity: root.value.rootIdentity, advicee: identified.advicee,
    candidates: [{ operation: "update", path: eligible.relativePath, addedLines: evidence.addedLines }],
    verifiedPostEditHunks: { path: eligible.relativePath, contentHash: source.contentHash, hunks: evidence.hunks },
  } satisfies DirectObservation;
});
