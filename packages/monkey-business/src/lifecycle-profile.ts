/** Source-free environment facts; all eligibility and capacity decisions remain in Bend. */
export type LifecycleProfile = {
  readonly collectors?: { readonly capacity: number; readonly lifetimeMs?: number }
  readonly reuse?: { readonly entryLimit: number; readonly byteLimit: number }
  /** Quiet closure requires an active admission, normally supplied by permits. */
  readonly quietWindowMs?: number
  /** Supplied whole-response encoding fact; no native serialization is measured. */
  readonly encodedOutputBytes?: number
  readonly cancellation?: "lateCallback" | "suppressed"
}

/** Captured at the viewing boundary; absent limits have never been supplied to this replay. */
export type CapacityMetadata = {
  readonly demoAgentCount?: number
  /** Groups explicitly supplied by the synthetic resident driver, independent of occupancy. */
  readonly deliveryGroups?: readonly { readonly partition: number; readonly group: number }[]
  readonly permits?: {
    /** A common limit supplied by the generated resident configuration, never inferred from one agent's facts. */
    readonly adviceeLimit?: number
    readonly residentLimit: number
    readonly adviceeLimits?: readonly { readonly partition: number; readonly limit: number }[]
  }
  readonly collectors?: { readonly capacity: number }
  readonly reuse?: { readonly entryLimit: number; readonly byteLimit: number }
  readonly notices?: { readonly maximumKeys: number }
  readonly encodedOutput?: {
    readonly bytes: number
    readonly maximumBytes: 10240
    readonly synthetic: true
    readonly items: number
    readonly decision?: "fits" | "limited"
  }
  readonly continuationBudget: 4
  readonly preparationWorkers: 8
  readonly jevRequests: 8
}
