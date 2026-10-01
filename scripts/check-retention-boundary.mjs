import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const server = readFileSync(resolve(root, "src/resident/server.ts"), "utf8");
const advice = readFileSync(resolve(root, "src/resident/advice-records.ts"), "utf8");
const notices = readFileSync(resolve(root, "src/resident/notice-records.ts"), "utf8");
const reuse = readFileSync(resolve(root, "src/resident/evaluation-reuse.ts"), "utf8");
const collection = readFileSync(resolve(root, "src/resident/composed-delivery.ts"), "utf8");
const tickets = readFileSync(resolve(root, "src/resident/ticket-records.ts"), "utf8");
const capacity = readFileSync(resolve(root, "src/resident/capacity.ts"), "utf8");
for (const name of ["bendCleanupGate", "bendCleanupCommit", "bendTicketRetention", "bendDeliveryReleaseUnacknowledged", "bendDiscardScope", "bendCollectionExpired", "bendNoticePrune"]) {
  if ([server, reuse, collection, tickets, notices].some((source) => source.includes(name))) {
    throw new Error(`resident retention bypass returned: ${name}`);
  }
}
for (const event of ["ticketRetentionCheck", "cleanupCheck", "cleanupCommit", "deliveryReleaseCheck",
  "collectionExpiryCheck", "collectionLeaseCheck", "noticePrune", "cacheDiscardPartition", "cacheClear", "dispatchScopeCheck"]) {
  if (![server, reuse, collection, capacity, tickets, notices, advice].some((source) => source.includes(`kind: "${event}"`))) {
    throw new Error(`canonical retention event missing: ${event}`);
  }
}
if (!server.includes("this.#ledger.tickets.retain(limit)") ||
    !server.includes("this.#evictRetainedTickets(this.#maximumTickets)") ||
    !server.includes("this.#evictRetainedTickets(0)")) {
  throw new Error("resident ticket eviction bypassed canonical retention");
}

if (server.includes("revalidationActive") ||
    !server.includes("server.#ledger.adviceCaptures.start(") ||
    !server.includes("server.#ledger.adviceCaptures.finish(capture)") ||
    !capacity.includes("resident state cannot clear outstanding advice captures")) {
  throw new Error("advice capture lifetime escaped the shared state owner");
}
