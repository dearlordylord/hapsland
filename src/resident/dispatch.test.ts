import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Deferred, Effect, Exit, Fiber, Queue } from "effect";
import { makeDispatcher } from "./dispatch.ts";
import { initialCanonical, projectCanonical, stepCanonical, type CanonicalEvent } from "../canonical/adapter.ts";
import { makeCapacityLedger, makeResidentState } from "./capacity.ts";

const makeFixture = (run: (entry: { readonly key: string; readonly value: number; readonly sequence: number }) => Effect.Effect<void>) =>
  Effect.gen(function* () {
    const ledger = yield* makeResidentState<never, string, number>();
    const ids = new Map<number, { operation: number; round: number }>();
    const dispatch = yield* makeDispatcher<string, number>(ledger, (value) => {
      const identity = ids.get(value);
      if (identity === undefined) throw new Error("test job identity missing");
      return identity;
    }, run);
    const enqueue = (key: string, value: number) => Effect.gen(function* () {
      ids.set(value, { operation: Effect.runSync(ledger.admitObservation(key)), round: Effect.runSync(ledger.roundId(key)) });
      return yield* dispatch.enqueue(key, value);
    });
    return { ...dispatch, enqueue, ledger };
  });

it.effect("uses the queued job's originating round after a successor opens", () => Effect.gen(function* () {
  const ledger = yield* makeResidentState<never, string, { operation: number; round: number }>();
  const oldRound = Effect.runSync(ledger.roundId("agent"));
  Effect.runSync(ledger.retireRound("agent", oldRound));
  const round = Effect.runSync(ledger.roundId("agent"));
  const operation = Effect.runSync(ledger.admitObservation("agent", round));
  const seen: number[] = [];
  const dispatch = yield* makeDispatcher<string, { operation: number; round: number }>(ledger, (job) => job,
    ({ value }) => Effect.sync(() => { seen.push(value.operation); }));
  expect(yield* dispatch.enqueue("agent", { operation, round: oldRound })).toBe(false);
  expect(yield* dispatch.enqueue("agent", { operation, round })).toBe(true);
  yield* dispatch.whenIdle();
  expect(seen).toEqual([operation]);
}));

it.effect("reports work only for the advicee with queued or running entries", () => Effect.gen(function* () {
  const first = yield* Deferred.make<void>();
  const dispatcher = yield* makeFixture(({ value }) => value === 1 ? Deferred.await(first) : Effect.void);
  yield* dispatcher.enqueue("a", 1);
  yield* dispatcher.enqueue("b", 2);
  expect(yield* dispatcher.hasWork("a")).toBe(true);
  expect(yield* dispatcher.hasWork("c")).toBe(false);
  yield* Deferred.succeed(first, undefined);
  yield* dispatcher.whenIdle();
  expect(yield* dispatcher.hasWork("a")).toBe(false);
  expect(yield* dispatcher.hasWork("b")).toBe(false);
}));

it.effect("starts later preparation while capacity is free and never exceeds eight jobs", () => Effect.gen(function* () {
  const started = yield* Queue.unbounded<number>();
  const gates = new Map<number, Deferred.Deferred<void>>();
  let running = 0;
  let maximum = 0;
  const dispatcher = yield* makeFixture(({ value }) => Effect.gen(function* () {
    running += 1;
    maximum = Math.max(maximum, running);
    yield* Queue.offer(started, value);
    const gate = gates.get(value);
    if (gate === undefined) return yield* Effect.die("gate missing");
    yield* Deferred.await(gate);
    running -= 1;
  }));
  for (let value = 0; value < 21; value += 1) {
    gates.set(value, yield* Deferred.make<void>());
    expect(yield* dispatcher.enqueue(value % 2 === 0 ? "one" : "two", value)).toBe(true);
  }
  const initial: number[] = [];
  for (let index = 0; index < 8; index += 1) initial.push(yield* Queue.take(started));
  expect(initial).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  for (let value = 0; value < 21; value += 1) {
    const gate = gates.get(value);
    if (gate === undefined) return yield* Effect.die("gate missing");
    yield* Deferred.succeed(gate, undefined);
    if (value < 13) expect(yield* Queue.take(started)).toBe(value + 8);
  }
  yield* dispatcher.whenIdle();
  expect(maximum).toBe(8);
}));

it.effect("returns every not-yet-running item on close and permits repeated close", () => Effect.gen(function* () {
  const hold = yield* Deferred.make<void>();
  const dispatcher = yield* makeFixture(() => Deferred.await(hold));
  for (let value = 1; value <= 10; value += 1) yield* dispatcher.enqueue("partition", value);
  expect(yield* dispatcher.close()).toEqual([9, 10]);
  expect(yield* dispatcher.close()).toEqual([]);
  expect(yield* dispatcher.enqueue("partition", 11)).toBe(false);
  yield* Deferred.succeed(hold, undefined);
  yield* dispatcher.whenIdle();
}));

it.effect("carries keyed FIFO sequence metadata across concurrent starts", () => Effect.gen(function* () {
  const first = yield* Deferred.make<void>();
  const entries: Array<{ key: string; value: number; sequence: number }> = [];
  const dispatcher = yield* makeFixture((entry) => Effect.gen(function* () {
    entries.push(entry);
    if (entry.value === 0) yield* Deferred.await(first);
  }));
  yield* dispatcher.enqueue("a", 0);
  yield* dispatcher.enqueue("b", 1);
  yield* dispatcher.enqueue("a", 2);
  yield* Deferred.succeed(first, undefined);
  yield* dispatcher.whenIdle();
  expect(entries).toEqual([
    { key: "a", value: 0, sequence: 0 }, { key: "b", value: 1, sequence: 1 }, { key: "a", value: 2, sequence: 2 },
  ]);
}));

it.effect("rolls back canonical identities and retained starts in the same failed registry commit", () => Effect.gen(function* () {
  const ledger = yield* makeResidentState<never, string, number>();
  const before = (yield* ledger.canonicalProjection());
  const beforeRegistry = yield* ledger.dispatch.read;
  const failed = yield* ledger.dispatch.modify((current, owner) => {
    const partition = owner.partitionId("failed-owner");
    const round = owner.roundId("failed-owner");
    const operation = owner.admitObservation("failed-owner", round);
    owner.transition({ kind: "queueDispatch", partition, lifetime: 1, round, operation });
    const entry = { key: "failed-owner", value: 1, partition, round, operation };
    const entries = new Map(current.entries);
    entries.set(operation, entry);
    const starts = [...current.starts, { entry, sequence: 0 }];
    expect(entries.size).toBe(1);
    expect(starts).toHaveLength(1);
    throw new Error("native draft validation failed");
  }).pipe(Effect.exit);
  expect(Exit.isFailure(failed)).toBe(true);
  expect((yield* ledger.canonicalProjection())).toEqual(before);
  expect(yield* ledger.dispatch.read).toBe(beforeRegistry);
  expect(Effect.runSync(ledger.knownPartitionId("failed-owner"))).toBeUndefined();
  expect(Effect.runSync(ledger.roundId("after-failure"))).toBe(1);
  expect(yield* ledger.partitionId("after-failure")).toBe(1);
}));

it.effect("refuses to clear a physical job and permits one executor per owner", () => Effect.gen(function* () {
  const release = yield* Deferred.make<void>();
  const started = yield* Deferred.make<void>();
  const dispatcher = yield* makeFixture(() => Effect.gen(function* () {
    yield* Deferred.succeed(started, undefined);
    yield* Deferred.await(release);
  }));
  try {
    yield* dispatcher.enqueue("agent", 1);
    yield* Deferred.await(started);
    const before = (yield* dispatcher.ledger.canonicalProjection());
    const native = yield* dispatcher.ledger.dispatch.read;
    expect(() => Effect.runSync(dispatcher.ledger.clear())).toThrow("resident state cannot clear outstanding native dispatch jobs");
    expect((yield* dispatcher.ledger.canonicalProjection())).toEqual(before);
    expect(yield* dispatcher.ledger.dispatch.read).toBe(native);
    const duplicate = yield* makeDispatcher<string, number>(dispatcher.ledger,
      () => ({ operation: 1, round: 1 }), () => Effect.void).pipe(Effect.exit);
    expect(Exit.isFailure(duplicate)).toBe(true);
    expect(yield* dispatcher.ledger.dispatch.read).toBe(native);
  } finally {
    yield* Deferred.succeed(release, undefined);
    yield* dispatcher.whenIdle();
  }
  yield* dispatcher.ledger.clear();
  expect((yield* dispatcher.ledger.dispatch.read).entries.size).toBe(0);
  const duplicateAfterClear = yield* makeDispatcher<string, number>(dispatcher.ledger,
    () => ({ operation: 1, round: 1 }), () => Effect.void).pipe(Effect.exit);
  expect(Exit.isFailure(duplicateAfterClear)).toBe(true);
}));

it.effect("rolls back canonical publication if native registration cannot commit", () => Effect.gen(function* () {
  const ledger = makeCapacityLedger();
  const before = (yield* ledger.canonicalProjection());
  expect(() => ledger.transition({ kind: "openRound", partition: 1, lifetime: 1 }, () => {
    throw new Error("registration failed");
  })).toThrow("registration failed");
  expect((yield* ledger.canonicalProjection())).toEqual(before);
}));

it.effect("subscriber interruption does not own the shared job and idle waits for physical settlement", () => Effect.gen(function* () {
  const started = yield* Deferred.make<void>();
  let release: (() => void) | undefined;
  const physical = new Promise<void>((resolve) => { release = resolve; });
  const dispatcher = yield* makeFixture(() => Effect.gen(function* () {
    yield* Deferred.succeed(started, undefined);
    yield* Effect.promise(() => physical);
  }));
  yield* dispatcher.enqueue("shared", 1);
  yield* Deferred.await(started);
  const subscriber = yield* dispatcher.whenIdle().pipe(Effect.forkScoped);
  yield* Fiber.interrupt(subscriber);
  yield* dispatcher.close();
  expect((yield* dispatcher.snapshot()).running).toBe(1);
  release?.();
  yield* dispatcher.whenIdle();
  expect((yield* dispatcher.snapshot()).running).toBe(0);
}));

it.effect("scope retirement waits for non-cooperative physical work and closes exactly once", () => Effect.gen(function* () {
  const started = yield* Deferred.make<void>();
  const readyToRetire = yield* Deferred.make<void>();
  const retired = yield* Deferred.make<void>();
  let release: (() => void) | undefined;
  const physical = new Promise<void>((resolve) => { release = resolve; });
  let finalized = 0;
  const resident = yield* Effect.scoped(Effect.gen(function* () {
    yield* Effect.addFinalizer(() => Effect.sync(() => { finalized += 1; }));
    const dispatcher = yield* makeFixture(() => Effect.gen(function* () {
      yield* Deferred.succeed(started, undefined);
      yield* Effect.promise(() => physical);
    }));
    yield* dispatcher.enqueue("resident", 1);
    yield* Deferred.await(readyToRetire);
  })).pipe(Effect.ensuring(Deferred.succeed(retired, undefined)), Effect.forkScoped);
  yield* Deferred.await(started);
  yield* Deferred.succeed(readyToRetire, undefined);
  yield* Effect.yieldNow;
  expect(yield* Deferred.isDone(retired)).toBe(false);
  expect(finalized).toBe(0);
  release?.();
  yield* Fiber.join(resident);
  expect(finalized).toBe(1);
}));

it.effect("retains committed jobs when the admitting subscriber is interrupted", () => Effect.gen(function* () {
  const committed = yield* Deferred.make<void>();
  const settle = yield* Deferred.make<void>();
  const observed = yield* Queue.unbounded<number>();
  const dispatcher = yield* makeFixture(({ value }) => Effect.gen(function* () {
    yield* Queue.offer(observed, value);
    yield* Deferred.await(settle);
  }));
  const caller = yield* dispatcher.enqueue("resident", 1).pipe(
    Effect.andThen(Deferred.succeed(committed, undefined)), Effect.andThen(Effect.never), Effect.forkScoped,
  );
  yield* Deferred.await(committed);
  yield* Fiber.interrupt(caller);
  expect(yield* Queue.take(observed)).toBe(1);
  expect((yield* dispatcher.snapshot()).running).toBe(1);
  yield* Deferred.succeed(settle, undefined);
  yield* dispatcher.whenIdle();
}));

it.effect("matches direct Bend commands and projections across saturation and terminal settlement", () => Effect.gen(function* () {
  const limits = { globalItems: 512, globalBytes: 268435456, partitionItems: 16, partitionBytes: 33554432 };
  const ledger = yield* makeResidentState<never, string, { operation: number; round: number }>(limits);
  let direct = initialCanonical(limits);
  const expectedStarts: Array<{ operation: number; sequence: number }> = [];
  const trace = (event: CanonicalEvent) => {
    const result = stepCanonical(direct, event);
    expect(result.rejection).toBeUndefined();
    direct = result.state;
    for (const command of result.commands) {
      if (command.kind === "dispatchStarted") expectedStarts.push({ operation: command.operation, sequence: command.sequence });
    }
  };
  const hold = yield* Deferred.make<void>();
  const started: Array<{ operation: number; sequence: number }> = [];
  const dispatch = yield* makeDispatcher<string, { operation: number; round: number }>(ledger, (job) => job,
    ({ value, sequence }) => Effect.gen(function* () {
      started.push({ operation: value.operation, sequence });
      yield* Deferred.await(hold);
    }));
  const partition = yield* ledger.partitionId("agent");
  const round = Effect.runSync(ledger.roundId("agent"));
  trace({ kind: "openRound", partition, lifetime: 1 });
  const jobs: Array<{ operation: number; round: number }> = [];
  for (let index = 0; index < 12; index += 1) {
    const operation = Effect.runSync(ledger.admitObservation("agent", round));
    trace({ kind: "admitObservation", partition, lifetime: 1, round });
    const job = { operation, round };
    jobs.push(job);
    trace({ kind: "queueDispatch", partition, lifetime: 1, round, operation });
    expect(yield* dispatch.enqueue("agent", job)).toBe(true);
    expect((yield* ledger.canonicalProjection())).toEqual(projectCanonical(direct));
    expect(yield* dispatch.hasWorkWhere((entry) => entry.value.operation === operation)).toBe(true);
  }
  expect(started).toEqual(expectedStarts);
  trace({ kind: "closeDispatch" });
  expect(yield* dispatch.close()).toEqual(jobs.slice(8));
  expect((yield* ledger.canonicalProjection())).toEqual(projectCanonical(direct));
  yield* Deferred.succeed(hold, undefined);
  yield* dispatch.whenIdle();
  for (const job of jobs.slice(0, 8)) trace({ kind: "dispatchSettled", partition, lifetime: 1, round, operation: job.operation });
  expect((yield* ledger.canonicalProjection())).toEqual(projectCanonical(direct));
}));
