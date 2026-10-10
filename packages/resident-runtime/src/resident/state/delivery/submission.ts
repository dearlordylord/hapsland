import { deliverySubmissionSettlement } from "./submission-settlement.ts"
import type { CapacityLedger } from "../capacity/operations.ts"
import {
  type DeliveryDraft,
  type Submission,
  type SubmissionBatch,
  type DeliverySurface,
  fingerprint
} from "./model.ts"
import { type DeliveryPorts } from "./ports.ts"

export const deliverySubmission = (
  state: DeliveryDraft,
  canonicalOwner: Pick<
    CapacityLedger,
    "collectionTokenId" | "canonicalProjection" | "transition" | "partitionId" | "roundId"
  >,
  ports: Pick<DeliveryPorts, "readGeneration" | "isActive" | "canonicalCommandAccepted">
) => {
  const { readGeneration, isActive } = ports
  function submissionTokenId(token: string): number {
    return canonicalOwner.collectionTokenId(token)
  }

  function submissionAdviceId(adviceId: string): number {
    return canonicalOwner.collectionTokenId(`submission-advice\0${adviceId}`)
  }

  function fingerprintId(adviceId: string, digest: string): number {
    return canonicalOwner.collectionTokenId(`submission-finding\0${adviceId}\0${digest}`)
  }

  function currentSubmissionBatches(
    existing: Submission | undefined,
    partition: string,
    generation: number
  ): Map<string, SubmissionBatch> {
    if (existing?.partition === partition && existing.generation === generation) return new Map(existing.batches)
    return new Map()
  }

  function assertSubmissionAuthorization(adviceId: string, id: number, status: "reserved" | "authorized"): void {
    if (status !== "authorized") return
    const missing = canonicalOwner
      .canonicalProjection()
      .delivery.submissions.batches.some(
        (batch) => batch.advice === submissionAdviceId(adviceId) && batch.token === id && batch.phase !== "authorized"
      )
    if (missing) throw new Error("canonical submission authorization missing")
  }

  function submissionUnits(findings: ReadonlyArray<unknown>, unit: number | undefined): ReadonlyArray<number> {
    return unit === undefined ? [] : findings.map(() => unit)
  }

  function stageSubmission(
    adviceId: string,
    partition: string,
    token: string,
    findings: ReadonlyArray<unknown>,
    surface: DeliverySurface,
    now: number,
    status: "reserved" | "authorized",
    unit?: number
  ): Submission | undefined {
    const generation = readGeneration(partition)
    if (generation === 0 || !isActive(partition, generation)) return undefined
    const existing = state.submissions.get(adviceId)
    const batches = currentSubmissionBatches(existing, partition, generation)
    if (batches.has(token)) return undefined
    const fingerprints = new Set(findings.map(fingerprint))
    if (fingerprints.size === 0) return undefined
    const id = submissionTokenId(token)
    const offered = canonicalOwner.transition({
      kind: "submissionBegin",
      advice: submissionAdviceId(adviceId),
      group: canonicalOwner.partitionId(partition),
      round: canonicalOwner.roundId(partition),
      token: id,
      surface,
      authorizeNow: status === "authorized",
      fingerprints: [...fingerprints].map((digest) => fingerprintId(adviceId, digest)),
      units: submissionUnits(findings, unit)
    })
    if (offered.rejection !== undefined || offered.outputs[0]?.kind !== "submissionBegun") {
      return undefined
    }
    assertSubmissionAuthorization(adviceId, id, status)
    batches.set(token, { id, surface, at: now, fingerprints, status })
    return { partition, generation, batches }
  }

  function beginSubmission(
    adviceId: string,
    partition: string,
    token: string,
    findings: ReadonlyArray<unknown>,
    surface: DeliverySurface,
    now: number,
    unit?: number
  ): boolean {
    const staged = stageSubmission(adviceId, partition, token, findings, surface, now, "authorized", unit)
    if (staged === undefined) return false
    state.submissions.set(adviceId, staged)
    return true
  }

  const { markSubmitted, markUncertain } = deliverySubmissionSettlement(state, canonicalOwner, {
    ...ports,
    submissionAdviceId,
    fingerprintId
  })
  return { submissionAdviceId, fingerprintId, stageSubmission, beginSubmission, markSubmitted, markUncertain }
}
