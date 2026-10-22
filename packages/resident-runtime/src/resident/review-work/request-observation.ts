/** Reports a locally tracked review-service request lifecycle; an HTTP call may never have occurred. */
export type ReviewServiceRequestObservation = {
  readonly stage: "issued" | "unavailable" | "started" | "interrupted" | "settled"
  readonly partition: string
  readonly canonicalPartition: number
  readonly lifetime: string
  readonly canonicalLifetimeId: number
  readonly round: number
  readonly admissionRoundId: number | null
  readonly operation: number
  readonly reviewServiceRequestId?: number
  readonly outcome?: "neverSent" | "finding" | "clear" | "backendFailure" | "timeout" | "interrupted"
}
