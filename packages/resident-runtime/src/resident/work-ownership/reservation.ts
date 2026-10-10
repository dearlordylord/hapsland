import { type DirectObservation } from "@hapsland/native-observation/direct-event/observation"
import { toCodexDirectEventOutput, type Finding } from "@hapsland/delivery-output/direct-event/output"
import { workSubject, type WorkRevision } from "../state/revision.ts"
import { type PreparedUnit, type MaterializationAdmission } from "@hapsland/review-definition/direct-event/model"
import { type ResidentDispatchContext } from "@hapsland/resident-transport/resident/protocol"
import { type CapacityResize } from "../state/capacity.ts"
import { residentEvaluationIdentity } from "../state/evaluation-reuse.ts"
import { findingFromProbability } from "@hapsland/review-definition/rules/decision"
import { logicalBytes } from "../state/encoded-size.ts"
import { recipientPartition, sourcePartition } from "../recipient/identity.ts"
import { evaluationSourcePartition } from "./identity.ts"

export const resizePreparationAdmission = (
  result: CapacityResize,
  requestedBytes: number
): MaterializationAdmission => {
  if (result.status === "resized") return { status: "admitted" }
  if (result.status === "capacity-refused")
    return {
      status: "refused",
      diagnostic: {
        stage: "preparation",
        code: "preparation-resource-refused",
        args: { phase: "materialization", requestedBytes, constraint: result.constraint }
      }
    }
  return {
    status: "refused",
    diagnostic: { stage: "preparation", code: "panic", args: { boundary: "review-preparation" } }
  }
}

export const RESERVATION_OVERHEAD_BYTES = 1024

const MAX_PROBABILITY_ENCODING_BYTES = 24

const reservedRevision = (partition: string, prepared: PreparedUnit): WorkRevision => ({
  subject: workSubject(partition, prepared),
  token: "00000000-0000-0000-0000-000000000000",
  generation: Number.MAX_SAFE_INTEGER
})

const worstCaseFindings = (prepared: PreparedUnit): ReadonlyArray<Finding> =>
  prepared.input.rules.flatMap((rule) =>
    findingFromProbability(1, rule.threshold)
      ? [
          {
            path: prepared.input.path,
            declaration: prepared.input.declaration.name,
            ruleId: rule.id,
            probability: 1,
            message: rule.message,
            semanticIdentity: prepared.identity
          }
        ]
      : []
  )

export const residentUnitWorstOutcomeBytes = (prepared: PreparedUnit): number => {
  const findings = worstCaseFindings(prepared)
  return (
    logicalBytes({ findings, output: toCodexDirectEventOutput(findings) }) +
    findings.length * MAX_PROBABILITY_ENCODING_BYTES
  )
}

export const residentUnitReservationBytes = (
  observation: DirectObservation,
  dispatch: ResidentDispatchContext,
  prepared: PreparedUnit
): number => {
  const findings = worstCaseFindings(prepared)
  const partition = recipientPartition(observation.advicee)
  const evaluationKey = residentEvaluationIdentity(
    evaluationSourcePartition(
      observation,
      "00000000-0000-0000-0000-000000000000",
      Number.MAX_SAFE_INTEGER,
      "f".repeat(64)
    ),
    prepared
  )
  const revision = reservedRevision(sourcePartition(observation.root, observation.advicee), prepared)
  const currentWork = {
    subject: revision.subject,
    token: revision.token,
    generation: revision.generation,
    input: prepared.input,
    members: 1
  }
  const unitBytes = logicalBytes({
    kind: "unit",
    observation,
    partition,
    dispatch,
    prepared,
    revision,
    evaluationKey,
    currentWork
  })
  const adviceBytes =
    logicalBytes({
      observation,
      partition,
      prepared,
      revision,
      evaluationKey,
      evaluations: [{ prepared, findings }],
      findings,
      encodedBytes: logicalBytes(toCodexDirectEventOutput(findings)),
      currentWork
    }) +
    findings.length * MAX_PROBABILITY_ENCODING_BYTES
  return Math.max(unitBytes, adviceBytes) + RESERVATION_OVERHEAD_BYTES
}
