import { draftJoinedReviews, joinedReviewOperations, type JoinedReviews } from "../joined-reviews.ts"
import { draftRevision, revisionOperations, type WorkRevision } from "../revision.ts"
import { draftEvaluationReuse, evaluationReuseOperations, type EvaluationReuse } from "../evaluation-reuse.ts"
import * as Effect from "effect/Effect"
import { type ResidentTransaction } from "./transaction.ts"
import { capacityOperations } from "../capacity/operations.ts"

export const residentJoinedReviews =
  <Pending, DispatchKey, DispatchValue>({
    read,
    commitAllEffect,
    residentLifetime
  }: ResidentTransaction<Pending, DispatchKey, DispatchValue>) =>
  (logicalBytes: (value: unknown) => number): JoinedReviews<Pending> => {
    const joinedChange =
      <A>(
        operation: (joined: ReturnType<typeof joinedReviewOperations>, reuse: EvaluationReuse<Pending>) => A
      ): Parameters<typeof commitAllEffect<A>>[0] =>
      (draft, records) => {
        const joined = draftJoinedReviews(records.joined)
        const revision = draftRevision(records.revision)
        const reuse = draftEvaluationReuse(records.reuse)
        const owner = capacityOperations(
          (run) => run(draft),
          (run) => run(draft),
          residentLifetime
        )
        const revisionOps = revisionOperations(revision, owner)
        const reuseOps = evaluationReuseOperations(reuse, owner, logicalBytes)
        const operations = joinedReviewOperations(joined, owner, revisionOps, (id) => records.advice.entries.has(id))
        const value = operation(operations, reuseOps)
        revisionOps.assert()
        reuseOps.snapshot()
        return [value, { ...records, joined, revision, reuse }]
      }
    return {
      append: Effect.fn("JoinedReviews.append")((review: Parameters<JoinedReviews<Pending>["append"]>[0]) =>
        commitAllEffect(joinedChange((joined) => joined.append(review)))
      ),
      hasAdmission: Effect.fn("JoinedReviews.hasAdmission")((admission: number) =>
        read.pipe(
          Effect.map((snapshot) =>
            [...snapshot.records.joined.entries.values()].some((reviews) =>
              reviews.some((review) => review.admission === admission)
            )
          )
        )
      ),
      attachOwner: Effect.fn("JoinedReviews.attachOwner")((key: string, pending: Pending, revision: WorkRevision) =>
        commitAllEffect(
          joinedChange((joined, reuse) => {
            if (!reuse.attachPending(key, pending)) return false
            joined.attach(key, revision)
            return true
          })
        )
      ),
      releaseOwner: Effect.fn("JoinedReviews.releaseOwner")(
        (...args: Parameters<JoinedReviews<Pending>["releaseOwner"]>) =>
          commitAllEffect(
            joinedChange((joined, reuse) => {
              const [key, reason] = args
              reuse.releaseClaim(key)
              return joined.releaseUnattached(key, reason)
            })
          )
      ),
      retireSuperseded: Effect.fn("JoinedReviews.retireSuperseded")((subject: string) =>
        commitAllEffect(joinedChange((joined) => joined.retireSuperseded(subject)))
      ),
      settle: Effect.fn("JoinedReviews.settle")((...args: Parameters<JoinedReviews<Pending>["settle"]>) =>
        commitAllEffect(joinedChange((joined) => joined.settle(...args)))
      )
    }
  }
