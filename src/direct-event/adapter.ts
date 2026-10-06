import { realpath } from "node:fs/promises"
import { discoverPhysicalWorkingTreeRoot } from "../repository/root.ts"
import { isAbsolute, relative, resolve, sep } from "node:path"
import * as Effect from "effect/Effect"
import { loadConfiguration } from "../configuration/load.ts"
import type {
  DirectCandidate,
  DirectObservation,
  DirectAdvicee,
  PhysicalRootIdentity,
  CodexHostVersion
} from "./model.ts"
import type { PostEditLocation, VerifiedPatchHunk } from "./edit-attribution.ts"
import { MAX_SOURCE_BYTES, captureStable, type CaptureHooks } from "./capture.ts"
import { eligibleNamedPath, resolvedDirectFilePolicy } from "./selection.ts"

export const MAX_CODEX_COMMAND_BYTES = 65_536
export const MAX_CODEX_CANDIDATES = 16

const record = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined

const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.length > 0

// A child marker without a usable child ID cannot safely become parent advice.
const ambiguousAgentIdentity = (event: Readonly<Record<string, unknown>>): boolean =>
  !nonEmpty(event.agent_id) && (nonEmpty(event.agent_type) || nonEmpty(event.agent_transcript_path))

export const isCodexNativeApplyPatch = (value: unknown): boolean => {
  const event = record(value)
  return event?.hook_event_name === "PostToolUse" && event.tool_name === "apply_patch"
}

type PatchCandidate = { operation: DirectCandidate["operation"]; path: string; addedLines: string[] }
type PatchFrame = { candidates: PatchCandidate[]; paths: Set<string>; current?: PatchCandidate }
const patchOperation = (header: string | undefined): DirectCandidate["operation"] => {
  if (header === "Add") return "add"
  return header === "Update" ? "update" : "delete"
}
const addPatchFile = (frame: PatchFrame, header: RegExpExecArray): boolean => {
  const path = header[2]?.trim()
  if (path === undefined || path.length === 0 || frame.paths.has(path)) return false
  frame.paths.add(path)
  frame.current = { operation: patchOperation(header[1]), path, addedLines: [] }
  frame.candidates.push(frame.current)
  return true
}
const patchContextLine = (line: string): boolean => line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")
const movePatchFile = (candidate: PatchCandidate, line: string): boolean => {
  if (candidate.operation !== "update" || line.slice("*** Move to: ".length).trim().length === 0) return false
  candidate.operation = "move"
  return true
}
const addPatchBodyLine = (candidate: PatchCandidate, line: string): boolean => {
  if (!line.startsWith("+")) return false
  candidate.addedLines.push(line.slice(1))
  return true
}
const patchBodyLine = (candidate: PatchCandidate, line: string): boolean => {
  if (candidate.operation === "delete") return false
  if (candidate.operation === "add") return addPatchBodyLine(candidate, line)
  if (line.startsWith("@@")) return true
  if (!patchContextLine(line)) return false
  if (candidate.operation === "update" && line.startsWith("+")) candidate.addedLines.push(line.slice(1))
  return true
}
const acceptPatchLine = (frame: PatchFrame, line: string): boolean => {
  const header = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line)
  if (header !== null) return addPatchFile(frame, header)
  if (frame.current === undefined) return false
  if (line.startsWith("*** Move to: ")) return movePatchFile(frame.current, line)
  if (line.startsWith("***")) return false
  return patchBodyLine(frame.current, line)
}
const reviewablePatchCandidate = (candidate: PatchCandidate): boolean =>
  candidate.operation === "add" ||
  (candidate.operation === "update" && candidate.addedLines.some((line) => line.trim().length > 0))
const directPatchCandidate = (candidate: PatchCandidate): DirectCandidate => {
  if (candidate.operation === "add" || candidate.operation === "update") {
    return {
      operation: candidate.operation,
      path: candidate.path,
      addedLines: Object.freeze([...candidate.addedLines])
    }
  }
  return { operation: candidate.operation, path: candidate.path, addedLines: [] }
}
const patchLines = (command: string): string[] | undefined => {
  if (Buffer.byteLength(command, "utf8") > MAX_CODEX_COMMAND_BYTES) return undefined
  const lines = command.replaceAll("\r\n", "\n").split("\n")
  // Ignore only the conventional single terminal line terminator.
  if (lines.at(-1) === "") lines.pop()
  if (lines[0] !== "*** Begin Patch" || lines.at(-1) !== "*** End Patch") return undefined
  return lines
}
export const nativeDirectCandidates = (command: string): ReadonlyArray<DirectCandidate> | undefined => {
  const lines = patchLines(command)
  if (lines === undefined) return undefined
  const frame: PatchFrame = { candidates: [], paths: new Set() }
  for (const line of lines.slice(1, -1)) {
    if (!acceptPatchLine(frame, line)) return undefined
  }
  if (frame.candidates.length < 1 || frame.candidates.length > MAX_CODEX_CANDIDATES) return undefined
  if (!frame.candidates.some(reviewablePatchCandidate)) return undefined
  return frame.candidates.map(directPatchCandidate)
}

const canonicalGitRoot = Effect.fn("DirectEvent.canonicalGitRoot")((cwd: string) =>
  discoverPhysicalWorkingTreeRoot(cwd).pipe(Effect.option)
)
export const verifyObservationRoot = Effect.fn("DirectEvent.verifyRoot")(function* (
  observation: Pick<DirectObservation, "root" | "rootIdentity">
) {
  const current = yield* discoverPhysicalWorkingTreeRoot(observation.root).pipe(Effect.option)
  if (current._tag === "None") return false
  return (
    current.value.root === observation.root &&
    current.value.rootIdentity.rootDevice === observation.rootIdentity.rootDevice &&
    current.value.rootIdentity.rootInode === observation.rootIdentity.rootInode &&
    current.value.rootIdentity.gitDirectory === observation.rootIdentity.gitDirectory &&
    current.value.rootIdentity.gitDevice === observation.rootIdentity.gitDevice &&
    current.value.rootIdentity.gitInode === observation.rootIdentity.gitInode
  )
})

type EventRecord = Readonly<Record<string, unknown>>
type IdentifiedEvent = EventRecord & { readonly session_id: string; readonly cwd: string; readonly agent_id?: string }
type ToolEvent = IdentifiedEvent & { readonly turn_id: string; readonly tool_use_id: string }
const validChildIdentity = (event: EventRecord): event is EventRecord & { readonly agent_id?: string } =>
  !(event.agent_id !== undefined && !nonEmpty(event.agent_id)) && !ambiguousAgentIdentity(event)
const identifiedEvent = (event: EventRecord | undefined): event is IdentifiedEvent =>
  event !== undefined && nonEmpty(event.session_id) && nonEmpty(event.cwd) && validChildIdentity(event)
const codexToolEvent = (event: EventRecord | undefined): event is ToolEvent =>
  identifiedEvent(event) &&
  event.hook_event_name === "PostToolUse" &&
  nonEmpty(event.turn_id) &&
  nonEmpty(event.tool_use_id)
const outsideParent = (path: string): boolean => path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)
const rootRelativeCwd = Effect.fn("DirectEvent.rootRelativeCwd")(function* (root: string, cwd: string) {
  const physical = yield* Effect.tryPromise({
    try: () => realpath(cwd),
    catch: () => new Error("working directory unavailable")
  }).pipe(Effect.option)
  if (physical._tag === "None") return undefined
  const path = relative(root, physical.value)
  return outsideParent(path) ? undefined : path
})
const normalizedCandidate = (candidate: DirectCandidate, cwd: string, cwdFromRoot: string): DirectCandidate => {
  if (!isAbsolute(candidate.path)) return candidate
  const fromCwd = relative(resolve(cwd), resolve(candidate.path))
  if (outsideParent(fromCwd)) return candidate
  const path = [cwdFromRoot, fromCwd].filter(Boolean).join(sep).replaceAll(sep, "/")
  return { ...candidate, path }
}
const patchFailed = (response: EventRecord | undefined): boolean =>
  response?.success === false || response?.is_error === true
const patchSucceeded = (event: EventRecord, response: EventRecord | undefined): boolean =>
  response?.success === true ||
  (typeof event.tool_response === "string" &&
    /(?:^|\n)Success\. (?:Updated|Added|Deleted) the following files:/u.test(event.tool_response))
const normalizedPatchHeader = (line: string, paths: ReadonlyMap<string, string>): string => {
  const header = /^(\*\*\* (?:Add|Update|Delete) File: )(.+)$/u.exec(line)
  if (header === null) return line
  return `${header[1]}${paths.get(header[2]!.trim()) ?? header[2]}`
}
const normalizedPatchCommand = (
  command: string,
  candidates: ReadonlyArray<DirectCandidate>,
  normalized: ReadonlyArray<DirectCandidate>
): string => {
  const paths = new Map(candidates.map((candidate, index) => [candidate.path, normalized[index]!.path] as const))
  return command
    .split("\n")
    .map((line) => normalizedPatchHeader(line, paths))
    .join("\n")
}
const codexAdvicee = (event: ToolEvent, hostVersion: CodexHostVersion): Extract<DirectAdvicee, { host: "codex-cli" }> =>
  Object.freeze({
    host: "codex-cli",
    hostVersion,
    sessionId: event.session_id,
    turnId: event.turn_id,
    toolUseId: event.tool_use_id,
    subagentId: event.agent_id ?? null
  })
const codexPatchInput = (event: ToolEvent) => {
  const input = record(event.tool_input)
  if (input === undefined || !nonEmpty(input.command)) return undefined
  const response = record(event.tool_response)
  if (patchFailed(response)) return undefined
  const candidates = nativeDirectCandidates(input.command)
  if (candidates === undefined) return undefined
  return { command: input.command, response, candidates }
}
/** Strictly adapts the bounded native patch profile for the selected host version. */
export const adaptCodexDirectEvent = Effect.fn("DirectEvent.adaptCodexDirectEvent")(function* (
  value: unknown,
  hostVersion: CodexHostVersion = "0.155.1"
) {
  const event = record(value)
  if (!codexToolEvent(event) || !isCodexNativeApplyPatch(event)) return undefined
  const patch = codexPatchInput(event)
  if (patch === undefined) return undefined
  const { candidates, response } = patch
  const root = yield* canonicalGitRoot(event.cwd)
  if (root._tag === "None") return undefined
  // Resolve physical cwd, but normalize absolute file headers using its lexical spelling.
  // Selection still checks symlinks and the captured file's physical path.
  const cwdFromRoot = yield* rootRelativeCwd(root.value.root, event.cwd)
  if (cwdFromRoot === undefined) return undefined
  const normalized = candidates.map((candidate) => normalizedCandidate(candidate, event.cwd, cwdFromRoot))
  const command = normalizedPatchCommand(patch.command, candidates, normalized)
  return Object.freeze({
    root: root.value.root,
    rootIdentity: root.value.rootIdentity,
    advicee: codexAdvicee(event, hostVersion),
    candidates: Object.freeze(normalized.map((candidate) => Object.freeze(candidate))),
    ...(patchSucceeded(event, response) ? { nativePatchCommand: command } : {})
  } satisfies DirectObservation)
})
/** Identity-only adaptation for later reply opportunities. It never supplies paths. */
export const adaptCodexReply = Effect.fn("DirectEvent.adaptCodexReply")(function* (
  value: unknown,
  hostVersion: CodexHostVersion = "0.155.1"
) {
  const event = record(value)
  if (!codexToolEvent(event)) return undefined
  const root = yield* canonicalGitRoot(event.cwd)
  if (root._tag === "None") return undefined
  return Object.freeze({ root: root.value.root, advicee: codexAdvicee(event, hostVersion) })
})
type ComposedEventName = "PreToolUse" | "PostToolUse" | "Stop" | "SubagentStop" | "UserPromptSubmit"
type ComposedHost = "codex-cli" | "claude-code"
const composedToolMatches = (event: EventRecord, host: ComposedHost): boolean => {
  if (!nonEmpty(event.tool_use_id)) return false
  if (host === "codex-cli")
    return event.tool_name === "apply_patch" || (event.hook_event_name === "PostToolUse" && event.tool_name === "Bash")
  return event.tool_name === "Edit" || event.tool_name === "Write"
}
const composedEventMatches = (event: IdentifiedEvent, host: ComposedHost, name: ComposedEventName): boolean => {
  if (event.hook_event_name !== name) return false
  if (name === "SubagentStop" && !nonEmpty(event.agent_id)) return false
  if (name === "PostToolUse" || name === "PreToolUse") return composedToolMatches(event, host)
  return true
}
const deliveryOpportunity = (value: unknown): string => (nonEmpty(value) ? value : "delivery-opportunity")
const composedAdvicee = (event: IdentifiedEvent, host: ComposedHost, codexVersion: CodexHostVersion): DirectAdvicee => {
  if (host === "codex-cli")
    return {
      host,
      hostVersion: codexVersion,
      sessionId: event.session_id,
      turnId: deliveryOpportunity(event.turn_id),
      toolUseId: deliveryOpportunity(event.tool_use_id),
      subagentId: event.agent_id ?? null
    }
  return {
    host,
    hostVersion: "2.1.218",
    sessionId: event.session_id,
    turnId: null,
    toolUseId: deliveryOpportunity(event.tool_use_id),
    subagentId: event.agent_id ?? null
  }
}
/** Identity-only mapping for composed background, Stop, and prompt hooks. */
export const adaptComposedHookIdentity = Effect.fn("DirectEvent.adaptComposedHookIdentity")(function* (
  value: unknown,
  host: ComposedHost,
  eventName: ComposedEventName,
  codexVersion: CodexHostVersion = "0.155.1"
) {
  const event = record(value)
  if (!identifiedEvent(event) || !composedEventMatches(event, host, eventName)) return undefined
  const root = yield* canonicalGitRoot(event.cwd)
  if (root._tag === "None") return undefined
  return Object.freeze({ root: root.value.root, advicee: Object.freeze(composedAdvicee(event, host, codexVersion)) })
})

/** Compatibility name retained for callers introduced by the Add-only slice. */
export const adaptCodexAdd = adaptCodexDirectEvent

const changedWholeLines = (before: string, after: string): ReadonlyArray<string> => {
  const prior = new Set(before.split(/\r?\n/u).map((line) => line.trim()))
  return after.split(/\r?\n/u).filter((line) => line.trim().length > 0 && !prior.has(line.trim()))
}

const boundedSource = (value: unknown): value is string =>
  typeof value === "string" && Buffer.byteLength(value, "utf8") <= MAX_SOURCE_BYTES

const sourcePosition = (source: string, offset: number) => {
  const before = source.slice(0, offset)
  const line = before.split("\n").length
  return { line, column: offset - before.lastIndexOf("\n") }
}

/** Exact post-image ranges from a verified Claude replacement. */
const replacementHunks = (
  path: string,
  original: string,
  expected: string,
  oldText: string,
  newText: string,
  replaceAll: boolean
): ReadonlyArray<VerifiedPatchHunk> | undefined => {
  const hunks: VerifiedPatchHunk[] = []
  let search = 0
  let shift = 0
  let cursor = 0
  let line = 1
  let column = 1
  const advance = (target: number) => {
    for (; cursor < target; cursor += 1) {
      if (expected[cursor] === "\n") {
        line += 1
        column = 1
      } else column += 1
    }
    return { line, column }
  }
  while (true) {
    const beforeStart = original.indexOf(oldText, search)
    if (beforeStart < 0) break
    // Match the resident IPC bound before allocating more hunk objects. A
    // frequent-token replace_all can otherwise grow work quadratically.
    if (hunks.length === 64) return undefined
    const start = beforeStart + shift
    const end = start + newText.length
    const location: PostEditLocation = { start: advance(start), end: advance(end) }
    hunks.push({ path, verified: true, location })
    if (!replaceAll) break
    search = beforeStart + oldText.length
    shift += newText.length - oldText.length
  }
  return hunks
}

/** A Write has one exact changed envelope; multiple roots inside it stay ambiguous. */
const writeHunks = (path: string, original: string, expected: string): ReadonlyArray<VerifiedPatchHunk> => {
  let start = 0
  while (start < original.length && start < expected.length && original[start] === expected[start]) start += 1
  let oldEnd = original.length
  let newEnd = expected.length
  while (oldEnd > start && newEnd > start && original[oldEnd - 1] === expected[newEnd - 1]) {
    oldEnd -= 1
    newEnd -= 1
  }
  return [
    {
      path,
      verified: true,
      location: { start: sourcePosition(expected, start), end: sourcePosition(expected, newEnd) }
    }
  ]
}

type ClaudeEvent = IdentifiedEvent & { readonly tool_name: "Edit" | "Write"; readonly tool_use_id: string }
const claudeEvent = (event: EventRecord | undefined): event is ClaudeEvent =>
  identifiedEvent(event) &&
  event.hook_event_name === "PostToolUse" &&
  (event.tool_name === "Edit" || event.tool_name === "Write") &&
  nonEmpty(event.tool_use_id) &&
  event.turn_id === undefined
const claudeFileInput = (input: EventRecord | undefined): input is EventRecord & { readonly file_path: string } =>
  input !== undefined && nonEmpty(input.file_path) && isAbsolute(input.file_path)
const claudeResponseMatches = (input: EventRecord, response: EventRecord | undefined): response is EventRecord =>
  response !== undefined &&
  input.file_path === response.filePath &&
  response.userModified === false &&
  response.success !== false &&
  response.is_error !== true
const boundedClaudeEdit = (input: EventRecord, response: EventRecord): boolean =>
  boundedSource(input.old_string) &&
  boundedSource(input.new_string) &&
  boundedSource(response.originalFile) &&
  boundedSource(response.oldString) &&
  boundedSource(response.newString)
const boundedClaudeWrite = (input: EventRecord, response: EventRecord): boolean =>
  boundedSource(input.content) &&
  boundedSource(response.content) &&
  (response.originalFile === null || boundedSource(response.originalFile))
const boundedClaudeSource = (event: ClaudeEvent, input: EventRecord, response: EventRecord): boolean =>
  event.tool_name === "Edit" ? boundedClaudeEdit(input, response) : boundedClaudeWrite(input, response)
const claudeRelativePath = Effect.fn("DirectEvent.claudeRelativePath")(function* (
  root: string,
  cwd: string,
  path: string
) {
  const fromRoot = yield* rootRelativeCwd(root, cwd)
  if (fromRoot === undefined) return undefined
  const fromCwd = relative(resolve(cwd), resolve(path))
  if (outsideParent(fromCwd)) return undefined
  return [fromRoot, fromCwd].filter(Boolean).join(sep).replaceAll(sep, "/")
})
type ClaudeEditInput = EventRecord & {
  readonly old_string: string
  readonly new_string: string
  readonly replace_all?: boolean
}
const claudeEditInput = (input: EventRecord): input is ClaudeEditInput =>
  nonEmpty(input.old_string) &&
  nonEmpty(input.new_string) &&
  (input.replace_all === undefined || typeof input.replace_all === "boolean")
const claudeEditMatches = (
  input: ClaudeEditInput,
  response: EventRecord
): response is EventRecord & { readonly originalFile: string } =>
  typeof response.originalFile === "string" &&
  response.oldString === input.old_string &&
  response.newString === input.new_string &&
  input.replace_all === response.replaceAll
const replacementWithinBudget = (original: string, input: ClaudeEditInput): boolean => {
  if (input.replace_all !== true) return true
  const occurrences = original.split(input.old_string).length - 1
  const estimated =
    Buffer.byteLength(original) +
    occurrences * (Buffer.byteLength(input.new_string) - Buffer.byteLength(input.old_string))
  return estimated <= MAX_SOURCE_BYTES
}
type VerifiedClaudeChange = {
  readonly candidate: Extract<DirectCandidate, { operation: "add" | "update" }>
  readonly verifiedHunks?: ReadonlyArray<VerifiedPatchHunk>
}
const expectedClaudeEdit = (original: string, input: ClaudeEditInput, text: string): string | undefined => {
  if (!original.includes(input.old_string) || !replacementWithinBudget(original, input)) return undefined
  const expected =
    input.replace_all === true
      ? original.replaceAll(input.old_string, input.new_string)
      : original.replace(input.old_string, input.new_string)
  if (!boundedSource(expected) || text !== expected || expected === original) return undefined
  return expected
}
const verifiedClaudeEdit = (
  input: EventRecord,
  response: EventRecord,
  path: string,
  relativePath: string,
  text: string
): VerifiedClaudeChange | undefined => {
  if (!claudeEditInput(input) || !claudeEditMatches(input, response)) return undefined
  const original = response.originalFile
  const expected = expectedClaudeEdit(original, input, text)
  if (expected === undefined) return undefined
  const verifiedHunks = replacementHunks(
    relativePath,
    original,
    expected,
    input.old_string,
    input.new_string,
    input.replace_all === true
  )
  if (verifiedHunks === undefined) return undefined
  return { candidate: { operation: "update", path, addedLines: changedWholeLines(original, expected) }, verifiedHunks }
}
const claudeWriteContent = (
  input: EventRecord,
  response: EventRecord,
  text: string
): input is EventRecord & { readonly content: string } =>
  typeof input.content === "string" && input.content === response.content && text === input.content
const claudeWriteOriginal = (
  response: EventRecord,
  text: string
): response is EventRecord & { readonly originalFile: string | null } =>
  (response.originalFile === null || typeof response.originalFile === "string") && response.originalFile !== text
const verifiedClaudeWrite = (
  input: EventRecord,
  response: EventRecord,
  path: string,
  relativePath: string,
  text: string
): VerifiedClaudeChange | undefined => {
  if (!claudeWriteContent(input, response, text) || !claudeWriteOriginal(response, input.content)) return undefined
  if (response.originalFile === null)
    return { candidate: { operation: "add", path, addedLines: input.content.split(/\r?\n/u) } }
  return {
    candidate: { operation: "update", path, addedLines: changedWholeLines(response.originalFile, input.content) },
    verifiedHunks: writeHunks(relativePath, response.originalFile, input.content)
  }
}
const verifiedClaudeChange = (
  event: ClaudeEvent,
  input: EventRecord,
  response: EventRecord,
  path: string,
  relativePath: string,
  text: string
): VerifiedClaudeChange | undefined =>
  event.tool_name === "Edit"
    ? verifiedClaudeEdit(input, response, path, relativePath, text)
    : verifiedClaudeWrite(input, response, path, relativePath, text)
const claudeAdvicee = (event: ClaudeEvent): Extract<DirectAdvicee, { host: "claude-code" }> =>
  Object.freeze({
    host: "claude-code",
    hostVersion: "2.1.218",
    sessionId: event.session_id,
    turnId: null,
    toolUseId: event.tool_use_id,
    subagentId: event.agent_id ?? null
  })
const claudeHunkEvidence = (path: string, contentHash: string, hunks: ReadonlyArray<VerifiedPatchHunk> | undefined) =>
  hunks === undefined
    ? {}
    : {
        verifiedPostEditHunks: Object.freeze({
          path,
          contentHash,
          hunks: Object.freeze(hunks.map((hunk) => Object.freeze(hunk)))
        })
      }
const claudePayload = (event: ClaudeEvent) => {
  const input = record(event.tool_input)
  const response = record(event.tool_response)
  if (!claudeFileInput(input) || !claudeResponseMatches(input, response)) return undefined
  if (Buffer.byteLength(input.file_path) > 16_384 || !boundedClaudeSource(event, input, response)) return undefined
  return { input, response, path: input.file_path }
}
const captureSelectedClaudeFile = Effect.fn("DirectEvent.captureSelectedClaudeFile")(function* (
  root: string,
  rootIdentity: PhysicalRootIdentity,
  relativePath: string,
  options: { readonly userConfigPath?: string; readonly captureHooks?: CaptureHooks }
) {
  const configuration = yield* loadConfiguration(
    root,
    options.userConfigPath === undefined ? {} : { userConfigPath: options.userConfigPath }
  )
  const eligible = yield* eligibleNamedPath(
    root,
    relativePath,
    resolvedDirectFilePolicy(configuration.policy),
    rootIdentity
  )
  if (eligible === undefined) return undefined
  return yield* captureStable(root, eligible, options.captureHooks, rootIdentity)
})
/** Claude has no observed turn ID; preserve supplied child identity. */
export const adaptClaudeDirectEvent = Effect.fn("DirectEvent.adaptClaudeDirectEvent")(function* (
  value: unknown,
  options: { readonly userConfigPath?: string; readonly captureHooks?: CaptureHooks } = {}
) {
  const event = record(value)
  if (!claudeEvent(event)) return undefined
  const payload = claudePayload(event)
  if (payload === undefined) return undefined
  const { input, response, path } = payload
  const root = yield* canonicalGitRoot(event.cwd)
  if (root._tag === "None") return undefined
  const relativePath = yield* claudeRelativePath(root.value.root, event.cwd, path)
  if (relativePath === undefined) return undefined
  const content = yield* captureSelectedClaudeFile(root.value.root, root.value.rootIdentity, relativePath, options)
  if (content === undefined) return undefined
  const change = verifiedClaudeChange(event, input, response, path, relativePath, content.text)
  if (change === undefined) return undefined
  return Object.freeze({
    root: root.value.root,
    rootIdentity: root.value.rootIdentity,
    advicee: claudeAdvicee(event),
    candidates: Object.freeze([Object.freeze({ ...change.candidate, path: relativePath })]),
    ...claudeHunkEvidence(relativePath, content.contentHash, change.verifiedHunks)
  } satisfies DirectObservation)
})
