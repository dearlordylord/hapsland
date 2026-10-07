import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const packageRoot = resolve(root, "packages/agent-flow-bend")
for (const name of ["import-graph.generated.js", "import-graph.generated.d.ts"]) {
  if (!readFileSync(resolve(packageRoot, name)).equals(readFileSync(resolve(root, "src/canonical", name)))) {
    throw new Error(`${name} production copy is stale; copy the checked Bend artifact into src/canonical`)
  }
}
const canonicalSources = [
  "Ledger.bend",
  "Admission.bend",
  "Flow.bend",
  "Work.bend",
  "Retention.bend",
  "Dispatch.bend",
  "Collection.bend",
  "CollectionState.bend",
  "DeliveryState.bend",
  "SubmissionState.bend",
  "RevisionState.bend",
  "CollectorAuthority.bend",
  "ReuseState.bend",
  "Reuse.bend",
  "Cache.bend",
  "Notice.bend",
  "NoticeState.bend",
  "Configuration.bend",
  "RulePolicy.bend",
  "Handoff.bend",
  "Delivery.bend",
  "Canonical.bend",
  "CanonicalRuntime.bend",
  "scripts/build-canonical.mjs"
]
const canonicalDigest = createHash("sha256")
for (const source of canonicalSources) {
  canonicalDigest
    .update(source)
    .update("\0")
    .update(readFileSync(resolve(packageRoot, source)))
    .update("\0")
}
const canonicalFirstLine = readFileSync(resolve(root, "src/canonical/canonical.generated.js"), "utf8").split("\n", 1)[0]
if (canonicalFirstLine !== `// hapsland-bend-source-sha256:${canonicalDigest.digest("hex")}`) {
  throw new Error("canonical.generated.js is stale; run node packages/agent-flow-bend/scripts/build-canonical.mjs")
}

execFileSync(process.execPath, [resolve(packageRoot, "scripts/build-request-content.mjs"), "--check"], {
  stdio: "inherit",
  timeout: 10000
})
