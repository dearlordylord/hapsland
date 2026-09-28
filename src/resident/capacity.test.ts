import { describe, expect, it } from "vitest";
import { CapacityLedger, encodedBytesWithin } from "./capacity.ts";

describe("resident logical capacity ledger", () => {
  it("routes delivery terminal and finding decisions through canonical Bend", () => {
    const ledger = new CapacityLedger();
    for (const [event, kind] of [
      [{ kind: "deliveryAcknowledgeCheck", items: 0, anyExpired: false }, "deliveryAckEmpty"],
      [{ kind: "deliveryAcknowledgeCheck", items: 1, anyExpired: true }, "deliveryAckExpired"],
      [{ kind: "deliveryAcknowledgeCheck", items: 1, anyExpired: false }, "deliveryAckReady"],
      [{ kind: "deliveryFinalizeCheck", items: 1, allAcknowledged: false, anyExpired: false }, "deliveryFinalEmpty"],
      [{ kind: "deliveryFinalizeCheck", items: 1, allAcknowledged: true, anyExpired: true }, "deliveryFinalExpired"],
      [{ kind: "deliveryFinalizeCheck", items: 1, allAcknowledged: true, anyExpired: false }, "deliveryFinalReady"],
      [{ kind: "deliveryFindingDispositionCheck", composed: true, remaining: 0 }, "deliveryKeepForReoffer"],
      [{ kind: "deliveryFindingDispositionCheck", composed: false, remaining: 1 }, "deliveryKeepRemaining"],
      [{ kind: "deliveryFindingDispositionCheck", composed: false, remaining: 0 }, "deliveryRetireAdvice"],
    ] as const) {
      expect(ledger.transition(event).commands).toEqual([{ kind }]);
    }
  });

  it("keeps permit and capacity transitions in one canonical resident state", () => {
    const ledger = new CapacityLedger();
    const partition = ledger.partitionId("agent");
    const issued = ledger.transition({ kind: "issuePermit", partition, lifetime: 1,
      tool: 7, started: 100, deadline: 300, now: 110,
      facts: { clockValid: true, withinHookWindow: true, startedAfterClosure: true,
        duplicateEvent: false, permitCount: 0, permitLimit: 1024,
        roundCount: 0, roundLimit: 64, newRound: true, eventCount: 0, eventLimit: 4096 } });
    expect(issued.commands[0]).toEqual({ kind: "permitIssued", token: 1, round: 1 });
    const charge = ledger.reserve("agent", 10, "observationDispatch");
    expect(charge).toBeDefined();
    expect(ledger.canonicalProjection()).toMatchObject({
      global: { items: 1, bytes: 10 },
      admissions: [{ partition, permits: [{ token: 1, tool: 7, round: 1 }] }],
    });
    expect(ledger.transition({ kind: "consumePermit", partition, lifetime: 1,
      token: 1, tool: 7, now: 120 }).commands[0]).toEqual({ kind: "permitConsumed", round: 1 });
    if (charge !== undefined) expect(ledger.release(charge)).toBe(true);
    expect(ledger.canonicalProjection()).toMatchObject({
      global: { items: 0, bytes: 0 }, admissions: [{ partition, active: true, used: [{ token: 1, tool: 7 }] }],
    });
  });

  it("fences late work callbacks after round retirement without opening a new round", () => {
    const ledger = new CapacityLedger();
    const observation = ledger.admitObservation("agent");
    expect(ledger.observation("agent", observation, "startObservation")).toBe(true);
    const preparation = ledger.beginObservedPreparation("agent", observation, 10);
    expect(preparation).toBeDefined();
    ledger.retireRound("agent");
    expect(ledger.observation("agent", observation, "completeObservation")).toBe(false);
    expect(ledger.beginObservedPreparation("agent", observation, 10)).toBeUndefined();
    expect(ledger.canonicalProjection().rounds).toEqual([]);
    expect(ledger.canonicalProjection().work).toEqual([]);
    expect(ledger.snapshot()).toEqual({ items: 0, bytes: 0, partitions: {} });
  });

  it("enforces the profile's exact 64/8MiB and 16/2MiB boundaries", () => {
    const counts = new CapacityLedger();
    for (let index = 0; index < 16; index += 1) expect(counts.reserve("one", 1, "reviewUnit")).toBeDefined();
    expect(counts.reserve("one", 1, "reviewUnit")).toBeUndefined();
    for (let index = 16; index < 64; index += 1) {
      expect(counts.reserve(`partition-${Math.floor(index / 16)}`, 1, "reviewUnit")).toBeDefined();
    }
    expect(counts.reserve("overflow", 0, "reviewUnit")).toBeUndefined();
    expect(counts.snapshot()).toMatchObject({ items: 64, bytes: 64 });

    const bytes = new CapacityLedger();
    for (let index = 0; index < 4; index += 1) {
      expect(bytes.reserve(`bytes-${index}`, 2 * 1024 * 1024, "reviewUnit")).toBeDefined();
    }
    expect(bytes.reserve("overflow", 1, "reviewUnit")).toBeUndefined();
    expect(bytes.snapshot()).toMatchObject({ items: 4, bytes: 8 * 1024 * 1024 });
  });

  it("accepts exact count boundaries and isolates partition pressure", () => {
    const ledger = new CapacityLedger({
      globalItems: 4,
      globalBytes: 100,
      partitionItems: 2,
      partitionBytes: 60,
    });
    const first = ledger.reserve("one", 20, "reviewUnit");
    const second = ledger.reserve("one", 40, "reviewUnit");
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(ledger.reserve("one", 0, "reviewUnit")).toBeUndefined();
    expect(ledger.reserve("two", 20, "reviewUnit")).toBeDefined();
    expect(ledger.reserve("three", 20, "reviewUnit")).toBeDefined();
    expect(ledger.snapshot()).toMatchObject({ items: 4, bytes: 100 });
    expect(ledger.reserve("four", 0, "reviewUnit")).toBeUndefined();
  });

  it("accepts exact byte boundaries, rejects one byte over, and releases idempotently", () => {
    const ledger = new CapacityLedger({
      globalItems: 3,
      globalBytes: 10,
      partitionItems: 2,
      partitionBytes: 6,
    });
    const local = ledger.reserve("one", 6, "reviewUnit");
    expect(local).toBeDefined();
    expect(ledger.reserve("one", 1, "reviewUnit")).toBeUndefined();
    const global = ledger.reserve("two", 4, "reviewUnit");
    expect(global).toBeDefined();
    expect(ledger.reserve("three", 1, "reviewUnit")).toBeUndefined();
    if (local === undefined || global === undefined) return;
    expect(ledger.release(local)).toBe(true);
    expect(ledger.release(local)).toBe(false);
    expect(ledger.release(global)).toBe(true);
    expect(ledger.snapshot()).toEqual({ items: 0, bytes: 0, partitions: {} });
  });

  it("clears all reservations at a lifecycle terminal", () => {
    const ledger = new CapacityLedger();
    const running = ledger.reserve("one", 10, "reviewUnit");
    expect(running).toBeDefined();
    ledger.clear();
    expect(ledger.snapshot()).toEqual({ items: 0, bytes: 0, partitions: {} });
    if (running !== undefined) expect(ledger.release(running)).toBe(false);
  });

  it("reports partition names that overlap Object.prototype keys", () => {
    const ledger = new CapacityLedger();
    expect(ledger.reserve("__proto__", 1, "reviewUnit")).toBeDefined();
    expect(Object.hasOwn(ledger.snapshot().partitions, "__proto__")).toBe(true);
    expect(ledger.snapshot().partitions["__proto__"]).toEqual({ items: 1, bytes: 1 });
  });

  it("resizes preparation workspace and atomically replaces it with exact units", () => {
    const ledger = new CapacityLedger({
      globalItems: 4,
      globalBytes: 100,
      partitionItems: 3,
      partitionBytes: 80,
    });
    const workspace = ledger.reserve("one", 20, "preparation");
    expect(workspace).toBeDefined();
    if (workspace === undefined) return;
    expect(ledger.resize(workspace, 80)).toBe(true);
    expect(ledger.resize(workspace, 81)).toBe(false);
    const replacements = ledger.replace(workspace, [30, 30, 20, 1]);
    expect(replacements.slice(0, 3).every((item) => item !== undefined)).toBe(true);
    expect(replacements[3]).toBeUndefined();
    expect(ledger.snapshot()).toMatchObject({ items: 3, bytes: 80 });
  });

  it("shares capacity across advicees and releases each replacement exactly once", () => {
    const ledger = new CapacityLedger({ globalItems: 3, globalBytes: 100,
      partitionItems: 2, partitionBytes: 60 });
    const first = ledger.reserve("agent-a", 30, "preparation");
    const second = ledger.reserve("agent-b", 40, "preparation");
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first === undefined || second === undefined) return;
    const [one, refused, three] = ledger.replace(first, [10, 60, 20]);
    expect(one?.purpose).toBe("reviewUnit");
    expect(refused).toBeUndefined();
    expect(three?.purpose).toBe("reviewUnit");
    expect(ledger.snapshot()).toEqual({ items: 3, bytes: 70,
      partitions: { "agent-a": { items: 2, bytes: 30 }, "agent-b": { items: 1, bytes: 40 } } });
    expect(ledger.replace(first, [5])).toEqual([undefined]);
    expect(ledger.release(first)).toBe(false);
    if (one === undefined || three === undefined) return;
    expect(ledger.release(second)).toBe(true);
    expect(ledger.resize(one, 20, "adviceRecheck")).toBe(true);
    expect(one.purpose).toBe("adviceRecheck");
    expect(ledger.release(one)).toBe(true);
    expect(ledger.release(one)).toBe(false);
    expect(ledger.release(three)).toBe(true);
    expect(ledger.snapshot()).toEqual({ items: 0, bytes: 0, partitions: {} });
  });

  it("rejects unknown, negative, and unsafe output reservations", () => {
    const ledger = new CapacityLedger();
    expect(ledger.reserve("partition", Number.NaN, "reviewUnit")).toBeUndefined();
    expect(ledger.reserve("partition", Number.POSITIVE_INFINITY, "reviewUnit")).toBeUndefined();
    expect(ledger.reserve("partition", -1, "reviewUnit")).toBeUndefined();
    expect(ledger.reserve("partition", Number.MAX_SAFE_INTEGER + 1, "reviewUnit")).toBeUndefined();
    expect(ledger.reserve("partition", 2 ** 47, "reviewUnit")).toBeUndefined();
    expect(ledger.snapshot()).toEqual({ items: 0, bytes: 0, partitions: {} });
  });

  it("releases preparation space when measured replacement input violates the Bend bound", () => {
    const ledger = new CapacityLedger();
    const workspace = ledger.reserve("agent", 20, "preparation");
    if (workspace === undefined) throw new Error("missing preparation reservation");
    expect(() => ledger.replace(workspace, [2 ** 47])).toThrow(TypeError);
    expect(ledger.release(workspace)).toBe(false);
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
