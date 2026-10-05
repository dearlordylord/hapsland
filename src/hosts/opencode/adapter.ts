import { discoverPhysicalWorkingTreeRoot } from "../../repository/root.ts"
import { isAbsolute, relative, resolve, sep } from "node:path"
import * as Effect from "effect/Effect"
import { captureStable, MAX_SOURCE_BYTES, type CaptureHooks } from "../../direct-event/capture.ts"
import { eligibleNamedPath } from "../../direct-event/selection.ts"
import type { DirectCandidate, DirectObservation, DirectAdvicee } from "../../direct-event/model.ts"

const object = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
const nonempty = (value: unknown): value is string => typeof value === "string" && value.length > 0
const MAX_ENVELOPE_TEXT = 256_000
const boundedSource = (value: unknown): value is string =>
  typeof value === "string" && Buffer.byteLength(value, "utf8") <= MAX_SOURCE_BYTES
const changedUniqueLines = (before: string, after: string, current: string): ReadonlyArray<string> | undefined => {
  const prior = new Set(before.split(/\r?\n/u).map((line) => line.trim()))
  const lines = after.split(/\r?\n/u).filter((line) => line.trim().length > 0 && !prior.has(line.trim()))
  if (lines.length === 0) return undefined
  const counts = new Map<string, number>()
  for (const line of current.split(/\r?\n/u)) {
    const key = line.trim()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return lines.every((line) => counts.get(line.trim()) === 1) ? lines : undefined
}

type OpenCodeInput = {
  readonly tool: "edit" | "write"
  readonly sessionID: string
  readonly callID: string
  readonly args: Record<string, unknown>
}
type OpenCodeOutput = { readonly output: string; readonly title: string; readonly metadata: Record<string, unknown> }
const supportedTool = (tool: unknown): tool is OpenCodeInput["tool"] => tool === "edit" || tool === "write"
const openCodeInput = (value: unknown): OpenCodeInput | undefined => {
  const input = object(value)
  const args = object(input?.args)
  if (input === undefined || args === undefined) return undefined
  if (!nonempty(input.sessionID) || !nonempty(input.callID) || !supportedTool(input.tool)) return undefined
  return { tool: input.tool, sessionID: input.sessionID, callID: input.callID, args }
}
const successfulOutput = (output: Record<string, unknown>, metadata: Record<string, unknown>): boolean =>
  output.isError !== true && output.error !== true && metadata.truncated !== true
const openCodeOutput = (value: unknown): OpenCodeOutput | undefined => {
  const output = object(value)
  const metadata = object(output?.metadata)
  if (output === undefined || metadata === undefined) return undefined
  if (!nonempty(output.output) || !nonempty(output.title) || !successfulOutput(output, metadata)) return undefined
  return { output: output.output, title: output.title, metadata }
}
const optionalDiffWithinLimit = (value: unknown): boolean =>
  !nonempty(value) || Buffer.byteLength(value) <= MAX_ENVELOPE_TEXT
const boundedOpenCodeOutput = (output: OpenCodeOutput): boolean =>
  Buffer.byteLength(output.output) <= MAX_ENVELOPE_TEXT &&
  Buffer.byteLength(output.title) <= 16_384 &&
  optionalDiffWithinLimit(output.metadata.diff) &&
  optionalDiffWithinLimit(output.metadata.filediff)
const boundedToolSource = (input: OpenCodeInput): boolean =>
  input.tool === "edit"
    ? boundedSource(input.args.oldString) && boundedSource(input.args.newString)
    : boundedSource(input.args.content)
const insideRelativePath = (path: string): boolean => path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path)
const editMetadataValid = (args: Record<string, unknown>, metadata: Record<string, unknown>): boolean => {
  if (args.replaceAll !== undefined && typeof args.replaceAll !== "boolean") return false
  return nonempty(metadata.diff) || nonempty(metadata.filediff)
}
const editMatchesCurrent = (before: string, after: string, current: string): boolean =>
  !current.includes(before) && current.includes(after)
const editCandidate = (
  args: Record<string, unknown>,
  metadata: Record<string, unknown>,
  current: string,
  path: string
): DirectCandidate | undefined => {
  if (!nonempty(args.oldString) || !nonempty(args.newString)) return undefined
  if (!editMetadataValid(args, metadata) || !editMatchesCurrent(args.oldString, args.newString, current))
    return undefined
  const addedLines = changedUniqueLines(args.oldString, args.newString, current)
  return addedLines === undefined ? undefined : { operation: "update", path, addedLines }
}
const writeCandidate = (
  args: Record<string, unknown>,
  metadata: Record<string, unknown>,
  current: string,
  path: string
): DirectCandidate | undefined => {
  if (typeof args.content !== "string" || args.content !== current || metadata.exists !== false) return undefined
  return { operation: "add", path, addedLines: args.content.split(/\r?\n/u) }
}
const openCodeCandidate = (
  input: OpenCodeInput,
  output: OpenCodeOutput,
  current: string,
  path: string
): DirectCandidate | undefined =>
  input.tool === "edit"
    ? editCandidate(input.args, output.metadata, current, path)
    : writeCandidate(input.args, output.metadata, current, path)
const openCodeObservation = (
  root: string,
  rootIdentity: DirectObservation["rootIdentity"],
  input: OpenCodeInput,
  candidate: DirectCandidate
): DirectObservation => {
  const advicee: DirectAdvicee = Object.freeze({
    host: "opencode",
    hostVersion: "1.14.44",
    sessionId: input.sessionID,
    turnId: null,
    toolUseId: input.callID,
    subagentId: null
  })
  return Object.freeze({ root, rootIdentity, advicee, candidates: Object.freeze([Object.freeze(candidate)]) })
}
const openCodePath = Effect.fn("DirectEvent.openCodePath")(function* (cwd: string, path: string) {
  const root = yield* discoverPhysicalWorkingTreeRoot(cwd).pipe(Effect.option)
  if (root._tag === "None") return undefined
  const fromRoot = relative(root.value.root, root.value.physicalCwd)
  if (!insideRelativePath(fromRoot)) return undefined
  const fromCwd = relative(resolve(cwd), resolve(cwd, path))
  if (!insideRelativePath(fromCwd)) return undefined
  const relativePath = [fromRoot, fromCwd].filter(Boolean).join(sep).replaceAll(sep, "/")
  const eligible = yield* eligibleNamedPath(root.value.root, relativePath, undefined, root.value.rootIdentity)
  return eligible === undefined ? undefined : { root: root.value, relativePath, eligible }
})
const openCodeEvent = (value: unknown) => {
  const envelope = object(value)
  const input = openCodeInput(envelope?.input)
  const output = openCodeOutput(envelope?.output)
  if (input === undefined || output === undefined || !nonempty(envelope?.cwd)) return undefined
  if (!nonempty(input.args.filePath) || Buffer.byteLength(input.args.filePath) > 16_384) return undefined
  if (!boundedOpenCodeOutput(output) || !boundedToolSource(input)) return undefined
  return { cwd: envelope.cwd, path: input.args.filePath, input, output }
}
/** Exact OpenCode 1.14.44 tool.execute.after shape. The tool call is the advice lifetime. */
export const adaptOpenCodeDirectEvent = Effect.fn("DirectEvent.adaptOpenCodeDirectEvent")(function* (
  value: unknown,
  captureHooks: CaptureHooks = {}
) {
  const event = openCodeEvent(value)
  if (event === undefined) return undefined
  const path = yield* openCodePath(event.cwd, event.path)
  if (path === undefined) return undefined
  const current = yield* captureStable(path.root.root, path.eligible, captureHooks, path.root.rootIdentity)
  if (current === undefined) return undefined
  const candidate = openCodeCandidate(event.input, event.output, current.text, path.relativePath)
  return candidate === undefined
    ? undefined
    : openCodeObservation(path.root.root, path.root.rootIdentity, event.input, candidate)
})
