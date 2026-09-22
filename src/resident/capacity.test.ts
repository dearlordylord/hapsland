import { describe, expect, it } from "vitest";
import { CapacityLedger, encodedBytesWithin } from "./capacity.ts";

describe("resident logical capacity ledger", () => {
  it("enforces the profile's exact 64/8MiB and 16/2MiB boundaries", () => {
    const counts = new CapacityLedger();
    for (let index = 0; index < 16; index += 1) expect(counts.reserve("one", 1)).toBeDefined();
    expect(counts.reserve("one", 1)).toBeUndefined();
    for (let index = 16; index < 64; index += 1) {
      expect(counts.reserve(`partition-${Math.floor(index / 16)}`, 1)).toBeDefined();
    }
    expect(counts.reserve("overflow", 0)).toBeUndefined();
    expect(counts.snapshot()).toMatchObject({ items: 64, bytes: 64 });

    const bytes = new CapacityLedger();
    for (let index = 0; index < 4; index += 1) {
      expect(bytes.reserve(`bytes-${index}`, 2 * 1024 * 1024)).toBeDefined();
    }
    expect(bytes.reserve("overflow", 1)).toBeUndefined();
    expect(bytes.snapshot()).toMatchObject({ items: 4, bytes: 8 * 1024 * 1024 });
  });

  it("accepts exact count boundaries and isolates partition pressure", () => {
    const ledger = new CapacityLedger({
      globalItems: 4,
      globalBytes: 100,
      partitionItems: 2,
      partitionBytes: 60,
    });
    const first = ledger.reserve("one", 20);
    const second = ledger.reserve("one", 40);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(ledger.reserve("one", 0)).toBeUndefined();
    expect(ledger.reserve("two", 20)).toBeDefined();
    expect(ledger.reserve("three", 20)).toBeDefined();
    expect(ledger.snapshot()).toMatchObject({ items: 4, bytes: 100 });
    expect(ledger.reserve("four", 0)).toBeUndefined();
  });

  it("accepts exact byte boundaries, rejects one byte over, and releases idempotently", () => {
    const ledger = new CapacityLedger({
      globalItems: 3,
      globalBytes: 10,
      partitionItems: 2,
      partitionBytes: 6,
    });
    const local = ledger.reserve("one", 6);
    expect(local).toBeDefined();
    expect(ledger.reserve("one", 1)).toBeUndefined();
    const global = ledger.reserve("two", 4);
    expect(global).toBeDefined();
    expect(ledger.reserve("three", 1)).toBeUndefined();
    if (local === undefined || global === undefined) return;
    expect(ledger.release(local)).toBe(true);
    expect(ledger.release(local)).toBe(false);
    expect(ledger.release(global)).toBe(true);
    expect(ledger.snapshot()).toEqual({ items: 0, bytes: 0, partitions: {} });
  });

  it("clears all reservations at a lifecycle terminal", () => {
    const ledger = new CapacityLedger();
    const running = ledger.reserve("one", 10);
    expect(running).toBeDefined();
    ledger.clear();
    expect(ledger.snapshot()).toEqual({ items: 0, bytes: 0, partitions: {} });
    if (running !== undefined) expect(ledger.release(running)).toBe(false);
  });

  it("resizes preparation workspace and atomically replaces it with exact units", () => {
    const ledger = new CapacityLedger({
      globalItems: 4,
      globalBytes: 100,
      partitionItems: 3,
      partitionBytes: 80,
    });
    const workspace = ledger.reserve("one", 20);
    expect(workspace).toBeDefined();
    if (workspace === undefined) return;
    expect(ledger.resize(workspace, 80)).toBe(true);
    expect(ledger.resize(workspace, 81)).toBe(false);
    const replacements = ledger.replace(workspace, [30, 30, 20, 1]);
    expect(replacements.slice(0, 3).every((item) => item !== undefined)).toBe(true);
    expect(replacements[3]).toBeUndefined();
    expect(ledger.snapshot()).toMatchObject({ items: 3, bytes: 80 });
  });

  it("rejects unknown, negative, and unsafe output reservations", () => {
    const ledger = new CapacityLedger();
    expect(ledger.reserve("partition", Number.NaN)).toBeUndefined();
    expect(ledger.reserve("partition", Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(ledger.reserve("partition", -1)).toBeUndefined();
    expect(ledger.reserve("partition", Number.MAX_SAFE_INTEGER + 1)).toBeUndefined();
    expect(ledger.snapshot()).toEqual({ items: 0, bytes: 0, partitions: {} });
  });

  it("rejects malformed and oversized unknown output before retention", () => {
    const maximum = 64;
    const base = Buffer.byteLength(JSON.stringify({ output: "" }), "utf8");
    expect(encodedBytesWithin({ output: "x".repeat(maximum - base) }, maximum)).toBe(maximum);
    expect(encodedBytesWithin({ output: "x".repeat(maximum - base + 1) }, maximum)).toBeUndefined();
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(encodedBytesWithin(cyclic, maximum)).toBeUndefined();
    expect(encodedBytesWithin(1n, maximum)).toBeUndefined();
  });
});
