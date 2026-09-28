import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const server = readFileSync(resolve(root, "src/resident/server.ts"), "utf8");
for (const name of ["bendRevisionRegister", "bendRevisionSuperseded", "#nextWorkGeneration", "retained.members"]) {
  if (server.includes(name)) throw new Error(`resident revision bypass returned: ${name}`);
}
for (const event of ["revisionRegister", "revisionRelease", "revisionCurrentCheck",
  "revisionSupersededCheck", "revisionGenerationCheck", "revisionCountCheck"]) {
  if (!server.includes(`kind: "${event}"`)) throw new Error(`canonical revision event missing: ${event}`);
}
