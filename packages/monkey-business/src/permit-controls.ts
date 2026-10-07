import { Schema } from "effect"
import { DEFAULT_EDIT_PERMIT_LIMITS, EditPermitLimitsSettings } from "@hapsland/runtime-inputs/configuration/types"
import { decoder, Nat, PositiveNat, readBendList } from "@hapsland/canonical-policy/canonical/boundary-schema"
import { decodeDriverEvent } from "./driver-codec.ts"

const PermitLimit = PositiveNat.check(Schema.isLessThanOrEqualTo(65536))
export const PermitLimitsSchema = Schema.Struct({ perAdvicee: PermitLimit, resident: PermitLimit }).check(
  Schema.makeFilter((value) => value.perAdvicee <= value.resident)
)
export const PermitProfileSchema = Schema.Struct({
  outcome: Schema.Literals(["success", "failure", "duplicate", "absent"]),
  durationMs: Nat.check(Schema.isLessThanOrEqualTo(1_000_000_000)),
  lifetimeMs: PositiveNat.check(Schema.isLessThanOrEqualTo(1_000_000_000))
})
export const PermitControlSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("editPermitLimits"), limits: PermitLimitsSchema }),
  Schema.Struct({ kind: Schema.Literal("permitProfile"), profile: PermitProfileSchema })
])
export type PermitLimits = typeof PermitLimitsSchema.Type
export type PermitProfile = typeof PermitProfileSchema.Type
export type PermitControl = typeof PermitControlSchema.Type
export const DEFAULT_PERMIT_LIMITS: PermitLimits = Object.freeze({ ...DEFAULT_EDIT_PERMIT_LIMITS })
export const DEFAULT_PERMIT_PROFILE: PermitProfile = Object.freeze({
  outcome: "success",
  durationMs: 0,
  lifetimeMs: 30000
})
const readLimits = decoder(PermitLimitsSchema)
const readLimitSettings = decoder(EditPermitLimitsSettings)
const readProfile = decoder(PermitProfileSchema)
const readControl = decoder(PermitControlSchema)
export const validatePermitLimits = (value: unknown): PermitLimits => {
  const settings = readLimitSettings(value)
  return Object.freeze(
    readLimits({
      perAdvicee: settings.perAdvicee ?? DEFAULT_PERMIT_LIMITS.perAdvicee,
      resident: settings.resident ?? DEFAULT_PERMIT_LIMITS.resident
    })
  )
}
export const validatePermitProfile = (value: unknown): PermitProfile => Object.freeze(readProfile(value))
export const validatePermitControl = (value: unknown): PermitControl => {
  const control = readControl(value)
  return Object.freeze(
    control.kind === "editPermitLimits"
      ? { kind: control.kind, limits: Object.freeze(control.limits) }
      : { kind: control.kind, profile: Object.freeze(control.profile) }
  )
}

const CaptureSchema = Schema.Struct({
  partition: PositiveNat,
  lifetime: PositiveNat,
  tool: PositiveNat,
  started: PositiveNat,
  deadline: PositiveNat,
  postDelay: Nat.check(Schema.isLessThanOrEqualTo(1_000_000_000)),
  outcome: PermitProfileSchema.fields.outcome,
  limits: PermitLimitsSchema
}).check(Schema.makeFilter((value) => value.deadline >= value.started && value.started + value.postDelay < 2 ** 48))
export type PermitCapture = typeof CaptureSchema.Type
const readCapture = decoder(CaptureSchema)
const outcomes = { success: "Successful", failure: "Failed", duplicate: "Duplicate", absent: "Absent" } as const
/** Capture is immutable. Changing a profile cannot change previously issued PRE facts. */
export const encodePermitCapture = (value: unknown) => {
  const capture = readCapture(value)
  return Object.freeze({
    $: "PermitScenario.Capture",
    partition: capture.partition,
    lifetime: capture.lifetime,
    tool: capture.tool,
    started: capture.started,
    deadline: capture.deadline,
    post_delay: capture.postDelay,
    outcome: Object.freeze({ $: `PermitScenario.${outcomes[capture.outcome]}` }),
    advicee_limit: capture.limits.perAdvicee,
    resident_limit: capture.limits.resident
  })
}
const FactSchema = Schema.Struct({
  $: Schema.Literal("PermitScenario.Fact"),
  event: Schema.Unknown,
  delay: Schema.Union([Nat, Schema.BigInt.check(Schema.makeFilter((value) => value >= 0n && value < 2n ** 48n))]),
  job: Schema.Boolean
})
const readFact = decoder(FactSchema)
/** Bounded/cycle-safe list decoding, then the actual Canonical event decoder. */
export const decodePermitFacts = (value: unknown) =>
  readBendList(
    value,
    (item) => {
      const fact = readFact(item)
      return { event: decodeDriverEvent(fact.event), delay: Number(fact.delay), job: fact.job }
    },
    3
  )
