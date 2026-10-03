import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Clock, Config, Effect, Option, Schedule, Schema } from "effect";
const isNodeError = (value: unknown, code: string) =>
  typeof value === "object" && value !== null && "code" in value && value.code === code;

export class InstallationLockError extends Schema.TaggedError<InstallationLockError>()("InstallationLockError", {
  reason: Schema.NonEmptyString,
}) {
  override get message() {
    return this.reason;
  }
}
const lockError = (cause: unknown) =>
  new InstallationLockError({
    reason:
      cause instanceof Error && cause.message.startsWith("configuration lock ")
        ? cause.message
        : "configuration lock unavailable",
  });

const LOCK_STALE_MS = 5_000;
const LOCK_GENERATION_WIDTH = 16;
const LOCK_GENERATION_RETENTION = 8;

const LockRecord = Schema.Struct({
  version: Schema.Literal(1),
  pid: Schema.Int.check(Schema.isGreaterThan(0)),
  createdAt: Schema.String.check(Schema.makeFilter((value) => Number.isFinite(Date.parse(value)))),
  owner: Schema.String.check(
    Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
  ),
});
interface LockRecord extends Schema.Schema.Type<typeof LockRecord> {}

const decodeLockRecord = (content: string): LockRecord | undefined => {
  try {
    return Option.getOrUndefined(Schema.decodeUnknownOption(LockRecord)(JSON.parse(content)));
  } catch {
    return undefined;
  }
};

const processIsAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return !isNodeError(cause, "ESRCH");
  }
};

interface LockGeneration {
  readonly number: bigint;
  readonly name: string;
  readonly ownerDirectory: string;
  readonly record: LockRecord;
  readonly released: boolean;
  readonly reclaimed: boolean;
}

const readCurrentLockGeneration = (path: string): LockGeneration | undefined => {
  const generations = join(path, "generations");
  const names = readdirSync(generations)
    .filter((name) => /^\d{16}$/.test(name))
    .sort();
  const name = names.at(-1);
  if (name === undefined) return undefined;
  const generationPath = join(generations, name);
  const target = readlinkSync(generationPath);
  const match = /^\.\.\/owners\/([0-9a-f-]{36})$/i.exec(target);
  if (match === null) throw new Error("configuration lock generation has an invalid owner target");
  const ownerDirectory = join(path, "owners", match[1] ?? "");
  const record = decodeLockRecord(readFileSync(join(ownerDirectory, "record.json"), "utf8"));
  if (record === undefined || record.owner !== match[1]) {
    throw new Error("configuration lock generation has an invalid owner record");
  }
  return {
    number: BigInt(name),
    name,
    ownerDirectory,
    record,
    released: existsSync(join(ownerDirectory, "released")),
    reclaimed: existsSync(join(ownerDirectory, "reclaimed")),
  };
};

const optionalOwnerRecord = (ownerDirectory: string): LockRecord | undefined => {
  try {
    return decodeLockRecord(readFileSync(join(ownerDirectory, "record.json"), "utf8"));
  } catch (cause) {
    if (!isNodeError(cause, "ENOENT")) throw cause;
    return undefined;
  }
};
const ownerCreatedAt = (ownerDirectory: string, record: LockRecord | undefined): number => {
  const modifiedAt = statSync(ownerDirectory).mtimeMs;
  return record === undefined ? modifiedAt : Date.parse(record.createdAt);
};
const inactiveOwner = (ownerDirectory: string, record: LockRecord | undefined, now: number): boolean => {
  if (record !== undefined && processIsAlive(record.pid)) return false;
  return !(now - ownerCreatedAt(ownerDirectory, record) < LOCK_STALE_MS);
};
const removeOwnerDirectoryIfInactive = (ownerDirectory: string, now: number) => {
  const released = existsSync(join(ownerDirectory, "released"));
  const reclaimed = existsSync(join(ownerDirectory, "reclaimed"));
  const record = optionalOwnerRecord(ownerDirectory);
  if (!released && !reclaimed && !inactiveOwner(ownerDirectory, record, now)) return;
  rmSync(ownerDirectory, { recursive: true, force: true });
};
const retainedGenerationOwner = (generationPath: string): string | undefined => {
  try {
    return /^\.\.\/owners\/([0-9a-f-]{36})$/i.exec(readlinkSync(generationPath))?.[1];
  } catch (cause) {
    if (!isNodeError(cause, "ENOENT")) throw cause;
    return undefined;
  }
};
const removeOldGeneration = (path: string): void => {
  try {
    unlinkSync(path);
  } catch (cause) {
    if (!isNodeError(cause, "ENOENT")) throw cause;
  }
};
const retainedOwner = (owner: string, current: LockGeneration, retained: ReadonlySet<string>): boolean =>
  owner === current.record.owner || retained.has(owner);
const compactLockHistory = (path: string, current: LockGeneration, now: number) => {
  const generationsPath = join(path, "generations");
  const names = readdirSync(generationsPath)
    .filter((name) => /^\d{16}$/.test(name))
    .sort();
  const retainedOwners = new Set<string>();
  for (const name of names.slice(-LOCK_GENERATION_RETENTION)) {
    const owner = retainedGenerationOwner(join(generationsPath, name));
    if (owner !== undefined) retainedOwners.add(owner);
  }
  for (const name of names.slice(0, -LOCK_GENERATION_RETENTION)) {
    if (name !== current.name) removeOldGeneration(join(generationsPath, name));
  }
  for (const owner of readdirSync(join(path, "owners"))) {
    if (retainedOwner(owner, current, retainedOwners)) continue;
    removeOwnerDirectoryIfInactive(join(path, "owners", owner), now);
  }
};
const claimStaleGeneration = (generation: LockGeneration, claimer: string, now: number): boolean => {
  if (generation.released || generation.reclaimed) return true;
  if (now - Date.parse(generation.record.createdAt) < LOCK_STALE_MS || processIsAlive(generation.record.pid))
    return false;
  try {
    writeFileSync(
      join(generation.ownerDirectory, "reclaimed"),
      `${JSON.stringify({ version: 1, claimer, createdAt: new Date(now).toISOString() })}\n`,
      { flag: "wx", mode: 0o600 },
    );
  } catch (cause) {
    if (!isNodeError(cause, "EEXIST")) throw cause;
  }
  return true;
};

const createOwner = Effect.fn("InstallationLock.createOwner")((path: string, now: number) =>
  Effect.try({
    try: () => {
      mkdirSync(join(path, "owners"), { recursive: true, mode: 0o700 });
      mkdirSync(join(path, "generations"), { recursive: true, mode: 0o700 });
      const owner = randomUUID();
      const ownerDirectory = join(path, "owners", owner);
      mkdirSync(ownerDirectory, { mode: 0o700 });
      const record: LockRecord = { version: 1, pid: process.pid, createdAt: new Date(now).toISOString(), owner };
      try {
        writeFileSync(join(ownerDirectory, "record.json"), `${JSON.stringify(record)}\n`, { flag: "wx", mode: 0o600 });
      } catch (cause) {
        try {
          rmSync(ownerDirectory, { recursive: true, force: true });
        } catch {
          /* Retain primary acquisition failure. */
        }
        throw cause;
      }
      // This is native publication ownership, not a second policy state owner.
      return { owner, ownerDirectory, published: false };
    },
    catch: lockError,
  }),
);

type OwnerCandidate = { readonly owner: string; readonly ownerDirectory: string; published: boolean };
const assertAcquisitionTime = (elapsed: number, message: string): void => {
  if (elapsed >= 1_500) throw new Error(message);
};
const nextGenerationName = (current: LockGeneration | undefined): string => {
  const next = (current?.number ?? 0n) + 1n;
  if (next >= 10n ** BigInt(LOCK_GENERATION_WIDTH)) throw new Error("configuration lock generation limit reached");
  return String(next).padStart(LOCK_GENERATION_WIDTH, "0");
};
const publishGeneration = (path: string, candidate: OwnerCandidate, now: number, elapsed: number): boolean => {
  const current = readCurrentLockGeneration(path);
  if (current !== undefined && !claimStaleGeneration(current, candidate.owner, now)) {
    assertAcquisitionTime(elapsed, "configuration lock remained busy for 1500ms");
    return false;
  }
  assertAcquisitionTime(elapsed, "configuration lock acquisition exceeded 1500ms");
  symlinkSync(`../owners/${candidate.owner}`, join(path, "generations", nextGenerationName(current)));
  // No interruptible boundary between publication and ownership.
  candidate.published = true;
  return true;
};
const attemptGenerationPublication = (
  path: string,
  candidate: OwnerCandidate,
  now: number,
  elapsed: number,
): boolean => {
  try {
    return publishGeneration(path, candidate, now, elapsed);
  } catch (cause) {
    if (!isNodeError(cause, "EEXIST") && !isNodeError(cause, "ENOENT")) throw cause;
    assertAcquisitionTime(elapsed, "configuration lock remained busy for 1500ms");
    return false;
  }
};
/** Each candidate is scoped even while waiting to publish its generation. */
export const withInstallationLock = Effect.fn("InstallationLock.withLock")(
  <A, E, R>(path: string, use: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const started = yield* Clock.monotonicTimeNanos;
      const hold = Number(
        yield* Config.String("REVIEW_INSTALL_TEST_HOLD_LOCK_MS").pipe(
          Config.withDefault("0"),
          Effect.mapError(() => new InstallationLockError({ reason: "configuration lock configuration unavailable" })),
        ),
      );
      return yield* Effect.acquireUseRelease(
        createOwner(path, now),
        (candidate) =>
          Effect.gen(function* () {
            const attempt = Effect.fn("InstallationLock.publishGeneration")(function* () {
              const now = yield* Clock.currentTimeMillis;
              const elapsed = Number((yield* Clock.monotonicTimeNanos) - started) / 1_000_000;
              return yield* Effect.try({
                try: () => attemptGenerationPublication(path, candidate, now, elapsed),
                catch: lockError,
              });
            });
            yield* attempt().pipe(
              Effect.repeat({ schedule: Schedule.spaced("25 millis"), while: (acquired) => !acquired }),
            );
            const now = yield* Clock.currentTimeMillis;
            yield* Effect.try({
              try: () => {
                const current = readCurrentLockGeneration(path);
                if (current === undefined || current.record.owner !== candidate.owner) {
                  throw new Error("configuration lock generation was not published as current");
                }
                compactLockHistory(path, current, now);
              },
              catch: lockError,
            });
            if (Number.isFinite(hold) && hold > 0) yield* Effect.sleep(hold);
            return yield* use;
          }),
        (candidate) =>
          Effect.try({
            try: () => {
              if (!candidate.published) {
                rmSync(candidate.ownerDirectory, { recursive: true, force: true });
                return;
              }
              // Release this exact owner; a reclaimed successor keeps its own record.
              try {
                writeFileSync(join(candidate.ownerDirectory, "released"), "\n", { flag: "wx", mode: 0o600 });
              } catch (cause) {
                if (!isNodeError(cause, "EEXIST")) throw cause;
              }
            },
            catch: lockError,
          }),
      );
    }),
);
