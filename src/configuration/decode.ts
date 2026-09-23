import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { parseJsonc } from "./jsonc.ts";
import {
  configurationError,
  ConfigurationError,
  schemaConfigurationError,
} from "./errors.ts";
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

const validatePatterns = (
  patterns: ReadonlyArray<string> | undefined,
  source: string,
  field: string,
): void => {
  patterns?.forEach((pattern, index) => {
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

/** JSON Schema cannot express the product's bounded repository glob dialect. */
const validateConfigurationGlobs = (
  document: ConfigurationDocumentType,
  source: string,
): void => {
  validatePatterns(document.includes, source, "includes");
  validatePatterns(document.excludes, source, "excludes");
  validatePatterns(document.privacyExcludes, source, "privacyExcludes");
  for (const [ruleId, override] of Object.entries(document.ruleOverrides ?? {})) {
    validatePatterns(override.includes, source, `ruleOverrides.${ruleId}.includes`);
    validatePatterns(override.excludes, source, `ruleOverrides.${ruleId}.excludes`);
  }
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

/** Decode one already-parsed value through the canonical Effect Schema boundary. */
export const decodeConfigurationDocument = (
  unknown: unknown,
  source: string,
): ConfigurationDocumentType => {
  let document: ConfigurationDocumentType;
  try {
    document = Schema.decodeUnknownSync(ConfigurationDocument, strict)(unknown);
  } catch (cause) {
    if (cause instanceof ConfigurationError) throw cause;
    throw schemaConfigurationError(
      source,
      cause,
      "configuration contains an unknown or malformed field",
    );
  }
  validateConfigurationGlobs(document, source);
  return document;
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
