import type { CapacityLedger } from "../capacity/operations.ts"
import { type DeliveryDraft, fingerprint, type StopRecord, type FinishPermit, type SubmissionBatch } from "./model.ts"
import { type DeliveryPorts } from "./ports.ts"
export const deliveryFinishAuthorization = (
  state: DeliveryDraft,
  canonicalOwner: Pick<
    CapacityLedger,
    "canonicalProjection" | "partitionId" | "roundId" | "transition" | "collectionTokenId"
  >,
  {
    submissionAdviceId,
    release,
    fingerprintId,
    isActive,
    isDeciding
  }: Pick<DeliveryPorts, "submissionAdviceId" | "release" | "fingerprintId" | "isActive" | "isDeciding">
) => {
  function finishSelectionMatches(
    token: string,
    advice: ReadonlyArray<{ readonly id: string; readonly unit: number; readonly findings: ReadonlyArray<unknown> }>
  ): boolean {
    const permit = state.finishPermits.get(token)
    if (permit === undefined || permit.revoked || permit.advice.length !== advice.length) return false
    const selected = advice.flatMap((item) => item.findings.map(() => item.unit))
    if (permit.selected.length !== selected.length || permit.selected.some((unit, index) => unit !== selected[index]))
      return false
    if (
      !advice.every((item, index) => {
        const expected = permit.advice[index]
        const digests = item.findings.map(fingerprint)
        return (
          expected?.id === item.id &&
          expected.fingerprints.length === digests.length &&
          expected.fingerprints.every((digest, position) => digest === digests[position])
        )
      })
    )
      return false
    return finishBatchesCurrent(token, permit)
  }

  function finishBatchesCurrent(
    token: string,
    permit: {
      readonly partition: string
      readonly advice: ReadonlyArray<{ readonly id: string; readonly fingerprints: ReadonlyArray<string> }>
    }
  ): boolean {
    const canonical = canonicalOwner.canonicalProjection().delivery.submissions.batches
    return permit.advice.every((item) => {
      const batch = state.submissions.get(item.id)?.batches.get(token)
      const canonicalBatch = canonical.find(
        (candidate) => candidate.advice === submissionAdviceId(item.id) && candidate.token === batch?.id
      )
      return (
        batch?.status === "reserved" &&
        canonicalBatch?.phase === "reserved" &&
        canonicalBatch.group === canonicalOwner.partitionId(permit.partition) &&
        canonicalBatch.round === canonicalOwner.roundId(permit.partition) &&
        canonicalBatch.fingerprints.length === new Set(item.fingerprints).size &&
        item.fingerprints.every(
          (digest) =>
            batch.fingerprints.has(digest) && canonicalBatch.fingerprints.includes(fingerprintId(item.id, digest))
        )
      )
    })
  }

  function unreservedStopAllowed(partition: string): boolean {
    const decision = canonicalOwner.transition({
      kind: "deliveryUnreservedStopCheck",
      active: isActive(partition),
      deciding: isDeciding(partition)
    })
    if (decision.rejection !== undefined || decision.outputs.length !== 1)
      throw new Error("canonical unreserved Stop gate refused")
    return decision.outputs[0]?.kind === "deliveryUnreservedStopAllowed"
  }

  function finishPermitCurrent(
    partition: string,
    token: string,
    permit: FinishPermit,
    stop: StopRecord | undefined
  ): stop is StopRecord {
    if (permit.partition !== partition || !isActive(partition, permit.generation) || permit.revoked) return false
    return stop?.token === permit.attempt && stop.outputToken === token
  }

  function publishBatchStatus(token: string, status: SubmissionBatch["status"]): void {
    for (const [id, submission] of state.submissions) {
      const batch = submission.batches.get(token)
      if (batch === undefined) continue
      const batches = new Map(submission.batches)
      batches.set(token, { ...batch, status })
      state.submissions.set(id, { ...submission, batches })
    }
  }

  function authorizeFinishOutput(partition: string, token: string): boolean {
    const permit = state.finishPermits.get(token)
    if (permit === undefined) return unreservedStopAllowed(partition)
    const stop = state.stops.get(partition)
    if (!finishPermitCurrent(partition, token, permit, stop)) return false
    if (!finishBatchesCurrent(token, permit)) return false
    const authorization = canonicalOwner.transition({
      kind: "finishAuthorize",
      group: canonicalOwner.partitionId(partition),
      round: canonicalOwner.roundId(partition),
      attempt: stop.id,
      token: canonicalOwner.collectionTokenId(token),
      selected: permit.selected
    })
    if (authorization.rejection !== undefined || authorization.outputs[0]?.kind !== "finishAuthorized") {
      release(token)
      return false
    }
    permit.authorized = true
    publishBatchStatus(token, "authorized")
    return true
  }
  return { finishSelectionMatches, authorizeFinishOutput }
}
