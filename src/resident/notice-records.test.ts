import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Cause, Effect, Exit } from "effect";
import { makeResidentState } from "./capacity.ts";
const measure = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

it.effect("commits bounded notice metadata, suppression and capacity together", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const notices = owner.notices(2, 60_000, 120_000, measure);
  yield* notices.record("a", "backend", 0);
  const first = (yield* notices.entries())[0]?.[1];
  expect(first?.pending?.value).toEqual({ kind: "backend", suppressedCount: 0 });
  expect(Object.isFrozen(first)).toBe(true);
  expect(Object.isFrozen(first?.pending)).toBe(true);
  expect(owner.canonicalProjection().notices).toHaveLength(1);
  expect(owner.snapshot().items).toBe(1);
  yield* notices.record("a", "backend", 1);
  expect((yield* notices.entries())[0]?.[1].suppressedCount).toBe(1);
  expect(first?.suppressedCount).toBe(0);
  yield* notices.record("a", "backend", 60_000);
  expect((yield* notices.entries())[0]?.[1].pending?.value.suppressedCount).toBe(1);
  yield* notices.record("b", "capacity", 60_000);
  yield* notices.record("c", "backend", 60_000);
  expect((yield* notices.entries())).toHaveLength(2);
  yield* notices.prune(180_001);
  expect((yield* notices.entries())).toEqual([]);
  expect(owner.snapshot().items).toBe(0);
  expect(owner.canonicalProjection().notices).toEqual([]);
}));

it.effect("publishes no canonical notice or reservation when native measurement fails", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const notices = owner.notices(2, 60_000, 120_000, () => { throw new Error("measurement failed"); });
  const before = owner.canonicalProjection();
  const failed = yield* Effect.exit(notices.record("a", "backend", 0));
  expect(Exit.isFailure(failed)).toBe(true);
  if (Exit.isFailure(failed)) expect(Cause.pretty(failed.cause)).toContain("measurement failed");
  expect(owner.canonicalProjection()).toEqual(before);
  expect((yield* notices.entries())).toEqual([]);
  expect(owner.snapshot().items).toBe(0);
  yield* owner.notices(2, 60_000, 120_000, measure).record("a", "backend", 0);
  expect((yield* notices.entries())[0]?.[1].canonicalId).toBe(1);
  expect((yield* notices.entries())[0]?.[1].pending?.sequence).toBe(1);
}));

it.effect("shares notice views and clears native and canonical ownership together", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const first = owner.notices(2, 60_000, 120_000, measure);
  const second = owner.notices(2, 60_000, 120_000, measure);
  yield* first.record("a", "backend", 0);
  expect((yield* second.entries())).toEqual((yield* first.entries()));
  const pending = (yield* second.entries())[0]?.[1].pending;
  if (pending === undefined) throw new Error("fixture notice missing");
  expect(yield* second.remove(pending.id, "wrong-token")).toBe(false);
  const removals = yield* Effect.forEach(Array.from({ length: 16 }), () => second.remove(pending.id), { concurrency: "unbounded" });
  expect(removals.filter(Boolean)).toHaveLength(1);
  expect((yield* first.entries())[0]?.[1].pending).toBeUndefined();
  owner.clear();
  expect((yield* first.entries())).toEqual([]);
  expect((yield* second.entries())).toEqual([]);
  expect(owner.canonicalProjection().notices).toEqual([]);
}));

it.effect("refuses notice retention when its capacity reservation cannot fit", () => Effect.gen(function* () {
  const owner = yield* makeResidentState({ globalItems: 1, globalBytes: 10, partitionItems: 1, partitionBytes: 10 });
  const notices = owner.notices(2, 60_000, 120_000, measure);
  yield* notices.record("a", "backend", 0);
  expect((yield* notices.entries())).toEqual([]);
  expect(owner.canonicalProjection().notices).toEqual([]);
  expect(owner.snapshot().items).toBe(0);
  yield* owner.notices(2, 60_000, 120_000, () => 1).record("a", "backend", 0);
  // The fixed reservation overhead still exceeds this owner's configured budget.
  expect((yield* notices.entries())).toEqual([]);
}));

it.effect("defers notice pruning and cooldown release until execution", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const notices = owner.notices(2, 60_000, 120_000, measure);
  yield* notices.record("a", "backend", 0);
  const retained = (yield* notices.entries())[0];
  if (retained === undefined) throw new Error("fixture notice missing");
  const before = owner.canonicalProjection();
  const prune = notices.prune(180_001);
  const drop = notices.drop(retained[0]);
  expect(owner.canonicalProjection()).toEqual(before);
  expect(owner.snapshot().items).toBe(1);
  yield* drop;
  expect((yield* notices.entries())).toEqual([]);
  expect(owner.snapshot().items).toBe(0);
  yield* prune;
  yield* drop;
  expect(owner.canonicalProjection().notices).toEqual([]);
  expect(owner.snapshot().items).toBe(0);
}));

it.effect("reads frozen notice snapshots at execution time", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const notices = owner.notices(2, 60_000, 120_000, measure);
  const read = notices.entries();
  expect(yield* read).toEqual([]);
  yield* notices.record("a", "backend", 0);
  const retained = yield* read;
  expect(Object.isFrozen(retained)).toBe(true);
  expect(Object.isFrozen(retained[0])).toBe(true);
  yield* notices.record("a", "backend", 1);
  expect(retained[0]?.[1].suppressedCount).toBe(0);
  expect((yield* read)[0]?.[1].suppressedCount).toBe(1);
  yield* notices.prune(180_001);
  expect(yield* read).toEqual([]);
  expect(retained).toHaveLength(1);
}));

it.effect("serializes competing notice creation and allocates fresh identities on execution", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const notices = owner.notices(2, 60_000, 120_000, measure);
  const record = notices.record("a", "backend", 0);
  expect(yield* notices.entries()).toEqual([]);
  yield* Effect.forEach(Array.from({ length: 16 }), () => record, { concurrency: "unbounded" });
  const retained = yield* notices.entries();
  expect(retained).toHaveLength(1);
  expect(retained[0]?.[1].suppressedCount).toBe(15);
  expect(owner.snapshot().items).toBe(1);
  expect(owner.canonicalProjection().notices).toHaveLength(1);
  const pending = retained[0]?.[1].pending;
  if (pending === undefined || retained[0] === undefined) throw new Error("fixture notice missing");
  yield* notices.drop(retained[0][0]);
  yield* record;
  const replacement = (yield* notices.entries())[0]?.[1].pending;
  expect(replacement?.id).not.toBe(pending.id);
  expect(replacement?.sequence).toBeGreaterThan(pending.sequence);
  expect(owner.snapshot().items).toBe(1);
}));
