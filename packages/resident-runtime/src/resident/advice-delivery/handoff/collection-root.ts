import * as Effect from "effect/Effect"
import * as Clock from "effect/Clock"
import * as Duration from "effect/Duration"
import { list } from "@hapsland/source-artifacts/direct-event/value/codec"
import { recipientPartition } from "../../recipient/identity.ts"
import type { Advice } from "../../state/advice-records.ts"
import type { DeliverySelection } from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import type { ResidentRequest, ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import type { makeResidentCollectionSession } from "../advice-collection.ts"
import type { Dependencies } from "./context.ts"
import { makeResidentCollectionGateSession } from "./collection-gate.ts"
import { makeResidentFinishSession } from "./finish.ts"
import core, { type RootCommand, type RootResponse, type RootStep } from "./collection-handoff-core.js"

import {
  decodeGCommand,
  encodeGResponse,
  decodeRCommand,
  encodeRResponse,
  decodeFlowCommand,
  encodeFlowResponse,
  decodeFlowResult
} from "./collection-root-codec.ts"

type CollectionSession = ReturnType<typeof makeResidentCollectionSession>
type RootDependencies = Parameters<typeof makeResidentCollectionGateSession>[0] &
  Parameters<typeof makeResidentFinishSession>[0] &
  Pick<Dependencies, "residentCollectionWorkState">

export type RootConfiguration =
  | {
      readonly kind: "request"
      readonly deps: RootDependencies
      readonly request: Extract<ResidentRequest, { operation: "collect" }>
      readonly collection: CollectionSession
    }
  | {
      readonly kind: "direct"
      readonly composed: boolean
      readonly turnEnd: boolean
      readonly collection: CollectionSession
    }
  | {
      readonly kind: "edit"
      readonly partition: string
      readonly deadline: bigint
      readonly startPass: () => CollectionSession
      readonly gate: () => Effect.Effect<ResidentResponse | undefined>
      readonly advice: Dependencies["residentAdvice"]
      readonly expired: Dependencies["residentAdviceExpired"]
      readonly workCount: () => Effect.Effect<number>
      readonly now: () => number
    }
  | {
      readonly kind: "status"
      readonly partition: string
      readonly matching: "recipient" | "stored"
      readonly advice: Dependencies["residentAdvice"]
      readonly expired: Dependencies["residentAdviceExpired"]
      readonly workCount: () => Effect.Effect<number>
      readonly now: () => number
    }

export const makeResidentCollectionRoot = (config: RootConfiguration) => {
  const gate = config.kind === "request" ? makeResidentCollectionGateSession(config.deps, config.request) : undefined
  let collection = config.kind === "edit" || config.kind === "status" ? undefined : config.collection
  let statusAdvice: readonly Advice[] = []
  let statusNow = 0
  const currentCollection = () => {
    if (collection === undefined) throw new Error("missing collection pass capability")
    return collection
  }
  const finishCollection = () => Effect.suspend(() => collection?.finish() ?? Effect.void)
  const releaseCollection = () => Effect.suspend(() => collection?.release() ?? Effect.void)
  const cleanupCollection = () => Effect.suspend(() => collection?.cleanup() ?? Effect.void)
  let selected: ResidentResponse | undefined
  let finish: ReturnType<typeof makeResidentFinishSession> | undefined
  let selection: DeliverySelection = { $: "NoDeliverySelection" }
  const selectedResponse = () => {
    if (selected === undefined) throw new Error("missing collected response capability")
    return selected
  }
  const perform = Effect.fn("ResidentRuntime.collectionRootCommand")(function* (
    command: RootCommand
  ): Effect.fn.Return<RootResponse, import("../../adapter-error.ts").ResidentAdapterError> {
    switch (command.$) {
      case "RootGate":
        if (gate === undefined) throw new Error("missing collection gate capability")
        return { $: "RootGated", response: encodeGResponse(yield* gate.perform(decodeGCommand(command.command))) }
      case "RootCollect":
        return {
          $: "RootCollected",
          response: encodeFlowResponse(yield* currentCollection().perform(decodeFlowCommand(command.command)))
        }
      case "RootDecode": {
        const result = decodeFlowResult(command.result)
        const response = currentCollection().decode(result)
        selected = response
        yield* Effect.uninterruptible(finishCollection())
        if (result.$ === "FlowDone" && response.status === "advice")
          selection = { $: "DeliverySelection", token: result.token, advice: result.advice, notices: { $: "Nil" } }
        if (config.kind === "direct") return { $: "RootDirectDecoded" }
        if (config.kind === "edit") return { $: "RootEditDecoded", advice: response.status === "advice" }
        if (config.kind !== "request") throw new Error("missing reservation request capability")
        finish = makeResidentFinishSession(config.deps, config.request, response, response, true)
        return { $: "RootDecoded", input: { ...finish.input, $: "Handoff.RInput" }, empty: response.status === "empty" }
      }
      case "RootReserve":
        if (finish === undefined) throw new Error("missing collection reservation capability")
        return { $: "RootReserved", response: encodeRResponse(yield* finish.perform(decodeRCommand(command.command))) }
      case "RootWorkState":
        if (config.kind !== "request") throw new Error("missing work state request capability")
        selected = yield* config.deps.residentCollectionWorkState(config.request.root, config.request.advicee, true)
        return { $: "RootWorkStateRead" }
      case "RootEditGate": {
        if (config.kind !== "edit") throw new Error("missing edit gate capability")
        const response = yield* config.gate()
        if (response !== undefined) selected = response
        return { $: "RootEditGated", proceed: response === undefined }
      }
      case "RootEditStartPass":
        if (config.kind !== "edit") throw new Error("missing edit pass capability")
        yield* Effect.uninterruptible(finishCollection())
        collection = config.startPass()
        return { $: "RootEditStarted" }
      case "RootEditStatus":
        if (config.kind !== "edit" && config.kind !== "status") throw new Error("missing edit status capability")
        statusNow = config.now()
        statusAdvice = yield* config.advice()
        return {
          $: "RootEditAdvice",
          values: list(
            statusAdvice.map((item, handle) => ({
              $: "RootAdvice",
              handle,
              partition:
                config.kind === "status" && config.matching === "stored"
                  ? item.partition
                  : recipientPartition(item.observation.advicee)
            }))
          )
        }
      case "RootEditExpired": {
        if (config.kind !== "edit" && config.kind !== "status") throw new Error("missing edit expiry capability")
        const item = statusAdvice[command.advice]
        if (item === undefined) throw new Error("missing edit advice capability")
        return { $: "RootEditExpiry", expired: yield* config.expired(item, statusNow) }
      }
      case "RootEditWorkCount":
        if (config.kind !== "edit" && config.kind !== "status") throw new Error("missing edit work count capability")
        return { $: "RootEditCount", count: yield* config.workCount() }
      case "RootEditSleep":
        if (config.kind !== "edit") throw new Error("missing edit wait capability")
        yield* Effect.sleep(50)
        return { $: "RootEditSlept" }
    }
  })
  const advance = (held: RootStep) => {
    const one = Effect.fn("ResidentRuntime.collectionRootAdvance")(function* (step: RootStep) {
      if (step.$ !== "RootAwait") throw new Error("collection root has no request")
      const request = step.request
      return core.resume(step, {
        $: "RootReply",
        invocation: request.invocation,
        id: request.id,
        response: yield* perform(request.command)
      })
    })
    const work = !core.atomic(held)
      ? one(held)
      : Effect.gen(function* () {
          let step = held
          while (step.$ === "RootAwait" && core.atomic(step)) step = yield* one(step)
          return step
        }).pipe(Effect.uninterruptible)
    if (config.kind !== "edit") return work
    const terminal = (response: { readonly $: "RootEditTimedOut" | "RootEditLost" }) =>
      Effect.gen(function* () {
        yield* Effect.uninterruptible(cleanupCollection())
        if (held.$ !== "RootAwait") throw new Error("edit root has no live request")
        return core.resume(held, { $: "RootReply", invocation: held.request.invocation, id: held.request.id, response })
      })
    return Effect.gen(function* () {
      const remaining = config.deadline - (yield* Clock.monotonicTimeNanos)
      if (remaining <= 0n) return yield* terminal({ $: "RootEditTimedOut" })
      return yield* work.pipe(
        Effect.timeoutOrElse({
          duration: Duration.nanos(remaining),
          orElse: () => terminal({ $: "RootEditTimedOut" })
        }),
        Effect.catchTag("ResidentAdapterError", () => terminal({ $: "RootEditLost" }))
      )
    })
  }
  return {
    initial: (invocation: number) => {
      switch (config.kind) {
        case "request":
          if (gate === undefined) throw new Error("missing collection gate capability")
          return core.initial(invocation, {
            $: "RootInput",
            gate: { ...gate.input, $: "Handoff.GInput" },
            report: config.request.reportWorkState === true
          })
        case "direct":
          return core.direct_initial(invocation, config.composed, config.turnEnd)
        case "edit":
          return core.edit_initial(invocation, config.partition)
        case "status":
          return core.status_initial(invocation, config.partition)
      }
    },
    advance,
    finish: finishCollection,
    cleanup: cleanupCollection,
    release: releaseCollection,
    selection: (step: RootStep): DeliverySelection =>
      step.$ === "RootDone" && step.result.$ === "RootSelected" ? selection : { $: "NoDeliverySelection" },
    decode: (step: RootStep): ResidentResponse => {
      switch (step.$) {
        case "RootDone":
          switch (step.result.$) {
            case "RootSelected":
              return selectedResponse()
            case "RootEmpty":
              return { status: "empty" }
            case "RootPending":
              return { status: "pending" }
            case "RootUnsupported":
              return { status: "unsupported" }
            case "RootEditPending":
              return { requestRoute: "edit", status: "pending" }
            case "RootEditEmpty":
              return { requestRoute: "edit", status: "empty" }
            case "RootEditUnavailable":
              return { requestRoute: "edit", status: "unavailable", reason: "lost" }
          }
          break
        case "RootAwait":
          throw new Error("Bend collection root is not terminal")
        case "RootRejected":
          throw new Error("Bend collection root refused native reply")
      }
    }
  }
}
