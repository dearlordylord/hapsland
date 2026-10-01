import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const isNodeError = (value: unknown, code: string) => typeof value === "object" && value !== null && "code" in value && value.code === code;
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const sleep = (milliseconds: number) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

const LOCK_STALE_MS = 5_000;
const LOCK_GENERATION_WIDTH = 16;
const LOCK_GENERATION_RETENTION = 8;

interface LockRecord {
  readonly version: 1;
  readonly pid: number;
  readonly createdAt: string;
  readonly owner: string;
}

const decodeLockRecord = (content: string): LockRecord | undefined => {
  try {
    const value: unknown = JSON.parse(content);
    if (!isObject(value) || value.version !== 1 || typeof value.pid !== "number" ||
        !Number.isSafeInteger(value.pid) || value.pid <= 0 || typeof value.createdAt !== "string" ||
        !Number.isFinite(Date.parse(value.createdAt)) || typeof value.owner !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.owner)) {
      return undefined;
    }
    return { version: 1, pid: value.pid, createdAt: value.createdAt, owner: value.owner };
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

const removeOwnerDirectoryIfInactive = (ownerDirectory: string) => {
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
    if (Date.now() - createdAt < LOCK_STALE_MS) return;
  }
  rmSync(ownerDirectory, { recursive: true, force: true });
};

const compactLockHistory = (path: string, current: LockGeneration) => {
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
    removeOwnerDirectoryIfInactive(join(ownersPath, owner));
  }
};

const claimStaleGeneration = (generation: LockGeneration, claimer: string): boolean => {
  if (generation.released || generation.reclaimed) return true;
  if (Date.now() - Date.parse(generation.record.createdAt) < LOCK_STALE_MS ||
      processIsAlive(generation.record.pid)) return false;
  try {
    writeFileSync(
      join(generation.ownerDirectory, "reclaimed"),
      `${JSON.stringify({ version: 1, claimer, createdAt: new Date().toISOString() })}\n`,
      { flag: "wx", mode: 0o600 },
    );
  } catch (cause) {
    if (!isNodeError(cause, "EEXIST")) throw cause;
  }
  return true;
};

export const withInstallationLock = async <A>(path: string, use: () => Promise<A>): Promise<A> => {
  mkdirSync(join(path, "owners"), { recursive: true, mode: 0o700 });
  mkdirSync(join(path, "generations"), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + 1_500;
  const owner = randomUUID();
  const ownerDirectory = join(path, "owners", owner);
  mkdirSync(ownerDirectory, { mode: 0o700 });
  const record: LockRecord = {
    version: 1,
    pid: process.pid,
    createdAt: new Date().toISOString(),
    owner,
  };
  writeFileSync(join(ownerDirectory, "record.json"), `${JSON.stringify(record)}\n`, { flag: "wx", mode: 0o600 });
  let acquired = false;
  try {
    while (!acquired) {
      try {
        const current = readCurrentLockGeneration(path);
        if (current !== undefined && !claimStaleGeneration(current, owner)) {
          if (Date.now() >= deadline) throw new Error("configuration lock remained busy for 1500ms");
          await sleep(25);
          continue;
        }
        if (Date.now() >= deadline) throw new Error("configuration lock acquisition exceeded 1500ms");
        const next = (current?.number ?? 0n) + 1n;
        if (next >= 10n ** BigInt(LOCK_GENERATION_WIDTH)) {
          throw new Error("configuration lock generation limit reached");
        }
        const generationName = String(next).padStart(LOCK_GENERATION_WIDTH, "0");
        symlinkSync(`../owners/${owner}`, join(path, "generations", generationName));
        acquired = true;
      } catch (cause) {
        if (cause instanceof Error && cause.message === "configuration lock remained busy for 1500ms") throw cause;
        if (!isNodeError(cause, "EEXIST") && !isNodeError(cause, "ENOENT")) throw cause;
        if (Date.now() >= deadline) throw new Error("configuration lock remained busy for 1500ms");
        await sleep(25);
      }
    }
  } catch (cause) {
    rmSync(ownerDirectory, { recursive: true, force: true });
    throw cause;
  }
  try {
    const current = readCurrentLockGeneration(path);
    if (current === undefined || current.record.owner !== owner) {
      throw new Error("configuration lock generation was not published as current");
    }
    compactLockHistory(path, current);
    const holdMilliseconds = Number(process.env.REVIEW_INSTALL_TEST_HOLD_LOCK_MS ?? "0");
    if (Number.isFinite(holdMilliseconds) && holdMilliseconds > 0) await sleep(holdMilliseconds);
    return await use();
  } finally {
    try {
      writeFileSync(join(ownerDirectory, "released"), "\n", { flag: "wx", mode: 0o600 });
    } catch (cause) {
      if (!isNodeError(cause, "EEXIST")) throw cause;
    }
  }
};
