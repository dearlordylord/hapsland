import * as Decision from "effect/ai/Decision"

export type ProbabilityInstructions = { readonly question: string; readonly focus: string }

export type ProbabilityCriterion = { readonly what: string; readonly examples: ReadonlyArray<string> }

export type ProbabilityCriteria = { readonly false: ProbabilityCriterion; readonly true: ProbabilityCriterion }

const renderInstructions = ({ question, focus }: ProbabilityInstructions): string => `${question}\n\nFocus: ${focus}`

const renderCriterion = ({ what, examples }: ProbabilityCriterion): string =>
  `${what}\n\nExamples:\n${examples.map((example) => `- ${example}`).join("\n")}`

/** Renders structured Noul wording for Effect's provider-neutral Decision API. */
export const probability = (
  instructions: ProbabilityInstructions,
  criteria: ProbabilityCriteria
): Decision.Probability & { readonly criteria: { readonly false: string; readonly true: string } } => ({
  ...Decision.probability({ instructions: renderInstructions(instructions) }),
  criteria: { false: renderCriterion(criteria.false), true: renderCriterion(criteria.true) }
})
