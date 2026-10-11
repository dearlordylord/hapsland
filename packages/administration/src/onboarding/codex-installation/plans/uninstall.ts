import { type OwnershipRecord, readOwnership } from "../ownership.ts"
import type { buildInputs } from "../runtime-inputs.ts"
import { type JsonObject, isObject, parseJsonObject, encodeJson } from "../configuration-values.ts"
import { HOOKS_FEATURE_FINGERPRINT, disableOwnedFeature, validateToml } from "../hooks-feature.ts"
import { markerCount, withComposedGroups, removeOwnedHook } from "../hooks.ts"
import { type FileSnapshot, snapshot, type Mutation, mutation } from "../file-snapshots.ts"
import { type InstallationRequest } from "../request.ts"
import { installationDigest } from "../proposal.ts"
import { bindingDigest } from "../../hook-binding.ts"

const validateOwnedFeatureRemoval = (
  record: OwnershipRecord,
  inputs: ReturnType<typeof buildInputs>,
  parsedConfig: JsonObject
) => {
  const feature = record.owned.find((entry) => entry.kind === "feature" && entry.file === inputs.paths.config)
  if (feature === undefined) return false
  const features = parsedConfig.features
  if (
    feature.fingerprint !== HOOKS_FEATURE_FINGERPRINT ||
    (isObject(features) && features.hooks !== undefined && features.hooks !== true)
  ) {
    throw new Error("owned Codex feature value was locally modified; it was preserved")
  }
  return true
}

const unrelatedHooksRemain = (root: JsonObject) =>
  markerCount(root) === 0 &&
  isObject(root.hooks) &&
  Object.values(root.hooks).some((value) => Array.isArray(value) && value.length > 0)

const uninstallConfig = (config: FileSnapshot, parsed: JsonObject, featureOwned: boolean, hookRoot: JsonObject) => {
  const unrelated = unrelatedHooksRemain(hookRoot)
  return featureOwned && isObject(parsed.features) && parsed.features.hooks === true && !unrelated
    ? disableOwnedFeature(config.content)
    : config.content
}

export const makeUninstallPlan = (request: InstallationRequest, inputs: ReturnType<typeof buildInputs>) => {
  const record = readOwnership(inputs.paths.ownership)
  if (record === undefined) {
    withComposedGroups(parseJsonObject(snapshot(inputs.paths.hooks)), undefined, undefined)
    return {
      inputs,
      mutations: [] as Array<Mutation>,
      digest: installationDigest("uninstall", inputs.home, []),
      alreadyRemoved: true
    }
  }
  if (record.codexHome !== inputs.home) throw new Error("ownership record targets another Codex home")
  const config = snapshot(inputs.paths.config)
  const hooks = snapshot(inputs.paths.hooks)
  const ownership = snapshot(inputs.paths.ownership)
  const parsedConfig = validateToml(config)
  const hookRoot = parseJsonObject(hooks)
  const nextHookRoot = withComposedGroups(
    removeOwnedHook(hookRoot, record.hookFingerprint, record.hookGroups?.PostToolUse),
    undefined,
    record.composedFingerprints,
    true,
    record.hookGroups
  )
  const nextHooks = encodeJson(nextHookRoot)
  const featureWasOwned = validateOwnedFeatureRemoval(record, inputs, parsedConfig)
  const nextConfig = uninstallConfig(config, parsedConfig, featureWasOwned, nextHookRoot)
  const mutations = [
    ...(nextConfig === config.content
      ? []
      : [mutation(config, nextConfig, "remove the owned Codex hooks feature entry")]),
    ...(nextHooks === hooks.content
      ? []
      : [mutation(hooks, nextHooks, "remove only the owned PostToolUse adapter hook")]),
    ...(() => {
      const binding = record.owned.find((entry) => entry.file === inputs.paths.binding && entry.kind === "hook")
      if (binding === undefined) return []
      const before = snapshot(inputs.paths.binding)
      if (before.exists && bindingDigest(before.content) !== binding.fingerprint)
        throw new Error("owned hook launcher was locally modified")
      return before.exists ? [mutation(before, null, "remove the owned hook launcher")] : []
    })(),
    mutation(ownership, null, "remove the versioned ownership record")
  ]
  return { inputs, mutations, digest: installationDigest("uninstall", inputs.home, mutations), alreadyRemoved: false }
}
