import rule0 from "./defaults/r1_inferred_case.json" with { type: "json" }
import rule1 from "./defaults/r2_meaningless_combinations.json" with { type: "json" }
import rule2 from "./defaults/r3_split_correlations.json" with { type: "json" }
import rule3 from "./defaults/r4_duplicate_encoding.json" with { type: "json" }
import rule4 from "./defaults/r5_absence_confusion.json" with { type: "json" }
import rule5 from "./defaults/r6_bare_domain_value.json" with { type: "json" }
import rule6 from "./defaults/r7_name_wider_than_type.json" with { type: "json" }
import rule7 from "./defaults/r8_name_claims_resource.json" with { type: "json" }
import rule8 from "./defaults/r9_body_reaches_undeclared.json" with { type: "json" }
import { decodeRuleDocument } from "./schema.ts"

/** Templates activated only through explicit local rule references. */
export const SHIPPED_DEFAULT_RULES = [rule0, rule1, rule2, rule3, rule4, rule5, rule6, rule7, rule8].map((rule) =>
  decodeRuleDocument(rule, `shipped:${rule.id}`)
)
export const DEFAULT_RULE_MESSAGES: Readonly<Record<string, string>> = Object.fromEntries(
  SHIPPED_DEFAULT_RULES.map((rule) => [rule.id, rule.message])
)
