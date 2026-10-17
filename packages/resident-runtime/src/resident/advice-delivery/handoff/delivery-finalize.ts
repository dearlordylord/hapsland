import * as Effect from "effect/Effect"
import type { ResidentRequest, ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import type { ResponseAuthority, HandoffRequest } from "../authority.ts"
import type { Dependencies } from "./context.ts"
import { makeResidentFinalizationSession } from "./finalize.ts"
import { makeResidentFinishSession } from "./finish.ts"
import core, { type DCommand, type DResponse, type DStep } from "./handoff-core.js"

type FinalizationMode =
  | { readonly kind: "local" }
  | { readonly kind: "transport"; readonly original: ResidentRequest; readonly canWrite: () => boolean }

export const makeResidentDeliveryFinalizationSession = (
  deps: Dependencies,
  request: HandoffRequest,
  provisional: ResidentResponse,
  sources: ReadonlyMap<string, boolean>,
  authority: ResponseAuthority | undefined,
  mode: FinalizationMode
) => {
  const finalization = makeResidentFinalizationSession(deps, request, provisional, sources, authority)
  let selected: ResidentResponse | undefined
  let finish: ReturnType<typeof makeResidentFinishSession> | undefined
  const selectedResponse = () => {
    if (selected === undefined) throw new Error("missing final response capability")
    return selected
  }
  const perform = Effect.fn("ResidentRuntime.deliveryFinalizeCommand")(function* (
    command: DCommand
  ): Effect.fn.Return<DResponse> {
    switch (command.$) {
      case "DFinalize":
        return { $: "DFinalized", response: yield* finalization.perform(command.command) }
      case "DDecode":
        selected = finalization.decode(command.result)
        return { $: "DDecoded" }
      case "DCanWrite":
        if (mode.kind !== "transport") throw new Error("missing transport writability capability")
        finish = makeResidentFinishSession(deps, mode.original, provisional, selectedResponse(), mode.canWrite())
        return { $: "DFinishInput", input: finish.input }
      case "DReconcile":
        if (finish === undefined) throw new Error("missing finish session capability")
        return { $: "DReconciled", response: yield* finish.perform(command.command) }
    }
  })
  return {
    input: finalization.input,
    transport: mode.kind === "transport",
    perform,
    decode: (step: DStep): ResidentResponse => {
      switch (step.$) {
        case "DDone":
          return step.empty ? { status: "empty" } : selectedResponse()
        case "DAwait":
          throw new Error("Bend delivery finalization is not terminal")
        case "DRejected":
          throw new Error("Bend delivery finalization refused native reply")
      }
    }
  }
}

export const residentFinalizeHandoff = Effect.fn("ResidentRuntime.finalizeHandoff")(function* (
  deps: Dependencies,
  request: HandoffRequest,
  provisional: ResidentResponse,
  sources: ReadonlyMap<string, boolean>,
  authority: ResponseAuthority | undefined,
  mode: FinalizationMode
) {
  const session = makeResidentDeliveryFinalizationSession(deps, request, provisional, sources, authority, mode)
  let step = core.delivery_finalize_initial(1, session.transport, session.input)
  while (step.$ === "DAwait") {
    const held = step.request
    step = core.delivery_finalize_resume(step, {
      $: "DReply",
      invocation: held.invocation,
      id: held.id,
      response: yield* session.perform(held.command)
    })
  }
  return session.decode(step)
}, Effect.uninterruptible)
