import type { CapacityLedger } from "../capacity/operations.ts"
import {
  type DeliveryDraft,
  type FinishPermit,
  type StopRecord,
  type SubmissionBatch,
  type Submission,
  type DeliverySurface,
  fingerprint
} from "./model.ts"
import { type DeliveryPorts } from "./ports.ts"

export const deliverySubmissionRelease = (
  state: DeliveryDraft,
  canonicalOwner: Pick<CapacityLedger, "partitionId" | "roundId" | "collectionTokenId" | "transition">,
  {
    submissionAdviceId,
    readGeneration,
    fingerprintId
  }: Pick<DeliveryPorts, "submissionAdviceId" | "readGeneration" | "fingerprintId">
) => {
  function releaseFinishSlot(token: string, permit: FinishPermit, stop: StopRecord): void {
    const common = {
      group: canonicalOwner.partitionId(permit.partition),
      round: canonicalOwner.roundId(permit.partition),
      attempt: stop.id,
      token: canonicalOwner.collectionTokenId(token)
    }
    const result = permit.authorized
      ? canonicalOwner.transition({ kind: "finishTerminal", ...common, selected: permit.selected, outcome: "failed" })
      : canonicalOwner.transition({ kind: "finishRelease", ...common })
    const expected = permit.authorized ? "finishRecorded" : "finishReleased"
    if (result.rejection !== undefined || result.outputs[0]?.kind !== expected)
      throw new Error("canonical finish release refused")
    permit.terminal = permit.authorized
  }

  function releaseFinishPermit(token: string): void {
    const permit = state.finishPermits.get(token)
    if (permit === undefined || permit.revoked) return
    const stop = state.stops.get(permit.partition)
    if (stop !== undefined && !permit.terminal) releaseFinishSlot(token, permit, stop)
    permit.revoked = true
    if (permit.authorized) return
    state.finishPermits.delete(token)
    if (stop?.outputToken === token) delete stop.outputToken
  }

  function rollbackSubmission(adviceId: string, batch: SubmissionBatch): void {
    if (batch.status !== "reserved" && batch.status !== "authorized") return
    const rollback = canonicalOwner.transition({
      kind: "submissionRelease",
      advice: submissionAdviceId(adviceId),
      token: batch.id
    })
    if (rollback.rejection !== undefined || rollback.outputs[0]?.kind !== "submissionReleased")
      throw new Error("canonical submission rollback refused")
  }

  function releaseSubmission(token: string, adviceId: string, submission: Submission): void {
    const batch = submission.batches.get(token)
    if (batch === undefined) return
    rollbackSubmission(adviceId, batch)
    const batches = new Map(submission.batches)
    batches.delete(token)
    if (batches.size === 0) state.submissions.delete(adviceId)
    else state.submissions.set(adviceId, { ...submission, batches })
  }

  function release(token: string): void {
    releaseFinishPermit(token)
    for (const [adviceId, submission] of state.submissions) releaseSubmission(token, adviceId, submission)
  }

  function forget(adviceId: string): void {
    const result = canonicalOwner.transition({ kind: "submissionForget", advice: submissionAdviceId(adviceId) })
    if (result.rejection !== undefined || result.outputs[0]?.kind !== "submissionForgotten") {
      throw new Error("canonical submission forget refused")
    }
    state.submissions.delete(adviceId)
  }

  function suppresses(adviceId: string, partition: string, finding: unknown, surface?: DeliverySurface): boolean {
    const submission = state.submissions.get(adviceId)
    if (
      submission === undefined ||
      submission.partition !== partition ||
      submission.generation !== readGeneration(partition)
    )
      return false
    const digest = fingerprint(finding)
    const checked = canonicalOwner.transition({
      kind: "submissionSuppressCheck",
      advice: submissionAdviceId(adviceId),
      fingerprint: fingerprintId(adviceId, digest),
      round: canonicalOwner.roundId(partition),
      surface: surface ?? "edit"
    })
    if (checked.rejection !== undefined) throw new Error("canonical submission suppression refused")
    return checked.outputs[0]?.kind === "submissionSuppresses"
  }

  function backgroundReofferable(adviceId: string, token: string): boolean {
    const batch = state.submissions.get(adviceId)?.batches.get(token)
    if (batch === undefined) return false
    const checked = canonicalOwner.transition({
      kind: "submissionReofferCheck",
      advice: submissionAdviceId(adviceId),
      token: batch.id
    })
    if (checked.rejection !== undefined) throw new Error("canonical submission reoffer check refused")
    return checked.outputs[0]?.kind === "submissionReofferable"
  }
  return { release, forget, suppresses, backgroundReofferable }
}
