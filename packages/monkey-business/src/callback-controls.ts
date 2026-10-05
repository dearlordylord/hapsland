import { Schema } from "effect"
import { decoder, Nat, PositiveNat, readBendList } from "../../../src/canonical/boundary-schema.ts"

const Owner = Schema.Struct({
  partition: PositiveNat,
  lifetime: PositiveNat,
  round: PositiveNat,
  operation: PositiveNat
})
const Selected = Schema.Array(PositiveNat).check(
  Schema.isMaxLength(2048),
  Schema.makeFilter((values) => values.length > 0 && new Set(values).size === values.length)
)
const Effect = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("jevStarted"), request: PositiveNat }),
  Schema.Struct({ kind: Schema.Literal("jevInterrupted"), request: PositiveNat }),
  Schema.Struct({ kind: Schema.Literal("jevSettled"), request: PositiveNat }),
  Schema.Struct({ kind: Schema.Literal("preparationCompleted") }),
  Schema.Struct({ kind: Schema.Literal("outputTerminal"), advice: PositiveNat, token: PositiveNat }),
  Schema.Struct({ kind: Schema.Literal("outputExpiry"), advice: PositiveNat, token: PositiveNat }),
  Schema.Struct({
    kind: Schema.Literal("finishTerminal"),
    group: PositiveNat,
    round: PositiveNat,
    attempt: PositiveNat,
    token: PositiveNat,
    selected: Selected
  })
])
export const CallbackTargetSchema = Schema.Struct({ owner: Owner, effect: Effect, originalOrder: Nat })
export const CallbackControlSchema = Schema.Struct({
  kind: Schema.Literal("callback"),
  action: Schema.Literals(["hold", "release", "drop", "duplicate", "reorder"]),
  target: CallbackTargetSchema
})
const readControl = decoder(CallbackControlSchema)
export type CallbackTarget = typeof CallbackTargetSchema.Type
export type CallbackControl = typeof CallbackControlSchema.Type
export type CallbackReport = {
  readonly at: number
  readonly controlSequence: number
  readonly control: CallbackControl
  readonly result: "applied" | "missing" | "notQueued" | "notHeld"
}

/** Syntax and immutable copying only; the shared owner applies the intervention. */
export function validateCallbackControl(value: CallbackControl): CallbackControl {
  const control = readControl(value)
  return Object.freeze({
    ...control,
    target: Object.freeze({
      ...control.target,
      owner: Object.freeze({ ...control.target.owner }),
      effect: Object.freeze({
        ...control.target.effect,
        ...(control.target.effect.kind === "finishTerminal"
          ? { selected: Object.freeze([...control.target.effect.selected]) }
          : {})
      })
    })
  })
}

const effectNames = {
  jevStarted: "JevStarted",
  jevInterrupted: "JevInterrupted",
  jevSettled: "JevSettled",
  preparationCompleted: "PreparationCompleted",
  outputTerminal: "OutputTerminal",
  outputExpiry: "OutputExpiry",
  finishTerminal: "FinishTerminal"
} as const
export function encodeCallbackTarget(target: CallbackTarget) {
  const checked = validateCallbackControl({ kind: "callback", action: "hold", target }).target
  const { kind, ...fields } = checked.effect
  return {
    $: "Callbacks.Target",
    owner: { $: "Callbacks.Owner", ...checked.owner },
    effect: {
      $: `Callbacks.${effectNames[kind]}`,
      ...fields,
      ...(checked.effect.kind === "finishTerminal"
        ? {
            selected: checked.effect.selected.reduceRight<unknown>(
              (tail, head) => Object.freeze({ $: "Con", head, tail }),
              Object.freeze({ $: "Nil" })
            )
          }
        : {})
    },
    original_order: checked.originalOrder
  }
}
export function encodeCallbackAction(action: CallbackControl["action"]) {
  return { $: `Callbacks.${action[0]!.toUpperCase()}${action.slice(1)}` }
}
const RawNat = Schema.Union([Nat, Schema.BigInt.check(Schema.makeFilter((value) => value >= 0n && value < 2n ** 48n))])
const RawPositive = Schema.Union([
  PositiveNat,
  Schema.BigInt.check(Schema.makeFilter((value) => value >= 1n && value < 2n ** 48n))
])
const readRawPositive = decoder(RawPositive)
const RawOwner = Schema.Struct({
  $: Schema.Literal("Callbacks.Owner"),
  partition: RawPositive,
  lifetime: RawPositive,
  round: RawPositive,
  operation: RawPositive
})
const RawEffect = Schema.Union([
  Schema.Struct({ $: Schema.Literal("Callbacks.JevStarted"), request: RawPositive }),
  Schema.Struct({ $: Schema.Literal("Callbacks.JevInterrupted"), request: RawPositive }),
  Schema.Struct({ $: Schema.Literal("Callbacks.JevSettled"), request: RawPositive }),
  Schema.Struct({ $: Schema.Literal("Callbacks.PreparationCompleted") }),
  Schema.Struct({ $: Schema.Literal("Callbacks.OutputTerminal"), advice: RawPositive, token: RawPositive }),
  Schema.Struct({ $: Schema.Literal("Callbacks.OutputExpiry"), advice: RawPositive, token: RawPositive }),
  Schema.Struct({
    $: Schema.Literal("Callbacks.FinishTerminal"),
    group: RawPositive,
    round: RawPositive,
    attempt: RawPositive,
    token: RawPositive,
    selected: Schema.Unknown
  })
])
const rawTarget = decoder(
  Schema.Struct({ $: Schema.Literal("Callbacks.Target"), owner: RawOwner, effect: RawEffect, original_order: RawNat })
)
export function decodeCallbackTarget(value: unknown): CallbackTarget {
  const target = rawTarget(value)
  const owner = {
    partition: Number(target.owner.partition),
    lifetime: Number(target.owner.lifetime),
    round: Number(target.owner.round),
    operation: Number(target.owner.operation)
  }
  let effect: CallbackTarget["effect"]
  switch (target.effect.$) {
    case "Callbacks.PreparationCompleted":
      effect = { kind: "preparationCompleted" }
      break
    case "Callbacks.OutputTerminal":
    case "Callbacks.OutputExpiry":
      effect = {
        kind: target.effect.$ === "Callbacks.OutputTerminal" ? "outputTerminal" : "outputExpiry",
        advice: Number(target.effect.advice),
        token: Number(target.effect.token)
      }
      break
    case "Callbacks.FinishTerminal":
      effect = {
        kind: "finishTerminal",
        group: Number(target.effect.group),
        round: Number(target.effect.round),
        attempt: Number(target.effect.attempt),
        token: Number(target.effect.token),
        selected: readBendList(target.effect.selected, (value) => Number(readRawPositive(value)), 2048)
      }
      break
    case "Callbacks.JevStarted":
      effect = { kind: "jevStarted", request: Number(target.effect.request) }
      break
    case "Callbacks.JevInterrupted":
      effect = { kind: "jevInterrupted", request: Number(target.effect.request) }
      break
    case "Callbacks.JevSettled":
      effect = { kind: "jevSettled", request: Number(target.effect.request) }
      break
  }
  return validateCallbackControl({
    kind: "callback",
    action: "hold",
    target: { owner, effect, originalOrder: Number(target.original_order) }
  }).target
}
export function decodeCallbackTargets(value: unknown): readonly CallbackTarget[] {
  return Object.freeze(readBendList(value, decodeCallbackTarget, 2048))
}
