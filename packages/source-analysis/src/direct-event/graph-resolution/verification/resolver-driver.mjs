import { artifactValueTag } from "@hapsland/source-artifacts/direct-event/value/codec"
import { TransportFailure } from "@hapsland/runtime-environment/runtime/effect-transport"
import { readNat } from "@hapsland/canonical-policy/canonical/boundary-schema"
import { encodeGraphReply } from "../reply-codec.ts"
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
        const reply = encodeGraphReply(await foreign([step.request], options))
        if (options.signal?.aborted) throw new TransportFailure("aborted")
        observeTransition?.(step, reply)
        state = machine.resume(state, tagged("ServiceReply", { reply }))
      }
    })
}
