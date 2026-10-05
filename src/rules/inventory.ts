import { ruleOperation } from "./operations.ts"
import * as Effect from "effect/Effect"
import { loadConfiguration, type LoadConfigurationOptions } from "../configuration/load.ts"
import { compileRules } from "./compiler.ts"
import { loadRulePacks } from "./loader.ts"

export const loadRuleInventory = Effect.fn("Rules.inventory")(function* (
  root: string,
  options: LoadConfigurationOptions = {}
) {
  const capture = yield* loadConfiguration(root, options)
  const layers = capture.policy.layers
  const packs = yield* loadRulePacks({ root, layers })
  const rules = yield* ruleOperation(root, "ruleOverrides", () =>
    compileRules({ packs, layers, includeDisabled: true })
  )
  const entries = rules.map((rule) => {
    const pack = packs.find((candidate) => candidate.id === rule.packId)
    const definition = pack?.rules.find((candidate) => candidate.id === rule.ruleId)
    return {
      ...rule,
      title: definition?.title ?? rule.ruleId,
      question: rule.decision.instructions,
      criteria: rule.decision.criteria,
      scope: pack?.origin.layer,
      configurationPath: pack?.origin.source,
      origins: layers.flatMap((layer) =>
        Object.entries(layer.document.ruleOverrides ?? {})
          .filter(
            ([id]) =>
              id === rule.packId ||
              id === rule.qualifiedId ||
              id === `${rule.packId}:${rule.ruleId}` ||
              (rule.builtIn && id === rule.ruleId)
          )
          .flatMap(([id, override]) =>
            Object.keys(override).map((field) => ({
              layer: layer.name,
              source: layer.source,
              field: `ruleOverrides.${id}.${field}`
            }))
          )
      )
    }
  })
  return {
    version: 1 as const,
    repository: root,
    enabledCount: entries.filter((rule) => rule.enabled).length,
    rules: entries,
    packs: packs.map((pack) => ({
      id: pack.id,
      enabled: pack.enabled,
      source: pack.path,
      scope: pack.origin.layer,
      configurationPath: pack.origin.source
    }))
  }
})

export type RuleInventory = Effect.Success<ReturnType<typeof loadRuleInventory>>

export const formatRuleInventory = (inventory: RuleInventory): string =>
  [
    `Rules for ${inventory.repository}: ${inventory.enabledCount} enabled of ${inventory.rules.length}.`,
    ...inventory.rules.map(
      (rule) =>
        `${rule.enabled ? "enabled" : "disabled"}  ${rule.qualifiedId} — ${rule.title}\n  ${rule.scope} pack ${rule.packId}: ${rule.source}\n  configuration: ${rule.configurationPath}`
    ),
    ...(inventory.enabledCount === 0 ? ["Warning: zero enabled rules; edits receive no rule evaluations."] : []),
    "Rules evaluate supported type declarations and functions only when their targets, evidence requirements and path filters apply. Enabled counts do not mean every rule runs on every edit.",
    "Edit the connected JSON files to author questions and feedback. Use hapsland rules create or hapsland rules connect to add a pack."
  ].join("\n") + "\n"
