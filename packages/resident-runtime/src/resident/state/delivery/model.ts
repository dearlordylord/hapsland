import { createHash } from "node:crypto"
import { canonicalValue } from "@hapsland/review-definition/direct-event/model"
import type { CapacityLedger } from "../capacity/operations.ts"
import type { CompletedEditReason } from "@hapsland/canonical-policy/canonical/adapter"
import { DEFAULT_VIRTUAL_ROUND_QUIET_MS } from "@hapsland/runtime-inputs/configuration/types"
import type { ReviewSettingsSnapshot } from "@hapsland/review-definition/runtime/review-settings"

/** Shared round and source-free handoff state for every agent runtime. */
export const MAX_BACKGROUND_WAITERS = 64
export const EDIT_PERMIT_EXPIRY_MS = 30_000
export const BACKGROUND_WAITER_EXPIRY_MS = 20_000
export const VIRTUAL_ROUND_QUIET_MS = DEFAULT_VIRTUAL_ROUND_QUIET_MS
export type Round = { readonly quietMs: number }
export type RepeatEditDiagnostic = {
  readonly kind: "repeat-edit-id"
  readonly phase: "pending" | "completed"
  readonly completedReason?: CompletedEditReason
  readonly identityDigest: string
}
export type DeliverySurface = "edit" | "background" | "stop"
export type SubmissionBatch = {
  readonly id: number
  readonly surface: DeliverySurface
  readonly at: number
  readonly fingerprints: ReadonlySet<string>
  status: "reserved" | "authorized" | "uncertain" | "submitted"
}
export type Submission = {
  readonly partition: string
  readonly generation: number
  readonly batches: Map<string, SubmissionBatch>
}
export const fingerprint = (finding: unknown): string =>
  createHash("sha256").update(canonicalValue(finding)).digest("hex")
export type EditAdmission = { readonly generation: number; readonly settings?: ReviewSettingsSnapshot }
export type EditPermit = {
  readonly settings?: ReviewSettingsSnapshot
  readonly partition: string
  readonly generation: number
  readonly expiresAt: number
  readonly token: number
  readonly tool: number
  readonly quietMs: number
  logged: boolean
}
export type StopRecord = {
  token: string
  id: number
  generation: number
  canonicalRound: number
  continuationsAtStart: number
  outputToken?: string
}
export type FinishPermit = {
  readonly partition: string
  readonly generation: number
  readonly attempt: string
  readonly selected: ReadonlyArray<number>
  readonly advice: ReadonlyArray<{ readonly id: string; readonly fingerprints: ReadonlyArray<string> }>
  authorized: boolean
  terminal: boolean
  revoked: boolean
}
export type DeliveryState = {
  readonly rounds: ReadonlyMap<string, Round>
  readonly permits: ReadonlyMap<string, EditPermit>
  readonly toolIds: ReadonlyMap<string, number>
  readonly toolKeys: ReadonlyMap<number, string>
  readonly nextToolId: number
  readonly stops: ReadonlyMap<string, StopRecord>
  readonly nextStopId: number
  readonly submissions: ReadonlyMap<string, Submission>
  readonly finishPermits: ReadonlyMap<string, FinishPermit>
  readonly backgroundWaiters: ReadonlyMap<string, { readonly token: string; readonly id: number; readonly at: number }>
}
export type DeliveryDraft = {
  -readonly [K in keyof DeliveryState]: DeliveryState[K] extends ReadonlyMap<infer Key, infer Value>
    ? Map<Key, Value>
    : DeliveryState[K]
}
export const initialDelivery = (): DeliveryState => ({
  rounds: new Map(),
  permits: new Map(),
  toolIds: new Map(),
  toolKeys: new Map(),
  nextToolId: 1,
  stops: new Map(),
  nextStopId: 1,
  submissions: new Map(),
  finishPermits: new Map(),
  backgroundWaiters: new Map()
})
export const draftDelivery = (current: DeliveryState): DeliveryDraft => ({
  ...current,
  rounds: new Map(current.rounds),
  toolIds: new Map(current.toolIds),
  toolKeys: new Map(current.toolKeys),
  permits: new Map([...current.permits].map(([key, value]) => [key, { ...value }])),
  stops: new Map([...current.stops].map(([key, value]) => [key, { ...value }])),
  submissions: new Map(
    [...current.submissions].map(([key, value]) => [
      key,
      { ...value, batches: new Map([...value.batches].map(([token, batch]) => [token, { ...batch }])) }
    ])
  ),
  finishPermits: new Map([...current.finishPermits].map(([key, value]) => [key, { ...value }])),
  backgroundWaiters: new Map(current.backgroundWaiters)
})
/** Check native permit and waiter ownership before publishing the draft. */
export const assertDeliveryState = (state: DeliveryState, owner: CapacityLedger): void => {
  const projection = owner.canonicalProjection()
  if (
    state.toolIds.size !== state.toolKeys.size ||
    [...state.toolIds].some(([key, id]) => state.toolKeys.get(id) !== key) ||
    projection.completedEdits.some((entry) => !state.toolKeys.has(entry.tool)) ||
    [...state.permits.values()].some((permit) => {
      const partition = owner.knownPartitionId(permit.partition)
      return !projection.admissions.some(
        (admission) =>
          admission.partition === partition &&
          admission.permits.some(
            (native) =>
              native.token === permit.token && native.tool === permit.tool && native.round === permit.generation
          )
      )
    }) ||
    [...state.backgroundWaiters].some(
      ([partition, waiter]) =>
        !projection.collection.claims.some(
          (claim) => claim.group === owner.knownPartitionId(partition) && claim.owner === waiter.id
        )
    )
  ) {
    throw new Error("native delivery handles differ from canonical state")
  }
}
export type AdmissionProjection = ReturnType<CapacityLedger["canonicalProjection"]>["admissions"][number]
export type PermitTransition = ReturnType<CapacityLedger["transition"]>
export type PermitCommand = Extract<PermitTransition["outputs"][number], { kind: "permitIssued" }>
export type EditDecision = { readonly accepted: true } | { readonly accepted: false; readonly reason: string }
export type EditPermitLimits = { readonly perAdvicee: number; readonly resident: number }
export type FinishOutputRoute =
  | { readonly kind: "reserved" | "notices" | "failed" }
  | { readonly kind: "allowed"; readonly reason: "no-advice" | "deadline" | "unavailable" }
export type MatchingSubmission = {
  readonly id: string
  readonly submission: Submission
  readonly batch: SubmissionBatch
}
