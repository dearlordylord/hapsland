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
  expect((yield* owner.reservationSnapshot(reservation))?.bytes).toBe(300);
  expect(yield* owner.adviceCaptures.start(reservation, revision, 100)).toBeUndefined();
  expect(yield* owner.adviceCaptures.retire(reservation)).toBe(true);
  expect(owner.snapshot().bytes).toBe(300);
  expect(() => Effect.runSync(owner.clear())).toThrow("outstanding advice captures");
  expect(yield* owner.adviceCaptures.resize(capture, 250)).toBe(true);
  expect(owner.snapshot().bytes).toBe(350);
  expect(yield* owner.adviceCaptures.finish(capture)).toBe("retired");
  expect(owner.snapshot().items).toBe(0);
  expect(yield* owner.adviceCaptures.finish(capture)).toBe("stale");
  expect(yield* owner.adviceCaptures.resize(capture, 200)).toBe(false);
  expect(yield* owner.adviceCaptures.count()).toBe(0);
  yield* owner.clear();
}));

it.effect("restores retained bytes and prevents a completed capture from settling its replacement", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const reservation = owner.reserve("partition", 100, "storedResult");
  if (reservation === undefined) throw new Error("missing fixture reservation");
  const first = yield* owner.adviceCaptures.start(reservation, revision, 200);
  if (first === undefined) throw new Error("missing fixture capture");
  expect(yield* owner.adviceCaptures.finish(first)).toBe("retained");
  expect((yield* owner.reservationSnapshot(reservation))?.bytes).toBe(100);
  expect((yield* owner.reservationSnapshot(reservation))?.purpose).toBe("storedResult");
  const second = yield* owner.adviceCaptures.start(reservation, revision, 400);
  if (second === undefined) throw new Error("missing replacement capture");
  expect(yield* owner.adviceCaptures.finish(first)).toBe("stale");
  expect(yield* owner.adviceCaptures.resize(first, 1)).toBe(false);
  expect((yield* owner.reservationSnapshot(reservation))?.bytes).toBe(500);
  expect(yield* owner.adviceCaptures.finish(second)).toBe("retained");
  expect((yield* owner.reservationSnapshot(reservation))?.bytes).toBe(100);
}));

it.effect("publishes no capture when workspace capacity is refused", () => Effect.gen(function* () {
  const owner = yield* makeResidentState({ globalItems: 1, globalBytes: 200, partitionItems: 1, partitionBytes: 200 });
  const reservation = owner.reserve("partition", 100, "storedResult");
  if (reservation === undefined) throw new Error("missing fixture reservation");
  const before = owner.canonicalProjection();
  expect(yield* owner.adviceCaptures.start(reservation, revision, 101)).toBeUndefined();
  expect(yield* owner.adviceCaptures.count()).toBe(0);
  expect(owner.canonicalProjection()).toEqual(before);
  expect((yield* owner.reservationSnapshot(reservation))?.bytes).toBe(100);
  expect(yield* owner.adviceCaptures.retire(reservation)).toBe(false);
}));

it.effect("acquires one workspace for competing deferred captures", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const reservation = owner.reserve("partition", 100, "storedResult");
  if (reservation === undefined) throw new Error("missing fixture reservation");
  const start = owner.adviceCaptures.start(reservation, revision, 200);
  expect((yield* owner.reservationSnapshot(reservation))?.bytes).toBe(100);
  const captures = yield* Effect.all(Array.from({ length: 16 }, () => start), { concurrency: 16 });
  const acquired = captures.filter((capture) => capture !== undefined);
  expect(acquired).toHaveLength(1);
  expect((yield* owner.reservationSnapshot(reservation))?.bytes).toBe(300);
  const finish = owner.adviceCaptures.finish(acquired[0]!);
  expect((yield* owner.reservationSnapshot(reservation))?.bytes).toBe(300);
  const results = yield* Effect.all(Array.from({ length: 16 }, () => finish), { concurrency: 16 });
  expect(results.filter((result) => result === "retained")).toHaveLength(1);
  expect(results.filter((result) => result === "stale")).toHaveLength(15);
  expect((yield* owner.reservationSnapshot(reservation))?.bytes).toBe(100);
}));
