import type { PostEditLocation, VerifiedPatchHunk } from "./edit-attribution.ts"

/** Internal patch material; agent-specific parsers own the native syntax. */
export type PatchLine = { readonly kind: " " | "+" | "-"; readonly text: string }
export type PostEditPatchHunk = {
  readonly lines: ReadonlyArray<PatchLine>
  readonly placement:
    | { readonly kind: "unique-text" }
    | { readonly kind: "coordinates"; readonly startLine: number; readonly noFinalNewlineAt?: number }
}

export const parsePatchLine = (line: string): PatchLine | undefined => {
  const kind = line[0]
  return kind === " " || kind === "+" || kind === "-" ? { kind, text: line.slice(1) } : undefined
}

const location = (startLine: number, endLine: number, sourceLines: ReadonlyArray<string>): PostEditLocation => {
  const start = { line: startLine + 1, column: 1 }
  const end =
    endLine < sourceLines.length
      ? { line: endLine + 1, column: 1 }
      : { line: sourceLines.length, column: sourceLines.at(-1)!.length + 1 }
  return Object.freeze({ start: Object.freeze(start), end: Object.freeze(end) })
}

const invalidHunkSource = (relativePath: string, stableSource: string): boolean =>
  !relativePath ||
  relativePath.startsWith("/") ||
  relativePath.includes("\\") ||
  relativePath.includes("\0") ||
  relativePath.split("/").some((part) => !part || part === "." || part === "..") ||
  stableSource.includes("\r")

const uniquePostLocation = (
  postLines: ReadonlyArray<string>,
  sourceLines: ReadonlyArray<string>,
  previousEnd: number
): number | undefined => {
  if (postLines.length === 0) return undefined
  const matches: number[] = []
  for (let index = previousEnd; index + postLines.length <= sourceLines.length; index += 1) {
    if (postLines.every((line, offset) => sourceLines[index + offset] === line)) matches.push(index)
    if (matches.length > 1) return undefined
  }
  return matches.length === 1 ? matches[0] : undefined
}

const changedPostLocations = (
  hunk: ReadonlyArray<PatchLine>,
  relativePath: string,
  match: number,
  sourceLines: ReadonlyArray<string>
): VerifiedPatchHunk[] => {
  const result: VerifiedPatchHunk[] = []
  let postOffset = 0
  let changedStart: number | undefined
  let inserted = 0
  const emit = () => {
    if (changedStart === undefined) return
    result.push(
      Object.freeze({
        path: relativePath,
        verified: true,
        location: location(match + changedStart, match + changedStart + inserted, sourceLines)
      })
    )
    changedStart = undefined
    inserted = 0
  }
  for (const entry of hunk) {
    if (entry.kind === " ") {
      emit()
      postOffset += 1
    } else {
      changedStart ??= postOffset
      if (entry.kind === "+") {
        inserted += 1
        postOffset += 1
      }
    }
  }
  emit()
  return result
}

const addedPostLocations = (lines: ReadonlyArray<PatchLine>, path: string, match: number): VerifiedPatchHunk[] => {
  const result: VerifiedPatchHunk[] = []
  let offset = 0
  for (const entry of lines) {
    if (entry.kind === "+")
      result.push({
        path,
        verified: true,
        location: {
          start: { line: match + offset + 1, column: 1 },
          end: { line: match + offset + 1, column: entry.text.length + 1 }
        }
      })
    if (entry.kind !== "-") offset += 1
  }
  return result
}

const validPostCoordinates = (start: number, end: number, previousEnd: number, sourceLength: number): boolean =>
  Number.isSafeInteger(start) && start >= previousEnd && start < sourceLength && end <= sourceLength
const validFinalNewline = (
  markedLine: number | undefined,
  postLength: number,
  end: number,
  sourceLines: ReadonlyArray<string>,
  source: string
): boolean =>
  markedLine === undefined || (markedLine === postLength && end === sourceLines.length && !source.endsWith("\n"))
const postLocation = (
  hunk: PostEditPatchHunk,
  postLines: ReadonlyArray<string>,
  sourceLines: ReadonlyArray<string>,
  source: string,
  previousEnd: number
): number | undefined => {
  if (hunk.placement.kind === "unique-text") return uniquePostLocation(postLines, sourceLines, previousEnd)
  const start = hunk.placement.startLine - 1
  const end = start + postLines.length
  if (!validPostCoordinates(start, end, previousEnd, sourceLines.length)) return undefined
  if (!validFinalNewline(hunk.placement.noFinalNewlineAt, postLines.length, end, sourceLines, source)) return undefined
  return postLines.every((line, offset) => sourceLines[start + offset] === line) ? start : undefined
}

/** Verify native post-image material and derive the existing snapshot-bound ranges. */
export const verifyPostEditPatchHunks = (
  hunks: ReadonlyArray<PostEditPatchHunk>,
  relativePath: string,
  stableSource: string,
  spanKind: "added-lines" | "changed-blocks"
): { readonly hunks: ReadonlyArray<VerifiedPatchHunk>; readonly addedLines: ReadonlyArray<string> } | undefined => {
  if (invalidHunkSource(relativePath, stableSource)) return undefined
  const sourceLines = stableSource.split("\n")
  const result: VerifiedPatchHunk[] = []
  const addedLines: string[] = []
  let previousEnd = 0
  for (const hunk of hunks) {
    const postLines = hunk.lines.filter((entry) => entry.kind !== "-").map((entry) => entry.text)
    const match = postLocation(hunk, postLines, sourceLines, stableSource, previousEnd)
    if (match === undefined) return undefined
    result.push(
      ...(spanKind === "added-lines"
        ? addedPostLocations(hunk.lines, relativePath, match)
        : changedPostLocations(hunk.lines, relativePath, match, sourceLines))
    )
    addedLines.push(...hunk.lines.filter((entry) => entry.kind === "+").map((entry) => entry.text))
    previousEnd = match + postLines.length
  }
  return { hunks: Object.freeze(result), addedLines: Object.freeze(addedLines) }
}
