import * as Effect from "effect/Effect"
import * as Clock from "effect/Clock"
import type { resolveCredential } from "@hapsland/credential-storage/credentials/owner"
import { claimDemoBudget } from "@hapsland/activity-observation/activity/demo-budget"
import { encodedPreparedProviderInputBytes } from "@hapsland/review-execution/direct-event/pipeline"
import { readCredentialState } from "@hapsland/runtime-inputs/credentials/state"
import type { EvaluationContext } from "./context.ts"
import type { JevRequestIdentity } from "../request-observation.ts"
import type { createResidentPreparationDriver } from "../composition/preparation-driver.ts"
import type { createResidentOwnerTransaction } from "../../state/resolver-custody/resident-owner-transaction.mjs"
import type { ProviderLease } from "../../state/resolver-custody/provider-authority.ts"
import type { Command, Response } from "./evaluation-dispatch-core.js"
import { createEvaluationDispatchSession, type DispatchSession } from "./dispatch-session.ts"
import { recordRequestObservation } from "./observation.ts"

export function makeEvaluationDispatchCallback(options: {
  readonly context: Pick<
    EvaluationContext<"residentLedger" | "residentObserveJevRequest" | "residentRecordAnalytics">,
    "deps" | "job" | "signal"
  >
  readonly identity: JevRequestIdentity
  readonly request: number
  readonly credential: () => Effect.Success<ReturnType<typeof resolveCredential>> | undefined
  readonly parent: ProviderLease
  readonly bridge: Pick<ReturnType<typeof createResidentOwnerTransaction>, "evaluationStart">
  readonly driver: Pick<
    ReturnType<typeof createResidentPreparationDriver>,
    "allocateEvaluationDispatchInvocation" | "driveConstructedEffect" | "constructionFailed"
  >
}) {
  const { context, driver, bridge, request } = options
  const { job, deps } = context
  const ack = (): Response => ({ $: "Ack" })
  const flag = (value: boolean): Response => ({ $: "Flag", value })
  const perform = Effect.fn("ResidentRuntime.evaluationDispatchCommand")(function* (
    command: Command,
    lease: ProviderLease
  ): Effect.fn.Return<Response, unknown> {
    switch (command.$) {
      case "CheckCredentialGeneration": {
        const credential = options.credential()
        if (credential?.status !== "present") return flag(true)
        const current = readCredentialState(job.dispatch.credential?.statePath)
        return flag(
          current.generation === credential.generation &&
            (credential.source === "environment" || !current.savedUseSuspended)
        )
      }
      case "ClaimDemoBudget":
        if (job.dispatch.demoBudgetPath != null) {
          const now = yield* Clock.currentTimeMillis
          yield* Effect.try(() =>
            claimDemoBudget(
              job.dispatch.demoBudgetPath ?? "",
              job.observation.root,
              encodedPreparedProviderInputBytes(job.prepared),
              now
            )
          )
        }
        return ack()
      case "StartRequest": {
        const result = yield* bridge.evaluationStart(lease, {
          partition: job.partition,
          operation: job.canonicalOperationId,
          round: job.canonicalRound,
          reservation: job.reservation
        })
        if (result.value) job.requestStarted = true
        return flag(result.value)
      }
      case "ObserveStarted":
        yield* recordRequestObservation({ ...context, identity: options.identity }, "started", request)
        return ack()
      case "ReadAborted":
        return flag(context.signal.aborted)
      case "InterruptRequest":
        return flag(yield* deps.residentLedger.interruptJevRequest(job.partition, job.canonicalOperationId, request))
      case "ObserveInterrupted":
        yield* recordRequestObservation({ ...context, identity: options.identity }, "interrupted", request)
        return ack()
      default: {
        const exhaustive: never = command.$
        return exhaustive
      }
    }
  })
  return Effect.suspend(() => {
    let session: DispatchSession | undefined
    return driver
      .driveConstructedEffect(() => {
        const invocation = driver.allocateEvaluationDispatchInvocation({
          $: "Parent",
          invocation: options.parent.invocation,
          generation: options.parent.generation,
          request: options.parent.request
        })
        try {
          session = createEvaluationDispatchSession({ invocation, perform })
          return { session, input: session.input }
        } catch (error) {
          driver.constructionFailed(invocation)
          throw error
        }
      })
      .pipe(
        Effect.flatMap((outcome) => {
          if ("failure" in outcome) return Effect.interrupt
          switch (outcome.dispatch.$) {
            case "Dispatched":
              return Effect.void
            case "CredentialChanged":
              return Effect.fail(new Error("credential generation changed before provider dispatch"))
            case "StartRefused":
              return Effect.die(new Error("canonical Jev request start refused"))
            case "Aborted": {
              if (session === undefined) throw new Error("Dispatch result lost its native session")
              return Effect.failCause(session.cause(outcome.dispatch.token))
            }
            case "Rejected":
              return Effect.die(new Error("Rejected dispatch continuation"))
          }
        })
      )
  })
}
