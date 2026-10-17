import * as Effect from "effect/Effect"
import type { DeliverySelection } from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import { effectNative, type NativeFlow } from "@hapsland/runtime-environment/runtime/native-execution"
import type { ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import type { makeResidentCollectionRoot } from "./collection-root.ts"
import type { makeResidentSourceCurrentSession } from "./source-current.ts"
import type { makeResidentDeliveryFinalizationSession } from "./delivery-finalize.ts"
import core from "./handoff-core.js"
import { createDeliverySession, type DeliveryState } from "./delivery-session.ts"

export function createCollectionDeliverySession(
  invocation: number,
  native: ReturnType<typeof makeResidentCollectionRoot>
) {
  return createDeliverySession({
    invocation,
    initial: { stage: "collect", step: native.initial(invocation) },
    advance: (state) => {
      if (state.stage !== "collect") throw new Error("Wrong collection continuation")
      return native.advance(state.step).pipe(Effect.map((step) => ({ stage: "collect", step }) satisfies DeliveryState))
    },
    accepted: (state) => {
      if (state.stage !== "collect") throw new Error("Wrong collection terminal")
      return { stage: "collect", response: native.decode(state.step) }
    },
    selection: (state) => {
      if (state.stage !== "collect") throw new Error("Wrong collection selection")
      return native.selection(state.step)
    },
    finish: native.finish,
    *cleanup() {
      yield effectNative(native.cleanup(), false)
    }
  })
}

export function createPrepareDeliverySession(
  invocation: number,
  native: Effect.Success<ReturnType<typeof makeResidentSourceCurrentSession>>,
  response: ResidentResponse,
  selection: DeliverySelection,
  cleanup: () => NativeFlow<unknown>
) {
  return createDeliverySession({
    invocation,
    initial: { stage: "prepare", step: native.initial(invocation) },
    advance: (state) => {
      if (state.stage !== "prepare") throw new Error("Wrong prepare continuation")
      return native.advance(state.step).pipe(Effect.map((step) => ({ stage: "prepare", step }) satisfies DeliveryState))
    },
    accepted: (state) => {
      if (state.stage !== "prepare") throw new Error("Wrong prepare terminal")
      return { stage: "prepare", response, sources: native.decode(state.step) }
    },
    selection: () => selection,
    finish: native.finish,
    cleanup
  })
}

export function createFinalizeDeliverySession(
  invocation: number,
  native: ReturnType<typeof makeResidentDeliveryFinalizationSession>,
  selection: DeliverySelection,
  cleanup: () => NativeFlow<unknown>
) {
  return createDeliverySession({
    invocation,
    initial: { stage: "finalize", step: core.delivery_finalize_initial(invocation, native.transport, native.input) },
    advance: (state) =>
      Effect.gen(function* () {
        if (state.stage !== "finalize" || state.step.$ !== "DAwait") throw new Error("Wrong finalization continuation")
        const request = state.step.request
        const step = core.delivery_finalize_resume(state.step, {
          $: "DReply",
          invocation: request.invocation,
          id: request.id,
          response: yield* native.perform(request.command)
        })
        return { stage: "finalize", step } satisfies DeliveryState
      }),
    accepted: (state) => {
      if (state.stage !== "finalize") throw new Error("Wrong finalization terminal")
      return { stage: "finalize", response: native.decode(state.step) }
    },
    selection: () => selection,
    finish: () => Effect.void,
    cleanup
  })
}
