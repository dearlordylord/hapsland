import { createHash } from "node:crypto"
import { REVIEW_PROVIDERS, DEFAULT_REVIEW_BACKEND } from "@hapsland/runtime-environment/runtime/backend"
import {
  BUILT_IN_INCLUDES,
  BUILT_IN_PROTECTED_EXCLUDES,
  DEFAULT_EDIT_PERMIT_LIMITS,
  DEFAULT_INSPECTION_RETENTION_DAYS,
  DEFAULT_INSPECTION_STORAGE_BYTES,
  DEFAULT_VIRTUAL_ROUND_QUIET_MS,
  type ConfigurationDocument,
  type ConfigurationLayerName,
  type ConfigurationOrigin,
  type ConfigurationCapture,
  type ClaudeFeedbackMode,
  type Originated,
  type PatternOrigin,
  type ResolvedPolicy,
  type ReviewBackendSettings
} from "./types.ts"
import { ConfigurationError } from "./errors.ts"
import { replaceIncludes } from "./decision.ts"
import {
  GRAPH_LIMIT_CEILINGS,
  validateGraphLimits,
  type GraphLimitField,
  type GraphLimits
} from "@hapsland/canonical-policy/canonical/graph-limits"

export type ConfigurationLayer = {
  readonly name: ConfigurationLayerName
  readonly source: string
  readonly document: ConfigurationDocument
}

const origin = (layer: ConfigurationLayer, field: string): ConfigurationOrigin => ({
  layer: layer.name,
  source: layer.source,
  field
})

const originated = <T>(value: T, owner: ConfigurationOrigin): Originated<T> => ({ value, origin: owner })

const patternsFor = (
  layer: ConfigurationLayer,
  field: string,
  values: ReadonlyArray<string>
): ReadonlyArray<PatternOrigin> => values.map((value) => ({ value, origin: origin(layer, field), active: true }))

const includeValues = (
  document: ConfigurationDocument
): { readonly field: "includes"; readonly values: ReadonlyArray<string> } | undefined => {
  if (document.includes !== undefined) return { field: "includes", values: document.includes }
  return undefined
}

const excludeValues = (
  document: ConfigurationDocument
): { readonly field: "excludes"; readonly values: ReadonlyArray<string> } | undefined => {
  if (document.excludes !== undefined) return { field: "excludes", values: document.excludes }
  return undefined
}

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (typeof value === "object" && value !== null) {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

const digest = (value: unknown): string => createHash("sha256").update(stable(value)).digest("hex")

const dedupePatterns = (values: ReadonlyArray<PatternOrigin>): ReadonlyArray<PatternOrigin> => {
  const seen = new Set<string>()
  return values.filter((entry) => {
    if (seen.has(entry.value)) return false
    seen.add(entry.value)
    return true
  })
}

const allLayers = (layers: ReadonlyArray<ConfigurationLayer>): ReadonlyArray<ConfigurationLayer> => {
  const builtIn = layers.find((layer) => layer.name === "built-in")
  const ordered: Array<ConfigurationLayer> =
    builtIn !== undefined
      ? [...layers]
      : [{ name: "built-in", source: "built-in", document: { version: 1 } }, ...layers]
  return ordered.sort((left, right) => layerRank(left.name) - layerRank(right.name))
}

const layerRank = (name: ConfigurationLayerName): number => (name === "built-in" ? 0 : name === "user" ? 1 : 2)

const effectiveGraphLimit = (layers: ReadonlyArray<ConfigurationLayer>, key: GraphLimitField): Originated<number> => {
  let value: number = GRAPH_LIMIT_CEILINGS[key]
  let owner: ConfigurationOrigin = { layer: "built-in", source: "built-in", field: `graphLimits.${key}` }
  for (const layer of layers) {
    const supplied = layer.document.graphLimits?.[key]
    if (supplied === undefined) continue
    if (layer.name === "project" && owner.layer === "user" && supplied > value) {
      throw new ConfigurationError({
        source: layer.source,
        field: `graphLimits.${key}`,
        reason: "project graph limit may only lower the user maximum"
      })
    }
    value = supplied
    owner = origin(layer, `graphLimits.${key}`)
  }
  return originated(value, owner)
}

/** Convert the resolved, origin-bearing profile into a frozen Bend input. */
export const effectiveGraphLimits = (policy: ResolvedPolicy): GraphLimits =>
  validateGraphLimits({
    version: policy.graphLimits.version,
    sourceBytes: policy.graphLimits.sourceBytes.value,
    treeBytes: policy.graphLimits.treeBytes.value,
    files: policy.graphLimits.files.value,
    readBytes: policy.graphLimits.readBytes.value,
    outgoingEdges: policy.graphLimits.outgoingEdges.value,
    depth: policy.graphLimits.depth.value,
    work: policy.graphLimits.work.value
  })

export const effectiveEditPermitLimits = (
  policy: ResolvedPolicy
): { readonly perAdvicee: number; readonly resident: number } => {
  const user = policy.layers.find((layer) => layer.name === "user")?.document.editPermitLimits
  return {
    perAdvicee: user?.perAdvicee ?? DEFAULT_EDIT_PERMIT_LIMITS.perAdvicee,
    resident: user?.resident ?? DEFAULT_EDIT_PERMIT_LIMITS.resident
  }
}

const booleanSessionSetting = (
  policy: Pick<ResolvedPolicy, "layers">,
  field: "sessionAnalytics" | "sessionInspection"
): Originated<boolean> => {
  let setting = originated(false, { layer: "built-in", source: "built-in", field })
  for (const layer of policy.layers) {
    const value = layer.document[field]
    if (value !== undefined) setting = originated(value, origin(layer, field))
  }
  return setting
}

export const sessionAnalyticsSetting = (policy: Pick<ResolvedPolicy, "layers">): Originated<boolean> =>
  booleanSessionSetting(policy, "sessionAnalytics")
export const effectiveSessionAnalytics = (policy: ResolvedPolicy): boolean => sessionAnalyticsSetting(policy).value
export const sessionInspectionSetting = (policy: Pick<ResolvedPolicy, "layers">): Originated<boolean> =>
  booleanSessionSetting(policy, "sessionInspection")
export const effectiveSessionInspection = (policy: ResolvedPolicy): boolean => sessionInspectionSetting(policy).value

export const effectiveInspectionLimits = (policy: Pick<ResolvedPolicy, "layers">) => {
  const user = policy.layers.find((layer) => layer.name === "user")?.document
  return {
    retentionMs: (user?.inspectionRetentionDays ?? DEFAULT_INSPECTION_RETENTION_DAYS) * 24 * 60 * 60_000,
    storageBytes: user?.inspectionStorageBytes ?? DEFAULT_INSPECTION_STORAGE_BYTES
  }
}

export const effectiveVirtualRoundQuietMs = (policy: ResolvedPolicy): number =>
  policy.layers.find((layer) => layer.name === "user")?.document.virtualRoundQuietMs ?? DEFAULT_VIRTUAL_ROUND_QUIET_MS

export const effectiveReviewBackend = (policy: Pick<ResolvedPolicy, "layers">): ReviewBackendSettings =>
  policy.layers.find((layer) => layer.name === "user")?.document.reviewBackend ?? DEFAULT_REVIEW_BACKEND

const userOwnedControls = [
  { field: "inspectionRetentionDays", reason: "only user configuration may set shared inspection retention" },
  { field: "inspectionStorageBytes", reason: "only user configuration may set shared inspection storage capacity" },
  { field: "editPermitLimits", reason: "only user configuration may set shared resident edit permit limits" },
  { field: "virtualRoundQuietMs", reason: "only user configuration may set the shared resident virtual round timeout" }
] as const

const validateUserControls = (layers: ReadonlyArray<ConfigurationLayer>) => {
  for (const layer of layers) {
    if (layer.name !== "user" && layer.document.reviewBackend !== undefined) {
      throw new ConfigurationError({
        source: layer.source,
        field: "reviewBackend",
        reason: "only user configuration may select a review destination"
      })
    }
  }
  for (const control of userOwnedControls) {
    for (const layer of layers) {
      if (layer.name === "project" && layer.document[control.field] !== undefined) {
        throw new ConfigurationError({ source: layer.source, field: control.field, reason: control.reason })
      }
    }
  }
}

const validatePermitLimits = (layers: ReadonlyArray<ConfigurationLayer>) => {
  const userPermitLimits = layers.find((layer) => layer.name === "user")?.document.editPermitLimits
  if (
    (userPermitLimits?.perAdvicee ?? DEFAULT_EDIT_PERMIT_LIMITS.perAdvicee) >
    (userPermitLimits?.resident ?? DEFAULT_EDIT_PERMIT_LIMITS.resident)
  ) {
    throw new ConfigurationError({
      source: layers.find((layer) => layer.name === "user")?.source ?? "built-in",
      field: "editPermitLimits",
      reason: "perAdvicee limit cannot exceed resident limit"
    })
  }
}

const resolveRootPatterns = (layers: ReadonlyArray<ConfigurationLayer>) => {
  let includes: ReadonlyArray<PatternOrigin> = patternsFor(
    layers[0] ?? { name: "built-in", source: "built-in", document: { version: 1 } },
    "includes",
    BUILT_IN_INCLUDES
  )
  let overriddenIncludes: ReadonlyArray<PatternOrigin> = []
  let includeRank = 0
  let excludes: ReadonlyArray<PatternOrigin> = []
  const protectedExcludes: Array<PatternOrigin> = BUILT_IN_PROTECTED_EXCLUDES.map((value) => ({
    value,
    origin: { layer: "built-in", source: "built-in", field: "protectedExcludes" },
    active: true
  }))

  for (const layer of layers) {
    const suppliedIncludes = includeValues(layer.document)
    const rank = layerRank(layer.name)
    if (replaceIncludes(suppliedIncludes !== undefined, includeRank, rank)) {
      if (suppliedIncludes === undefined) throw new Error("canonical include choice lacks patterns")
      overriddenIncludes = dedupePatterns([
        ...overriddenIncludes,
        ...includes.map((entry) => ({ ...entry, active: false }))
      ])
      includes = dedupePatterns(patternsFor(layer, suppliedIncludes.field, suppliedIncludes.values))
      includeRank = rank
    }
    const suppliedExcludes = excludeValues(layer.document)
    if (suppliedExcludes !== undefined) {
      excludes = dedupePatterns([...excludes, ...patternsFor(layer, suppliedExcludes.field, suppliedExcludes.values)])
    }
    if (layer.document.privacyExcludes !== undefined) {
      protectedExcludes.push(...patternsFor(layer, "privacyExcludes", layer.document.privacyExcludes))
    }
  }

  return { includes, overriddenIncludes, excludes, protectedExcludes }
}

const resolveContextPatterns = (
  layers: ReadonlyArray<ConfigurationLayer>,
  includes: ReadonlyArray<PatternOrigin>,
  excludes: ReadonlyArray<PatternOrigin>
) => {
  let contextIncludes = includes
  let overriddenContextIncludes: ReadonlyArray<PatternOrigin> = []
  let contextExcludes: ReadonlyArray<PatternOrigin> = []
  let explicitContextExcludes = false
  let languages = originated<ReadonlyArray<"typescript" | "rust" | "bend">>(["typescript", "rust", "bend"], {
    layer: "built-in",
    source: "built-in",
    field: "languages"
  })
  for (const layer of layers) {
    if (layer.document.contextIncludes !== undefined) {
      overriddenContextIncludes = dedupePatterns([
        ...overriddenContextIncludes,
        ...contextIncludes.map((entry) => ({ ...entry, active: false }))
      ])
      contextIncludes = dedupePatterns(patternsFor(layer, "contextIncludes", layer.document.contextIncludes))
    }
    if (layer.document.contextExcludes !== undefined) {
      explicitContextExcludes = true
      contextExcludes = dedupePatterns([
        ...contextExcludes,
        ...patternsFor(layer, "contextExcludes", layer.document.contextExcludes)
      ])
    }
    if (layer.document.languages !== undefined)
      languages = originated(layer.document.languages, origin(layer, "languages"))
  }
  if (!explicitContextExcludes) contextExcludes = excludes
  return { contextIncludes, overriddenContextIncludes, contextExcludes, languages }
}

const resolvePatterns = (layers: ReadonlyArray<ConfigurationLayer>) => {
  const root = resolveRootPatterns(layers)
  return {
    ...root,
    ...resolveContextPatterns(layers, root.includes, root.excludes),
    protectedExcludes: dedupePatterns(root.protectedExcludes)
  }
}

const resolveCredentialReference = (layers: ReadonlyArray<ConfigurationLayer>) => {
  const backendOwner = layers.find(
    (layer) =>
      layer.name === "user" &&
      layer.document.reviewBackend !== undefined &&
      layer.document.reviewBackend.provider !== DEFAULT_REVIEW_BACKEND.provider
  )
  const selectedProvider = backendOwner?.document.reviewBackend?.provider ?? DEFAULT_REVIEW_BACKEND.provider
  let credentialEnvVar: Originated<string> = originated(
    REVIEW_PROVIDERS[selectedProvider].credentialEnvVar,
    backendOwner === undefined
      ? { layer: "built-in", source: "built-in", field: "credentialEnvVar" }
      : origin(backendOwner, "reviewBackend")
  )
  for (const layer of layers) {
    const value = layer.document.credentialEnvVar
    if (value !== undefined) {
      // Credential authority is user-owned. A project may provide a reference
      // when no user reference exists, but cannot silently redirect a user's
      // configured secret source.
      if (credentialEnvVar.origin.layer !== "user" || layer.name !== "project") {
        credentialEnvVar = originated(value, origin(layer, "credentialEnvVar"))
      }
    }
  }

  return credentialEnvVar
}

const resolveClaudeFeedback = (layers: ReadonlyArray<ConfigurationLayer>) => {
  let claudeFeedbackMode: Originated<ClaudeFeedbackMode> = originated("advisory", {
    layer: "built-in",
    source: "built-in",
    field: "claudeFeedbackMode"
  })
  for (const layer of layers) {
    const value = layer.document.claudeFeedbackMode
    if (value === undefined) continue
    if (value === "block-current-findings" && layer.name !== "user") {
      throw new ConfigurationError({
        source: layer.source,
        field: "claudeFeedbackMode",
        reason: "only user configuration may enable Claude block feedback"
      })
    }
    claudeFeedbackMode = originated(value, origin(layer, "claudeFeedbackMode"))
  }

  return claudeFeedbackMode
}

const resolveGraphLimits = (layers: ReadonlyArray<ConfigurationLayer>) => {
  const graphLimits = {
    version: 1 as const,
    sourceBytes: effectiveGraphLimit(layers, "sourceBytes"),
    treeBytes: effectiveGraphLimit(layers, "treeBytes"),
    files: effectiveGraphLimit(layers, "files"),
    readBytes: effectiveGraphLimit(layers, "readBytes"),
    outgoingEdges: effectiveGraphLimit(layers, "outgoingEdges"),
    depth: effectiveGraphLimit(layers, "depth"),
    work: effectiveGraphLimit(layers, "work")
  }
  if (graphLimits.readBytes.value < graphLimits.sourceBytes.value) {
    throw new ConfigurationError({
      source: graphLimits.readBytes.origin.source,
      field: "graphLimits.readBytes",
      reason: "total read cap must be at least the per-file source cap for full-file reservation"
    })
  }

  return graphLimits
}

/**
 * Resolve built-in → user → project policy while retaining every relevant origin.
 * The returned value is immutable-by-convention and can be captured per event.
 */
export const resolveConfiguration = (suppliedLayers: ReadonlyArray<ConfigurationLayer>, root = "."): ResolvedPolicy => {
  const layers = allLayers(suppliedLayers)
  validateUserControls(layers)
  validatePermitLimits(layers)
  const patterns = resolvePatterns(layers)
  const credentialEnvVar = resolveCredentialReference(layers)
  const claudeFeedbackMode = resolveClaudeFeedback(layers)
  const graphLimits = resolveGraphLimits(layers)

  const policyWithoutDigest = { root, ...patterns, credentialEnvVar, claudeFeedbackMode, graphLimits, layers }
  return { ...policyWithoutDigest, digest: digest(policyWithoutDigest) }
}

export const captureConfiguration = (policy: ResolvedPolicy): ConfigurationCapture => {
  return { policy }
}

export const configurationDigest = (policy: ResolvedPolicy): string => policy.digest

export const stableConfigurationValue = stable

/** Validate a captured policy before an event can dispatch source. */
export const validateCapturedPolicy = (policy: ResolvedPolicy): void => {
  if (
    policy.digest !==
    digest({
      root: policy.root,
      includes: policy.includes,
      overriddenIncludes: policy.overriddenIncludes,
      excludes: policy.excludes,
      protectedExcludes: policy.protectedExcludes,
      contextIncludes: policy.contextIncludes,
      overriddenContextIncludes: policy.overriddenContextIncludes,
      contextExcludes: policy.contextExcludes,
      languages: policy.languages,
      credentialEnvVar: policy.credentialEnvVar,
      claudeFeedbackMode: policy.claudeFeedbackMode,
      graphLimits: policy.graphLimits,
      layers: policy.layers
    })
  ) {
    throw new ConfigurationError({
      source: "captured-policy",
      field: "digest",
      reason: "captured configuration identity does not match its policy"
    })
  }
}
