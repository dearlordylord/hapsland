import { createHash } from "node:crypto";
import { lstatSync, readdirSync, rmSync, type Dirent, type Stats } from "node:fs";
import { join } from "node:path";

export const ACTIVITY_RETENTION_MS = 30 * 24 * 60 * 60_000;
export const MAX_ACTIVITY_STORAGE_BYTES = 20 * 1024 * 1024;
export const activitySessionKey = (value: string): string =>
  createHash("sha256").update(`activity-v1:session\0${value}`).digest("hex");
export const activityRepositoryKey = (value: string): string =>
  createHash("sha256").update(`activity-v1:repository\0${value}`).digest("hex");

type ActivitySessionStorage = { readonly path: string; readonly at: number; readonly bytes: number };
const allocatedBytes = (stat: Stats): number => Math.max(stat.size, stat.blocks * 512);
const sessionStorage = (path: string): ReadonlyArray<ActivitySessionStorage> => {
  try {
    const directory = lstatSync(path);
    if (!directory.isDirectory() || directory.isSymbolicLink()) return [];
    let bytes = allocatedBytes(directory);
    let at = 0;
    for (const file of readdirSync(path, { withFileTypes: true })) {
      const stat = lstatSync(join(path, file.name));
      bytes += allocatedBytes(stat);
      at = Math.max(at, stat.mtimeMs);
    }
    return [{ path, at: at || directory.mtimeMs, bytes }];
  } catch {
    return [];
  }
};
const activitySessionEntry = (statePath: string, entry: Dirent): ReadonlyArray<ActivitySessionStorage> => {
  if (!entry.isDirectory() || !/^[a-f0-9]{64}$/.test(entry.name)) return [];
  return sessionStorage(join(statePath, entry.name));
};
const pruneSessions = (
  sessions: ReadonlyArray<ActivitySessionStorage>,
  now: number,
  retentionMs: number,
  maxBytes: number,
): void => {
  let bytes = sessions.reduce((sum, session) => sum + session.bytes, 0);
  for (const session of sessions) {
    if (now - session.at < retentionMs && bytes <= maxBytes) continue;
    rmSync(session.path, { recursive: true, force: true });
    bytes -= session.bytes;
  }
};
/** Shared by operational markers and optional analytics. Never follows symlinks. */
export const pruneActivityStore = (
  statePath: string,
  options: {
    readonly now?: number;
    readonly maxBytes?: number;
    readonly retentionMs?: number;
  } = {},
): void => {
  const now = options.now ?? Date.now();
  const retentionMs = options.retentionMs ?? ACTIVITY_RETENTION_MS;
  const maxBytes = options.maxBytes ?? MAX_ACTIVITY_STORAGE_BYTES;
  try {
    const sessions = readdirSync(statePath, { withFileTypes: true })
      .flatMap((entry) => activitySessionEntry(statePath, entry))
      .sort((a, b) => a.at - b.at || a.path.localeCompare(b.path));
    pruneSessions(sessions, now, retentionMs, maxBytes);
  } catch {
    // Diagnostics are best effort; storage trouble cannot fail a host edit.
  }
};
