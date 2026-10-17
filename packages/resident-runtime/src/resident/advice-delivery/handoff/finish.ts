import * as Effect from "effect/Effect"
import { type ResidentRequest, type ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import { list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import { recipientPartition } from "../../recipient/identity.ts"
import type { RoundWork } from "../../state/round-records.ts"
import { type Dependencies } from "./context.ts"
import core, {
  type RCommand,
  type RResponse,
  type RReason,
  type RSnapshot,
  type RPending,
  type RInput,
  type RStep
} from "./handoff-core.js"

const finishReason = (reason: RReason): "deadline" | "unavailable" | "no-advice" => {
  switch (reason.$) {
    case "RNoAdvice":
      return "no-advice"
    case "RDeadline":
      return "deadline"
    case "RUnavailable":
      return "unavailable"
  }
}

type FinishDependencies = Pick<
  Dependencies,
  "releaseDelivery" | "residentAllowFinish" | "residentComposedDelivery" | "residentLedger" | "residentNow"
>

// One native capability session serves reservation and reconciliation. Bend
// owns selection, binding, branch order and the different decision outcomes.
export const makeResidentFinishSession = (
  deps: FinishDependencies,
  request: ResidentRequest,
  provisional: ResidentResponse,
  final: ResidentResponse,
  canWrite: boolean
) => {
  let round: RoundWork | undefined
  let snapshots: Effect.Success<ReturnType<typeof deps.residentLedger.advice.snapshots>> = []
  let now: number | undefined
  const finishRequest = () => {
    if (request.operation !== "collect" || request.finish === undefined)
      throw new Error("missing finish request capability")
    return { advicee: request.advicee, finish: request.finish }
  }
  const provisionalAdvice = () => {
    if (provisional.status !== "advice") throw new Error("missing provisional advice capability")
    return provisional
  }
  const group = () => recipientPartition(finishRequest().advicee)
  const native = Effect.fn("ResidentRuntime.reconcileFinishCommand")(function* (
    command: RCommand
  ): Effect.fn.Return<RResponse> {
    switch (command.$) {
      case "RRevoke": {
        const collect = finishRequest()
        return {
          $: "RTruth",
          value: yield* deps.residentComposedDelivery.revokeProvisionalFinishOutput(
            group(),
            collect.finish.token,
            provisionalAdvice().token
          )
        }
      }
      case "RRound":
        round = yield* deps.residentLedger.rounds.get(group())
        return { $: "RTruth", value: round !== undefined }
      case "RSnapshots":
        snapshots = yield* deps.residentLedger.advice.snapshots()
        if (final.status !== "advice") throw new Error("missing final advice capability")
        return {
          $: "RSnapshotValues",
          values: list(
            snapshots.map<RSnapshot>(({ capability: advice, content }, handle) => ({
              $: "RSnapshot",
              handle,
              owned: content.delivery?.token === final.token,
              same_round: advice.round === round,
              work: advice.workUnitId !== undefined,
              delivery: content.delivery !== undefined,
              count: content.delivery?.findings.length ?? 0,
              operation: advice.canonicalOperationId
            }))
          )
        }
      case "RPendingFindings":
        return {
          $: "RPendingValues",
          values: list(
            (yield* deps.residentLedger.canonicalProjection()).pendingFindings.map<RPending>((item) => ({
              $: "RPending",
              operation: item.operation,
              count: item.count
            }))
          )
        }
      case "RClock":
        now = deps.residentNow()
        return { $: "RAck" }
      case "RDecide": {
        const collect = finishRequest()
        if (now === undefined) throw new Error("finish clock not captured")
        const selected = unlist(command.selected).map((handle) => {
          const snapshot = snapshots[handle]
          if (snapshot === undefined) throw new Error("invalid finish snapshot capability")
          return {
            id: snapshot.capability.id,
            unit: snapshot.capability.canonicalOperationId,
            findings: snapshot.content.delivery?.findings ?? []
          }
        })
        const output = yield* deps.residentComposedDelivery.decideFinishOutput(
          group(),
          collect.finish.token,
          final.status === "advice" ? final.token : "",
          selected,
          now,
          final.status === "advice" && final.findingCount === 0,
          command.provisional,
          command.can_write,
          command.binding,
          collect.finish.deadlineReached
        )
        switch (output.kind) {
          case "reserved":
            return { $: "RDecided", decision: { $: "RReserved" } }
          case "notices":
            return { $: "RDecided", decision: { $: "RNotices" } }
          case "failed":
            return { $: "RDecided", decision: { $: "RFailed" } }
          case "allowed":
            return {
              $: "RDecided",
              decision: {
                $: "RAllowed",
                reason: {
                  $:
                    output.reason === "deadline"
                      ? "RDeadline"
                      : output.reason === "no-advice"
                        ? "RNoAdvice"
                        : "RUnavailable"
                }
              }
            }
        }
      }
      case "RRelease":
        if (command.provisional) yield* deps.releaseDelivery(provisionalAdvice().token)
        else {
          if (final.status !== "advice") throw new Error("missing final delivery capability")
          yield* deps.releaseDelivery(final.token)
        }
        return { $: "RAck" }
      case "RAllow":
        yield* deps.residentAllowFinish(group(), finishRequest().finish.token, finishReason(command.reason))
        return { $: "RAck" }
    }
  })
  const input: RInput = {
    $: "RInput",
    finish: request.operation === "collect" && request.finish !== undefined,
    provisional_findings: provisional.status === "advice" && provisional.findingCount > 0,
    advice: final.status === "advice",
    findings: final.status === "advice" ? final.findingCount : 0,
    can_write: canWrite,
    same_token: final.status === "advice" && provisional.status === "advice" && final.token === provisional.token
  }
  return {
    input,
    perform: native,
    decode: (step: RStep): ResidentResponse => {
      switch (step.$) {
        case "RFinal":
          return final
        case "REmpty":
          return { status: "empty" }
        case "RRejected":
          throw new Error("Bend finish refused native reply")
        case "RAwait":
          throw new Error("Bend finish is not terminal")
      }
    }
  }
}

const driveFinish = Effect.fn("ResidentRuntime.finishCursor")(function* (
  session: ReturnType<typeof makeResidentFinishSession>,
  initial: RStep
) {
  let step = initial
  while (step.$ === "RAwait") {
    const held = step.request
    step = core.reconcile_resume(step, {
      $: "RReply",
      invocation: held.invocation,
      id: held.id,
      response: yield* session.perform(held.command)
    })
  }
  return session.decode(step)
})

export const residentReconcileFinishHandoff = Effect.fn("ResidentRuntime.reconcileFinishHandoff")(function* (
  deps: FinishDependencies,
  request: ResidentRequest,
  provisional: ResidentResponse,
  final: ResidentResponse,
  canWrite: boolean
) {
  const session = makeResidentFinishSession(deps, request, provisional, final, canWrite)
  return yield* driveFinish(session, core.reconcile_initial(1, session.input))
}, Effect.uninterruptible)

export const residentReserveFinishOutput = Effect.fn("ResidentRuntime.reserveFinishOutput")(function* (
  deps: FinishDependencies,
  request: ResidentRequest,
  collected: ResidentResponse
) {
  const session = makeResidentFinishSession(deps, request, collected, collected, true)
  return yield* driveFinish(session, core.reserve_finish_initial(1, session.input))
})
