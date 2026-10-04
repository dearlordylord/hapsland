import * as Schema from "effect/Schema";
import { RuleIdentitySchema } from "../domain/rule-identity.ts";
import { GRAPH_LIMIT_CEILINGS, type GraphLimitField } from "./graph-limits.ts";

/** The only configuration format accepted by the product in this phase. */
export const CONFIGURATION_VERSION = 1 as const;
export const DEFAULT_CREDENTIAL_ENV_VAR = "TYPESAFE_API_KEY" as const;
export const ClaudeFeedbackMode = Schema.Literals(["advisory", "block-current-findings"]).annotate({
  description: "Claude PostToolUse feedback. Blocking current findings requires an explicit user configuration opt-in; a project may only restrict it to advisory.",
  default: "advisory",
});
export type ClaudeFeedbackMode = typeof ClaudeFeedbackMode.Type;
export const DEFAULT_RUNTIME_SETTINGS = {
  deadlineMs: 1_000,
  concurrency: 4,
  adviceBudget: 5,
  transientRetries: 2,
} as const;

export const DEFAULT_EDIT_PERMIT_LIMITS = {
  perAdvicee: 32,
  resident: 4096,
} as const;
export const DEFAULT_VIRTUAL_ROUND_QUIET_MS = 5 * 60_000;

export const EditPermitLimitsSettings = Schema.Struct({
  perAdvicee: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65536 })).annotate({
    description: "Maximum simultaneously pending edit permits for one advicee in the shared resident.",
    default: DEFAULT_EDIT_PERMIT_LIMITS.perAdvicee,
  })),
  resident: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65536 })).annotate({
    description: "Maximum simultaneously pending edit permits across the shared resident.",
    default: DEFAULT_EDIT_PERMIT_LIMITS.resident,
  })),
}).annotate({
  identifier: "EditPermitLimitsSettings",
  description: "User-owned shared resident admission limits. Omitted values use built-in defaults.",
});
export interface EditPermitLimitsSettings extends Schema.Schema.Type<typeof EditPermitLimitsSettings> {}

const Pattern = Schema.String.check(Schema.isMinLength(1)).annotate({
  description: "A non-empty repository-relative glob pattern using forward slashes.",
});
const EnvironmentVariableName = Schema.String.check(
  Schema.isPattern(/^[A-Z_][A-Z0-9_]*$/u),
).annotate({
  description: "Name of the environment variable that supplies the review credential. Store the secret value outside configuration.",
  default: DEFAULT_CREDENTIAL_ENV_VAR,
});

/** A local or bundled declarative rule-pack reference. */
const PackEnabled = Schema.Boolean.annotate({
  description: "Optional enablement override. Omission inherits an existing pack's state and enables a newly declared pack.",
});

export const RulePackReference = Schema.Union([
  Schema.String.check(Schema.isMinLength(1)).annotate({
    description: "Path to a local rule-pack document.",
  }),
  // A reference is either a declaration (path) or an inherited identity (id).
  // Keeping these as separate object schemas makes the XOR part of the public
  // boundary rather than relying on a later loader check.
  Schema.Struct({
    path: Schema.String.check(Schema.isMinLength(1)).annotate({
      description: "Local rule-pack path; relative paths resolve from the originating configuration file.",
    }),
    enabled: Schema.optionalKey(PackEnabled),
  }),
  Schema.Struct({
    id: RuleIdentitySchema.annotate({
      description: "Identity of a rule pack declared in a lower-precedence configuration layer.",
    }),
    enabled: Schema.optionalKey(PackEnabled),
  }),
]).annotate({
  identifier: "RulePackReference",
  description: "A path declaration or an inherited pack identity; object forms contain exactly one locator.",
});
export type RulePackReference = typeof RulePackReference.Type;

export const RuleOverride = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean.annotate({
    description: "Whether this rule is enabled in this configuration layer.",
  })),
  includes: Schema.optionalKey(Schema.Array(Pattern).annotate({
    description: "Additional rule path filters; they intersect global file selection.",
  })),
  excludes: Schema.optionalKey(Schema.Array(Pattern).annotate({
    description: "Rule-specific path exclusions; they cannot restore globally excluded paths.",
  })),
  threshold: Schema.optionalKey(
    Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })).annotate({
      description: "Probability threshold from 0 through 1. Omission inherits the rule-pack threshold.",
    }),
  ),
  message: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1)).annotate({
    description: "Advice text to use for this rule; omission keeps the rule-pack message.",
  })),
}).annotate({
  identifier: "RuleOverride",
  description: "Layer-specific activation, path filters, threshold, and advice message for one qualified rule ID.",
});
export interface RuleOverride extends Schema.Schema.Type<typeof RuleOverride> {}

const graphBound = (ceiling: number, description: string) =>
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: ceiling })).annotate({ description, default: ceiling });

export const GraphLimitsSettings = Schema.Struct({
  version: Schema.Literal(1).annotate({ description: "Import graph limits profile version." }),
  sourceBytes: Schema.optionalKey(graphBound(GRAPH_LIMIT_CEILINGS.sourceBytes, "Maximum source bytes in each graph file.")),
  treeBytes: Schema.optionalKey(graphBound(GRAPH_LIMIT_CEILINGS.treeBytes, "Maximum accepted encoded evidence-tree bytes.")),
  files: Schema.optionalKey(graphBound(GRAPH_LIMIT_CEILINGS.files, "Maximum files read, including the root.")),
  readBytes: Schema.optionalKey(graphBound(GRAPH_LIMIT_CEILINGS.readBytes, "Maximum total source bytes read; must be at least sourceBytes.")),
  outgoingEdges: Schema.optionalKey(graphBound(GRAPH_LIMIT_CEILINGS.outgoingEdges, "Maximum outgoing edges per accepted file.")),
  depth: Schema.optionalKey(graphBound(GRAPH_LIMIT_CEILINGS.depth, "Maximum supporting-reference depth.")),
  work: Schema.optionalKey(graphBound(GRAPH_LIMIT_CEILINGS.work, "Maximum graph edge work steps.")),
}).annotate({ identifier: "GraphLimitsSettings", description: "Versioned bounded import graph limits; omitted values inherit." });
export interface GraphLimitsSettings extends Schema.Schema.Type<typeof GraphLimitsSettings> {}

/**
 * Canonical JSONC v1 project/user document.
 *
 * Lists intentionally remain optional: omission inherits while [] is an explicit
 * empty selection.
 */
export const ReviewBackendSettings = Schema.Union([
  Schema.Struct({ provider: Schema.Literal("jev").annotate({ description: "Review backend provider." }) }),
  Schema.Struct({
    provider: Schema.Literal("cloudflare").annotate({ description: "Review backend provider." }),
    model: Schema.Literals(["clef", "clef-flash"]).annotate({ description: "Cloudflare model selector." }),
    accountId: Schema.String.check(Schema.isPattern(/^[a-fA-F0-9]{32}$/u)).annotate({ description: "Cloudflare account ID, 32 hexadecimal characters." }),
  }),
]).annotate({
  identifier: "ReviewBackendSettings",
  description: "User-owned review destination. Jev is the default; Cloudflare requires a model and account ID. Projects cannot set this field.",
});
export type ReviewBackendSettings = typeof ReviewBackendSettings.Type;

export const ConfigurationDocument = Schema.Struct({
  version: Schema.Literal(CONFIGURATION_VERSION).annotate({
    description: "Configuration wire-format version.",
  }),
  /** Standard editor metadata; it has no runtime effect. */
  $schema: Schema.optionalKey(Schema.String.annotate({
    description: "Optional editor schema location. It does not change runtime validation.",
  })),
  includes: Schema.optionalKey(Schema.Array(Pattern).annotate({
    description: "Optional repository-relative file patterns. Omission inherits the lower-precedence list; an empty array selects no paths.",
  })),
  excludes: Schema.optionalKey(Schema.Array(Pattern).annotate({
    description: "Additional repository-relative exclusions. Exclusions accumulate across configuration layers and always win.",
  })),
  privacyExcludes: Schema.optionalKey(Schema.Array(Pattern).annotate({
    description: "Additional protected-path exclusions. These accumulate and cannot be overridden by lower-privacy layers.",
  })),
  reviewBackend: Schema.optionalKey(ReviewBackendSettings),
  credentialEnvVar: Schema.optionalKey(EnvironmentVariableName),
  sessionAnalytics: Schema.optionalKey(Schema.Boolean.annotate({
    description: "Opt-in session analytics. Project configuration overrides the user default; disabled by default; retains source-free totals and bounded rule-ID history for 30 days within a shared 20 MiB activity store.",
    default: false,
  })),
  claudeFeedbackMode: Schema.optionalKey(ClaudeFeedbackMode),
  editPermitLimits: Schema.optionalKey(EditPermitLimitsSettings),
  virtualRoundQuietMs: Schema.optionalKey(Schema.Int.check(
    Schema.isBetween({ minimum: 10_000, maximum: 3_600_000 }),
  ).annotate({
    description: "Continuous fully quiet time before an open virtual round closes without Stop, in milliseconds. User configuration only; captured when the round opens.",
    default: DEFAULT_VIRTUAL_ROUND_QUIET_MS,
  })),
  graphLimits: Schema.optionalKey(GraphLimitsSettings),
  /** Explicit local pack references. Bundled Noul is loaded independently. */
  packs: Schema.optionalKey(Schema.Array(RulePackReference).annotate({
    description: "Local rule-pack path declarations or references to packs inherited from lower-precedence layers. Bundled Noul loads independently.",
  })),
  /** Qualified rule IDs to per-field activation/selection overrides. */
  ruleOverrides: Schema.optionalKey(Schema.Record(Schema.String, RuleOverride).annotate({
    description: "Map of qualified rule IDs to layer-specific overrides. Use pack-id/rule-id for local packs.",
  })),
}).annotate({
  title: "Review configuration v1",
  description: "JSONC configuration for file selection, bounded import exploration, rule packs, and credential references.",
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
  readonly claudeFeedbackMode: Originated<ClaudeFeedbackMode>;
  readonly graphLimits: Readonly<{ version: 1 } & Record<GraphLimitField, Originated<number>>>;
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
