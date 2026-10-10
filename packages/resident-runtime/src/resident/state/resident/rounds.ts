import {
  draftRoundRecords,
  roundRecordOperations,
  type RoundRecords,
  type RoundWork,
  type WorkCohort
} from "../round-records.ts"
import { workView } from "../../bend-work.ts"
import * as Effect from "effect/Effect"
import { type ResidentTransaction } from "./transaction.ts"
import { capacityOperations } from "../capacity/operations.ts"

import { canonicalProjection } from "../capacity/canonical.ts"

export const residentRounds = <Pending, DispatchKey, DispatchValue>({
  read,
  commitAllEffect,
  residentLifetime
}: ResidentTransaction<Pending, DispatchKey, DispatchValue>) => {
  const roundCommit = <A>(operation: (operations: ReturnType<typeof roundRecordOperations>) => A): Effect.Effect<A> =>
    commitAllEffect((draft, records) => {
      const rounds = draftRoundRecords(records.rounds)
      const owner = capacityOperations(
        (run) => run(draft),
        (run) => run(draft),
        residentLifetime
      )
      const value = operation(roundRecordOperations(rounds, owner))
      return [value, { ...records, rounds }]
    })
  const rounds: RoundRecords = {
    bind: Effect.fn("ResidentState.bindRound")((group, generation, activity, cohortId) =>
      roundCommit((operations) =>
        operations.bind(group, generation, activity, (canonicalRound) => {
          const issuedWork: WorkCohort = Object.freeze({ id: cohortId, controller: new AbortController() })
          const discarded = Object.freeze({ queued: 0, running: 0 })
          const capability: RoundWork = Object.freeze({
            group,
            generation,
            canonicalRound,
            controller: new AbortController()
          })
          return { capability, work: issuedWork, discarded }
        })
      )
    ),
    get: Effect.fn("ResidentState.getRound")((group) =>
      read.pipe(Effect.map((state) => state.records.rounds.entries.get(group)?.capability))
    ),
    entries: Effect.fn("ResidentState.roundEntries")(() =>
      read.pipe(
        Effect.map((state) =>
          [...state.records.rounds.entries].map(([group, record]) => [group, record.capability] as const)
        )
      )
    ),
    activity: Effect.fn("ResidentState.roundActivity")((round) =>
      read.pipe(
        Effect.map((state) => {
          const record = state.records.rounds.entries.get(round.group)
          return record?.capability === round ? record.activity : undefined
        })
      )
    ),
    snapshot: Effect.fn("ResidentState.roundSnapshot")((round) =>
      read.pipe(
        Effect.map((state) => {
          const record = state.records.rounds.entries.get(round.group)
          return record?.capability === round ? record : undefined
        })
      )
    ),
    policyWork: Effect.fn("ResidentState.roundPolicyWork")((round) =>
      read.pipe(
        Effect.map((state) => {
          const partition = state.partitionIds.get(round.group)
          const current = state.records.rounds.entries.get(round.group)?.capability === round
          return workView(
            current && partition !== undefined ? canonicalProjection(state) : { work: [], pendingFindings: [] },
            partition ?? 0,
            round.canonicalRound
          )
        })
      )
    ),
    replaceWork: Effect.fn("ResidentState.replaceRoundWork")((...args) =>
      roundCommit((operations) => operations.replaceWork(...args))
    ),
    retire: Effect.fn("ResidentState.retireRound")((round) => roundCommit((operations) => operations.retire(round)))
  }
  return rounds
}
