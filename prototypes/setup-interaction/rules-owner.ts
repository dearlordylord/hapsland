// THROWAWAY: in-memory owner, no production imports, files, credential stores or HTTP.
import { createHash } from "node:crypto"
import { Effect } from "effect"
import type { RuleAction, RulePlan, RuleScope } from "./rules-model.ts"
export type OwnerOutcome = "applied" | "failed" | "partial" | "stale"
export function createRulesOwner(outcome: OwnerOutcome = "applied") {
  let generation = 0
  let changed = false
  let writes = 0
  const applied = new Map<string, OwnerOutcome>()
  const plan = (action: RuleAction, scope: RuleScope): RulePlan => {
    const digest = createHash("sha256").update(JSON.stringify({ generation, action, scope })).digest("hex")
    return {
      action,
      scope,
      digest,
      configuration: scope === "project" ? "/fake/project/.hapsland.jsonc" : "/fake/user/.config/hapsland/config.jsonc",
      rule: action === "connect" ? "/fake/authored-rule.json" : "synthetic-concern",
      enabled: action !== "disable"
    }
  }
  return {
    preview: (action: RuleAction, scope: RuleScope) => Effect.sync(() => plan(action, scope)),
    apply: (approved: RulePlan) =>
      Effect.sync((): OwnerOutcome => {
        if (outcome === "stale" && !changed) {
          generation++
          changed = true
        }
        if (JSON.stringify(approved) !== JSON.stringify(plan(approved.action, approved.scope))) return "stale"
        const previous = applied.get(approved.digest)
        if (previous) return previous
        const result = outcome === "stale" ? "applied" : outcome
        if (result === "applied" || result === "partial") writes++
        applied.set(approved.digest, result)
        return result
      }),
    change: () => {
      generation++
    },
    writes: () => writes
  }
}
export type RulesOwner = ReturnType<typeof createRulesOwner>
