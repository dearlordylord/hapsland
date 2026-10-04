/** Native lifetime facts; Bend remains the authority for cleanup permission. */
export type ResidentConnection = { readonly lifetime: string }
export type RuntimeRecordsState = {
  readonly lifecycle: "active" | "retiring" | "closed"
  readonly connections: ReadonlySet<ResidentConnection>
  readonly retirementScheduled: boolean
  readonly rejectedCapacity: number
  readonly peakLedgerBytes: number
  readonly maxMaterializedPreparedUnits: number
  readonly nextDispatchAuthoritySequence: number
}
export type RuntimeRecordsDraft = {
  -readonly [K in keyof RuntimeRecordsState]: RuntimeRecordsState[K] extends ReadonlySet<infer A>
    ? Set<A>
    : RuntimeRecordsState[K]
}
export const initialRuntimeRecords = (): RuntimeRecordsState => ({
  lifecycle: "active",
  connections: new Set(),
  retirementScheduled: false,
  rejectedCapacity: 0,
  peakLedgerBytes: 0,
  maxMaterializedPreparedUnits: 0,
  nextDispatchAuthoritySequence: 1
})
export const draftRuntimeRecords = (current: RuntimeRecordsState): RuntimeRecordsDraft => ({
  ...current,
  connections: new Set(current.connections)
})
export const runtimeRecordView = (current: RuntimeRecordsState) =>
  Object.freeze({
    lifecycle: current.lifecycle,
    connections: current.connections.size,
    retirementScheduled: current.retirementScheduled,
    rejectedCapacity: current.rejectedCapacity,
    peakLedgerBytes: current.peakLedgerBytes,
    maxMaterializedPreparedUnits: current.maxMaterializedPreparedUnits
  })
export const runtimeRecordOperations = (draft: RuntimeRecordsDraft, lifetime: string) => ({
  openConnection: (maximum: number): ResidentConnection | undefined => {
    if (draft.connections.size >= maximum) return undefined
    const connection = Object.freeze({ lifetime })
    draft.connections.add(connection)
    return connection
  },
  releaseConnection: (connection: ResidentConnection): boolean => draft.connections.delete(connection),
  rejectCapacity: (): void => {
    draft.rejectedCapacity = Math.min(Number.MAX_SAFE_INTEGER, draft.rejectedCapacity + 1)
  },
  observePreparedUnits: (units: number): void => {
    draft.maxMaterializedPreparedUnits = Math.max(draft.maxMaterializedPreparedUnits, units)
  },
  nextAuthoritySequence: (): number => {
    if (draft.nextDispatchAuthoritySequence >= Number.MAX_SAFE_INTEGER)
      throw new Error("resident authority sequence exhausted")
    return draft.nextDispatchAuthoritySequence++
  },
  scheduleRetirement: (): boolean => {
    if (draft.lifecycle !== "retiring" || draft.retirementScheduled) return false
    draft.retirementScheduled = true
    return true
  },
  retire: (): void => {
    if (draft.lifecycle !== "active") throw new Error("resident lifetime cannot retire twice")
    draft.lifecycle = "retiring"
  },
  close: (): void => {
    draft.lifecycle = "closed"
  }
})
