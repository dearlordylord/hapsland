import type { ConfigurationLayer } from "../configuration/resolve.ts"
import { rootLanguageForPath } from "../direct-event/languages/path-language.ts"
import { selectGlobalPath, selectContextPath } from "../policy/file-policy.ts"
import { existsSync, realpathSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { ruleOperation } from "./operations.ts"
import * as Effect from "effect/Effect"
import { loadConfiguration, type LoadConfigurationOptions } from "../configuration/load.ts"
import { compileRules } from "./compiler.ts"
import { loadRules, type LoadedRule } from "./loader.ts"
import { matchesAnyGlob } from "../matcher/glob.ts"

type ConfigurationRuleReference = NonNullable<ConfigurationLayer["document"]["rules"]>[number]
const referencedPath = (reference: ConfigurationRuleReference): string | undefined =>
  typeof reference === "string" ? reference : "path" in reference ? reference.path : undefined
const referenceMatchesRule = (
  reference: ConfigurationRuleReference,
  layer: ConfigurationLayer,
  id: string,
  definition: LoadedRule | undefined
): boolean => {
  const selected = referencedPath(reference)
  const selectedPath = selected === undefined ? undefined : resolve(dirname(layer.source), selected)
  if (typeof reference !== "string" && "id" in reference) return reference.id === id
  return selectedPath !== undefined && existsSync(selectedPath) && realpathSync(selectedPath) === definition?.path
}
const ruleSettingOrigins = (
  layers: ReadonlyArray<ConfigurationLayer>,
  id: string,
  definition: LoadedRule | undefined
) =>
  layers.flatMap((layer) =>
    (layer.document.rules ?? []).flatMap((reference, index) => {
      if (!referenceMatchesRule(reference, layer, id, definition)) return []
      const fields = typeof reference === "string" ? ["path"] : Object.keys(reference)
      return fields.map((field) => ({ layer: layer.name, source: layer.source, field: `rules[${index}].${field}` }))
    })
  )
export const loadRuleInventory = Effect.fn("Rules.inventory")(function* (
  root: string,
  options: LoadConfigurationOptions = {}
) {
  const capture = yield* loadConfiguration(root, options)
  const sources = yield* loadRules({ root, layers: capture.policy.layers })
  const compiled = yield* ruleOperation(root, "rules", () => compileRules({ rules: sources, includeDisabled: true }))
  const rules = compiled.map((rule) => {
    const definition = sources.find((candidate) => candidate.id === rule.ruleId)
    const origins = ruleSettingOrigins(capture.policy.layers, rule.ruleId, definition)
    return {
      id: rule.ruleId,
      title: definition?.title ?? rule.ruleId,
      enabled: rule.enabled,
      source: rule.source,
      path: definition?.path,
      question: rule.decision.instructions,
      criteria: rule.decision.criteria,
      inputs: rule.inputs,
      languages: rule.languages,
      filters: rule.applicability,
      threshold: rule.threshold,
      message: rule.message,
      origin: origins.find((origin) => origin.field.endsWith(".path")) ?? definition?.origin,
      reference: definition?.reference,
      origins
    }
  })
  return {
    version: 1 as const,
    repository: root,
    policy: capture.policy,
    enabledCount: rules.filter((rule) => rule.enabled).length,
    rules
  }
})
export type RuleInventory = Effect.Success<ReturnType<typeof loadRuleInventory>>
export type RuleInventoryEntry = RuleInventory["rules"][number]
export const formatRuleInventory = (inventory: RuleInventory): string =>
  [
    `Rules for ${inventory.repository}: ${inventory.enabledCount} enabled of ${inventory.rules.length}.`,
    ...inventory.rules.map(
      (rule) =>
        `${rule.enabled ? "enabled" : "disabled"}  ${rule.id} — ${rule.title}\n  ${rule.path ?? rule.source}\n  Scope: ${rule.origin?.layer === "user" ? "personal" : rule.origin?.layer}; configuration: ${rule.origin?.source}\n${rule.origins
          .filter((origin) => !origin.field.endsWith(".path"))
          .map(
            (origin) =>
              `  Setting: ${origin.layer === "user" ? "personal" : origin.layer} ${origin.source}#${origin.field}`
          )
          .join("\n")}`
    ),
    ...(inventory.enabledCount === 0 ? ["Warning: zero enabled rules; edits receive no rule evaluations."] : []),
    "Edit the rule JSON files to author questions and feedback. Use hapsland rules create or rules connect to add a rule."
  ].join("\n") + "\n"
export const formatRule = (rule: RuleInventoryEntry): string =>
  [
    `${rule.id} — ${rule.title} (${rule.enabled ? "enabled" : "disabled"})`,
    `File: ${rule.path ?? rule.source}`,
    `Question: ${rule.question}`,
    `Criteria false: ${rule.criteria.false}`,
    `Criteria true: ${rule.criteria.true}`,
    ...rule.inputs.map(
      (input) =>
        `Input: ${input.kind}; languages: ${input.languages.join(", ")}; requires: ${input.requires.join(", ") || "none"}${!("dialect" in input) || input.dialect === undefined ? "" : `; dialect: ${input.dialect}`}`
    ),
    `Configuration languages: ${rule.languages?.join(", ") ?? "authored languages"}`,
    `Includes: ${rule.filters?.includes?.join(", ") ?? "all globally selected paths"}`,
    `Excludes: ${rule.filters?.excludes?.join(", ") ?? "none"}`,
    `Threshold: ${rule.threshold}`,
    `Message: ${rule.message}`,
    `Source origin: ${rule.origin?.layer} ${rule.origin?.source} ${rule.origin?.field}`,
    ...rule.origins.map((origin) => `Setting origin: ${origin.layer} ${origin.source} ${origin.field}`)
  ].join("\n") + "\n"
const ruleFilterReasons = (rule: RuleInventoryEntry, path: string): string[] => {
  const reasons: string[] = []
  if (rule.filters?.includes !== undefined)
    reasons.push(
      matchesAnyGlob(rule.filters.includes, path) ? "Path matches rule includes." : "Path does not match rule includes."
    )
  if (rule.filters?.excludes !== undefined)
    reasons.push(
      matchesAnyGlob(rule.filters.excludes, path)
        ? "Path is excluded by this rule."
        : "Path is not excluded by this rule."
    )
  return reasons
}
const ruleLanguageReasons = (rule: RuleInventoryEntry, language: ReturnType<typeof rootLanguageForPath>): string[] => {
  if (language === undefined) return []
  const declared = rule.inputs.some(
    (input) => input.languages.includes(language) && (rule.languages === undefined || rule.languages.includes(language))
  )
  return [
    declared ? "Language matches a declared input." : "Language does not match the authored and configured languages."
  ]
}
const configurationPathReasons = (
  inventory: RuleInventory,
  language: ReturnType<typeof rootLanguageForPath>,
  globalSelection: ReturnType<typeof selectGlobalPath>,
  contextSelection: ReturnType<typeof selectContextPath>
): string[] => {
  const reasons = [
    `Changed-root global selection: ${globalSelection.reason}${globalSelection.reason === "protected" ? ` (${globalSelection.gate})` : ""}.`,
    `Supporting-context selection: ${contextSelection.reason}; context selection does not make a file a changed review root.`,
    `Configured root languages: ${inventory.policy.languages.value.join(", ") || "none"} (${inventory.policy.languages.origin.source}#${inventory.policy.languages.origin.field}).`
  ]
  for (const match of [...globalSelection.matchingIncludes, ...globalSelection.matchingExcludes])
    reasons.push(`Global pattern: ${match.value} (${match.origin.layer} ${match.origin.source}#${match.origin.field}).`)
  reasons.push(
    language === undefined ? "Path has no supported detected language." : `Detected language from path: ${language}.`
  )
  return reasons
}
const pathConfigurationSelection = (inventory: RuleInventory, path: string) => ({
  path,
  language: rootLanguageForPath(path),
  globalSelection: selectGlobalPath(inventory.policy, path),
  contextSelection: selectContextPath(inventory.policy, path)
})
export const explainRule = (rule: RuleInventoryEntry, inventory: RuleInventory, path?: string) => {
  const selection = path === undefined ? undefined : pathConfigurationSelection(inventory, path)
  const language = selection?.language
  const globalSelection = selection?.globalSelection
  const contextSelection = selection?.contextSelection
  const reasons = [rule.enabled ? "Rule is enabled." : "Rule is disabled."]
  if (selection !== undefined) {
    reasons.push(
      ...configurationPathReasons(inventory, selection.language, selection.globalSelection, selection.contextSelection)
    )
    reasons.push(...ruleFilterReasons(rule, selection.path), ...ruleLanguageReasons(rule, selection.language))
  }
  reasons.push(
    "Static configuration explanation only. No source was parsed; declaration kind, evidence requirements and global file policy still govern dispatch."
  )
  return {
    id: rule.id,
    path,
    language,
    inputs: rule.inputs,
    globalSelection,
    contextSelection,
    configuredLanguages: inventory.policy.languages,
    reasons
  }
}
