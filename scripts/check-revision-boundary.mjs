import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const revision = readFileSync(resolve(root, "src/resident/revision.ts"), "utf8");
const server = readFileSync(resolve(root, "src/resident/server.ts"), "utf8");
for (const name of ["bendRevisionRegister", "bendRevisionSuperseded", "#nextWorkGeneration", "retained.members"]) {
  if (server.includes(name) || revision.includes(name)) throw new Error(`resident revision bypass returned: ${name}`);
}
for (const event of ["revisionRegister", "revisionRelease", "revisionCurrentCheck",
  "revisionSupersededCheck", "revisionGenerationCheck", "revisionCountCheck"]) {
  if (!revision.includes(`kind: "${event}"`)) throw new Error(`canonical revision event missing: ${event}`);
}

if (/#currentWork\b|#revisionIds\b|#nextRevisionId\b/.test(server)) {
  throw new Error("server restored independent revision state ownership");
}
if (/\bRef\.(?:make|modify|update|set)\s*(?:<|\()/.test(revision)) {
  throw new Error("revision operations must share the resident state Ref");
}

const capacity = readFileSync(resolve(root, "src/resident/capacity.ts"), "utf8");
if (!capacity.includes('register: Effect.fn("RevisionRecords.register")') ||
    !capacity.includes('commitAllEffect(revisionChange((operations) => operations.register(...args)))') ||
    !server.includes('yield* residentLedger.revision.register(')) {
  throw new Error("revision registration must compose as an atomic Effect");
}
