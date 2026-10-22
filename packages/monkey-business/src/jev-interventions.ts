import type { ReviewServiceRequestOutcome } from "@hapsland/canonical-policy/canonical/adapter"

export type ReviewServiceRequestTarget = {
  readonly partition: number
  readonly lifetime: number
  readonly round: number
  readonly operation: number
  readonly reviewServiceRequestId: number
}
export type ReviewServiceRequestControl = {
  readonly kind: "reviewServiceRequest"
  readonly target: ReviewServiceRequestTarget
  readonly outcome: ReviewServiceRequestOutcome
}
export type CredentialsControl = { readonly kind: "credentials"; readonly action: "unavailable" | "restore" | "rotate" }
export type ReviewServiceInterventionControl = ReviewServiceRequestControl | CredentialsControl
export type ReviewServiceInterventionRefusal = "requestMissing" | "requestAlreadyStarted" | "requestAlreadyInterrupted"
export type ReviewServiceInterventionReport = {
  readonly controlSequence: number
  readonly at: number
  readonly control: ReviewServiceInterventionControl
  readonly result: "applied" | ReviewServiceInterventionRefusal
}

const outcomes: ReadonlyArray<ReviewServiceRequestOutcome> = [
  "neverSent",
  "finding",
  "clear",
  "backendFailure",
  "timeout",
  "interrupted"
]
const identity = (value: number, name: string): number => {
  if (!Number.isSafeInteger(value) || value < 1 || value >= 2 ** 48) {
    throw new RangeError(`${name} must be a positive exact u48 identity`)
  }
  return value
}

/** Validation and immutable projection only; shared Bend determines applicability. */
export const validateReviewServiceIntervention = (
  control: ReviewServiceInterventionControl
): ReviewServiceInterventionControl => {
  if (!control || typeof control !== "object") throw new TypeError("invalid Jev intervention")
  if (control.kind === "credentials") {
    if (!["unavailable", "restore", "rotate"].includes(control.action)) throw new TypeError("invalid credential action")
    return Object.freeze({ kind: "credentials", action: control.action })
  }
  if (control.kind !== "reviewServiceRequest" || !control.target || !outcomes.includes(control.outcome)) {
    throw new TypeError("invalid targeted Jev intervention")
  }
  const target = Object.freeze({
    partition: identity(control.target.partition, "partition"),
    lifetime: identity(control.target.lifetime, "lifetime"),
    round: identity(control.target.round, "round"),
    operation: identity(control.target.operation, "operation"),
    reviewServiceRequestId: identity(control.target.reviewServiceRequestId, "reviewServiceRequestId")
  })
  return Object.freeze({ kind: "reviewServiceRequest", target, outcome: control.outcome })
}
