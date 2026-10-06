import { JEV_PROVIDER, CLOUDFLARE_PROVIDER } from "../src/runtime/backend.ts"
import { PROJECT_CONFIGURATION_FILE } from "../src/configuration/load.ts"
import * as Schema from "effect/Schema"
import { ACTIVITY_RETENTION_MS, MAX_ACTIVITY_STORAGE_BYTES } from "../src/activity/storage.ts"
import { ConfigurationDocument, CONFIGURATION_VERSION } from "../src/configuration/types.ts"
import { GRAPH_LIMIT_CEILINGS, graphLimitFields } from "../src/configuration/graph-limits.ts"
import { MAX_INSPECTION_MESSAGE_BYTES } from "../src/inspection/contract.ts"
import { DEFAULT_RULE_THRESHOLD } from "../src/rules/schema.ts"
import { SHIPPED_DEFAULT_RULES } from "../src/rules/shipped.ts"
import { PROVIDER_LIMITS } from "../src/review-providers/catalog.ts"
import { REVIEW_SETTINGS_CACHE_CAPACITY, REVIEW_SETTINGS_CACHE_TTL_MS } from "../src/runtime/review-settings.ts"

export const recordingFieldName = (schema: Schema.Constraint, identifier: string): string => {
  const document = Schema.toJsonSchemaDocument(schema, { onExcessProperty: "error" })
  const properties = document.schema.properties ?? {}
  const matches = Object.entries(properties).filter(
    ([, value]) =>
      typeof value === "object" && value !== null && "$ref" in value && value.$ref === `#/$defs/${identifier}`
  )
  if (matches.length !== 1) throw new Error(`expected one ${identifier} field on the configuration schema`)
  return matches[0]![0]
}

const number = (value: number): string => value.toLocaleString("en-US")
const kib = (value: number): string => `${value / 1024} KiB`
const mib = (value: number): string => `${value / (1024 * 1024)} MiB`

/** Facts come from runtime owners; only presentation and explanatory prose live here. */
export const documentationFacts = (schema: Schema.Constraint = ConfigurationDocument) => {
  const analytics = recordingFieldName(schema, "AnalyticsRecordingEnabled")
  const inspection = recordingFieldName(schema, "InspectionRecordingEnabled")
  return [
    {
      path: "README.md",
      name: "shipped-rules",
      text: `With no explicit rule selection, authorized setup connects ${SHIPPED_DEFAULT_RULES.length} editable JSON rule files with questions about code design, including whether a declaration allows meaningless combinations of values. Each rule declares supported languages, input forms, and required related code.`
    },
    {
      path: "README.md",
      name: "first-rule-defaults",
      text: `Start with the **${SHIPPED_DEFAULT_RULES.length} editable default rules**.`
    },
    {
      path: "docs/configuration.md",
      name: "shipped-rules",
      text: `When no loaded configuration layer declares a \`rules\` field, authorized initial setup materializes ${SHIPPED_DEFAULT_RULES.length} editable default rule files under \`~/.config/hapsland/rules/defaults/\`, respecting XDG conventions, and explicitly connects them.`
    },
    {
      path: "docs/configuration.md",
      name: "first-rule-defaults",
      text: `Hapsland ships **${SHIPPED_DEFAULT_RULES.length} editable default rules**.`
    },
    {
      path: "docs/configuration.md",
      name: "credential-reference",
      text: `The built-in credential reference is \`${JEV_PROVIDER.credentialEnvVar}\`. Inspection reports its name and presence, never its value. See [credential lookup](installation-workflows.md#personal-development-on-your-own-clients).`
    },
    {
      path: "docs/review-providers.md",
      name: "jev-selection",
      text: `Omission selects ${JEV_PROVIDER.name} with \`jev-latest\` and \`${JEV_PROVIDER.credentialEnvVar}\`.`
    },
    {
      path: "docs/review-providers.md",
      name: "cloudflare-credential",
      text: `Use \`clef-flash\` to select the other Cloudflare model. Make \`${CLOUDFLARE_PROVIDER.credentialEnvVar}\` available to the installed runtime's hook environment.`
    },
    {
      path: "docs/configuration.md",
      name: "project-location",
      text: `| Layer | Location | Behavior |
| --- | --- | --- |
| Built-in | Non-rule settings defaults | Supplies omitted settings. |
| User | \`REVIEW_USER_CONFIG_PATH\`, otherwise \`$XDG_CONFIG_HOME/hapsland/config.jsonc\` (normally \`~/.config/hapsland/config.jsonc\`) | Personal settings across repositories; owns review destination and shared resident resources. |
| Project | \`${PROJECT_CONFIGURATION_FILE}\` at the canonical Git working-tree root | Overrides ordinary settings for this repository. There are no nested configuration layers. |
| Rule documents | Explicit \`rules\` references in configuration | Definitions, not another configuration layer. Paths resolve from the declaring configuration. |`
    },
    {
      path: "docs/status.md",
      name: "activity-retention",
      text: `The shared activity store (including optional analytics) expires sessions after ${ACTIVITY_RETENTION_MS / 86_400_000} days without a write and evicts the oldest sessions to stay within ${mib(MAX_ACTIVITY_STORAGE_BYTES)} of allocated file and session-directory storage.`
    },
    {
      path: "docs/status.md",
      name: "analytics-recording",
      text: [
        "Analytics recording is **disabled by default**. Merge this field into the repository-root configuration, preserving existing settings:",
        "",
        "```jsonc",
        JSON.stringify({ version: CONFIGURATION_VERSION, [analytics]: true }, null, 2),
        "```",
        "",
        `Project configuration overrides the user default in either direction. Set \`${analytics}: false\` in a project to stop future recording there; omission inherits the user default. User defaults follow the [configuration lookup](configuration.md).`
      ].join("\n")
    },
    {
      path: "docs/status.md",
      name: "inspection-message-limit",
      text: `Messages exceeding ${kib(MAX_INSPECTION_MESSAGE_BYTES)} UTF-8 are explicitly marked oversized.`
    },
    {
      path: "docs/pi-installation.md",
      name: "inspection-handoff",
      text: `With effective \`${inspection}\` opt-in, the resident records the general Hapsland message, intended recipient, and final finding/evaluation membership before handing advice to the runtime over its socket. The dashboard renders this message directly, independently of Pi's native return-value format. Messages exceeding ${kib(MAX_INSPECTION_MESSAGE_BYTES)} UTF-8 are explicitly marked oversized. The extension does not serialize output for inspection or attach inspection reports to acknowledgement calls. Preparation does not establish native acceptance, model visibility, reading, agreement, or repair. The existing delivery acknowledgement and lease behavior remain unchanged; optional capture failure does not refuse the native mutation or offer.`
    },
    {
      path: "docs/configuration.md",
      name: "analytics-enablement",
      text: `Session analytics are disabled by default. Set \`${analytics}: true\` to retain source-free session totals and bounded rule-ID history, subject to the limits in [status and analytics](status.md#optional-session-analytics).`
    },
    {
      path: "docs/configuration.md",
      name: "rule-threshold",
      text: `The default threshold is ${DEFAULT_RULE_THRESHOLD}; a finding requires a probability strictly greater than its threshold.`
    },
    {
      path: "docs/configuration.md",
      name: "settings-cache",
      text: `The resident loads configuration and rule documents together, validates them and compiles the rules into an immutable edit settings snapshot. A resident-owned Effect cache retains successful snapshots for ${REVIEW_SETTINGS_CACHE_TTL_MS / 1000} seconds after loading finishes; hits do not extend that interval, and concurrent requests for the same project and configuration paths share a load. The cache holds at most ${REVIEW_SETTINGS_CACHE_CAPACITY} sources. A failed load is not cached and does not silently reuse an expired snapshot.`
    },
    {
      path: "docs/review-providers.md",
      name: "provider-limits",
      text: [
        "| Model | Declared question limit | Declared HTTP body limit | Declared token limit | Checked on | Source |",
        "| --- | --- | --- | --- | --- | --- |",
        ...Object.entries(PROVIDER_LIMITS).map(([model, limits]) => {
          const tokens =
            [
              limits.requestTokens === undefined ? undefined : `${number(limits.requestTokens)} per request`,
              limits.stateAndLongestQuestionTokens === undefined
                ? undefined
                : `${number(limits.stateAndLongestQuestionTokens)} for state plus longest question`,
              limits.contextWindowTokens === undefined
                ? undefined
                : `${number(limits.contextWindowTokens)} context window`
            ]
              .filter(Boolean)
              .join("; ") || "Unknown"
          return `| \`${model}\` | ${limits.questions ?? "Unknown"} | ${limits.httpBodyBytes === undefined ? "Unknown" : mib(limits.httpBodyBytes)} | ${tokens} | ${limits.checkedOn} | [Provider declaration](${limits.source}) |`
        }),
        "",
        "These values are provider declarations, not results of live boundary tests. Native question-count and HTTP-body limits are enforced; token counts are unmeasured."
      ].join("\n")
    },
    {
      path: "docs/review-resources.md",
      name: "graph-ceilings",
      text: [
        "The configured graph profile bounds the evidence for one review unit. Projects may lower these ceilings:",
        "",
        "| Field | Ceiling |",
        "| --- | --- |",
        ...graphLimitFields.map(
          (field) =>
            `| \`${field}\` | ${number(GRAPH_LIMIT_CEILINGS[field])}${field.endsWith("Bytes") ? " bytes" : ""} |`
        )
      ].join("\n")
    }
  ] as const
}
