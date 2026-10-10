import {
  draftEvaluationReuse,
  evaluationReuseOperations,
  evaluationReuseView,
  residentEvaluationIdentity,
  type EvaluationReuse
} from "../evaluation-reuse.ts"
import * as Effect from "effect/Effect"
import { type ResidentTransaction } from "./transaction.ts"
import { capacityOperations } from "../capacity/operations.ts"

import { draftCapacity } from "../capacity/model.ts"

export const residentReuse =
  <Pending, DispatchKey, DispatchValue>({
    read,
    commitAllEffect,
    residentLifetime
  }: ResidentTransaction<Pending, DispatchKey, DispatchValue>) =>
  (logicalBytes: (value: unknown) => number) => {
    const reuseCommit = <A>(operation: (operations: EvaluationReuse<Pending>) => A): Effect.Effect<A> =>
      commitAllEffect((draft, records) => {
        const current = records.reuse
        const reuse = draftEvaluationReuse(current)
        const operations = evaluationReuseOperations(
          reuse,
          capacityOperations(
            (run) => run(draft),
            (run) => run(draft),
            residentLifetime
          ),
          logicalBytes
        )
        const value = operation(operations)
        operations.snapshot()
        return [value, { ...records, reuse }]
      })
    const reuseRead = <A>(operation: (view: ReturnType<typeof evaluationReuseView<Pending>>) => A): Effect.Effect<A> =>
      read.pipe(
        Effect.map((snapshot) => {
          const draft = draftCapacity(snapshot)
          const owner = capacityOperations(
            (run) => run(draft),
            (run) => run(draft),
            residentLifetime
          )
          return operation(evaluationReuseView(snapshot.records.reuse, owner))
        })
      )
    return {
      key: residentEvaluationIdentity,
      route: Effect.fn("EvaluationReuse.route")((...args: Parameters<EvaluationReuse<Pending>["route"]>) =>
        reuseCommit((operations) => operations.route(...args))
      ),
      claim: Effect.fn("EvaluationReuse.claim")((...args: Parameters<EvaluationReuse<Pending>["claim"]>) =>
        reuseCommit((operations) => operations.claim(...args))
      ),
      attachPending: Effect.fn("EvaluationReuse.attachPending")(
        (...args: Parameters<EvaluationReuse<Pending>["attachPending"]>) =>
          reuseCommit((operations) => operations.attachPending(...args))
      ),
      pending: Effect.fn("EvaluationReuse.pending")((...args: Parameters<EvaluationReuse<Pending>["pending"]>) =>
        reuseRead((view) => view.pending(...args))
      ),
      releaseClaim: Effect.fn("EvaluationReuse.releaseClaim")(
        (...args: Parameters<EvaluationReuse<Pending>["releaseClaim"]>) =>
          reuseCommit((operations) => operations.releaseClaim(...args))
      ),
      hasPending: Effect.fn("EvaluationReuse.hasPending")(
        (...args: Parameters<EvaluationReuse<Pending>["hasPending"]>) => reuseRead((view) => view.hasPending(...args))
      ),
      get: Effect.fn("EvaluationReuse.get")((...args: Parameters<EvaluationReuse<Pending>["get"]>) =>
        reuseCommit((operations) => operations.get(...args))
      ),
      cached: Effect.fn("EvaluationReuse.cached")((...args: Parameters<EvaluationReuse<Pending>["cached"]>) =>
        reuseRead((view) => view.cached(...args))
      ),
      put: Effect.fn("EvaluationReuse.put")((...args: Parameters<EvaluationReuse<Pending>["put"]>) =>
        reuseCommit((operations) => operations.put(...args))
      ),
      snapshot: Effect.fn("EvaluationReuse.snapshot")((...args: Parameters<EvaluationReuse<Pending>["snapshot"]>) =>
        reuseRead((view) => view.snapshot(...args))
      ),
      discardPartition: Effect.fn("EvaluationReuse.discardPartition")(
        (...args: Parameters<EvaluationReuse<Pending>["discardPartition"]>) =>
          reuseCommit((operations) => operations.discardPartition(...args))
      ),
      clear: Effect.fn("EvaluationReuse.clear")((...args: Parameters<EvaluationReuse<Pending>["clear"]>) =>
        reuseCommit((operations) => operations.clear(...args))
      )
    }
  }
