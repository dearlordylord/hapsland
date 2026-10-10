import { initialAdviceRecords } from "../advice-records.ts"
import { initialNoticeRecords } from "../notice-records.ts"
import { initialRoundRecords } from "../round-records.ts"
import { initialJoinedReviews } from "../joined-reviews.ts"
import { initialRevision } from "../revision.ts"
import { initialDispatchRegistry } from "../dispatch.ts"
import { initialDelivery } from "../delivery/operations.ts"
import { initialEvaluationReuse } from "../evaluation-reuse.ts"
import * as Effect from "effect/Effect"

import { clear } from "../capacity/reservations.ts"

import type { ResidentTransaction } from "./transaction.ts"
export const residentLifecycle = <Pending, DispatchKey, DispatchValue>({
  commitAllEffect
}: ResidentTransaction<Pending, DispatchKey, DispatchValue>) => ({
  clear: Effect.fn("ResidentState.clear")(() =>
    commitAllEffect((draft, records) => {
      const dispatch = records.dispatch
      if (dispatch.entries.size !== 0) throw new Error("resident state cannot clear outstanding native dispatch jobs")
      if (records.adviceCaptures.size !== 0) throw new Error("resident state cannot clear outstanding advice captures")
      return [
        clear(draft),
        {
          runtime: records.runtime,
          adviceCaptures: new Map(),
          advice: initialAdviceRecords(),
          reuse: initialEvaluationReuse<Pending>(),
          delivery: initialDelivery(),
          revision: initialRevision(),
          joined: initialJoinedReviews(),
          rounds: initialRoundRecords(),
          notices: initialNoticeRecords(),
          dispatch: {
            ...initialDispatchRegistry<DispatchKey, DispatchValue>(),
            executorAttached: dispatch.executorAttached
          }
        }
      ]
    })
  )
})
