import * as Schema from "effect/Schema"
import type { Decision } from "effect/ai"
import { PROVIDER_LIMITS, type ReviewModel } from "@hapsland/review-definition/review-providers/catalog"

export type ProbabilityRule = Readonly<{ id: string; decision: Decision.Probability }>
export type RequestLimitViolation = "invalid-input" | "questions" | "http-body-bytes" | "question-instructions"

const validRule = ({ id, decision }: ProbabilityRule, keys: ReadonlySet<string>): boolean => {
  if (typeof id !== "string" || id.length === 0 || id === "__proto__" || keys.has(id)) return false
  return (
    decision?._tag === "Probability" &&
    typeof decision.instructions === "string" &&
    (decision.criteria === undefined || Schema.is(Schema.Json)(decision.criteria))
  )
}

/** One exact serializer for transport and accounting. Cloudflare IDs are opaque and reversible. */
export const probabilityRequest = (model: ReviewModel, state: unknown, rules: ReadonlyArray<ProbabilityRule>) => {
  if (!Schema.is(Schema.Json)(state) || rules.length === 0) return undefined
  const keys = new Set<string>()
  const questions: Record<string, { type: "noul"; instructions: string; criteria?: Decision.Probability["criteria"] }> =
    Object.create(null)
  const ids: Record<string, string> = Object.create(null)
  for (const [index, rule] of rules.entries()) {
    const { id, decision } = rule
    if (!validRule(rule, keys)) return undefined
    keys.add(id)
    const wireId = model === "jev-latest" ? id : `q${index}`
    ids[wireId] = id
    questions[wireId] = {
      type: "noul",
      instructions: decision.instructions,
      ...(decision.criteria === undefined ? {} : { criteria: decision.criteria })
    }
  }
  const payload =
    model === "gpt-6-luna"
      ? {
          model,
          input: JSON.stringify(state),
          questions: Object.entries(questions).map(([name, question]) => ({
            type: "predicate" as const,
            name,
            instructions:
              question.criteria === undefined
                ? question.instructions
                : `${question.instructions}\n\nOutcome criteria (JSON): ${JSON.stringify(question.criteria)}`
          }))
        }
      : { model, state, questions }
  const body = JSON.stringify(payload)
  return { payload, body, bytes: Buffer.byteLength(body, "utf8"), ids }
}

/** Protocol validation only; scheduling and source admission stay with their existing owners. */
export const requestLimitViolation = (
  model: ReviewModel,
  request: ReturnType<typeof probabilityRequest>
): RequestLimitViolation | undefined => {
  if (request === undefined) return "invalid-input"
  const limits = PROVIDER_LIMITS[model]
  if (limits.questions !== undefined && Object.keys(request.ids).length > limits.questions) return "questions"
  if (limits.httpBodyBytes !== undefined && request.bytes > limits.httpBodyBytes) return "http-body-bytes"
  if (limits.questionInstructionsCharacters !== undefined && Array.isArray(request.payload.questions)) {
    const maximum = limits.questionInstructionsCharacters
    for (const question of request.payload.questions) {
      if (question.instructions.length > maximum && Array.from(question.instructions).length > maximum)
        return "question-instructions"
    }
  }
  return undefined
}
