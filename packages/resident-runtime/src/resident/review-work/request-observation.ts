export type JevRequestObservation = {
  readonly stage: "issued" | "unavailable" | "started" | "interrupted" | "settled"
  readonly partition: string
  readonly canonicalPartition: number
  readonly lifetime: string
  readonly canonicalLifetime: number
  readonly round: number
  readonly hapslandRound: number | null
  readonly operation: number
  readonly request?: number
  readonly outcome?: "neverSent" | "finding" | "clear" | "backendFailure" | "timeout" | "interrupted"
}
