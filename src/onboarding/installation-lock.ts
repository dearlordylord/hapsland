import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Clock, Config, Effect, Option, Schedule, Schema } from "effect";
const isNodeError = (value: unknown, code: string) => typeof value === "object" && value !== null && "code" in value && value.code === code;
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export class InstallationLockError extends Schema.TaggedError<InstallationLockError>()(
  "InstallationLockError", { reason: Schema.NonEmptyString },
) { override get message() { return this.reason; } }
const lockError = (cause: unknown) => new InstallationLockError({ reason:
  cause instanceof Error && cause.message.startsWith("configuration lock ")
    ? cause.message : "configuration lock unavailable",
});

const LOCK_STALE_MS = 5_000;
const LOCK_GENERATION_WIDTH = 16;
const LOCK_GENERATION_RETENTION = 8;

const LockRecord = Schema.Struct({
  version: Schema.Literal(1),
  pid: Schema.Int.check(Schema.isGreaterThan(0)),
  createdAt: Schema.String.check(Schema.makeFilter((value) => Number.isFinite(Date.parse(value)))),
  owner: Schema.String.check(Schema.isPattern(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  )),
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

const removeOwnerDirectoryIfInactive = (ownerDirectory: string, now: number) => {
  const released = existsSync(join(ownerDirectory, "released"));
  const reclaimed = existsSync(join(ownerDirectory, "reclaimed"));
  let record: LockRecord | undefined;
  try {
    record = decodeLockRecord(readFileSync(join(ownerDirectory, "record.json"), "utf8"));
  } catch (cause) {
    if (!isNodeError(cause, "ENOENT")) throw cause;
  }
  if (!released && !reclaimed) {
    if (record !== undefined && processIsAlive(record.pid)) return;
    const modifiedAt = statSync(ownerDirectory).mtimeMs;
    const createdAt = record === undefined ? modifiedAt : Date.parse(record.createdAt);
    if (now - createdAt < LOCK_STALE_MS) return;
  }
  rmSync(ownerDirectory, { recursive: true, force: true });
};

const compactLockHistory = (path: string, current: LockGeneration, now: number) => {
  const generationsPath = join(path, "generations");
  const names = readdirSync(generationsPath)
    .filter((name) => /^\d{16}$/.test(name))
    .sort();
  const retainedNames = names.slice(-LOCK_GENERATION_RETENTION);
  const retainedOwners = new Set<string>();
  for (const name of retainedNames) {
    try {
      const target = readlinkSync(join(generationsPath, name));
      const match = /^\.\.\/owners\/([0-9a-f-]{36})$/i.exec(target);
      if (match?.[1] !== undefined) retainedOwners.add(match[1]);
    } catch (cause) {
      if (!isNodeError(cause, "ENOENT")) throw cause;
    }
  }
  for (const name of names.slice(0, -LOCK_GENERATION_RETENTION)) {
    if (name === current.name) continue;
    try {
      unlinkSync(join(generationsPath, name));
    } catch (cause) {
      if (!isNodeError(cause, "ENOENT")) throw cause;
    }
  }
  const ownersPath = join(path, "owners");
  for (const owner of readdirSync(ownersPath)) {
    if (owner === current.record.owner || retainedOwners.has(owner)) continue;
    removeOwnerDirectoryIfInactive(join(ownersPath, owner), now);
  }
};

const claimStaleGeneration = (generation: LockGeneration, claimer: string, now: number): boolean => {
  if (generation.released || generation.reclaimed) return true;
  if (now - Date.parse(generation.record.createdAt) < LOCK_STALE_MS ||
      processIsAlive(generation.record.pid)) return false;
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

const createOwner = Effect.fn("InstallationLock.createOwner")((path: string, now: number) => Effect.try({
  try: () => {
    mkdirSync(join(path, "owners"), { recursive: true, mode: 0o700 });
    mkdirSync(join(path, "generations"), { recursive: true, mode: 0o700 });
    const owner = randomUUID();
    const ownerDirectory = join(path, "owners", owner);
    mkdirSync(ownerDirectory, { mode: 0o700 });
    const record: LockRecord = { version: 1, pid: process.pid, createdAt: new Date(now).toISOString(), owner };
    try { writeFileSync(join(ownerDirectory, "record.json"), `${JSON.stringify(record)}\n`, { flag: "wx", mode: 0o600 }); }
    catch (cause) {
      try { rmSync(ownerDirectory, { recursive: true, force: true }); } catch { /* Retain primary acquisition failure. */ }
      throw cause;
    }
    // This is native publication ownership, not a second policy state owner.
    return { owner, ownerDirectory, published: false };
  }, catch: lockError,
}));

/** Each candidate is scoped even while waiting to publish its generation. */
export const withInstallationLock = Effect.fn("InstallationLock.withLock")(<A, E, R>(path: string,
  use: Effect.Effect<A, E, R>,
) => Effect.gen(function* () {
  const now = yield* Clock.currentTimeMillis;
  const started = yield* Clock.currentTimeNanos;
  const hold = Number(yield* Config.String("REVIEW_INSTALL_TEST_HOLD_LOCK_MS").pipe(
    Config.withDefault("0"),
    Effect.mapError(() => new InstallationLockError({ reason: "configuration lock configuration unavailable" })),
  ));
  return yield* Effect.acquireUseRelease(
    createOwner(path, now),
    (candidate) => Effect.gen(function* () {
      const attempt = Effect.fn("InstallationLock.publishGeneration")(function* () {
        const now = yield* Clock.currentTimeMillis;
        const elapsed = Number((yield* Clock.currentTimeNanos) - started) / 1_000_000;
        return yield* Effect.try({
          try: () => {
            try {
              const current = readCurrentLockGeneration(path);
              if (current !== undefined && !claimStaleGeneration(current, candidate.owner, now)) {
                if (elapsed >= 1_500) throw new Error("configuration lock remained busy for 1500ms");
                return false;
              }
              if (elapsed >= 1_500) throw new Error("configuration lock acquisition exceeded 1500ms");
              const next = (current?.number ?? 0n) + 1n;
              if (next >= 10n ** BigInt(LOCK_GENERATION_WIDTH)) throw new Error("configuration lock generation limit reached");
              const name = String(next).padStart(LOCK_GENERATION_WIDTH, "0");
              symlinkSync(`../owners/${candidate.owner}`, join(path, "generations", name));
              // No interruptible boundary between publication and ownership.
              candidate.published = true;
              return true;
            } catch (cause) {
              if (!isNodeError(cause, "EEXIST") && !isNodeError(cause, "ENOENT")) throw cause;
              if (elapsed >= 1_500) throw new Error("configuration lock remained busy for 1500ms");
              return false;
            }
          }, catch: lockError,
        });
      });
      yield* attempt().pipe(Effect.repeat({ schedule: Schedule.spaced("25 millis"), while: (acquired) => !acquired }));
      const now = yield* Clock.currentTimeMillis;
      yield* Effect.try({
        try: () => {
          const current = readCurrentLockGeneration(path);
          if (current === undefined || current.record.owner !== candidate.owner) {
            throw new Error("configuration lock generation was not published as current");
          }
          compactLockHistory(path, current, now);
        }, catch: lockError,
      });
      if (Number.isFinite(hold) && hold > 0) yield* Effect.sleep(hold);
      return yield* use;
    }),
    (candidate) => Effect.try({
      try: () => {
        if (!candidate.published) {
          rmSync(candidate.ownerDirectory, { recursive: true, force: true });
          return;
        }
        // Release this exact owner; a reclaimed successor keeps its own record.
        try { writeFileSync(join(candidate.ownerDirectory, "released"), "\n", { flag: "wx", mode: 0o600 }); }
        catch (cause) { if (!isNodeError(cause, "EEXIST")) throw cause; }
      }, catch: lockError,
    }),
  );
}));
