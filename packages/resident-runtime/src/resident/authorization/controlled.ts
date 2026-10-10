import * as Schema from "effect/Schema"
import { type ControlledDecisionModelOptions } from "@hapsland/review-execution/review-execution/controlled-decision-model"
import { type ResidentDispatchContext } from "@hapsland/resident-transport/resident/protocol"

const ResidentControlledOptions = Schema.Struct({
  answers: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.Union([
        Schema.Struct({ _tag: Schema.Literal("Probability"), probability: Schema.Number }),
        Schema.Struct({
          _tag: Schema.Literal("Classify"),
          label: Schema.String,
          probabilities: Schema.Record(Schema.String, Schema.Number),
          confidence: Schema.optionalKey(Schema.Number)
        }),
        Schema.Struct({
          _tag: Schema.Literal("Rate"),
          rating: Schema.Number,
          probabilities: Schema.Record(Schema.String, Schema.Number),
          confidence: Schema.optionalKey(Schema.Number)
        })
      ])
    )
  ),
  delayMs: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
  failure: Schema.optionalKey(Schema.String),
  failureOnSourceIncludes: Schema.optionalKey(Schema.String),
  findingOnSourceIncludes: Schema.optionalKey(Schema.String),
  capturePath: Schema.optionalKey(Schema.String),
  requestSummaryPath: Schema.optionalKey(Schema.String),
  outcomePath: Schema.optionalKey(Schema.String),
  requireCredential: Schema.optionalKey(Schema.Boolean),
  syntheticR6BrandedRepair: Schema.optionalKey(Schema.Literals(["control", "finding"]))
})

export const decodeControlledOptions = (
  value: ResidentDispatchContext["controlled"]
): ControlledDecisionModelOptions | undefined => {
  if (value === null) return undefined
  try {
    return Schema.decodeUnknownSync(ResidentControlledOptions, { onExcessProperty: "error" })(value)
  } catch {
    return undefined
  }
}
