import { captureOptionsForTarget, type DirectCaptureOptions } from "./capture-policy.ts"
import { relative, resolve, isAbsolute, sep } from "node:path"
import * as Effect from "effect/Effect"
import { discoverPhysicalWorkingTreeRoot, discoverToolTargetRoot } from "../repository/root.ts"
import { loadConfiguration } from "@hapsland/runtime-inputs/configuration/load"
import { captureStable, MAX_SOURCE_BYTES, type CaptureHooks } from "./capture.ts"
import { eligibleNamedPath, resolvedDirectFilePolicy, type DirectFilePolicy } from "./selection.ts"
import type { DirectAdvicee, DirectObservation, PhysicalRootIdentity } from "./observation.ts"
import { verifyPiPostEditHunks } from "./pi-patch-hunks.ts"

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
const nonempty = (value: unknown): value is string => typeof value === "string" && value.length > 0
// oxlint-disable-next-line no-control-regex -- The ASCII check intentionally matches the full 0x00..0x7f range.
const ascii = (value: string): boolean => /^[\x00-\x7f]*$/u.test(value)
const identity = (value: unknown) => {
  const event = record(value)
  if (
    event === undefined ||
    event.host_version !== "1.0.0" ||
    !nonempty(event.cwd) ||
    !nonempty(event.session_id) ||
    !nonempty(event.tool_use_id) ||
    "parentToolCallId" in event ||
    "agent_id" in event
  )
    return undefined
  return {
    event,
    advicee: {
      host: "pi",
      hostVersion: "1.0.0",
      sessionId: event.session_id,
      turnId: null,
      toolUseId: event.tool_use_id,
      subagentId: null
    } satisfies DirectAdvicee
  }
}
export const adaptPiHookIdentity = Effect.fn("DirectEvent.adaptPiHookIdentity")(function* (value: unknown) {
  const identified = identity(value)
  if (identified === undefined) return undefined
  const cwd = identified.event.cwd as string
  const input = record(identified.event.input)
  const target = typeof identified.event.target_path === "string" ? identified.event.target_path : input?.path
  const root = yield* (
    typeof target === "string" ? discoverToolTargetRoot(cwd, target) : discoverPhysicalWorkingTreeRoot(cwd)
  ).pipe(Effect.option)
  return { root: root._tag === "Some" ? root.value.root : resolve(cwd), advicee: identified.advicee }
})

type NativeEdit = { oldText: string; newText: string }
const boundedAscii = (value: unknown, maxBytes: number): value is string =>
  nonempty(value) && Buffer.byteLength(value) <= maxBytes && ascii(value)
const nativeEdit = (value: unknown): NativeEdit | undefined => {
  const edit = record(value)
  if (edit === undefined || !nonempty(edit.oldText) || typeof edit.newText !== "string") return undefined
  if (!ascii(edit.oldText) || !ascii(edit.newText)) return undefined
  return { oldText: edit.oldText, newText: edit.newText }
}
const validNativeEdits = (value: unknown): boolean => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64) return false
  let bytes = 0
  for (const item of value) {
    const edit = nativeEdit(item)
    if (edit === undefined) return false
    bytes += Buffer.byteLength(edit.oldText) + Buffer.byteLength(edit.newText)
    if (bytes > MAX_SOURCE_BYTES) return false
  }
  return true
}
const successfulNativeEdit = (event: Record<string, unknown>): boolean =>
  event.tool_name === "edit" && event.isError === false
const payload = (event: Record<string, unknown>) => {
  if (!successfulNativeEdit(event)) return undefined
  const input = record(event.input)
  const details = record(event.details)
  if (input === undefined || details === undefined) return undefined
  if (!boundedAscii(input.path, 16_384) || !boundedAscii(details.patch, MAX_SOURCE_BYTES)) return undefined
  return validNativeEdits(input.edits) ? { path: input.path, patch: details.patch } : undefined
}
type AdapterOptions = {
  readonly userConfigPath?: string
  readonly captureHooks?: CaptureHooks
  readonly filePolicy?: DirectFilePolicy
  readonly capturePolicy?: (
    root: string,
    advicee: DirectAdvicee,
    path: string
  ) => Effect.Effect<DirectFilePolicy | undefined>
}
const rootRelativePath = (root: string, cwd: string, namedPath: string): string | undefined => {
  const path = relative(root, resolve(cwd, namedPath))
  return isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`) ? undefined : path
}
const captureSelectedPiFile = Effect.fn("DirectEvent.captureSelectedPiFile")(function* (
  root: { root: string; rootIdentity: PhysicalRootIdentity },
  cwd: string,
  namedPath: string,
  options: AdapterOptions
) {
  const path = rootRelativePath(root.root, cwd, namedPath)
  if (path === undefined) return undefined
  const configuration =
    options.filePolicy === undefined
      ? yield* loadConfiguration(
          root.root,
          options.userConfigPath === undefined ? {} : { userConfigPath: options.userConfigPath }
        )
      : undefined
  const eligible = yield* eligibleNamedPath(
    root.root,
    path,
    options.filePolicy ?? resolvedDirectFilePolicy(configuration!.policy),
    root.rootIdentity
  )
  if (eligible === undefined) return undefined
  const result = yield* captureStable(root.root, eligible, options.captureHooks, root.rootIdentity)
  return result.status !== "captured" || !ascii(result.capture.text) ? undefined : { source: result.capture, eligible }
})
export const adaptPiDirectEvent = Effect.fn("DirectEvent.adaptPiDirectEvent")(function* (
  value: unknown,
  options: DirectCaptureOptions = {}
) {
  const identified = identity(value)
  if (identified === undefined) return undefined
  const input = payload(identified.event)
  if (input === undefined) return undefined
  const cwd = identified.event.cwd as string
  const root = yield* discoverToolTargetRoot(cwd, input.path).pipe(Effect.option)
  if (root._tag === "None") return undefined
  const selectedOptions = yield* captureOptionsForTarget(
    options,
    root.value.root,
    identified.advicee,
    root.value.absolutePath
  )
  if (selectedOptions === undefined) return undefined
  const captured = yield* captureSelectedPiFile(root.value, cwd, root.value.absolutePath, selectedOptions)
  if (captured === undefined) return undefined
  const { source, eligible } = captured
  const evidence = verifyPiPostEditHunks(input.patch, input.path, source.text, eligible.relativePath)
  if (evidence === undefined) return undefined
  return {
    root: root.value.root,
    rootIdentity: root.value.rootIdentity,
    advicee: identified.advicee,
    candidates: [{ operation: "update", path: eligible.relativePath, addedLines: evidence.addedLines }],
    verifiedPostEditHunks: { path: eligible.relativePath, contentHash: source.contentHash, hunks: evidence.hunks }
  } satisfies DirectObservation
})
