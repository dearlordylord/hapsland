import { ruleOperation } from "@hapsland/review-definition/rules/operations"
import { withInstallationLock } from "../onboarding/installation-lock.ts"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import * as Effect from "effect/Effect"
import {
  DEFAULT_USER_CONFIGURATION_FILE,
  loadConfiguration,
  type LoadConfigurationOptions
} from "@hapsland/runtime-inputs/configuration/load"
import { decodeConfigurationDocument, decodeConfigurationText } from "@hapsland/runtime-inputs/configuration/decode"
import { configurationError } from "@hapsland/runtime-inputs/configuration/errors"
import { resolveConfiguration } from "@hapsland/runtime-inputs/configuration/resolve"
import { atomicInstallationFile } from "../onboarding/atomic-installation-file.ts"
import { compileRules } from "@hapsland/review-definition/rules/compiler"
import { loadRules } from "@hapsland/review-definition/rules/loader"
import { DEFAULT_RULE_THRESHOLD, decodeRuleDocument, decodeRuleText } from "@hapsland/review-definition/rules/schema"
import { TYPE_CAPABILITIES, FUNCTION_CAPABILITIES } from "@hapsland/review-definition/rules/targets"

export type RuleScope = "personal" | "project"
export type RuleChange =
  | { readonly action: "create"; readonly scope: RuleScope; readonly id: string }
  | { readonly action: "connect"; readonly scope: RuleScope; readonly path: string }
  | { readonly action: "enable" | "disable"; readonly scope: RuleScope; readonly id: string }

const optionalText = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : undefined)
const canonicalDestination = (path: string): string => {
  if (existsSync(path)) return realpathSync(path)
  const parent = dirname(path)
  if (parent === path) return path
  return join(canonicalDestination(parent), path.slice(parent.length + (parent.endsWith("/") ? 0 : 1)))
}
const contained = (root: string, path: string): boolean => {
  const offset = relative(realpathSync(root), canonicalDestination(path))
  return offset !== ".." && !offset.startsWith("../") && !isAbsolute(offset)
}

const generatedRule = (id: string) => ({
  version: 1,
  id,
  title: "Authored concern",
  question: "Does the supplied type declaration admit values that violate the intended domain constraint?",
  criteria: {
    false: "The supplied declaration enforces the intended constraint.",
    true: "Visible evidence shows an admitted value that violates the intended constraint."
  },
  message: "Review the authored domain constraint.",
  threshold: DEFAULT_RULE_THRESHOLD,
  inputs: [{ languages: ["typescript", "rust", "bend"], kind: "type", requires: ["root-declaration"] }]
})

const generatedRuleText = (id: string): string => {
  const comments: Record<string, ReadonlyArray<string>> = {
    question: ["Edit question, criteria and message for your concern."],
    threshold: ["Finding when probability > threshold."],
    inputs: [
      'kind: "type" (TypeScript/Rust/Bend) or "function" (TypeScript only).',
      "Type evidence: " + TYPE_CAPABILITIES.join(", ") + ".",
      "Function evidence: " + FUNCTION_CAPABILITIES.join(", ") + ".",
      "requires: needed evidence; missing evidence skips review."
    ]
  }
  return (
    JSON.stringify(generatedRule(id), null, 2)
      .split("\n")
      .map((line) => {
        const field = /^  "([^"]+)":/.exec(line)?.[1]
        const guidance = field === undefined ? undefined : comments[field]
        return guidance === undefined ? line : [...guidance.map((text) => `  // ${text}`), line].join("\n")
      })
      .join("\n") + "\n"
  )
}

const loadRuleChangeContext = Effect.fn("Rules.changeContext")(function* (
  root: string,
  change: RuleChange,
  options: LoadConfigurationOptions
) {
  const configurationPath =
    change.scope === "personal"
      ? resolve(options.userConfigPath ?? DEFAULT_USER_CONFIGURATION_FILE)
      : join(root, ".hapsland.jsonc")
  if (change.scope === "project" && !contained(root, configurationPath))
    return yield* configurationError(
      configurationPath,
      "$",
      "project configuration must stay inside the Git working tree"
    )
  const before = yield* ruleOperation(configurationPath, "$", () => optionalText(configurationPath))
  const document = yield* ruleOperation(configurationPath, "$", () =>
    before === undefined ? { version: 1 as const } : decodeConfigurationText(before, configurationPath)
  )
  const capture = yield* loadConfiguration(root, options)
  const currentRules = yield* loadRules({ root, layers: capture.policy.layers })
  return { root, configurationPath, before, document, capture, currentRules }
})
type RuleChangeContext = Effect.Success<ReturnType<typeof loadRuleChangeContext>>
type ConfigurationRuleReference = NonNullable<RuleChangeContext["document"]["rules"]>[number]
type ActivationChange = Extract<RuleChange, { action: "enable" | "disable" }>
type AuthoredChange = Extract<RuleChange, { action: "create" | "connect" }>
const referencePath = (reference: ConfigurationRuleReference): string | undefined =>
  typeof reference === "string" ? reference : "path" in reference ? reference.path : undefined
const referenceSelectsRule = (
  reference: ConfigurationRuleReference,
  selected: RuleChangeContext["currentRules"][number] | undefined,
  id: string,
  configurationPath: string
): boolean => {
  if (typeof reference !== "string" && "id" in reference) return reference.id === id
  if (selected === undefined) return false
  const path = typeof reference === "string" ? reference : reference.path
  return canonicalDestination(resolve(dirname(configurationPath), path)) === selected.path
}
const activationDocument = (document: RuleChangeContext["document"], index: number, id: string, enabled: boolean) => {
  const references = document.rules ?? []
  if (index < 0) return { ...document, rules: [...references, { id, enabled }] }
  return {
    ...document,
    rules: references.map((reference, offset) =>
      offset !== index ? reference : { ...(typeof reference === "string" ? { path: reference } : reference), enabled }
    )
  }
}
const planActivation = Effect.fn("Rules.planActivation")(function* (
  context: RuleChangeContext,
  change: ActivationChange
) {
  const { configurationPath, currentRules, document } = context
  const inventory = yield* ruleOperation(configurationPath, "$", () =>
    compileRules({ rules: currentRules, includeDisabled: true })
  )
  if (!inventory.some((rule) => rule.ruleId === change.id))
    return yield* configurationError(configurationPath, "rules", "select a rule identity shown by hapsland rules list")
  const references = document.rules ?? []
  const selected = currentRules.find((rule) => rule.id === change.id)
  const index = references.findIndex((reference) =>
    referenceSelectsRule(reference, selected, change.id, configurationPath)
  )
  const enabled = change.action === "enable"
  const selectedRules = currentRules.map((rule) =>
    rule.id === change.id ? { ...rule, enabled, reference: { ...rule.reference, enabled } } : rule
  )
  return {
    proposed: activationDocument(document, index, change.id, enabled),
    selectedRules,
    path: undefined,
    ruleBefore: undefined,
    ruleAfter: undefined
  }
})
const authoredRulePath = (context: RuleChangeContext, change: AuthoredChange): string =>
  change.action === "connect"
    ? resolve(change.path)
    : join(
        change.scope === "personal" ? dirname(context.configurationPath) : join(context.root, ".hapsland"),
        "rules",
        "custom",
        `${encodeURIComponent(change.id)}.jsonc`
      )
const authoredRuleText = (change: AuthoredChange, before: string | undefined): string =>
  before ?? generatedRuleText(change.action === "create" ? change.id : "")
const readAuthoredRuleChange = Effect.fn("Rules.readAuthoredChange")(function* (
  context: RuleChangeContext,
  change: AuthoredChange
) {
  const { configurationPath, root } = context
  if (change.action === "create")
    yield* ruleOperation(configurationPath, "$", () => decodeRuleDocument(generatedRule(change.id), configurationPath))
  const path = authoredRulePath(context, change)
  if (change.scope === "project" && !contained(root, path))
    return yield* configurationError(path, "$", "project rule files must stay inside the Git working tree")
  const ruleBefore = yield* ruleOperation(configurationPath, "$", () => optionalText(path))
  if (change.action === "connect" && ruleBefore === undefined)
    return yield* configurationError(path, "$", "rule file does not exist; provide an existing rule with --path")
  const ruleAfter = authoredRuleText(change, ruleBefore)
  const authored = yield* ruleOperation(configurationPath, "$", () => decodeRuleText(ruleAfter, path))
  return { path, ruleBefore, ruleAfter, authored }
})
const validateAuthoredIdentity = Effect.fn("Rules.validateAuthoredIdentity")(function* (
  context: RuleChangeContext,
  change: AuthoredChange,
  selected: Effect.Success<ReturnType<typeof readAuthoredRuleChange>>
) {
  const { path, authored } = selected
  if (change.action === "create" && authored.id !== change.id)
    return yield* configurationError(
      path,
      "id",
      "existing authored rule has a different identity; use rules connect instead"
    )
  const canonical = canonicalDestination(path)
  const prior = context.currentRules.find((candidate) => candidate.id === authored.id)
  if (prior !== undefined && prior.path !== canonical)
    return yield* configurationError(
      path,
      "id",
      `rule identity already uses a different file: '${prior.path}' and '${canonical}'`
    )
  return { canonical, prior }
})
const referenceAtPath = (
  reference: ConfigurationRuleReference,
  configurationPath: string,
  canonical: string
): boolean => {
  const selected = referencePath(reference)
  return selected !== undefined && canonicalDestination(resolve(dirname(configurationPath), selected)) === canonical
}
const planAuthoredChange = Effect.fn("Rules.planAuthoredChange")(function* (
  context: RuleChangeContext,
  change: AuthoredChange
) {
  const selected = yield* readAuthoredRuleChange(context, change)
  const { canonical, prior } = yield* validateAuthoredIdentity(context, change, selected)
  const { document, configurationPath, currentRules } = context
  const references = document.rules ?? []
  const connected = references.some((reference) => referenceAtPath(reference, configurationPath, canonical))
  const proposed = connected
    ? document
    : { ...document, rules: [...references, relative(dirname(configurationPath), selected.path)] }
  const origin = {
    layer: change.scope === "personal" ? ("user" as const) : ("project" as const),
    source: configurationPath,
    field: "rules"
  }
  const selectedRules =
    prior === undefined
      ? [
          ...currentRules,
          { ...selected.authored, origin, path: canonical, enabled: true, reference: { path: canonical, origin } }
        ]
      : currentRules
  return {
    proposed,
    selectedRules,
    path: selected.path,
    ruleBefore: selected.ruleBefore,
    ruleAfter: selected.ruleAfter
  }
})
type PlannedRuleMutation =
  | Effect.Success<ReturnType<typeof planAuthoredChange>>
  | Effect.Success<ReturnType<typeof planActivation>>
const replacementLayers = (context: RuleChangeContext, change: RuleChange, proposed: RuleChangeContext["document"]) => {
  const { configurationPath } = context
  const replacement = {
    name: change.scope === "personal" ? ("user" as const) : ("project" as const),
    source: configurationPath,
    document: proposed
  }
  const layers = context.capture.policy.layers
  if (layers.some((layer) => layer.source === configurationPath))
    return layers.map((layer) => (layer.source === configurationPath ? replacement : layer))
  if (change.scope === "personal")
    return [
      ...layers.filter((layer) => layer.name === "built-in"),
      replacement,
      ...layers.filter((layer) => layer.name === "project")
    ]
  return [...layers, replacement]
}
const rulesForPlan = Effect.fn("Rules.planSelection")(function* (
  root: string,
  change: RuleChange,
  planned: PlannedRuleMutation,
  layers: ReturnType<typeof replacementLayers>
) {
  if (change.action === "enable" || change.action === "disable" || planned.ruleBefore !== undefined)
    return yield* loadRules({ root, layers })
  return planned.selectedRules
})
const planRuleId = (
  change: RuleChange,
  path: string | undefined,
  selectedRules: PlannedRuleMutation["selectedRules"]
): string | undefined => {
  if (change.action !== "connect") return change.id
  const canonical = path === undefined ? undefined : canonicalDestination(path)
  return selectedRules.find((rule) => rule.path === canonical)?.id
}
/** Plan configuration changes against the complete current rule set before any write. */
export const previewRuleChange = Effect.fn("Rules.previewChange")(function* (
  root: string,
  change: RuleChange,
  options: LoadConfigurationOptions = {}
) {
  const context = yield* loadRuleChangeContext(root, change, options)
  const planned =
    change.action === "create" || change.action === "connect"
      ? yield* planAuthoredChange(context, change)
      : yield* planActivation(context, change)
  const { configurationPath, currentRules, before } = context
  const { proposed, path, ruleBefore, ruleAfter } = planned
  const layers = replacementLayers(context, change, proposed)
  const selectedRules = yield* rulesForPlan(root, change, planned, layers)
  yield* ruleOperation(configurationPath, "$", () => resolveConfiguration(layers, root))
  yield* ruleOperation(configurationPath, "$", () => compileRules({ rules: selectedRules, includeDisabled: true }))
  const selectedId = planRuleId(change, path, selectedRules)
  const enabled = selectedRules.find((rule) => rule.id === selectedId)?.enabled
  const after = JSON.stringify(decodeConfigurationDocument(proposed, configurationPath), null, 2) + "\n"
  const authoredSources = yield* ruleOperation(configurationPath, "rules", () =>
    currentRules.map((rule) => ({ path: rule.path, text: readFileSync(rule.path, "utf8") }))
  )
  const plan = {
    enabled,
    authoredSources,
    layers: context.capture.policy.layers,
    version: 1 as const,
    root,
    change,
    configurationPath,
    before,
    after,
    path,
    ruleBefore,
    ruleAfter
  }
  return { ...plan, digest: createHash("sha256").update(JSON.stringify(plan)).digest("hex") }
})

const applyRuleChangeUnlocked = Effect.fn("Rules.applyChangeUnlocked")(function* (
  root: string,
  change: RuleChange,
  digest: string,
  options: LoadConfigurationOptions = {}
) {
  const plan = yield* previewRuleChange(root, change, options)
  if (plan.digest !== digest)
    return yield* configurationError(
      plan.configurationPath,
      "digest",
      "rules plan is stale; preview again before applying"
    )
  yield* ruleOperation(plan.configurationPath, "$", () => {
    if (plan.path !== undefined && plan.ruleBefore === undefined && plan.ruleAfter !== undefined) {
      mkdirSync(dirname(plan.path), { recursive: true, mode: 0o700 })
      writeFileSync(plan.path, plan.ruleAfter, { encoding: "utf8", flag: "wx", mode: 0o600 })
    }
    if (plan.after !== plan.before) atomicInstallationFile(plan.configurationPath, plan.after)
  })
  return {
    version: 1 as const,
    status: "completed" as const,
    action: change.action,
    scope: change.scope,
    configurationPath: plan.configurationPath,
    ...(plan.path === undefined ? {} : { path: plan.path }),
    enabled: plan.enabled,
    providerCalls: 0,
    classifierQualityValidated: false
  }
})

export const applyRuleChange = Effect.fn("Rules.applyChange")((
  root: string,
  change: RuleChange,
  digest: string,
  options: LoadConfigurationOptions = {}
) => {
  const configurationPath =
    change.scope === "personal"
      ? resolve(options.userConfigPath ?? DEFAULT_USER_CONFIGURATION_FILE)
      : join(root, ".hapsland.jsonc")
  return withInstallationLock(`${configurationPath}.rules-lock`, applyRuleChangeUnlocked(root, change, digest, options))
})
