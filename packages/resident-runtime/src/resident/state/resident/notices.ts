import {
  draftNoticeRecords,
  noticeRecordOperations,
  type NoticeRecordOperations,
  type NoticeCooldownSnapshot
} from "../notice-records.ts"
import * as Effect from "effect/Effect"
import { randomUUID } from "node:crypto"
import { type ResidentTransaction } from "./transaction.ts"
import { capacityOperations } from "../capacity/operations.ts"

export const residentNotices =
  <Pending, DispatchKey, DispatchValue>({
    read,
    commitAllEffect,
    residentLifetime
  }: ResidentTransaction<Pending, DispatchKey, DispatchValue>) =>
  (maximumKeys: number, cooldownMs: number, lifetimeMs: number, measure: (value: unknown) => number) => {
    const noticeChange =
      <A>(
        operation: (operations: NoticeRecordOperations) => A,
        identity = ""
      ): Parameters<typeof commitAllEffect<A>>[0] =>
      (draft, records) => {
        const notices = draftNoticeRecords(records.notices)
        const owner = capacityOperations(
          (run) => run(draft),
          (run) => run(draft),
          residentLifetime
        )
        const operations = noticeRecordOperations(
          notices,
          owner,
          maximumKeys,
          cooldownMs,
          lifetimeMs,
          measure,
          identity
        )
        const value = operation(operations)
        operations.assert()
        for (const record of notices.entries.values()) {
          if (record.pending !== undefined) {
            Object.freeze(record.pending.value)
            if (record.pending.delivery !== undefined) Object.freeze(record.pending.delivery)
            Object.freeze(record.pending)
          }
          Object.freeze(record)
        }
        return [value, { ...records, notices }]
      }
    return {
      entries: Effect.fn("NoticeRecords.entries")(() =>
        read.pipe(
          Effect.map(
            (snapshot): ReadonlyArray<readonly [string, NoticeCooldownSnapshot]> =>
              Object.freeze(
                [...snapshot.records.notices.entries].map(([key, value]) => Object.freeze([key, value] as const))
              )
          )
        )
      ),
      record: Effect.fn("NoticeRecords.record")((...args: Parameters<NoticeRecordOperations["record"]>) =>
        Effect.suspend(() => commitAllEffect(noticeChange((operations) => operations.record(...args), randomUUID())))
      ),
      prune: Effect.fn("NoticeRecords.prune")((...args: Parameters<NoticeRecordOperations["prune"]>) =>
        commitAllEffect(noticeChange((operations) => operations.prune(...args)))
      ),
      drop: Effect.fn("NoticeRecords.drop")((...args: Parameters<NoticeRecordOperations["drop"]>) =>
        commitAllEffect(noticeChange((operations) => operations.drop(...args)))
      ),
      remove: Effect.fn("NoticeRecords.remove")((...args: Parameters<NoticeRecordOperations["remove"]>) =>
        commitAllEffect(noticeChange((operations) => operations.remove(...args)))
      ),
      release: Effect.fn("NoticeRecords.release")((...args: Parameters<NoticeRecordOperations["release"]>) =>
        commitAllEffect(noticeChange((operations) => operations.release(...args)))
      ),
      acknowledge: Effect.fn("NoticeRecords.acknowledge")(
        (...args: Parameters<NoticeRecordOperations["acknowledge"]>) =>
          commitAllEffect(noticeChange((operations) => operations.acknowledge(...args)))
      ),
      renew: Effect.fn("NoticeRecords.renew")((...args: Parameters<NoticeRecordOperations["renew"]>) =>
        commitAllEffect(noticeChange((operations) => operations.renew(...args)))
      )
    }
  }
