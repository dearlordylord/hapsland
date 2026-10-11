import { commandTokens } from "@hapsland/runtime-environment/runtime/package-runtime"
import { OWNED_MARKER, COMPOSED_MARKER, hookFingerprint } from "./hook-identity.ts"
import { commandHookGroup } from "@hapsland/runtime-environment/runtime/hook-catalog"
import { isObject, type JsonObject, parseJsonObject, encodeJson } from "./configuration-values.ts"
import { type OwnershipRecord } from "./ownership.ts"
import { reconcileOwnedEvent, canonicalJson as stableJson, retainedHookSubset } from "../hook-reconciliation.ts"
import type { snapshot } from "./file-snapshots.ts"

const quoteShell = (value: string) => `'${value.replaceAll("'", "'\\''")}'`

const codexHookOptions = (
  runtime: string,
  entrypoint: string,
  hostVersion: string,
  controlledReviewer: boolean,
  bindingCommand?: string
) => ({
  command: bindingCommand ?? commandTokens(runtime, entrypoint).map(quoteShell).join(" "),
  editMarker: OWNED_MARKER,
  composedMarker: COMPOSED_MARKER,
  ...(hostVersion === "0.155.1" ? {} : { versionFlag: `--codex-version=${hostVersion}` }),
  controlledReviewer
})

export const composedGroups = (
  runtime: string,
  entrypoint: string,
  hostVersion: string,
  controlledReviewer = false,
  bindingCommand?: string
) => {
  const options = codexHookOptions(runtime, entrypoint, hostVersion, controlledReviewer, bindingCommand)
  return {
    PreToolUse: commandHookGroup("codex", "PreToolUse", options),
    Stop: commandHookGroup("codex", "Stop", options),
    SubagentStop: commandHookGroup("codex", "SubagentStop", options)
  }
}

export const ownedGroup = (
  runtime: string,
  entrypoint: string,
  hostVersion = "0.155.1",
  controlledReviewer = false,
  bindingCommand?: string
) =>
  commandHookGroup(
    "codex",
    "PostToolUse",
    codexHookOptions(runtime, entrypoint, hostVersion, controlledReviewer, bindingCommand)
  )

export const markerCount = (value: unknown): number => {
  if (typeof value === "string") return value.includes(OWNED_MARKER) ? 1 : 0
  if (Array.isArray(value)) return value.reduce<number>((count, item) => count + markerCount(item), 0)
  if (isObject(value)) return Object.values(value).reduce<number>((count, item) => count + markerCount(item), 0)
  return 0
}

export const postToolUseGroups = (root: JsonObject): Array<unknown> => {
  if (!("hooks" in root)) return []
  if (!isObject(root.hooks)) throw new Error("hooks.json field 'hooks' must be an object")
  const post = root.hooks.PostToolUse
  if (post === undefined) return []
  if (!Array.isArray(post)) throw new Error("hooks.json PostToolUse must be an array")
  return post
}

export const withComposedGroups = (
  root: JsonObject,
  target: ReturnType<typeof composedGroups> | undefined,
  expected: OwnershipRecord["composedFingerprints"],
  restoreMissing = false,
  expectedGroups?: Record<string, unknown>
): JsonObject => {
  let next = root
  for (const [event, key] of [
    ["PreToolUse", "preToolUse"],
    ["Stop", "stop"],
    ["SubagentStop", "subagentStop"]
  ] as const) {
    next = reconcileOwnedEvent(next, event, target?.[event], {
      marker: COMPOSED_MARKER,
      fingerprint: hookFingerprint,
      expectedFingerprint: expected?.[key],
      expectedGroup: expectedGroups?.[event],
      restoreMissing,
      label: "Codex"
    })
  }
  return reconcileOwnedEvent(next, "UserPromptSubmit", undefined, {
    marker: COMPOSED_MARKER,
    fingerprint: hookFingerprint,
    expectedFingerprint:
      expectedGroups?.UserPromptSubmit === undefined ? undefined : hookFingerprint(expectedGroups.UserPromptSubmit),
    expectedGroup: expectedGroups?.UserPromptSubmit,
    restoreMissing: true,
    label: "Codex"
  })
}

export const addOwnedHook = (root: JsonObject, group: unknown): JsonObject => {
  const count = markerCount(root)
  if (count > 1) throw new Error("duplicate owned Codex hook representations require manual reconciliation")
  if (count === 1) return root
  const hooks = root.hooks === undefined ? {} : root.hooks
  if (!isObject(hooks)) throw new Error("hooks.json field 'hooks' must be an object")
  const groups = postToolUseGroups(root)
  return { ...root, hooks: { ...hooks, PostToolUse: [...groups, group] } }
}

export const isOwnedPostGroup = (group: unknown) =>
  markerCount(group) > 0 || stableJson(group).includes(COMPOSED_MARKER)

export const replaceOwnedHook = (root: JsonObject, group: unknown): JsonObject => {
  if (!postToolUseGroups(root).some(isOwnedPostGroup)) return addOwnedHook(root, group)
  const hooks = root.hooks
  if (!isObject(hooks)) throw new Error("owned Codex hook is missing or locally modified")
  const groups = postToolUseGroups(root)
  const ownedIndexes = groups.flatMap((candidate, index) => (isOwnedPostGroup(candidate) ? [index] : []))
  if (ownedIndexes.length !== 1) throw new Error("owned Codex hook is missing, duplicated, or locally modified")
  const ownedIndex = ownedIndexes[0]
  if (ownedIndex === undefined) throw new Error("owned Codex hook is missing")
  return {
    ...root,
    hooks: { ...hooks, PostToolUse: groups.map((candidate, index) => (index === ownedIndex ? group : candidate)) }
  }
}

const validatedRemovalIndex = (
  ownedIndexes: ReadonlyArray<number>,
  groups: ReadonlyArray<unknown>,
  expectedFingerprint: string,
  expectedGroup: unknown
) => {
  const index = ownedIndexes[0]
  if (
    index === undefined ||
    (hookFingerprint(groups[index]) !== expectedFingerprint && !retainedHookSubset(groups[index], expectedGroup))
  ) {
    throw new Error("owned Codex hook was locally modified; reconcile it before uninstalling")
  }
  return index
}

export const removeOwnedHook = (root: JsonObject, expectedFingerprint: string, expectedGroup?: unknown): JsonObject => {
  if (!postToolUseGroups(root).some(isOwnedPostGroup)) return root
  const hooks = root.hooks
  if (!isObject(hooks)) throw new Error("owned Codex hook is missing or locally modified")
  const groups = postToolUseGroups(root)
  const ownedIndexes = groups.flatMap((group, index) => (isOwnedPostGroup(group) ? [index] : []))
  if (ownedIndexes.length !== 1) throw new Error("owned Codex hook is missing, duplicated, or locally modified")
  const index = validatedRemovalIndex(ownedIndexes, groups, expectedFingerprint, expectedGroup)
  const nextGroups = groups.filter((_, candidate) => candidate !== index)
  const nextHooks = { ...hooks }
  if (nextGroups.length === 0) delete nextHooks.PostToolUse
  else nextHooks.PostToolUse = nextGroups
  const next = { ...root }
  if (Object.keys(nextHooks).length === 0) delete next.hooks
  else next.hooks = nextHooks
  return next
}

export const preserveHookFormatting = (before: ReturnType<typeof snapshot>, next: Record<string, unknown>): string =>
  before.exists && stableJson(parseJsonObject(before)) === stableJson(next) ? before.content : encodeJson(next)
