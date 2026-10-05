import { SHIPPED_DEFAULT_RULES } from "../rules/shipped.ts"
import { DEFAULT_RULE_THRESHOLD } from "../rules/schema.ts"
import type { RuleDefinition as ProductionRuleDefinition } from "../rules/schema.ts"
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

/**
 * Human-labelled synthetic examples for the inferred-case rule.  The negative
 * control is intentionally superficially similar: optional contact attributes do
 * not by themselves encode alternative operations.  The ambiguous example is
 * retained for observation, not converted into a guessed label.
 */
export const BUNDLED_EVALUATION_FIXTURES: ReadonlyArray<Fixture> = [
  makeFixture({
    id: "noul-r1-positive",
    name: "flat delivery alternatives",
    role: "positive",
    domain: "delivery policy",
    path: "fixtures/delivery-flat.ts",
    source: "export type Delivery = { emailAddress?: string; phoneNumber?: string };\n"
  }),
  makeFixture({
    id: "noul-r1-negative",
    name: "tagged delivery union",
    role: "negative",
    domain: "delivery policy",
    path: "fixtures/delivery-tagged.ts",
    source: 'export type Delivery = { kind: "email"; address: string } | { kind: "phone"; number: string };\n'
  }),
  makeFixture({
    id: "noul-r1-negative-control",
    name: "optional contact attributes control",
    role: "negative-control",
    domain: "customer profile",
    path: "fixtures/customer-contact.ts",
    source: "export type Customer = { nickname?: string; phone?: string };\n"
  }),
  makeFixture({
    id: "noul-r1-ambiguous",
    name: "legacy delivery payload",
    role: "ambiguous",
    domain: "legacy delivery payload",
    path: "fixtures/delivery-legacy.ts",
    source: "export type LegacyDelivery = { address?: string; channel?: string };\n"
  })
]

const inferredCaseRule = BUNDLED_EVALUATION_RULES.find((rule) => rule.identity.ruleId === "r1_inferred_case")

if (inferredCaseRule === undefined) {
  throw new Error("default Hapsland rules do not contain r1_inferred_case")
}

const inferredCaseId = inferredCaseRule.identity.ruleId
const fixture = (id: string): Fixture => {
  const found = BUNDLED_EVALUATION_FIXTURES.find((candidate) => candidate.id === id)
  if (found === undefined) throw new Error(`missing evaluation fixture ${id}`)
  return found
}

export const BUNDLED_EVALUATION_EXPECTATIONS: ReadonlyArray<Expectation> = [
  makeExpectation({
    fixtureId: fixture("noul-r1-positive").id,
    ruleId: inferredCaseId,
    result: {
      kind: "violation",
      band: { minimum: DEFAULT_RULE_THRESHOLD, maximum: 1, minimumInclusive: false, maximumInclusive: true }
    },
    rationale:
      "The flat record leaves email and phone alternatives independently present, so the operation case is not named."
  }),
  makeExpectation({
    fixtureId: fixture("noul-r1-negative").id,
    ruleId: inferredCaseId,
    result: { kind: "clear", band: { minimum: 0, maximum: 0.3, minimumInclusive: true, maximumInclusive: false } },
    rationale: "Each delivery variant names its operation and keeps only the fields for that case."
  }),
  makeExpectation({
    fixtureId: fixture("noul-r1-negative-control").id,
    ruleId: inferredCaseId,
    result: { kind: "clear", band: { minimum: 0, maximum: 0.3, minimumInclusive: true, maximumInclusive: false } },
    rationale:
      "Optional nickname and phone are independent attributes of one customer meaning, not alternative operations."
  }),
  makeAmbiguousExpectation({
    fixtureId: fixture("noul-r1-ambiguous").id,
    ruleId: inferredCaseId,
    reason: "legacy payload semantics are not established by the source alone",
    rationale:
      "The legacy channel field may be descriptive metadata or an implicit operation selector; retain the case without a hard label."
  })
]

export const expectationFor = (fixtureId: string, ruleId: string): Expectation | undefined =>
  BUNDLED_EVALUATION_EXPECTATIONS.find(
    (expectation) => expectation.fixtureId === fixtureId && expectation.ruleId === ruleId
  )
