// Bounded predeclared layout comparison; source and fixture selection freeze first.
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"
const project = path.resolve(process.cwd())
const { cases: allCases, tasks: allTasks } = await import(
  pathToFileURL(path.join(project, "scripts/abide-large-declaration-fixtures.mjs"))
)
const cases = allCases.filter((f) => f.candidateId === "moderation-decision")
const tasks = allTasks.filter((f) => f.candidateId === "moderation-decision")
const root = path.resolve(
  process.argv.find((a) => a.startsWith("--out="))?.slice(6) ?? ".test-runs/abide-large-moderation-corrected-current"
)
assert(process.argv.includes("--execute"), "Explicit execution flag required")
assert(!fs.existsSync(path.join(root, "declaration.json")), "Never replace a declared campaign")
const preflightFile = process.argv.find((a) => a.startsWith("--preflight-file="))?.slice(17)
assert(preflightFile, "Checked offline --preflight-file required")
const hash = (b) => crypto.createHash("sha256").update(b).digest("hex")
const preflight = JSON.parse(fs.readFileSync(preflightFile))
assert.equal(preflight.providerRequests, 0)
assert.equal(preflight.records.length, 36)
for (const fixture of cases) {
  const r = preflight.records.find((r) => r.caseId === fixture.id)
  assert(r?.compiledBeforeAndAfter && r.prepared.ready === 1)
  assert.equal(r.fixtureDigest, hash(JSON.stringify(fixture)))
}
const projectionFile = process.argv.find((a) => a.startsWith("--projection-preflight-file="))?.slice(28)
assert(projectionFile, "Fresh offline --projection-preflight-file required")
const projection = JSON.parse(fs.readFileSync(projectionFile))
assert.equal(projection.providerRequests, 0)
for (const fixture of cases) {
  const r = projection.records.find((r) => r.caseId === fixture.id)
  assert(r?.providerInputRendered === true, `${fixture.id}: provider projection must render`)
}
for (const file of [
  "packages/review-execution/src/direct-event/pipeline.ts",
  "packages/review-execution/src/direct-event/review-renderer.ts",
  "packages/review-definition/src/review-providers/catalog.ts",
  "packages/review-execution/src/review-providers/request.ts"
]) {
  assert.equal(
    projection.sourceHashes?.[file],
    hash(fs.readFileSync(path.join(project, file))),
    `Stale projection preflight: ${file}`
  )
}
assert.equal(cases.length, 6)
assert.equal(tasks.length, 4)
assert.equal(new Set(cases.map((f) => f.id)).size, 6)
assert.equal(new Set(tasks.map((f) => f.caseId)).size, 4)
const domains = [...new Set(cases.map((f) => f.candidateId))]
assert.equal(domains.length, 1)
const walk = (d) =>
  fs
    .readdirSync(d, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
const scripts = [
  "run-abide-large-declarations.mjs",
  "preflight-abide-large-declarations.mjs",
  "abide-large-declaration-fixtures.mjs",
  "score-abide-large-declarations.mjs",
  "run-abide-quality.mjs",
  "abide-quality-capture.mjs",
  "abide-quality-observer.mjs"
]
const protectedPaths = [
  ...scripts.map((n) => "scripts/" + n),
  ...walk(path.join(project, "src"))
    .filter((p) => /\.(ts|json)$/.test(p))
    .map((p) => path.relative(project, p))
]
const protectedDigests = Object.fromEntries(
  protectedPaths.map((p) => [p, hash(fs.readFileSync(path.join(project, p)))])
)
const verify = () => {
  assert.equal(hash(fs.readFileSync(import.meta.filename)), runnerDigest, "Replacement runner drift")
  for (const [p, h] of Object.entries(protectedDigests))
    assert.equal(hash(fs.readFileSync(path.join(project, p))), h, `Source drift: ${p}`)
}
fs.mkdirSync(root, { recursive: true })
const write = (name, value) =>
  fs.writeFileSync(path.join(root, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx" })
for (const n of scripts)
  fs.copyFileSync(path.join(project, "scripts", n), path.join(root, n), fs.constants.COPYFILE_EXCL)
for (const file of protectedPaths) {
  const dest = path.join(root, "source-snapshot", file)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(path.join(project, file), dest, fs.constants.COPYFILE_EXCL)
}
write("preflight.json", {
  ...preflight,
  records: preflight.records.filter((r) => r.candidateId === "moderation-decision")
})
write("projection-preflight.json", {
  ...projection,
  records: projection.records.filter((r) => cases.some((f) => f.id === r.caseId))
})
const runnerPath = path.resolve(import.meta.filename)
const runnerDigest = hash(fs.readFileSync(runnerPath))
fs.copyFileSync(runnerPath, path.join(root, "run-moderation-replacement.mjs"), fs.constants.COPYFILE_EXCL)
write("declaration.json", {
  version: 1,
  declaredAt: new Date().toISOString(),
  sourceClass: "SRC",
  verificationState: "DOCUMENTED",
  purpose:
    "Compare readability-reviewed realistic type/function domains across size and layout; test the context-visibility hypothesis, not assume superiority.",
  authority: "User-authorized comparative research advisory; no product requirement or release claim.",
  replacementFor: "abide-large-declarations-current/moderation-decision",
  replacementReason:
    "Renderer rejected opaque anonymous callback omission despite eligible body rule. Same frozen fixtures and scoring; current renderer repair only. Supersedes this domain in active publication; initial incomplete campaign retained as evidence.",
  runnerDigest,
  sourceCommit: spawnSync("git", ["rev-parse", "HEAD"], { cwd: project, encoding: "utf8" }).stdout.trim(),
  protectedDigests,
  fixtureManifestDigest: hash(JSON.stringify({ cases, tasks })),
  selectedDomains: domains,
  selection:
    "All six previously frozen moderation-decision fixtures, unchanged. No outcome-dependent reselection; corrected renderer follow-up explicitly replaces only this failed domain.",
  strata:
    "Moderation function domain: same statements, order and behavior, expanded signatures and meaningful paragraph spacing only.",
  layouts: ["small", "large-adjacent", "large-separated"],
  pairedGold: ["defect", "clean"],
  plannedDetectionCells: 24,
  detectionRepetitions: 2,
  plannedNativeSessions: 12,
  nativeRepetitions: 1,
  nativeLayouts: ["small", "large-separated"],
  agentRuntime: "Codex CLI",
  agentRuntimeVersion: "0.155.1",
  model: "gpt-6-luna",
  reasoning: "max",
  reviewers:
    "Current Hapsland source checkout and released Abide0.0.7 handler; same bundled Noul question/criteria, manually active custom Abide rubric. Both use Jev.",
  detectionBoundary:
    "Same localized three-context-line apply_patch maintenance rename supplied to both products. Defects seeded beforehand. This is a selected patch condition, not a universal Abide window.",
  nativeBoundary:
    "Same ordinary maintenance task plus request for minimal initial rename patch; agent chooses actual patches and later fixes freely. Native patch line statistics retained without private source.",
  taskProfile: "ordinary-maintenance",
  diagnosticReceiptInstrumentation: true,
  diagnosticReportingEqualAcrossArms: true,
  inputSelection:
    "All synthetic source eligible, excludes empty. Product input projections and feedback instructions differ; no isolated causal claim.",
  physicalRequestCap: 56,
  localDetectionCap: 1,
  localNativeReviewerCap: 4,
  automaticRetries: 0,
  maximumNativeSessionMs: 300000,
  concurrency: "At most three native actors; domain families sequential. Detection sequential.",
  scoring:
    "Frozen anonymous finite TypeScript5.9.3 contracts with complete valid/invalid assignment witnesses, independent-field preservation and deletion/narrowing mutants. r4/r9 require blinded semantic/runtime adjudication; unknown repairs receive no credit.",
  disconfirmation:
    "Abide ties/wins, no size interaction, spontaneous baseline fixes, Hapsland false positives, omitted context, unassessed outcomes or lost valid behavior weaken claims. Do not replace these cases.",
  stopping:
    "Execute the fixed matrix regardless of detection outcomes. Stop on source drift, exhausted budget or infrastructure failure; preserve incomplete records, no success-only replacements.",
  limits:
    "Selected synthetic known domains; exploratory, not held-out. Domain-related distance deliberately varied and not recommended coding style. No access-policy or coexistence testing."
})
write("manual-scoring-declaration.json", {
  version: 1,
  declaredAt: new Date().toISOString(),
  timing: "Before live outcomes.",
  blindness:
    "Read anonymous final source plus frozen domain and original facts only, never arm/index/B/feedback/detection. Freeze source/support hashes before arm join.",
  acceptance:
    "Compilation and label→displayLabel required. Retain every independent field and valid behavior. No credit for deleting behavior, witness hardcoding, narrower arbitrary text/data or unknown interpretations.",
  domains: {
    "attachment-manifest":
      "Retain arbitrary attachments, filename/mediaType and all independent fields. Badge total must be derived from the current actual attachments or constrained to equal their length. Removing the redundant count is valid if attachments remain and length stays available; deleting attachments is not. Unconstrained separate number, including getter/method signature with no body, is not proven repair. Test empty/one/two attachments and differing filenames; inspect representation and execute safe actual derivation when present. Clean retains attachments and all fields without reintroducing redundant state.",
    "reservation-window":
      "Explicit usable clock/observation time or resource-bearing effect dependency. Preserve trimmed label, reference, closure>expired>unavailable>available precedence and inventory decrement only when available. Deadline100 at times99/100/101; closed and unavailable cases; request seats2/remaining4 yields2 only for available, otherwise4. Hidden Date.now deliberately differs from supplied clock. Clean retains explicit clock and all behavior.",
    "moderation-decision":
      "Explicit usable audit writer or resource-bearing effect dependency. Preserve exactly-once audit of original text, trimming/normalization and empty/too-long/blocked/accepted status precedence with reference and presentation text preserved. Probe arbitrary and whitespace/empty input, length boundary, blocked terms. Removing audit/renaming away function is not repair. Clean retains explicit writer, exact raw audit and behavior."
  },
  verification:
    "Safe compiler/runtime probes plus source reasoning, recorded separately SRC/SOURCE-INSPECTED and RUN/RUNTIME-TESTED. Unrecognized API shapes remain unassessed; abstract signatures are not actual execution proof."
})
const run = (args) =>
  new Promise((resolve, reject) => {
    const p = spawn(process.execPath, args, { cwd: project, stdio: ["ignore", "inherit", "inherit"] })
    p.on("error", reject)
    p.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(`Study child exit ${c}`))))
  })
const credential = process.argv.find((a) => a.startsWith("--credential-file="))
const common = [
  "scripts/run-abide-quality.mjs",
  "--live",
  "--rule-coverage-study",
  "--task-profile=ordinary-maintenance",
  "--feedback-receipt",
  "--delivery-debug",
  "--patch-metadata",
  "--minimal-initial-patch",
  "--request-cap=56",
  `--shared-attempt-log=${path.join(root, "attempts.jsonl")}`,
  ...(credential ? [credential] : [])
]
for (const domain of domains) {
  fs.writeFileSync(
    path.join(root, domain + "-fixtures.mjs"),
    `import { cases as allCases, tasks as allTasks } from './abide-large-declaration-fixtures.mjs';\nexport const cases=allCases.filter(f=>f.candidateId===${JSON.stringify(domain)});\nexport const tasks=allTasks.filter(f=>f.candidateId===${JSON.stringify(domain)});\n`,
    { flag: "wx" }
  )
}
for (const domain of domains) {
  verify()
  await run([
    ...common,
    `--fixtures=${path.join(root, domain + "-fixtures.mjs")}`,
    "--capture-only",
    "--capture-passes=2",
    `--out=${path.join(root, domain, "detection")}`
  ])
}
for (const domain of domains) {
  verify()
  const native = path.join(root, domain, "native")
  await run([...common, `--fixtures=${path.join(root, domain + "-fixtures.mjs")}`, "--skip-capture", `--out=${native}`])
  verify()
  await run([
    "scripts/score-abide-large-declarations.mjs",
    "--score",
    `--fixtures=${path.join(root, "abide-large-declaration-fixtures.mjs")}`,
    `--blind-root=${path.join(native, "blind")}`,
    `--output=${path.join(native, "blind-scores.json")}`,
    "--expected-count=12"
  ])
}
verify()
write("execution-complete.json", {
  version: 1,
  completedAt: new Date().toISOString(),
  protectedSourcesUnchanged: true,
  plannedDetectionCells: 24,
  plannedNativeSessions: 12
})
console.log(JSON.stringify({ executionComplete: true, root }))
