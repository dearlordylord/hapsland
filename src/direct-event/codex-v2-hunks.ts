import type { PostEditLocation, VerifiedPatchHunkV2 } from "./attribution-v2.ts";

type PatchLine = { readonly kind: " " | "+" | "-"; readonly text: string };
type PatchSection = { readonly path: string; readonly operation: "add" | "update" | "delete" | "move"; readonly hunks: ReadonlyArray<ReadonlyArray<PatchLine>> };

const MAX_COMMAND_BYTES = 65_536;

const parsePatch = (command: string): ReadonlyArray<PatchSection> | undefined => {
  if (Buffer.byteLength(command, "utf8") > MAX_COMMAND_BYTES || command.includes("\r")) return undefined;
  const lines = command.split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines[0] !== "*** Begin Patch" || lines.at(-1) !== "*** End Patch") return undefined;
  const sections: PatchSection[] = [];
  const paths = new Set<string>();
  let current: { path: string; operation: PatchSection["operation"]; hunks: PatchLine[][] } | undefined;
  let hunk: PatchLine[] | undefined;
  for (const line of lines.slice(1, -1)) {
    const file = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line);
    if (file !== null) {
      const path = file[2];
      if (path === undefined || path.trim() !== path || paths.has(path)) return undefined;
      paths.add(path);
      current = { path, operation: file[1]!.toLowerCase() as "add" | "update" | "delete", hunks: [] };
      sections.push(current);
      hunk = undefined;
    } else if (current === undefined) return undefined;
    else if (line.startsWith("*** Move to: ")) {
      if (current.operation !== "update" || line.slice(13).length === 0 || current.hunks.length > 0) return undefined;
      current.operation = "move";
    } else if (line === "@@" || line.startsWith("@@ ")) {
      if (current.operation !== "update" && current.operation !== "move") return undefined;
      if (hunk !== undefined && !hunk.some((entry) => entry.kind !== " ")) return undefined;
      hunk = [];
      current.hunks.push(hunk);
    } else if (line.startsWith("***")) return undefined;
    else if (current.operation === "update" || current.operation === "move") {
      if (hunk === undefined || ![" ", "+", "-"].includes(line[0] ?? "")) return undefined;
      hunk.push({ kind: line[0] as PatchLine["kind"], text: line.slice(1) });
    } else if (current.operation === "add") {
      if (!line.startsWith("+")) return undefined;
    } else return undefined;
  }
  if (sections.length === 0 || sections.length > 16 || sections.some((section) => section.operation === "update" &&
    (section.hunks.length === 0 || section.hunks.some((part) => !part.some((entry) => entry.kind !== " "))))) return undefined;
  return sections;
};

const location = (startLine: number, endLine: number, sourceLines: ReadonlyArray<string>): PostEditLocation => {
  const start = { line: startLine + 1, column: 1 };
  const end = endLine < sourceLines.length
    ? { line: endLine + 1, column: 1 }
    : { line: sourceLines.length, column: sourceLines.at(-1)!.length + 1 };
  return Object.freeze({ start: Object.freeze(start), end: Object.freeze(end) });
};

/** Check Update hunk locations against one stable post-edit source snapshot. */
export const verifyCodexPostEditHunks = (
  command: string,
  relativePath: string,
  stableSource: string,
): ReadonlyArray<VerifiedPatchHunkV2> | undefined => {
  if (!relativePath || relativePath.startsWith("/") || relativePath.includes("\\") || relativePath.includes("\0") ||
    relativePath.split("/").some((part) => !part || part === "." || part === "..") || stableSource.includes("\r")) return undefined;
  const sections = parsePatch(command);
  const section = sections?.find((candidate) => candidate.path === relativePath);
  if (section?.operation !== "update") return undefined;
  const sourceLines = stableSource.split("\n");
  const result: VerifiedPatchHunkV2[] = [];
  let previousEnd = 0;
  for (const hunk of section.hunks) {
    const postLines = hunk.filter((entry) => entry.kind !== "-").map((entry) => entry.text);
    // A deletion without any post-edit anchor has no verifiable position.
    if (postLines.length === 0) return undefined;
    const matches: number[] = [];
    for (let index = previousEnd; index + postLines.length <= sourceLines.length; index += 1) {
      if (postLines.every((line, offset) => sourceLines[index + offset] === line)) matches.push(index);
      if (matches.length > 1) return undefined;
    }
    if (matches.length !== 1) return undefined;
    const match = matches[0]!;
    let postOffset = 0;
    let changedStart: number | undefined;
    let inserted = 0;
    const emit = () => {
      if (changedStart === undefined) return;
      result.push(Object.freeze({ path: relativePath, verified: true, location: location(match + changedStart, match + changedStart + inserted, sourceLines) }));
      changedStart = undefined;
      inserted = 0;
    };
    for (const entry of hunk) {
      if (entry.kind === " ") { emit(); postOffset += 1; }
      else {
        changedStart ??= postOffset;
        if (entry.kind === "+") { inserted += 1; postOffset += 1; }
      }
    }
    emit();
    previousEnd = match + postLines.length;
  }
  return Object.freeze(result);
};
