import { readOwnership, type OwnershipRecord } from "../ownership.ts"
import {
  postToolUseGroups,
  isOwnedPostGroup,
  markerCount,
  ownedGroup,
  addOwnedHook,
  replaceOwnedHook,
  preserveHookFormatting,
  withComposedGroups,
  composedGroups
} from "../hooks.ts"
import { hookFingerprint, OWNED_MARKER, COMPOSED_MARKER } from "../hook-identity.ts"
import { retainedHookSubset, removeMarkedHandlers } from "../../hook-reconciliation.ts"
import { type FileSnapshot, mutation, snapshot } from "../file-snapshots.ts"
import { type InstallationRequest } from "../request.ts"
import type { buildInputs } from "../runtime-inputs.ts"
import { parseJsonObject, encodeJson } from "../configuration-values.ts"
import { enableHooksFeature } from "../hooks-feature.ts"
import { makeOwnershipRecord } from "../target-ownership.ts"
import { bindingMutation } from "../launcher-plan.ts"
import { reinstallDigest, installationDigest } from "../proposal.ts"

const existingInstallOwnership = (path: string, reinstall: boolean | undefined) => {
  try {
    return readOwnership(path)
  } catch (cause) {
    if (!reinstall) throw cause
    return undefined
  }
}

const validateRecordedInstallHook = (
  hookRoot: Record<string, unknown>,
  record: OwnershipRecord,
  home: string,
  reinstall: boolean | undefined
) => {
  if (record.codexHome !== home) throw new Error("ownership record targets another Codex home")
  const group = postToolUseGroups(hookRoot).find(isOwnedPostGroup)
  if (
    !reinstall &&
    group !== undefined &&
    hookFingerprint(group) !== record.hookFingerprint &&
    !retainedHookSubset(group, record.hookGroups?.PostToolUse)
  ) {
    throw new Error("owned Codex hook was locally modified; reconcile before reinstalling")
  }
}

const validateInstallOwnership = (
  hookRoot: Record<string, unknown>,
  record: OwnershipRecord | undefined,
  home: string,
  reinstall: boolean | undefined
) => {
  const count = markerCount(hookRoot)
  if (count > 1 || postToolUseGroups(hookRoot).filter(isOwnedPostGroup).length > 1) {
    throw new Error("duplicate owned Codex hook representations require manual reconciliation")
  }
  if (record !== undefined) return validateRecordedInstallHook(hookRoot, record, home, reinstall)
  if (count !== 0 || postToolUseGroups(hookRoot).some(isOwnedPostGroup)) {
    throw new Error("an unrecorded owned-marker hook requires manual reconciliation")
  }
}

const installFeatureOwned = (record: OwnershipRecord | undefined, config: FileSnapshot, nextConfig: string) =>
  (record?.owned.some((entry) => entry.kind === "feature" && entry.file === config.path) ?? false) ||
  nextConfig !== config.content

const installMutations = (
  config: FileSnapshot,
  hooks: FileSnapshot,
  ownership: FileSnapshot,
  nextConfig: string,
  nextHooks: string,
  nextOwnership: string,
  resetJournal: FileSnapshot | undefined
) => [
  ...(nextConfig === config.content ? [] : [mutation(config, nextConfig, "enable Codex's native hooks feature")]),
  ...(nextHooks === hooks.content ? [] : [mutation(hooks, nextHooks, "append the owned PostToolUse adapter hook")]),
  ...(nextOwnership === ownership.content &&
  nextHooks === hooks.content &&
  nextConfig === config.content &&
  resetJournal?.exists !== true
    ? []
    : [mutation(ownership, nextOwnership, "write the versioned ownership record")])
]

export const makeInstallPlan = (request: InstallationRequest, inputs: ReturnType<typeof buildInputs>) => {
  const config = snapshot(inputs.paths.config)
  const hooks = snapshot(inputs.paths.hooks)
  const ownership = snapshot(inputs.paths.ownership)
  const resetJournal = request.reinstall ? snapshot(inputs.paths.journal) : undefined
  const existingRecord = existingInstallOwnership(inputs.paths.ownership, request.reinstall)
  const group = ownedGroup(
    inputs.executable,
    inputs.entrypoint,
    inputs.codex.version,
    inputs.controlledReviewer,
    inputs.binding?.command
  )
  const fingerprint = hookFingerprint(group)
  const originalRoot = parseJsonObject(hooks)
  const hookRoot = request.reinstall
    ? removeMarkedHandlers(originalRoot, [OWNED_MARKER, COMPOSED_MARKER])
    : originalRoot
  validateInstallOwnership(hookRoot, existingRecord, inputs.home, request.reinstall)
  const nextConfig = enableHooksFeature(config)

  const nextHooksRoot = existingRecord === undefined ? addOwnedHook(hookRoot, group) : replaceOwnedHook(hookRoot, group)
  const nextHooks = preserveHookFormatting(
    hooks,
    withComposedGroups(
      nextHooksRoot,
      composedGroups(
        inputs.executable,
        inputs.entrypoint,
        inputs.codex.version,
        inputs.controlledReviewer,
        inputs.binding?.command
      ),
      request.reinstall ? undefined : existingRecord?.composedFingerprints,
      true,
      existingRecord?.hookGroups
    )
  )
  const featureOwned = installFeatureOwned(existingRecord, config, nextConfig)
  const record = makeOwnershipRecord(inputs, fingerprint, featureOwned)
  const nextOwnership = encodeJson(record)
  const mutations = [
    ...bindingMutation(inputs, existingRecord, request.reinstall),
    ...installMutations(config, hooks, ownership, nextConfig, nextHooks, nextOwnership, resetJournal)
  ]
  return {
    inputs,
    mutations,
    resetJournal,
    digest: reinstallDigest(
      installationDigest("install", inputs.home, mutations),
      resetJournal?.exists ? resetJournal.digest : undefined
    ),
    alreadyInstalled: mutations.length === 0
  }
}
