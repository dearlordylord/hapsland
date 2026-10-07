import meaninglessCombinations from "./defaults/meaningless_combinations.json" with { type: "json" }
import splitCorrelations from "./defaults/split_correlations.json" with { type: "json" }
import absenceConfusion from "./defaults/absence_confusion.json" with { type: "json" }
import bareDomainValue from "./defaults/bare_domain_value.json" with { type: "json" }
import nameWiderThanType from "./defaults/name_wider_than_type.json" with { type: "json" }
import nameClaimsResource from "./defaults/name_claims_resource.json" with { type: "json" }
import bodyReachesUndeclared from "./defaults/body_reaches_undeclared.json" with { type: "json" }
import { decodeRuleDocument } from "./schema.ts"

/** Templates activated only through explicit local rule references. */
export const SHIPPED_DEFAULT_RULES = [
  meaninglessCombinations,
  splitCorrelations,
  absenceConfusion,
  bareDomainValue,
  nameWiderThanType,
  nameClaimsResource,
  bodyReachesUndeclared
].map((rule) => decodeRuleDocument(rule, `shipped:${rule.id}`))
export const DEFAULT_RULE_MESSAGES: Readonly<Record<string, string>> = Object.fromEntries(
  SHIPPED_DEFAULT_RULES.map((rule) => [rule.id, rule.message])
)
