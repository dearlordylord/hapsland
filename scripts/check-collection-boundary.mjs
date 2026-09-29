import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const server = readFileSync(resolve(root, "src/resident/server.ts"), "utf8");
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
  "collectionFindingCheck", "collectionNoticeCheck", "collectionReserveLease",
  "collectionReleaseLease", "collectionLeaseCheck", "collectionClaimBackground"]) {
  if (!server.includes(name) && !delivery.includes(name)) throw new Error(`canonical collection event missing: ${name}`);
}
