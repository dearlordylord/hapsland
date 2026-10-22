import { draftRevision, revisionOperations, type RevisionOperations } from "../revision.ts"
import * as Effect from "effect/Effect"
import { type ResidentTransaction } from "./transaction.ts"
import { capacityOperations } from "../capacity/operations.ts"

import { draftCapacity } from "../capacity/model.ts"

export const residentRevision = <Pending, DispatchKey, DispatchValue>({
  read,
  commitAllEffect,
  residentInstanceId
}: ResidentTransaction<Pending, DispatchKey, DispatchValue>) => {
  const revisionChange =
    <A>(operation: (operations: RevisionOperations) => A): Parameters<typeof commitAllEffect<A>>[0] =>
    (draft, records) => {
      const revision = draftRevision(records.revision)
      const owner = capacityOperations(
        (run) => run(draft),
        (run) => run(draft),
        residentInstanceId
      )
      const operations = revisionOperations(revision, owner)
      const value = operation(operations)
      operations.assert()
      return [value, { ...records, revision }]
    }
  const revisionRead = <A>(
    operation: (
      operations: Pick<RevisionOperations, "count" | "readRevisionGeneration" | "superseded" | "current">
    ) => A
  ): Effect.Effect<A> =>
    read.pipe(
      Effect.map((snapshot) => {
        // Bend check events run against a private draft of this one snapshot.
        // Queries must not publish identity allocations or canonical state.
        const draft = draftCapacity(snapshot)
        const owner = capacityOperations(
          (run) => run(draft),
          (run) => run(draft),
          residentInstanceId
        )
        return operation(revisionOperations(draftRevision(snapshot.records.revision), owner))
      })
    )
  return {
    count: Effect.fn("RevisionRecords.count")((...args: Parameters<RevisionOperations["count"]>) =>
      revisionRead((operations) => operations.count(...args))
    ),
    readRevisionGeneration: Effect.fn("RevisionRecords.readRevisionGeneration")(
      (...args: Parameters<RevisionOperations["readRevisionGeneration"]>) =>
        revisionRead((operations) => operations.readRevisionGeneration(...args))
    ),
    register: Effect.fn("RevisionRecords.register")((...args: Parameters<RevisionOperations["register"]>) =>
      commitAllEffect(revisionChange((operations) => operations.register(...args)))
    ),
    superseded: Effect.fn("RevisionRecords.superseded")((...args: Parameters<RevisionOperations["superseded"]>) =>
      revisionRead((operations) => operations.superseded(...args))
    ),
    current: Effect.fn("RevisionRecords.current")((...args: Parameters<RevisionOperations["current"]>) =>
      revisionRead((operations) => operations.current(...args))
    ),
    release: Effect.fn("RevisionRecords.release")((...args: Parameters<RevisionOperations["release"]>) =>
      commitAllEffect(revisionChange((operations) => operations.release(...args)))
    )
  }
}
