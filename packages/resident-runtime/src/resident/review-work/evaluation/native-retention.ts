import * as Effect from "effect/Effect"
import type { EvaluatedUnit } from "@hapsland/review-execution/direct-event/pipeline"
import { list } from "@hapsland/source-artifacts/direct-event/value/codec"
import type { Advice, AdviceInitial } from "../../state/advice-records.ts"
import type { JoinedReviewOutcome } from "../../state/joined-reviews.ts"
import type { AdviceReceipt, ProviderLease } from "../../state/resolver-custody/provider-authority.ts"
import type { createResidentOwnerTransaction } from "../../state/resolver-custody/resident-owner-transaction.mjs"
import type { createResidentPreparationDriver } from "../composition/preparation-driver.ts"
import type { Dependencies, EvaluationContext } from "./context.ts"
import type { Dependencies as DeliveryDependencies } from "../../advice-delivery/handoff/context.ts"
import type { EvaluationRetention, EvaluationRetentionCommand } from "./native-evaluation.ts"
import type { Response } from "./evaluation-core.js"
import post from "../preparation/post-preparation-core.js"
import { enrollAdvice } from "./advice-enrollment.ts"
import { observeRetainedAdvice } from "./retained-observation.ts"
import { createAdviceTailProvider } from "./advice-tail-provider.mjs"

export type EvaluationDependencies = Dependencies & Pick<DeliveryDependencies, "residentAdviceExpired">
type TailProvider = ReturnType<typeof createAdviceTailProvider>
type Transfer =
  | { readonly kind: "issued"; readonly receipt: AdviceReceipt }
  | { readonly kind: "constructed"; readonly receipt: AdviceReceipt; readonly provider: TailProvider; started: boolean }

export function createNativeEvaluationRetention(options: {
  readonly context: EvaluationContext & { readonly deps: EvaluationDependencies }
  readonly bridge: ReturnType<typeof createResidentOwnerTransaction>
  readonly driver: ReturnType<typeof createResidentPreparationDriver>
  readonly evaluation: () => EvaluatedUnit
}): EvaluationRetention & { finish(): Effect.Effect<void, unknown> } {
  const { context, bridge, driver } = options
  const { deps, job } = context
  const candidates = new Map<number, Advice>()
  const publications = new Map<number, { readonly advice: Advice; readonly outcomes: readonly JoinedReviewOutcome[] }>()
  let transfer: Transfer | undefined
  const tail = () => {
    if (transfer === undefined) throw new Error("Evaluation lacks its committed advice receipt")
    if (transfer.kind === "issued") {
      const provider = createAdviceTailProvider(transfer.receipt.invocation, bridge, transfer.receipt.capability, job, {
        deps,
        retirementForExpired: post.advice_retirement
      })
      transfer = { kind: "constructed", receipt: transfer.receipt, provider, started: false }
    }
    return transfer
  }
  const drive = Effect.fn("ResidentRuntime.evaluationAdviceTail")(function* (preserve: boolean) {
    const value = tail()
    if (value.started) return
    if (preserve) value.provider.preserve()
    value.started = true
    let result
    try {
      result = yield* driver.driveAdviceEffect(driver.adviceHandoff(value.receipt.invocation), value.provider, {
        signal: deps.residentLifetimeController.signal
      })
    } catch (error) {
      const cause = value.provider.handoffFailureCause ?? value.provider.terminationCause
      if (cause !== undefined) return yield* Effect.failCause(cause)
      throw error
    }
    if (!("adviceRetained" in result) || !result.adviceRetained) {
      const cause = value.provider.handoffFailureCause ?? value.provider.terminationCause
      if (cause !== undefined) return yield* Effect.failCause(cause)
      throw new Error("Evaluation advice tail did not accept its resource receipt")
    }
  })
  const perform = Effect.fn("ResidentRuntime.evaluationRetentionCommand")(function* (
    command: EvaluationRetentionCommand,
    lease: ProviderLease
  ): Effect.fn.Return<Response, unknown> {
    switch (command.$) {
      case "ReadAdviceCandidates": {
        candidates.clear()
        const current = yield* deps.residentAdvice()
        return {
          $: "AdviceCandidates",
          values: list(
            current.map((value, index) => {
              const handle = index + 1
              candidates.set(handle, value)
              return { $: "Candidate", handle, matching: value.evaluationKey === job.evaluationKey }
            })
          )
        }
      }
      case "PublishExisting": {
        const advice = candidates.get(command.advice)
        if (advice === undefined) throw new Error("Unknown captured advice capability")
        const outcomes = yield* deps.residentLedger.advice.publish(advice)
        const publication = publications.size + 1
        publications.set(publication, { advice, outcomes })
        return { $: "Published", publication }
      }
      case "RecordJoined": {
        const value = publications.get(command.publication)
        if (value === undefined) throw new Error("Unknown advice publication receipt")
        yield* deps.residentRecordJoinedOutcomes(value.outcomes, value.advice.id)
        return { $: "Ack" }
      }
      case "InsertAdvice": {
        const { initial, evaluation } = enrollAdvice(job, options.evaluation(), context)
        const handle = driver.prepareAdviceInput(lease.invocation, { unit: job, evaluation })
        try {
          yield* bridge.adviceInsertAndHandoff(lease, initial satisfies AdviceInitial, handle, (publication) => {
            const receipt = publication.adviceReceipt
            if (receipt === undefined) throw new Error("Advice birth lacks its Canonical receipt")
            transfer = { kind: "issued", receipt }
            tail()
          })
        } finally {
          driver.releaseAdviceInput(handle)
        }
        return { $: "AdviceInserted", tail: tail().receipt.invocation }
      }
      case "ObserveRetained": {
        const value = tail()
        if (command.tail !== value.receipt.invocation) throw new Error("Wrong retained advice observation")
        observeRetainedAdvice(
          post,
          { unit: job, evaluation: options.evaluation(), receipt: value.receipt },
          () => deps.inspection
        )
        return { $: "Ack" }
      }
      case "PreserveAdviceTail":
      case "DriveAdviceTail": {
        if (command.tail !== tail().receipt.invocation) throw new Error("Wrong advice handoff capability")
        yield* drive(command.$ === "PreserveAdviceTail")
        return { $: "Ack" }
      }
      default: {
        const exhaustive: never = command
        return exhaustive
      }
    }
  })
  return {
    perform,
    transferred: () => transfer !== undefined,
    finish: () => Effect.suspend(() => (transfer === undefined ? Effect.void : drive(false)))
  }
}
