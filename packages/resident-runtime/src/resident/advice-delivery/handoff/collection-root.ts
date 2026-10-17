import * as Effect from "effect/Effect"
import type { DeliverySelection } from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import type { ResidentRequest, ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import type { makeResidentCollectionSession } from "../advice-collection.ts"
import type { Dependencies } from "./context.ts"
import { makeResidentCollectionGateSession } from "./collection-gate.ts"
import { makeResidentFinishSession } from "./finish.ts"
import core, { type RootInput, type RootCommand, type RootResponse, type RootStep } from "./collection-handoff-core.js"

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

export const makeResidentCollectionRoot = (
  deps: RootDependencies,
  request: Extract<ResidentRequest, { operation: "collect" }>,
  collection: CollectionSession
) => {
  const gate = makeResidentCollectionGateSession(deps, request)
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
        return { $: "RootGated", response: encodeGResponse(yield* gate.perform(decodeGCommand(command.command))) }
      case "RootCollect":
        return {
          $: "RootCollected",
          response: encodeFlowResponse(yield* collection.perform(decodeFlowCommand(command.command)))
        }
      case "RootDecode": {
        const result = decodeFlowResult(command.result)
        const response = collection.decode(result)
        selected = response
        yield* collection.finish()
        if (result.$ === "FlowDone" && response.status === "advice")
          selection = { $: "DeliverySelection", token: result.token, advice: result.advice, notices: { $: "Nil" } }
        finish = makeResidentFinishSession(deps, request, response, response, true)
        return { $: "RootDecoded", input: { ...finish.input, $: "Handoff.RInput" }, empty: response.status === "empty" }
      }
      case "RootReserve":
        if (finish === undefined) throw new Error("missing collection reservation capability")
        return { $: "RootReserved", response: encodeRResponse(yield* finish.perform(decodeRCommand(command.command))) }
      case "RootWorkState":
        selected = yield* deps.residentCollectionWorkState(request.root, request.advicee, true)
        return { $: "RootWorkStateRead" }
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
    if (!core.atomic(held)) return one(held)
    return Effect.gen(function* () {
      let step = held
      while (step.$ === "RootAwait" && core.atomic(step)) step = yield* one(step)
      return step
    }).pipe(Effect.uninterruptible)
  }
  const input: RootInput = {
    $: "RootInput",
    gate: { ...gate.input, $: "Handoff.GInput" },
    report: request.reportWorkState === true
  }
  return {
    initial: (invocation: number) => core.initial(invocation, input),
    advance,
    finish: collection.finish,
    cleanup: collection.cleanup,
    release: collection.release,
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

export const residentCollectRequest = Effect.fn("ResidentRuntime.collectRequest")(function* (
  deps: RootDependencies,
  request: Extract<ResidentRequest, { operation: "collect" }>,
  collection: CollectionSession
) {
  const session = makeResidentCollectionRoot(deps, request, collection)
  return yield* Effect.gen(function* () {
    let step = session.initial(1)
    while (step.$ === "RootAwait") step = yield* session.advance(step)
    return session.decode(step)
  }).pipe(Effect.ensuring(session.finish()), Effect.onError(session.release))
})
