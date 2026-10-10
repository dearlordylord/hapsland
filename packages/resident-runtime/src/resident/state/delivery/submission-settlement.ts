import type { CapacityLedger } from "../capacity/operations.ts"
import {
  type DeliveryDraft,
  type Submission,
  type SubmissionBatch,
  type MatchingSubmission,
  type FinishPermit
} from "./model.ts"
import { type DeliveryPorts } from "./ports.ts"
export const deliverySubmissionSettlement = (
  state: DeliveryDraft,
  canonicalOwner: Pick<
    CapacityLedger,
    "transition" | "canonicalProjection" | "partitionId" | "roundId" | "collectionTokenId"
  >,
  {
    canonicalCommandAccepted,
    submissionAdviceId,
    fingerprintId
  }: Pick<DeliveryPorts, "canonicalCommandAccepted" | "submissionAdviceId" | "fingerprintId">
) => {
  function matchingSubmissions(token: string): ReadonlyArray<MatchingSubmission> {
    return [...state.submissions].flatMap(([id, submission]) => {
      const batch = submission.batches.get(token)
      return batch === undefined ? [] : [{ id, submission, batch }]
    })
  }

  function batchPhaseMatches(
    item: MatchingSubmission,
    required: SubmissionBatch["status"],
    canonical: ReturnType<CapacityLedger["canonicalProjection"]>["delivery"]["submissions"]
  ): boolean {
    if (item.batch.status !== required) return false
    const advice = submissionAdviceId(item.id)
    const owner = canonical.batches.find((entry) => entry.advice === advice && entry.token === item.batch.id)
    if (owner?.phase !== required) return false
    return [...item.batch.fingerprints].every(
      (digest) =>
        canonical.leases.find(
          (lease) => lease.advice === advice && lease.fingerprint === fingerprintId(item.id, digest)
        )?.phase === required
    )
  }

  function transitionSubmissionBatch(
    item: MatchingSubmission,
    token: string,
    status: SubmissionBatch["status"]
  ): readonly [string, Submission] {
    const result = canonicalOwner.transition(
      status === "authorized"
        ? { kind: "submissionAuthorize", advice: submissionAdviceId(item.id), token: item.batch.id }
        : {
            kind: "submissionTerminal",
            advice: submissionAdviceId(item.id),
            token: item.batch.id,
            certain: status === "submitted"
          }
    )
    const expected = status === "authorized" ? "submissionAuthorized" : "submissionRecorded"
    if (result.rejection !== undefined || result.outputs[0]?.kind !== expected)
      throw new Error("canonical submission transition refused resident owner")
    const batches = new Map(item.submission.batches)
    batches.set(token, { ...item.batch, status })
    return [item.id, { ...item.submission, batches }]
  }

  function transitionBatchStatus(token: string, status: SubmissionBatch["status"]): boolean {
    const matching = matchingSubmissions(token)
    const required = status === "authorized" ? "reserved" : "authorized"
    const canonical = canonicalOwner.canonicalProjection().delivery.submissions
    if (matching.some((item) => !batchPhaseMatches(item, required, canonical))) return false
    const staged = matching.map((item) => transitionSubmissionBatch(item, token, status))
    for (const [id, submission] of staged) state.submissions.set(id, submission)
    return true
  }

  function authorizedFinishPermit(token: string): FinishPermit | undefined {
    const permit = state.finishPermits.get(token)
    if (permit === undefined || !permit.authorized || permit.terminal) return undefined
    return permit
  }

  function finishSubmissionMatches(
    item: MatchingSubmission,
    permit: FinishPermit,
    canonical: ReturnType<CapacityLedger["canonicalProjection"]>["delivery"]["submissions"]["batches"]
  ): boolean {
    return (
      permit.advice.some((advice) => advice.id === item.id) &&
      item.batch.status === "authorized" &&
      canonical.find((batch) => batch.advice === submissionAdviceId(item.id) && batch.token === item.batch.id)
        ?.phase === "authorized"
    )
  }

  function publishMatchingBatchStatus(
    matching: ReadonlyArray<MatchingSubmission>,
    token: string,
    status: SubmissionBatch["status"]
  ): void {
    for (const { id, submission, batch } of matching) {
      const batches = new Map(submission.batches)
      batches.set(token, { ...batch, status })
      state.submissions.set(id, { ...submission, batches })
    }
  }

  function recordStopBatchResult(
    token: string,
    status: "submitted" | "uncertain",
    outcome: "acknowledged" | "unknown"
  ): boolean {
    const permit = authorizedFinishPermit(token)
    if (permit === undefined) return false
    const stop = state.stops.get(permit.partition)
    if (stop === undefined || stop.outputToken !== token) return false
    const matching = matchingSubmissions(token)
    const canonical = canonicalOwner.canonicalProjection().delivery.submissions.batches
    if (
      matching.length !== permit.advice.length ||
      matching.some((item) => !finishSubmissionMatches(item, permit, canonical))
    )
      return false
    const recorded = canonicalOwner.transition({
      kind: "finishTerminal",
      group: canonicalOwner.partitionId(permit.partition),
      round: canonicalOwner.roundId(permit.partition),
      attempt: stop.id,
      token: canonicalOwner.collectionTokenId(token),
      selected: permit.selected,
      outcome
    })
    if (!canonicalCommandAccepted(recorded, "finishRecorded")) return false
    publishMatchingBatchStatus(matching, token, status)
    permit.terminal = true
    return true
  }

  function markSubmitted(token: string, selectedUnits: ReadonlyArray<number> = []): boolean {
    const permit = state.finishPermits.get(token)
    if (
      permit !== undefined &&
      (!permit.authorized ||
        permit.terminal ||
        permit.selected.length !== selectedUnits.length ||
        permit.selected.some((unit, index) => unit !== selectedUnits[index]))
    )
      return false
    if (permit !== undefined) {
      return recordStopBatchResult(token, "submitted", "acknowledged")
    }
    return transitionBatchStatus(token, "submitted")
  }

  function markUncertain(token: string): boolean {
    const permit = state.finishPermits.get(token)
    if (permit !== undefined && permit.authorized && !permit.terminal) {
      return recordStopBatchResult(token, "uncertain", "unknown")
    }
    return transitionBatchStatus(token, "uncertain")
  }
  return { markSubmitted, markUncertain }
}
