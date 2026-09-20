import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { parseJsonc } from "./jsonc.ts";
import { configurationError, ConfigurationError } from "./errors.ts";
import {
  ConfigurationDocument,
  ConfigurationDocumentInput,
  RuntimeSettings,
  type ConfigurationDocument as ConfigurationDocumentType,
} from "./types.ts";
import { validateGlobPattern } from "../matcher/glob.ts";

const strict = {
  onExcessProperty: "error",
  errors: "all",
} as const;

const ROOT_KEYS = new Set([
  "version", "$schema", "includes", "excludes", "include", "exclude", "privacyExcludes",
  "credentialEnvVar", "credentials", "settings", "deadlineMs", "concurrency",
  "adviceBudget", "transientRetries", "consent", "enabled",
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

const checkAlias = (
  value: Record<string, unknown>,
  plural: "includes" | "excludes" | "credentialEnvVar",
  singular: "include" | "exclude" | "credentials",
  source: string,
): void => {
  if (hasOwn(value, plural) && hasOwn(value, singular)) {
    throw configurationError(
      source,
      plural,
      `${plural} and ${singular} cannot both be supplied`,
    );
  }
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
  for (const field of ["include", "exclude"] as const) {
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
  if (hasOwn(value, "credentials")) {
    if (!record(value.credentials)) {
      throw configurationError(source, "credentials", "must be an object with envVar");
    }
    assertKnownKeys(value.credentials, new Set(["envVar"]), source, "credentials");
    if (!hasOwn(value.credentials, "envVar")) {
      throw configurationError(source, "credentials.envVar", "must be provided");
    }
    checkString(value.credentials.envVar, source, "credentials.envVar");
    if (!/^[A-Z_][A-Z0-9_]*$/.test(value.credentials.envVar as string)) {
      throw configurationError(
        source,
        "credentials.envVar",
        "must reference an uppercase environment variable name",
      );
    }
  }
  if (hasOwn(value, "settings")) {
    if (!record(value.settings)) throw configurationError(source, "settings", "must be an object");
    assertKnownKeys(value.settings, SETTINGS_KEYS, source, "settings");
    for (const key of ["deadlineMs", "concurrency", "adviceBudget", "transientRetries"] as const) {
      checkSetting(value.settings, key, source, "settings");
      if (hasOwn(value.settings, key) && hasOwn(value, key)) {
        throw configurationError(
          source,
          `settings.${key}`,
          `settings.${key} and ${key} cannot both be supplied`,
        );
      }
    }
  }
  for (const key of ["deadlineMs", "concurrency", "adviceBudget", "transientRetries"] as const) {
    checkSetting(value, key, source, "");
  }
  if (hasOwn(value, "consent")) checkBoolean(value.consent, source, "consent");
  if (hasOwn(value, "enabled")) checkBoolean(value.enabled, source, "enabled");
  checkAlias(value, "includes", "include", source);
  checkAlias(value, "excludes", "exclude", source);
  checkAlias(value, "credentialEnvVar", "credentials", source);
};

const normalizedSettings = (
  value: Record<string, unknown>,
): Record<string, number> | undefined => {
  const nested = record(value.settings) ? value.settings : undefined;
  const settings: Record<string, number> = {};
  for (const key of ["deadlineMs", "concurrency", "adviceBudget", "transientRetries"] as const) {
    const candidate = nested?.[key] ?? value[key];
    if (candidate !== undefined) settings[key] = candidate as number;
  }
  return Object.keys(settings).length === 0 ? undefined : settings;
};

const canonicalDocument = (
  value: Record<string, unknown>,
): Record<string, unknown> => {
  const settings = normalizedSettings(value);
  return {
    version: 1,
    ...(value.$schema === undefined ? {} : { $schema: value.$schema }),
    ...(value.includes === undefined && value.include === undefined
      ? {}
      : { includes: value.includes ?? value.include }),
    ...(value.excludes === undefined && value.exclude === undefined
      ? {}
      : { excludes: value.excludes ?? value.exclude }),
    ...(value.privacyExcludes === undefined ? {} : { privacyExcludes: value.privacyExcludes }),
    ...(value.credentialEnvVar === undefined && !record(value.credentials)
      ? {}
      : {
          credentialEnvVar:
            value.credentialEnvVar ?? (value.credentials as Record<string, unknown>).envVar,
        }),
    ...(settings === undefined ? {} : { settings }),
    ...(value.consent === undefined ? {} : { consent: value.consent }),
    ...(value.enabled === undefined ? {} : { enabled: value.enabled }),
  };
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

/** Serialize only canonical fields so an alias cannot re-enter downstream layers. */
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
  try {
    const input = Schema.decodeUnknownSync(ConfigurationDocumentInput, strict)(raw) as unknown as Record<string, unknown>;
    const canonical = canonicalDocument(input);
    return Schema.decodeUnknownSync(ConfigurationDocument, strict)(canonical);
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
export { ConfigurationDocument, ConfigurationDocumentInput, RuntimeSettings };
