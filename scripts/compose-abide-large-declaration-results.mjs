// Join a complete frozen matrix with its predeclared serialization repair batch.
import fs from "node:fs"
import path from "node:path"
import assert from "node:assert/strict"
import crypto from "node:crypto"
const initial = path.resolve(process.argv[2] ?? "evidence/abide-large-declarations-current")
const replacement = path.resolve(process.argv[3] ?? "evidence/abide-large-moderation-corrected-current")
const read = (root, name) => JSON.parse(fs.readFileSync(path.join(root, name)))
const original = read(initial, "comparison.json"),
  corrected = read(replacement, "comparison.json")
const a = read(initial, "declaration.json"),
  b = read(replacement, "declaration.json")
assert.deepEqual(b.selectedDomains, ["moderation-decision"])
assert.equal(corrected.domains.length, 1)
assert.equal(original.domains.length, 6)
assert.equal(
  a.protectedDigests["scripts/abide-large-declaration-fixtures.mjs"],
  b.protectedDigests["scripts/abide-large-declaration-fixtures.mjs"]
)
assert.deepEqual(
  read(initial, "manual-scoring-declaration.json").domains,
  read(replacement, "manual-scoring-declaration.json").domains
)
const allowedChanges = new Set([
  "src/direct-event/review-renderer.ts",
  "src/direct-event/review-renderer.test.ts",
  "src/direct-event/function-resource-review.test.ts"
])
const sourceChanges = []
for (const [file, digest] of Object.entries(a.protectedDigests))
  if (digest !== b.protectedDigests[file]) {
    assert(allowedChanges.has(file), `Unexpected repair-batch source change: ${file}`)
    sourceChanges.push(file)
  }
assert(sourceChanges.includes("src/direct-event/review-renderer.ts"))
const domains = original.domains.map((d) => corrected.domains.find((r) => r.candidateId === d.candidateId) ?? d)
const batches = Object.fromEntries(
  domains.map((d) => [
    d.candidateId,
    {
      root: path.relative(path.dirname(initial), d.candidateId === "moderation-decision" ? replacement : initial),
      sourceCommit: d.candidateId === "moderation-decision" ? b.sourceCommit : a.sourceCommit
    }
  ])
)
for (const d of domains) {
  assert.equal(d.cells.length, 12)
  const root = d.candidateId === "moderation-decision" ? replacement : initial
  const index = read(root, `${d.candidateId}/native/index.json`)
  for (const cell of d.cells) {
    assert(!["manual-adjudication-required", "manual-only"].includes(cell.finalStatus))
    const record = index.records.find((r) => r.blindId === cell.blindId)
    assert(record)
    const native = read(root, `${d.candidateId}/native/B-${record.id}-${record.candidate}.json`)
    cell.firstPatch =
      native.hookEvents
        ?.filter((e) => ["edit", "post-tool-use"].includes(e.kind) && e.patchStats)
        .sort((a, b) => a.at - b.at)[0]?.patchStats ?? null
  }
}
function requests(root, domain) {
  const dir = path.join(root, domain, "detection")
  let count = 0
  for (const f of fs.readdirSync(dir).filter((f) => f.startsWith("A-")))
    count += read(root, `${domain}/detection/${f}`).requests.filter((q) => q.kind === "request").length
  const d = read(root, "comparison.json").domains.find((d) => d.candidateId === domain)
  for (const layout of Object.values(d.native)) for (const arm of Object.values(layout)) count += arm.requests
  return count
}
const excludedRequests = requests(initial, "moderation-decision")
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
const result = {
  ...original,
  completedAt: new Date().toISOString(),
  physicalRequests: original.physicalRequests - excludedRequests + corrected.physicalRequests,
  domains,
  batches,
  sourceChanges,
  composition: {
    reason: b.replacementReason,
    unchangedFixtures: true,
    unchangedManualRubric: true,
    initialDeclarationDigest: hash(path.join(initial, "declaration.json")),
    replacementDeclarationDigest: hash(path.join(replacement, "declaration.json")),
    initialComparisonDigest: hash(path.join(initial, "comparison.json")),
    replacementComparisonDigest: hash(path.join(replacement, "comparison.json")),
    executedDetectionCells: a.plannedDetectionCells + b.plannedDetectionCells,
    executedNativeSessions: a.plannedNativeSessions + b.plannedNativeSessions,
    executedPhysicalRequests: original.physicalRequests + corrected.physicalRequests,
    excludedPhysicalRequests: excludedRequests
  },
  limits:
    original.limits +
    " Five families retain their original source-pinned runs; the unchanged moderation family uses the declared renderer-repair replacement. Counts do not claim a full rerun on one source revision."
}
fs.writeFileSync(path.join(initial, "effective-comparison.json"), JSON.stringify(result, null, 2) + "\n", {
  flag: "wx"
})
console.log(
  JSON.stringify({
    composed: true,
    currentDetectionCells: result.plannedDetectionCells,
    currentNativeSessions: result.plannedNativeSessions,
    currentPhysicalRequests: result.physicalRequests,
    executedPhysicalRequests: result.composition.executedPhysicalRequests
  })
)
