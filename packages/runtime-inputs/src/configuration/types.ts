import * as Schema from "effect/Schema"
import { RuleIdentitySchema } from "../domain/rule-identity.ts"
import { GRAPH_LIMIT_CEILINGS, type GraphLimitField } from "@hapsland/canonical-policy/canonical/graph-limits"
import { JEV_PROVIDER } from "@hapsland/runtime-environment/runtime/backend"

export const AnalyticsRecordingEnabled = Schema.Boolean.annotate({
  identifier: "AnalyticsRecordingEnabled",
  description:
    "Opt-in source-free session analytics. Project configuration overrides the user default; disabled by default; subject to the shared activity storage limits.",
  default: false,
  examples: [true]
})

/** The only configuration format accepted by the product in this phase. */
export const CONFIGURATION_VERSION = 1 as const
export const DEFAULT_CREDENTIAL_ENV_VAR = JEV_PROVIDER.credentialEnvVar
export const ClaudeFeedbackMode = Schema.Literals(["advisory", "block-current-findings"]).annotate({
  description:
    "Claude PostToolUse feedback. Blocking current findings requires an explicit user configuration opt-in; a project may only restrict it to advisory.",
  default: "advisory"
})
export type ClaudeFeedbackMode = typeof ClaudeFeedbackMode.Type
export const DEFAULT_RUNTIME_SETTINGS = {
  deadlineMs: 1_000,
  concurrency: 4,
  adviceBudget: 5,
  transientRetries: 2
} as const

export const DEFAULT_EDIT_PERMIT_LIMITS = { perAdvicee: 32, resident: 4096 } as const
export const DEFAULT_INSPECTION_RETENTION_DAYS = 7
export const DEFAULT_INSPECTION_STORAGE_BYTES = 128 * 1024 * 1024
export const DEFAULT_VIRTUAL_ROUND_QUIET_MS = 5 * 60_000

/** Semantic identity used to generate inspection opt-in docs independently of the wire field name. */
export const InspectionRecordingEnabled = Schema.Boolean.annotate({
  identifier: "InspectionRecordingEnabled",
  description:
    "Opt-in source-bearing local inspection history. Project configuration overrides the user default in either direction; independent of source-free analytics and disabled by default. Opening the dashboard never enables recording.",
  default: false,
  examples: [true]
})

export const EditPermitLimitsSettings = Schema.Struct({
  perAdvicee: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65536 })).annotate({
      description: "Maximum simultaneously pending edit permits for one advicee in the shared resident.",
      default: DEFAULT_EDIT_PERMIT_LIMITS.perAdvicee
    })
  ),
  resident: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65536 })).annotate({
      description: "Maximum simultaneously pending edit permits across the shared resident.",
      default: DEFAULT_EDIT_PERMIT_LIMITS.resident
    })
  )
}).annotate({
  identifier: "EditPermitLimitsSettings",
  description: "User-owned shared resident admission limits. Omitted values use built-in defaults."
})
export interface EditPermitLimitsSettings extends Schema.Schema.Type<typeof EditPermitLimitsSettings> {}

const Pattern = Schema.String.check(Schema.isMinLength(1)).annotate({
  description: "A non-empty repository-relative glob pattern using forward slashes."
})
const EnvironmentVariableName = Schema.String.check(Schema.isPattern(/^[A-Z_][A-Z0-9_]*$/u)).annotate({
  description:
    "Name of the environment variable that supplies the review credential. Store the secret value outside configuration.",
  default: DEFAULT_CREDENTIAL_ENV_VAR
})

export const RuleSettings = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  languages: Schema.optionalKey(Schema.Array(Schema.Literals(["typescript", "rust", "bend"]))),
  includes: Schema.optionalKey(Schema.Array(Pattern)),
  excludes: Schema.optionalKey(Schema.Array(Pattern)),
  threshold: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
  message: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1)))
})
export type RuleSettings = typeof RuleSettings.Type
export const RuleReference = Schema.Union([
  Schema.String.check(Schema.isMinLength(1)),
  Schema.Struct({ path: Schema.String.check(Schema.isMinLength(1)), ...RuleSettings.fields }),
  Schema.Struct({ id: RuleIdentitySchema, ...RuleSettings.fields })
]).annotate({
  identifier: "RuleReference",
  description: "A local rule path or inherited rule ID, with optional selection settings."
})
export type RuleReference = typeof RuleReference.Type

const graphBound = (ceiling: number, description: string) =>
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: ceiling })).annotate({ description, default: ceiling })

export const GraphLimitsSettings = Schema.Struct({
  version: Schema.Literal(1).annotate({ description: "Import graph limits profile version." }),
  sourceBytes: Schema.optionalKey(
    graphBound(GRAPH_LIMIT_CEILINGS.sourceBytes, "Maximum source bytes in each graph file.")
  ),
  treeBytes: Schema.optionalKey(
    graphBound(GRAPH_LIMIT_CEILINGS.treeBytes, "Maximum accepted encoded evidence-tree bytes.")
  ),
  files: Schema.optionalKey(graphBound(GRAPH_LIMIT_CEILINGS.files, "Maximum files read, including the root.")),
  readBytes: Schema.optionalKey(
    graphBound(GRAPH_LIMIT_CEILINGS.readBytes, "Maximum total source bytes read; must be at least sourceBytes.")
  ),
  outgoingEdges: Schema.optionalKey(
    graphBound(GRAPH_LIMIT_CEILINGS.outgoingEdges, "Maximum outgoing edges per accepted file.")
  ),
  depth: Schema.optionalKey(graphBound(GRAPH_LIMIT_CEILINGS.depth, "Maximum supporting-reference depth.")),
  work: Schema.optionalKey(graphBound(GRAPH_LIMIT_CEILINGS.work, "Maximum graph edge work steps."))
}).annotate({ identifier: "GraphLimitsSettings", description: "Import graph limits; omitted values inherit." })
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
    accountId: Schema.String.check(Schema.isPattern(/^[a-fA-F0-9]{32}$/u)).annotate({
      description: "Cloudflare account ID, 32 hexadecimal characters."
    })
  })
]).annotate({
  identifier: "ReviewBackendSettings",
  description:
    "User-owned review destination. Jev is the default; Cloudflare requires a model and account ID. Projects cannot set this field."
})
export type ReviewBackendSettings = typeof ReviewBackendSettings.Type

export const ConfigurationDocument = Schema.Struct({
  version: Schema.Literal(CONFIGURATION_VERSION).annotate({ description: "Configuration wire-format version." }),
  /** Standard editor metadata; it has no runtime effect. */
  $schema: Schema.optionalKey(
    Schema.String.annotate({ description: "Optional editor schema location. It does not change runtime validation." })
  ),
  includes: Schema.optionalKey(
    Schema.Array(Pattern).annotate({
      description:
        "Changed-root repository-relative patterns. Omission inherits the lower-precedence list; an empty array selects no roots."
    })
  ),
  excludes: Schema.optionalKey(
    Schema.Array(Pattern).annotate({
      description:
        "Changed-root repository-relative exclusions. Exclusions accumulate across configuration layers and always win for roots."
    })
  ),
  languages: Schema.optionalKey(
    Schema.Array(Schema.Literals(["typescript", "rust", "bend"])).annotate({
      description: "Changed-root analyzer languages. Omission inherits; an empty array selects no roots."
    })
  ),
  contextIncludes: Schema.optionalKey(
    Schema.Array(Pattern).annotate({
      description:
        "Supporting-context patterns. Omission inherits effective root includes; an empty array selects no supporting paths."
    })
  ),
  contextExcludes: Schema.optionalKey(
    Schema.Array(Pattern).annotate({
      description:
        "Supporting-context exclusions accumulate across layers. Omission inherits effective root exclusions."
    })
  ),
  privacyExcludes: Schema.optionalKey(
    Schema.Array(Pattern).annotate({
      description:
        "Additional protected-path exclusions. These accumulate and cannot be overridden by lower-privacy layers."
    })
  ),
  reviewBackend: Schema.optionalKey(ReviewBackendSettings),
  credentialEnvVar: Schema.optionalKey(EnvironmentVariableName),
  sessionAnalytics: Schema.optionalKey(AnalyticsRecordingEnabled),
  sessionInspection: Schema.optionalKey(InspectionRecordingEnabled),
  inspectionRetentionDays: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3650 })).annotate({
      description: "User-owned capture-aged inspection retention in days, shared across residents and projects.",
      default: DEFAULT_INSPECTION_RETENTION_DAYS
    })
  ),
  inspectionStorageBytes: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })).annotate({
      description:
        "User-owned shared allocated inspection-storage cap, including records, indices, payloads and temporary allocations. Unavailable quota drops capture; review continues.",
      default: DEFAULT_INSPECTION_STORAGE_BYTES
    })
  ),
  claudeFeedbackMode: Schema.optionalKey(ClaudeFeedbackMode),
  editPermitLimits: Schema.optionalKey(EditPermitLimitsSettings),
  virtualRoundQuietMs: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 10_000, maximum: 3_600_000 })).annotate({
      description:
        "Continuous fully quiet time before an open virtual round closes without Stop, in milliseconds. User configuration only; captured when the round opens.",
      default: DEFAULT_VIRTUAL_ROUND_QUIET_MS
    })
  ),
  graphLimits: Schema.optionalKey(GraphLimitsSettings),
  rules: Schema.optionalKey(Schema.Array(RuleReference))
}).annotate({
  title: "Review configuration v1",
  description: "JSONC configuration for file selection, import exploration limits, rules, and credential references."
})
export interface ConfigurationDocument extends Schema.Schema.Type<typeof ConfigurationDocument> {}

export type ConfigurationLayerName = "built-in" | "user" | "project"

export type ConfigurationOrigin = {
  readonly layer: ConfigurationLayerName
  readonly source: string
  readonly field: string
}

export type Originated<T> = { readonly value: T; readonly origin: ConfigurationOrigin }

export type PatternOrigin = Originated<string> & { readonly active: boolean }

export type ResolvedPolicy = {
  readonly root: string
  readonly includes: ReadonlyArray<PatternOrigin>
  readonly overriddenIncludes: ReadonlyArray<PatternOrigin>
  readonly excludes: ReadonlyArray<PatternOrigin>
  readonly contextIncludes: ReadonlyArray<PatternOrigin>
  readonly overriddenContextIncludes: ReadonlyArray<PatternOrigin>
  readonly contextExcludes: ReadonlyArray<PatternOrigin>
  readonly languages: Originated<ReadonlyArray<"typescript" | "rust" | "bend">>
  readonly protectedExcludes: ReadonlyArray<PatternOrigin>
  readonly credentialEnvVar: Originated<string>
  readonly claudeFeedbackMode: Originated<ClaudeFeedbackMode>
  readonly graphLimits: Readonly<{ version: 1 } & Record<GraphLimitField, Originated<number>>>
  readonly layers: ReadonlyArray<{
    readonly name: ConfigurationLayerName
    readonly source: string
    readonly document: ConfigurationDocument
  }>
  /** Stable JSON-safe identity used by the event capture boundary. */
  readonly digest: string
}

export type ConfigurationCapture = { readonly policy: ResolvedPolicy }

export const BUILT_IN_INCLUDES = ["**/*"] as const

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
  "**/secrets.*"
] as const

export const isEnvironmentVariableName = (value: string): boolean => /^[A-Z_][A-Z0-9_]*$/.test(value)
