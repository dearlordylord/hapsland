import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

const decodeJson = (input: string) =>
  Effect.try({ try: () => JSON.parse(input) as unknown, catch: () => new Error("stdin is not valid JSON") })

const ControlledOptions = Schema.Struct({
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

export const controlledOptions = Config.String("REVIEW_CONTROL_JSON").pipe(
  Config.withDefault("{}"),
  Effect.flatMap((encoded) =>
    decodeJson(encoded).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(ControlledOptions, { onExcessProperty: "error" }))
    )
  )
)
