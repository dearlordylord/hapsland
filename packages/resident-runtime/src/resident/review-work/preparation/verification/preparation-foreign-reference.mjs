import assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import { resolveGraphUnit } from "@hapsland/source-analysis/direct-event/graph-resolver"
import { fromProductValue } from "@hapsland/source-artifacts/direct-event/value/codec"
import { createPreparationForeign } from "../../composition/preparation-foreign.mjs"

// Independent native correspondence belongs to verification, never product effects.
export function createVerificationPreparationForeign({ compareRoots = true, onRoot, ...options }) {
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
      const reply = await capability.perform(request, effectOptions)
      if (compareRoots && request.command.$ === "ResolveRoot" && !(options.mode === "first-refused" && roots === 1)) {
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
