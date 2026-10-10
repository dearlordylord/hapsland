import { monotonicNow } from "@hapsland/resident-transport/resident/hook-clock"
import type { CapacityLedger } from "../capacity/operations.ts"
import { type DeliveryDraft, type StopRecord, type AdmissionProjection, type SubmissionBatch } from "./model.ts"
import { type DeliveryPorts } from "./ports.ts"

export const deliveryRoundClosure = (
  state: DeliveryDraft,
  canonicalOwner: Pick<
    CapacityLedger,
    "transition" | "partitionId" | "collectionTokenId" | "canonicalProjection" | "retireRound" | "currentRoundId"
  >,
  {
    isActive,
    revokeProvisionalFinishOutput,
    readGeneration,
    bendTime,
    finishPermit,
    forget,
    releaseBackground,
    continuationCount,
    stopBarrier
  }: Pick<
    DeliveryPorts,
    | "isActive"
    | "revokeProvisionalFinishOutput"
    | "readGeneration"
    | "bendTime"
    | "finishPermit"
    | "forget"
    | "releaseBackground"
    | "continuationCount"
    | "stopBarrier"
  >
) => {
  function currentStop(partition: string, token: string): StopRecord | undefined {
    const stop = state.stops.get(partition)
    if (stop?.token !== token || !state.rounds.has(partition) || !isActive(partition, stop.generation)) return undefined
    return stop
  }

  function stopProvisionalRevoked(partition: string, token: string, stop: StopRecord, revoke: boolean): boolean {
    if (!revoke || stop.outputToken === undefined) return true
    return revokeProvisionalFinishOutput(partition, token, stop.outputToken)
  }

  function stopTerminalDecision(partition: string, token: string, stop: StopRecord, close: boolean) {
    const terminal = canonicalOwner.transition({
      kind: "roundStopTerminalCheck",
      hasOutput: stop.outputToken !== undefined,
      authorized: stop.outputToken !== undefined && state.finishPermits.get(stop.outputToken)?.authorized === true,
      requestedClose: close
    })
    const command = terminal.outputs[0]
    if (terminal.rejection !== undefined || command?.kind !== "roundStopTerminal") return undefined
    if (!stopProvisionalRevoked(partition, token, stop, command.revokeProvisional)) return undefined
    return command
  }

  function endStopGroup(partition: string, canonicalRound: number): void {
    const owner = canonicalOwner.partitionId(partition)
    const ended = canonicalOwner.transition({
      kind: "stopGroupEnded",
      group: canonicalOwner.partitionId(partition),
      lifetime: 1,
      round: canonicalRound,
      scopes: [{ partition: owner, round: canonicalRound }]
    })
    if (ended.rejection !== undefined || ended.outputs[0]?.kind !== "stopEnded")
      throw new Error("canonical Stop end refused")
  }

  function endAuthorizedFinish(partition: string, stop: StopRecord): void {
    const outputPermit = stop.outputToken === undefined ? undefined : state.finishPermits.get(stop.outputToken)
    if (stop.outputToken === undefined || outputPermit?.authorized !== true) return
    const ended = canonicalOwner.transition({
      kind: "finishEnd",
      group: canonicalOwner.partitionId(partition),
      round: stop.canonicalRound,
      attempt: stop.id,
      token: canonicalOwner.collectionTokenId(stop.outputToken)
    })
    if (ended.rejection !== undefined || ended.outputs[0]?.kind !== "finishEnded")
      throw new Error("canonical finish slot end refused")
  }

  function closeStopRound(partition: string, stop: StopRecord, closedAt: number): boolean {
    if (readGeneration(partition) !== stop.generation) return false
    // Publish the canonical fence before changing the resident's Stop view.
    const admission = canonicalOwner
      .canonicalProjection()
      .admissions.find((item) => item.partition === canonicalOwner.partitionId(partition))
    if (admission === undefined) throw new Error("canonical admission missing at round closure")
    const closed = canonicalOwner.transition({
      kind: "closePermitRound",
      partition: admission.partition,
      lifetime: admission.lifetime,
      round: stop.generation,
      at: Math.max(bendTime(closedAt + 1), admission.closedAt)
    })
    if (
      closed.rejection !== undefined ||
      closed.outputs[0]?.kind !== "permitRoundClosed" ||
      closed.outputs[0].round !== stop.generation
    )
      throw new Error("canonical permit closure disagrees with round")
    return true
  }

  function revokeEndedStop(partition: string, stop: StopRecord): void {
    state.stops.delete(partition)
    if (stop.outputToken === undefined) return
    const permit = state.finishPermits.get(stop.outputToken)
    if (permit !== undefined) permit.revoked = true
  }

  function finishStop(partition: string, token: string, close: boolean, closedAt = monotonicNow()): number | undefined {
    const stop = currentStop(partition, token)
    if (stop === undefined) return undefined
    // A provisional output has not crossed the IPC write boundary.
    const command = stopTerminalDecision(partition, token, stop, close)
    if (command === undefined) return undefined
    endStopGroup(partition, stop.canonicalRound)
    endAuthorizedFinish(partition, stop)
    if (command.close && !closeStopRound(partition, stop, closedAt)) return undefined
    revokeEndedStop(partition, stop)
    if (!command.close) return undefined
    retireClosedRound(partition, stop.canonicalRound)
    return stop.generation
  }

  function retirePartitionPermits(partition: string): void {
    for (const [key, permit] of state.permits) if (permit.partition === partition) finishPermit(key, "closed")
  }

  function retirePartitionFinishes(partition: string): void {
    for (const [token, permit] of state.finishPermits)
      if (permit.partition === partition) state.finishPermits.delete(token)
  }

  function retirePartitionSubmissions(partition: string): void {
    for (const [id, submission] of state.submissions) if (submission.partition === partition) forget(id)
  }

  function retireClosedRound(partition: string, canonicalRound: number): void {
    canonicalOwner.retireRound(partition, canonicalRound)
    retirePartitionPermits(partition)
    const waiter = state.backgroundWaiters.get(partition)
    if (waiter !== undefined) releaseBackground(partition, waiter.token)
    retirePartitionFinishes(partition)
    retirePartitionSubmissions(partition)
    state.rounds.delete(partition)
  }

  function partitionHandoffIdle(partition: string): boolean {
    return (
      !state.backgroundWaiters.has(partition) &&
      ![...state.finishPermits.values()].some((item) => item.partition === partition) &&
      ![...state.submissions.values()].some(
        (item) =>
          item.partition === partition && [...item.batches.values()].some((batch) => batch.status !== "submitted")
      )
    )
  }

  function closeQuietRound(partition: string, now: number): AdmissionProjection {
    const admission = canonicalOwner
      .canonicalProjection()
      .admissions.find((item) => item.partition === canonicalOwner.partitionId(partition))
    if (admission === undefined) throw new Error("canonical admission missing at quiet closure")
    const closed = canonicalOwner.transition({
      kind: "closePermitRound",
      partition: admission.partition,
      lifetime: admission.lifetime,
      round: admission.round,
      at: Math.max(bendTime(now + 1), admission.closedAt)
    })
    if (closed.rejection !== undefined || closed.outputs[0]?.kind !== "permitRoundClosed") {
      throw new Error("canonical quiet closure refused")
    }
    return admission
  }

  function tickQuietRound(
    partition: string,
    now: number,
    facts: { readonly nativeWorkIdle: boolean; readonly adviceEmpty: boolean }
  ): number | undefined {
    const round = state.rounds.get(partition)
    if (round === undefined) return undefined
    const canonicalRound = canonicalOwner.currentRoundId(partition)
    if (canonicalRound === undefined) throw new Error("active virtual round lacks canonical identity")
    const handoffIdle = partitionHandoffIdle(partition)
    const tick = canonicalOwner.transition({
      kind: "quietRoundTick",
      partition: canonicalOwner.partitionId(partition),
      lifetime: 1,
      round: canonicalRound,
      now: bendTime(now),
      window: bendTime(round.quietMs),
      facts: { ...facts, handoffIdle, stopAbsent: !state.stops.has(partition) }
    })
    if (tick.rejection !== undefined || tick.outputs.length !== 1) throw new Error("canonical quiet tick refused")
    if (tick.outputs[0]?.kind !== "quietRoundExpired") return undefined
    const admission = closeQuietRound(partition, now)
    retireClosedRound(partition, canonicalRound)
    return admission.round
  }

  function closureCounts(partition: string): {
    reservedContinuations: number
    submitted: number
    uncertain: number
    editPermits: number
  } {
    const batches = new Map<string, SubmissionBatch["status"]>()
    for (const submission of state.submissions.values())
      if (submission.partition === partition) {
        for (const [token, batch] of submission.batches) batches.set(token, batch.status)
      }
    return {
      reservedContinuations: state.rounds.has(partition) ? continuationCount(partition) : 0,
      submitted: [...batches.values()].filter((status) => status === "submitted").length,
      uncertain: [...batches.values()].filter((status) => status === "uncertain").length,
      editPermits: [...state.permits.values()].filter((permit) => permit.partition === partition).length
    }
  }

  function expireStop(partition: string, token: string): number | undefined {
    const stop = state.stops.get(partition)
    if (stop?.token !== token) return undefined
    // An authorized output may have reached the runtime. Preserve its count
    // and round; finishStop releases any provisional output before closing.
    const authorizedOutput =
      stop.outputToken !== undefined && state.finishPermits.get(stop.outputToken)?.authorized === true
    const expiry = canonicalOwner.transition({
      kind: "roundExpireCloseCheck",
      barrier: stopBarrier(partition),
      authorizedOutput
    })
    if (expiry.rejection !== undefined || expiry.outputs.length !== 1) throw new Error("canonical Stop expiry refused")
    return finishStop(partition, token, expiry.outputs[0]?.kind === "roundExpireCloses")
  }
  return { currentStop, finishStop, tickQuietRound, closureCounts, expireStop }
}
