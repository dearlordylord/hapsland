import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const server = readFileSync(resolve(root, "src/resident/server.ts"), "utf8");
const delivery = readFileSync(resolve(root, "src/resident/composed-delivery.ts"), "utf8");
const work = readFileSync(resolve(root, "src/resident/bend-work.ts"), "utf8");
for (const name of ["bendLifecycleFinishGate", "bendLifecycleCutoff"]) {
  if (server.includes(name) || delivery.includes(name) || work.includes(name)) {
    throw new Error(`retired Stop decision owner returned: ${name}`);
  }
}
for (const name of ["stopGroupPolled", "stopGroupEnded", "cancelWork", "finishLimit"]) {
  if (!delivery.includes(name)) throw new Error(`missing canonical Stop command handling: ${name}`);
}
if (!server.includes("job.canonicalObservationId") || !server.includes("job.canonicalOperationId")) {
  throw new Error("Stop cancellation must use canonical job identities");
}
for (const owner of ["#rounds", "#roundActivity", "round.work =", "round.discarded.queued +=", "round.discarded.running +="]) {
  if (server.includes(owner)) throw new Error(`independent resident round owner returned: ${owner}`);
}
if (!server.includes("residentLedger.rounds.replaceWork") || !server.includes("residentLedger.rounds.retire")) {
  throw new Error("native round replacement and retirement must use the shared resident owner");
}
