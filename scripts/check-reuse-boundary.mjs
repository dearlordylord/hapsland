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
if (!server.includes("residentReuse.route(evaluationKey, liveAdvice)")) {
  throw new Error("resident evaluation route bypassed canonical reuse state");
}

for (const owner of ["#joinedReviews", "joined.revision =", "#attachClaimedJoined"]) {
  if (server.includes(owner)) throw new Error(`independent joined review owner returned: ${owner}`);
}
if (!server.includes("residentJoined.attachOwner") || !server.includes("residentJoined.releaseOwner")) {
  throw new Error("joined review handoff must use the combined resident owner");
}

if (server.includes("residentAfterReuseBoundary") || /afterReuseBoundary\?:/u.test(server) ||
    server.includes("residentAfterPrepare") || /afterPrepare\?:/u.test(server) ||
    !server.includes("Layer.buildWithScope(options.preparationControls ?? preparationControlsLayer, residentControlScope)") ||
    !server.includes("Scope.close(residentControlScope, Exit.void)")) {
  throw new Error("preparation reuse coordination must be a scoped Effect service, without the legacy Promise callback");
}
