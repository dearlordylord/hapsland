import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";

type OwnerRecord = { readonly pid: number; readonly token: string };
type Identity = { readonly dev: bigint; readonly ino: bigint };
const code = (cause: unknown): string | undefined =>
  typeof cause === "object" && cause !== null && "code" in cause ? String(cause.code) : undefined;
const processExists = (pid: number): boolean => {
  try { process.kill(pid, 0); return true; } catch (cause) { return code(cause) === "EPERM"; }
};
const readOwner = async (directory: string): Promise<OwnerRecord | undefined> => {
  try {
    const value: unknown = JSON.parse(await readFile(`${directory}/owner.json`, "utf8"));
    if (typeof value === "object" && value !== null && "pid" in value && Number.isSafeInteger(value.pid)) {
      const token = "token" in value && typeof value.token === "string" ? value.token : "legacy-directory-owner";
      return { pid: value.pid as number, token };
    }
  } catch { /* incomplete owner */ }
  return undefined;
};
const identity = async (path: string): Promise<Identity | undefined> => {
  try { const value = await lstat(path, { bigint: true }); return { dev: value.dev, ino: value.ino }; }
  catch (cause) { if (code(cause) === "ENOENT") return undefined; throw cause; }
};
const same = (a: Identity | undefined, b: Identity | undefined) =>
  a !== undefined && b !== undefined && a.dev === b.dev && a.ino === b.ino;

const publish = async (path: string, owner: OwnerRecord): Promise<boolean> => {
  const candidate = `${path}.candidate-${owner.pid}-${owner.token}`;
  await mkdir(candidate, { mode: 0o700 });
  await writeFile(`${candidate}/owner.json`, `${JSON.stringify(owner)}\n`, { mode: 0o600 });
  try {
    if (await identity(path) !== undefined) return false;
    await rename(candidate, path);
    return true;
  } catch (cause) {
    if (!["EEXIST", "ENOTEMPTY"].includes(code(cause) ?? "")) throw cause;
    return false;
  } finally { await rm(candidate, { recursive: true, force: true }); }
};

export type OwnershipHooks = { readonly beforeReplace?: () => Promise<void>; readonly now?: () => number };

export const acquireResidentOwnership = async (lock: string, hooks: OwnershipHooks = {}): Promise<boolean> => {
  const owner = { pid: process.pid, token: randomUUID() };
  if (await publish(lock, owner)) return true;
  const observed = await identity(lock);
  if (observed === undefined) return publish(lock, owner);
  const status = await lstat(lock, { bigint: true });
  if (!status.isDirectory()) return false;
  const prior = await readOwner(lock);
  if (prior !== undefined && processExists(prior.pid)) return false;
  if (prior === undefined && (hooks.now?.() ?? Date.now()) - Number(status.mtimeMs) < 250) return false;

  const recovery = `${lock}.recovery-${observed.dev}-${observed.ino}`;
  const claimant = { pid: process.pid, token: randomUUID() };
  if (!await publish(recovery, claimant)) {
    const existing = await readOwner(recovery);
    if (existing !== undefined && processExists(existing.pid)) return false;
    const retiredClaim = `${recovery}.retired-${process.pid}-${randomUUID()}`;
    try { await rename(recovery, retiredClaim); await rm(retiredClaim, { recursive: true, force: true }); }
    catch { return false; }
    if (!await publish(recovery, claimant)) return false;
  }
  try {
    await hooks.beforeReplace?.();
    if (!same(observed, await identity(lock))) return false;
    const current = await readOwner(lock);
    if (current !== undefined && processExists(current.pid)) return false;
    const retired = `${lock}.retired-${process.pid}-${owner.token}`;
    await rename(lock, retired);
    await rm(retired, { recursive: true, force: true });
    return publish(lock, owner);
  } finally { await rm(recovery, { recursive: true, force: true }); }
};

export const releaseResidentOwnership = async (lock: string): Promise<void> => {
  const owner = await readOwner(lock);
  if (owner?.pid === process.pid) await rm(lock, { recursive: true, force: true });
};
