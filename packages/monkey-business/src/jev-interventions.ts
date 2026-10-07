import type { JevRequestOutcome } from "@hapsland/canonical-policy/canonical/adapter"

export type JevRequestTarget = {
  readonly partition: number
  readonly lifetime: number
  readonly round: number
  readonly operation: number
  readonly request: number
}
export type JevRequestControl = {
  readonly kind: "jevRequest"
  readonly target: JevRequestTarget
  readonly outcome: JevRequestOutcome
}
export type CredentialsControl = { readonly kind: "credentials"; readonly action: "unavailable" | "restore" | "rotate" }
export type JevInterventionControl = JevRequestControl | CredentialsControl
export type JevInterventionRefusal = "requestMissing" | "requestAlreadyStarted" | "requestAlreadyInterrupted"
export type JevInterventionReport = {
  readonly controlSequence: number
  readonly at: number
  readonly control: JevInterventionControl
  readonly result: "applied" | JevInterventionRefusal
}

const outcomes: ReadonlyArray<JevRequestOutcome> = [
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
export const validateJevIntervention = (control: JevInterventionControl): JevInterventionControl => {
  if (!control || typeof control !== "object") throw new TypeError("invalid Jev intervention")
  if (control.kind === "credentials") {
    if (!["unavailable", "restore", "rotate"].includes(control.action)) throw new TypeError("invalid credential action")
    return Object.freeze({ kind: "credentials", action: control.action })
  }
  if (control.kind !== "jevRequest" || !control.target || !outcomes.includes(control.outcome)) {
    throw new TypeError("invalid targeted Jev intervention")
  }
  const target = Object.freeze({
    partition: identity(control.target.partition, "partition"),
    lifetime: identity(control.target.lifetime, "lifetime"),
    round: identity(control.target.round, "round"),
    operation: identity(control.target.operation, "operation"),
    request: identity(control.target.request, "request")
  })
  return Object.freeze({ kind: "jevRequest", target, outcome: control.outcome })
}
