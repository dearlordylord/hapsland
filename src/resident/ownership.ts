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
  typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string"
    ? cause.code
    : undefined;
const processExists = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return code(cause) === "EPERM";
  }
};

const OwnershipOperation = Schema.Literals([
  "createCandidate",
  "writeOwner",
  "inspectIdentity",
  "inspectLock",
  "readOwner",
  "publishCandidate",
  "removeCandidate",
  "replaceBarrier",
  "sealRetirement",
  "retireLock",
  "removeRecovery",
  "releaseOwner",
]);
type OwnershipOperation = typeof OwnershipOperation.Type;
export class ResidentOwnershipError extends Schema.TaggedError<ResidentOwnershipError>()("ResidentOwnershipError", {
  operation: OwnershipOperation,
  code: Schema.optionalKey(Schema.String),
}) {}

/** Local recovery coordination; neither persisted nor supplied by IPC. */
export class ResidentOwnershipControls extends Context.Service<
  ResidentOwnershipControls,
  {
    readonly beforeReplace: Effect.Effect<void, ResidentOwnershipError>;
  }
>()("@hapsland/ResidentOwnershipControls") {}
export const ownershipControlsLayer = Layer.succeed(
  ResidentOwnershipControls,
  ResidentOwnershipControls.of({ beforeReplace: Effect.void }),
);

// These bounded native operations do not support abort. Await actual completion
// before a resource finalizer can remove their artifacts.
const ownerIo = <A>(operation: OwnershipOperation, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => {
      const nativeCode = code(cause);
      return new ResidentOwnershipError({ operation, ...(nativeCode === undefined ? {} : { code: nativeCode }) });
    },
  }).pipe(Effect.uninterruptible);

const readOwnerFile = Effect.fn("ResidentOwnership.readOwner")(
  function* (path: string) {
    const encoded = yield* ownerIo("readOwner", () => readFile(path, "utf8"));
    return yield* decodeOwner(encoded);
  },
  (effect) => effect.pipe(Effect.catch(() => Effect.succeed(undefined))),
);
const readOwner = (directory: string) => readOwnerFile(`${directory}/owner.json`);
const identity = Effect.fn("ResidentOwnership.identity")(function* (path: string) {
  const value = yield* ownerIo("inspectIdentity", () => lstat(path, { bigint: true })).pipe(
    Effect.catch((error) => (error.code === "ENOENT" ? Effect.succeed(undefined) : Effect.fail(error))),
  );
  return value === undefined ? undefined : { dev: value.dev, ino: value.ino };
});
const same = (a: Identity | undefined, b: Identity | undefined) =>
  a !== undefined && b !== undefined && a.dev === b.dev && a.ino === b.ino;

const publish = Effect.fn("ResidentOwnership.publish")(function* (path: string, owner: OwnerRecord) {
  const candidate = `${path}.candidate-${owner.pid}-${owner.token}`;
  return yield* Effect.acquireUseRelease(
    ownerIo("createCandidate", () => mkdir(candidate, { mode: 0o700 })),
    () =>
      Effect.gen(function* () {
        yield* ownerIo("writeOwner", () =>
          writeFile(`${candidate}/owner.json`, `${JSON.stringify(owner)}\n`, { mode: 0o600 }),
        );
        if ((yield* identity(path)) !== undefined) return false;
        yield* ownerIo("publishCandidate", () => rename(candidate, path));
        return true;
      }).pipe(
        Effect.catch((error) =>
          error.code === "EEXIST" || error.code === "ENOTEMPTY" ? Effect.succeed(false) : Effect.fail(error),
        ),
      ),
    () => ownerIo("removeCandidate", () => rm(candidate, { recursive: true, force: true })),
  );
});

const liveOwner = (owner: { readonly pid: number } | undefined): boolean =>
  owner !== undefined && processExists(owner.pid);
const recoverableLock = Effect.fn("ResidentOwnership.recoverableLock")(function* (lock: string) {
  const status = yield* ownerIo("inspectLock", () => lstat(lock, { bigint: true }));
  if (!status.isDirectory()) return false;
  const prior = yield* readOwner(lock);
  if (liveOwner(prior)) return false;
  return prior !== undefined || (yield* Clock.currentTimeMillis) - Number(status.mtimeMs) >= 250;
});
type RetirementGuard = "sealed" | "missing" | "existing";
const guardFailure = (error: ResidentOwnershipError): Effect.Effect<RetirementGuard, ResidentOwnershipError> => {
  switch (error.code) {
    case "ENOENT":
      return Effect.succeed("missing");
    case "EEXIST":
      return Effect.succeed("existing");
    default:
      return Effect.fail(error);
  }
};
const sealRetirement = Effect.fn("ResidentOwnership.sealRetirement")(function* (lock: string, owner: OwnerRecord) {
  const guardPath = `${lock}/retirement.guard`;
  const guard = yield* ownerIo("sealRetirement", () =>
    writeFile(guardPath, `${JSON.stringify(owner)}\n`, { flag: "wx", mode: 0o600 }),
  ).pipe(Effect.as("sealed" as const), Effect.catch(guardFailure));
  if (guard === "missing") return false;
  if (guard === "existing") return !liveOwner(yield* readOwnerFile(guardPath));
  return true;
});
const retirementConflict = (error: ResidentOwnershipError): boolean =>
  error.code !== undefined && ["ENOENT", "EEXIST", "ENOTEMPTY"].includes(error.code);
const retireLock = Effect.fn("ResidentOwnership.retireLock")((lock: string, observed: Identity) =>
  ownerIo("retireLock", () => rename(lock, `${lock}.retired-${observed.dev}-${observed.ino}`)).pipe(
    Effect.as(true),
    Effect.catch((error) => (retirementConflict(error) ? Effect.succeed(false) : Effect.fail(error))),
  ),
);
const replaceStaleOwner = Effect.fn("ResidentOwnership.replaceStaleOwner")(function* (
  lock: string,
  observed: Identity,
  owner: OwnerRecord,
  controls: Context.Service.Shape<typeof ResidentOwnershipControls>,
) {
  // Interruption here precedes lock replacement and retires our recovery claim.
  yield* controls.beforeReplace.pipe(Effect.interruptible);
  if (!same(observed, yield* identity(lock))) return false;
  if (liveOwner(yield* readOwner(lock))) return false;
  // POSIX rename can replace an empty directory, but cannot replace this tombstone.
  if (!(yield* sealRetirement(lock, owner))) return false;
  if (!same(observed, yield* identity(lock))) return false;
  return (yield* retireLock(lock, observed)) ? yield* publish(lock, owner) : false;
});
export const acquireResidentOwnership = Effect.fn("ResidentOwnership.acquire")(function* (lock: string) {
  const controls = yield* ResidentOwnershipControls;
  const owner: OwnerRecord = { pid: process.pid, token: randomUUID() };
  if (yield* publish(lock, owner)) return true;
  const observed = yield* identity(lock);
  if (observed === undefined) return yield* publish(lock, owner);
  if (!(yield* recoverableLock(lock))) return false;
  const recovery = `${lock}.recovery-${observed.dev}-${observed.ino}`;
  const claimant: OwnerRecord = { pid: process.pid, token: randomUUID() };
  const ownsRecovery = yield* publish(recovery, claimant);
  if (!ownsRecovery && liveOwner(yield* readOwner(recovery))) return false;
  // Never replace a crashed recovery claimant. Contenders race for the one
  // inode-specific tombstone, which keeps delayed contenders harmless.
  return yield* replaceStaleOwner(lock, observed, owner, controls).pipe(
    Effect.onExit(() =>
      ownsRecovery ? ownerIo("removeRecovery", () => rm(recovery, { recursive: true, force: true })) : Effect.void,
    ),
  );
}, Effect.uninterruptible);

export const releaseResidentOwnership = Effect.fn("ResidentOwnership.release")(function* (lock: string) {
  const owner = yield* readOwner(lock);
  if (owner?.pid === process.pid) yield* ownerIo("releaseOwner", () => rm(lock, { recursive: true, force: true }));
}, Effect.uninterruptible);
