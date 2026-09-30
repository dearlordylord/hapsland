import { createHash } from "node:crypto";
import {
  BUILT_IN_INCLUDES,
  BUILT_IN_PROTECTED_EXCLUDES,
  DEFAULT_CREDENTIAL_ENV_VAR,
  DEFAULT_EDIT_PERMIT_LIMITS,
  DEFAULT_VIRTUAL_ROUND_QUIET_MS,
  type ConfigurationDocument,
  type ConfigurationLayerName,
  type ConfigurationOrigin,
  type ConfigurationCapture,
  type ClaudeFeedbackMode,
  type Originated,
  type PatternOrigin,
  type ResolvedPolicy,
} from "./types.ts";
import { ConfigurationError } from "./errors.ts";
import { replaceIncludes } from "./decision.ts";
import { GRAPH_LIMIT_CEILINGS, validateGraphLimits, type GraphLimitField, type GraphLimits } from "./graph-limits.ts";

export type ConfigurationLayer = {
  readonly name: ConfigurationLayerName;
  readonly source: string;
  readonly document: ConfigurationDocument;
};

const origin = (
  layer: ConfigurationLayer,
  field: string,
): ConfigurationOrigin => ({
  layer: layer.name,
  source: layer.source,
  field,
});

const originated = <T>(value: T, owner: ConfigurationOrigin): Originated<T> => ({
  value,
  origin: owner,
});

const patternsFor = (
  layer: ConfigurationLayer,
  field: string,
  values: ReadonlyArray<string>,
): ReadonlyArray<PatternOrigin> =>
  values.map((value) => ({ value, origin: origin(layer, field), active: true }));

const includeValues = (document: ConfigurationDocument):
  | { readonly field: "includes"; readonly values: ReadonlyArray<string> }
  | undefined => {
  if (document.includes !== undefined) return { field: "includes", values: document.includes };
  return undefined;
};

const excludeValues = (document: ConfigurationDocument):
  | { readonly field: "excludes"; readonly values: ReadonlyArray<string> }
  | undefined => {
  if (document.excludes !== undefined) return { field: "excludes", values: document.excludes };
  return undefined;
};

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const digest = (value: unknown): string =>
  createHash("sha256").update(stable(value)).digest("hex");

const dedupePatterns = (
  values: ReadonlyArray<PatternOrigin>,
): ReadonlyArray<PatternOrigin> => {
  const seen = new Set<string>();
  return values.filter((entry) => {
    if (seen.has(entry.value)) return false;
    seen.add(entry.value);
    return true;
  });
};

const allLayers = (layers: ReadonlyArray<ConfigurationLayer>): ReadonlyArray<ConfigurationLayer> => {
  const builtIn = layers.find((layer) => layer.name === "built-in");
  const ordered: Array<ConfigurationLayer> = builtIn !== undefined ? [...layers] : [
    {
      name: "built-in",
      source: "built-in",
      document: { version: 1 },
    },
    ...layers,
  ];
  return ordered.sort((left, right) => layerRank(left.name) - layerRank(right.name));
};

const layerRank = (name: ConfigurationLayerName): number =>
  name === "built-in" ? 0 : name === "user" ? 1 : 2;

const effectiveGraphLimit = (layers: ReadonlyArray<ConfigurationLayer>, key: GraphLimitField): Originated<number> => {
  let value: number = GRAPH_LIMIT_CEILINGS[key];
  let owner: ConfigurationOrigin = { layer: "built-in", source: "built-in", field: `graphLimits.${key}` };
  for (const layer of layers) {
    const supplied = layer.document.graphLimits?.[key];
    if (supplied === undefined) continue;
    if (layer.name === "project" && owner.layer === "user" && supplied > value) {
      throw new ConfigurationError({
        source: layer.source, field: `graphLimits.${key}`,
        reason: "project graph limit may only lower the user maximum",
      });
    }
    value = supplied;
    owner = origin(layer, `graphLimits.${key}`);
  }
  return originated(value, owner);
};

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
    work: policy.graphLimits.work.value,
  });

export const effectiveEditPermitLimits = (policy: ResolvedPolicy): {
  readonly perAdvicee: number; readonly resident: number;
} => {
  const user = policy.layers.find((layer) => layer.name === "user")?.document.editPermitLimits;
  return {
    perAdvicee: user?.perAdvicee ?? DEFAULT_EDIT_PERMIT_LIMITS.perAdvicee,
    resident: user?.resident ?? DEFAULT_EDIT_PERMIT_LIMITS.resident,
  };
};

export const effectiveVirtualRoundQuietMs = (policy: ResolvedPolicy): number =>
  policy.layers.find((layer) => layer.name === "user")?.document.virtualRoundQuietMs ??
    DEFAULT_VIRTUAL_ROUND_QUIET_MS;

/**
 * Resolve built-in → user → project policy while retaining every relevant origin.
 * The returned value is immutable-by-convention and can be captured per event.
 */
export const resolveConfiguration = (
  suppliedLayers: ReadonlyArray<ConfigurationLayer>,
  root = ".",
): ResolvedPolicy => {
  const layers = allLayers(suppliedLayers);
  for (const layer of layers) if (layer.name === "project" && layer.document.editPermitLimits !== undefined) {
    throw new ConfigurationError({ source: layer.source, field: "editPermitLimits",
      reason: "only user configuration may set shared resident edit permit limits" });
  }
  for (const layer of layers) if (layer.name === "project" && layer.document.virtualRoundQuietMs !== undefined) {
    throw new ConfigurationError({ source: layer.source, field: "virtualRoundQuietMs",
      reason: "only user configuration may set the shared resident virtual round timeout" });
  }
  const userPermitLimits = layers.find((layer) => layer.name === "user")?.document.editPermitLimits;
  if ((userPermitLimits?.perAdvicee ?? DEFAULT_EDIT_PERMIT_LIMITS.perAdvicee) >
      (userPermitLimits?.resident ?? DEFAULT_EDIT_PERMIT_LIMITS.resident)) {
    throw new ConfigurationError({
      source: layers.find((layer) => layer.name === "user")?.source ?? "built-in",
      field: "editPermitLimits", reason: "perAdvicee limit cannot exceed resident limit",
    });
  }
  let includes: ReadonlyArray<PatternOrigin> = patternsFor(
    layers[0] ?? { name: "built-in", source: "built-in", document: { version: 1 } },
    "includes",
    BUILT_IN_INCLUDES,
  );
  let overriddenIncludes: ReadonlyArray<PatternOrigin> = [];
  let includeRank = 0;
  let excludes: ReadonlyArray<PatternOrigin> = [];
  const protectedExcludes: Array<PatternOrigin> = [];
  for (const pattern of BUILT_IN_PROTECTED_EXCLUDES) {
    protectedExcludes.push({
      value: pattern,
      origin: { layer: "built-in", source: "built-in", field: "protectedExcludes" },
      active: true,
    });
  }

  for (const layer of layers) {
    const suppliedIncludes = includeValues(layer.document);
    const rank = layerRank(layer.name);
    if (replaceIncludes(suppliedIncludes !== undefined, includeRank, rank)) {
      if (suppliedIncludes === undefined) throw new Error("canonical include choice lacks patterns");
      overriddenIncludes = dedupePatterns([
        ...overriddenIncludes,
        ...includes.map((entry) => ({ ...entry, active: false })),
      ]);
      includes = dedupePatterns(patternsFor(layer, suppliedIncludes.field, suppliedIncludes.values));
      includeRank = rank;
    }
    const suppliedExcludes = excludeValues(layer.document);
    if (suppliedExcludes !== undefined) {
      excludes = dedupePatterns([
        ...excludes,
        ...patternsFor(layer, suppliedExcludes.field, suppliedExcludes.values),
      ]);
    }
    if (layer.document.privacyExcludes !== undefined) {
      protectedExcludes.push(
        ...patternsFor(layer, "privacyExcludes", layer.document.privacyExcludes),
      );
    }
  }

  let credentialEnvVar: Originated<string> = originated(DEFAULT_CREDENTIAL_ENV_VAR, {
    layer: "built-in",
    source: "built-in",
    field: "credentialEnvVar",
  });
  for (const layer of layers) {
    const value = layer.document.credentialEnvVar;
    if (value !== undefined) {
      // Credential authority is user-owned. A project may provide a reference
      // when no user reference exists, but cannot silently redirect a user's
      // configured secret source.
      if (credentialEnvVar.origin.layer !== "user" || layer.name !== "project") {
        credentialEnvVar = originated(value, origin(layer, "credentialEnvVar"));
      }
    }
  }

  let claudeFeedbackMode: Originated<ClaudeFeedbackMode> = originated("advisory", {
    layer: "built-in",
    source: "built-in",
    field: "claudeFeedbackMode",
  });
  for (const layer of layers) {
    const value = layer.document.claudeFeedbackMode;
    if (value === undefined) continue;
    if (value === "block-current-findings" && layer.name !== "user") {
      throw new ConfigurationError({
        source: layer.source,
        field: "claudeFeedbackMode",
        reason: "only user configuration may enable Claude block feedback",
      });
    }
    claudeFeedbackMode = originated(value, origin(layer, "claudeFeedbackMode"));
  }

  const graphLimits = {
    version: 1 as const,
    sourceBytes: effectiveGraphLimit(layers, "sourceBytes"),
    treeBytes: effectiveGraphLimit(layers, "treeBytes"),
    files: effectiveGraphLimit(layers, "files"),
    readBytes: effectiveGraphLimit(layers, "readBytes"),
    outgoingEdges: effectiveGraphLimit(layers, "outgoingEdges"),
    depth: effectiveGraphLimit(layers, "depth"),
    work: effectiveGraphLimit(layers, "work"),
  };
  if (graphLimits.readBytes.value < graphLimits.sourceBytes.value) {
    throw new ConfigurationError({
      source: graphLimits.readBytes.origin.source, field: "graphLimits.readBytes",
      reason: "total read cap must be at least the per-file source cap for full-file reservation",
    });
  }

  const policyWithoutDigest = {
    root,
    includes,
    overriddenIncludes,
    excludes,
    protectedExcludes: dedupePatterns(protectedExcludes),
    credentialEnvVar,
    claudeFeedbackMode,
    graphLimits,
    layers,
  };
  return {
    ...policyWithoutDigest,
    digest: digest(policyWithoutDigest),
  };
};

export const captureConfiguration = (
  policy: ResolvedPolicy,
): ConfigurationCapture => {
  return { policy };
};

export const configurationDigest = (policy: ResolvedPolicy): string => policy.digest;

export const stableConfigurationValue = stable;

/** Validate a captured policy before an event can dispatch source. */
export const validateCapturedPolicy = (policy: ResolvedPolicy): void => {
  if (policy.digest !== digest({
    root: policy.root,
    includes: policy.includes,
    overriddenIncludes: policy.overriddenIncludes,
    excludes: policy.excludes,
    protectedExcludes: policy.protectedExcludes,
    credentialEnvVar: policy.credentialEnvVar,
    claudeFeedbackMode: policy.claudeFeedbackMode,
    graphLimits: policy.graphLimits,
    layers: policy.layers,
  })) {
    throw new ConfigurationError({
      source: "captured-policy",
      field: "digest",
      reason: "captured configuration identity does not match its policy",
    });
  }
};
