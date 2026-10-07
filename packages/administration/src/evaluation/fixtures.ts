import { SHIPPED_DEFAULT_RULES } from "@hapsland/review-definition/rules/shipped"
import { DEFAULT_RULE_THRESHOLD } from "@hapsland/review-definition/rules/schema"
import type { RuleDefinition as ProductionRuleDefinition } from "@hapsland/review-definition/rules/schema"
import { makeAmbiguousExpectation, makeExpectation, makeFixture, makeRuleDefinition } from "./digest.ts"
import type { Expectation, Fixture, RuleDefinition } from "./model.ts"

/** Derive evaluation definitions from the exact authored production rules. */
export const evaluationDefinitionsFromRules = (
  rules: ReadonlyArray<ProductionRuleDefinition>
): ReadonlyArray<RuleDefinition> =>
  rules.map((rule) =>
    makeRuleDefinition({
      ruleId: rule.id,
      question: rule.question,
      criteria: rule.criteria,
      defaultMessage: rule.message,
      threshold: rule.threshold ?? DEFAULT_RULE_THRESHOLD
    })
  )

/** The exact bundled production definitions used by the default milestone. */
export const BUNDLED_EVALUATION_RULES = evaluationDefinitionsFromRules(SHIPPED_DEFAULT_RULES)

/** Predefined conditional-field examples; controlled execution tests plumbing, not classifier accuracy. */
export const BUNDLED_EVALUATION_FIXTURES: ReadonlyArray<Fixture> = [
  makeFixture({
    id: "noul-conditional-field-positive",
    name: "unconstrained delivery timestamp",
    role: "positive",
    domain: "delivery lifecycle",
    path: "fixtures/delivery-flat.ts",
    source: 'export type Delivery = { status: "pending" | "delivered"; deliveredAt?: string };\n'
  }),
  makeFixture({
    id: "noul-conditional-field-negative",
    name: "tagged delivery union",
    role: "negative",
    domain: "delivery lifecycle",
    path: "fixtures/delivery-tagged.ts",
    source: 'export type Delivery = { status: "pending" } | { status: "delivered"; deliveredAt: string };\n'
  }),
  makeFixture({
    id: "noul-conditional-field-negative-control",
    name: "optional contact attributes control",
    role: "negative-control",
    domain: "customer profile",
    path: "fixtures/customer-contact.ts",
    source: "export type Customer = { nickname?: string; phone?: string };\n"
  }),
  makeFixture({
    id: "noul-conditional-field-ambiguous",
    name: "legacy delivery timestamp",
    role: "ambiguous",
    domain: "legacy delivery timestamp",
    path: "fixtures/delivery-legacy.ts",
    source: "export type LegacyDelivery = { status: string; timestamp?: string };\n"
  })
]

const conditionalFieldRule = BUNDLED_EVALUATION_RULES.find(
  (rule) => rule.identity.ruleId === "meaningless_combinations"
)

if (conditionalFieldRule === undefined) {
  throw new Error("default Hapsland rules do not contain meaningless_combinations")
}

const conditionalFieldId = conditionalFieldRule.identity.ruleId
const fixture = (id: string): Fixture => {
  const found = BUNDLED_EVALUATION_FIXTURES.find((candidate) => candidate.id === id)
  if (found === undefined) throw new Error(`missing evaluation fixture ${id}`)
  return found
}

export const BUNDLED_EVALUATION_EXPECTATIONS: ReadonlyArray<Expectation> = [
  makeExpectation({
    fixtureId: fixture("noul-conditional-field-positive").id,
    ruleId: conditionalFieldId,
    result: {
      kind: "violation",
      band: { minimum: DEFAULT_RULE_THRESHOLD, maximum: 1, minimumInclusive: false, maximumInclusive: true }
    },
    rationale:
      "The flat record admits a deliveredAt timestamp while status is pending, where that timestamp has no meaning."
  }),
  makeExpectation({
    fixtureId: fixture("noul-conditional-field-negative").id,
    ruleId: conditionalFieldId,
    result: { kind: "clear", band: { minimum: 0, maximum: 0.3, minimumInclusive: true, maximumInclusive: false } },
    rationale: "Only the delivered variant admits a deliveredAt timestamp."
  }),
  makeExpectation({
    fixtureId: fixture("noul-conditional-field-negative-control").id,
    ruleId: conditionalFieldId,
    result: { kind: "clear", band: { minimum: 0, maximum: 0.3, minimumInclusive: true, maximumInclusive: false } },
    rationale:
      "Optional nickname and phone are independent customer attributes with no conditional validity requirement."
  }),
  makeAmbiguousExpectation({
    fixtureId: fixture("noul-conditional-field-ambiguous").id,
    ruleId: conditionalFieldId,
    reason: "legacy payload semantics are not established by the source alone",
    rationale:
      "The legacy timestamp may be meaningful for every status or only some; retain the case without inventing domain requirements."
  })
]

export const expectationFor = (fixtureId: string, ruleId: string): Expectation | undefined =>
  BUNDLED_EVALUATION_EXPECTATIONS.find(
    (expectation) => expectation.fixtureId === fixtureId && expectation.ruleId === ruleId
  )
