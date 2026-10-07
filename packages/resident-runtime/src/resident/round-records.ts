import type { Effect } from "effect"
import type { DirectAdvicee } from "@hapsland/native-observation/direct-event/observation"
import type { CapacityLedger } from "./capacity.ts"
import type { BendWorkView } from "./bend-work.ts"

export type WorkCohort = { readonly id: string; readonly controller: AbortController }
export type RoundActivity = {
  readonly root: string
  readonly advicee: DirectAdvicee
  readonly activityPath: string | undefined
}
export interface RoundWork {
  readonly group: string
  readonly generation: number
  readonly canonicalRound: number
  readonly controller: AbortController
}
export type RoundRecord = {
  readonly capability: RoundWork
  readonly work: WorkCohort
  readonly discarded: { readonly queued: number; readonly running: number }
  readonly activity: RoundActivity
}
/** Native cancellation handles may outlive canonical closure until its host cleanup acknowledges retirement. */
export type RoundRecordsState = { readonly entries: ReadonlyMap<string, RoundRecord> }
export const initialRoundRecords = (): RoundRecordsState => ({ entries: new Map() })
export const draftRoundRecords = (state: RoundRecordsState) => ({ entries: new Map(state.entries) })
const snapshotActivity = (activity: RoundActivity): RoundActivity =>
  Object.freeze({
    root: activity.root,
    advicee: Object.freeze({ ...activity.advicee }),
    activityPath: activity.activityPath
  })
export const roundRecordOperations = (
  draft: ReturnType<typeof draftRoundRecords>,
  owner: Pick<CapacityLedger, "roundId" | "retireRound" | "dispatchScope" | "partitionId" | "canonicalProjection">
) => ({
  bind: (
    group: string,
    generation: number,
    activity: RoundActivity,
    create: (canonicalRound: number, partition: number) => Omit<RoundRecord, "activity">
  ): RoundWork => {
    const canonicalRound = owner.roundId(group)
    const partition = owner.partitionId(group)
    const admission = owner.canonicalProjection().admissions.find((entry) => entry.partition === partition)
    if (admission?.active !== true || admission.round !== generation)
      throw new Error("native round binding lacks its canonical admission generation")
    const previous = draft.entries.get(group)
    const record: RoundRecord =
      previous?.capability.generation === generation && previous.capability.canonicalRound === canonicalRound
        ? { ...previous, activity: snapshotActivity(activity) }
        : { ...create(canonicalRound, partition), activity: snapshotActivity(activity) }
    draft.entries.set(group, Object.freeze(record))
    return record.capability
  },
  replaceWork: (
    round: RoundWork,
    work: WorkCohort,
    counts: {
      readonly named: RoundRecord["discarded"]
      readonly all: RoundRecord["discarded"]
      readonly cancelled: number
      readonly hasUnnamed: boolean
    }
  ): { readonly matched: boolean; readonly previousWork: WorkCohort } | undefined => {
    const record = draft.entries.get(round.group)
    if (record?.capability !== round) return undefined
    const matched = owner.dispatchScope(counts.named.queued + counts.named.running, counts.cancelled, counts.hasUnnamed)
    const discarded = matched ? counts.named : counts.all
    draft.entries.set(
      round.group,
      Object.freeze({
        ...record,
        work: Object.freeze({ ...work }),
        discarded: Object.freeze({
          queued: record.discarded.queued + discarded.queued,
          running: record.discarded.running + discarded.running
        })
      })
    )
    return { matched, previousWork: record.work }
  },
  retire: (round: RoundWork): boolean => {
    if (draft.entries.get(round.group)?.capability !== round) return false
    owner.retireRound(round.group, round.canonicalRound)
    draft.entries.delete(round.group)
    return true
  }
})
export interface RoundRecords {
  readonly bind: (
    group: string,
    generation: number,
    activity: RoundActivity,
    cohortId: string
  ) => Effect.Effect<RoundWork>
  readonly get: (group: string) => Effect.Effect<RoundWork | undefined>
  readonly entries: () => Effect.Effect<ReadonlyArray<readonly [string, RoundWork]>>
  readonly activity: (round: RoundWork) => Effect.Effect<RoundActivity | undefined>
  readonly policyWork: (round: RoundWork) => Effect.Effect<BendWorkView>
  readonly snapshot: (round: RoundWork) => Effect.Effect<RoundRecord | undefined>
  readonly replaceWork: (
    ...args: Parameters<ReturnType<typeof roundRecordOperations>["replaceWork"]>
  ) => Effect.Effect<ReturnType<ReturnType<typeof roundRecordOperations>["replaceWork"]>>
  readonly retire: (round: RoundWork) => Effect.Effect<boolean>
}
