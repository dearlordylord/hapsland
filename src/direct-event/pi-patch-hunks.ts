import { parsePatchLine, verifyPostEditPatchHunks, type PatchLine, type PostEditPatchHunk } from "./patch-hunks.ts";

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
type Body = { lines: PatchLine[]; oldCount: number; newCount: number; addedCount: number; previousKind?: PatchLine["kind"]; noFinalNewlineAt?: number };
const markFinalLine = (body: Body): boolean => {
  if (body.previousKind === undefined || body.noFinalNewlineAt !== undefined) return false;
  if (body.previousKind !== "-") body.noFinalNewlineAt = body.newCount;
  delete body.previousKind;
  return true;
};
const bodyLine = (line: string, body: Body): boolean => {
  if (line === "\\ No newline at end of file") return markFinalLine(body);
  const entry = parsePatchLine(line);
  if (entry === undefined) return false;
  body.previousKind = entry.kind;
  body.lines.push(entry);
  if (entry.kind === "+" && ++body.addedCount > 64) return false;
  if (entry.kind !== "+") body.oldCount += 1;
  if (entry.kind !== "-") body.newCount += 1;
  return true;
};
const patchBodyLines = (patch: string, path: string): string[] | undefined => {
  const lines = patch.split("\n");
  if (lines.pop() !== "" || lines.shift() !== `--- ${path}` || lines.shift() !== `+++ ${path}`) return undefined;
  return lines;
};
const orderedHeader = (header: Header, priorOldEnd: number, priorNewEnd: number): boolean =>
  header.oldPosition >= priorOldEnd && header.newPosition >= priorNewEnd &&
  header.oldPosition - priorOldEnd === header.newPosition - priorNewEnd;
const completeBody = (body: Body, header: Header): boolean =>
  body.oldCount === header.oldCount && body.newCount === header.newCount &&
  body.lines.some(line => line.kind !== " ");
const parseBody = (lines: ReadonlyArray<string>, start: number, header: Header) => {
  const body: Body = { lines: [], oldCount: 0, newCount: 0, addedCount: 0 };
  let end = start;
  while (end < lines.length && !lines[end]!.startsWith("@@")) {
    if (!bodyLine(lines[end++]!, body)) return undefined;
  }
  return completeBody(body, header) ? { body, end } : undefined;
};
const coordinateHunk = (body: Body, header: Header): PostEditPatchHunk => ({
  lines: body.lines, placement: { kind: "coordinates", startLine: header.newPosition,
    ...(body.noFinalNewlineAt === undefined ? {} : { noFinalNewlineAt: body.noFinalNewlineAt }) },
});
const parsePatch = (patch: string, path: string): PostEditPatchHunk[] | undefined => {
  const lines = patchBodyLines(patch, path);
  if (lines === undefined) return undefined;
  const hunks: PostEditPatchHunk[] = [];
  let priorOldEnd = 1;
  let priorNewEnd = 1;
  let index = 0;
  let addedCount = 0;
  while (index < lines.length) {
    const header = parseHeader(lines[index++]!);
    if (header === undefined || !orderedHeader(header, priorOldEnd, priorNewEnd)) return undefined;
    const parsed = parseBody(lines, index, header);
    if (parsed === undefined) return undefined;
    index = parsed.end;
    addedCount += parsed.body.addedCount;
    if (addedCount > 64) return undefined;
    hunks.push(coordinateHunk(parsed.body, header));
    priorOldEnd = header.oldPosition + header.oldCount;
    priorNewEnd = header.newPosition + header.newCount;
  }
  return hunks;
};

/** Pi supplies native line coordinates; invalid coordinates never fall back to text search. */
export const verifyPiPostEditHunks = (patch: string, path: string, source: string, relativePath: string) => {
  const hunks = parsePatch(patch, path);
  if (hunks === undefined) return undefined;
  const verified = verifyPostEditPatchHunks(hunks, relativePath, source.replaceAll("\r\n", "\n").replaceAll("\r", "\n"), "added-lines");
  if (verified === undefined || !verified.addedLines.some(line => line.trim().length > 0)) return undefined;
  return verified;
};
