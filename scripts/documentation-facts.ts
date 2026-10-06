import { JEV_PROVIDER, CLOUDFLARE_PROVIDER } from "../src/runtime/backend.ts"
import { PROJECT_CONFIGURATION_FILE } from "../src/configuration/load.ts"
import * as Schema from "effect/Schema"
import { ACTIVITY_RETENTION_MS, MAX_ACTIVITY_STORAGE_BYTES } from "../src/activity/storage.ts"
import { ConfigurationDocument, CONFIGURATION_VERSION } from "../src/configuration/types.ts"
import { GRAPH_LIMIT_CEILINGS, graphLimitFields } from "../src/configuration/graph-limits.ts"
import { MAX_INSPECTION_MESSAGE_BYTES } from "../src/inspection/contract.ts"
import { DEFAULT_RULE_THRESHOLD } from "../src/rules/schema.ts"
import { SHIPPED_DEFAULT_RULES } from "../src/rules/shipped.ts"
import {
  DEFAULT_RULE_EXAMPLE_ID,
  CUSTOM_RULE_EXAMPLE_ID,
  CUSTOM_RULE_EXAMPLE_PATH,
  RULE_CHECK_EXIT_CODES
} from "../src/rules/cli-definition.ts"
import primitiveDomainDefinition from "../src/rules/defaults/bare_domain_value.json" with { type: "json" }
import { CLI_NAME } from "../src/runtime/cli-names.ts"
import {
  authoringExampleFacts,
  authoringCheckCommands,
  authoringSourcePath,
  authoringSelections,
  ruleExampleCommand
} from "./rule-authoring-example.ts"
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
  if (!SHIPPED_DEFAULT_RULES.some((rule) => rule.id === primitiveDomainDefinition.id))
    throw new Error("primitive domain rule is no longer shipped; update the first-rule walkthrough")
  return [
    ...authoringExampleFacts(),
    {
      path: "docs/configuration.md",
      name: "rule-check-dashboard",
      text: `The [inspection dashboard](status.md#opt-in-local-inspection) provides another view of actual agent reviews after enabling \`${inspection}\`; its journal does not include this one-off command.`
    },
    {
      path: "docs/configuration.md",
      name: "authoring-check-result",
      text: `The first type lets customer and order IDs be interchanged and should trigger; the second gives them distinct types and should stay clear. The primitive \`value\` inside each wrapper is its representation, not itself a violation. A plain alias such as \`type CustomerId = string\` would still be interchangeable; merely naming a primitive does not establish a distinct type. These are expectations to check, not guaranteed classifier outputs. Each command selects the enclosing declaration and bounded related code, uses normal credential discovery and sends a real external classifier request that may incur charges. No resident or agent session is needed. Add \`--json\` to inspect the actual source-bearing input and probabilities. A skipped/unavailable result is not a clear result, and exit ${RULE_CHECK_EXIT_CODES.evaluated} also includes findings. See [file/line check details](#try-a-rule-on-a-file-and-line).`
    },
    {
      path: "docs/configuration.md",
      name: "rule-selection-example",
      text: [
        "```jsonc",
        JSON.stringify(
          {
            version: CONFIGURATION_VERSION,
            includes: ["src/**"],
            languages: ["typescript", "rust"],
            contextIncludes: ["src/**", "shared/**"],
            privacyExcludes: ["shared/private/**"],
            rules: [{ path: CUSTOM_RULE_EXAMPLE_PATH, languages: ["typescript"], includes: ["src/api/**"] }]
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    },
    {
      path: "docs/configuration.md",
      name: "authoring-default",
      text: `See the [default rules](../TYPE-DESIGN-RULES.md). The default \`${primitiveDomainDefinition.id}\` already addresses primitive domain values; inspect it before adding a custom variant. \`${CUSTOM_RULE_EXAMPLE_ID}\` below teaches custom authoring.`
    },
    { path: "README.md", name: "rule-check-example", text: ["```sh", authoringCheckCommands[0], "```"].join("\n") },
    {
      path: "docs/configuration.md",
      name: "rule-check-example",
      text: [
        `\`${CUSTOM_RULE_EXAMPLE_ID}\` is the example custom rule created in the walkthrough, not a shipped default. Substitute an enabled ID from \`${ruleExampleCommand("list")}\`.`,
        "",
        "```sh",
        authoringCheckCommands[0],
        ruleExampleCommand("check", `--path ${authoringSourcePath} --line ${authoringSelections[0].line} --json`),
        "```"
      ].join("\n")
    },
    {
      path: "README.md",
      name: "rule-check-exits",
      text: `Exit ${RULE_CHECK_EXIT_CODES.evaluated} means evaluation completed, including findings; exit ${RULE_CHECK_EXIT_CODES.unavailable} means skipped or unavailable, not a passing check.`
    },
    {
      path: "docs/configuration.md",
      name: "rule-check-exits",
      text: `Exit ${RULE_CHECK_EXIT_CODES.evaluated} means evaluated, **even with a finding**; exit ${RULE_CHECK_EXIT_CODES.unavailable} means skipped/unavailable or a local operation failure. Invalid command arguments are rejected before review.`
    },
    {
      path: "README.md",
      name: "rule-check-dashboard",
      text: `To inspect **ordinary agent reviews**, enable the debug recording setting by merging \`"${inspection}": true\` into the repository's \`${PROJECT_CONFIGURATION_FILE}\`, make a new eligible edit through an installed integration, then run \`${CLI_NAME} dashboard\`. The dashboard lets you inspect captured declarations, related context, classifier results, and feedback. Recording is off by default, contains source, and is independent of analytics. Opening the dashboard does not enable recording or backfill history. One-off \`${CLI_NAME} rules check\` results are returned in the terminal; they are not recorded in the resident journal. See [rule checks](./docs/configuration.md#try-a-rule-on-a-file-and-line) and [dashboard setup](./docs/status.md#opt-in-local-inspection).`
    },
    {
      path: "docs/status.md",
      name: "rule-check-dashboard",
      text: `For **“Does my rule work?”**, use this debug dashboard to compare the declaration and related context captured for an ordinary agent edit with its classifier outcome and feedback. The opt-in setting is \`${inspection}\`, not an analytics setting. Enable it as shown below before making the edit. For an immediate check without an agent edit or resident, run \`${ruleExampleCommand("check", "--path FILE --line N")}\` (and optionally \`--id RULE\`); see [file/line rule checks](configuration.md#try-a-rule-on-a-file-and-line). That command returns its own results and does not append them to this journal.`
    },
    {
      path: "docs/installation-workflows.md",
      name: "shipped-rules",
      text: `Authorized initial setup enables ${SHIPPED_DEFAULT_RULES.length} individual editable default files only when no configuration layer declares \`rules\`.`
    },
    {
      path: "README.md",
      name: "rule-inspection",
      text: `Inspect them with \`${ruleExampleCommand("list")}\` or \`${ruleExampleCommand("show", `--id ${DEFAULT_RULE_EXAMPLE_ID}`)}\`.`
    },
    {
      path: "README.md",
      name: "first-rule-inspection",
      text: `Run \`${ruleExampleCommand("list")}\`, then \`${ruleExampleCommand("show", `--id ${DEFAULT_RULE_EXAMPLE_ID}`)}\` to inspect one and its source file.`
    },
    {
      path: "docs/configuration.md",
      name: "first-rule-inspection",
      text: [
        "```sh",
        ruleExampleCommand("list"),
        ruleExampleCommand("show", `--id ${DEFAULT_RULE_EXAMPLE_ID}`),
        "```"
      ].join("\n")
    },
    {
      path: "docs/configuration.md",
      name: "rule-file-identity",
      text: `For example, \`${encodeURIComponent(DEFAULT_RULE_EXAMPLE_ID)}.json\` retains the stable rule ID \`${DEFAULT_RULE_EXAMPLE_ID}\`.`
    },
    {
      path: "README.md",
      name: "shipped-rules",
      text: `By default, authorized setup enables ${SHIPPED_DEFAULT_RULES.length} editable JSON rule files with questions about code design, including whether a declaration allows meaningless combinations of values. Each rule declares supported languages, input forms, and required related code.`
    },
    {
      path: "README.md",
      name: "first-rule-defaults",
      text: `Start with the **${SHIPPED_DEFAULT_RULES.length} editable default rules**.`
    },
    {
      path: "docs/configuration.md",
      name: "shipped-rules",
      text: `When no loaded configuration layer declares a \`rules\` field, authorized initial setup materializes ${SHIPPED_DEFAULT_RULES.length} editable default rule files normally under \`~/.config/hapsland/rules/defaults/\`.`
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
