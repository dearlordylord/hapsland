import { describe, expect, it } from "@effect/vitest";
import { Deferred, Effect, Exit, Fiber, Layer } from "effect";
import { mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireResidentOwnership, releaseResidentOwnership, ResidentOwnershipControls, ResidentOwnershipError, ownershipControlsLayer } from "./ownership.ts";

const fixture = Effect.fn("ResidentOwnershipFixture.acquire")(function* () {
  const root = yield* Effect.promise(() => mkdtemp(join(tmpdir(), "resident-ownership-")));
  yield* Effect.addFinalizer(() => Effect.promise(() => rm(root, { recursive: true, force: true })));
  return join(root, "owner.lock");
});
const acquire = Effect.fn("ResidentOwnershipFixture.elect")((lock: string,
  controls: Layer.Layer<ResidentOwnershipControls> = ownershipControlsLayer) =>
  acquireResidentOwnership(lock).pipe(Effect.provide(controls)));
const ownerAt = Effect.fn("ResidentOwnershipFixture.ownerAt")(function* (lock: string) {
  return JSON.parse(yield* Effect.promise(() => readFile(join(lock, "owner.json"), "utf8")));
});
const contenders = (lock: string) => Effect.all(Array.from({ length: 20 }, () => acquire(lock)), { concurrency: "unbounded" });

describe("portable resident ownership", () => {
  it.live("does not replace a newly live owner after inspecting a stale inode", () => Effect.scoped(Effect.gen(function* () {
    const lock = yield* fixture();
    yield* Effect.promise(() => mkdir(lock));
    yield* Effect.promise(() => writeFile(join(lock, "owner.json"), '{"pid":99999999,"token":"dead"}\n'));
    const old = `${lock}.old`;
    const controls = Layer.succeed(ResidentOwnershipControls, {
      beforeReplace: Effect.gen(function* () {
        yield* Effect.promise(() => rename(lock, old));
        yield* Effect.promise(() => mkdir(lock));
        yield* Effect.promise(() => writeFile(join(lock, "owner.json"), `${JSON.stringify({ pid: process.pid, token: "live" })}\n`));
      }),
    });
    expect(yield* acquire(lock, controls)).toBe(false);
    expect(yield* ownerAt(lock)).toEqual({ pid: process.pid, token: "live" });
  })));

  it.live.each(["empty", "partial"])("recovers an interrupted %s owner directory", (kind) => Effect.scoped(Effect.gen(function* () {
    const lock = yield* fixture();
    yield* Effect.promise(() => mkdir(lock));
    if (kind === "partial") yield* Effect.promise(() => writeFile(join(lock, "owner.json"), "{\n"));
    yield* Effect.promise(() => utimes(lock, new Date(0), new Date(0)));
    expect(yield* acquire(lock)).toBe(true);
    const owner = yield* ownerAt(lock);
    expect(owner.pid).toBe(process.pid);
    expect(typeof owner.token).toBe("string");
    yield* releaseResidentOwnership(lock);
  })));

  it.live("protects a live PID even when owner token metadata is absent", () => Effect.scoped(Effect.gen(function* () {
    const lock = yield* fixture();
    yield* Effect.promise(() => mkdir(lock));
    yield* Effect.promise(() => writeFile(join(lock, "owner.json"), `${JSON.stringify({ pid: process.pid })}\n`));
    expect(yield* acquire(lock)).toBe(false);
    expect(yield* ownerAt(lock)).toEqual({ pid: process.pid });
  })));

  it.live("elects one owner under concurrent stale recovery", () => Effect.scoped(Effect.gen(function* () {
    const lock = yield* fixture();
    yield* Effect.promise(() => mkdir(lock));
    yield* Effect.promise(() => writeFile(join(lock, "owner.json"), '{"pid":99999999,"token":"dead"}\n'));
    expect((yield* contenders(lock)).filter(Boolean)).toHaveLength(1);
    expect((yield* Effect.promise(() => stat(lock))).isDirectory()).toBe(true);
    yield* releaseResidentOwnership(lock);
  })));

  it.live("elects one fresh owner and removes every losing candidate", () => Effect.scoped(Effect.gen(function* () {
    const lock = yield* fixture();
    expect((yield* contenders(lock)).filter(Boolean)).toHaveLength(1);
    expect((yield* ownerAt(lock)).pid).toBe(process.pid);
    expect(yield* Effect.promise(() => readdir(join(lock, "..")))).toEqual(["owner.lock"]);
    yield* releaseResidentOwnership(lock);
    expect(yield* Effect.promise(() => readdir(join(lock, "..")))).toEqual([]);
  })));

  it.live("elects one owner when a crashed recovery claimant is already published", () => Effect.scoped(Effect.gen(function* () {
    const lock = yield* fixture();
    yield* Effect.promise(() => mkdir(lock));
    yield* Effect.promise(() => writeFile(join(lock, "owner.json"), '{"pid":99999999,"token":"dead-owner"}\n'));
    const observed = yield* Effect.promise(() => stat(lock, { bigint: true }));
    const recovery = `${lock}.recovery-${observed.dev}-${observed.ino}`;
    yield* Effect.promise(() => mkdir(recovery));
    yield* Effect.promise(() => writeFile(join(recovery, "owner.json"), '{"pid":99999998,"token":"dead-claimant"}\n'));
    expect((yield* contenders(lock)).filter(Boolean)).toHaveLength(1);
    const winner = yield* ownerAt(lock);
    expect(winner.pid).toBe(process.pid);
    expect(yield* acquire(lock)).toBe(false);
    expect(yield* ownerAt(lock)).toEqual(winner);
    yield* releaseResidentOwnership(lock);
  })));

  it.live("elects one owner from an empty stale directory and crashed recovery claimant", () => Effect.scoped(Effect.gen(function* () {
    const lock = yield* fixture();
    yield* Effect.promise(() => mkdir(lock));
    yield* Effect.promise(() => utimes(lock, new Date(0), new Date(0)));
    const observed = yield* Effect.promise(() => stat(lock, { bigint: true }));
    const recovery = `${lock}.recovery-${observed.dev}-${observed.ino}`;
    yield* Effect.promise(() => mkdir(recovery));
    yield* Effect.promise(() => writeFile(join(recovery, "owner.json"), '{"pid":99999998,"token":"dead-claimant"}\n'));
    expect((yield* contenders(lock)).filter(Boolean)).toHaveLength(1);
    const winner = yield* ownerAt(lock);
    expect(winner.pid).toBe(process.pid);
    const retired = `${lock}.retired-${observed.dev}-${observed.ino}`;
    expect(JSON.parse(yield* Effect.promise(() => readFile(join(retired, "retirement.guard"), "utf8"))))
      .toMatchObject({ pid: process.pid });
    expect(yield* acquire(lock)).toBe(false);
    expect(yield* ownerAt(lock)).toEqual(winner);
    yield* releaseResidentOwnership(lock);
  })));

  it.live("leaves a malformed regular-file lock untouched", () => Effect.scoped(Effect.gen(function* () {
    const lock = yield* fixture();
    yield* Effect.promise(() => writeFile(lock, ""));
    expect(yield* acquire(lock)).toBe(false);
    expect((yield* Effect.promise(() => stat(lock))).isFile()).toBe(true);
  })));

  it.live("reports candidate creation failure without exposing native paths", () => Effect.scoped(Effect.gen(function* () {
    const lock = yield* fixture();
    const failure = yield* acquire(join(lock, "missing-parent")).pipe(Effect.flip);
    expect(failure).toMatchObject({ _tag: "ResidentOwnershipError", operation: "createCandidate", code: "ENOENT" });
    expect(JSON.stringify(failure)).not.toContain(lock);
    expect(yield* Effect.promise(() => readdir(join(lock, "..")))).toEqual([]);
  })));

  it.live("retires its recovery claim when the replacement barrier fails", () => Effect.scoped(Effect.gen(function* () {
    const lock = yield* fixture();
    yield* Effect.promise(() => mkdir(lock));
    yield* Effect.promise(() => writeFile(join(lock, "owner.json"), '{"pid":99999999,"token":"dead"}\n'));
    const controls = Layer.succeed(ResidentOwnershipControls, {
      beforeReplace: Effect.fail(new ResidentOwnershipError({ operation: "replaceBarrier" })),
    });
    const failure = yield* acquire(lock, controls).pipe(Effect.flip);
    expect(failure.operation).toBe("replaceBarrier");
    expect(yield* ownerAt(lock)).toEqual({ pid: 99999999, token: "dead" });
    expect(yield* Effect.promise(() => readdir(join(lock, "..")))).toEqual(["owner.lock"]);
  })));

  it.live("interrupts a held replacement barrier and retires only its own claim", () => Effect.scoped(Effect.gen(function* () {
    const lock = yield* fixture();
    yield* Effect.promise(() => mkdir(lock));
    yield* Effect.promise(() => writeFile(join(lock, "owner.json"), '{"pid":99999999,"token":"dead"}\n'));
    const entered = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const controls = Layer.succeed(ResidentOwnershipControls, {
      beforeReplace: Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release))),
    });
    const attempt = yield* Effect.forkChild(acquire(lock, controls), { startImmediately: true });
    yield* Deferred.await(entered);
    yield* Fiber.interrupt(attempt);
    expect(Exit.hasInterrupts(yield* Fiber.await(attempt))).toBe(true);
    expect(yield* Deferred.isDone(release)).toBe(false);
    expect(yield* ownerAt(lock)).toEqual({ pid: 99999999, token: "dead" });
    expect(yield* Effect.promise(() => readdir(join(lock, "..")))).toEqual(["owner.lock"]);
  })));

  it.live("preserves a crashed claimant it does not own when the replacement barrier fails", () => Effect.scoped(Effect.gen(function* () {
    const lock = yield* fixture();
    yield* Effect.promise(() => mkdir(lock));
    yield* Effect.promise(() => writeFile(join(lock, "owner.json"), '{"pid":99999999,"token":"dead-owner"}\n'));
    const observed = yield* Effect.promise(() => stat(lock, { bigint: true }));
    const recovery = `${lock}.recovery-${observed.dev}-${observed.ino}`;
    yield* Effect.promise(() => mkdir(recovery));
    yield* Effect.promise(() => writeFile(join(recovery, "owner.json"), '{"pid":99999998,"token":"dead-claimant"}\n'));
    const controls = Layer.succeed(ResidentOwnershipControls, {
      beforeReplace: Effect.fail(new ResidentOwnershipError({ operation: "replaceBarrier" })),
    });
    yield* acquire(lock, controls).pipe(Effect.flip);
    expect(yield* ownerAt(recovery)).toEqual({ pid: 99999998, token: "dead-claimant" });
    expect((yield* Effect.promise(() => readdir(join(lock, "..")))).sort())
      .toEqual(["owner.lock", `owner.lock.recovery-${observed.dev}-${observed.ino}`].sort());
  })));

  it.live("releases the elected lock when its process scope is interrupted", () => Effect.scoped(Effect.gen(function* () {
    const lock = yield* fixture();
    const entered = yield* Deferred.make<void>();
    const processScope = Effect.scoped(Effect.gen(function* () {
      const owned = yield* Effect.acquireRelease(acquire(lock), (owned) =>
        owned ? releaseResidentOwnership(lock).pipe(Effect.orDie) : Effect.void);
      expect(owned).toBe(true);
      yield* Deferred.succeed(entered, undefined);
      yield* Effect.never;
    }));
    const ownerFiber = yield* Effect.forkChild(processScope, { startImmediately: true });
    yield* Deferred.await(entered);
    expect((yield* ownerAt(lock)).pid).toBe(process.pid);
    yield* Fiber.interrupt(ownerFiber);
    expect(Exit.hasInterrupts(yield* Fiber.await(ownerFiber))).toBe(true);
    expect(yield* Effect.promise(() => readdir(join(lock, "..")))).toEqual([]);
  })));
});
