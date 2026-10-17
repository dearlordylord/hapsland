import { makeResidentCollectionRoot } from "./collection-root.ts"
import { residentCredentialAuthority } from "../../authorization/credentials.ts"
import { type DirectAdvicee } from "@hapsland/native-observation/direct-event/observation"
import * as Effect from "effect/Effect"
import { type ResidentDispatchContext, type ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import { type ResponseAuthority } from "../authority.ts"
import { recipientPartition } from "../../recipient/identity.ts"
import { type Dependencies } from "./context.ts"
export const residentCollectorLifetimeCurrent = Effect.fn("ResidentRuntime.collectorLifetimeCurrent")(function* (
  deps: Pick<Dependencies, "lifetime" | "residentLedger" | "residentRoundActive">,
  authority: ResponseAuthority
) {
  return (
    authority.lifetime === deps.lifetime &&
    (yield* deps.residentLedger.runtime.snapshot()).lifecycle === "active" &&
    (yield* deps.residentRoundActive(authority.round))
  )
})

export const residentCollectorGate = Effect.fn("ResidentRuntime.collectorGate")(function* (
  deps: Pick<Dependencies, "lifetime" | "residentLedger" | "residentRoundActive">,
  authority: ResponseAuthority,
  dispatch: ResidentDispatchContext,
  now: number
): Effect.fn.Return<ResidentResponse | undefined> {
  if (!(yield* residentCollectorLifetimeCurrent(deps, authority)))
    return { requestRoute: "edit", status: "unavailable", reason: "lost" }
  const command = (yield* deps.residentLedger.transition({
    kind: "collectorGateCheck",
    expired: now >= authority.expiresAt,
    credentialValid:
      authority.credentialGeneration === (dispatch.credential?.generation ?? null) &&
      residentCredentialAuthority(authority)
  })).outputs[0]
  if (command?.kind === "collectorProceed") return undefined
  if (command?.kind === "collectorUnavailable") {
    return { requestRoute: "edit", status: "unavailable", reason: command.reason }
  }
  throw new Error("canonical authority collect gate refused")
})

export const residentEditCollectionStatus = Effect.fn("ResidentRuntime.editCollectionStatus")(function* (
  deps: Pick<Dependencies, "residentAdvice" | "residentAdviceExpired" | "residentCollectionWorkCount">,
  authority: ResponseAuthority,
  root: string,
  advicee: DirectAdvicee,
  composed: boolean,
  now: number
): Effect.fn.Return<ResidentResponse> {
  const status = makeResidentCollectionRoot({
    kind: "status",
    partition: composed ? recipientPartition(advicee) : authority.partition,
    matching: composed ? "recipient" : "stored",
    advice: deps.residentAdvice,
    expired: deps.residentAdviceExpired,
    workCount: () => deps.residentCollectionWorkCount(root, advicee, composed),
    now: () => now
  })
  let step = status.initial(1)
  while (step.$ === "RootAwait") step = yield* status.advance(step).pipe(Effect.orDie)
  return status.decode(step)
})
