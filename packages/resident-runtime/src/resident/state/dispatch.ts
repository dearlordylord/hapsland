import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Latch from "effect/Latch"
import * as Scope from "effect/Scope"
import type { CapacityLedger } from "./capacity/operations.ts"
import { commitDispatchRecords, type NativeEntry, type DispatchRegistry } from "./dispatch-records.ts"
export { initialDispatchRegistry, type DispatchRegistry } from "./dispatch-records.ts"

export type DispatchEntry<K, A> = { readonly key: K; readonly sequence: number; readonly value: A }
export type DispatchSnapshot = { readonly queued: number; readonly running: number }
type Match<K, A> = (entry: { readonly key: K; readonly value: A }) => boolean
export interface Dispatcher<K, A> {
  readonly enqueue: (key: K, value: A) => Effect.Effect<boolean>
  readonly snapshot: () => Effect.Effect<DispatchSnapshot>
  readonly hasWork: (key: K) => Effect.Effect<boolean>
  readonly hasWorkWhere: (predicate: Match<K, A>) => Effect.Effect<boolean>
  readonly snapshotWhere: (predicate: Match<K, A>) => Effect.Effect<DispatchSnapshot>
  readonly discardWhere: (predicate: Match<K, A>) => Effect.Effect<ReadonlyArray<A>>
  readonly whenIdle: () => Effect.Effect<void>
  readonly close: () => Effect.Effect<ReadonlyArray<A>>
}
export interface DispatchState<K, A> {
  readonly read: Effect.Effect<DispatchRegistry<K, A>>
  readonly modify: <B>(
    operation: (current: DispatchRegistry<K, A>, ledger: CapacityLedger) => readonly [B, DispatchRegistry<K, A>]
  ) => Effect.Effect<B>
}

/** Scoped execution of Bend outputs, with native handles registered at commit. */
export const makeDispatcher = <K, A>(
  ledger: {
    readonly canonicalProjection: () => Effect.Effect<ReturnType<CapacityLedger["canonicalProjection"]>>
    readonly dispatchIdentity: (
      ...args: Parameters<CapacityLedger["dispatchIdentity"]>
    ) => Effect.Effect<ReturnType<CapacityLedger["dispatchIdentity"]>>
    readonly dispatch: DispatchState<K, A>
  },
  operation: (value: A) => { readonly operation: number; readonly round: number },
  run: (entry: DispatchEntry<K, A>) => Effect.Effect<void, unknown>,
  executionBoundary: (execute: Effect.Effect<void>) => Effect.Effect<void> = (execute) => execute
): Effect.Effect<Dispatcher<K, A>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const scope = yield* Scope.make()
    const idle = yield* Latch.make(true)
    const registry = ledger.dispatch
    yield* registry.modify((current) => {
      if (current.executorAttached) throw new Error("resident dispatch executor is already attached")
      return [undefined, { ...current, executorAttached: true }] as const
    })
    const liveOperations = Effect.fn("ResidentDispatch.liveOperations")(function* () {
      const dispatch = (yield* ledger.canonicalProjection()).dispatch
      return [...dispatch.queued, ...dispatch.running].map((entry) => entry.operation)
    })
    const updateIdle = Effect.fn("ResidentDispatch.updateIdle")(function* () {
      const current = yield* registry.read
      // Native settlement is required even if a retirement event removed the
      // canonical running entry. A cleared projection alone is never an idle proof.
      if (current.entries.size === 0) yield* Latch.open(idle)
      else yield* Latch.close(idle)
    })
    const commit = Effect.fn("ResidentDispatch.commit")(function* (
      event: Parameters<CapacityLedger["transition"]>[0],
      admitted?: NativeEntry<K, A>,
      settled?: number
    ) {
      return yield* registry.modify((current, owner) => commitDispatchRecords(current, owner, event, admitted, settled))
    })
    const startCommitted: () => Effect.Effect<void> = Effect.fn("ResidentDispatch.startCommitted")(function* () {
      // Retained outputs and an uninterruptible claim/fork handoff protect jobs
      // from caller interruption between authorization and resident-owned startup.
      yield* Effect.uninterruptible(
        Effect.gen(function* () {
          const starts = yield* registry.modify((current) => [current.starts, { ...current, starts: [] }] as const)
          for (const { entry, sequence } of starts) {
            const settle = Effect.gen(function* () {
              const current = yield* registry.read
              const stillCanonical = (yield* ledger.canonicalProjection()).dispatch.running.some(
                (item) => item.operation === entry.operation
              )
              if (current.terminal && !stillCanonical) {
                yield* registry.modify((old) => {
                  const entries = new Map(old.entries)
                  entries.delete(entry.operation)
                  const terminalRunning = new Set(old.terminalRunning)
                  terminalRunning.delete(entry.operation)
                  return [undefined, { ...old, entries, terminalRunning }] as const
                })
              } else {
                const result = yield* commit(
                  {
                    kind: "dispatchSettled",
                    partition: entry.partition,
                    lifetime: 1,
                    round: entry.round,
                    operation: entry.operation
                  },
                  undefined,
                  entry.operation
                )
                if (result === undefined) return yield* Effect.die(new Error("canonical dispatch settlement refused"))
                yield* startCommitted()
              }
              yield* updateIdle()
            })
            // Native adapters may be non-cooperative. Waiting uninterruptibly here
            // retains the actual running slot until the underlying effect settles.
            const execute = Effect.suspend(() => run({ key: entry.key, value: entry.value, sequence })).pipe(
              Effect.catch(() => Effect.void),
              Effect.ensuring(settle),
              Effect.uninterruptible
            )
            yield* Effect.forkIn(executionBoundary(execute), scope, { startImmediately: true })
          }
        })
      )
    })
    const snapshotWhere = Effect.fn("ResidentDispatch.snapshotWhere")(function* (predicate: Match<K, A>) {
      const current = yield* registry.read
      const dispatch = (yield* ledger.canonicalProjection()).dispatch
      const matches = (id: number) => {
        const entry = current.entries.get(id)
        return entry !== undefined && predicate(entry)
      }
      return {
        queued: dispatch.queued.filter((entry) => matches(entry.operation)).length,
        running: dispatch.running.filter((entry) => matches(entry.operation)).length
      }
    })
    const hasWorkWhere = Effect.fn("ResidentDispatch.hasWorkWhere")(function* (predicate: Match<K, A>) {
      const current = yield* registry.read
      return (yield* liveOperations()).some((id) => {
        const entry = current.entries.get(id)
        return entry !== undefined && predicate(entry)
      })
    })
    const close = Effect.fn("ResidentDispatch.close")(function* () {
      return yield* Effect.uninterruptible(
        Effect.gen(function* () {
          const discarded = yield* commit({ kind: "closeDispatch" })
          if (discarded === undefined) return yield* Effect.die(new Error("canonical dispatch close refused"))
          yield* startCommitted()
          yield* updateIdle()
          return discarded
        })
      )
    })
    yield* Effect.addFinalizer(() =>
      close().pipe(Effect.andThen(idle.await), Effect.andThen(Scope.close(scope, Exit.void)))
    )
    return {
      enqueue: Effect.fn("ResidentDispatch.enqueue")(function* (key: K, value: A) {
        if (typeof key !== "string") return yield* Effect.die(new TypeError("dispatch partition must be a string"))
        return yield* Effect.uninterruptible(
          Effect.gen(function* () {
            const identity = yield* ledger.dispatchIdentity(key, operation(value).round)
            const entry = { key, value, operation: operation(value).operation, ...identity }
            const admitted = yield* commit(
              {
                kind: "queueDispatch",
                partition: entry.partition,
                lifetime: 1,
                round: entry.round,
                operation: entry.operation
              },
              entry
            )
            if (admitted === undefined) return false
            yield* updateIdle()
            yield* startCommitted()
            return true
          })
        )
      }),
      snapshot: Effect.fn("ResidentDispatch.snapshot")(function* () {
        const dispatch = (yield* ledger.canonicalProjection()).dispatch
        return { queued: dispatch.queued.length, running: dispatch.running.length }
      }),
      hasWork: Effect.fn("ResidentDispatch.hasWork")(function* (key: K) {
        return yield* hasWorkWhere((entry) => entry.key === key)
      }),
      hasWorkWhere,
      snapshotWhere,
      discardWhere: Effect.fn("ResidentDispatch.discardWhere")(function* (predicate: Match<K, A>) {
        const current = yield* registry.read
        const operations = (yield* liveOperations()).filter((id) => {
          const entry = current.entries.get(id)
          return entry !== undefined && predicate(entry)
        })
        return yield* Effect.uninterruptible(
          Effect.gen(function* () {
            const discarded = yield* commit({ kind: "discardDispatch", operations })
            if (discarded === undefined) return yield* Effect.die(new Error("canonical dispatch discard refused"))
            yield* startCommitted()
            yield* updateIdle()
            return discarded
          })
        )
      }),
      whenIdle: Effect.fn("ResidentDispatch.whenIdle")(function* () {
        yield* idle.await
      }),
      close
    } satisfies Dispatcher<K, A>
  }).pipe(Effect.uninterruptible, Effect.withSpan("ResidentDispatch.make"))
