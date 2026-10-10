import { monotonicNow, PRE_EDIT_ADMISSION_DEADLINE_MS } from "@hapsland/resident-transport/resident/hook-clock"
import type { CapacityLedger } from "../capacity/operations.ts"
import {
  DEFAULT_EDIT_PERMIT_LIMITS,
  DEFAULT_VIRTUAL_ROUND_QUIET_MS
} from "@hapsland/runtime-inputs/configuration/types"
import type { ReviewSettingsSnapshot } from "@hapsland/review-definition/runtime/review-settings"
import {
  type DeliveryDraft,
  type EditPermitLimits,
  type AdmissionProjection,
  type PermitTransition,
  EDIT_PERMIT_EXPIRY_MS,
  type EditDecision
} from "./model.ts"
import { type DeliveryPorts } from "./ports.ts"

export const deliveryPermitRegistration = (
  state: DeliveryDraft,
  canonicalOwner: Pick<
    CapacityLedger,
    | "transition"
    | "partitionId"
    | "canonicalProjection"
    | "discardUnusedPartition"
    | "minimumFreshStart"
    | "knownPartitionId"
  >,
  {
    advance,
    bendTime,
    bendUpperTime,
    dropTool,
    finishPermit,
    releaseCompletedPermit,
    expirePermits,
    repeatPending,
    checkCompleted,
    toolId
  }: Pick<
    DeliveryPorts,
    | "advance"
    | "bendTime"
    | "bendUpperTime"
    | "dropTool"
    | "finishPermit"
    | "releaseCompletedPermit"
    | "expirePermits"
    | "repeatPending"
    | "checkCompleted"
    | "toolId"
  >
) => {
  function releaseAdmissionPermit(partition: string, token: number): void {
    canonicalOwner.transition({
      kind: "releasePermit",
      partition: canonicalOwner.partitionId(partition),
      lifetime: 1,
      token
    })
  }

  function ensureFromHostTurn(partition: string, marker: string, now: number): boolean {
    return advance(partition, marker, now)
  }

  function registerEdit(partition: string, eventId: string, startedAt: number, now = monotonicNow()): boolean {
    return registerEditDecision(partition, eventId, startedAt, now).accepted
  }

  function positiveFiniteStart(started: number): boolean {
    return Number.isFinite(started) && started > 0
  }

  function prospectivePermitFacts(started: number, now: number, limits: EditPermitLimits) {
    return {
      clockValid: Number.isFinite(now) && positiveFiniteStart(started),
      hookWindow: bendTime(PRE_EDIT_ADMISSION_DEADLINE_MS),
      startedUpper: bendUpperTime(started),
      nowLower: bendTime(now),
      adviceePermitLimit: limits.perAdvicee,
      residentPermitLimit: limits.resident
    }
  }

  function existingAdmission(known: number | undefined): AdmissionProjection | undefined {
    return known === undefined
      ? undefined
      : canonicalOwner.canonicalProjection().admissions.find((item) => item.partition === known)
  }

  function nextAdmissionRound(admission: AdmissionProjection | undefined): number {
    return admission === undefined ? 1 : admission.round + (admission.active ? 0 : 1)
  }

  function discardFailedPermit(partition: string, key: string, known: number | undefined): void {
    dropTool(key)
    if (known === undefined) canonicalOwner.discardUnusedPartition(partition)
  }

  function residentPermitLimitError(error: unknown): boolean {
    if (!(error instanceof RangeError)) return false
    return error.message.includes("resident")
  }

  function permitIssueError(error: unknown): string {
    return residentPermitLimitError(error) ? "ResidentPermitLimit" : "InvalidClock"
  }

  function permitRejectionReason(rejection: PermitTransition["rejection"], clockValid: boolean): string {
    if (rejection === "ProspectiveDenied") return clockValid ? "ProspectiveDenied" : "InvalidClock"
    return rejection ?? "InconsistentLedger"
  }

  function issueProspectivePermit(
    partition: string,
    key: string,
    tool: number,
    started: number,
    now: number,
    facts: ReturnType<typeof prospectivePermitFacts>,
    known: number | undefined
  ) {
    try {
      const result = canonicalOwner.transition({
        kind: "issuePermit",
        partition: canonicalOwner.partitionId(partition),
        lifetime: 1,
        tool,
        started: bendTime(started),
        deadline: bendTime(started + EDIT_PERMIT_EXPIRY_MS),
        now: bendUpperTime(now),
        minimumStarted: canonicalOwner.minimumFreshStart(),
        facts
      })
      return { issued: true as const, result }
    } catch (error) {
      discardFailedPermit(partition, key, known)
      return { issued: false as const, reason: permitIssueError(error) }
    }
  }

  function retainIssuedPermit(
    partition: string,
    key: string,
    tool: number,
    started: number,
    quietMs: number,
    admission: AdmissionProjection | undefined,
    known: number | undefined,
    result: PermitTransition,
    facts: ReturnType<typeof prospectivePermitFacts>
  ): EditDecision {
    const command = result.outputs[0]
    if (result.rejection !== undefined || command?.kind !== "permitIssued") {
      discardFailedPermit(partition, key, known)
      return { accepted: false, reason: permitRejectionReason(result.rejection, facts.clockValid) }
    }
    if (command.round !== nextAdmissionRound(admission)) {
      releaseAdmissionPermit(partition, command.token)
      finishPermit(key, "released")
      return { accepted: false, reason: "StaleRound" }
    }
    state.permits.set(key, {
      partition,
      generation: command.round,
      expiresAt: started + EDIT_PERMIT_EXPIRY_MS,
      token: command.token,
      tool,
      quietMs,
      logged: false
    })
    return { accepted: true }
  }

  function retireEdit(partition: string, eventId: string): void {
    const key = `${partition}\0${eventId}`
    const permit = state.permits.get(key)
    if (permit !== undefined) releaseCompletedPermit(partition, key, permit)
  }

  function registerEditDecision(
    partition: string,
    eventId: string,
    startedAt: number,
    now = monotonicNow(),
    limits: EditPermitLimits = DEFAULT_EDIT_PERMIT_LIMITS,
    quietMs = DEFAULT_VIRTUAL_ROUND_QUIET_MS,
    settings?: ReviewSettingsSnapshot
  ): EditDecision {
    expirePermits(now)
    const key = `${partition}\0${eventId}`
    if (state.permits.has(key)) {
      repeatPending(key)
      return { accepted: true }
    }
    if (checkCompleted(key)) return { accepted: false, reason: "DuplicateTool" }
    const known = canonicalOwner.knownPartitionId(partition)
    const admission = existingAdmission(known)
    // Bend receives upper start/lower now for ordering, and lower start/upper now for its deadline.
    const facts = prospectivePermitFacts(startedAt, now, limits)
    const tool = toolId(key)
    const issued = issueProspectivePermit(partition, key, tool, startedAt, now, facts, known)
    if (!issued.issued) return { accepted: false, reason: issued.reason }
    const decision = retainIssuedPermit(
      partition,
      key,
      tool,
      startedAt,
      quietMs,
      admission,
      known,
      issued.result,
      facts
    )
    const permit = state.permits.get(key)
    if (decision.accepted && permit !== undefined && settings !== undefined)
      state.permits.set(key, { ...permit, settings })
    return decision
  }
  return {
    releaseAdmissionPermit,
    ensureFromHostTurn,
    registerEdit,
    nextAdmissionRound,
    retireEdit,
    registerEditDecision
  }
}
