import type { CapacityLedger } from "../capacity/operations.ts"
import { type DeliveryDraft, type DeliverySurface } from "./model.ts"
import { type DeliveryPorts } from "./ports.ts"
import { deliveryView } from "./view.ts"

export const deliverySubmissionPolicy = (
  state: DeliveryDraft,
  canonicalOwner: Pick<
    CapacityLedger,
    "partitionId" | "canonicalProjection" | "transition" | "knownPartitionId" | "roundId" | "currentRoundId"
  >,
  { isActive }: Pick<DeliveryPorts, "isActive">
) => {
  const { hasToken, hasFinishPermit } = deliveryView(state, canonicalOwner)
  function isDeciding(partition: string): boolean {
    const owner = canonicalOwner.partitionId(partition)
    return canonicalOwner.canonicalProjection().rounds.find((item) => item.partition === owner)?.deciding === true
  }

  function canSubmit(partition: string, surface: DeliverySurface): boolean {
    const result = canonicalOwner.transition({
      kind: "deliverySubmissionAllowedCheck",
      active: isActive(partition),
      barrier: stopBarrier(partition),
      deciding: isDeciding(partition),
      surface,
      existingToken: false,
      finishPermit: false
    })
    if (result.rejection !== undefined || result.outputs.length !== 1)
      throw new Error("canonical submission eligibility refused")
    return result.outputs[0]?.kind === "deliverySubmissionAllowed"
  }

  function canBeginSubmission(partition: string, surface: DeliverySurface, token: string): boolean {
    const result = canonicalOwner.transition({
      kind: "deliverySubmissionAllowedCheck",
      active: isActive(partition),
      barrier: stopBarrier(partition),
      deciding: isDeciding(partition),
      surface,
      existingToken: hasToken(token),
      finishPermit: surface === "stop" && hasFinishPermit(token)
    })
    if (result.rejection !== undefined || result.outputs.length !== 1)
      throw new Error("canonical submission eligibility refused")
    return result.outputs[0]?.kind === "deliverySubmissionAllowed"
  }

  function canBeginExistingToken(surface: DeliverySurface, token: string): boolean {
    const result = canonicalOwner.transition({
      kind: "deliveryExistingTokenCheck",
      surface,
      existingToken: hasToken(token),
      finishPermit: surface === "stop" && hasFinishPermit(token)
    })
    if (result.rejection !== undefined || result.outputs.length !== 1)
      throw new Error("canonical existing token gate refused")
    return result.outputs[0]?.kind === "deliveryExistingTokenAllowed"
  }

  function readGeneration(partition: string): number {
    const known = canonicalOwner.knownPartitionId(partition)
    if (known === undefined) return 0
    const admission = canonicalOwner.canonicalProjection().admissions.find((item) => item.partition === known)
    return admission?.round ?? 0
  }

  function consumeStop(partition: string, _continuationDigest?: string): boolean {
    if (!hasVirtualRoundContinuationBudget(partition)) return false
    const consumed = canonicalOwner.transition({
      kind: "continuationConsume",
      group: canonicalOwner.partitionId(partition),
      round: canonicalOwner.roundId(partition)
    })
    if (consumed.rejection !== undefined || consumed.outputs[0]?.kind !== "continuationConsumed") return false
    return true
  }

  function hasVirtualRoundContinuationBudget(partition: string): boolean {
    if (!state.rounds.has(partition)) return false
    const result = canonicalOwner.transition({
      kind: "roundContinuationBudgetCheck",
      active: isActive(partition),
      count: continuationCount(partition)
    })
    if (result.rejection !== undefined || result.outputs.length !== 1)
      throw new Error("canonical continuation budget refused")
    return result.outputs[0]?.kind === "roundContinuationAvailable"
  }

  function stopBarrier(partition: string): boolean {
    const stop = state.stops.get(partition)
    const result = canonicalOwner.transition({
      kind: "roundBarrierCheck",
      hasStop: stop !== undefined,
      usedAtStart: stop?.continuationsAtStart ?? 0,
      usedNow: stop === undefined ? 0 : continuationCount(partition)
    })
    if (result.rejection !== undefined || result.outputs.length !== 1) throw new Error("canonical Stop barrier refused")
    return result.outputs[0]?.kind === "roundBarrierRaised"
  }

  function continuationCount(partition: string, round = canonicalOwner.currentRoundId(partition)): number {
    if (round === undefined) return 0
    const group = canonicalOwner.partitionId(partition)
    return (
      canonicalOwner
        .canonicalProjection()
        .delivery.counters.find((item) => item.group === group && item.round === round)?.used ?? 0
    )
  }
  return {
    isDeciding,
    canSubmit,
    canBeginSubmission,
    canBeginExistingToken,
    readGeneration,
    consumeStop,
    hasVirtualRoundContinuationBudget,
    stopBarrier,
    continuationCount
  }
}
