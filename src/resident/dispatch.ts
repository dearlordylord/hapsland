export type DispatchEntry<K, A> = {
  readonly key: K;
  readonly sequence: number;
  readonly cycle: number;
  readonly value: A;
};

export type DispatchSnapshot = {
  readonly queued: number;
  readonly running: number;
  readonly cycle: number;
};

/** Finite FIFO cycles with a fixed concurrency ceiling. */
export class DispatchCycles<K, A> {
  readonly #pending: Array<{ readonly key: K; readonly sequence: number; readonly value: A }> = [];
  #active: Array<DispatchEntry<K, A>> = [];
  readonly #runningEntries = new Set<DispatchEntry<K, A>>();
  readonly #run: (entry: DispatchEntry<K, A>) => Promise<void>;
  readonly #onCycleComplete: ((cycle: number) => void) | undefined;
  readonly #concurrency: number;
  readonly #idleWaiters: Array<() => void> = [];
  #sequence = 0;
  #cycle = 0;
  #running = 0;
  #closed = false;

  constructor(
    concurrency: number,
    run: (entry: DispatchEntry<K, A>) => Promise<void>,
    onCycleComplete?: (cycle: number) => void,
  ) {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new Error("concurrency must be positive");
    this.#concurrency = concurrency;
    this.#run = run;
    this.#onCycleComplete = onCycleComplete;
  }

  enqueue(key: K, value: A): boolean {
    if (this.#closed) return false;
    this.#pending.push({ key, sequence: this.#sequence++, value });
    this.#pump();
    return true;
  }

  snapshot(): DispatchSnapshot {
    return { queued: this.#pending.length + this.#active.length, running: this.#running, cycle: this.#cycle };
  }

  /** Advicee-scoped work includes pending, active, and currently executing entries. */
  hasWork(key: K): boolean {
    return this.#pending.some((entry) => entry.key === key) ||
      this.#active.some((entry) => entry.key === key) ||
      [...this.#runningEntries].some((entry) => entry.key === key);
  }

  hasWorkWhere(predicate: (entry: { readonly key: K; readonly value: A }) => boolean): boolean {
    return this.#pending.some(predicate) || this.#active.some(predicate) ||
      [...this.#runningEntries].some(predicate);
  }

  whenIdle(): Promise<void> {
    if (this.#running === 0 && this.#active.length === 0 && this.#pending.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.#idleWaiters.push(resolve));
  }

  close(): ReadonlyArray<A> {
    this.#closed = true;
    const abandoned = [...this.#active.map(({ value }) => value), ...this.#pending.map(({ value }) => value)];
    this.#pending.length = 0;
    this.#active.length = 0;
    this.#settleIdle();
    return abandoned;
  }

  #pump(): void {
    if (this.#active.length === 0 && this.#running === 0 && this.#pending.length > 0) {
      this.#cycle += 1;
      const finite = this.#pending.splice(0);
      this.#active = finite.map((item) => ({ ...item, cycle: this.#cycle }));
    }
    while (this.#running < this.#concurrency) {
      const entry = this.#active.shift();
      if (entry === undefined) break;
      this.#running += 1;
      this.#runningEntries.add(entry);
      void this.#run(entry).catch(() => undefined).finally(() => {
        this.#running -= 1;
        this.#runningEntries.delete(entry);
        if (this.#running === 0 && this.#active.length === 0) this.#onCycleComplete?.(entry.cycle);
        this.#pump();
        this.#settleIdle();
      });
    }
  }

  #settleIdle(): void {
    if (this.#running !== 0 || this.#active.length !== 0 || this.#pending.length !== 0) return;
    for (const resolve of this.#idleWaiters.splice(0)) resolve();
  }
}
