import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const server = readFileSync(resolve(root, "src/resident/server.ts"), "utf8")
const advice = readFileSync(resolve(root, "src/resident/advice-records.ts"), "utf8")
const notices = readFileSync(resolve(root, "src/resident/notice-records.ts"), "utf8")
const reuse = readFileSync(resolve(root, "src/resident/evaluation-reuse.ts"), "utf8")
const collection = readFileSync(resolve(root, "src/resident/composed-delivery.ts"), "utf8")
const capacity = readFileSync(resolve(root, "src/resident/capacity.ts"), "utf8")
for (const name of [
  "bendCleanupGate",
  "bendCleanupCommit",
  "bendTicketRetention",
  "bendDeliveryReleaseUnacknowledged",
  "bendDiscardScope",
  "bendCollectionExpired",
  "bendNoticePrune"
]) {
  if ([server, reuse, collection, notices].some((source) => source.includes(name))) {
    throw new Error(`resident retention bypass returned: ${name}`)
  }
}
for (const event of [
  "cleanupCheck",
  "cleanupCommit",
  "deliveryReleaseCheck",
  "collectionExpiryCheck",
  "collectionLeaseCheck",
  "noticePrune",
  "cacheDiscardPartition",
  "cacheClear",
  "dispatchScopeCheck"
]) {
  if (![server, reuse, collection, capacity, notices, advice].some((source) => source.includes(`kind: "${event}"`))) {
    throw new Error(`canonical retention event missing: ${event}`)
  }
}
if (
  server.includes("revalidationActive") ||
  !server.includes("residentLedger.adviceCaptures.start(") ||
  !server.includes("residentLedger.adviceCaptures.finish(capture)") ||
  !capacity.includes("resident state cannot clear outstanding advice captures")
) {
  throw new Error("advice capture lifetime escaped the shared state owner")
}

for (const owner of [
  "let residentLifecycle",
  "let residentConnections",
  "let residentRetirementScheduled",
  "let residentRejectedCapacity",
  "let residentPeakLedgerBytes",
  "let residentMaxMaterializedPreparedUnits",
  "let residentNextDispatchAuthoritySequence"
]) {
  if (server.includes(owner)) throw new Error(`independent runtime lifetime owner returned: ${owner}`)
}
if (
  !server.includes("residentLedger.runtime.cleanup(logicalBytes)") ||
  !capacity.includes("runtimeRecordOperations(runtime, residentLifetime).retire()")
) {
  throw new Error("runtime retirement must publish with canonical cleanup in the shared owner")
}

if (
  server.includes("runtime.observeCapacity(") ||
  !capacity.includes("Math.max(records.runtime.peakLedgerBytes, projectCanonical(next.canonical).global.bytes)")
) {
  throw new Error("peak retention must observe every published shared-owner commit, not server sampling checkpoints")
}
