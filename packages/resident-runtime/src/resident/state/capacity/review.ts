import { type stepCanonical, type JevRequestOutcome } from "@hapsland/canonical-policy/canonical/adapter"
import { type CapacityDraft, type CapacityReservation } from "./model.ts"
import { transition } from "./canonical.ts"
import { partitionId } from "./identities.ts"
import { setReservationMetadata } from "./reservations.ts"

export function startReview(draft: CapacityDraft, partition: string, operation: number, round: number): boolean {
  const result = transition(draft, {
    kind: "startReview",
    partition: partitionId(draft, partition),
    lifetime: 1,
    round,
    operation
  })
  return result.rejection === undefined && result.outputs[0]?.kind === "reviewStarted"
}
export function readyJevRequest(
  draft: CapacityDraft,
  partition: string,
  operation: number,
  reservation: CapacityReservation,
  facts: {
    readonly rootValid: boolean
    readonly configurationValid: boolean
    readonly credentialReady: boolean
    readonly selected: boolean
    readonly currentWork: boolean
    readonly physicalAvailable: boolean
  },
  round: number
):
  | { readonly status: "issued"; readonly request: number; readonly round: number }
  | { readonly status: "unavailable"; readonly round: number }
  | { readonly status: "stale" } {
  if (draft.reservations.get(reservation.id)?.capability !== reservation) return { status: "stale" }
  const result = transition(draft, {
    kind: "jevRequestReady",
    partition: partitionId(draft, partition),
    lifetime: 1,
    round,
    operation,
    ...facts
  })
  if (result.rejection !== undefined) return { status: "stale" }
  const issued = result.outputs[0]
  if (issued?.kind === "jevRequestIssued") {
    draft.requestRounds.set(issued.request, { partition, round })
    return { status: "issued", request: issued.request, round }
  }
  if (result.outputs.at(-1)?.kind !== "jevRequestUnavailable") throw new Error("invalid canonical request readiness")
  draft.reservations.delete(reservation.id)
  return { status: "unavailable", round }
}
export function startJevRequest(draft: CapacityDraft, partition: string, operation: number, request: number): boolean {
  const identity = draft.requestRounds.get(request)
  if (identity?.partition !== partition) return false
  const result = transition(draft, {
    kind: "jevRequestStarted",
    partition: partitionId(draft, partition),
    lifetime: 1,
    round: identity.round,
    operation,
    request
  })
  return result.rejection === undefined && result.outputs[0]?.kind === "jevRequestStartRecorded"
}
export function interruptJevRequest(
  draft: CapacityDraft,
  partition: string,
  operation: number,
  request: number
): boolean {
  const identity = draft.requestRounds.get(request)
  if (identity?.partition !== partition) return false
  const result = transition(draft, {
    kind: "jevRequestInterrupted",
    partition: partitionId(draft, partition),
    lifetime: 1,
    round: identity.round,
    operation,
    request
  })
  return result.rejection === undefined && result.outputs[0]?.kind === "jevInterruptionRecorded"
}
type ReviewDisposition = "findingRetained" | "clearSettled" | "staleClearSettled" | "staleFindingRetired"
function isReviewDisposition(kind: string | undefined): kind is ReviewDisposition {
  return (
    kind === "findingRetained" ||
    kind === "clearSettled" ||
    kind === "staleClearSettled" ||
    kind === "staleFindingRetired"
  )
}
function applySettledReservation(
  draft: CapacityDraft,
  reservation: CapacityReservation,
  choice: string | undefined
): void {
  if (draft.reservations.get(reservation.id)?.capability !== reservation) return
  if (choice === "findingRetained") setReservationMetadata(draft, reservation, undefined, "storedResult")
  else draft.reservations.delete(reservation.id)
}
function settledRequestChoice(
  draft: CapacityDraft,
  reservation: CapacityReservation,
  result: ReturnType<typeof stepCanonical>
): ReviewDisposition | "unavailable" {
  const choice = result.outputs.at(-2)?.kind
  applySettledReservation(draft, reservation, choice)
  if (isReviewDisposition(choice)) return choice
  if (result.outputs.some((command) => command.kind === "reviewRecorded")) return "unavailable"
  throw new Error("invalid canonical request outcome")
}
export function settleJevRequest(
  draft: CapacityDraft,
  partition: string,
  operation: number,
  request: number,
  reservation: CapacityReservation,
  outcome: JevRequestOutcome,
  currentWork: boolean
):
  | "findingRetained"
  | "clearSettled"
  | "staleClearSettled"
  | "staleFindingRetired"
  | "unavailable"
  | "ignored"
  | "stale" {
  const identity = draft.requestRounds.get(request)
  if (identity?.partition !== partition) return "stale"
  const result = transition(draft, {
    kind: "jevRequestSettled",
    partition: partitionId(draft, partition),
    lifetime: 1,
    round: identity.round,
    operation,
    request,
    outcome,
    currentWork
  })
  if (result.rejection !== undefined) return "stale"
  draft.requestRounds.delete(request)
  const disposition = result.outputs.at(-1)?.kind
  if (disposition === "jevObservationIgnored") return "ignored"
  if (disposition !== "jevRequestOutcomeRecorded") throw new Error("invalid canonical request settlement")
  return settledRequestChoice(draft, reservation, result)
}
export function completeReview(
  draft: CapacityDraft,
  partition: string,
  operation: number,
  reservation: CapacityReservation,
  outcome: "finding" | "clear" | "unavailable" | "interrupted" | "discarded",
  round: number
): boolean {
  if (draft.reservations.get(reservation.id)?.capability !== reservation) return false
  const result = transition(draft, {
    kind: "reviewCompleted",
    partition: partitionId(draft, partition),
    lifetime: 1,
    round,
    operation,
    outcome
  })
  if (result.rejection !== undefined || result.outputs.at(-1)?.kind !== "reviewRecorded") return false
  if (outcome === "finding") setReservationMetadata(draft, reservation, undefined, "storedResult")
  else draft.reservations.delete(reservation.id)
  return true
}
export function observeReview(
  draft: CapacityDraft,
  partition: string,
  operation: number,
  reservation: CapacityReservation,
  outcome: "finding" | "clear",
  currentWork: boolean,
  round: number
): "findingRetained" | "clearSettled" | "staleClearSettled" | "staleFindingRetired" {
  if (draft.reservations.get(reservation.id)?.capability !== reservation) throw new Error("unknown review reservation")
  const result = transition(draft, {
    kind: "reviewObserved",
    partition: partitionId(draft, partition),
    lifetime: 1,
    round,
    operation,
    outcome,
    currentWork
  })
  const disposition = result.outputs.at(-1)?.kind
  if (result.rejection !== undefined || !isReviewDisposition(disposition)) {
    throw new Error("canonical review observation refused")
  }
  if (disposition === "findingRetained") setReservationMetadata(draft, reservation, undefined, "storedResult")
  else draft.reservations.delete(reservation.id)
  return disposition
}
export function preparedOffer(
  draft: CapacityDraft,
  ready: boolean,
  withinFrame: boolean
): "preparedSkipped" | "preparedAdmitted" | "preparedCapacityRefused" {
  const command = transition(draft, { kind: "preparedOfferCheck", ready, withinFrame }).outputs[0]?.kind
  if (command !== "preparedSkipped" && command !== "preparedAdmitted" && command !== "preparedCapacityRefused") {
    throw new Error("canonical prepared offer refused")
  }
  return command
}
export function emptyPrepared(
  draft: CapacityDraft,
  readyCount: number,
  hasNonSkipped: boolean,
  authorityBound: boolean
): boolean {
  const command = transition(draft, { kind: "emptyPreparedCheck", readyCount, hasNonSkipped, authorityBound })
    .outputs[0]?.kind
  if (command !== "emptyLost" && command !== "emptyAccepted") throw new Error("canonical empty preparation refused")
  return command === "emptyLost"
}
export function reviewFailure(
  draft: CapacityDraft,
  backendOrTimeout: boolean,
  credential: boolean,
  missing: boolean
): "failureBackend" | "failureCredential" | "failureLost" | "failureNone" {
  const command = transition(draft, { kind: "reviewFailureCheck", backendOrTimeout, credential, missing }).outputs[0]
    ?.kind
  if (
    command !== "failureBackend" &&
    command !== "failureCredential" &&
    command !== "failureLost" &&
    command !== "failureNone"
  ) {
    throw new Error("canonical review failure classification refused")
  }
  return command
}
