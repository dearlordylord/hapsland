import { describe, expect, it } from "vitest";
import { DispatchCycles } from "./dispatch.ts";

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
  it("dispatches an idle lone item immediately and puts sustained later arrivals in later cycles", async () => {
    const first = gate();
    const started: Array<{ value: number; cycle: number }> = [];
    const dispatcher = new DispatchCycles<string, number>(2, async ({ value, cycle }) => {
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

  it("never exceeds two running backend operations", async () => {
    const releases: Array<() => void> = [];
    let running = 0;
    let maximum = 0;
    const dispatcher = new DispatchCycles<string, number>(2, async () => {
      running += 1;
      maximum = Math.max(maximum, running);
      await new Promise<void>((resolve) => releases.push(resolve));
      running -= 1;
    });

    dispatcher.enqueue("one", 0);
    for (let value = 1; value < 8; value += 1) dispatcher.enqueue(value % 2 === 0 ? "one" : "two", value);
    await eventually(() => releases.length === 1);
    releases.shift()?.();
    await eventually(() => releases.length === 2);
    while (dispatcher.snapshot().running > 0 || dispatcher.snapshot().queued > 0) {
      releases.splice(0).forEach((release) => release());
      await Promise.resolve();
    }
    await dispatcher.whenIdle();
    expect(maximum).toBe(2);
  });

  it("returns every not-yet-running item on lifecycle close", async () => {
    const first = gate();
    const dispatcher = new DispatchCycles<string, number>(1, async ({ value }) => {
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
});
