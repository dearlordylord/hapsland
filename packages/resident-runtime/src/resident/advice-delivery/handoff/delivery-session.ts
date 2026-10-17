import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import type { DeliverySelection } from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import type {
  ForeignReply,
  ForeignOptions,
  DeliveryHandoff
} from "@hapsland/canonical-policy/canonical/child-execution"
import {
  effectNative,
  withNativeSignal,
  nativeFailureAggregate,
  type NativeFlow
} from "@hapsland/runtime-environment/runtime/native-execution"
import type { ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import type { ResidentAdapterError } from "../../adapter-error.ts"
import type { RootStep } from "./collection-handoff-core.js"
import type { PStep, DStep } from "./handoff-core.js"

export type DeliveryState =
  | { readonly stage: "collect"; readonly step: RootStep }
  | { readonly stage: "prepare"; readonly step: PStep }
  | { readonly stage: "finalize"; readonly step: DStep }
export type DeliveryInput = { readonly invocation: number; readonly delivery: DeliveryState }
export type DeliveryResult =
  | { readonly stage: "collect" | "finalize"; readonly response: ResidentResponse }
  | { readonly stage: "prepare"; readonly response: ResidentResponse; readonly sources: ReadonlyMap<string, boolean> }
export type DeliveryAccepted =
  | { readonly delivery: { readonly kind: "result"; readonly value: DeliveryResult } }
  | {
      readonly delivery: { readonly kind: "handoff"; readonly value: DeliveryResult; readonly receipt: DeliveryHandoff }
    }
export type DeliveryRequest = {
  readonly delivery: true
  readonly invocation: number
  readonly id: number
  readonly state: DeliveryState
}
export type DeliveryReply = {
  readonly $: "DeliveryReply"
  readonly invocation: number
  readonly id: number
  readonly request: DeliveryRequest
  readonly continuation: DeliveryState
}
export type DeliveryView =
  | { readonly $: "DeliveryAwait"; readonly request: DeliveryRequest }
  | { readonly $: "DeliveryDone"; readonly state: DeliveryState }

// Each session holds exactly one installed continuation and at most one offered
// reply. Only the shared driver's accepted Resume installs the offered state.
export function createDeliverySession(options: {
  readonly invocation: number
  readonly initial: DeliveryState
  readonly advance: (held: DeliveryState, options: ForeignOptions) => Effect.Effect<DeliveryState, ResidentAdapterError>
  readonly accepted: (state: DeliveryState) => DeliveryResult
  readonly selection: (state: DeliveryState) => DeliverySelection
  readonly finish: () => Effect.Effect<unknown>
  readonly cleanup: () => NativeFlow<unknown>
}) {
  const { invocation } = options
  let installed = options.initial
  let request: DeliveryRequest | undefined
  let offered: DeliveryReply | undefined
  let consumed = false,
    revoked = false
  const awaitId = (state: DeliveryState): { readonly invocation: number; readonly id: number } | undefined => {
    switch (state.stage) {
      case "collect":
        if (state.step.$ === "RootAwait") return state.step.request
        if (state.step.$ === "RootDone") return undefined
        break
      case "prepare":
        if (state.step.$ === "PAwait") return state.step.request
        if (state.step.$ === "PDone") return undefined
        break
      case "finalize":
        if (state.step.$ === "DAwait") return state.step.request
        if (state.step.$ === "DDone") return undefined
        break
    }
    throw new Error("Rejected specialized delivery continuation")
  }
  const input: DeliveryInput = { invocation, delivery: installed }
  const machine = {
    kind: "delivery" as const,
    stage: options.initial.stage,
    initial(value: DeliveryInput): DeliveryState {
      if (value !== input || value.invocation !== invocation) throw new Error("Wrong delivery input capability")
      return installed
    },
    view(state: DeliveryState): DeliveryView {
      if (state !== installed) throw new Error("Stale delivery continuation")
      const id = awaitId(state)
      if (id === undefined) return { $: "DeliveryDone", state }
      if (id.invocation !== invocation) throw new Error("Wrong specialized delivery invocation")
      request ??= { delivery: true, invocation, id: id.id, state }
      return { $: "DeliveryAwait", request }
    },
    resume(state: DeliveryState, reply: DeliveryReply): DeliveryState {
      if (
        state !== installed ||
        reply !== offered ||
        reply.request !== request ||
        reply.request.state !== state ||
        reply.invocation !== invocation ||
        reply.id !== request?.id ||
        reply.continuation.stage !== state.stage ||
        revoked
      )
        throw new Error("Wrong delivery continuation reply")
      installed = reply.continuation
      request = undefined
      offered = undefined
      consumed = false
      return installed
    },
    accepted(view: DeliveryView): DeliveryResult {
      if (view.$ !== "DeliveryDone" || view.state !== installed) throw new Error("Unaccepted delivery state")
      return options.accepted(view.state)
    },
    selection(view: DeliveryView): DeliverySelection {
      if (view.$ !== "DeliveryDone" || view.state !== installed) throw new Error("Missing delivery terminal selection")
      return options.selection(view.state)
    },
    disposeInvocation(actual: number) {
      if (actual !== invocation) throw new Error("Wrong delivery disposal invocation")
    },
    retainedHandles: 0
  }
  return {
    invocation,
    input,
    machine,
    cleanupFlow: options.cleanup,
    revoke() {
      revoked = true
    },
    close() {
      revoked = true
    },
    *finishFlow(): NativeFlow<unknown> {
      return yield effectNative(options.finish(), false)
    },
    foreign(held: DeliveryRequest, execution: ForeignOptions): ForeignReply<DeliveryReply> {
      let completed: Exit.Exit<DeliveryState, ResidentAdapterError> | undefined
      return {
        effect: Effect.suspend(() => {
          if (
            revoked ||
            consumed ||
            held !== request ||
            held.state !== installed ||
            held.invocation !== invocation ||
            held.id !== awaitId(installed)?.id
          )
            throw new Error("Stale or consumed delivery provider request")
          consumed = true
          const work = Effect.suspend(() => options.advance(installed, execution))
          const effect = installed.stage === "finalize" ? work : withNativeSignal(work, execution.signal)
          return Effect.exit(effect).pipe(
            Effect.tap((exit) =>
              Effect.sync(() => {
                completed = exit
              })
            )
          )
        }),
        map() {
          const exit = completed
          completed = undefined
          if (exit === undefined) throw new Error("Delivery provider result not completed or already consumed")
          if (Exit.isFailure(exit)) throw nativeFailureAggregate([], "Delivery provider failure", undefined, exit.cause)
          offered = { $: "DeliveryReply", invocation, id: held.id, request: held, continuation: exit.value }
          return offered
        }
      }
    }
  }
}
export type DeliverySession = ReturnType<typeof createDeliverySession>
export type DeliveryMachine = DeliverySession["machine"]
