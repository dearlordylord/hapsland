import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { parseJsonc } from "./jsonc.ts";
import { configurationError, ConfigurationError } from "./errors.ts";
import {
  ConfigurationDocument,
  RuleOverride,
  RuntimeSettings,
  type ConfigurationDocument as ConfigurationDocumentType,
} from "./types.ts";
import { validateGlobPattern } from "../matcher/glob.ts";

const strict = {
  onExcessProperty: "error",
  errors: "all",
} as const;

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assertKnownKeys = (
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  source: string,
  prefix = "",
): void => {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw configurationError(
        source,
        prefix.length === 0 ? key : `${prefix}.${key}`,
        "unknown configuration field",
      );
    }
  }
};

const checkPatterns = (
  patterns: ReadonlyArray<string>,
  source: string,
  field: string,
): void => {
  patterns.forEach((pattern, index) => {
    try {
      validateGlobPattern(pattern);
    } catch (cause) {
      throw configurationError(
        source,
        `${field}[${index}]`,
        cause instanceof Error ? cause.message : "invalid glob pattern",
      );
    }
  });
};

const checkAlias = (
  value: Record<string, unknown>,
  plural: "includes" | "excludes" | "credentialEnvVar",
  singular: "include" | "exclude" | "credentials",
  source: string,
): void => {
  if (hasOwn(value, plural) && hasOwn(value, singular)) {
    throw configurationError(source, plural, `${plural} and ${singular} cannot both be supplied`);
  }
};

const checkDocumentValues = (
  value: ConfigurationDocumentType,
  source: string,
): void => {
  const raw = value as unknown as Record<string, unknown>;
  assertKnownKeys(
    raw,
    new Set([
      "version", "$schema", "includes", "excludes", "include", "exclude", "privacyExcludes",
      "credentialEnvVar", "credentials", "settings", "deadlineMs", "concurrency",
      "adviceBudget", "transientRetries", "rules", "consent", "enabled",
    ]),
    source,
  );
  if (record(raw.settings)) {
    assertKnownKeys(
      raw.settings,
      new Set(["deadlineMs", "concurrency", "adviceBudget", "transientRetries"]),
      source,
      "settings",
    );
  }
  if (record(raw.credentials)) {
    assertKnownKeys(raw.credentials, new Set(["envVar"]), source, "credentials");
  }
  checkAlias(raw, "includes", "include", source);
  checkAlias(raw, "excludes", "exclude", source);
  checkAlias(raw, "credentialEnvVar", "credentials", source);
  const includes = value.includes ?? value.include;
  const excludes = value.excludes ?? value.exclude;
  if (includes !== undefined) checkPatterns(includes, source, "includes");
  if (excludes !== undefined) checkPatterns(excludes, source, "excludes");
  if (value.privacyExcludes !== undefined) {
    checkPatterns(value.privacyExcludes, source, "privacyExcludes");
  }
  if (value.rules !== undefined) {
    for (const [id, override] of Object.entries(value.rules)) {
      if (!/^[A-Za-z0-9_.:/-]+$/.test(id)) {
        throw configurationError(source, `rules.${id}`, "rule identity is invalid");
      }
      if (record(override)) {
        assertKnownKeys(
          override,
          new Set(["enabled", "threshold", "message", "includes", "excludes", "include", "exclude"]),
          source,
          `rules.${id}`,
        );
      }
      const decoded = Schema.decodeUnknownSync(RuleOverride, strict)(override);
      const ruleValue = decoded as unknown as Record<string, unknown>;
      checkAlias(ruleValue, "includes", "include", `${source}#rules.${id}`);
      checkAlias(ruleValue, "excludes", "exclude", `${source}#rules.${id}`);
      const ruleIncludes = decoded.includes ?? decoded.include;
      const ruleExcludes = decoded.excludes ?? decoded.exclude;
      if (ruleIncludes !== undefined) {
        checkPatterns(ruleIncludes, source, `rules.${id}.includes`);
      }
      if (ruleExcludes !== undefined) {
        checkPatterns(ruleExcludes, source, `rules.${id}.excludes`);
      }
    }
  }
};

/** Decode one already-parsed document and retain only bounded diagnostics. */
export const decodeConfigurationDocument = (
  unknown: unknown,
  source: string,
): ConfigurationDocumentType => {
  if (!record(unknown)) {
    throw configurationError(source, "$", "configuration must be a JSON object");
  }
  const raw = unknown as Record<string, unknown>;
  if (raw.version !== 1) {
    throw configurationError(source, "version", "unsupported configuration schema version");
  }
  assertKnownKeys(
    raw,
    new Set([
      "version", "$schema", "includes", "excludes", "include", "exclude", "privacyExcludes",
      "credentialEnvVar", "credentials", "settings", "deadlineMs", "concurrency",
      "adviceBudget", "transientRetries", "rules", "consent", "enabled",
    ]),
    source,
  );
  if (record(raw.settings)) {
    assertKnownKeys(
      raw.settings,
      new Set(["deadlineMs", "concurrency", "adviceBudget", "transientRetries"]),
      source,
      "settings",
    );
  }
  if (record(raw.credentials)) {
    assertKnownKeys(raw.credentials, new Set(["envVar"]), source, "credentials");
  }
  if (record(raw.rules)) {
    for (const [id, override] of Object.entries(raw.rules)) {
      if (record(override)) {
        assertKnownKeys(
          override,
          new Set(["enabled", "threshold", "message", "includes", "excludes", "include", "exclude"]),
          source,
          `rules.${id}`,
        );
      }
    }
  }
  try {
    const value = Schema.decodeUnknownSync(ConfigurationDocument, strict)(unknown);
    checkDocumentValues(value, source);
    return value;
  } catch (cause) {
    if (cause instanceof ConfigurationError) throw cause;
    throw configurationError(source, "$", "configuration contains an unknown or malformed field");
  }
};

export const decodeConfigurationText = (
  text: string,
  source: string,
): ConfigurationDocumentType => {
  let parsed: unknown;
  try {
    parsed = parseJsonc(text);
  } catch (cause) {
    throw configurationError(
      source,
      "$",
      cause instanceof Error ? cause.message : "configuration is not valid JSONC",
    );
  }
  return decodeConfigurationDocument(parsed, source);
};

export const decodeConfigurationTextEffect = Effect.fn(
  "Configuration.decodeText",
)((text: string, source: string) =>
  Effect.try({
    try: () => decodeConfigurationText(text, source),
    catch: (cause) =>
      cause instanceof ConfigurationError
        ? cause
        : configurationError(source, "$", "configuration decoding failed"),
  }),
);

export const runtimeSettingsFrom = (
  document: ConfigurationDocumentType,
): ConfigurationDocumentType["settings"] => document.settings;

// Keep these exports discoverable for callers constructing test documents.
export { ConfigurationDocument, RuntimeSettings };
