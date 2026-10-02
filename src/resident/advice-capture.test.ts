import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Effect } from "effect";
import { makeResidentState } from "./capacity.ts";
const revision = Object.freeze({ subject: "fixture", token: "fixture", generation: 1 });

it.effect("retains retired capture capacity until physical settlement and fences duplicate completion", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const reservation = owner.reserve("partition", 100, "storedResult");
  if (reservation === undefined) throw new Error("missing fixture reservation");
  const capture = yield* owner.adviceCaptures.start(reservation, revision, 200);
  if (capture === undefined) throw new Error("missing fixture capture");
  expect(Object.isFrozen(capture)).toBe(true);
  expect(reservation.bytes).toBe(300);
  expect(yield* owner.adviceCaptures.start(reservation, revision, 100)).toBeUndefined();
  expect(owner.adviceCaptures.retire(reservation)).toBe(true);
  expect(owner.snapshot().bytes).toBe(300);
  expect(() => owner.clear()).toThrow("outstanding advice captures");
  expect(owner.adviceCaptures.resize(capture, 250)).toBe(true);
  expect(owner.snapshot().bytes).toBe(350);
  expect(owner.adviceCaptures.finish(capture)).toBe("retired");
  expect(owner.snapshot().items).toBe(0);
  expect(owner.adviceCaptures.finish(capture)).toBe("stale");
  expect(owner.adviceCaptures.resize(capture, 200)).toBe(false);
  expect(owner.adviceCaptures.count()).toBe(0);
  owner.clear();
}));

it.effect("restores retained bytes and prevents a completed capture from settling its replacement", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const reservation = owner.reserve("partition", 100, "storedResult");
  if (reservation === undefined) throw new Error("missing fixture reservation");
  const first = yield* owner.adviceCaptures.start(reservation, revision, 200);
  if (first === undefined) throw new Error("missing fixture capture");
  expect(owner.adviceCaptures.finish(first)).toBe("retained");
  expect(reservation.bytes).toBe(100);
  expect(reservation.purpose).toBe("storedResult");
  const second = yield* owner.adviceCaptures.start(reservation, revision, 400);
  if (second === undefined) throw new Error("missing replacement capture");
  expect(owner.adviceCaptures.finish(first)).toBe("stale");
  expect(owner.adviceCaptures.resize(first, 1)).toBe(false);
  expect(reservation.bytes).toBe(500);
  expect(owner.adviceCaptures.finish(second)).toBe("retained");
  expect(reservation.bytes).toBe(100);
}));

it.effect("publishes no capture when workspace capacity is refused", () => Effect.gen(function* () {
  const owner = yield* makeResidentState({ globalItems: 1, globalBytes: 200, partitionItems: 1, partitionBytes: 200 });
  const reservation = owner.reserve("partition", 100, "storedResult");
  if (reservation === undefined) throw new Error("missing fixture reservation");
  const before = owner.canonicalProjection();
  expect(yield* owner.adviceCaptures.start(reservation, revision, 101)).toBeUndefined();
  expect(owner.adviceCaptures.count()).toBe(0);
  expect(owner.canonicalProjection()).toEqual(before);
  expect(reservation.bytes).toBe(100);
  expect(owner.adviceCaptures.retire(reservation)).toBe(false);
}));

it.effect("acquires one workspace for competing deferred captures", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const reservation = owner.reserve("partition", 100, "storedResult");
  if (reservation === undefined) throw new Error("missing fixture reservation");
  const start = owner.adviceCaptures.start(reservation, revision, 200);
  expect(reservation.bytes).toBe(100);
  const captures = yield* Effect.all(Array.from({ length: 16 }, () => start), { concurrency: 16 });
  const acquired = captures.filter((capture) => capture !== undefined);
  expect(acquired).toHaveLength(1);
  expect(reservation.bytes).toBe(300);
  expect(owner.adviceCaptures.finish(acquired[0]!)).toBe("retained");
  expect(reservation.bytes).toBe(100);
}));
