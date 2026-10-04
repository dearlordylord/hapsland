import * as Schema from "effect/Schema"

export const Probability = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })).pipe(
  Schema.brand("Probability")
)
export type Probability = typeof Probability.Type

export const RuleId = Schema.NonEmptyString.pipe(Schema.brand("RuleId"))
export type RuleId = typeof RuleId.Type

export const SnapshotRef = Schema.Struct({ path: Schema.String, contentHash: Schema.String })
export interface SnapshotRef extends Schema.Schema.Type<typeof SnapshotRef> {}

export const Advice = Schema.Struct({
  ruleId: RuleId,
  probability: Probability,
  message: Schema.String,
  snapshot: SnapshotRef
})
export interface Advice extends Schema.Schema.Type<typeof Advice> {}
