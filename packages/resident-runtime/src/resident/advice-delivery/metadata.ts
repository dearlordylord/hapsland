export type PendingAdviceMetadata = ReadonlyArray<{
  readonly id: string
  readonly partition: string
  readonly sequence: number
  readonly pendingAt: number
  readonly collectionEligible: boolean
  readonly retainedBytes: number
  readonly generation: number
  readonly evaluationIdentities: ReadonlyArray<string>
  readonly path: string
  readonly pendingFindings: number
  readonly deliveryFindings: number
  readonly delivery: "available" | "leased-unacknowledged" | "leased-acknowledged"
}>

export type AccountingMetrics = {
  readonly peakLedgerBytes: number
  readonly maxMaterializedPreparedUnits: number
  readonly successfulCacheEntries: number
  readonly successfulCacheBytes: number
  readonly pendingEvaluations: number
  readonly operationalNoticeKeys: number
  readonly pendingOperationalNotices: number
  readonly operationalNoticeBytes: number
}
