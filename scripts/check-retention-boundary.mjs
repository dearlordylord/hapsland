import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const server = readFileSync(resolve(root, "src/resident/server.ts"), "utf8");
const reuse = readFileSync(resolve(root, "src/resident/evaluation-reuse.ts"), "utf8");
const collection = readFileSync(resolve(root, "src/resident/composed-delivery.ts"), "utf8");
const capacity = readFileSync(resolve(root, "src/resident/capacity.ts"), "utf8");
for (const name of ["bendCleanupGate", "bendCleanupCommit", "bendTicketRetention", "bendDeliveryReleaseUnacknowledged", "bendDiscardScope", "bendCollectionExpired", "bendNoticePrune"]) {
  if ([server, reuse, collection].some((source) => source.includes(name))) {
    throw new Error(`resident retention bypass returned: ${name}`);
  }
}
for (const event of ["cleanupCheck", "cleanupCommit", "deliveryReleaseCheck",
  "collectionExpiryCheck", "collectionLeaseCheck", "noticePrune", "cacheDiscardPartition", "cacheClear", "dispatchScopeCheck"]) {
  if (![server, reuse, collection, capacity].some((source) => source.includes(`kind: "${event}"`))) {
    throw new Error(`canonical retention event missing: ${event}`);
  }
}
