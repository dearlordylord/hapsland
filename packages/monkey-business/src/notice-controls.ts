import { Schema } from "effect"
import { boundedArray, decoder, Nat, PositiveNat, ByteCount } from "../../../src/canonical/boundary-schema.ts"

/** Explicit diagnostic exercises, independent of Jev request outcomes. */
export const OperationalNoticeKindSchema = Schema.Literals(["capacity", "backend", "credential", "output-limit"])
const TargetSchema = Schema.Struct({ partition: PositiveNat, group: PositiveNat, key: PositiveNat })
const FailureSchema = Schema.Struct({
  kind: Schema.Literal("noticeFailure"),
  target: TargetSchema,
  diagnostic: OperationalNoticeKindSchema
})
const CollectSchema = Schema.Struct({
  kind: Schema.Literal("noticeCollect"),
  partition: PositiveNat,
  group: PositiveNat,
  composed: Schema.Boolean,
  authorityBound: Schema.Boolean,
  allowed: boundedArray(ByteCount, 1024)
})
const LeaseSchema = Schema.Struct({ kind: Schema.Literal("noticeLease"), target: TargetSchema })
const AcknowledgeSchema = Schema.Struct({ kind: Schema.Literal("noticeAcknowledge"), target: TargetSchema })
export const NoticeControlSchema = Schema.Union([FailureSchema, CollectSchema, LeaseSchema, AcknowledgeSchema])
export type NoticeControl = typeof NoticeControlSchema.Type
export type OperationalNoticeKind = typeof OperationalNoticeKindSchema.Type
const decode = decoder(NoticeControlSchema)

/** No applicability decision here: Bend verifies key ownership and cooldown. */
export const validateNoticeControl = (value: unknown): NoticeControl => {
  const control = decode(value)
  if (control.kind === "noticeCollect")
    return Object.freeze({ ...control, allowed: Object.freeze([...control.allowed]) })
  return Object.freeze({ ...control, target: Object.freeze({ ...control.target }) })
}

/** Existing exercise bounds only; this does not configure native notice policy. */
export const NoticeExerciseSchema = Schema.Struct({
  partition: PositiveNat,
  group: PositiveNat,
  key: PositiveNat,
  maximumKeys: PositiveNat.check(Schema.isLessThanOrEqualTo(64)),
  reservationBytes: PositiveNat.check(Schema.isLessThanOrEqualTo(1_000_000)),
  cooldownMs: PositiveNat.check(Schema.isLessThanOrEqualTo(1_000_000)),
  startAt: Nat
}).check(
  Schema.makeFilter((value) => value.key < 2 ** 48 - 1 && value.startAt <= 2 ** 48 - 1 - (3 * value.cooldownMs + 9))
)
export type NoticeExercise = typeof NoticeExerciseSchema.Type
const decodeExercise = decoder(NoticeExerciseSchema)
export const validateNoticeExercise = (value: unknown): NoticeExercise => Object.freeze(decodeExercise(value))
export const encodeNoticeScope = (value: NoticeExercise) => {
  const scope = validateNoticeExercise(value)
  return {
    $: "NoticeScenario.Scope",
    partition: scope.partition,
    group: scope.group,
    key: scope.key,
    maximum_keys: scope.maximumKeys,
    reservation_bytes: scope.reservationBytes,
    cooldown: scope.cooldownMs,
    maximum_count: 2 ** 48 - 1
  }
}
