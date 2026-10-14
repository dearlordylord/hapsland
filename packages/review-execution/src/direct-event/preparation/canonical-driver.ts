import {
  finalizationProtocol,
  type FinalizationInvocation,
  type FinalizationMachine,
  type FinalizationContinuation,
  type FinalizationProjection,
  type FinalizationRequest,
  type FinalizationReply
} from "./finalization-protocol.ts"
import { createChildExecutionDriver } from "@hapsland/canonical-policy/canonical/child-execution"
import type { Protocol } from "@hapsland/canonical-policy/canonical/child-execution"
import { graphProtocol } from "@hapsland/source-analysis/direct-event/graph-resolution/composition"
import type { createBendResolver, GraphServiceReply } from "@hapsland/source-analysis/direct-event/graph-resolution"
import type { createPhysicalPreparationCapability } from "./physical-effects.mjs"
import {
  preparationProtocol,
  type PreparationInvocation,
  type PreparationMachine,
  type PreparationContinuation,
  type PreparationProjection,
  type PreparationRequest,
  type PreparationReply,
  type PreparationAccepted,
  type PreparationResult
} from "./canonical-protocol.ts"

type GraphMachine = Parameters<typeof graphProtocol.initial>[0]
type GraphInput = Parameters<typeof graphProtocol.initial>[1]
type GraphContinuation = ReturnType<typeof graphProtocol.initial>
type GraphProjection = ReturnType<typeof graphProtocol.view>
type GraphRequest = Exclude<ReturnType<typeof graphProtocol.awaitRequest>, undefined>
type GraphAccepted = ReturnType<typeof graphProtocol.accepted>
export type GraphSession = Parameters<Parameters<typeof createBendResolver>[0]["drive"]>[0]
export type PreparationSession = {
  readonly invocation: number
  readonly input: PreparationInvocation
  readonly machine: PreparationMachine
  perform: ReturnType<typeof createPhysicalPreparationCapability>["perform"]
  revoke(): void
  close(): void
}
export type FinalizationSession = {
  readonly invocation: number
  readonly input: FinalizationInvocation
  readonly machine: FinalizationMachine
  revoke(): void
  close(): void
}
export type PublicPreparationSession = PreparationSession | GraphSession | FinalizationSession
export type PublicPreparationRequest = PreparationRequest | GraphRequest | FinalizationRequest
export type PublicPreparationReply = PreparationReply | GraphServiceReply | FinalizationReply
type Machine = PreparationMachine | GraphMachine | FinalizationMachine
type Input = PreparationInvocation | GraphInput | FinalizationInvocation
type Continuation = PreparationContinuation | GraphContinuation | FinalizationContinuation
type Projection = PreparationProjection | GraphProjection | FinalizationProjection
type Accepted =
  | PreparationAccepted
  | GraphAccepted
  | { readonly finalization: readonly import("./preparation-finalization.ts").FinalizedOutcome[] }

// Composition of the two existing protocols; the sole shared Canonical driver
// owns publication, provider leases, cancellation, acceptance and finalization.
const protocol: Protocol<
  Input,
  Machine,
  Continuation,
  Projection,
  PublicPreparationRequest,
  PublicPreparationReply,
  Accepted,
  PreparationResult,
  PublicPreparationSession
> = {
  initialSignalCheckpoint: (machine) => (machine.kind === "finalization" ? "protocol" : "executor"),
  synchronousAdvance: (held) =>
    held.kind === "finalization" ? finalizationProtocol.synchronousAdvance!(held, {}) : undefined,
  initial(machine, input) {
    if (machine.kind === "finalization") {
      if (!("finalization" in input)) throw new TypeError("Wrong finalization input binding")
      return finalizationProtocol.initial(machine, input)
    }
    if (machine.kind === "preparation") {
      if (!("preparation" in input)) throw new TypeError("Wrong preparation input binding")
      return preparationProtocol.initial(machine, input)
    }
    if (!("$" in input) || input.$ !== "Types.ResolverInput") throw new TypeError("Wrong artifact input binding")
    return graphProtocol.initial(machine, input)
  },
  view: (held) =>
    held.kind === "finalization"
      ? finalizationProtocol.view(held)
      : held.kind === "preparation"
        ? preparationProtocol.view(held)
        : graphProtocol.view(held),
  resume(held, reply) {
    if (held.kind === "finalization") {
      if (reply.$ !== "FinalizationReply") throw new TypeError("Wrong finalization reply binding")
      return finalizationProtocol.resume(held, reply)
    }
    if (reply.$ === "FinalizationReply") throw new TypeError("Unexpected finalization reply")
    if (held.kind === "preparation") {
      if (reply.$ === "Types.Reply") throw new TypeError("Wrong preparation reply binding")
      return preparationProtocol.resume(held, reply)
    }
    if (reply.$ !== "Types.Reply") throw new TypeError("Wrong artifact reply binding")
    return graphProtocol.resume(held, reply)
  },
  awaitRequest: (projected) =>
    projected.kind === "finalization"
      ? finalizationProtocol.awaitRequest(projected)
      : projected.kind === "preparation"
        ? preparationProtocol.awaitRequest(projected)
        : graphProtocol.awaitRequest(projected),
  installation: () => ({ method: "install" }),
  terminal: (projected, scope) =>
    projected.kind === "finalization"
      ? finalizationProtocol.terminal(projected, scope)
      : projected.kind === "preparation"
        ? preparationProtocol.terminal(projected, scope)
        : graphProtocol.terminal(projected, scope),
  accepted: (projected) =>
    projected.kind === "finalization"
      ? finalizationProtocol.accepted(projected)
      : projected.kind === "preparation"
        ? preparationProtocol.accepted(projected)
        : graphProtocol.accepted(projected),
  preparation(projected) {
    if (projected.kind !== "preparation") throw new TypeError("Graph cannot produce a preparation handoff")
    return preparationProtocol.preparation(projected)
  },
  projectTerminal(outcome, session) {
    if ("input" in session) return outcome
    if ("result" in outcome)
      return graphProtocol.projectTerminal({ result: outcome.result, finalFrame: outcome.finalFrame }, session)
    if ("failure" in outcome && outcome.failure !== undefined && "$" in outcome.failure)
      return graphProtocol.projectTerminal({ failure: outcome.failure }, session)
    return outcome
  }
}

type Options = Omit<
  Parameters<
    typeof createChildExecutionDriver<
      Input,
      Machine,
      Continuation,
      Projection,
      PublicPreparationRequest,
      PublicPreparationReply,
      Accepted,
      PreparationResult,
      PublicPreparationSession
    >
  >[0],
  "protocol"
>
export function createPublicPreparationDriver(options: Options) {
  return createChildExecutionDriver({ ...options, protocol })
}
