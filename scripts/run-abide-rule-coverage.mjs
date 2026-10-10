// Fixed reviewed examples; never select or replace cases using live outcomes.
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { cases, tasks } from "./abide-rule-coverage-fixtures.mjs"
const project = path.resolve(import.meta.dirname, "..")
const root = path.resolve(
  process.argv.find((arg) => arg.startsWith("--out="))?.slice(6) ?? ".test-runs/abide-rule-coverage-current"
)
assert(process.argv.includes("--execute"), "Explicit execution flag required")
assert(!fs.existsSync(path.join(root, "declaration.json")), "Never overwrite a declared campaign")
fs.mkdirSync(root, { recursive: true })
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex")
const write = (name, value) =>
  fs.writeFileSync(path.join(root, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx" })
const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: project, stdio: ["ignore", "inherit", "inherit"] })
    child.on("error", reject)
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Study child failed: ${code}`))))
  })
const existingPreflight = process.argv.find((arg) => arg.startsWith("--preflight-file="))?.slice(17)
if (existingPreflight) {
  const preflight = JSON.parse(fs.readFileSync(existingPreflight))
  assert.equal(preflight.providerRequests, 0)
  assert.equal(preflight.records.length, cases.length * 2)
  for (const fixture of cases)
    for (const phase of ["detection", "maintenance"]) {
      const record = preflight.records.find((item) => item.caseId === fixture.id && item.phase === phase)
      assert(record?.compiledBeforeAndAfter)
      assert.equal(record.fixtureDigest, hash(JSON.stringify(fixture)))
      assert(
        record.prepared.ready === 1 ||
          (["clock-sensitive-expiry", "hidden-audit-write"].includes(fixture.id) && record.prepared.ready === 0)
      )
    }
  write("preflight.json", preflight)
} else {
  await run(["scripts/preflight-abide-rule-coverage.mjs", `--output=${path.join(root, "preflight.json")}`])
}
await run(["scripts/score-abide-rule-coverage.mjs", "--self-check"])
const scripts = [
  "run-abide-rule-coverage.mjs",
  "preflight-abide-rule-coverage.mjs",
  "abide-rule-coverage-fixtures.mjs",
  "score-abide-rule-coverage.mjs",
  "run-abide-quality.mjs",
  "abide-quality-capture.mjs",
  "abide-quality-observer.mjs"
]
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))
const protectedPaths = [
  ...scripts.map((name) => `scripts/${name}`),
  ...walk(path.join(project, "src"))
    .filter((name) => /\.(ts|json)$/.test(name))
    .map((name) => path.relative(project, name))
]
const digests = Object.fromEntries(
  protectedPaths.map((name) => [name, hash(fs.readFileSync(path.join(project, name)))])
)
const verify = () => {
  for (const [name, digest] of Object.entries(digests))
    assert.equal(hash(fs.readFileSync(path.join(project, name))), digest, `Protected source drift: ${name}`)
}
for (const name of scripts) fs.copyFileSync(path.join(project, "scripts", name), path.join(root, name))
const families = [...new Set(cases.map((fixture) => fixture.ruleId))]
assert.equal(families.length, 8)
assert.equal(cases.length, 24)
assert.equal(tasks.length, 24)
const sourceCommit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: project, encoding: "utf8" }).stdout.trim()
write("declaration.json", {
  version: 1,
  declaredAt: new Date().toISOString(),
  sourceClass: "SRC",
  verificationState: "DOCUMENTED",
  purpose:
    "Compare all remaining Noul rule families using readable reviewed synthetic examples, retaining losses and ties.",
  authority:
    "User-authorized research advisory; not a product requirement, optimization loop or release support claim.",
  sourceCommit,
  protectedDigests: digests,
  fixtureManifestDigest: hash(JSON.stringify({ cases, tasks })),
  cases: cases.map((fixture) => ({
    id: fixture.id,
    ruleId: fixture.ruleId,
    gold: fixture.gold,
    supportingFiles: Object.keys(fixture.support),
    inputContract: fixture.inputContract ?? "direct-event/type-shape/v1"
  })),
  selection:
    "Two constructed defects and one nearby clean control per family, reviewed and frozen before live outcomes. Some are local; cross-file context advantage is a hypothesis, not a selection criterion based on measured success.",
  knownPreflightLimitations:
    "The two defective r9 function graphs include the helper bodies but contain unsupported global/member references. Bundled full-capability r9 is not eligible. Retain these cells as unchecked, distinct from a clear Jev answer; they are not removed from the comparison.",
  agentRuntime: "Codex CLI",
  agentRuntimeVersion: "0.155.1",
  model: "gpt-6-luna",
  reasoning: "max",
  arms: ["baseline", "hapsland", "abide"],
  detectionRepetitions: 3,
  nativeRepetitions: 1,
  plannedDetectionCells: 144,
  plannedNativeSessions: 72,
  physicalRequestCap: 336,
  localDetectionCap: 1,
  localNativeReviewerCap: 4,
  automaticRetries: 0,
  maximumNativeSessionMs: 300000,
  tokenCeilings: { perNativeSession: 100000, perNativeFamily: 1000000, observedAtCompletionOnly: true },
  taskProfile: "ordinary-maintenance",
  taskInstructionsEqualAcrossArms: true,
  additionalRepairInstructionsInTask: false,
  diagnosticReceiptInstrumentation: true,
  diagnosticReportingAddedToTask: true,
  receiptMarkersOnlyInRuleBearingOutput: true,
  inputSelection:
    "All synthetic source files eligible; exclusions empty. Hapsland declaration graph and Abide diff/task boundaries remain different.",
  comparator:
    "Released unchanged Abide0.0.7 handler with manually active custom rubric using the same Noul question and criteria; each product supplies its own repair instructions.",
  scoring:
    "Anonymous artifacts: independent TypeScript5.9.3 finite semantic probes. Shape/field removal cannot count as repair; invalid syntax, lost valid facts and unknown adaptations receive no credit. Predeclared manual rubric for semantic identities, operation names and resource declarations; preserve source digests and distinguish source inspection from executed probes.",
  disconfirmation:
    "Abide ties/wins, Hapsland misses or false positives, spontaneous baseline repairs, unassessed shapes or lost domain behavior weaken the advantage claim; do not replace those cells.",
  stop: "Run the entire fixed matrix regardless of detection outcomes. Stop on source drift or budget; record missing/incomplete cells without replacements.",
  limitations:
    "Team-authored small synthetic sample, no held-out population claim, no isolated context-only causality, instrumented source checkout rather than installed release."
})
write("manual-scoring-declaration.json", {
  version: 1,
  declaredAt: new Date().toISOString(),
  timing: "Before any live outcome.",
  blindness:
    "Review final anonymous source and fixture domain only; no arm, feedback or outcome ledger. Freeze judgments before joining reviewer identity.",
  acceptance:
    "Compilation and presentation rename required. Preserve all original domain facts and valid operations. Removing behavior, hardcoding witness values or accepting unrelated data is not a repair. Unrecognized approaches remain unassessed; no speculative credit.",
  cases: {
    "retention-action":
      "Name keep/remove explicitly in reachable representation. Keep a supplied date and immediate removal both representable. Check at least both declared dates, not just one witness.",
    "render-destination":
      "Name return/write explicitly. Preserve no-destination return and arbitrary string destination write. A redundant tag with unrestricted conflicting option is insufficient.",
    "account-project-identities":
      "Distinct account and project identity types or independently validated constructors must prevent cross-substitution. Prefix spelling of sample strings alone is not proof. Both identities and their association must remain.",
    "publish-bulletin":
      "Publishing callable declares a usable publication channel parameter or a resource-bearing effect requirement. Retain arbitrary text publication; removing/renaming away the callable is not repair.",
    "load-preview":
      "Loading callable declares a usable preview-store parameter or resource-bearing effect requirement. Preserve returned preview text; removing the operation is not repair.",
    "clean-explicit-channel":
      "Retain publication through explicit channel and independent optional note. Do not remove channel or narrow arbitrary text.",
    "clock-sensitive-expiry":
      "Expose observation time or clock dependency; preserve comparison at times before, equal to and after deadline. Check deterministic time values10/20/30 with deadline20; a constant answer or merely deleting clock read is not repair.",
    "hidden-audit-write":
      "Expose usable audit writer or resource-bearing effect requirement. Preserve exact supplied audit text once per invocation and trimmed return. Test whitespace and empty input; deleting audit side effect is not repair.",
    "clean-explicit-time":
      "Retain explicit observation time and deterministic deadline comparison before/equal/after; no introduced hidden time dependency."
  },
  verification:
    "Record concrete source rationale and any compiler/runtime probe separately. Source adjudication is not a general formal proof; do not report unexplored implementation shapes as verified."
})
const credential = process.argv.find((arg) => arg.startsWith("--credential-file="))
const common = [
  "scripts/run-abide-quality.mjs",
  "--live",
  "--rule-coverage-study",
  "--task-profile=ordinary-maintenance",
  "--feedback-receipt",
  "--delivery-debug",
  "--request-cap=336",
  `--shared-attempt-log=${path.join(root, "attempts.jsonl")}`,
  ...(credential ? [credential] : [])
]
for (const ruleId of families) {
  const filename = `${ruleId}-fixtures.mjs`
  fs.writeFileSync(
    path.join(root, filename),
    `import {cases as allCases,tasks as allTasks} from './abide-rule-coverage-fixtures.mjs';\nexport const cases=allCases.filter(c=>c.ruleId===${JSON.stringify(ruleId)});\nexport const tasks=allTasks.filter(t=>t.ruleId===${JSON.stringify(ruleId)});\n`,
    { flag: "wx" }
  )
}
for (const ruleId of families) {
  verify()
  await run([
    ...common,
    `--fixtures=${path.join(root, `${ruleId}-fixtures.mjs`)}`,
    "--capture-only",
    "--capture-passes=3",
    `--out=${path.join(root, ruleId, "detection")}`
  ])
}
for (const ruleId of families) {
  verify()
  const nativeRoot = path.join(root, ruleId, "native")
  await run([
    ...common,
    `--fixtures=${path.join(root, `${ruleId}-fixtures.mjs`)}`,
    "--skip-capture",
    `--out=${nativeRoot}`
  ])
  verify()
  await run([
    "scripts/score-abide-rule-coverage.mjs",
    "--score",
    `--blind-root=${path.join(nativeRoot, "blind")}`,
    `--output=${path.join(nativeRoot, "blind-scores.json")}`,
    "--expected-count=9"
  ])
}
verify()
write("execution-complete.json", {
  version: 1,
  completedAt: new Date().toISOString(),
  protectedSourcesUnchanged: true,
  plannedNativeSessions: 72,
  plannedDetectionCells: 144
})
console.log(JSON.stringify({ executionComplete: true, root }))
