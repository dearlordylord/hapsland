import * as Schema from "effect/Schema";
import type { Decision } from "effect/ai";

type Question = {
  readonly type: "noul";
  readonly instructions: string;
  readonly criteria: { readonly false: string; readonly true: string };
};
type Questions = Record<string, Question>;
const validQuestionId = (id: string, questions: Questions): boolean =>
  typeof id === "string" && id.length > 0 && id !== "__proto__" && !Object.hasOwn(questions, id);
const probabilityInstructions = (decision: Decision.Probability): boolean =>
  decision?._tag === "Probability" && typeof decision.instructions === "string";
const probabilityCriteria = (decision: Decision.Probability): boolean =>
  typeof decision.criteria?.false === "string" && typeof decision.criteria?.true === "string";
const validProbability = (
  decision: Decision.Probability,
): decision is Decision.Probability & { readonly criteria: Question["criteria"] } =>
  probabilityInstructions(decision) && probabilityCriteria(decision) && Schema.is(Schema.Json)(decision.criteria);
const providerQuestions = (
  rules: ReadonlyArray<{ readonly id: string; readonly decision: Decision.Probability }>,
): Questions | undefined => {
  const questions: Questions = Object.create(null);
  for (const { id, decision } of rules) {
    if (!validQuestionId(id, questions) || !validProbability(decision)) return undefined;
    questions[id] = { type: "noul", instructions: decision.instructions, criteria: decision.criteria };
  }
  return questions;
};
const encodedBodyBytes = (state: unknown, questions: Questions): number => {
  try {
    return Buffer.byteLength(JSON.stringify({ model: "jev-latest", state, questions }), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};
/** The pinned @effect/ai-typesafe System One body for jev-latest Noul rules. */
export const encodedProviderHttpBodyBytes = (
  state: unknown,
  rules: ReadonlyArray<{ readonly id: string; readonly decision: Decision.Probability }>,
): number => {
  if (!Schema.is(Schema.Json)(state) || rules.length === 0) return Number.POSITIVE_INFINITY;
  const questions = providerQuestions(rules);
  return questions === undefined ? Number.POSITIVE_INFINITY : encodedBodyBytes(state, questions);
};
