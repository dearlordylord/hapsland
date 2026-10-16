import * as Effect from "effect/Effect"
import { list } from "@hapsland/source-artifacts/direct-event/value/codec"
import { resize } from "../../../state/capacity/reservations.ts"
import { createPreparationForeign } from "../../composition/preparation-foreign.mjs"

// Fixture fault injection over the production foreign capability. No Graph oracle:
// retained consumers assert expected results, identity, refusal and cleanup.
export function createFixturePreparationForeign({ onRoot, mode = "two-roots", ...options }) {
  let roots = 0
  const capability = createPreparationForeign({
    ...options,
    onRoot(value) {
      roots++
      onRoot?.(value)
    }
  })
  return {
    ...capability,
    performEffect(request, effectOptions) {
      return Effect.gen(function* () {
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
            response: { $: "MaterializationDone", requested: bytes, result: admission }
          }
        }
        return yield* capability.performEffect(request, effectOptions)
      })
    }
  }
}
