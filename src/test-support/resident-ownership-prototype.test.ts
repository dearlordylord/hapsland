import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Deferred, Effect, Fiber, Queue } from "effect";
import { initialCanonical, projectCanonical, stepCanonical, type CanonicalEvent } from "../canonical/adapter.ts";
import { OwnershipPrototype, ownershipPrototypeLayer, startPrototypeCommands, type NativeJob } from "./resident-ownership-prototype.ts";

const limits = { globalItems: 512, globalBytes: 268435456, partitionItems: 16, partitionBytes: 33554432 };
const withOwner = <A, E, R>(effect: Effect.Effect<A, E, R | OwnershipPrototype>) => effect.pipe(Effect.provide(ownershipPrototypeLayer(limits)));
const admit = Effect.fn("PrototypeTest.admit")(function* (run: NativeJob["run"]) {
  const owner = yield* OwnershipPrototype;
  const existing = (yield* owner.inspect()).projection.rounds.find((entry) => entry.partition === 1);
  let round = existing?.id;
  if (round === undefined) {
    const opened = yield* owner.commit({ kind: "openRound", partition: 1, lifetime: 1 });
    const command = opened.commands[0];
    if (command?.kind !== "roundStarted") return yield* Effect.die("round missing");
    round = command.id;
  }
  const admitted = yield* owner.commit({ kind: "admitObservation", partition: 1, lifetime: 1, round });
  const observation = admitted.commands[0];
  if (observation?.kind !== "observationAdmitted") return yield* Effect.die("observation missing");
  return { operation: observation.id, partition: 1, round, run };
});

it.effect("matches direct canonical traces and retains starts across interrupted callers", () => withOwner(Effect.gen(function* () {
  const owner = yield* OwnershipPrototype;
  const job = yield* admit(async () => {});
  // Compare a fresh, direct Bend trace rather than another Effect owner.
  let direct = initialCanonical(limits);
  const events: CanonicalEvent[] = [
    { kind: "openRound", partition: 1, lifetime: 1 },
    { kind: "admitObservation", partition: 1, lifetime: 1, round: job.round },
    { kind: "queueDispatch", partition: 1, lifetime: 1, round: job.round, operation: job.operation },
  ];
  let commands: ReturnType<typeof stepCanonical>["commands"] = [];
  for (const event of events) { const result = stepCanonical(direct, event); direct = result.state; commands = result.commands; }
  const committed = yield* Deferred.make<void>();
  const caller = yield* Effect.gen(function* () {
    const event = events[2];
    if (event === undefined) return yield* Effect.die("queue event missing");
    const result = yield* owner.commit(event, job);
    expect(result.commands).toEqual(commands);
    yield* Deferred.succeed(committed, undefined);
    yield* Effect.never;
  }).pipe(Effect.forkScoped);
  yield* Deferred.await(committed);
  yield* Fiber.interrupt(caller);
  const observed = yield* owner.inspect();
  expect(observed.projection).toEqual(projectCanonical(direct));
  expect(observed.registered).toEqual([job.operation]);
  expect(observed.pending).toEqual([job.operation]);
})));

it.effect("rolls back canonical publication when native registration fails and refuses stale rounds", () => withOwner(Effect.gen(function* () {
  const owner = yield* OwnershipPrototype;
  const job = yield* admit(async () => {});
  const event: CanonicalEvent = { kind: "queueDispatch", partition: 1, lifetime: 1, round: job.round, operation: job.operation };
  const before = yield* owner.inspect();
  const failed = yield* Effect.exit(owner.commit(event));
  expect(failed._tag).toBe("Failure");
  expect(yield* owner.inspect()).toEqual(before);
  const refused = yield* owner.commit({ ...event, round: job.round + 1 }, job);
  expect(refused.rejection).toBeDefined();
  expect(yield* owner.inspect()).toEqual(before);
})));

it.effect("resident scope waits for physical settlement after close and finalizes exactly once", () => withOwner(Effect.gen(function* () {
  const owner = yield* OwnershipPrototype;
  const started = yield* Deferred.make<void>();
  const closing = yield* Deferred.make<void>();
  const closed = yield* Deferred.make<void>();
  let release: (() => void) | undefined;
  const physical = new Promise<void>((resolve) => { release = resolve; });
  let finalized = 0;
  const resident = yield* Effect.scoped(Effect.gen(function* () {
    yield* Effect.addFinalizer(() => Effect.sync(() => { finalized += 1; }));
    const job = yield* admit(async () => {
      Effect.runSync(Deferred.succeed(started, undefined));
      await physical;
    });
    yield* owner.commit({ kind: "queueDispatch", partition: 1, lifetime: 1, round: job.round, operation: job.operation }, job);
    yield* startPrototypeCommands();
    yield* Deferred.await(closing);
    yield* owner.commit({ kind: "closeDispatch" });
  })).pipe(Effect.ensuring(Deferred.succeed(closed, undefined)), Effect.forkScoped);
  yield* Deferred.await(started);
  yield* Deferred.succeed(closing, undefined);
  yield* Effect.yieldNow;
  expect(yield* Deferred.isDone(closed)).toBe(false);
  expect((yield* owner.inspect()).registered).toHaveLength(1);
  release?.();
  yield* Fiber.join(resident);
  expect(finalized).toBe(1);
  expect((yield* owner.inspect()).registered).toEqual([]);
})));

it.effect("keeps interrupted non-cooperative work registered until it physically settles", () => withOwner(Effect.gen(function* () {
  const owner = yield* OwnershipPrototype;
  const started = yield* Deferred.make<void>();
  const finished = yield* Deferred.make<void>();
  let release: (() => void) | undefined;
  const physical = new Promise<void>((resolve) => { release = resolve; });
  const resident = yield* Effect.scoped(Effect.gen(function* () {
    const job = yield* admit(async () => {
      Effect.runSync(Deferred.succeed(started, undefined));
      await physical;
    });
    yield* owner.commit({ kind: "queueDispatch", partition: 1, lifetime: 1, round: job.round, operation: job.operation }, job);
    yield* startPrototypeCommands();
    yield* Effect.never;
  })).pipe(Effect.ensuring(Deferred.succeed(finished, undefined)), Effect.forkScoped);
  yield* Deferred.await(started);
  const interrupt = yield* Fiber.interrupt(resident).pipe(Effect.forkScoped);
  yield* Effect.yieldNow;
  expect(yield* Deferred.isDone(finished)).toBe(false);
  const running = yield* owner.inspect();
  expect(running.registered).toHaveLength(1);
  expect(running.projection.dispatch.running).toHaveLength(1);
  release?.();
  yield* Fiber.join(interrupt);
  expect((yield* owner.inspect()).registered).toEqual([]);
})));

it.effect("matches saturated queue, discard and settlement traces with every native handle retained", () => withOwner(Effect.gen(function* () {
  const owner = yield* OwnershipPrototype;
  let direct = initialCanonical(limits);
  const replay = Effect.fn("PrototypeTest.replay")(function* (event: CanonicalEvent, job?: NativeJob) {
    const expected = stepCanonical(direct, event);
    const actual = yield* owner.commit(event, job);
    expect(actual.commands).toEqual(expected.commands);
    expect(actual.rejection).toEqual(expected.rejection);
    if (expected.rejection === undefined) direct = expected.state;
    expect((yield* owner.inspect()).projection).toEqual(projectCanonical(direct));
    return actual;
  });
  const opened = yield* replay({ kind: "openRound", partition: 1, lifetime: 1 });
  const round = opened.commands[0];
  if (round?.kind !== "roundStarted") return yield* Effect.die("round missing");
  const jobs: NativeJob[] = [];
  for (let index = 0; index < 12; index += 1) {
    const result = yield* replay({ kind: "admitObservation", partition: 1, lifetime: 1, round: round.id });
    const observation = result.commands[0];
    if (observation?.kind !== "observationAdmitted") return yield* Effect.die("observation missing");
    const job = { partition: 1, round: round.id, operation: observation.id, run: async () => {} };
    jobs.push(job);
    yield* replay({ kind: "queueDispatch", partition: 1, lifetime: 1, round: round.id, operation: job.operation }, job);
  }
  const saturated = yield* owner.inspect();
  expect(saturated.projection.dispatch.running).toHaveLength(8);
  expect(saturated.projection.dispatch.queued).toHaveLength(4);
  expect(saturated.registered).toHaveLength(12);
  yield* replay({ kind: "closeDispatch" });
  expect((yield* owner.inspect()).registered).toHaveLength(8);
  for (const job of jobs.slice(0, 8)) {
    yield* replay({ kind: "dispatchSettled", partition: 1, lifetime: 1, round: job.round, operation: job.operation });
  }
  expect((yield* owner.inspect()).registered).toEqual([]);
})));

it.effect("executes canonical replenishment without inventing a worker-pool policy", () => withOwner(Effect.gen(function* () {
  const owner = yield* OwnershipPrototype;
  const started = yield* Queue.unbounded<number>();
  const releases: Array<() => void> = [];
  const physical = Array.from({ length: 12 }, () => new Promise<void>((resolve) => { releases.push(resolve); }));
  let running = 0;
  let maximum = 0;
  yield* Effect.scoped(Effect.gen(function* () {
    for (let index = 0; index < 12; index += 1) {
      const job = yield* admit(async () => {
        running += 1;
        maximum = Math.max(maximum, running);
        Effect.runSync(Queue.offer(started, index));
        await physical[index];
        running -= 1;
      });
      yield* owner.commit({ kind: "queueDispatch", partition: 1, lifetime: 1, round: job.round, operation: job.operation }, job);
    }
    yield* startPrototypeCommands();
    const first: number[] = [];
    for (let index = 0; index < 8; index += 1) first.push(yield* Queue.take(started));
    expect(first).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    releases[0]?.();
    expect(yield* Queue.take(started)).toBe(8);
    releases[1]?.();
    expect(yield* Queue.take(started)).toBe(9);
    releases[2]?.();
    expect(yield* Queue.take(started)).toBe(10);
    releases[3]?.();
    expect(yield* Queue.take(started)).toBe(11);
    for (const release of releases) release();
  }));
  expect(maximum).toBe(8);
  expect((yield* owner.inspect()).registered).toEqual([]);
})));
