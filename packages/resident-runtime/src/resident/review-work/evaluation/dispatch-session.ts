import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import type * as Cause from "effect/Cause"
import type { ForeignOptions, ForeignReply } from "@hapsland/canonical-policy/canonical/child-execution"
import type { ProviderLease } from "../../state/resolver-custody/provider-authority.ts"
import core, {
  type Step,
  type Command,
  type Response,
  type Request,
  type Terminal
} from "./evaluation-dispatch-core.js"

export type DispatchInput = { readonly invocation: number; readonly evaluationDispatch: true }
export type DispatchRequest = Request & { readonly evaluationDispatch: true }
export type DispatchReply = {
  readonly $: "DispatchReply"
  readonly invocation: number
  readonly id: number
  readonly request: DispatchRequest
  readonly response: Response
}
export type DispatchView =
  | { readonly $: "DispatchAwait"; readonly request: DispatchRequest }
  | { readonly $: "DispatchDone"; readonly result: Terminal }
export type DispatchAccepted = { readonly dispatch: Terminal }

export function createEvaluationDispatchSession(options: {
  readonly invocation: number
  readonly perform: (command: Command, lease: ProviderLease) => Effect.Effect<Response, unknown>
}) {
  const { invocation } = options
  const input: DispatchInput = { invocation, evaluationDispatch: true }
  let installed = core.initial(invocation)
  let request: DispatchRequest | undefined
  let offered: DispatchReply | undefined
  let consumed = false,
    revoked = false
  const causes = new Map<number, Cause.Cause<unknown>>()
  const machine = {
    kind: "dispatch" as const,
    initial(actual: DispatchInput): Step {
      if (actual !== input) throw new Error("Wrong dispatch input capability")
      return installed
    },
    view(step: Step): DispatchView {
      if (step !== installed) throw new Error("Stale dispatch continuation")
      if (step.$ !== "Await") return { $: "DispatchDone", result: step }
      if (step.invocation !== invocation || step.request.invocation !== invocation || step.request.id !== step.id)
        throw new Error("Wrong dispatch command correlation")
      request ??= { ...step.request, evaluationDispatch: true }
      return { $: "DispatchAwait", request }
    },
    resume(step: Step, reply: DispatchReply): Step {
      if (
        step !== installed ||
        reply !== offered ||
        reply.request !== request ||
        reply.invocation !== invocation ||
        reply.id !== request?.id ||
        revoked
      )
        throw new Error("Wrong dispatch continuation reply")
      installed = core.resume(step, { $: "Reply", invocation, id: reply.id, response: reply.response })
      request = undefined
      offered = undefined
      consumed = false
      return installed
    },
    accepted(view: DispatchView): DispatchAccepted {
      if (view.$ !== "DispatchDone" || view.result !== installed) throw new Error("Unaccepted dispatch result")
      return { dispatch: view.result }
    },
    disposeInvocation(actual: number) {
      if (actual !== invocation) throw new Error("Wrong dispatch disposal invocation")
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
      revoked = true
    },
    cause(token: number) {
      const cause = causes.get(token)
      if (cause === undefined) throw new Error("Unknown dispatch failure token")
      return cause
    },
    foreign(held: DispatchRequest, execution: ForeignOptions): ForeignReply<DispatchReply> {
      let completed: Exit.Exit<Response, unknown> | undefined
      return {
        effect: Effect.suspend(() => {
          if (revoked || consumed || held !== request || installed.$ !== "Await" || held.id !== installed.id)
            throw new Error("Stale or consumed dispatch provider request")
          const lease = execution.ownerLease
          if (!lease || lease.invocation !== invocation || lease.request !== held.id)
            throw new Error("Dispatch command lacks exact Canonical lease")
          consumed = true
          return Effect.exit(options.perform(held.command, lease)).pipe(
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
          if (exit === undefined) throw new Error("Dispatch result missing or already consumed")
          let response: Response
          if (Exit.isFailure(exit)) {
            const token = causes.size + 1
            causes.set(token, exit.cause)
            response = { $: "Failed", token }
          } else response = exit.value
          offered = { $: "DispatchReply", invocation, id: held.id, request: held, response }
          return offered
        }
      }
    }
  }
}
export type DispatchSession = ReturnType<typeof createEvaluationDispatchSession>
export type DispatchMachine = DispatchSession["machine"]
