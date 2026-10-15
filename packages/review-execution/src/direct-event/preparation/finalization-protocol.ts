import * as Effect from "effect/Effect"
import type {
  Protocol,
  Session,
  ForeignReply,
  ForeignCommand
} from "@hapsland/canonical-policy/canonical/child-execution"
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
  readonly invocation: number
  readonly finalization: FinalizationInput
  readonly execution: Execution
}
export type FinalizationRequest = {
  readonly invocation: number
  readonly id: number
  readonly finalization: Step
  readonly binding: Binding
}
export type FinalizationReply =
  | { readonly $: "FinalizationReply"; readonly response: Response }
  | { readonly $: "FinalizationReply"; readonly step: Step; readonly response: Response }
  | { readonly $: "FinalizationReply"; readonly step: Step }
export type FinalizationMachine = ReturnType<typeof createFinalizationMachine>
export type FinalizationContinuation = {
  readonly kind: "finalization"
  readonly machine: FinalizationMachine
  readonly invocation: number
  readonly binding: Binding
  readonly step: Step
  readonly settled?: true
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
    disposeInvocation(_invocation: number) {},
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
    if (held.settled) return undefined
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
  resume(held, reply) {
    if (!("response" in reply)) return { ...held, step: reply.step, settled: true }
    const step = "step" in reply ? reply.step : held.step
    return { ...held, step: held.binding.resume(step, reply.response) }
  },
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

export const performFinalizationSync = (request: FinalizationRequest): ForeignReply<FinalizationReply> => {
  let step = request.finalization
  // The first request has already passed the protocol's advance checkpoint.
  let needsAdvance = false
  let nested: ReturnType<Binding["beginGroup"]>
  return {
    group: {
      checkpoints: "canonical",
      next(): ForeignCommand<FinalizationReply> {
        if (needsAdvance)
          return {
            kind: "checkpointed",
            perform() {
              const next = request.binding.advance(step)
              return {
                commit() {
                  if (next === undefined) needsAdvance = false
                  else step = next
                }
              }
            }
          }
        if (!("state" in step) && !("unit" in step))
          return { kind: "terminal", value: { $: "FinalizationReply", step } }
        nested ??= request.binding.beginGroup(step)
        if (nested !== undefined) {
          const command = nested.next()
          if (command.kind !== "terminal") return command
          return {
            kind: "checkpointed",
            perform() {
              return {
                commit() {
                  step = request.binding.resume(step, command.value, true)
                  nested = undefined
                  needsAdvance = true
                }
              }
            }
          }
        }
        return {
          kind: "checkpointed",
          perform() {
            const response = request.binding.performSync(step)
            if (response !== undefined)
              return {
                commit() {
                  step = request.binding.resume(step, response.value)
                  needsAdvance = true
                }
              }
            const pendingStep = step
            const engine = request.binding.performPending(pendingStep)
            const map = (value: unknown): FinalizationReply => ({
              $: "FinalizationReply",
              step: pendingStep,
              response: engine.map(value as boolean)
            })
            return Effect.isEffect(engine.pending) ? { effect: engine.pending, map } : { pending: engine.pending, map }
          }
        }
      }
    }
  }
}
export const performFinalizationAsync = async (request: FinalizationRequest): Promise<FinalizationReply> => {
  const engine = request.binding.performPending(request.finalization)
  if (Effect.isEffect(engine.pending)) throw new TypeError("Finalization Effect requires its caller-fiber port")
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
    input: { invocation: Number(BigInt(invocation)), finalization, execution },
    machine: createFinalizationMachine({ machine: core, canonicalGate }),
    revoke() {},
    close() {}
  }
}
