import { withinWork } from "../../work-ownership/cancellation.ts"
import {
  effectNative,
  nativeFailureAggregate,
  type NativeFlow,
  withNativeSignal
} from "@hapsland/runtime-environment/runtime/native-execution"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Cause from "effect/Cause"
import type { ForeignOptions, ForeignReply } from "@hapsland/canonical-policy/canonical/child-execution"
import type { ProviderLease } from "../../state/resolver-custody/provider-authority.ts"
import core, {
  type Step,
  type Command,
  type Response,
  type Request,
  type Completion,
  type Input
} from "./evaluation-core.js"

export type EvaluationInput = { readonly invocation: number; readonly evaluation: true }
export type EvaluationRequest = Request & { readonly evaluation: true }
export type EvaluationReply = {
  readonly $: "EvaluationReply"
  readonly invocation: number
  readonly id: number
  readonly request: EvaluationRequest
  readonly response: Response
}
export type EvaluationView =
  | { readonly $: "EvaluationAwait"; readonly request: EvaluationRequest }
  | { readonly $: "EvaluationDone"; readonly result: Completion }
export type EvaluationAccepted = { readonly evaluation: Completion }

export function createEvaluationSession(options: {
  readonly invocation: number
  readonly mode: { readonly kind: "root"; readonly input: Input } | { readonly kind: "cleanup" }
  readonly workSignal: AbortSignal
  readonly finish: (cancelled: boolean) => Effect.Effect<void, unknown>
  readonly perform: (command: Command, lease: ProviderLease) => Effect.Effect<Response, unknown>
}) {
  const { invocation } = options
  const input: EvaluationInput = { invocation, evaluation: true }
  let installed =
    options.mode.kind === "root" ? core.initial(options.mode.input, invocation) : core.cleanup_initial(invocation)
  let request: EvaluationRequest | undefined
  let offered: EvaluationReply | undefined
  let consumed = false,
    revoked = false,
    closed = false,
    unacceptedFaultReported = false
  const causes = new Map<number, Cause.Cause<unknown>>()
  const machine = {
    kind: "evaluation" as const,
    mode: options.mode.kind,
    initial(actual: EvaluationInput): Step {
      if (actual !== input) throw new Error("Wrong evaluation input capability")
      return installed
    },
    view(step: Step): EvaluationView {
      if (step !== installed) throw new Error("Stale evaluation continuation")
      if (step.$ === "FinishedEvaluation") return { $: "EvaluationDone", result: step.result }
      if (step.$ !== "Await") throw new Error("Rejected evaluation continuation")
      if (step.invocation !== invocation || step.request.invocation !== invocation || step.request.id !== step.id)
        throw new Error("Wrong evaluation command correlation")
      request ??= { ...step.request, evaluation: true }
      return { $: "EvaluationAwait", request }
    },
    resume(step: Step, reply: EvaluationReply): Step {
      if (
        step !== installed ||
        reply !== offered ||
        reply.request !== request ||
        reply.invocation !== invocation ||
        reply.id !== request?.id ||
        revoked
      )
        throw new Error("Wrong evaluation continuation reply")
      installed = core.resume(step, { $: "Reply", invocation, id: reply.id, response: reply.response })
      request = undefined
      offered = undefined
      consumed = false
      return installed
    },
    accepted(view: EvaluationView): EvaluationAccepted {
      if (view.$ !== "EvaluationDone" || installed.$ !== "FinishedEvaluation" || view.result !== installed.result)
        throw new Error("Unaccepted evaluation result")
      return { evaluation: view.result }
    },
    disposeInvocation(actual: number) {
      if (actual !== invocation) throw new Error("Wrong evaluation disposal invocation")
    },
    retainedHandles: 0
  }
  return {
    invocation,
    input,
    machine,
    revoke() {
      revoked = true
    },
    close() {
      closed = true
    },
    *finishFlow(): NativeFlow<unknown> {
      if (revoked && installed.$ === "FinishedEvaluation" && !unacceptedFaultReported) {
        unacceptedFaultReported = true
        const failure = yield effectNative(Effect.exit(this.completion(installed.result)), false)
        if (!Exit.isExit(failure)) throw new TypeError("Missing unaccepted evaluation Exit")
        if (Exit.isFailure(failure))
          throw nativeFailureAggregate([], "Unaccepted evaluation failure", undefined, failure.cause)
      }
      const exit = yield effectNative(Effect.exit(options.finish(revoked)), false)
      if (!Exit.isExit(exit)) throw new TypeError("Missing evaluation cleanup Exit")
      if (Exit.isFailure(exit))
        throw nativeFailureAggregate([], "Evaluation native cleanup failed", undefined, exit.cause)
      return exit.value
    },
    cause(token: number) {
      const cause = causes.get(token)
      if (cause === undefined) throw new Error("Unknown evaluation failure token")
      return cause
    },
    completion(result: Completion): Effect.Effect<void, unknown> {
      const combined = (tokens: Completion["task_faults"]): Cause.Cause<unknown> | undefined => {
        let cause: Cause.Cause<unknown> | undefined
        while (tokens.$ === "Con") {
          const next = causes.get(tokens.head)
          if (next === undefined) throw new Error("Unknown evaluation completion failure")
          cause = cause === undefined ? next : Cause.combine(cause, next)
          tokens = tokens.tail
        }
        return cause
      }
      const task = combined(result.task_faults),
        final = combined(result.final_faults)
      const failed: Effect.Effect<void, unknown> = task === undefined ? Effect.void : Effect.failCause(task)
      const projected: Effect.Effect<void, unknown> =
        options.mode.kind === "root" ? failed.pipe(Effect.catch(() => Effect.void)) : failed
      return Effect.exit(projected).pipe(
        Effect.flatMap((exit) => {
          if (final !== undefined)
            return Effect.failCause(Exit.isFailure(exit) ? Cause.combine(exit.cause, final) : final)
          return Exit.isFailure(exit) ? Effect.failCause(exit.cause) : Effect.void
        })
      )
    },
    foreign(held: EvaluationRequest, execution: ForeignOptions): ForeignReply<EvaluationReply> {
      let completed: Exit.Exit<Response, unknown> | undefined
      return {
        effect: Effect.suspend(() => {
          if (revoked || closed || consumed || held !== request || installed.$ !== "Await" || held.id !== installed.id)
            throw new Error("Stale or consumed evaluation provider request")
          const lease = execution.ownerLease
          if (!lease || lease.invocation !== invocation || lease.request !== held.id)
            throw new Error("Evaluation command lacks exact Canonical lease")
          consumed = true
          const work = options.perform(held.command, lease)
          const scoped = held.signal.$ === "WorkSignal" ? withinWork(work, options.workSignal) : work
          return Effect.exit(withNativeSignal(scoped, execution.signal)).pipe(
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
          if (exit === undefined) throw new Error("Evaluation result missing or already consumed")
          let response: Response
          if (Exit.isFailure(exit)) {
            const token = causes.size + 1
            causes.set(token, exit.cause)
            response = { $: "Failed", token }
          } else response = exit.value
          offered = { $: "EvaluationReply", invocation, id: held.id, request: held, response }
          return offered
        }
      }
    }
  }
}
export type EvaluationSession = ReturnType<typeof createEvaluationSession>
export type EvaluationMachine = EvaluationSession["machine"]
