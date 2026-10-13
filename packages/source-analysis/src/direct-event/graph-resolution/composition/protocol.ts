import { createChildExecutionDriver } from "@hapsland/canonical-policy/canonical/child-execution"
import type { Protocol, Outcome } from "@hapsland/canonical-policy/canonical/child-execution"
import { readNat } from "@hapsland/canonical-policy/canonical/boundary-schema"
import type { ServiceSession } from "../service-contract.ts"
import type { GraphServiceReply } from "../consumer.ts"
import {
  acceptGraphProjection,
  type GraphControlProjection,
  type createGraphMachine,
  type GraphOutcome
} from "./machine.ts"

type Machine = ReturnType<typeof createGraphMachine>
type Input = Parameters<Machine["initial"]>[0]
export type GraphContinuation = {
  readonly kind: "artifact"
  readonly machine: Machine
  readonly step: ReturnType<Machine["initial"]>
}
export type GraphProjection = {
  readonly kind: "artifact"
  readonly machine: Machine
  readonly view: GraphControlProjection
}
type RawRequest = Extract<GraphProjection["view"], { $: "Types.AwaitService" }>["request"]
type Request = RawRequest & { readonly invocation: bigint; readonly id: bigint }
const exactRequest = (request: RawRequest): request is Request =>
  typeof request.invocation === "bigint" && typeof request.id === "bigint"

// The same Graph protocol is consumed by standalone Graph verification and by
// composed Preparation. It owns no Canonical action loop or resource registry.
export const graphProtocol: Protocol<
  Input,
  Machine,
  GraphContinuation,
  GraphProjection,
  Request,
  GraphServiceReply,
  GraphOutcome,
  never,
  ServiceSession
> = {
  initial: (machine, input) => ({ kind: "artifact", machine, step: machine.initial(input) }),
  view: (held) => {
    const request = held.machine.awaitingRequest(held.step)
    const view: GraphControlProjection =
      request === undefined ? held.machine.view(held.step) : { $: "Types.AwaitService", request }
    return { kind: "artifact", machine: held.machine, view }
  },
  resume: (held, reply) => ({ ...held, step: held.machine.resume(held.step, { $: "Types.ServiceReply", reply }) }),
  awaitRequest(projected) {
    if (projected.view.$ !== "Types.AwaitService") return undefined
    const request = projected.view.request
    if (!exactRequest(request)) throw new TypeError("Provider request requires exact Bend Nat identifiers")
    return request
  },
  installation: () => ({ method: "install" }),
  terminal: () => "terminal",
  accepted: (projected) => acceptGraphProjection(projected.view),
  preparation() {
    throw new TypeError("Graph cannot produce a preparation handoff")
  },
  projectTerminal(outcome, session) {
    if (
      "failure" in outcome &&
      (outcome.failure.$ === "Types.ForeignProviderFailure" || outcome.failure.$ === "Types.RuntimeFailure")
    )
      throw session.exception(outcome.failure.exception)
    if ("failure" in outcome && outcome.failure.$ === "Types.NegativeGraphWork")
      readNat(-Number(outcome.failure.magnitude))
    return outcome
  }
}

type Options = Omit<
  Parameters<
    typeof createChildExecutionDriver<
      Input,
      Machine,
      GraphContinuation,
      GraphProjection,
      Request,
      GraphServiceReply,
      GraphOutcome,
      never,
      ServiceSession
    >
  >[0],
  "protocol" | "selectMachine"
>
const acceptedGraph = (outcome: Outcome<GraphOutcome>): GraphOutcome => {
  if ("result" in outcome || "failure" in outcome) return outcome
  throw new TypeError("Canonical did not accept a Graph result")
}
type SharedDriver = ReturnType<
  typeof createChildExecutionDriver<
    Input,
    Machine,
    GraphContinuation,
    GraphProjection,
    Request,
    GraphServiceReply,
    GraphOutcome,
    never,
    ServiceSession
  >
>
export type GraphDriver = Pick<
  SharedDriver,
  | "allocateInvocation"
  | "constructionFailed"
  | "cancel"
  | "acceptActions"
  | "acceptPublication"
  | "acceptPublicationOutcome"
  | "canonicalEvent"
  | "state"
  | "stats"
  | "resources"
> & { drive: (...args: Parameters<SharedDriver["drive"]>) => Promise<GraphOutcome> }
export function createGraphDriver(options: Options): GraphDriver {
  const shared = createChildExecutionDriver({ ...options, protocol: graphProtocol })
  const drive = shared.drive
  return Object.assign(shared, {
    drive: async (...args: Parameters<typeof drive>): Promise<GraphOutcome> => acceptedGraph(await drive(...args))
  })
}
