import { Schema } from "effect"
import { decoder, PositiveNat, readBendList } from "../../../src/canonical/boundary-schema.ts"

const Action = Schema.Literals(["disconnect", "remove", "resume"])
const Control = Schema.Struct({
  kind: Schema.Literal("adviceeLifecycle"),
  agent: Schema.String.check(Schema.isMinLength(1)),
  action: Action
})
const ProjectedEntry = Schema.Struct({
  partition: PositiveNat,
  lifetime: PositiveNat,
  status: Schema.Literals(["active", "departed", "removed"])
})
export type AdviceeLifecycleAction = typeof Action.Type
export type AdviceeLifecycleControl = typeof Control.Type
export type AdviceeLifecycleEntry = typeof ProjectedEntry.Type
const readControl = decoder(Control)

/** Syntax validation only. The shared owner decides target and applicability. */
export function validateAdviceeLifecycle(control: AdviceeLifecycleControl): AdviceeLifecycleControl {
  return Object.freeze(readControl(control))
}

export function encodeAdviceeLifecycle(action: AdviceeLifecycleAction): { readonly $: string } {
  switch (action) {
    case "disconnect":
      return { $: "AdviceeLifecycle.Disconnect" }
    case "remove":
      return { $: "AdviceeLifecycle.Remove" }
    case "resume":
      return { $: "AdviceeLifecycle.Resume" }
  }
}

const Identity = Schema.Union([
  PositiveNat,
  Schema.BigInt.check(Schema.makeFilter((value) => value >= 1n && value < 2n ** 48n))
])
const Status = Schema.Union([
  Schema.Struct({ $: Schema.Literal("AdviceeLifecycle.Active") }),
  Schema.Struct({ $: Schema.Literal("AdviceeLifecycle.Disconnected") }),
  Schema.Struct({ $: Schema.Literal("AdviceeLifecycle.Removed") })
])
const Entry = Schema.Struct({
  $: Schema.Literal("AdviceeLifecycle.Entry"),
  partition: Identity,
  lifetime: Identity,
  status: Status
})
const readEntry = decoder(Entry)

export function decodeAdviceeLifecycleEntry(value: unknown): AdviceeLifecycleEntry {
  const entry = readEntry(value)
  const status =
    entry.status.$ === "AdviceeLifecycle.Active"
      ? "active"
      : entry.status.$ === "AdviceeLifecycle.Disconnected"
        ? "departed"
        : "removed"
  return Object.freeze({ partition: Number(entry.partition), lifetime: Number(entry.lifetime), status })
}

/** Exact constructor projection; the existing core vector bound also bounds
 * malformed cyclic tails. There is no lifecycle transition policy here. */
export function decodeAdviceeLifecycles(value: unknown): readonly AdviceeLifecycleEntry[] {
  return Object.freeze(readBendList(value, decodeAdviceeLifecycleEntry, 2048))
}
