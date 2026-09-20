import * as Schema from "effect/Schema";

/** The only configuration format accepted by the product in this phase. */
export const CONFIGURATION_VERSION = 1 as const;

const Pattern = Schema.String.check(Schema.isMinLength(1));
const EnvironmentVariableName = Schema.String.check(
  Schema.isPattern(/^[A-Z_][A-Z0-9_]*$/),
);
const NonNegativeInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export const RuntimeSettings = Schema.Struct({
  deadlineMs: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 60_000 })),
  ),
  concurrency: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 32 })),
  ),
  adviceBudget: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
  ),
  transientRetries: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 })),
  ),
});
export interface RuntimeSettings extends Schema.Schema.Type<typeof RuntimeSettings> {}

/**
 * Canonical JSONC v1 project/user document.
 *
 * Lists intentionally remain optional: omission inherits while [] is an explicit
 * empty selection.
 */
export const ConfigurationDocument = Schema.Struct({
  version: Schema.Literal(CONFIGURATION_VERSION),
  /** Standard editor metadata; it has no runtime effect. */
  $schema: Schema.optionalKey(Schema.String),
  includes: Schema.optionalKey(Schema.Array(Pattern)),
  excludes: Schema.optionalKey(Schema.Array(Pattern)),
  privacyExcludes: Schema.optionalKey(Schema.Array(Pattern)),
  credentialEnvVar: Schema.optionalKey(EnvironmentVariableName),
  settings: Schema.optionalKey(RuntimeSettings),
  // These fields are accepted for compatibility with the consent slice. They
  // never authorize source egress and are never used as privacy policy.
  consent: Schema.optionalKey(Schema.Boolean),
  enabled: Schema.optionalKey(Schema.Boolean),
});
export interface ConfigurationDocument
  extends Schema.Schema.Type<typeof ConfigurationDocument> {}

export type ConfigurationLayerName = "built-in" | "user" | "project";

export type ConfigurationOrigin = {
  readonly layer: ConfigurationLayerName;
  readonly source: string;
  readonly field: string;
};

export type Originated<T> = {
  readonly value: T;
  readonly origin: ConfigurationOrigin;
};

export type PatternOrigin = Originated<string> & {
  readonly active: boolean;
};

export type ResolvedPolicy = {
  readonly root: string;
  readonly includes: ReadonlyArray<PatternOrigin>;
  readonly overriddenIncludes: ReadonlyArray<PatternOrigin>;
  readonly excludes: ReadonlyArray<PatternOrigin>;
  readonly protectedExcludes: ReadonlyArray<PatternOrigin>;
  readonly credentialEnvVar: Originated<string>;
  readonly settings: {
    readonly deadlineMs: Originated<number>;
    readonly concurrency: Originated<number>;
    readonly adviceBudget: Originated<number>;
    readonly transientRetries: Originated<number>;
  };
  readonly layers: ReadonlyArray<{
    readonly name: ConfigurationLayerName;
    readonly source: string;
    readonly document: ConfigurationDocument;
  }>;
  /** Stable JSON-safe identity used by the event capture boundary. */
  readonly digest: string;
};

export type ConfigurationCapture = {
  readonly policy: ResolvedPolicy;
};

export const DEFAULT_RUNTIME_SETTINGS = {
  deadlineMs: 1_000,
  concurrency: 4,
  adviceBudget: 5,
  transientRetries: 2,
} as const;

export const BUILT_IN_INCLUDES = ["**/*"] as const;

/** Narrow privacy exclusions are accumulated in addition to ordinary excludes. */
export const BUILT_IN_PROTECTED_EXCLUDES = [
  ".git/**",
  ".git",
  "**/.env",
  "**/.env.*",
  "**/*.key",
  "**/*.pem",
  "**/*.p12",
  "**/*.pfx",
  "**/credentials",
  "**/credentials.*",
  "**/secret",
  "**/secrets",
  "**/secret.*",
  "**/secrets.*",
] as const;

export const isEnvironmentVariableName = (value: string): boolean =>
  /^[A-Z_][A-Z0-9_]*$/.test(value);

// Keep this value referenced so strict unused checks continue to document why
// the schema uses a non-negative integer helper in future additions.
export const nonNegativeInteger = NonNegativeInteger;
