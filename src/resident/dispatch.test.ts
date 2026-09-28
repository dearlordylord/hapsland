import { describe, expect, it } from "vitest";
import { DispatchCycles } from "./dispatch.ts";
import { CapacityLedger } from "./capacity.ts";

const createDispatch = (
  run: (entry: { readonly key: string; readonly value: number; readonly sequence: number; readonly cycle: number }) => Promise<void>,
  onCycleComplete?: (cycle: number) => void) => {
  const ledger = new CapacityLedger();
  const ids = new Map<number, number>();
  const dispatch = new DispatchCycles<string, number>(ledger, (value) => ids.get(value)!, run, onCycleComplete);
  return {
    enqueue: (key: string, value: number) => {
      ids.set(value, ledger.admitObservation(key));
      return dispatch.enqueue(key, value);
    },
    hasWork: (key: string) => dispatch.hasWork(key),
    whenIdle: () => dispatch.whenIdle(),
    snapshot: () => dispatch.snapshot(),
    close: () => dispatch.close(),
  };
};

const gate = () => {
  let open: (() => void) | undefined;
  return {
    wait: () => new Promise<void>((resolve) => { open = resolve; }),
    open: () => open?.(),
  };
};

const eventually = async (predicate: () => boolean) => {
  for (let index = 0; index < 100 && !predicate(); index += 1) await Promise.resolve();
  expect(predicate()).toBe(true);
};

describe("resident finite dispatch cycles", () => {
  it("reports work only for the advicee with queued or running entries", async () => {
    const first = gate();
    const dispatcher = createDispatch(async ({ value }) => {
      if (value === 1) await first.wait();
    });
    dispatcher.enqueue("a", 1);
    dispatcher.enqueue("b", 2);
    expect(dispatcher.hasWork("a")).toBe(true);
    expect(dispatcher.hasWork("b")).toBe(true);
    expect(dispatcher.hasWork("c")).toBe(false);
    first.open();
    await dispatcher.whenIdle();
    expect(dispatcher.hasWork("a")).toBe(false);
    expect(dispatcher.hasWork("b")).toBe(false);
  });

  it("dispatches an idle lone item immediately and puts sustained later arrivals in later cycles", async () => {
    const first = gate();
    const started: Array<{ value: number; cycle: number }> = [];
    const dispatcher = createDispatch(async ({ value, cycle }) => {
      started.push({ value, cycle });
      if (value === 0) await first.wait();
    });

    expect(dispatcher.enqueue("partition", 0)).toBe(true);
    expect(started).toEqual([{ value: 0, cycle: 1 }]);
    for (let value = 1; value <= 20; value += 1) dispatcher.enqueue("partition", value);
    expect(started).toEqual([{ value: 0, cycle: 1 }]);

    first.open();
    await dispatcher.whenIdle();
    expect(started.map(({ value }) => value)).toEqual([...Array(21).keys()]);
    expect(started.slice(1).every(({ cycle }) => cycle === 2)).toBe(true);
  });

  it("never exceeds eight running resident jobs", async () => {
    const releases: Array<() => void> = [];
    let running = 0;
    let maximum = 0;
    const dispatcher = createDispatch(async () => {
      running += 1;
      maximum = Math.max(maximum, running);
      await new Promise<void>((resolve) => releases.push(resolve));
      running -= 1;
    });

    dispatcher.enqueue("one", 0);
    for (let value = 1; value < 12; value += 1) dispatcher.enqueue(value % 2 === 0 ? "one" : "two", value);
    await eventually(() => releases.length === 1);
    releases.shift()?.();
    await eventually(() => releases.length === 8);
    while (dispatcher.snapshot().running > 0 || dispatcher.snapshot().queued > 0) {
      releases.splice(0).forEach((release) => release());
      await Promise.resolve();
    }
    await dispatcher.whenIdle();
    expect(maximum).toBe(8);
  });

  it("returns every not-yet-running item on lifecycle close", async () => {
    const first = gate();
    const dispatcher = createDispatch(async ({ value }) => {
      if (value === 1) await first.wait();
    });
    dispatcher.enqueue("partition", 1);
    dispatcher.enqueue("partition", 2);
    dispatcher.enqueue("partition", 3);
    expect(dispatcher.close()).toEqual([2, 3]);
    expect(dispatcher.enqueue("partition", 4)).toBe(false);
    first.open();
    await dispatcher.whenIdle();
  });

  it("carries keyed FIFO sequence metadata and reports finite cycle completion", async () => {
    const first = gate();
    const entries: Array<{ key: string; value: number; sequence: number; cycle: number }> = [];
    const completed: Array<number> = [];
    const dispatcher = createDispatch(
      async ({ key, value, sequence, cycle }) => {
        entries.push({ key, value, sequence, cycle });
        if (value === 0) await first.wait();
      },
      (cycle) => completed.push(cycle),
    );
    dispatcher.enqueue("a", 0);
    dispatcher.enqueue("b", 1);
    dispatcher.enqueue("a", 2);
    first.open();
    await dispatcher.whenIdle();

    expect(entries).toEqual([
      { key: "a", value: 0, sequence: 0, cycle: 1 },
      { key: "b", value: 1, sequence: 1, cycle: 2 },
      { key: "a", value: 2, sequence: 2, cycle: 2 },
    ]);
    expect(completed).toEqual([1, 2]);
  });
});
