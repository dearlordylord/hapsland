import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const delivery = readFileSync(resolve(root, "src/resident/composed-delivery.ts"), "utf8");
const work = readFileSync(resolve(root, "src/resident/bend-work.ts"), "utf8");
for (const name of ["bendLeaseInitial", "bendLeaseOffer", "bendLeaseAuthorize",
  "bendLeaseTerminal", "bendLeaseSuppresses", "bendDeliveryTransition",
  "bendDeliveryExpired", "bendDeliveryBackgroundReofferable", "#rebuildLeases"]) {
  if (delivery.includes(name)) throw new Error(`resident submission policy bypass returned: ${name}`);
}
for (const name of ["decideFinishOutput", "finishReserve", "finishAuthorize",
  "finishTerminal", "submissionBegin", "submissionTerminal",
  "submissionSuppressCheck", "submissionExpiryCheck"]) {
  if (!delivery.includes(name)) throw new Error(`canonical delivery event missing: ${name}`);
}
if (/finish\.(choose|decide|ready|start|complete)/.test(work)) {
  throw new Error("superseded work finish owner returned");
}
