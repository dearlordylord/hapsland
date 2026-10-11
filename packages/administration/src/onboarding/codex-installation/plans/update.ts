import type { buildInputs } from "../runtime-inputs.ts"
import { requireTargetPackageMetadata } from "../runtime-inputs.ts"
import { readOwnership, type OwnershipRecord } from "../ownership.ts"
import { HOOKS_FEATURE_FINGERPRINT, validateToml, enableHooksFeature } from "../hooks-feature.ts"
import {
  postToolUseGroups,
  isOwnedPostGroup,
  markerCount,
  ownedGroup,
  preserveHookFormatting,
  withComposedGroups,
  replaceOwnedHook,
  composedGroups
} from "../hooks.ts"
import { hookFingerprint } from "../hook-identity.ts"
import { retainedHookSubset } from "../../hook-reconciliation.ts"
import { snapshot, type Mutation, mutation } from "../file-snapshots.ts"
import { sameStandaloneImplementation } from "../../hook-binding.ts"
import { commandFromEntrypoint } from "@hapsland/runtime-environment/runtime/package-runtime"
import { type InstallationRequest } from "../request.ts"
import { parseJsonObject, encodeJson } from "../configuration-values.ts"
import { bindingMutation } from "../launcher-plan.ts"
import { makeOwnershipRecord } from "../target-ownership.ts"
import { installationDigest } from "../proposal.ts"

const updateOwnership = (inputs: ReturnType<typeof buildInputs>) => {
  const record = readOwnership(inputs.paths.ownership)
  if (record === undefined) throw new Error("no owned Codex installation exists; run install first")
  if (record.codexHome !== inputs.home) throw new Error("ownership record targets another Codex home")
  return record
}

const updateOwnedFeature = (record: OwnershipRecord, inputs: ReturnType<typeof buildInputs>) => {
  const ownedFeature = record.owned.find((entry) => entry.kind === "feature" && entry.file === inputs.paths.config)
  if (ownedFeature !== undefined && ownedFeature.fingerprint !== HOOKS_FEATURE_FINGERPRINT)
    throw new Error("owned Codex feature record was locally modified")
  return ownedFeature
}

const validateUpdateHook = (hookRoot: Record<string, unknown>, record: OwnershipRecord) => {
  const currentGroup = postToolUseGroups(hookRoot).find(isOwnedPostGroup)
  if (
    postToolUseGroups(hookRoot).filter(isOwnedPostGroup).length > 1 ||
    markerCount(hookRoot) > 1 ||
    (currentGroup !== undefined &&
      hookFingerprint(currentGroup) !== record.hookFingerprint &&
      !retainedHookSubset(currentGroup, record.hookGroups?.PostToolUse))
  ) {
    throw new Error("owned Codex hook was locally modified; the installed version was preserved")
  }
}

const equivalentHookUpdate = (
  inputs: ReturnType<typeof buildInputs>,
  record: OwnershipRecord,
  hooks: ReturnType<typeof snapshot>,
  config: ReturnType<typeof snapshot>,
  nextHooks: string,
  nextConfig: string
): boolean =>
  inputs.binding !== undefined &&
  snapshot(inputs.paths.binding).exists &&
  record.owned.some((entry) => entry.file === inputs.binding?.path) &&
  sameStandaloneImplementation(record, commandFromEntrypoint(inputs.executable, inputs.entrypoint)) &&
  nextHooks === hooks.content &&
  nextConfig === config.content

const updateRecordMutations = (
  ownership: ReturnType<typeof snapshot>,
  hooks: ReturnType<typeof snapshot>,
  config: ReturnType<typeof snapshot>,
  nextOwnership: string,
  nextHooks: string,
  nextConfig: string,
  equivalent: boolean,
  bindingChanges: ReadonlyArray<Mutation>
): Mutation[] =>
  nextOwnership === ownership.content &&
  nextHooks === hooks.content &&
  nextConfig === config.content &&
  (equivalent || bindingChanges.length === 0)
    ? []
    : [mutation(ownership, nextOwnership, "record the target packaged runtime")]

export const makeUpdatePlan = (request: InstallationRequest, inputs: ReturnType<typeof buildInputs>) => {
  requireTargetPackageMetadata(inputs)
  const record = updateOwnership(inputs)
  const config = snapshot(inputs.paths.config)
  const _parsedConfig = validateToml(config)
  const ownedFeature = updateOwnedFeature(record, inputs)
  const nextConfig = enableHooksFeature(config)
  const hooks = snapshot(inputs.paths.hooks)
  const hookRoot = parseJsonObject(hooks)
  validateUpdateHook(hookRoot, record)
  const targetGroup = ownedGroup(
    inputs.executable,
    inputs.entrypoint,
    inputs.codex.version,
    inputs.controlledReviewer,
    inputs.binding?.command
  )
  const targetFingerprint = hookFingerprint(targetGroup)
  const nextHooks = preserveHookFormatting(
    hooks,
    withComposedGroups(
      replaceOwnedHook(hookRoot, targetGroup),
      composedGroups(
        inputs.executable,
        inputs.entrypoint,
        inputs.codex.version,
        inputs.controlledReviewer,
        inputs.binding?.command
      ),
      record.composedFingerprints,
      true,
      record.hookGroups
    )
  )
  const ownership = snapshot(inputs.paths.ownership)
  const bindingChanges = bindingMutation(inputs, record)
  const equivalent = equivalentHookUpdate(inputs, record, hooks, config, nextHooks, nextConfig)
  const nextOwnership = equivalent
    ? ownership.content
    : encodeJson(
        makeOwnershipRecord(inputs, targetFingerprint, ownedFeature !== undefined || nextConfig !== config.content)
      )
  const mutations = [
    // Recording the target first retains the previous working hook if a later
    // per-file write fails. The journal reports and safely resumes this exact state.
    ...updateRecordMutations(
      ownership,
      hooks,
      config,
      nextOwnership,
      nextHooks,
      nextConfig,
      equivalent,
      bindingChanges
    ),
    ...(equivalent ? [] : bindingChanges),
    ...(nextConfig === config.content ? [] : [mutation(config, nextConfig, "enable Codex's native hooks feature")]),
    ...(nextHooks === hooks.content
      ? []
      : [mutation(hooks, nextHooks, "replace only the owned PostToolUse adapter hook")])
  ]
  return {
    inputs,
    record,
    mutations,
    digest: installationDigest("update", inputs.home, mutations),
    alreadyCurrent: mutations.length === 0
  }
}
