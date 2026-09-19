import type { Decision } from "effect/unstable/ai";
import type { Probability, RuleId, SnapshotRef } from "../domain/contracts.ts";
import { E0, NOUL_KEYS, measured } from "../questions.ts";

export type Rule = {
  readonly id: RuleId;
  readonly decision: Decision.Probability;
  readonly threshold: number;
  readonly message: string;
  readonly rank: number;
};

const messages: Readonly<Record<string, string>> = {
  r1_inferred_case: "The type appears to encode distinct cases without naming the case.",
  r2_meaningless_combinations: "The type appears to admit field combinations with no domain meaning.",
  r3_split_correlations: "Parts of one fact appear independently settable.",
  r4_duplicate_encoding: "The type appears to store the same fact in places that can disagree.",
  r5_absence_confusion: "Absence appears to carry more than one meaning.",
  r6_bare_domain_value: "A domain value appears to use an overly broad primitive type.",
  r7_name_wider_than_type: "A field name promises constraints that its type does not enforce.",
  r8_name_claims_resource: "A declaration appears to hide a resource named by the operation.",
  r9_body_reaches_undeclared: "A callable appears to reach state or resources absent from its declaration.",
};

export const configuredRules: ReadonlyArray<Rule> = NOUL_KEYS.map((id, rank) => ({
  id: id as RuleId,
  decision: E0[id],
  threshold: 0.7,
  message: messages[id] ?? `Review rule ${id} may apply.`,
  rank,
}));

export const applicableRules = (source: string): ReadonlyArray<Rule> =>
  configuredRules.filter((rule) => measured(rule.id, source));

export const deriveAdvice = (
  rules: ReadonlyArray<Rule>,
  assessment: Readonly<Record<string, Probability>>,
  snapshot: SnapshotRef,
  limit: number,
) =>
  rules
    .flatMap((rule) => {
      const probability = assessment[rule.id];
      return probability !== undefined && probability > rule.threshold
        ? [{ rule, probability }]
        : [];
    })
    .sort(
      (left, right) =>
        right.probability - left.probability || left.rule.rank - right.rule.rank,
    )
    .slice(0, limit)
    .map(({ rule, probability }) => ({
      ruleId: rule.id,
      probability,
      message: rule.message,
      snapshot,
    }));
