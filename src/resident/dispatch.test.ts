import { describe, expect, it } from "vitest";
import { DispatchQueue } from "./dispatch.ts";
import { CapacityLedger } from "./capacity.ts";

const createDispatch = (
  run: (entry: { readonly key: string; readonly value: number; readonly sequence: number }) => Promise<void>) => {
  const ledger = new CapacityLedger();
  const ids = new Map<number, { operation: number; round: number }>();
  const dispatch = new DispatchQueue<string, number>(ledger, (value) => ids.get(value)!, run);
  return {
    enqueue: (key: string, value: number) => {
      ids.set(value, { operation: ledger.admitObservation(key), round: ledger.roundId(key) });
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

describe("resident work-conserving dispatch", () => {
  it("uses the queued job's originating round after a successor opens", async () => {
    const ledger = new CapacityLedger();
    const oldRound = ledger.roundId("agent");
    ledger.retireRound("agent", oldRound);
    const round = ledger.roundId("agent");
    const operation = ledger.admitObservation("agent", round);
    const seen: number[] = [];
    const dispatch = new DispatchQueue<string, { operation: number; round: number }>(
      ledger, (job) => job, async ({ value }) => { seen.push(value.operation); });
    expect(dispatch.enqueue("agent", { operation, round: oldRound })).toBe(false);
    expect(dispatch.enqueue("agent", { operation, round })).toBe(true);
    await dispatch.whenIdle();
    expect(seen).toEqual([operation]);
  });

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

  it("starts later preparation while capacity is free", async () => {
    const releases: Array<() => void> = [];
    const started: number[] = [];
    const dispatcher = createDispatch(async ({ value }) => {
      started.push(value);
      await new Promise<void>((resolve) => releases.push(resolve));
    });

    expect(dispatcher.enqueue("partition", 0)).toBe(true);
    expect(started).toEqual([0]);
    for (let value = 1; value <= 20; value += 1) dispatcher.enqueue("partition", value);
    expect(started).toEqual([...Array(8).keys()]);
    while (dispatcher.snapshot().running > 0 || dispatcher.snapshot().queued > 0) {
      releases.splice(0).forEach((release) => release());
      await Promise.resolve();
    }
    await dispatcher.whenIdle();
    expect(started).toEqual([...Array(21).keys()]);
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
    await eventually(() => releases.length === 8);
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
    let release!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const dispatcher = createDispatch(async ({ value }) => {
      if (value <= 8) await hold;
    });
    for (let value = 1; value <= 10; value += 1) dispatcher.enqueue("partition", value);
    expect(dispatcher.close()).toEqual([9, 10]);
    expect(dispatcher.enqueue("partition", 11)).toBe(false);
    release();
    await dispatcher.whenIdle();
  });

  it("carries keyed FIFO sequence metadata across concurrent starts", async () => {
    const first = gate();
    const entries: Array<{ key: string; value: number; sequence: number }> = [];
    const dispatcher = createDispatch(
      async ({ key, value, sequence }) => {
        entries.push({ key, value, sequence });
        if (value === 0) await first.wait();
      },
    );
    dispatcher.enqueue("a", 0);
    dispatcher.enqueue("b", 1);
    dispatcher.enqueue("a", 2);
    first.open();
    await dispatcher.whenIdle();

    expect(entries).toEqual([
      { key: "a", value: 0, sequence: 0 },
      { key: "b", value: 1, sequence: 1 },
      { key: "a", value: 2, sequence: 2 },
    ]);
  });
});
