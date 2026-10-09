import { SETUP_COPY } from "@hapsland/agent-flow-projection/setup-copy"
import { credentialPolicy, deriveLookupPlan, deriveSavePlan } from "@hapsland/runtime-inputs/credentials/policy"
import { JEV_PROVIDER, CLOUDFLARE_PROVIDER, REVIEW_PROVIDERS } from "@hapsland/runtime-environment/runtime/backend"
import { PROJECT_CONFIGURATION_FILE } from "@hapsland/runtime-inputs/configuration/load"
import * as Schema from "effect/Schema"
import { ACTIVITY_RETENTION_MS, MAX_ACTIVITY_STORAGE_BYTES } from "@hapsland/activity-observation/activity/storage"
import { ConfigurationDocument, CONFIGURATION_VERSION } from "@hapsland/runtime-inputs/configuration/types"
import { GRAPH_LIMIT_CEILINGS, graphLimitFields } from "@hapsland/canonical-policy/canonical/graph-limits"
import { MAX_INSPECTION_MESSAGE_BYTES } from "@hapsland/inspection-records/inspection/contract"
import { DEFAULT_RULE_THRESHOLD } from "@hapsland/review-definition/rules/schema"
import {
  REVIEW_SETTINGS_CACHE_CAPACITY,
  REVIEW_SETTINGS_CACHE_TTL_MS
} from "@hapsland/review-definition/runtime/review-settings"
import { SHIPPED_DEFAULT_RULES } from "@hapsland/review-definition/rules/shipped"
import {
  DEFAULT_RULE_EXAMPLE_ID,
  CUSTOM_RULE_EXAMPLE_ID,
  CUSTOM_RULE_EXAMPLE_PATH,
  RULE_CHECK_EXIT_CODES
} from "@hapsland/administration/rules/cli-definition"
import {
  authoringExampleFacts,
  authoringCheckCommands,
  authoringSourcePath,
  authoringSelections,
  ruleExampleCommand
} from "./rule-authoring-example.ts"

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
  const primitiveDomainDefinition = SHIPPED_DEFAULT_RULES.find((rule) => rule.id === "bare_domain_value")
  if (primitiveDomainDefinition === undefined)
    throw new Error("primitive domain rule is no longer shipped; update the first-rule walkthrough")
  const credentialContext = {
    envVar: JEV_PROVIDER.credentialEnvVar,
    referenceExplicit: false,
    captured: false,
    root: "repository root",
    userFile: "$XDG_CONFIG_HOME/hapsland/.env (normally ~/.config/hapsland/.env)",
    projectLocalFile: "repository-root .env.local",
    projectFile: "repository-root .env",
    nativeTarget: "macOS Keychain or Linux Secret Service"
  }
  const destinations = credentialPolicy.destinations
    .map((descriptor) => {
      const plan = deriveSavePlan(credentialContext, descriptor.kind)!
      return `- **${descriptor.title}${descriptor.kind === credentialPolicy.defaultDestination ? " — default" : ""}:** ${plan.target}. ${plan.storage}; ${plan.scope} scope.`
    })
    .join("\n")
  const lookup = deriveLookupPlan(credentialContext)
    .map((step) =>
      step.kind === "environment" ? `environment variable \`${step.envVar}\`` : "file" in step ? step.file : step.target
    )
    .join(" → ")
  const credentialText = `Guided login, setup and \`--new-key\` use these reviewed save destinations:\n\n${destinations}\n\nThe exact validated target and current selected source are shown before hidden key entry. Saving requires a separate full-line \`y\` confirmation with a declining default. Back discards entered key material; cancellation preserves the previous credential before saving. A changed proposal requires fresh entry and approval. Project saving requires an untracked, Git-ignored \`.env.local\`; Hapsland does not change ignore rules. Files are written with owner-only permissions using atomic replacement, preserving unrelated dotenv entries. Stored and effective credential sources are reported separately.\n\nLookup order: ${lookup}. An explicitly present environment value, including an empty one, stops lookup. Missing/empty file fields continue; unreadable, symlinked, nonregular or oversized files stop with a safe diagnostic. Explicit configured references allow environment/files and prohibit native fallback, including when they name the built-in variable. Callers without repository scope retain environment/native-only lookup. Captured hook inputs remain authoritative. Saving never changes lookup precedence and grants no paid-verification consent.\n\n\`hapsland --login --credential-stdin\` retains its explicit direct native-save automation contract without dialogs. \`hapsland --logout\` removes only the native saved item; it does not delete file credentials. Keys never enter models, traces, diagnostics or review configuration. Development setup uses the same flow against the reviewed repository and configured user directory; rebuild/update/activation preserves credentials and never copies them into snapshots, caches, archives or worktrees.`
  return [
    { path: "README.md", name: "agent-setup-instruction", text: `> ${SETUP_COPY.instruction}` },
    { path: "docs/installation-workflows.md", name: "agent-setup-instruction", text: `> ${SETUP_COPY.instruction}` },
    { path: "docs/installation-workflows.md", name: "credential-policy", text: credentialText },
    ...authoringExampleFacts(),
    {
      path: "docs/rules.md",
      name: "rule-check-dashboard",
      text: `The [inspection dashboard](status.md#opt-in-local-inspection) provides another view of actual agent reviews after enabling \`${inspection}\`; its journal does not include this one-off command.`
    },
    {
      path: "docs/write-first-rule.md",
      name: "authoring-check-result",
      text: `The first type lets customer and order IDs be interchanged and should trigger; the second gives them distinct types and should stay clear. The primitive \`value\` inside each wrapper is its representation, not itself a violation. A plain alias such as \`type CustomerId = string\` would still be interchangeable; merely naming a primitive does not establish a distinct type. These are expectations to check, not guaranteed classifier outputs. Each command selects the enclosing declaration and related code, uses normal credential discovery and sends a real external classifier request that may incur charges. No agent session is needed. Add \`--json\` to inspect the actual source-bearing input and probabilities. A skipped/unavailable result is not a clear result, and exit ${RULE_CHECK_EXIT_CODES.evaluated} also includes findings. See [file/line check details](rules.md#try-a-rule-on-a-file-and-line).`
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
      path: "docs/write-first-rule.md",
      name: "authoring-default",
      text: `Inspect [the editable defaults](rules.md#default-rules). The default \`${primitiveDomainDefinition.id}\` already addresses primitive domain values; inspect it before adding a custom variant. \`${CUSTOM_RULE_EXAMPLE_ID}\` below is a teaching example, not an additional recommended default.`
    },
    {
      path: "docs/rules.md",
      name: "rule-check-example",
      text: [
        `\`${CUSTOM_RULE_EXAMPLE_ID}\` is the example custom rule created in the [walkthrough](write-first-rule.md), not a shipped default. Substitute an enabled ID from \`${ruleExampleCommand("list")}\`.`,
        "",
        "```sh",
        authoringCheckCommands[0],
        ruleExampleCommand("check", `--path ${authoringSourcePath} --line ${authoringSelections[0].line} --json`),
        "```"
      ].join("\n")
    },
    {
      path: "docs/rules.md",
      name: "rule-check-exits",
      text: `Exit ${RULE_CHECK_EXIT_CODES.evaluated} means evaluated, **even with a finding**; exit ${RULE_CHECK_EXIT_CODES.unavailable} means skipped/unavailable or a local operation failure. Invalid command arguments are rejected before review.`
    },
    {
      path: "docs/status.md",
      name: "rule-check-dashboard",
      text: `For **“Does my rule work?”**, use this debug dashboard to compare the declaration and related context captured for an ordinary agent edit with its classifier outcome and feedback. The opt-in setting is \`${inspection}\`, not an analytics setting. Enable it as shown below before making the edit. For an immediate check without an agent edit, run \`${ruleExampleCommand("check", "--path FILE --line N")}\` (and optionally \`--id RULE\`); see [file/line rule checks](rules.md#try-a-rule-on-a-file-and-line). That command returns its own results and does not append them to this journal.`
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
      path: "docs/write-first-rule.md",
      name: "first-rule-inspection",
      text: [
        "```sh",
        ruleExampleCommand("list"),
        ruleExampleCommand("show", `--id ${primitiveDomainDefinition.id}`),
        "```"
      ].join("\n")
    },
    {
      path: "docs/rules.md",
      name: "rule-file-identity",
      text: `For example, \`${encodeURIComponent(DEFAULT_RULE_EXAMPLE_ID)}.json\` retains the stable rule ID \`${DEFAULT_RULE_EXAMPLE_ID}\`.`
    },
    {
      path: "README.md",
      name: "shipped-rules",
      text: `By default, authorized setup enables ${SHIPPED_DEFAULT_RULES.length} editable JSON rule files with questions about code design.`
    },
    {
      path: "docs/rules.md",
      name: "shipped-rules",
      text: `When no loaded configuration layer declares a \`rules\` field, authorized initial setup materializes ${SHIPPED_DEFAULT_RULES.length} editable default rule files normally under \`~/.config/hapsland/rules/defaults/\`.`
    },
    {
      path: "docs/configuration.md",
      name: "credential-reference",
      text: `The built-in credential reference is \`${JEV_PROVIDER.credentialEnvVar}\`. Inspection reports its name and presence, never its value. See [credential lookup](installation-workflows.md#credentials-and-login).`
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
| User | \`REVIEW_USER_CONFIG_PATH\`, otherwise \`$XDG_CONFIG_HOME/hapsland/config.jsonc\` (normally \`~/.config/hapsland/config.jsonc\`) | Personal settings across repositories; owns review destination and shared review resources. |
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
      text: `Session analytics are disabled by default. Set \`${analytics}: true\` to retain source-free session totals and rule-ID history, subject to the limits in [status and analytics](status.md#optional-session-analytics).`
    },
    {
      path: "docs/rules.md",
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
        ...Object.values(REVIEW_PROVIDERS)
          .flatMap((provider) => Object.entries(provider.models))
          .map(([model, limits]) => {
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
