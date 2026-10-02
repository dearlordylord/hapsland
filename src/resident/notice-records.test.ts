import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Effect } from "effect";
import { makeResidentState } from "./capacity.ts";
const measure = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

it.effect("commits bounded notice metadata, suppression and capacity together", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const notices = owner.notices(2, 60_000, 120_000, measure);
  notices.record("a", "backend", 0);
  const first = notices.entries()[0]?.[1];
  expect(first?.pending?.value).toEqual({ kind: "backend", suppressedCount: 0 });
  expect(Object.isFrozen(first)).toBe(true);
  expect(Object.isFrozen(first?.pending)).toBe(true);
  expect(owner.canonicalProjection().notices).toHaveLength(1);
  expect(owner.snapshot().items).toBe(1);
  notices.record("a", "backend", 1);
  expect(notices.entries()[0]?.[1].suppressedCount).toBe(1);
  expect(first?.suppressedCount).toBe(0);
  notices.record("a", "backend", 60_000);
  expect(notices.entries()[0]?.[1].pending?.value.suppressedCount).toBe(1);
  notices.record("b", "capacity", 60_000);
  notices.record("c", "backend", 60_000);
  expect(notices.entries()).toHaveLength(2);
  yield* notices.prune(180_001);
  expect(notices.entries()).toEqual([]);
  expect(owner.snapshot().items).toBe(0);
  expect(owner.canonicalProjection().notices).toEqual([]);
}));

it.effect("publishes no canonical notice or reservation when native measurement fails", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const notices = owner.notices(2, 60_000, 120_000, () => { throw new Error("measurement failed"); });
  const before = owner.canonicalProjection();
  expect(() => notices.record("a", "backend", 0)).toThrow("measurement failed");
  expect(owner.canonicalProjection()).toEqual(before);
  expect(notices.entries()).toEqual([]);
  expect(owner.snapshot().items).toBe(0);
  owner.notices(2, 60_000, 120_000, measure).record("a", "backend", 0);
  expect(notices.entries()[0]?.[1].canonicalId).toBe(1);
  expect(notices.entries()[0]?.[1].pending?.sequence).toBe(1);
}));

it.effect("shares notice views and clears native and canonical ownership together", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const first = owner.notices(2, 60_000, 120_000, measure);
  const second = owner.notices(2, 60_000, 120_000, measure);
  first.record("a", "backend", 0);
  expect(second.entries()).toEqual(first.entries());
  const pending = second.entries()[0]?.[1].pending;
  if (pending === undefined) throw new Error("fixture notice missing");
  expect(yield* second.remove(pending.id, "wrong-token")).toBe(false);
  const removals = yield* Effect.forEach(Array.from({ length: 16 }), () => second.remove(pending.id), { concurrency: "unbounded" });
  expect(removals.filter(Boolean)).toHaveLength(1);
  expect(first.entries()[0]?.[1].pending).toBeUndefined();
  owner.clear();
  expect(first.entries()).toEqual([]);
  expect(second.entries()).toEqual([]);
  expect(owner.canonicalProjection().notices).toEqual([]);
}));

it.effect("refuses notice retention when its capacity reservation cannot fit", () => Effect.gen(function* () {
  const owner = yield* makeResidentState({ globalItems: 1, globalBytes: 10, partitionItems: 1, partitionBytes: 10 });
  const notices = owner.notices(2, 60_000, 120_000, measure);
  notices.record("a", "backend", 0);
  expect(notices.entries()).toEqual([]);
  expect(owner.canonicalProjection().notices).toEqual([]);
  expect(owner.snapshot().items).toBe(0);
  owner.notices(2, 60_000, 120_000, () => 1).record("a", "backend", 0);
  // The fixed reservation overhead still exceeds this owner's configured budget.
  expect(notices.entries()).toEqual([]);
}));

it.effect("defers notice pruning and cooldown release until execution", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const notices = owner.notices(2, 60_000, 120_000, measure);
  notices.record("a", "backend", 0);
  const retained = notices.entries()[0];
  if (retained === undefined) throw new Error("fixture notice missing");
  const before = owner.canonicalProjection();
  const prune = notices.prune(180_001);
  const drop = notices.drop(retained[0]);
  expect(owner.canonicalProjection()).toEqual(before);
  expect(owner.snapshot().items).toBe(1);
  yield* drop;
  expect(notices.entries()).toEqual([]);
  expect(owner.snapshot().items).toBe(0);
  yield* prune;
  yield* drop;
  expect(owner.canonicalProjection().notices).toEqual([]);
  expect(owner.snapshot().items).toBe(0);
}));
