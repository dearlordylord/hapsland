import { draftRuntimeRecords, runtimeRecordOperations, runtimeRecordView } from "../runtime-records.ts"
import { draftRevision, revisionOperations } from "../revision.ts"
import { draftEvaluationReuse, evaluationReuseOperations, evaluationReuseView } from "../evaluation-reuse.ts"
import * as Effect from "effect/Effect"
import { type ResidentTransaction } from "./transaction.ts"

import { capacityOperations } from "../capacity/operations.ts"

import { validateCleanupResult } from "./cleanup.ts"

export const residentRuntime = <Pending, DispatchKey, DispatchValue>({
  read,
  commitAllEffect,
  residentLifetime
}: ResidentTransaction<Pending, DispatchKey, DispatchValue>) => {
  const runtimeCommitEffect = <A>(
    operation: (runtime: ReturnType<typeof runtimeRecordOperations>) => A
  ): Effect.Effect<A> =>
    commitAllEffect((_draft, records) => {
      const runtime = draftRuntimeRecords(records.runtime)
      const value = operation(runtimeRecordOperations(runtime, residentLifetime))
      return [value, { ...records, runtime }]
    })
  return {
    snapshot: Effect.fn("RuntimeRecords.snapshot")(() =>
      read.pipe(Effect.map((snapshot) => runtimeRecordView(snapshot.records.runtime)))
    ),
    openConnection: Effect.fn("ResidentState.openConnection")((maximum: number) =>
      runtimeCommitEffect((operations) => operations.openConnection(maximum))
    ),
    releaseConnection: Effect.fn("ResidentState.releaseConnection")(
      (connection: Parameters<ReturnType<typeof runtimeRecordOperations>["releaseConnection"]>[0]) =>
        runtimeCommitEffect((operations) => operations.releaseConnection(connection))
    ),
    rejectCapacity: Effect.fn("ResidentState.rejectCapacity")(() =>
      runtimeCommitEffect((operations) => operations.rejectCapacity())
    ),
    observePreparedUnits: Effect.fn("ResidentState.observePreparedUnits")((units: number) =>
      runtimeCommitEffect((operations) => operations.observePreparedUnits(units))
    ),
    nextAuthoritySequence: Effect.fn("ResidentState.nextAuthoritySequence")(() =>
      runtimeCommitEffect((operations) => operations.nextAuthoritySequence())
    ),
    scheduleRetirement: Effect.fn("ResidentState.scheduleRetirement")(() =>
      runtimeCommitEffect((operations) => operations.scheduleRetirement())
    ),
    close: Effect.fn("RuntimeRecords.close")(() => runtimeCommitEffect((operations) => operations.close())),
    cleanup: Effect.fn("RuntimeRecords.cleanup")(
      (logicalBytes: (value: unknown) => number): Effect.Effect<"busy" | "cleaned"> =>
        commitAllEffect((draft, records) => {
          if (records.runtime.lifecycle !== "active") return ["busy", records]
          const owner = capacityOperations(
            (run) => run(draft),
            (run) => run(draft),
            residentLifetime
          )
          const reuse = evaluationReuseView(records.reuse, owner).snapshot()
          const capacity = owner.snapshot()
          const revision = draftRevision(records.revision)
          const check = owner.transition({
            kind: "cleanupCheck",
            facts: {
              active: records.runtime.lifecycle === "active",
              dispatcherIdle: records.dispatch.entries.size === 0,
              noAdvice: records.advice.entries.size === 0,
              noNotices: [...records.notices.entries.values()].every((notice) => notice.pending === undefined),
              noPendingEvaluations: reuse.pending === 0,
              noCurrentWork: revisionOperations(revision, owner).count() === 0,
              noCooldowns: records.notices.entries.size === 0,
              connectionCountOk: records.runtime.connections.size <= 1,
              cacheMatchesLedger: capacity.items === reuse.entries && capacity.bytes === reuse.bytes
            }
          })
          validateCleanupResult(check, "check")
          if (check.outputs[0]?.kind === "cleanupBusy") return ["busy", records]
          if (check.outputs[0]?.kind !== "cleanupReady") throw new Error("invalid canonical cleanup check")
          const clearedReuse = draftEvaluationReuse(records.reuse)
          evaluationReuseOperations(clearedReuse, owner, logicalBytes).clear()
          const commit = owner.transition({ kind: "cleanupCommit" })
          validateCleanupResult(commit, "commit")
          if (commit.outputs[0]?.kind === "cleanupBusy") {
            return ["busy", { ...records, revision, reuse: clearedReuse }]
          }
          if (commit.outputs[0]?.kind !== "cleanupCommitted") throw new Error("invalid canonical cleanup commit")
          const runtime = draftRuntimeRecords(records.runtime)
          runtimeRecordOperations(runtime, residentLifetime).retire()
          return ["cleaned", { ...records, runtime, revision, reuse: clearedReuse }]
        })
    )
  }
}
