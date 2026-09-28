import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dispatch = readFileSync(resolve(root, "src/resident/dispatch.ts"), "utf8");
const server = readFileSync(resolve(root, "src/resident/server.ts"), "utf8");
for (const field of ["#pending", "#active", "#runningEntries", "#sequence", "#cycle", "#concurrency", "#pump"]) {
  if (dispatch.includes(field)) throw new Error(`native dispatch policy returned: ${field}`);
}
for (const event of ["queueDispatch", "dispatchSettled", "discardDispatch", "closeDispatch"]) {
  if (!dispatch.includes(event)) throw new Error(`missing canonical dispatch event: ${event}`);
}
if (server.includes("bendDiscardScope")) throw new Error("direct discard scope policy returned");
