// Fixed comparative campaign, not a model-driven optimization loop.
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { cases, tasks } from "./abide-contextual-fixtures.mjs"
const project = path.resolve(import.meta.dirname, "..")
const root = path.resolve(
  process.argv.find((x) => x.startsWith("--out="))?.slice(6) ??
    path.resolve(import.meta.dirname, "../../hapsland-research/evidence/abide-contextual-confirmation")
)
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex")
assert(process.argv.includes("--execute"), "Explicit execution flag required")
assert(!fs.existsSync(path.join(root, "declaration.json")), "Do not replace a declared campaign")
fs.mkdirSync(root, { recursive: true })
const protectedPaths = [
  "scripts/run-abide-contextual-study.mjs",
  "scripts/run-abide-quality.mjs",
  "scripts/abide-quality-capture.mjs",
  "scripts/abide-quality-observer.mjs",
  "scripts/abide-contextual-fixtures.mjs",
  "scripts/score-abide-contextual-artifacts.mjs"
]
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
const protectedFiles = [
  ...protectedPaths,
  ...walk(path.join(project, "src"))
    .filter((p) => /\.(ts|json)$/.test(p))
    .map((p) => path.relative(project, p))
]
const digests = Object.fromEntries(protectedFiles.map((p) => [p, hash(fs.readFileSync(path.join(project, p)))]))
const verify = () => {
  for (const [p, digest] of Object.entries(digests))
    assert.equal(hash(fs.readFileSync(path.join(project, p))), digest, `Protected study/runtime drift: ${p}`)
}
const write = (name, value) =>
  fs.writeFileSync(path.join(root, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx" })
for (const p of protectedPaths) fs.copyFileSync(path.join(project, p), path.join(root, path.basename(p)))
write("declaration.json", {
  version: 1,
  declaredAt: new Date().toISOString(),
  sourceClass: "SRC",
  verificationState: "DOCUMENTED",
  question:
    "On deliberately selected fresh cross-file duplicate-encoding use cases, does corrected Hapsland yield more correct findings and final repairs than actual Abide with the same Noul rule?",
  authority: "User-authorized comparative validation; advisory evidence, not a product contract or optimization keep.",
  repeats: ["repeat-1", "repeat-2", "repeat-3"],
  cases: cases.map((c) => ({ id: c.id, gold: c.gold })),
  arms: ["baseline", "hapsland", "abide"],
  plannedDetectionCells: 36,
  plannedNativeSessions: 54,
  scope:
    "Four fresh contextual r4 duplicate-encoding flaws and two independent-fact controls. Includes all files; excludes none. Seeded flaws precede the neutral rename. No installed-release or universal superiority claim.",
  nativeModel: "gpt-6-luna",
  reasoning: "max",
  taskProfile: "feedback-protocol",
  instructionsEqualAcrossArms: true,
  receiptMarkersOnlyInRuleBearingReviewerOutput: true,
  thresholds: { finding: 0.7, abideFlag: 0.3 },
  manuallyActiveAbideNoulRubric: true,
  sourceCheckoutHapsland: true,
  nativeTrustAndSandboxBypassed: true,
  sharedPhysicalRequestCap: 180,
  localDetectionCap: 1,
  localNativeReviewerCap: 4,
  automaticRetries: 0,
  maximumNativeSessionMs: 300000,
  tokenCeilings: { perSession: 100000, perNativeRepeat: 1000000, observedAtCompletionOnly: true },
  scorer:
    "Independent TypeScript 5.9.3 finite-domain probes, anonymous final artifacts; no candidate or feedback input. Removed duplicate field or correct correlation allowed. Domain restriction is not a repair.",
  primaryMetrics: [
    "Correct threshold-0.7 detections on four contextual flaws",
    "Independently correct final repairs on four contextual flaws"
  ],
  secondaryMetrics: [
    "Clean controls preserved",
    "Positive reviewer answer -> emitted rule-bearing feedback -> nonce-confirmed receipt -> correct repair after output",
    "Host completion and transport errors"
  ],
  noise:
    "Three fresh sessions per case/arm; descriptive repeats, not twelve independent flaw cases. No outcome-selected replacement or candidate changes during the campaign.",
  disconfirmation:
    "Equal or better Abide repairs/detections, substantial independent baseline repair, Hapsland missed findings or delivery gaps, or restrictions of valid domain combinations weaken the advantage claim.",
  stop: "Run the fixed detection matrix and three native repeats; retain all failed/timed-out/negative cells. Stop on source drift or exhausted request cap. No favorable replacement runs.",
  protectedDigests: digests,
  fixtureManifestDigest: hash(JSON.stringify({ cases, tasks })),
  protectedOracleSha256: digests["scripts/score-abide-contextual-artifacts.mjs"]
})
const run = (args) =>
  new Promise((resolve, reject) => {
    const p = spawn(process.execPath, args, { cwd: project, stdio: ["ignore", "inherit", "inherit"] })
    p.on("error", () => reject(new Error("Study child spawn failed")))
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Study child exit ${code}`))))
  })
const common = [
  "scripts/run-abide-quality.mjs",
  "--live",
  "--fixtures=abide-contextual-fixtures.mjs",
  "--fresh-context-study",
  "--task-profile=feedback-protocol",
  "--feedback-receipt",
  "--delivery-debug",
  `--shared-attempt-log=${path.join(root, "attempts.jsonl")}`,
  "--request-cap=180"
]
verify()
await run([...common, "--capture-only", "--capture-passes=3", `--out=${path.join(root, "detection")}`])
for (const repeat of ["repeat-1", "repeat-2", "repeat-3"]) {
  verify()
  await run([...common, "--skip-capture", `--out=${path.join(root, repeat)}`])
  verify()
  await run([
    "scripts/score-abide-contextual-artifacts.mjs",
    "--score",
    `--blind-root=${path.join(root, repeat, "blind")}`,
    `--output=${path.join(root, repeat, "blind-scores.json")}`,
    "--expected-count=18"
  ])
}
verify()
write("execution-complete.json", {
  version: 1,
  completedAt: new Date().toISOString(),
  protectedSourcesUnchanged: true,
  repeats: 3,
  plannedNativeSessions: 54
})
console.log(JSON.stringify({ executionComplete: true, root }))
