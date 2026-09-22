#!/usr/bin/env node
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { ResidentServer } from "./server.ts";

const directory = process.argv[2];
if (directory === undefined) throw new Error("resident runtime directory is required");

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
  void server.close().finally(() => process.exit(0));
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
