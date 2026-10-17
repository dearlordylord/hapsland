import * as Effect from "effect/Effect"
import type { ResidentRequest, ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import { list } from "@hapsland/source-artifacts/direct-event/value/codec"
import { recipientPartition } from "../../recipient/identity.ts"
import type { RoundWork } from "../../state/round-records.ts"
import type { Dependencies } from "./context.ts"
import core, { type GCommand, type GResponse, type GInput, type GStep } from "./handoff-core.js"

type GateDependencies = Pick<
  Dependencies,
  | "residentComposedDelivery"
  | "residentNow"
  | "residentPruneNoticeCooldowns"
  | "residentLedger"
  | "residentCollectionWorkCount"
  | "residentReleaseAdviceLease"
  | "residentAllowFinish"
> & {
  readonly residentDiscardUnfinishedWork: (
    round: RoundWork,
    cancellation: { readonly cancelledSource: ReadonlyArray<number>; readonly cancelledJev: ReadonlyArray<number> }
  ) => Effect.Effect<boolean>
}

export const makeResidentCollectionGateSession = (
  deps: GateDependencies,
  request: Extract<ResidentRequest, { operation: "collect" }>
) => {
  const group = recipientPartition(request.advicee)
  let snapshots: Effect.Success<ReturnType<typeof deps.residentLedger.advice.snapshots>> = []
  let round: RoundWork | undefined
  let cutoff:
    | Extract<Effect.Success<ReturnType<typeof deps.residentComposedDelivery.finishGate>>, { status: "cutoff" }>
    | undefined
  const finish = () => {
    if (request.finish === undefined) throw new Error("missing finish gate capability")
    return request.finish
  }
  const snapshot = (handle: number) => {
    const value = snapshots[handle]
    if (value === undefined) throw new Error("missing finish lease capability")
    return value
  }
  const perform = Effect.fn("ResidentRuntime.collectionGateCommand")(function* (
    command: GCommand
  ): Effect.fn.Return<GResponse> {
    switch (command.$) {
      case "GOwnStop":
        return { $: "GTruth", value: yield* deps.residentComposedDelivery.ownsStop(group, finish().token) }
      case "GPruneNotices":
        yield* deps.residentPruneNoticeCooldowns(deps.residentNow())
        return { $: "GAck" }
      case "GAdvice":
        snapshots = yield* deps.residentLedger.advice.snapshots()
        return {
          $: "GLeases",
          leases: list(
            snapshots.map(({ capability, content }, handle) => ({
              $: "GLease",
              handle,
              partition: recipientPartition(capability.observation.advicee) === group,
              delivery: content.delivery !== undefined
            }))
          )
        }
      case "GExpired": {
        const delivery = snapshot(command.advice).content.delivery
        if (delivery === undefined) throw new Error("missing expiring delivery capability")
        return { $: "GTruth", value: delivery.leaseUntil <= deps.residentNow() }
      }
      case "GRelease":
        yield* deps.residentReleaseAdviceLease(snapshot(command.advice).capability)
        return { $: "GAck" }
      case "GRound":
        round = yield* deps.residentLedger.rounds.get(group)
        return { $: "GTruth", value: round !== undefined }
      case "GTotalUnfinished":
        return { $: "GCount", value: yield* deps.residentCollectionWorkCount(request.root, request.advicee, true) }
      case "GOwnUnfinished":
        if (round === undefined) throw new Error("missing finish round capability")
        return { $: "GCount", value: (yield* deps.residentLedger.rounds.policyWork(round)).unfinished() }
      case "GGate": {
        const gate = yield* deps.residentComposedDelivery.finishGate(
          group,
          finish().token,
          command.extra,
          finish().deadlineReached
        )
        if (gate === undefined) return { $: "GNoGate" }
        if (gate.status === "waiting") return { $: "GWaiting" }
        cutoff = gate
        return { $: "GCutoff", limited: gate.limited }
      }
      case "GDiscard":
        if (round === undefined || cutoff === undefined) throw new Error("missing finish cancellation capability")
        return { $: "GTruth", value: yield* deps.residentDiscardUnfinishedWork(round, cutoff) }
      case "GAllow":
        yield* deps.residentAllowFinish(group, finish().token, command.reason.$ === "GLimit" ? "limit" : "unavailable")
        return { $: "GAck" }
    }
  })
  const input: GInput = {
    $: "GInput",
    composed: request.composed === true,
    turn_end: request.mode === "turn-end",
    finish: request.finish !== undefined
  }
  return {
    input,
    perform,
    decode: (step: GStep): ResidentResponse | undefined => {
      switch (step.$) {
        case "GDone":
          switch (step.result.$) {
            case "GCollect":
              return undefined
            case "GEmpty":
              return { status: "empty" }
            case "GPending":
              return { status: "pending" }
            case "GUnsupported":
              return { status: "unsupported" }
          }
          break
        case "GAwait":
          throw new Error("Bend collection gate is not terminal")
        case "GRejected":
          throw new Error("Bend collection gate refused native reply")
      }
    }
  }
}

export const residentPrepareFinishCollection = Effect.fn("ResidentRuntime.prepareFinishCollection")(function* (
  deps: GateDependencies,
  request: Extract<ResidentRequest, { operation: "collect" }>
) {
  const session = makeResidentCollectionGateSession(deps, request)
  let step = core.collection_gate_initial(1, session.input)
  while (step.$ === "GAwait") {
    const held = step.request
    step = core.collection_gate_resume(step, {
      $: "GReply",
      invocation: held.invocation,
      id: held.id,
      response: yield* session.perform(held.command)
    })
  }
  return session.decode(step)
})
