import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

const OwnerRecord = Schema.Struct({ pid: Schema.Int, token: Schema.String });
interface OwnerRecord extends Schema.Schema.Type<typeof OwnerRecord> {}
// A visible live PID protects an owner even while its metadata is incomplete.
// This observation is not a separate persisted record format.
const OwnerObservation = Schema.Struct({ pid: OwnerRecord.fields.pid });
const decodeOwner = Schema.decodeUnknownEffect(Schema.fromJsonString(OwnerObservation));
type Identity = { readonly dev: bigint; readonly ino: bigint };
const code = (cause: unknown): string | undefined =>
  typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string" ? cause.code : undefined;
const processExists = (pid: number): boolean => {
  try { process.kill(pid, 0); return true; } catch (cause) { return code(cause) === "EPERM"; }
};

const OwnershipOperation = Schema.Literals([
  "createCandidate", "writeOwner", "inspectIdentity", "inspectLock", "readOwner",
  "publishCandidate", "removeCandidate", "replaceBarrier", "sealRetirement",
  "retireLock", "removeRecovery", "releaseOwner",
]);
type OwnershipOperation = typeof OwnershipOperation.Type;
export class ResidentOwnershipError extends Schema.TaggedError<ResidentOwnershipError>()(
  "ResidentOwnershipError", { operation: OwnershipOperation, code: Schema.optionalKey(Schema.String) },
) {}

/** Local recovery coordination; neither persisted nor supplied by IPC. */
export class ResidentOwnershipControls extends Context.Service<ResidentOwnershipControls, {
  readonly beforeReplace: Effect.Effect<void, ResidentOwnershipError>;
}>()("@hapsland/ResidentOwnershipControls") {}
export const ownershipControlsLayer = Layer.succeed(ResidentOwnershipControls,
  ResidentOwnershipControls.of({ beforeReplace: Effect.void }));

// These bounded native operations do not support abort. Await actual completion
// before a resource finalizer can remove their artifacts.
const ownerIo = <A>(operation: OwnershipOperation, run: () => Promise<A>) => Effect.tryPromise({
  try: run,
  catch: (cause) => {
    const nativeCode = code(cause);
    return new ResidentOwnershipError({ operation, ...(nativeCode === undefined ? {} : { code: nativeCode }) });
  },
}).pipe(Effect.uninterruptible);

const readOwnerFile = Effect.fn("ResidentOwnership.readOwner")(function* (path: string) {
  const encoded = yield* ownerIo("readOwner", () => readFile(path, "utf8"));
  return yield* decodeOwner(encoded);
}, (effect) => effect.pipe(Effect.catch(() => Effect.succeed(undefined))));
const readOwner = (directory: string) => readOwnerFile(`${directory}/owner.json`);
const identity = Effect.fn("ResidentOwnership.identity")(function* (path: string) {
  const value = yield* ownerIo("inspectIdentity", () => lstat(path, { bigint: true })).pipe(
    Effect.catch((error) => error.code === "ENOENT" ? Effect.succeed(undefined) : Effect.fail(error)));
  return value === undefined ? undefined : { dev: value.dev, ino: value.ino };
});
const same = (a: Identity | undefined, b: Identity | undefined) =>
  a !== undefined && b !== undefined && a.dev === b.dev && a.ino === b.ino;

const publish = Effect.fn("ResidentOwnership.publish")(function* (path: string, owner: OwnerRecord) {
  const candidate = `${path}.candidate-${owner.pid}-${owner.token}`;
  return yield* Effect.acquireUseRelease(
    ownerIo("createCandidate", () => mkdir(candidate, { mode: 0o700 })),
    () => Effect.gen(function* () {
      yield* ownerIo("writeOwner", () => writeFile(`${candidate}/owner.json`, `${JSON.stringify(owner)}\n`, { mode: 0o600 }));
      if ((yield* identity(path)) !== undefined) return false;
      yield* ownerIo("publishCandidate", () => rename(candidate, path));
      return true;
    }).pipe(Effect.catch((error) =>
      error.code === "EEXIST" || error.code === "ENOTEMPTY" ? Effect.succeed(false) : Effect.fail(error))),
    () => ownerIo("removeCandidate", () => rm(candidate, { recursive: true, force: true })),
  );
});

export const acquireResidentOwnership = Effect.fn("ResidentOwnership.acquire")(function* (lock: string) {
  const controls = yield* ResidentOwnershipControls;
  const owner: OwnerRecord = { pid: process.pid, token: randomUUID() };
  if (yield* publish(lock, owner)) return true;
  const observed = yield* identity(lock);
  if (observed === undefined) return yield* publish(lock, owner);
  const status = yield* ownerIo("inspectLock", () => lstat(lock, { bigint: true }));
  if (!status.isDirectory()) return false;
  const prior = yield* readOwner(lock);
  if (prior !== undefined && processExists(prior.pid)) return false;
  if (prior === undefined && (yield* Clock.currentTimeMillis) - Number(status.mtimeMs) < 250) return false;

  const recovery = `${lock}.recovery-${observed.dev}-${observed.ino}`;
  const claimant: OwnerRecord = { pid: process.pid, token: randomUUID() };
  const ownsRecovery = yield* publish(recovery, claimant);
  if (!ownsRecovery) {
    const existing = yield* readOwner(recovery);
    if (existing !== undefined && processExists(existing.pid)) return false;
    // A crashed recovery claimant is never replaced. Contenders instead race
    // for the single inode-specific tombstone below. Keeping that tombstone
    // makes delayed contenders harmless after the new owner is published.
  }
  return yield* Effect.gen(function* () {
    // Interruption here precedes lock replacement and retires our recovery claim.
    yield* controls.beforeReplace.pipe(Effect.interruptible);
    if (!same(observed, yield* identity(lock))) return false;
    const current = yield* readOwner(lock);
    if (current !== undefined && processExists(current.pid)) return false;
    // Seal empty interrupted directories before renaming them: POSIX rename
    // can replace an empty directory, but cannot replace this tombstone.
    const guardPath = `${lock}/retirement.guard`;
    const guard = yield* ownerIo("sealRetirement", () => writeFile(guardPath,
      `${JSON.stringify(owner)}\n`, { flag: "wx", mode: 0o600 })).pipe(
      Effect.as("sealed" as const), Effect.catch((error) => error.code === "ENOENT"
        ? Effect.succeed("missing" as const) : error.code === "EEXIST"
        ? Effect.succeed("existing" as const) : Effect.fail(error)),
    );
    if (guard === "missing") return false;
    if (guard === "existing") {
      const guardOwner = yield* readOwnerFile(guardPath);
      if (guardOwner !== undefined && processExists(guardOwner.pid)) return false;
    }
    if (!same(observed, yield* identity(lock))) return false;
    const retired = `${lock}.retired-${observed.dev}-${observed.ino}`;
    const replaced = yield* ownerIo("retireLock", () => rename(lock, retired)).pipe(
      Effect.as(true), Effect.catch((error) => ["ENOENT", "EEXIST", "ENOTEMPTY"].includes(error.code ?? "")
        ? Effect.succeed(false) : Effect.fail(error)),
    );
    return replaced ? yield* publish(lock, owner) : false;
  }).pipe(Effect.onExit(() => ownsRecovery
    ? ownerIo("removeRecovery", () => rm(recovery, { recursive: true, force: true }))
    : Effect.void));
}, Effect.uninterruptible);

export const releaseResidentOwnership = Effect.fn("ResidentOwnership.release")(function* (lock: string) {
  const owner = yield* readOwner(lock);
  if (owner?.pid === process.pid) yield* ownerIo("releaseOwner", () => rm(lock, { recursive: true, force: true }));
}, Effect.uninterruptible);
