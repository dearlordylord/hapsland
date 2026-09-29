#!/usr/bin/env node
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { acquireResidentOwnership, releaseResidentOwnership } from "./ownership.ts";

const directory = process.argv[2];
if (directory === undefined) throw new Error("resident runtime directory is required");
await mkdir(directory, { recursive: true, mode: 0o700 });

const lock = join(directory, "owner.lock");
const acquired = await acquireResidentOwnership(lock);
if (!acquired) process.exit(0);

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
await rm(`${lock}.startup-error`, { force: true });

const stop = () => {
  void server.close().finally(async () => {
    await rm(lock, { recursive: true, force: true });
    process.exit(0);
  });
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
process.once("beforeExit", () => { void releaseResidentOwnership(lock); });
