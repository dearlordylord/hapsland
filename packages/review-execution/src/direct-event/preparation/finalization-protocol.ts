import type { Protocol, Session } from "@hapsland/canonical-policy/canonical/child-execution"
import core from "./preparation-finalization-core.js"
import type { Step, Response } from "./preparation-finalization-core.js"
import {
  createPreparationFinalizationExecution,
  type FinalizationInput,
  type FinalizedOutcome,
  type Execution,
  type CanonicalRuleGate
} from "./preparation-finalization.ts"

type Binding = ReturnType<ReturnType<typeof createPreparationFinalizationExecution>>
export type FinalizationInvocation = {
  readonly invocation: bigint
  readonly finalization: FinalizationInput
  readonly execution: Execution
}
export type FinalizationRequest = {
  readonly invocation: bigint
  readonly id: bigint
  readonly finalization: Step
  readonly binding: Binding
}
export type FinalizationReply = { readonly $: "FinalizationReply"; readonly response: Response }
export type FinalizationMachine = ReturnType<typeof createFinalizationMachine>
export type FinalizationContinuation = {
  readonly kind: "finalization"
  readonly machine: FinalizationMachine
  readonly invocation: bigint
  readonly binding: Binding
  readonly step: Step
}
export type FinalizationProjection = {
  readonly kind: "finalization"
  readonly view:
    | { readonly $: "Types.AwaitService"; readonly request: FinalizationRequest }
    | { readonly $: "FinalizationFinished"; readonly result: readonly FinalizedOutcome[] }
}

// This adapter holds only invocation-local engine facts and exception identity.
// Canonical's common driver owns transitions, leases and terminal acceptance.
export function createFinalizationMachine(engines: Parameters<typeof createPreparationFinalizationExecution>[0]) {
  const createExecution = createPreparationFinalizationExecution(engines)
  return {
    kind: "finalization" as const,
    retainedHandles: 0,
    disposeInvocation(_invocation: bigint) {},
    initial(input: FinalizationInvocation): FinalizationContinuation {
      const binding = createExecution({ ...input.finalization, invocation: input.invocation }, input.execution)
      return { kind: "finalization", machine: this, invocation: input.invocation, binding, step: binding.initial() }
    }
  }
}

export const finalizationProtocol: Protocol<
  FinalizationInvocation,
  FinalizationMachine,
  FinalizationContinuation,
  FinalizationProjection,
  FinalizationRequest,
  FinalizationReply,
  { readonly finalization: readonly FinalizedOutcome[] },
  never,
  Session
> = {
  initialSignalCheckpoint: () => "protocol",
  initial: (machine, input) => machine.initial(input),
  synchronousAdvance(held) {
    const next = held.binding.advance(held.step)
    return next === undefined ? undefined : { ...held, step: next }
  },
  view(held) {
    const result = held.binding.accepted(held.step)
    if (result !== undefined) return { kind: "finalization", view: { $: "FinalizationFinished", result } }
    const step = held.step
    if (!("state" in step) && !("unit" in step)) throw new TypeError("Invalid finalization request boundary")
    const state = "state" in step ? step.state : step.unit.state
    return {
      kind: "finalization",
      view: {
        $: "Types.AwaitService",
        request: { invocation: held.invocation, id: state.request, finalization: step, binding: held.binding }
      }
    }
  },
  resume: (held, reply) => ({ ...held, step: held.binding.resume(held.step, reply.response) }),
  awaitRequest: (projected) => (projected.view.$ === "Types.AwaitService" ? projected.view.request : undefined),
  installation: () => ({ method: "install" }),
  terminal: () => "terminal",
  accepted(projected) {
    if (projected.view.$ !== "FinalizationFinished") throw new TypeError("Finalization was not completed")
    return { finalization: projected.view.result }
  },
  preparation() {
    throw new TypeError("Finalization cannot issue a preparation handoff")
  },
  projectTerminal: (outcome) => outcome
}

export const performFinalizationSync = (request: FinalizationRequest) => {
  const response = request.binding.performSync(request.finalization)
  if (response !== undefined) return { value: { $: "FinalizationReply" as const, response: response.value } }
  const engine = request.binding.performPending(request.finalization)
  return {
    pending: engine.pending,
    map: (value: unknown): FinalizationReply => ({ $: "FinalizationReply", response: engine.map(value as boolean) })
  }
}
export const performFinalizationAsync = async (request: FinalizationRequest): Promise<FinalizationReply> => {
  const engine = request.binding.performPending(request.finalization)
  return { $: "FinalizationReply", response: engine.map(await engine.pending) }
}

export type FinalizationSession = {
  readonly invocation: number
  readonly input: FinalizationInvocation
  readonly machine: FinalizationMachine
  revoke(): void
  close(): void
}
export function createFinalizationSession(
  invocation: number,
  finalization: FinalizationInput,
  execution: Execution,
  canonicalGate: CanonicalRuleGate
): FinalizationSession {
  return {
    invocation,
    input: { invocation: BigInt(invocation), finalization, execution },
    machine: createFinalizationMachine({ machine: core, canonicalGate }),
    revoke() {},
    close() {}
  }
}
