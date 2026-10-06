import type { Probability, RuleId, SnapshotRef } from "@hapsland/review-definition/domain/contracts"
import {
  compileRules,
  selectApplicableRules,
  type CompiledRule,
  type RuleTargetContext
} from "@hapsland/review-definition/rules/compiler"
import { compareRuleRank, findingFromProbability, withinAdviceBudget } from "@hapsland/review-definition/rules/decision"

/** Runtime rule shape shared by the backend, assessment and advice policy. */
export type Rule = CompiledRule

export const applicableRules = (
  source: string,
  pathOrRules?: string | ReadonlyArray<Rule>,
  maybeRules?: ReadonlyArray<Rule>,
  target?: RuleTargetContext
): ReadonlyArray<Rule> => {
  const path = typeof pathOrRules === "string" ? pathOrRules : undefined
  const rules = Array.isArray(pathOrRules) ? pathOrRules : (maybeRules ?? [])
  return selectApplicableRules(rules, source, path, target)
}

export const deriveAdvice = (
  rules: ReadonlyArray<Rule>,
  assessment: Readonly<Record<string, Probability>>,
  snapshot: SnapshotRef,
  limit: number
) =>
  rules
    .flatMap((rule) => {
      const probability = assessment[rule.id]
      return probability !== undefined && findingFromProbability(probability, rule.threshold)
        ? [{ rule, probability }]
        : []
    })
    .sort((left, right) =>
      compareRuleRank(
        { probability: left.probability, rank: left.rule.rank },
        { probability: right.probability, rank: right.rule.rank }
      )
    )
    .filter((_, position) => withinAdviceBudget(position, Math.max(0, limit)))
    .map(({ rule, probability }) => ({ ruleId: rule.id as RuleId, probability, message: rule.message, snapshot }))

export { compileRules, selectApplicableRules, type CompiledRule }
