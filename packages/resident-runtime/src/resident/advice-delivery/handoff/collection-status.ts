import { residentCredentialAuthority } from "../../authorization/credentials.ts"
import { type DirectAdvicee } from "@hapsland/native-observation/direct-event/observation"
import type { Advice } from "../../state/advice-records.ts"
import * as Effect from "effect/Effect"
import { type ResidentDispatchContext, type ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import { type ResponseAuthority } from "../authority.ts"
import { recipientPartition } from "../../recipient/identity.ts"
import { type Dependencies } from "./context.ts"
import { residentCollectorLifetimeCurrent } from "./workflow.ts"

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

const residentAdvicePartitionMatches = (item: Advice, partition: string, composed: boolean): boolean =>
  composed ? recipientPartition(item.observation.advicee) === partition : item.partition === partition

export const residentEditCollectionStatus = Effect.fn("ResidentRuntime.editCollectionStatus")(function* (
  deps: Pick<Dependencies, "residentAdvice" | "residentAdviceExpired" | "residentCollectionWorkCount">,
  authority: ResponseAuthority,
  root: string,
  advicee: DirectAdvicee,
  composed: boolean,
  now: number
): Effect.fn.Return<ResidentResponse> {
  const partition = composed ? recipientPartition(advicee) : authority.partition
  let hasAdvice = false
  for (const item of yield* deps.residentAdvice()) {
    if (residentAdvicePartitionMatches(item, partition, composed) && !(yield* deps.residentAdviceExpired(item, now))) {
      hasAdvice = true
      break
    }
  }
  return {
    requestRoute: "edit",
    status: hasAdvice || (yield* deps.residentCollectionWorkCount(root, advicee, composed)) > 0 ? "pending" : "empty"
  }
})
