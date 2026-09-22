#!/usr/bin/env node
import { join } from "node:path";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";

const directory = process.argv[2];
if (directory === undefined) throw new Error("resident runtime directory is required");
await mkdir(directory, { recursive: true, mode: 0o700 });

const lock = join(directory, "owner.lock");
const startup = `${lock}.startup`;
const lockOwner = join(lock, "owner.json");
const processExists = (pid: number): boolean => {
  try { process.kill(pid, 0); return true; }
  catch (cause) {
    return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "EPERM";
  }
};
const acquire = async (): Promise<boolean> => {
  try {
    await mkdir(lock, { mode: 0o700 });
    writeFileSync(lockOwner, `${JSON.stringify({ pid: process.pid })}\n`, { mode: 0o600, flag: "wx" });
    return true;
  } catch (cause) {
    if (!(typeof cause === "object" && cause !== null && "code" in cause && cause.code === "EEXIST")) throw cause;
    let pid: number | undefined;
    try {
      const decoded: unknown = JSON.parse(await readFile(lockOwner, "utf8"));
      if (typeof decoded === "object" && decoded !== null && "pid" in decoded && Number.isSafeInteger(decoded.pid)) {
        pid = decoded.pid as number;
      }
    } catch { /* an acquiring owner may not have published its identity yet */ }
    if (pid === undefined || processExists(pid)) return false;
    const stale = `${lock}.stale-${process.pid}`;
    try {
      await (await import("node:fs/promises")).rename(lock, stale);
      await rm(stale, { recursive: true, force: true });
    } catch { return false; }
    return acquire();
  }
};

const acquired = await acquire();
await rm(startup, { force: true });
if (!acquired) process.exit(0);
process.once("exit", () => rmSync(lock, { recursive: true, force: true }));

// Load the review runtime only after winning ownership. Contenders stay cheap,
// so concurrent short-lived hook clients cannot starve endpoint publication.
const { ResidentServer } = await import("./server.ts");

const clockPath = process.env.REVIEW_RESIDENT_CLOCK_PATH;
const now = clockPath === undefined
  ? () => performance.now()
  : () => Number(readFileSync(clockPath, "utf8"));
const server = new ResidentServer({
  directory,
  socket: join(directory, "resident.sock"),
  lock: join(directory, "owner.lock"),
  owner: join(directory, "owner.json"),
}, now);

await server.listen();

const stop = () => {
  void server.close().finally(async () => {
    await rm(lock, { recursive: true, force: true });
    process.exit(0);
  });
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
