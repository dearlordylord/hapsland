import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const server = readFileSync(resolve(root, "src/resident/server.ts"), "utf8");
const reuse = readFileSync(resolve(root, "src/resident/evaluation-reuse.ts"), "utf8");
for (const name of ["bendReuseRoute", "bendReuseCacheRoute", "bendCacheAdmit", "bendCacheEvict"]) {
  if (server.includes(name) || reuse.includes(name)) throw new Error(`resident reuse bypass returned: ${name}`);
}
for (const event of ["reuseRoute", "reuseClaim", "reuseAttach", "reuseRelease", "reuseTouch",
  "cachePrepare", "cacheCommit", "cacheDiscardPartition", "cacheClear"]) {
  if (!reuse.includes(`kind: "${event}"`)) throw new Error(`canonical reuse event missing: ${event}`);
}
if (!server.includes("this.#reuse.route(evaluationKey, liveAdvice)")) {
  throw new Error("resident evaluation route bypassed canonical reuse state");
}
