import type { CanonicalCommand } from "@hapsland/canonical-policy/canonical/adapter"
import type { CapacityLedger, CapacityReservation } from "./capacity.ts"
import type { OperationalNotice, OperationalNoticeKind } from "./collection.ts"
import { canonicalValue } from "@hapsland/review-definition/direct-event/model"
type NoticeDelivery = { readonly token: string; leaseUntil: number; acknowledged: boolean }

type PendingNotice = {
  readonly canonicalId: number
  readonly id: string
  value: OperationalNotice
  readonly pendingAt: number
  readonly sequence: number
  delivery?: NoticeDelivery
}

type NoticeCooldown = {
  readonly canonicalId: number
  readonly partition: string
  readonly deliveryGroup: string
  readonly reservation: CapacityReservation
  nextAllowedAt: number
  suppressedCount: number
  pending?: PendingNotice
}

export type NoticeRecordsState = {
  readonly entries: ReadonlyMap<string, NoticeCooldown>
  readonly nextSequence: number
  readonly nextKey: number
}
export const initialNoticeRecords = (): NoticeRecordsState => ({ entries: new Map(), nextSequence: 1, nextKey: 1 })
export const draftNoticeRecords = (state: NoticeRecordsState) => ({
  ...state,
  entries: new Map(
    [...state.entries].map(([key, record]) => [
      key,
      {
        ...record,
        ...(record.pending === undefined
          ? {}
          : {
              pending: {
                ...record.pending,
                value: { ...record.pending.value },
                ...(record.pending.delivery === undefined ? {} : { delivery: { ...record.pending.delivery } })
              }
            })
      }
    ])
  )
})
const noticeReservationBytes = (key: string, partition: string, measure: (value: unknown) => number): number =>
  measure({
    indexKey: key,
    value: {
      partition,
      nextAllowedAt: Number.MAX_SAFE_INTEGER,
      suppressedCount: Number.MAX_SAFE_INTEGER,
      pending: {
        id: "00000000-0000-0000-0000-000000000000",
        value: { kind: "capacity", suppressedCount: Number.MAX_SAFE_INTEGER },
        pendingAt: Number.MAX_SAFE_INTEGER,
        sequence: Number.MAX_SAFE_INTEGER,
        delivery: {
          token: "00000000-0000-0000-0000-000000000000",
          leaseUntil: Number.MAX_SAFE_INTEGER,
          acknowledged: true
        }
      }
    }
  }) + 1024

export const noticeRecordOperations = (
  draft: ReturnType<typeof draftNoticeRecords>,
  owner: CapacityLedger,
  maximumKeys: number,
  cooldownMs: number,
  lifetimeMs: number,
  measure: (value: unknown) => number,
  pendingIdentity: string
) => {
  const expired = (pending: PendingNotice, now: number): boolean => {
    const elapsed = Math.min(lifetimeMs, Math.max(0, now - pending.pendingAt))
    const result = owner.transition({
      kind: "collectionExpiryCheck",
      elapsed: Number.isNaN(elapsed) ? 0 : Math.floor(elapsed),
      lifetime: lifetimeMs
    })
    const command = result.commands[0]?.kind
    if (result.rejection !== undefined || (command !== "collectionExpired" && command !== "collectionCurrent"))
      throw new Error("canonical notice expiry refused")
    return command === "collectionExpired"
  }
  function noticeTransition(
    event: Extract<Parameters<CapacityLedger["transition"]>[0], { readonly kind: `notice${string}` }>,
    expected: Extract<CanonicalCommand, { readonly kind: `notice${string}` }>["kind"]
  ) {
    const result = owner.transition(event)
    const command = result.commands[0]
    if (result.rejection !== undefined || command?.kind !== expected) {
      throw new Error(`canonical notice transition refused: ${event.kind}`)
    }
    return command
  }

  function noticeKeyForPending(id: string): number | undefined {
    for (const cooldown of draft.entries.values()) {
      if (cooldown.pending?.id === id) return cooldown.canonicalId
    }
    return undefined
  }

  function setNoticeLeased(id: string, leased: boolean): void {
    const key = noticeKeyForPending(id)
    if (key === undefined) throw new Error("missing canonical notice owner")
    noticeTransition({ kind: "noticeLease", key, leased }, "noticeLeased")
  }

  function removePendingNotice(id: string, token?: string): boolean {
    for (const cooldown of draft.entries.values()) {
      const pending = cooldown.pending
      if (pending?.id !== id || (token !== undefined && pending.delivery?.token !== token)) continue
      noticeTransition({ kind: "noticeClearPending", key: cooldown.canonicalId }, "noticePendingCleared")
      delete cooldown.pending
      return true
    }
    return false
  }

  function noticeKey(partition: string, kind: OperationalNoticeKind): string {
    return canonicalValue({ partition, kind })
  }

  function releaseNoticeCooldown(key: string): void {
    const cooldown = draft.entries.get(key)
    if (cooldown === undefined) return
    noticeTransition({ kind: "noticeDrop", key: cooldown.canonicalId }, "noticeDropped")
    draft.entries.delete(key)
    owner.release(cooldown.reservation)
  }

  function applyPendingPrune(
    pending: PendingNotice | undefined,
    cooldown: NoticeCooldown,
    prune: Extract<CanonicalCommand, { kind: "noticePruned" }>
  ): void {
    if (pending !== undefined) {
      if (prune.dropLease) delete pending.delivery
      if (prune.dropPending) {
        delete cooldown.pending
      }
    }
  }

  function pruneNoticeCooldowns(now: number, exceptKey?: string): void {
    for (const [key, cooldown] of draft.entries) {
      const pending = cooldown.pending
      const prune = noticeTransition(
        {
          kind: "noticePrune",
          key: cooldown.canonicalId,
          leaseExpired: pending?.delivery !== undefined && pending.delivery.leaseUntil <= now,
          pendingExpired: pending !== undefined && expired(pending, now),
          excepted: key === exceptKey,
          cooldownExpired: cooldown.nextAllowedAt <= now
        },
        "noticePruned"
      )
      if (prune.kind !== "noticePruned") throw new Error("invalid canonical notice pruning")
      applyPendingPrune(pending, cooldown, prune)
      if (prune.dropKey) {
        draft.entries.delete(key)
        owner.release(cooldown.reservation)
      }
    }
  }

  function resetNoticeCooldown(retained: NoticeCooldown, now: number): void {
    retained.nextAllowedAt = now + cooldownMs
    retained.suppressedCount = 0
  }

  function createPendingNotice(
    retained: NoticeCooldown,
    kind: OperationalNoticeKind,
    count: number,
    proposed: number,
    now: number
  ): void {
    if (retained.pending !== undefined) throw new Error("canonical notice pending already exists")
    resetNoticeCooldown(retained, now)
    draft.nextSequence++
    retained.pending = {
      canonicalId: proposed,
      id: pendingIdentity,
      value: { kind, suppressedCount: count },
      pendingAt: now,
      sequence: proposed
    }
  }

  function mergePendingNotice(retained: NoticeCooldown, kind: OperationalNoticeKind, count: number, now: number): void {
    if (retained.pending === undefined || retained.pending.delivery !== undefined)
      throw new Error("canonical notice merge missing unleased pending payload")
    resetNoticeCooldown(retained, now)
    retained.pending.value = { kind, suppressedCount: count }
  }

  function keepLeasedNotice(retained: NoticeCooldown, now: number): void {
    if (retained.pending?.delivery === undefined) throw new Error("canonical notice lease missing native payload")
    resetNoticeCooldown(retained, now)
  }

  function requireRetainedNotice(retained: NoticeCooldown | undefined, message: string): NoticeCooldown {
    if (retained === undefined) throw new Error(message)
    return retained
  }

  function refreshNotice(
    action: CanonicalCommand,
    retained: NoticeCooldown | undefined,
    kind: OperationalNoticeKind,
    proposed: number,
    now: number
  ): void {
    const current = requireRetainedNotice(retained, "canonical notice refresh lost native key")
    switch (action.kind) {
      case "noticeCreatePending":
        createPendingNotice(current, kind, action.count, proposed, now)
        break
      case "noticeMergePending":
        mergePendingNotice(current, kind, action.count, now)
        break
      case "noticeKeepLeased":
        keepLeasedNotice(current, now)
        break
    }
  }

  function advanceNotice(retained: NoticeCooldown | undefined, now: number) {
    const proposed = draft.nextSequence
    const candidateKey = retained?.canonicalId ?? draft.nextKey
    const remaining = retained === undefined ? undefined : Math.ceil(Math.max(0, retained.nextAllowedAt - now))
    const advance = owner.transition({
      kind: "noticeAdvance",
      key: candidateKey,
      ...(remaining === undefined ? {} : { remaining }),
      maximumKeys,
      proposed,
      sequence: proposed,
      maxCount: 2 ** 48 - 1
    })
    if (advance.rejection !== undefined || advance.commands.length !== 1)
      throw new Error("canonical notice advance refused")
    const action = advance.commands[0]
    if (action === undefined) throw new Error("canonical notice advance lacks command")
    return { proposed, action }
  }

  function suppressNotice(retained: NoticeCooldown | undefined, count: number): void {
    requireRetainedNotice(retained, "canonical notice suppression lost native key").suppressedCount = count
  }

  function recordOperationalFailure(partition: string, kind: OperationalNoticeKind, now: number): void {
    const key = noticeKey(partition, kind)
    pruneNoticeCooldowns(now, key)
    const retained = draft.entries.get(key)
    const { proposed, action } = advanceNotice(retained, now)
    switch (action.kind) {
      case "noticeRejectedFull":
        return
      case "noticeSuppressed":
        suppressNotice(retained, action.count)
        return
      case "noticeCreatePending":
      case "noticeMergePending":
      case "noticeKeepLeased":
        refreshNotice(action, retained, kind, proposed, now)
        return
      case "noticeCreateKey":
        createNoticeCooldown(key, retained, partition, kind, now)
        return
      default:
        return
    }
  }

  function createNoticeCooldown(
    key: string,
    retained: NoticeCooldown | undefined,
    partition: string,
    kind: OperationalNoticeKind,
    now: number
  ): void {
    if (retained !== undefined) throw new Error("canonical notice created duplicate native key")
    const reservation = owner.reserve(partition, noticeReservationBytes(key, partition, measure), "operationalNotice")
    // Retention is best effort. In particular, do not recursively turn this
    // failed reservation into another capacity failure.
    if (reservation === undefined) return
    const pendingId = draft.nextSequence++
    const keyId = draft.nextKey++
    const group = partition
    const committed = owner.transition({
      kind: "noticeCommit",
      key: keyId,
      partition: owner.partitionId(partition),
      group: owner.partitionId(group),
      reservation: reservation.id,
      pending: pendingId,
      sequence: pendingId,
      maximumKeys
    })
    if (committed.rejection !== undefined || committed.commands[0]?.kind !== "noticeCommitted") {
      owner.release(reservation)
      throw new Error("canonical notice commit refused")
    }
    draft.entries.set(key, {
      canonicalId: keyId,
      partition,
      deliveryGroup: group,
      reservation,
      nextAllowedAt: now + cooldownMs,
      suppressedCount: 0,
      pending: {
        canonicalId: pendingId,
        id: pendingIdentity,
        value: { kind, suppressedCount: 0 },
        pendingAt: now,
        sequence: pendingId
      }
    })
  }

  const updateDelivery = (id: string, operation: (pending: PendingNotice) => void): void => {
    for (const record of draft.entries.values())
      if (record.pending?.id === id) {
        operation(record.pending)
        return
      }
  }
  type CanonicalNotice = ReturnType<CapacityLedger["canonicalProjection"]>["notices"][number]
  const pendingMatches = (current: CanonicalNotice, pending: PendingNotice): boolean =>
    current.pending?.id === pending.canonicalId &&
    current.pending.count === pending.value.suppressedCount &&
    current.pending.sequence === pending.sequence &&
    current.pending.leased === (pending.delivery !== undefined)
  const noticeMembershipMatches = (current: CanonicalNotice, record: NoticeCooldown): boolean =>
    current.partition === owner.knownPartitionId(record.partition) &&
    current.group === owner.knownPartitionId(record.deliveryGroup) &&
    current.reservation === record.reservation.id
  const noticeMetadataMatches = (current: CanonicalNotice, record: NoticeCooldown): boolean =>
    current.suppressed === record.suppressedCount &&
    (current.pending === undefined) === (record.pending === undefined) &&
    (record.pending === undefined || pendingMatches(current, record.pending))
  const assert = (): void => {
    const canonical = owner.canonicalProjection().notices
    if (canonical.length !== draft.entries.size)
      throw new Error("native notice membership differs from canonical ownership")
    for (const record of draft.entries.values()) {
      const current = canonical.find((entry) => entry.id === record.canonicalId)
      if (
        current === undefined ||
        !noticeMembershipMatches(current, record) ||
        !noticeMetadataMatches(current, record)
      ) {
        throw new Error("native notice metadata differs from canonical ownership")
      }
    }
  }
  return {
    assert,
    record: recordOperationalFailure,
    prune: pruneNoticeCooldowns,
    drop: releaseNoticeCooldown,
    remove: removePendingNotice,
    release: (id: string) =>
      updateDelivery(id, (pending) => {
        setNoticeLeased(id, false)
        delete pending.delivery
      }),
    acknowledge: (id: string) =>
      updateDelivery(id, (pending) => {
        if (pending.delivery !== undefined) pending.delivery.acknowledged = true
      }),
    renew: (id: string, until: number) =>
      updateDelivery(id, (pending) => {
        if (pending.delivery !== undefined) pending.delivery.leaseUntil = until
      })
  }
}
export type NoticeRecordOperations = ReturnType<typeof noticeRecordOperations>
export type PendingNoticeSnapshot = Readonly<Omit<PendingNotice, "delivery" | "value">> & {
  readonly value: Readonly<OperationalNotice>
  readonly delivery?: Readonly<NoticeDelivery>
}
export type NoticeCooldownSnapshot = Readonly<Omit<NoticeCooldown, "pending">> & {
  readonly pending?: PendingNoticeSnapshot
}
