import assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import { resolveGraphUnit } from "@hapsland/source-analysis/direct-event/graph-resolver"
import { fromProductValue, list } from "@hapsland/source-artifacts/direct-event/value/codec"
import { resize } from "../../../state/capacity/reservations.ts"
import { createPreparationForeign } from "../../composition/preparation-foreign.mjs"

// Independent native correspondence belongs to verification, never product effects.
export function createVerificationPreparationForeign({ compareRoots = true, onRoot, mode = "two-roots", ...options }) {
  let facts,
    roots = 0
  const capability = createPreparationForeign({
    ...options,
    onRoot(value) {
      facts = value
      roots++
      onRoot?.(value)
    }
  })
  return {
    ...capability,
    async perform(request, effectOptions) {
      const command = request.command
      if (mode === "first-refused" && command.$ === "ResolveRoot" && roots === 0) {
        roots++
        onRoot?.()
        return {
          $: "Reply",
          invocation: request.invocation,
          id: request.id,
          response: {
            $: "RootResolved",
            unit: { $: "None" },
            references: list([]),
            captures: capability.snapshotCaptures()
          }
        }
      }
      if (mode === "resize-refused" && command.$ === "AdmitMaterialization") {
        const bytes = 200000000
        const result = Effect.runSync(
          options.connection.bridge.nativeScoped(effectOptions.ownerLease, (draft, records) => [
            resize(draft, options.connection.preparation.reservation, bytes),
            records
          ])
        ).value
        options.onMaterialization?.({ kind: "resize", bytes, status: result.status })
        const admission = {
          resized: { $: "Resized" },
          "capacity-refused": { $: "CapacityRefused", constraint: result.constraint },
          "invalid-reservation": { $: "InvalidReservation" },
          "invalid-measurement": { $: "InvalidMeasurement" }
        }[result.status]
        if (!admission) throw new Error("Unknown materialization resize status " + result.status)
        return {
          $: "Reply",
          invocation: request.invocation,
          id: request.id,
          response: { $: "MaterializationDone", requested: BigInt(bytes), result: admission }
        }
      }
      const reply = await capability.perform(request, effectOptions)
      if (compareRoots && request.command.$ === "ResolveRoot") {
        const expected = await Effect.runPromise(
          resolveGraphUnit(facts.path, facts.capture, facts.name, { ...facts.context, captureCache: new Map() })
        )
        const unit = reply.response.unit
        assert.deepEqual(unit.$ === "None" ? undefined : fromProductValue(unit.value), expected)
      }
      return reply
    }
  }
}
