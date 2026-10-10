import { deliveryFinishAuthorization } from "./finish-authorization.ts"
import type { CapacityLedger } from "../capacity/operations.ts"
import {
  type DeliveryDraft,
  type PermitTransition,
  type FinishOutputRoute,
  type Submission,
  fingerprint,
  type StopRecord,
  type Round
} from "./model.ts"
import { type DeliveryPorts } from "./ports.ts"

export const deliveryFinishOutput = (
  state: DeliveryDraft,
  canonicalOwner: Pick<
    CapacityLedger,
    "transition" | "partitionId" | "roundId" | "collectionTokenId" | "canonicalProjection"
  >,
  ports: Pick<
    DeliveryPorts,
    "submissionAdviceId" | "stageSubmission" | "release" | "fingerprintId" | "isActive" | "isDeciding"
  >
) => {
  const { submissionAdviceId, stageSubmission, release } = ports
  function reserveFinishOutput(
    partition: string,
    attempt: string,
    outputToken: string,
    advice: ReadonlyArray<{ readonly id: string; readonly unit: number; readonly findings: ReadonlyArray<unknown> }>,
    now: number
  ): boolean {
    return (
      decideFinishOutput(partition, attempt, outputToken, advice, now, false, false, true, true, false).kind ===
      "reserved"
    )
  }

  const finishReservationRoutes: Partial<Record<PermitTransition["outputs"][number]["kind"], FinishOutputRoute>> = {
    finishNotices: { kind: "notices" },
    finishAllowedNoAdvice: { kind: "allowed", reason: "no-advice" },
    finishAllowedDeadline: { kind: "allowed", reason: "deadline" },
    finishAllowedUnavailable: { kind: "allowed", reason: "unavailable" },
    finishReserved: { kind: "reserved" }
  }

  function finishReservationRoute(kind: PermitTransition["outputs"][number]["kind"] | undefined): FinishOutputRoute {
    return kind === undefined ? { kind: "failed" } : (finishReservationRoutes[kind] ?? { kind: "failed" })
  }

  function canonicalCommandAccepted(
    result: PermitTransition,
    expected: PermitTransition["outputs"][number]["kind"]
  ): boolean {
    return result.rejection === undefined && result.outputs[0]?.kind === expected
  }

  function rollbackStagedSubmission(id: string, token: string, submission: Submission): void {
    const rollback = canonicalOwner.transition({
      kind: "submissionRelease",
      advice: submissionAdviceId(id),
      token: submission.batches.get(token)!.id
    })
    if (!canonicalCommandAccepted(rollback, "submissionReleased"))
      throw new Error("canonical staged submission rollback refused")
  }

  function rollbackStagedSubmissions(
    staged: ReadonlyArray<readonly [string, Submission | undefined]>,
    token: string
  ): void {
    staged.forEach(([id, submission]) => {
      if (submission !== undefined) rollbackStagedSubmission(id, token, submission)
    })
  }

  function decideFinishOutput(
    partition: string,
    attempt: string,
    outputToken: string,
    advice: ReadonlyArray<{ readonly id: string; readonly unit: number; readonly findings: ReadonlyArray<unknown> }>,
    now: number,
    hasNotice: boolean,
    passNotices: boolean,
    canWrite: boolean,
    bindingValid: boolean,
    deadlineReached: boolean
  ):
    | { readonly kind: "reserved" | "notices" | "failed" }
    | { readonly kind: "allowed"; readonly reason: "no-advice" | "deadline" | "unavailable" } {
    const stop = state.stops.get(partition)
    const round = state.rounds.get(partition)
    if (stop?.token !== attempt || round === undefined) return { kind: "failed" }
    const selected = advice.flatMap((item) => item.findings.map(() => item.unit))
    const group = canonicalOwner.partitionId(partition)
    const currentRound = canonicalOwner.roundId(partition)
    const tokenId = canonicalOwner.collectionTokenId(outputToken)
    const decision = canonicalOwner.transition({
      kind: "finishReserve",
      group,
      lifetime: 1,
      round: currentRound,
      attempt: stop.id,
      token: tokenId,
      selected,
      hasNotice,
      passNotices,
      canWrite,
      bindingValid,
      deadlineReached
    })
    if (decision.rejection !== undefined) return { kind: "failed" }
    const route = finishReservationRoute(decision.outputs[0]?.kind)
    if (route.kind !== "reserved") return route
    const staged = advice.map(
      (item) =>
        [
          item.id,
          stageSubmission(item.id, partition, outputToken, item.findings, "stop", now, "reserved", item.unit)
        ] as const
    )
    if (staged.some(([, submission]) => submission === undefined)) {
      rollbackStagedSubmissions(staged, outputToken)
      canonicalOwner.transition({ kind: "finishRelease", group, round: currentRound, attempt: stop.id, token: tokenId })
      return { kind: "failed" }
    }
    stop.outputToken = outputToken
    state.finishPermits.set(outputToken, {
      partition,
      generation: stop.generation,
      attempt,
      selected,
      advice: advice.map((item) => ({ id: item.id, fingerprints: item.findings.map(fingerprint) })),
      authorized: false,
      terminal: false,
      revoked: false
    })
    for (const [id, submission] of staged) state.submissions.set(id, submission!)
    return { kind: "reserved" }
  }

  function provisionalStopCurrent(
    stop: StopRecord | undefined,
    round: Round | undefined,
    attempt: string,
    token: string
  ): stop is StopRecord {
    return stop?.token === attempt && stop.outputToken === token && round !== undefined
  }

  function revokeProvisionalFinishOutput(partition: string, attempt: string, outputToken: string): boolean {
    const stop = state.stops.get(partition)
    const round = state.rounds.get(partition)
    const permit = state.finishPermits.get(outputToken)
    if (!provisionalStopCurrent(stop, round, attempt, outputToken)) return false
    if (permit === undefined || permit.authorized) return false
    const released = canonicalOwner.transition({
      kind: "finishRelease",
      group: canonicalOwner.partitionId(partition),
      round: canonicalOwner.roundId(partition),
      attempt: stop.id,
      token: canonicalOwner.collectionTokenId(outputToken)
    })
    if (released.rejection !== undefined || released.outputs[0]?.kind !== "finishReleased") return false
    permit.revoked = true
    release(outputToken)
    state.finishPermits.delete(outputToken)
    delete stop.outputToken
    return true
  }

  const { finishSelectionMatches, authorizeFinishOutput } = deliveryFinishAuthorization(state, canonicalOwner, {
    ...ports
  })
  return {
    reserveFinishOutput,
    canonicalCommandAccepted,
    decideFinishOutput,
    revokeProvisionalFinishOutput,
    finishSelectionMatches,
    authorizeFinishOutput
  }
}
