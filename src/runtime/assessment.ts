import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { Probability, type RuleId } from "../domain/contracts.ts"
import { AssessmentError } from "../domain/errors.ts"
import type { Rule } from "../policy/rules.ts"

const ProbabilityAnswer = Schema.Struct({ probability: Probability })

export const validateAssessment = Effect.fn("Assessment.validate")(function* (
  rules: ReadonlyArray<Rule>,
  answers: Readonly<Record<string, unknown>>
) {
  const expected = rules.map((rule) => rule.id).sort()
  const actual = Object.keys(answers).sort()
  if (expected.length !== actual.length || expected.some((key, index) => key !== actual[index])) {
    return yield* new AssessmentError({
      reason: `answer keys differ from requested rule keys (expected ${expected.join(", ")})`
    })
  }

  const assessment: Record<string, Probability> = {}
  for (const rule of rules) {
    const answer = yield* Schema.decodeUnknownEffect(ProbabilityAnswer, { onExcessProperty: "error" })(
      answers[rule.id]
    ).pipe(Effect.mapError(() => new AssessmentError({ reason: `invalid Probability answer for ${rule.id}` })))
    assessment[rule.id] = answer.probability
  }
  return assessment as Readonly<Record<RuleId, Probability>>
})
