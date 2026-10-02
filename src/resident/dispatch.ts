import { Effect, Exit, Latch, Scope } from "effect";
import type { CapacityLedger } from "./capacity.ts";

export type DispatchEntry<K, A> = {
  readonly key: K;
  readonly sequence: number;
  readonly value: A;
};
export type DispatchSnapshot = { readonly queued: number; readonly running: number };
type NativeEntry<K, A> = {
  readonly key: K;
  readonly value: A;
  readonly operation: number;
  readonly partition: number;
  readonly round: number;
};
type Match<K, A> = (entry: { readonly key: K; readonly value: A }) => boolean;
export interface Dispatcher<K, A> {
  readonly enqueue: (key: K, value: A) => Effect.Effect<boolean>;
  readonly snapshot: () => Effect.Effect<DispatchSnapshot>;
  readonly hasWork: (key: K) => Effect.Effect<boolean>;
  readonly hasWorkWhere: (predicate: Match<K, A>) => Effect.Effect<boolean>;
  readonly snapshotWhere: (predicate: Match<K, A>) => Effect.Effect<DispatchSnapshot>;
  readonly discardWhere: (predicate: Match<K, A>) => Effect.Effect<ReadonlyArray<A>>;
  readonly whenIdle: () => Effect.Effect<void>;
  readonly close: () => Effect.Effect<ReadonlyArray<A>>;
}
export type DispatchRegistry<K, A> = {
  readonly entries: ReadonlyMap<number, NativeEntry<K, A>>;
  readonly starts: readonly { readonly entry: NativeEntry<K, A>; readonly sequence: number }[];
  readonly terminalRunning: ReadonlySet<number>;
  readonly terminal: boolean;
  readonly executorAttached: boolean;
};

export const initialDispatchRegistry = <K, A>(): DispatchRegistry<K, A> => ({
  entries: new Map(), starts: [], terminalRunning: new Set(), terminal: false, executorAttached: false,
});
export interface DispatchState<K, A> {
  readonly read: Effect.Effect<DispatchRegistry<K, A>>;
  readonly modify: <B>(operation: (current: DispatchRegistry<K, A>, ledger: CapacityLedger) =>
    readonly [B, DispatchRegistry<K, A>]) => Effect.Effect<B>;
}

/** Scoped execution of Bend commands, with native handles registered at commit. */
export const makeDispatcher = <K, A>(
  ledger: {
    readonly canonicalProjection: () => Effect.Effect<ReturnType<CapacityLedger["canonicalProjection"]>>;
    readonly dispatchIdentity: (...args: Parameters<CapacityLedger["dispatchIdentity"]>) => Effect.Effect<ReturnType<CapacityLedger["dispatchIdentity"]>>;
    readonly dispatch: DispatchState<K, A>;
  },
  operation: (value: A) => { readonly operation: number; readonly round: number },
  run: (entry: DispatchEntry<K, A>) => Effect.Effect<void, unknown>,
): Effect.Effect<Dispatcher<K, A>, never, Scope.Scope> => Effect.gen(function* () {
  const scope = yield* Scope.make();
  const idle = yield* Latch.make(true);
  const registry = ledger.dispatch;
  yield* registry.modify((current) => {
    if (current.executorAttached) throw new Error("resident dispatch executor is already attached");
    return [undefined, { ...current, executorAttached: true }] as const;
  });
  const liveOperations = Effect.fn("ResidentDispatch.liveOperations")(function* () {
    const dispatch = (yield* ledger.canonicalProjection()).dispatch;
    return [...dispatch.queued, ...dispatch.running].map((entry) => entry.operation);
  });
  const assertHandles = (next: DispatchRegistry<K, A>, live: readonly number[]) => {
    if (live.some((id) => !next.entries.has(id)) || (next.terminal
      ? next.entries.size !== next.terminalRunning.size || [...next.entries.keys()].some((id) => !next.terminalRunning.has(id))
      : live.length !== next.entries.size)) throw new Error("canonical dispatch and native job handles diverged");
  };
  const updateIdle = Effect.fn("ResidentDispatch.updateIdle")(function* () {
    const current = yield* registry.read;
    // Native settlement is required even if a retirement event removed the
    // canonical running entry. A cleared projection alone is never an idle proof.
    if (current.entries.size === 0) yield* Latch.open(idle);
    else yield* Latch.close(idle);
  });
  const commit = Effect.fn("ResidentDispatch.commit")(function* (
    event: Parameters<CapacityLedger["transition"]>[0], admitted?: NativeEntry<K, A>, settled?: number,
  ) {
    return yield* registry.modify((current, owner): readonly [readonly A[] | undefined, DispatchRegistry<K, A>] => {
      let next = current;
      let discarded: A[] = [];
      const result = owner.transition(event, (result) => {
        const entries = new Map(current.entries);
        const terminalRunning = new Set(current.terminalRunning);
        let terminal = current.terminal;
        let starts = [...current.starts];
        if (admitted !== undefined) {
          if (entries.has(admitted.operation) || terminal) throw new Error("canonical dispatch admission violated native handle fence");
          entries.set(admitted.operation, admitted);
        }
        if (settled !== undefined) {
          entries.delete(settled);
          terminalRunning.delete(settled);
          starts = starts.filter(({ entry }) => entry.operation !== settled);
        }
        if (event.kind === "closeDispatch") {
          terminal = true;
          for (const entry of owner.canonicalProjection().dispatch.running) terminalRunning.add(entry.operation);
        }
        for (const command of result.commands) {
          switch (command.kind) {
            case "dispatchStarted": {
              const entry = entries.get(command.operation);
              if (entry === undefined) throw new Error("canonical dispatch started unknown job");
              starts.push({ entry, sequence: command.sequence });
              break;
            }
            case "dispatchDiscarded": {
              const entry = entries.get(command.operation);
              if (entry === undefined) throw new Error("canonical dispatch discarded unknown job");
              discarded.push(entry.value);
              if (!command.running) entries.delete(command.operation);
              break;
            }
            default: throw new Error("unexpected canonical dispatch command");
          }
        }
        next = { ...current, entries, starts, terminalRunning, terminal };
        const dispatch = result.projection.dispatch;
        assertHandles(next, [...dispatch.queued, ...dispatch.running].map((entry) => entry.operation));
      });
      if (result.rejection !== undefined) return [undefined, current];
      return [discarded, next];
    });
  });
  const startCommitted: () => Effect.Effect<void> = Effect.fn("ResidentDispatch.startCommitted")(function* () {
    // Retained commands and an uninterruptible claim/fork handoff protect jobs
    // from caller interruption between authorization and resident-owned startup.
    yield* Effect.uninterruptible(Effect.gen(function* () {
      const starts = yield* registry.modify((current) => [current.starts, { ...current, starts: [] }] as const);
      for (const { entry, sequence } of starts) {
        const settle = Effect.gen(function* () {
          const current = yield* registry.read;
          const stillCanonical = (yield* ledger.canonicalProjection()).dispatch.running.some((item) => item.operation === entry.operation);
          if (current.terminal && !stillCanonical) {
            yield* registry.modify((old) => {
              const entries = new Map(old.entries); entries.delete(entry.operation);
              const terminalRunning = new Set(old.terminalRunning); terminalRunning.delete(entry.operation);
              return [undefined, { ...old, entries, terminalRunning }] as const;
            });
          } else {
            const result = yield* commit({ kind: "dispatchSettled", partition: entry.partition,
              lifetime: 1, round: entry.round, operation: entry.operation }, undefined, entry.operation);
            if (result === undefined) return yield* Effect.die(new Error("canonical dispatch settlement refused"));
            yield* startCommitted();
          }
          yield* updateIdle();
        });
        // Native adapters may be non-cooperative. Waiting uninterruptibly here
        // retains the actual running slot until the underlying effect settles.
        const execute = Effect.suspend(() => run({ key: entry.key, value: entry.value, sequence })).pipe(
          Effect.catch(() => Effect.void), Effect.ensuring(settle), Effect.uninterruptible,
        );
        yield* Effect.forkIn(execute, scope, { startImmediately: true });
      }
    }));
  });
  const snapshotWhere = Effect.fn("ResidentDispatch.snapshotWhere")(function* (predicate: Match<K, A>) {
    const current = yield* registry.read;
    const dispatch = (yield* ledger.canonicalProjection()).dispatch;
    const matches = (id: number) => { const entry = current.entries.get(id); return entry !== undefined && predicate(entry); };
    return { queued: dispatch.queued.filter((entry) => matches(entry.operation)).length,
      running: dispatch.running.filter((entry) => matches(entry.operation)).length };
  });
  const hasWorkWhere = Effect.fn("ResidentDispatch.hasWorkWhere")(function* (predicate: Match<K, A>) {
    const current = yield* registry.read;
    return (yield* liveOperations()).some((id) => { const entry = current.entries.get(id); return entry !== undefined && predicate(entry); });
  });
  const close = Effect.fn("ResidentDispatch.close")(function* () {
    return yield* Effect.uninterruptible(Effect.gen(function* () {
      const discarded = yield* commit({ kind: "closeDispatch" });
      if (discarded === undefined) return yield* Effect.die(new Error("canonical dispatch close refused"));
      yield* startCommitted();
      yield* updateIdle();
      return discarded;
    }));
  });
  yield* Effect.addFinalizer(() => close().pipe(Effect.andThen(idle.await), Effect.andThen(Scope.close(scope, Exit.void))));
  return {
    enqueue: Effect.fn("ResidentDispatch.enqueue")(function* (key: K, value: A) {
      if (typeof key !== "string") return yield* Effect.die(new TypeError("dispatch partition must be a string"));
      return yield* Effect.uninterruptible(Effect.gen(function* () {
        const identity = yield* ledger.dispatchIdentity(key, operation(value).round);
        const entry = { key, value, operation: operation(value).operation, ...identity };
        const admitted = yield* commit({ kind: "queueDispatch", partition: entry.partition, lifetime: 1,
          round: entry.round, operation: entry.operation }, entry);
        if (admitted === undefined) return false;
        yield* updateIdle();
        yield* startCommitted();
        return true;
      }));
    }),
    snapshot: Effect.fn("ResidentDispatch.snapshot")(function* () {
      const dispatch = (yield* ledger.canonicalProjection()).dispatch;
      return { queued: dispatch.queued.length, running: dispatch.running.length };
    }),
    hasWork: Effect.fn("ResidentDispatch.hasWork")(function* (key: K) { return yield* hasWorkWhere((entry) => entry.key === key); }),
    hasWorkWhere, snapshotWhere,
    discardWhere: Effect.fn("ResidentDispatch.discardWhere")(function* (predicate: Match<K, A>) {
      const current = yield* registry.read;
      const operations = (yield* liveOperations()).filter((id) => { const entry = current.entries.get(id); return entry !== undefined && predicate(entry); });
      return yield* Effect.uninterruptible(Effect.gen(function* () {
        const discarded = yield* commit({ kind: "discardDispatch", operations });
        if (discarded === undefined) return yield* Effect.die(new Error("canonical dispatch discard refused"));
        yield* startCommitted();
        yield* updateIdle();
        return discarded;
      }));
    }),
    whenIdle: Effect.fn("ResidentDispatch.whenIdle")(function* () { yield* idle.await; }),
    close,
  } satisfies Dispatcher<K, A>;
}).pipe(Effect.uninterruptible, Effect.withSpan("ResidentDispatch.make"));
