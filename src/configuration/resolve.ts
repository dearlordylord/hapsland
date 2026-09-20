import { createHash } from "node:crypto";
import {
  BUILT_IN_INCLUDES,
  BUILT_IN_PROTECTED_EXCLUDES,
  DEFAULT_RUNTIME_SETTINGS,
  type ConfigurationDocument,
  type ConfigurationLayerName,
  type ConfigurationOrigin,
  type ConfigurationCapture,
  type Originated,
  type PatternOrigin,
  type ResolvedPolicy,
  type ResolvedRule,
} from "./types.ts";
import { configurationError, ConfigurationError } from "./errors.ts";

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
  | { readonly field: "includes" | "include"; readonly values: ReadonlyArray<string> }
  | undefined => {
  if (document.includes !== undefined) return { field: "includes", values: document.includes };
  if (document.include !== undefined) return { field: "include", values: document.include };
  return undefined;
};

const excludeValues = (document: ConfigurationDocument):
  | { readonly field: "excludes" | "exclude"; readonly values: ReadonlyArray<string> }
  | undefined => {
  if (document.excludes !== undefined) return { field: "excludes", values: document.excludes };
  if (document.exclude !== undefined) return { field: "exclude", values: document.exclude };
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
  if (builtIn !== undefined) return layers;
  return [
    {
      name: "built-in",
      source: "built-in",
      document: { version: 1 },
    },
    ...layers,
  ];
};

const fieldValue = <T>(
  document: ConfigurationDocument,
  field: keyof ConfigurationDocument,
): T | undefined => document[field] as T | undefined;

const effectiveSetting = (
  layers: ReadonlyArray<ConfigurationLayer>,
  key: "deadlineMs" | "concurrency" | "adviceBudget" | "transientRetries",
  defaultValue: number,
): Originated<number> => {
  let value = defaultValue;
  let owner: ConfigurationOrigin = {
    layer: "built-in",
    source: "built-in",
    field: `settings.${key}`,
  };
  for (const layer of layers) {
    const nested = layer.document.settings?.[key];
    const flat = fieldValue<number>(layer.document, key);
    if (nested !== undefined) {
      value = nested;
      owner = origin(layer, `settings.${key}`);
    }
    if (flat !== undefined) {
      value = flat;
      owner = origin(layer, key);
    }
    if (nested !== undefined && flat !== undefined) {
      throw configurationError(
        layer.source,
        key,
        `settings.${key} and ${key} cannot both be supplied`,
      );
    }
  }
  return originated(value, owner);
};

const defaultRule = (id: string): ResolvedRule => ({
  id,
  enabled: true,
  includesSpecified: false,
  threshold: 0.7,
  includes: [],
  excludes: [],
  origins: {},
});

const resolveRules = (layers: ReadonlyArray<ConfigurationLayer>): Readonly<Record<string, ResolvedRule>> => {
  const rules = new Map<string, ResolvedRule>();
  for (const layer of layers) {
    for (const [id, override] of Object.entries(layer.document.rules ?? {})) {
      const previous = rules.get(id) ?? defaultRule(id);
      const next: ResolvedRule = {
        ...previous,
        ...(override.enabled === undefined ? {} : { enabled: override.enabled }),
        ...(override.threshold === undefined ? {} : { threshold: override.threshold }),
        ...(override.message === undefined ? {} : { message: override.message }),
        includesSpecified:
          override.includes !== undefined || override.include !== undefined
            ? true
            : previous.includesSpecified,
        includes:
          override.includes !== undefined
            ? patternsFor(layer, `rules.${id}.includes`, override.includes)
            : override.include !== undefined
              ? patternsFor(layer, `rules.${id}.include`, override.include)
              : previous.includes,
        excludes: [
          ...previous.excludes,
          ...(override.excludes !== undefined
            ? patternsFor(layer, `rules.${id}.excludes`, override.excludes)
            : override.exclude !== undefined
              ? patternsFor(layer, `rules.${id}.exclude`, override.exclude)
              : []),
        ],
        origins: {
          ...previous.origins,
          ...(override.enabled === undefined
            ? {}
            : { enabled: origin(layer, `rules.${id}.enabled`) }),
          ...(override.threshold === undefined
            ? {}
            : { threshold: origin(layer, `rules.${id}.threshold`) }),
          ...(override.message === undefined
            ? {}
            : { message: origin(layer, `rules.${id}.message`) }),
          ...(override.includes === undefined && override.include === undefined
            ? {}
            : { includes: origin(layer, `rules.${id}.includes`) }),
          ...(override.excludes === undefined && override.exclude === undefined
            ? {}
            : { excludes: origin(layer, `rules.${id}.excludes`) }),
        },
      };
      rules.set(id, {
        ...next,
        includes: dedupePatterns(next.includes),
        excludes: dedupePatterns(next.excludes),
      });
    }
  }
  return Object.fromEntries(rules);
};

/**
 * Resolve built-in → user → project policy while retaining every relevant origin.
 * The returned value is immutable-by-convention and can be captured per event.
 */
export const resolveConfiguration = (
  suppliedLayers: ReadonlyArray<ConfigurationLayer>,
  root = ".",
): ResolvedPolicy => {
  const layers = allLayers(suppliedLayers);
  let includes: ReadonlyArray<PatternOrigin> = patternsFor(
    layers[0] ?? { name: "built-in", source: "built-in", document: { version: 1 } },
    "includes",
    BUILT_IN_INCLUDES,
  );
  let overriddenIncludes: ReadonlyArray<PatternOrigin> = [];
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
    if (suppliedIncludes !== undefined) {
      overriddenIncludes = dedupePatterns([
        ...overriddenIncludes,
        ...includes.map((entry) => ({ ...entry, active: false })),
      ]);
      includes = dedupePatterns(patternsFor(layer, suppliedIncludes.field, suppliedIncludes.values));
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

  let credentialEnvVar: Originated<string> = originated("TYPESAFE_API_KEY", {
    layer: "built-in",
    source: "built-in",
    field: "credentialEnvVar",
  });
  for (const layer of layers) {
    const value = layer.document.credentialEnvVar ?? layer.document.credentials?.envVar;
    if (value !== undefined) {
      // Credential authority is user-owned. A project may provide a reference
      // when no user reference exists, but cannot silently redirect a user's
      // configured secret source.
      if (credentialEnvVar.origin.layer !== "user" || layer.name !== "project") {
        credentialEnvVar = originated(value, origin(layer, "credentialEnvVar"));
      }
    }
  }

  const policyWithoutDigest = {
    root,
    includes,
    overriddenIncludes,
    excludes,
    protectedExcludes: dedupePatterns(protectedExcludes),
    credentialEnvVar,
    settings: {
      deadlineMs: effectiveSetting(layers, "deadlineMs", DEFAULT_RUNTIME_SETTINGS.deadlineMs),
      concurrency: effectiveSetting(layers, "concurrency", DEFAULT_RUNTIME_SETTINGS.concurrency),
      adviceBudget: effectiveSetting(layers, "adviceBudget", DEFAULT_RUNTIME_SETTINGS.adviceBudget),
      transientRetries: effectiveSetting(
        layers,
        "transientRetries",
        DEFAULT_RUNTIME_SETTINGS.transientRetries,
      ),
    },
    rules: resolveRules(layers),
    layers,
  };
  return {
    ...policyWithoutDigest,
    digest: digest(policyWithoutDigest),
  };
};

export const captureConfiguration = (
  root: string,
  policy: ResolvedPolicy,
): ConfigurationCapture => {
  const project = policy.layers.find((layer) => layer.name === "project");
  const user = policy.layers.find((layer) => layer.name === "user");
  return {
    root,
    policy,
    ...(project === undefined ? {} : { projectSource: project.source }),
    ...(user === undefined ? {} : { userSource: user.source }),
  };
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
    settings: policy.settings,
    rules: policy.rules,
    layers: policy.layers,
  })) {
    throw new ConfigurationError({
      source: "captured-policy",
      field: "digest",
      reason: "captured configuration identity does not match its policy",
    });
  }
};
