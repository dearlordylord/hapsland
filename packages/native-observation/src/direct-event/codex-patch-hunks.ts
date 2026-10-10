import type { VerifiedPatchHunk } from "./edit-attribution.ts"
import { parsePatchLine, verifyPostEditPatchHunks, type PatchLine, type PostEditPatchHunk } from "./patch-hunks.ts"

type PatchSection = {
  readonly path: string
  readonly operation: "add" | "update" | "delete" | "move"
  readonly hunks: ReadonlyArray<ReadonlyArray<PatchLine>>
  readonly endOfFile?: true
}

const MAX_COMMAND_BYTES = 65_536

type MutableSection = { path: string; operation: PatchSection["operation"]; hunks: PatchLine[][]; endOfFile?: true }
type PatchParserState = { sections: MutableSection[]; paths: Set<string>; current?: MutableSection; hunk?: PatchLine[] }

const fileOperation = (name: string | undefined): PatchSection["operation"] | undefined => {
  switch (name) {
    case "Add":
      return "add"
    case "Update":
      return "update"
    case "Delete":
      return "delete"
    default:
      return undefined
  }
}

const beginFile = (state: PatchParserState, file: RegExpExecArray): boolean => {
  const path = file[2]
  const operation = fileOperation(file[1])
  if (path === undefined || path.trim() !== path || state.paths.has(path) || operation === undefined) return false
  state.paths.add(path)
  state.current = { path, operation, hunks: [] }
  state.sections.push(state.current)
  delete state.hunk
  return true
}

const moveFile = (section: MutableSection, line: string): boolean => {
  if (section.operation !== "update" || line.slice(13).length === 0 || section.hunks.length > 0) return false
  section.operation = "move"
  return true
}

const changedHunk = (hunk: ReadonlyArray<PatchLine>): boolean => hunk.some((entry) => entry.kind !== " ")
const beginHunk = (state: PatchParserState, section: MutableSection): boolean => {
  if (section.operation !== "update" && section.operation !== "move") return false
  if (state.hunk !== undefined && !changedHunk(state.hunk)) return false
  state.hunk = []
  section.hunks.push(state.hunk)
  return true
}

const appendPatchContent = (state: PatchParserState, section: MutableSection, line: string): boolean => {
  if (section.operation === "add") return line.startsWith("+")
  if (section.operation !== "update" && section.operation !== "move") return false
  const entry = parsePatchLine(line)
  if (state.hunk === undefined || entry === undefined) return false
  state.hunk.push(entry)
  return true
}

const endPatchSection = (state: PatchParserState, section: MutableSection): boolean => {
  if (state.hunk === undefined || !changedHunk(state.hunk)) return false
  section.endOfFile = true
  return true
}
const hunkMarker = (line: string): boolean => line === "@@" || line.startsWith("@@ ")
const consumePatchLine = (state: PatchParserState, line: string): boolean => {
  const file = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line)
  if (file !== null) return beginFile(state, file)
  const section = state.current
  if (section === undefined) return false
  if (section.endOfFile) return false
  if (line === "*** End of File") return endPatchSection(state, section)
  if (line.startsWith("*** Move to: ")) return moveFile(section, line)
  if (hunkMarker(line)) return beginHunk(state, section)
  if (line.startsWith("***")) return false
  return appendPatchContent(state, section, line)
}

const incompleteUpdate = (section: PatchSection): boolean =>
  section.operation === "update" && (section.hunks.length === 0 || section.hunks.some((hunk) => !changedHunk(hunk)))

const patchEnvelope = (command: string): string[] | undefined => {
  if (Buffer.byteLength(command, "utf8") > MAX_COMMAND_BYTES || command.includes("\r")) return undefined
  const lines = command.split("\n")
  if (lines.at(-1) === "") lines.pop()
  if (lines[0] !== "*** Begin Patch" || lines.at(-1) !== "*** End Patch") return undefined
  return lines.slice(1, -1)
}

const parsePatch = (command: string): ReadonlyArray<PatchSection> | undefined => {
  const lines = patchEnvelope(command)
  if (lines === undefined) return undefined
  const state: PatchParserState = { sections: [], paths: new Set() }
  if (!lines.every((line) => consumePatchLine(state, line))) return undefined
  if (state.sections.length === 0 || state.sections.length > 16 || state.sections.some(incompleteUpdate))
    return undefined
  return state.sections
}

/** Check Update hunk locations against one stable post-edit source snapshot. */
export const verifyCodexPostEditHunks = (
  command: string,
  relativePath: string,
  stableSource: string
): ReadonlyArray<VerifiedPatchHunk> | undefined => {
  const sections = parsePatch(command)
  const section = sections?.find((candidate) => candidate.path === relativePath)
  if (section?.operation !== "update") return undefined
  return verifyPostEditPatchHunks(
    section.hunks.map((lines, index): PostEditPatchHunk => {
      if (!section.endOfFile || index !== section.hunks.length - 1) return { lines, placement: { kind: "unique-text" } }
      const sourceLineCount = stableSource.split("\n").length - Number(stableSource.endsWith("\n"))
      const postLineCount = lines.filter((entry) => entry.kind !== "-").length
      return { lines, placement: { kind: "coordinates", startLine: sourceLineCount - postLineCount + 1 } }
    }),
    relativePath,
    stableSource,
    "changed-blocks"
  )?.hunks
}
