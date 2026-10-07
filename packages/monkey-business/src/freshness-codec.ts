import { Schema } from "effect"
import { decoder, PositiveNat } from "@hapsland/canonical-policy/canonical/boundary-schema"

const Source = Schema.Struct({ subject: PositiveNat, input: PositiveNat })
const Scope = Schema.Struct({
  partition: PositiveNat,
  lifetime: PositiveNat,
  round: PositiveNat,
  operation: PositiveNat
})
export type FreshnessSource = typeof Source.Type
export type FreshnessScope = typeof Scope.Type
const readSource = decoder(Source)
const readScope = decoder(Scope)

/** Exact source-free representation only; identity interning and accepted
 * generation provenance remain at the shared owner's explicit boundary. */
export function encodeFreshnessSource(value: FreshnessSource) {
  return { $: "FreshnessScenario.Source", ...readSource(value) }
}
export function encodeFreshnessScope(value: FreshnessScope) {
  return { $: "FreshnessScenario.Scope", ...readScope(value) }
}
