import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { parseJsonc } from "./jsonc.ts";
import { configurationError, ConfigurationError } from "./errors.ts";
import {
  ConfigurationDocument,
  RuntimeSettings,
  type ConfigurationDocument as ConfigurationDocumentType,
} from "./types.ts";
import { validateGlobPattern } from "../matcher/glob.ts";

const strict = {
  onExcessProperty: "error",
  errors: "all",
} as const;

const ROOT_KEYS = new Set([
  "version", "$schema", "includes", "excludes", "privacyExcludes",
  "credentialEnvVar", "settings", "consent", "enabled",
  "packs", "ruleOverrides",
]);
const SETTINGS_KEYS = new Set(["deadlineMs", "concurrency", "adviceBudget", "transientRetries"]);

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

const checkString = (
  value: unknown,
  source: string,
  field: string,
  message = "must be a string",
): void => {
  if (typeof value !== "string") throw configurationError(source, field, message);
};

const checkBoolean = (value: unknown, source: string, field: string): void => {
  if (typeof value !== "boolean") throw configurationError(source, field, "must be a boolean");
};

const checkRuntimeNumber = (
  value: unknown,
  source: string,
  field: string,
  minimum: number,
  maximum: number,
): void => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw configurationError(
      source,
      field,
      `must be an integer between ${minimum} and ${maximum}`,
    );
  }
};

const checkPatterns = (
  value: unknown,
  source: string,
  field: string,
): void => {
  if (!Array.isArray(value)) throw configurationError(source, field, "must be an array");
  value.forEach((pattern, index) => {
    if (typeof pattern !== "string" || pattern.length === 0) {
      throw configurationError(source, `${field}[${index}]`, "must be a non-empty string");
    }
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

const checkSetting = (
  value: Record<string, unknown>,
  key: "deadlineMs" | "concurrency" | "adviceBudget" | "transientRetries",
  source: string,
  prefix: string,
): void => {
  if (!hasOwn(value, key)) return;
  const bounds = {
    deadlineMs: [1, 60_000],
    concurrency: [1, 32],
    adviceBudget: [0, 100],
    transientRetries: [0, 5],
  } as const;
  const range = bounds[key];
  checkRuntimeNumber(value[key], source, `${prefix.length === 0 ? "" : `${prefix}.`}${key}`, range[0], range[1]);
};

const checkPackReferences = (
  value: unknown,
  source: string,
  field: string,
): void => {
  if (!Array.isArray(value)) throw configurationError(source, field, "must be an array");
  value.forEach((reference, index) => {
    if (typeof reference === "string") {
      if (reference.length === 0) throw configurationError(source, `${field}[${index}]`, "pack path must be non-empty");
      return;
    }
    if (!record(reference)) throw configurationError(source, `${field}[${index}]`, "pack reference must be a string or object");
    assertKnownKeys(reference, new Set(["path", "id", "enabled"]), source, `${field}[${index}]`);
    if (!hasOwn(reference, "path") && !hasOwn(reference, "id")) {
      throw configurationError(source, `${field}[${index}]`, "a pack reference needs path or inherited id");
    }
    if (hasOwn(reference, "path")) checkString(reference.path, source, `${field}[${index}].path`, "must be a non-empty string");
    if (hasOwn(reference, "path") && (reference.path as string).length === 0) {
      throw configurationError(source, `${field}[${index}].path`, "must be a non-empty string");
    }
    if (hasOwn(reference, "id")) checkString(reference.id, source, `${field}[${index}].id`, "must be a non-empty string");
    if (hasOwn(reference, "id") && (reference.id as string).length === 0) {
      throw configurationError(source, `${field}[${index}].id`, "must be a non-empty string");
    }
    if (hasOwn(reference, "enabled")) checkBoolean(reference.enabled, source, `${field}[${index}].enabled`);
  });
};

const checkRuleOverrides = (
  value: unknown,
  source: string,
  field: string,
): Record<string, unknown> => {
  // The canonical v1 form is a map. Accepting an array here lets callers write
  // the evaluation-model form without making its ruleId redundant in JSON.
  const normalized: Record<string, unknown> = {};
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      if (!record(entry)) throw configurationError(source, `${field}[${index}]`, "must be an object");
      if (typeof entry.ruleId !== "string" || entry.ruleId.length === 0) {
        throw configurationError(source, `${field}[${index}].ruleId`, "must be a non-empty string");
      }
      const { ruleId, ...override } = entry;
      if (normalized[ruleId] !== undefined) {
        throw configurationError(source, `${field}[${index}].ruleId`, "duplicate rule override");
      }
      normalized[ruleId] = override;
    });
  } else if (record(value)) {
    for (const [ruleId, override] of Object.entries(value)) {
      if (ruleId.length === 0 || !record(override)) {
        throw configurationError(source, `${field}.${ruleId}`, "rule override must be an object");
      }
      normalized[ruleId] = override;
    }
  } else {
    throw configurationError(source, field, "must be a map or array");
  }
  for (const [ruleId, override] of Object.entries(normalized)) {
    assertKnownKeys(override as Record<string, unknown>, new Set([
      "enabled", "includes", "excludes", "threshold", "message",
    ]), source, `${field}.${ruleId}`);
    if (hasOwn(override as Record<string, unknown>, "enabled")) {
      checkBoolean((override as Record<string, unknown>).enabled, source, `${field}.${ruleId}.enabled`);
    }
    for (const key of ["includes", "excludes"] as const) {
      if (hasOwn(override as Record<string, unknown>, key)) {
        checkPatterns((override as Record<string, unknown>)[key], source, `${field}.${ruleId}.${key}`);
      }
    }
    if (hasOwn(override as Record<string, unknown>, "threshold")) {
      checkRuntimeNumber((override as Record<string, unknown>).threshold, source, `${field}.${ruleId}.threshold`, 0, 1);
    }
    if (hasOwn(override as Record<string, unknown>, "message")) {
      checkString((override as Record<string, unknown>).message, source, `${field}.${ruleId}.message`, "must be a non-empty string");
      if (((override as Record<string, unknown>).message as string).length === 0) {
        throw configurationError(source, `${field}.${ruleId}.message`, "must be a non-empty string");
      }
    }
  }
  return normalized;
};

/** Validate raw values before Effect Schema can collapse their path to `$`. */
const checkBoundaryValues = (
  value: Record<string, unknown>,
  source: string,
): void => {
  assertKnownKeys(value, ROOT_KEYS, source);
  if (hasOwn(value, "$schema")) checkString(value.$schema, source, "$schema");
  for (const field of ["includes", "excludes", "privacyExcludes"] as const) {
    if (hasOwn(value, field)) checkPatterns(value[field], source, field);
  }
  if (hasOwn(value, "credentialEnvVar")) {
    checkString(value.credentialEnvVar, source, "credentialEnvVar");
    if (!/^[A-Z_][A-Z0-9_]*$/.test(value.credentialEnvVar as string)) {
      throw configurationError(
        source,
        "credentialEnvVar",
        "must reference an uppercase environment variable name",
      );
    }
  }
  if (hasOwn(value, "settings")) {
    if (!record(value.settings)) throw configurationError(source, "settings", "must be an object");
    assertKnownKeys(value.settings, SETTINGS_KEYS, source, "settings");
    for (const key of ["deadlineMs", "concurrency", "adviceBudget", "transientRetries"] as const) {
      checkSetting(value.settings, key, source, "settings");
    }
  }
  if (hasOwn(value, "packs")) checkPackReferences(value.packs, source, "packs");
  if (hasOwn(value, "ruleOverrides")) checkRuleOverrides(value.ruleOverrides, source, "ruleOverrides");
  if (hasOwn(value, "consent")) checkBoolean(value.consent, source, "consent");
  if (hasOwn(value, "enabled")) checkBoolean(value.enabled, source, "enabled");
};

const stableJson = (value: unknown): string => {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  return encoded === undefined ? "null" : encoded;
};

/** Serialize canonical fields in stable order for replayable configuration tests. */
export const serializeConfigurationDocument = (
  document: ConfigurationDocumentType,
): string => stableJson(document);

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
  checkBoundaryValues(raw, source);
  // Normalize the optional evaluation-model array form before Schema decoding.
  // This keeps the stored configuration canonical and makes digests independent
  // of whether a caller used an array or a map at the boundary.
  if (hasOwn(raw, "ruleOverrides")) {
    raw.ruleOverrides = checkRuleOverrides(raw.ruleOverrides, source, "ruleOverrides");
  }
  try {
    return Schema.decodeUnknownSync(ConfigurationDocument, strict)(raw);
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
    const message = cause instanceof Error ? cause.message : "configuration is not valid JSONC";
    const duplicate = /duplicate object key '([^']+)'/.exec(message);
    throw configurationError(
      source,
      duplicate?.[1] ?? "$",
      message,
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
