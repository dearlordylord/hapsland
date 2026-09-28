import type { CanonicalCommand } from "../canonical/adapter.ts";
import { CapacityLedger } from "./capacity.ts";

export type DispatchEntry<K, A> = {
  readonly key: K;
  readonly sequence: number;
  readonly cycle: number;
  readonly value: A;
};

export type DispatchSnapshot = { readonly queued: number; readonly running: number; readonly cycle: number };

type NativeEntry<K, A> = {
  readonly key: K;
  readonly value: A;
  readonly operation: number;
  readonly partition: number;
  readonly round: number;
};

/** Executes canonical dispatch commands while retaining native job handles. */
export class DispatchCycles<K, A> {
  readonly #entries = new Map<number, NativeEntry<K, A>>();
  readonly #ledger: CapacityLedger;
  readonly #operation: (value: A) => number;
  readonly #run: (entry: DispatchEntry<K, A>) => Promise<void>;
  readonly #onCycleComplete: ((cycle: number) => void) | undefined;
  readonly #idleWaiters: Array<() => void> = [];
  #terminal = false;

  constructor(ledger: CapacityLedger, operation: (value: A) => number,
    run: (entry: DispatchEntry<K, A>) => Promise<void>,
    onCycleComplete?: (cycle: number) => void) {
    this.#ledger = ledger;
    this.#operation = operation;
    this.#run = run;
    this.#onCycleComplete = onCycleComplete;
  }

  enqueue(key: K, value: A): boolean {
    if (typeof key !== "string") throw new TypeError("dispatch partition must be a string");
    const identity = this.#ledger.dispatchIdentity(key);
    const operation = this.#operation(value);
    const entry = { key, value, operation, ...identity };
    const result = this.#ledger.transition({ kind: "queueDispatch", partition: identity.partition,
      lifetime: 1, round: identity.round, operation });
    if (result.rejection !== undefined) return false;
    if (this.#entries.has(operation) || this.#terminal) throw new Error("canonical dispatch admission violated native handle fence");
    this.#entries.set(operation, entry);
    this.#apply(result.commands);
    return true;
  }

  snapshot(): DispatchSnapshot {
    const dispatch = this.#ledger.canonicalProjection().dispatch;
    return { queued: dispatch.pending.length + dispatch.active.length,
      running: dispatch.running.length, cycle: dispatch.cycle };
  }

  hasWork(key: K): boolean { return this.hasWorkWhere((entry) => entry.key === key); }

  hasWorkWhere(predicate: (entry: { readonly key: K; readonly value: A }) => boolean): boolean {
    return this.#liveOperations().some((operation) => {
      const entry = this.#entries.get(operation);
      return entry !== undefined && predicate(entry);
    });
  }

  snapshotWhere(predicate: (entry: { readonly key: K; readonly value: A }) => boolean): { queued: number; running: number } {
    const dispatch = this.#ledger.canonicalProjection().dispatch;
    const matches = (operation: number) => {
      const entry = this.#entries.get(operation);
      return entry !== undefined && predicate(entry);
    };
    return { queued: [...dispatch.pending, ...dispatch.active].filter((entry) => matches(entry.operation)).length,
      running: dispatch.running.filter((entry) => matches(entry.operation)).length };
  }

  /** Bend selects exact queued removals and running cancellation commands. */
  discardWhere(predicate: (entry: { readonly key: K; readonly value: A }) => boolean): ReadonlyArray<A> {
    const operations = this.#liveOperations().filter((operation) => {
      const entry = this.#entries.get(operation);
      return entry !== undefined && predicate(entry);
    });
    const result = this.#ledger.transition({ kind: "discardDispatch", operations });
    if (result.rejection !== undefined) throw new Error("canonical dispatch discard refused");
    return this.#apply(result.commands);
  }

  whenIdle(): Promise<void> {
    if (this.#isIdle()) return Promise.resolve();
    return new Promise((resolve) => this.#idleWaiters.push(resolve));
  }

  close(): ReadonlyArray<A> {
    const result = this.#ledger.transition({ kind: "closeDispatch" });
    if (result.rejection !== undefined) throw new Error("canonical dispatch close refused");
    this.#terminal = true;
    return this.#apply(result.commands);
  }

  #liveOperations(): number[] {
    const dispatch = this.#ledger.canonicalProjection().dispatch;
    return [...dispatch.pending, ...dispatch.active, ...dispatch.running].map((entry) => entry.operation);
  }

  #isIdle(): boolean {
    const dispatch = this.#ledger.canonicalProjection().dispatch;
    return dispatch.pending.length === 0 && dispatch.active.length === 0 && dispatch.running.length === 0;
  }

  #settleIdle(): void {
    if (!this.#isIdle()) return;
    for (const resolve of this.#idleWaiters.splice(0)) resolve();
  }

  #assertNativeHandles(): void {
    const live = this.#liveOperations();
    if (live.some((operation) => !this.#entries.has(operation)) ||
        (!this.#terminal && live.length !== this.#entries.size)) {
      throw new Error("canonical dispatch and native job handles diverged");
    }
  }

  #apply(commands: readonly CanonicalCommand[]): A[] {
    const discarded: A[] = [];
    for (const command of commands) {
      switch (command.kind) {
        case "dispatchStarted": {
          const entry = this.#entries.get(command.operation);
          if (entry === undefined) throw new Error("canonical dispatch started unknown job");
          void this.#run({ key: entry.key, value: entry.value, sequence: command.sequence,
            cycle: command.cycle }).catch(() => undefined).finally(() => {
            this.#entries.delete(command.operation);
            if (this.#terminal && !this.#ledger.canonicalProjection().dispatch.running
              .some((running) => running.operation === command.operation)) {
              this.#settleIdle();
              return;
            }
            const result = this.#ledger.transition({ kind: "dispatchSettled",
              partition: entry.partition, lifetime: 1, round: entry.round, operation: entry.operation });
            if (result.rejection !== undefined) throw new Error("canonical dispatch settlement refused");
            this.#apply(result.commands);
            this.#settleIdle();
          });
          break;
        }
        case "dispatchCycleCompleted": this.#onCycleComplete?.(command.cycle); break;
        case "dispatchDiscarded": {
          const entry = this.#entries.get(command.operation);
          if (entry === undefined) throw new Error("canonical dispatch discarded unknown job");
          discarded.push(entry.value);
          if (!command.running) this.#entries.delete(command.operation);
          break;
        }
        default: throw new Error("unexpected canonical dispatch command");
      }
    }
    this.#assertNativeHandles();
    this.#settleIdle();
    return discarded;
  }
}
