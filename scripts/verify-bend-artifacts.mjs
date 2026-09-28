import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packageRoot = resolve(root, "packages/agent-flow-bend");
for (const [artifact, sources] of [
  ["bend-policy.generated.js", ["Admission.bend", "Work.bend", "Handoff.bend", "Round.bend", "Background.bend", "Notice.bend", "Collection.bend", "Delivery.bend", "Cache.bend", "Ticket.bend", "Revision.bend", "Reuse.bend", "Retention.bend", "Lifecycle.bend", "PolicyRuntime.bend", "scripts/build-policy.mjs"]],
]) {
  const digest = createHash("sha256");
  for (const source of sources) {
    digest.update(source).update("\0")
      .update(readFileSync(resolve(packageRoot, source))).update("\0");
  }
  const firstLine = readFileSync(resolve(root, "src/resident", artifact), "utf8").split("\n", 1)[0];
  if (firstLine !== `// hapsland-bend-source-sha256:${digest.digest("hex")}`) {
    throw new Error(`${artifact} is stale; run npm run build in packages/agent-flow-bend`);
  }
}
const canonicalSources = ["Ledger.bend", "Admission.bend", "Flow.bend", "Work.bend", "Retention.bend", "Dispatch.bend", "Collection.bend", "CollectionState.bend", "DeliveryState.bend", "SubmissionState.bend", "RevisionState.bend", "TicketState.bend", "Ticket.bend", "ReuseState.bend", "Reuse.bend", "Cache.bend", "Notice.bend", "NoticeState.bend", "Handoff.bend", "Delivery.bend", "Canonical.bend", "CanonicalRuntime.bend", "scripts/build-canonical.mjs"];
const canonicalDigest = createHash("sha256");
for (const source of canonicalSources) {
  canonicalDigest.update(source).update("\0")
    .update(readFileSync(resolve(packageRoot, source))).update("\0");
}
const canonicalFirstLine = readFileSync(resolve(root, "src/canonical/canonical.generated.js"), "utf8").split("\n", 1)[0];
if (canonicalFirstLine !== `// hapsland-bend-source-sha256:${canonicalDigest.digest("hex")}`) {
  throw new Error("canonical.generated.js is stale; run node packages/agent-flow-bend/scripts/build-canonical.mjs");
}
