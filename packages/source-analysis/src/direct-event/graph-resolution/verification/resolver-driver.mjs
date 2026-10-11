import { artifactValueTag } from "@hapsland/source-artifacts/direct-event/value/codec"
import * as Effect from "effect/Effect"
import { TransportFailure } from "@hapsland/runtime-environment/runtime/effect-transport"
import { readNat } from "@hapsland/canonical-policy/canonical/boundary-schema"
import { pureReply, createBendResolver } from "../consumer.mjs"
const tagged = (name, fields = {}) => ({ $: artifactValueTag(name) ?? "Types." + name, ...fields })
export function createMachineDriver({ machine, foreign, registry, observeTransition, observeFinished, trace = false }) {
  return (session, input, options = {}) =>
    registry.run(session, async () => {
      if (options.signal?.aborted) throw new TransportFailure("aborted")
      let state = machine.initial(input)
      const operations = trace ? [] : undefined
      for (;;) {
        const step = machine.view ? machine.view(state) : state.step
        if (!step) throw new Error("unsettled Bend continuation")
        if (step.$ === "Types.FinishedResolver") {
          observeFinished?.(step)
          return { result: step.result, finalFrame: step.final_frame, trace: operations }
        }
        if (step.$ === "Types.FailedResolver") {
          if (step.failure.$ === "Types.ForeignProviderFailure") throw session.exception(step.failure.exception)
          if (step.failure.$ === "Types.NegativeGraphWork") readNat(-Number(step.failure.magnitude))
          return { failure: step.failure, trace: operations }
        }
        if (step.$ !== "Types.AwaitService") throw new Error("invalid Bend service step")
        operations?.push(step.request.operation.$)
        const reply = pureReply(await foreign([step.request], options))
        if (options.signal?.aborted) throw new TransportFailure("aborted")
        observeTransition?.(step, reply)
        state = machine.resume(state, tagged("ServiceReply", { reply }))
      }
    })
}

export function createIODriver({ resolve, registry }) {
  return (session, input, options) =>
    registry.run(session, async () => {
      const state = await resolve([input], options)
      if (state.$ === "Types.RuntimeFinished") return { result: state.result }
      if (state.$ === "Types.RuntimeFailed") {
        if (state.failure.$ === "Types.ForeignProviderFailure") throw session.exception(state.failure.exception)
        if (state.failure.$ === "Types.NegativeGraphWork") readNat(-Number(state.failure.magnitude))
        return { failure: state.failure }
      }
      if (state.$ !== "Loop.ServiceStep") throw new Error("unsettled Bend IO continuation")
      const step = state.step
      if (step.$ === "Types.FinishedResolver") return { result: step.result, finalFrame: step.final_frame }
      if (step.$ !== "Types.FailedResolver") throw new Error("Bend IO returned before terminal")
      if (step.failure.$ === "Types.ForeignProviderFailure") throw session.exception(step.failure.exception)
      if (step.failure.$ === "Types.NegativeGraphWork") readNat(-Number(step.failure.magnitude))
      return { failure: step.failure }
    })
}

// Standalone drivers and counters belong only to verification, never production.
export function createVerificationResolver(options, createResolver = createBendResolver) {
  const drive =
    options.drive ??
    (options.resolveIO
      ? createIODriver({ resolve: options.resolveIO, registry: options.registry })
      : createMachineDriver(options))
  let invocation = 0
  return createResolver({
    ...options,
    drive,
    allocateInvocation: options.allocateInvocation ?? (() => ++invocation),
    onConstructionFailure: options.onConstructionFailure ?? (() => {})
  })
}
export function createVerificationEffectResolver(options) {
  const resolve = createVerificationResolver(options)
  return (path, capture, name, context) => Effect.promise((signal) => resolve(path, capture, name, context, { signal }))
}
