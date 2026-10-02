import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const server = readFileSync(resolve(root, "src/resident/server.ts"), "utf8");
const advice = readFileSync(resolve(root, "src/resident/advice-records.ts"), "utf8");
const delivery = readFileSync(resolve(root, "src/resident/composed-delivery.ts"), "utf8");
const collection = readFileSync(resolve(root, "src/resident/collection.ts"), "utf8");
for (const name of ["bendCollectionOrder", "bendCollectionEligible", "bendCollectionExpired",
  "bendCollectionCredentialDisposition", "bendDeliveryCollectionLease",
  "bendDeliveryAdviceCandidate", "bendDeliveryReserveCandidate",
  "isCollectionEligible", "isPendingAdviceExpired"]) {
  if (new RegExp(`\\b${name}\\b`).test(server)) throw new Error(`resident collection bypass returned: ${name}`);
}
for (const name of ["bendBackgroundClaim", "bendBackgroundRelease", "bendBackgroundExpire"]) {
  if (new RegExp(`\\b${name}\\b`).test(delivery)) throw new Error(`resident background claim bypass returned: ${name}`);
}
for (const name of ["bendCollectionOrder", "bendCollectionEligible", "bendCollectionExpired",
  "bendSelectionInitial", "bendSelectionStep", "bendNoticeOffer", "bendFitsBatch"]) {
  if (new RegExp(`\\b${name}\\b`).test(collection)) throw new Error(`collection helper bypass returned: ${name}`);
}
for (const name of ["collectionReady", "collectionOrderCheck", "collectionExpiryCheck",
  "collectionFindingCheck", "collectionReserveLease",
  "collectionReleaseLease", "collectionLeaseCheck", "collectionClaimBackground"]) {
  if (!server.includes(name) && !delivery.includes(name) && !advice.includes(name)) throw new Error(`canonical collection event missing: ${name}`);
}

if (server.includes("#bendPartitions") || server.includes("#nextBendPartition")) {
  throw new Error("finding selection must use the shared resident partition identity owner");
}

if (server.includes("#advice: Array") || server.includes("#advice.push(") || server.includes("#advice.splice(")) {
  throw new Error("retained advice escaped the shared native state owner");
}

if (/\b(?:advice|item)\.(?:evaluations|findings|collectionEligible)\s*=(?!=)/.test(server) ||
    /\b(?:advice|item)\.delivery\.(?:findings|leaseUntil|acknowledged)\s*=(?!=)/.test(server) ||
    /\bdelivery\.(?:findings|leaseUntil|acknowledged)\s*=(?!=)/.test(server)) {
  throw new Error("collection mutated a published advice snapshot");
}
