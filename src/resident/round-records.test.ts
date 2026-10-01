import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Deferred, Effect } from "effect";
import { makeDispatcher } from "./dispatch.ts";
import { makeResidentState } from "./capacity.ts";
import { advicee } from "../direct-event/test-fixtures.ts";

const activity = { root: "/fixture", advicee: advicee(), activityPath: undefined };
const counts = { named: { queued: 1, running: 0 }, all: { queued: 2, running: 3 }, cancelled: 1, hasUnnamed: false };

it.effect("binds immutable handles and activity to the canonical admission generation", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const generation = owner.delivery().admitEdit("agent", "edit", 0);
  if (generation === undefined) throw new Error("fixture edit admission refused");
  const round = owner.rounds.bind("agent", generation, activity, "first-cohort");
  expect(round.canonicalRound).toBe(owner.currentRoundId("agent"));
  expect(owner.rounds.get("agent")).toBe(round);
  expect(Object.isFrozen(round)).toBe(true);
  expect(Object.isFrozen(round.work)).toBe(true);
  expect(Object.isFrozen(round.discarded)).toBe(true);
  expect(Object.isFrozen(owner.rounds.activity(round)?.advicee)).toBe(true);
  expect(Reflect.set(round, "work", { id: "forged", controller: new AbortController() })).toBe(false);
  const updated = owner.rounds.bind("agent", generation, { ...activity, activityPath: "/new/activity" }, "unused-cohort");
  expect(updated).toBe(round);
  expect(updated.work.id).toBe("first-cohort");
  expect(owner.rounds.activity(round)?.activityPath).toBe("/new/activity");
}));

it.effect("rejects missing or mismatched canonical authority without publishing identities", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const before = owner.canonicalProjection();
  expect(() => owner.rounds.bind("agent", 1, activity, "cohort")).toThrow("canonical admission generation");
  expect(owner.canonicalProjection()).toEqual(before);
  expect(owner.knownPartitionId("agent")).toBeUndefined();
  expect(owner.currentRoundId("agent")).toBeUndefined();
  expect(owner.rounds.entries()).toEqual([]);
  const generation = owner.delivery().admitEdit("agent", "edit", 0);
  if (generation === undefined) throw new Error("fixture edit admission refused");
  const admitted = owner.canonicalProjection();
  expect(() => owner.rounds.bind("agent", generation + 1, activity, "cohort")).toThrow("canonical admission generation");
  expect(owner.canonicalProjection()).toEqual(admitted);
  expect(owner.rounds.entries()).toEqual([]);
}));

it.effect("rolls back native binding and preserves a prior activity snapshot on construction failure", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const generation = owner.delivery().admitEdit("agent", "edit", 0);
  if (generation === undefined) throw new Error("fixture edit admission refused");
  const before = owner.canonicalProjection();
  const broken = { ...activity, get root(): string { throw new Error("activity construction failed"); } };
  expect(() => owner.rounds.bind("agent", generation, broken, "failed-cohort")).toThrow("activity construction failed");
  expect(owner.canonicalProjection()).toEqual(before);
  expect(owner.rounds.get("agent")).toBeUndefined();
  const round = owner.rounds.bind("agent", generation, activity, "cohort");
  const snapshot = owner.rounds.activity(round);
  expect(() => owner.rounds.bind("agent", generation, broken, "unused")).toThrow("activity construction failed");
  expect(owner.rounds.activity(round)).toBe(snapshot);
  expect(owner.rounds.get("agent")).toBe(round);
}));

it.effect("publishes cohort replacement and the Bend-selected discard counts together", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const generation = owner.delivery().admitEdit("agent", "edit", 0);
  if (generation === undefined) throw new Error("fixture edit admission refused");
  const round = owner.rounds.bind("agent", generation, activity, "first");
  const first = round.work;
  const next = { id: "next", controller: new AbortController() };
  expect(owner.rounds.replaceWork(round, next, counts)).toEqual({ matched: true, previousWork: first });
  expect(round.work).toEqual(next);
  expect(round.discarded).toEqual({ queued: 1, running: 0 });
  expect(first.controller.signal.aborted).toBe(false);
  expect(owner.rounds.replaceWork(round, { id: "last", controller: new AbortController() },
    { ...counts, named: { queued: 0, running: 0 }, hasUnnamed: true })?.matched).toBe(false);
  expect(round.discarded).toEqual({ queued: 3, running: 3 });
  expect(round.work.id).toBe("last");
}));

it.effect("publishes no replacement or discarded counts when native cohort construction fails", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const generation = owner.delivery().admitEdit("agent", "edit", 0);
  if (generation === undefined) throw new Error("fixture edit admission refused");
  const round = owner.rounds.bind("agent", generation, activity, "cohort");
  const first = round.work;
  const before = owner.canonicalProjection();
  expect(() => owner.rounds.replaceWork(round,
    { get id(): string { throw new Error("cohort construction failed"); }, controller: new AbortController() }, counts,
  )).toThrow("cohort construction failed");
  expect(round.work).toBe(first);
  expect(round.discarded).toEqual({ queued: 0, running: 0 });
  expect(owner.canonicalProjection()).toEqual(before);
}));

it.effect("retires canonical and native ownership together and fences identity reuse after clear", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const firstGeneration = owner.delivery().admitEdit("agent", "first", 0);
  if (firstGeneration === undefined) throw new Error("fixture edit admission refused");
  const first = owner.rounds.bind("agent", firstGeneration, activity, "first");
  expect(owner.rounds.retire(first)).toBe(true);
  expect(owner.currentRoundId("agent")).toBeUndefined();
  expect(owner.rounds.entries()).toEqual([]);
  expect(owner.canonicalProjection().rounds).toEqual([]);
  owner.clear();
  const nextGeneration = owner.delivery().admitEdit("agent", "next", 0);
  if (nextGeneration === undefined) throw new Error("fixture edit admission refused");
  const next = owner.rounds.bind("agent", nextGeneration, activity, "next");
  expect(next.canonicalRound).toBe(first.canonicalRound);
  owner.admitObservation("agent", next.canonicalRound);
  expect(next.policyWork().unfinished()).toBe(1);
  expect(first.policyWork().unfinished()).toBe(0);
  const before = owner.canonicalProjection();
  expect(owner.rounds.retire(first)).toBe(false);
  expect(owner.rounds.replaceWork(first, { id: "forged", controller: new AbortController() }, counts)).toBeUndefined();
  expect(owner.rounds.activity(first)).toBeUndefined();
  expect(owner.canonicalProjection()).toEqual(before);
  expect(owner.rounds.get("agent")).toBe(next);
  expect(next.work.id).toBe("next");
}));

it.effect("retains round metadata until outstanding physical dispatch work settles before clear", () => Effect.gen(function* () {
  const owner = yield* makeResidentState<never, string, { readonly operation: number; readonly round: number }>();
  const generation = owner.delivery().admitEdit("agent", "edit", 0);
  if (generation === undefined) throw new Error("fixture edit admission refused");
  const round = owner.rounds.bind("agent", generation, activity, "cohort");
  const started = yield* Deferred.make<void>();
  const finish = yield* Deferred.make<void>();
  const dispatch = yield* makeDispatcher(owner, (job) => job, () => Effect.gen(function* () {
    yield* Deferred.succeed(started, undefined);
    yield* Deferred.await(finish);
  }));
  yield* Effect.gen(function* () {
    const operation = owner.admitObservation("agent", round.canonicalRound);
    expect(yield* dispatch.enqueue("agent", { operation, round: round.canonicalRound })).toBe(true);
    yield* Deferred.await(started);
    round.controller.abort();
    round.work.controller.abort();
    yield* dispatch.close();
    expect(() => owner.clear()).toThrow("outstanding native dispatch jobs");
    expect(owner.rounds.get("agent")).toBe(round);
    expect(owner.rounds.activity(round)?.root).toBe("/fixture");
    expect((yield* dispatch.snapshot()).running).toBe(1);
    yield* Deferred.succeed(finish, undefined);
    yield* dispatch.whenIdle();
    owner.clear();
    expect(owner.rounds.entries()).toEqual([]);
    expect(owner.rounds.activity(round)).toBeUndefined();
    expect(round.policyWork().unfinished()).toBe(0);
  }).pipe(Effect.ensuring(Deferred.succeed(finish, undefined)));
}));
