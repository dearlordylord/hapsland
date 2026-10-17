import owner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import source from "../preparation/source-preparation-core.js"
import post from "../preparation/post-preparation-core.js"
import { createGraphMachine } from "@hapsland/source-analysis/direct-event/graph-resolution/composition"
import { createSourcePreparationMachine } from "../preparation/source-preparation-dispatcher.mjs"
import { createPostPreparationMachine, createAdviceTailMachine } from "../preparation/post-preparation-dispatcher.mjs"
import { createOwnedArtifactDriver } from "./owned-artifact-driver.mjs"
import {
  performPreparationSessionRequest,
  performDeliverySessionRequest,
  performEvaluationSessionRequest,
  performDispatchSessionRequest
} from "./native-preparation-sessions.ts"
import type { createPreparationSessionRegistry, PreparationNativeSession } from "./native-preparation-sessions.ts"
import type { createResidentOwnerTransaction } from "../../state/resolver-custody/resident-owner-transaction.mjs"
import type { ForeignOptions, Hooks, Request } from "./owned-artifact-driver.mjs"
import type { Reply } from "./owned-machine.mjs"

type PreparationDriverPorts = {
  readonly bridge: ReturnType<typeof createResidentOwnerTransaction>
  readonly registry: ReturnType<typeof createPreparationSessionRegistry>
  readonly hooks?: Hooks<PreparationNativeSession>
  /** Verification effect interception; production uses the native gateway. */
  readonly foreign?: (
    requests: readonly Request[],
    options: ForeignOptions
  ) => import("@hapsland/runtime-environment/runtime/native-execution").NativeWork<Reply>
}

/** Internal resident composition. One supplied custody registry and Canonical
 * commit bridge bind all engines before state publications become available.
 * This lifetime resource captures no job, settings, cache, or invocation scope.
 * Engine mismatch fails inside existing construction cleanup; a missing launch
 * scope fails before input allocation or publication. Host effects retain their
 * existing providers and original native sessions.
 */
export function createResidentPreparationDriver({ bridge, registry, hooks, foreign }: PreparationDriverPorts) {
  const artifact = createGraphMachine()
  const sourceMachine = createSourcePreparationMachine(source)
  const postMachine = createPostPreparationMachine(post)
  const adviceMachine = createAdviceTailMachine(post)
  return createOwnedArtifactDriver<PreparationNativeSession>({
    owner,
    control: bridge.control,
    registry,
    evaluationForeign: (request, options) => performEvaluationSessionRequest(registry, request, options),
    dispatchForeign: (request, options) => performDispatchSessionRequest(registry, request, options),
    deliveryForeign: (request, options) => performDeliverySessionRequest(registry, request, options),
    machine: artifact,
    ...(hooks === undefined ? {} : { hooks }),
    foreign:
      foreign ??
      ((requests, options) => {
        if (requests.length !== 1) throw new TypeError("Preparation requires one owned request")
        return performPreparationSessionRequest(registry, requests[0]!, options)
      }),
    selectMachine: (input, session) => {
      if ("evaluation" in input) {
        if (!("input" in session && "evaluation" in session.input && "foreign" in session))
          throw new TypeError("Wrong evaluation engine session")
        return session.machine
      }
      if ("evaluationDispatch" in input) {
        if (!("input" in session && "evaluationDispatch" in session.input && "foreign" in session))
          throw new TypeError("Wrong dispatch engine session")
        return session.machine
      }
      if ("delivery" in input) {
        if (!("input" in session && "delivery" in session.input && "foreign" in session))
          throw new TypeError("Wrong delivery engine session")
        return session.machine
      }
      if ("finalization" in input) {
        if (!("input" in session && "finalization" in session.input && "machine" in session && session.machine))
          throw new TypeError("Wrong finalization engine session")
        return session.machine
      }
      if ("sourcePreparation" in input) {
        if (!("input" in session && "sourcePreparation" in session.input))
          throw new TypeError("Wrong source engine session")
        return sourceMachine
      }
      if ("preparation" in input) {
        if (!("input" in session && "preparation" in session.input && "machine" in session && session.machine))
          throw new TypeError("Wrong preparation engine session")
        return session.machine
      }
      if ("postPreparation" in input) {
        if (!("input" in session && "postPreparation" in session.input))
          throw new TypeError("Wrong post-preparation engine session")
        return postMachine
      }
      if ("adviceTail" in input) {
        if (!("input" in session && "adviceTail" in session.input)) throw new TypeError("Wrong advice engine session")
        return adviceMachine
      }
      if ("input" in session) throw new TypeError("Wrong graph engine session")
      return artifact
    }
  })
}
