import type { Protocol, Session } from "@hapsland/canonical-policy/canonical/child-execution"
import type { createPreparationMachine } from "./preparation-dispatcher.ts"

export type PreparationMachine = ReturnType<typeof createPreparationMachine>
export type PreparationInvocation = Parameters<PreparationMachine["initial"]>[0]
export type PreparationContinuation = {
  readonly kind: "preparation"
  readonly machine: PreparationMachine
  readonly step: ReturnType<PreparationMachine["initial"]>
}
export type PreparationProjection = {
  readonly kind: "preparation"
  readonly machine: PreparationMachine
  readonly view: ReturnType<PreparationMachine["view"]>
}
export type PreparationRequest = Extract<PreparationProjection["view"], { $: "Types.AwaitService" }>["request"]
export type PreparationReply = Parameters<PreparationMachine["resume"]>[1]["reply"]
export type PreparationAccepted = ReturnType<PreparationMachine["accepted"]>
export type PreparationResult = Extract<PreparationProjection["view"], { $: "PreparationFinished" }>["result"]

// One existing Preparation correlation protocol, used by both resident and
// public composition. Canonical retains the action loop and native custody.
export const preparationProtocol: Protocol<
  PreparationInvocation,
  PreparationMachine,
  PreparationContinuation,
  PreparationProjection,
  PreparationRequest,
  PreparationReply,
  PreparationAccepted,
  PreparationResult,
  Session
> = {
  initial: (machine, input) => ({ kind: "preparation", machine, step: machine.initial(input) }),
  view: (held) => ({ kind: "preparation", machine: held.machine, view: held.machine.view(held.step) }),
  resume: (held, reply) => ({ ...held, step: held.machine.resume(held.step, { $: "Types.ServiceReply", reply }) }),
  awaitRequest(projected) {
    if (projected.view.$ !== "Types.AwaitService") return undefined
    const request = projected.view.request
    if (typeof request.invocation !== "number" || typeof request.id !== "number")
      throw new TypeError("Provider request requires exact Bend Nat identifiers")
    return request
  },
  installation: () => ({ method: "install" }),
  terminal: (projected, scope) =>
    scope.$ === "PreparationScope"
      ? projected.view.$ === "PreparationFinished"
        ? "terminal_preparation"
        : "terminal_preparation_failed"
      : "terminal",
  accepted: (projected) => projected.machine.accepted(projected.view),
  preparation(projected) {
    if (projected.view.$ !== "PreparationFinished") throw new Error("Invalid preparation handoff payload")
    return projected.view.result
  },
  projectTerminal: (outcome) => outcome
}
