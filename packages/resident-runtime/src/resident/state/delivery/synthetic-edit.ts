import { PRE_EDIT_ADMISSION_DEADLINE_MS } from "@hapsland/resident-transport/resident/hook-clock"
import type { CapacityLedger } from "../capacity/operations.ts"
import { DEFAULT_VIRTUAL_ROUND_QUIET_MS } from "@hapsland/runtime-inputs/configuration/types"
import {
  type DeliveryDraft,
  type Round,
  type EditPermitLimits,
  type PermitCommand,
  EDIT_PERMIT_EXPIRY_MS
} from "./model.ts"
import { type DeliveryPorts } from "./ports.ts"
export const deliverySyntheticEdit = (
  state: DeliveryDraft,
  canonicalOwner: Pick<
    CapacityLedger,
    | "canonicalProjection"
    | "knownPartitionId"
    | "transition"
    | "minimumFreshStart"
    | "consumeEditPermit"
    | "partitionId"
  >,
  {
    releaseCompletedPermit,
    finishPermit,
    bendTime,
    checkCompleted,
    startRound,
    readGeneration,
    isActive,
    dropTool,
    toolId
  }: Pick<
    DeliveryPorts,
    | "releaseCompletedPermit"
    | "finishPermit"
    | "bendTime"
    | "checkCompleted"
    | "startRound"
    | "readGeneration"
    | "isActive"
    | "dropTool"
    | "toolId"
  >
) => {
  function closedKnownRound(partition: string, known: number): boolean {
    return canonicalOwner
      .canonicalProjection()
      .admissions.some((item) => item.partition === known && item.round > 0 && !item.active)
  }

  function internalEditEligible(partition: string, key: string, previous: Round | undefined): boolean {
    // Only deterministic fixtures and the non-installed API may start a first round.
    if (previous !== undefined && !isActive(partition)) return false
    const known = canonicalOwner.knownPartitionId(partition)
    if (previous === undefined && known !== undefined && closedKnownRound(partition, known)) return false
    return !state.permits.has(key)
  }

  function issueSyntheticPermit(
    partitionId: number,
    key: string,
    tool: number,
    syntheticNow: number,
    limits: EditPermitLimits
  ): PermitCommand | undefined {
    const issued = canonicalOwner.transition({
      kind: "issuePermit",
      partition: partitionId,
      lifetime: 1,
      tool,
      started: syntheticNow,
      deadline: syntheticNow + bendTime(EDIT_PERMIT_EXPIRY_MS),
      now: syntheticNow,
      minimumStarted: canonicalOwner.minimumFreshStart(),
      facts: {
        clockValid: true,
        hookWindow: bendTime(PRE_EDIT_ADMISSION_DEADLINE_MS),
        startedUpper: syntheticNow,
        nowLower: syntheticNow,
        adviceePermitLimit: limits.perAdvicee,
        residentPermitLimit: limits.resident
      }
    })
    const permit = issued.outputs[0]
    if (permit?.kind === "permitIssued") return permit
    dropTool(key)
    return undefined
  }

  function consumeSyntheticPermit(
    partition: string,
    partitionId: number,
    key: string,
    permit: PermitCommand,
    tool: number,
    syntheticNow: number
  ): number | undefined {
    const consumed = canonicalOwner.consumeEditPermit(partition, {
      kind: "consumePermit",
      partition: partitionId,
      lifetime: 1,
      token: permit.token,
      tool,
      now: syntheticNow
    })
    const command = consumed.outputs[0]
    if (command?.kind === "permitConsumed") return command.round
    releaseCompletedPermit(partition, key, permit)
    return undefined
  }

  function commitSyntheticRound(
    partition: string,
    key: string,
    previous: Round | undefined,
    round: number
  ): number | undefined {
    if (previous === undefined) startRound(partition, DEFAULT_VIRTUAL_ROUND_QUIET_MS)
    if (round !== readGeneration(partition)) {
      finishPermit(key, "consumed")
      return undefined
    }
    finishPermit(key, "consumed")
    return readGeneration(partition)
  }

  function admitInternalEdit(
    partition: string,
    key: string,
    now: number,
    previous: Round | undefined,
    limits: EditPermitLimits
  ): number | undefined {
    if (!internalEditEligible(partition, key, previous)) return undefined
    const partitionId = canonicalOwner.partitionId(partition)
    if (checkCompleted(key)) return undefined
    const tool = toolId(key)
    const syntheticNow = bendTime(Math.max(1, now))
    const permit = issueSyntheticPermit(partitionId, key, tool, syntheticNow, limits)
    if (permit === undefined) return undefined
    const round = consumeSyntheticPermit(partition, partitionId, key, permit, tool, syntheticNow)
    return round === undefined ? undefined : commitSyntheticRound(partition, key, previous, round)
  }
  return { admitInternalEdit }
}
