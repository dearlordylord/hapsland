import type { PostEditLocation, VerifiedPatchHunk } from "./edit-attribution.ts";

type PatchLine = { readonly kind: " " | "+" | "-"; readonly text: string };
type PatchSection = {
  readonly path: string;
  readonly operation: "add" | "update" | "delete" | "move";
  readonly hunks: ReadonlyArray<ReadonlyArray<PatchLine>>;
};

const MAX_COMMAND_BYTES = 65_536;

type MutableSection = { path: string; operation: PatchSection["operation"]; hunks: PatchLine[][] };
type PatchParserState = {
  sections: MutableSection[];
  paths: Set<string>;
  current?: MutableSection;
  hunk?: PatchLine[];
};

const fileOperation = (name: string | undefined): PatchSection["operation"] | undefined => {
  switch (name) {
    case "Add":
      return "add";
    case "Update":
      return "update";
    case "Delete":
      return "delete";
    default:
      return undefined;
  }
};

const beginFile = (state: PatchParserState, file: RegExpExecArray): boolean => {
  const path = file[2];
  const operation = fileOperation(file[1]);
  if (path === undefined || path.trim() !== path || state.paths.has(path) || operation === undefined) return false;
  state.paths.add(path);
  state.current = { path, operation, hunks: [] };
  state.sections.push(state.current);
  delete state.hunk;
  return true;
};

const moveFile = (section: MutableSection, line: string): boolean => {
  if (section.operation !== "update" || line.slice(13).length === 0 || section.hunks.length > 0) return false;
  section.operation = "move";
  return true;
};

const changedHunk = (hunk: ReadonlyArray<PatchLine>): boolean => hunk.some((entry) => entry.kind !== " ");
const beginHunk = (state: PatchParserState, section: MutableSection): boolean => {
  if (section.operation !== "update" && section.operation !== "move") return false;
  if (state.hunk !== undefined && !changedHunk(state.hunk)) return false;
  state.hunk = [];
  section.hunks.push(state.hunk);
  return true;
};

const patchLineKind = (value: string | undefined): PatchLine["kind"] | undefined => {
  switch (value) {
    case " ":
    case "+":
    case "-":
      return value;
    default:
      return undefined;
  }
};

const appendPatchContent = (state: PatchParserState, section: MutableSection, line: string): boolean => {
  if (section.operation === "add") return line.startsWith("+");
  if (section.operation !== "update" && section.operation !== "move") return false;
  const kind = patchLineKind(line[0]);
  if (state.hunk === undefined || kind === undefined) return false;
  state.hunk.push({ kind, text: line.slice(1) });
  return true;
};

const consumePatchLine = (state: PatchParserState, line: string): boolean => {
  const file = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line);
  if (file !== null) return beginFile(state, file);
  const section = state.current;
  if (section === undefined) return false;
  if (line.startsWith("*** Move to: ")) return moveFile(section, line);
  if (line === "@@" || line.startsWith("@@ ")) return beginHunk(state, section);
  if (line.startsWith("***")) return false;
  return appendPatchContent(state, section, line);
};

const incompleteUpdate = (section: PatchSection): boolean =>
  section.operation === "update" && (section.hunks.length === 0 || section.hunks.some((hunk) => !changedHunk(hunk)));

const patchEnvelope = (command: string): string[] | undefined => {
  if (Buffer.byteLength(command, "utf8") > MAX_COMMAND_BYTES || command.includes("\r")) return undefined;
  const lines = command.split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines[0] !== "*** Begin Patch" || lines.at(-1) !== "*** End Patch") return undefined;
  return lines.slice(1, -1);
};

const parsePatch = (command: string): ReadonlyArray<PatchSection> | undefined => {
  const lines = patchEnvelope(command);
  if (lines === undefined) return undefined;
  const state: PatchParserState = { sections: [], paths: new Set() };
  if (!lines.every((line) => consumePatchLine(state, line))) return undefined;
  if (state.sections.length === 0 || state.sections.length > 16 || state.sections.some(incompleteUpdate))
    return undefined;
  return state.sections;
};

const location = (startLine: number, endLine: number, sourceLines: ReadonlyArray<string>): PostEditLocation => {
  const start = { line: startLine + 1, column: 1 };
  const end =
    endLine < sourceLines.length
      ? { line: endLine + 1, column: 1 }
      : { line: sourceLines.length, column: sourceLines.at(-1)!.length + 1 };
  return Object.freeze({ start: Object.freeze(start), end: Object.freeze(end) });
};

const invalidHunkSource = (relativePath: string, stableSource: string): boolean =>
  !relativePath ||
  relativePath.startsWith("/") ||
  relativePath.includes("\\") ||
  relativePath.includes("\0") ||
  relativePath.split("/").some((part) => !part || part === "." || part === "..") ||
  stableSource.includes("\r");

const uniquePostLocation = (
  postLines: ReadonlyArray<string>,
  sourceLines: ReadonlyArray<string>,
  previousEnd: number,
): number | undefined => {
  if (postLines.length === 0) return undefined;
  const matches: number[] = [];
  for (let index = previousEnd; index + postLines.length <= sourceLines.length; index += 1) {
    if (postLines.every((line, offset) => sourceLines[index + offset] === line)) matches.push(index);
    if (matches.length > 1) return undefined;
  }
  return matches.length === 1 ? matches[0] : undefined;
};

const changedPostLocations = (
  hunk: ReadonlyArray<PatchLine>,
  relativePath: string,
  match: number,
  sourceLines: ReadonlyArray<string>,
): VerifiedPatchHunk[] => {
  const result: VerifiedPatchHunk[] = [];
  let postOffset = 0;
  let changedStart: number | undefined;
  let inserted = 0;
  const emit = () => {
    if (changedStart === undefined) return;
    result.push(
      Object.freeze({
        path: relativePath,
        verified: true,
        location: location(match + changedStart, match + changedStart + inserted, sourceLines),
      }),
    );
    changedStart = undefined;
    inserted = 0;
  };
  for (const entry of hunk) {
    if (entry.kind === " ") {
      emit();
      postOffset += 1;
    } else {
      changedStart ??= postOffset;
      if (entry.kind === "+") {
        inserted += 1;
        postOffset += 1;
      }
    }
  }
  emit();
  return result;
};

/** Check Update hunk locations against one stable post-edit source snapshot. */
export const verifyCodexPostEditHunks = (
  command: string,
  relativePath: string,
  stableSource: string,
): ReadonlyArray<VerifiedPatchHunk> | undefined => {
  if (invalidHunkSource(relativePath, stableSource)) return undefined;
  const sections = parsePatch(command);
  const section = sections?.find((candidate) => candidate.path === relativePath);
  if (section?.operation !== "update") return undefined;
  const sourceLines = stableSource.split("\n");
  const result: VerifiedPatchHunk[] = [];
  let previousEnd = 0;
  for (const hunk of section.hunks) {
    const postLines = hunk.filter((entry) => entry.kind !== "-").map((entry) => entry.text);
    // A deletion without a post-edit anchor cannot be positioned.
    const match = uniquePostLocation(postLines, sourceLines, previousEnd);
    if (match === undefined) return undefined;
    result.push(...changedPostLocations(hunk, relativePath, match, sourceLines));
    previousEnd = match + postLines.length;
  }
  return Object.freeze(result);
};
