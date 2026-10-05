// Offline serialization gate for all frozen fixtures; no provider or credential layer.
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import crypto from "node:crypto"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { pathToFileURL } from "node:url"
const project = path.resolve(process.cwd())
const output = process.argv.find((a) => a.startsWith("--output="))?.slice(9) ?? "/tmp/large-projection-corrected.json"
assert(!fs.existsSync(output), "Fresh output required")
const load = (relative) => import(pathToFileURL(path.join(project, relative)))
const Effect = await load("node_modules/effect/dist/Effect.js")
const { cases } = await load("scripts/abide-large-declaration-fixtures.mjs")
const { adaptCodexDirectEvent } = await load("src/direct-event/adapter.ts")
const {
  prepareObservation,
  preparedProviderInput,
  encodedPreparedProviderInputBytes,
  encodedPreparedProviderHttpBodyBytes
} = await load("src/direct-event/pipeline.ts")
const { configuredRules } = await load("src/policy/rules.ts")
const { DEFAULT_BACKEND, DEFAULT_DESTINATION } = await load("src/runtime/review-config.ts")
const { probabilityRequest, requestLimitViolation } = await load("src/review-providers/request.ts")
const hash = (x) => crypto.createHash("sha256").update(x).digest("hex")
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
const scripts = [
  "run-abide-large-declarations.mjs",
  "preflight-abide-large-declarations.mjs",
  "abide-large-declaration-fixtures.mjs",
  "score-abide-large-declarations.mjs",
  "run-abide-quality.mjs",
  "abide-quality-capture.mjs",
  "abide-quality-observer.mjs"
]
const protectedFiles = [
  ...scripts.map((n) => "scripts/" + n),
  ...walk(path.join(project, "src"))
    .filter((p) => /\.(ts|json)$/.test(p))
    .map((p) => path.relative(project, p))
]
const sourceHashes = Object.fromEntries(protectedFiles.map((p) => [p, hash(fs.readFileSync(path.join(project, p)))]))
let providerRequests = 0
globalThis.fetch = async () => {
  providerRequests++
  throw new Error("Network forbidden in projection preflight")
}
const records = []
for (const fixture of cases) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "hapsland-projection-preflight-"))
  try {
    for (const [name, source] of Object.entries(fixture.support)) fs.writeFileSync(path.join(repo, name), source)
    fs.writeFileSync(path.join(repo, "subject.ts"), fixture.before)
    execFileSync("git", ["init", "-q"], { cwd: repo })
    execFileSync("git", ["add", "."], { cwd: repo })
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Offline projection",
        "-c",
        "user.email=offline@example.invalid",
        "commit",
        "-qm",
        "Frozen synthetic input"
      ],
      { cwd: repo }
    )
    fs.writeFileSync(path.join(repo, "subject.ts"), fixture.after)
    const event = {
      hook_event_name: "PostToolUse",
      tool_name: "apply_patch",
      session_id: "projection-preflight",
      turn_id: "offline",
      tool_use_id: "offline",
      cwd: repo,
      tool_input: { command: fixture.captureCommand },
      tool_response: { success: true }
    }
    const observation = await Effect.runPromise(adaptCodexDirectEvent(event))
    assert(observation, `${fixture.id}: observation missing`)
    const prepared = await Effect.runPromise(
      prepareObservation(observation, {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules: configuredRules.filter((r) => r.id === fixture.ruleId),
        inputContract: fixture.inputContract,
        policy: { includes: ["**/*"], excludes: fixture.excludedPaths }
      })
    )
    const ready = prepared.outcomes.filter((r) => r.status === "ready")
    const units = ready.map((item) => {
      const providerInput = preparedProviderInput(item.prepared)
      const request =
        providerInput === undefined
          ? undefined
          : probabilityRequest(item.prepared.input.providerIdentity.model, providerInput, item.prepared.input.rules)
      return {
        declaration: item.prepared.input.declaration.name,
        providerInputRendered: providerInput !== undefined,
        providerInputBytes: providerInput === undefined ? null : encodedPreparedProviderInputBytes(item.prepared),
        httpBodyBytes: providerInput === undefined ? null : encodedPreparedProviderHttpBodyBytes(item.prepared),
        violation:
          providerInput === undefined
            ? "renderer-rejected"
            : (requestLimitViolation(item.prepared.input.providerIdentity.model, request) ?? null),
        completeness: item.prepared.input.completeness,
        ruleIds: item.prepared.input.rules.map((r) => r.id)
      }
    })
    records.push({
      caseId: fixture.id,
      candidateId: fixture.candidateId,
      layout: fixture.layout,
      gold: fixture.gold,
      fixtureDigest: hash(JSON.stringify(fixture)),
      ready: ready.length,
      providerInputRendered: units.length === 1 && units[0].providerInputRendered,
      dispatchable: units.length === 1 && units[0].violation === null,
      units
    })
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
}
for (const [file, digest] of Object.entries(sourceHashes))
  assert.equal(hash(fs.readFileSync(path.join(project, file))), digest, `Source changed: ${file}`)
assert.equal(providerRequests, 0)
fs.writeFileSync(
  output,
  JSON.stringify(
    {
      version: 1,
      checkedAt: new Date().toISOString(),
      sourceClass: "RUN",
      verificationState: "RUNTIME-TESTED",
      offline: true,
      providerRequests,
      sourceHashes,
      scriptSha256: hash(fs.readFileSync(import.meta.filename)),
      fixtureManifestDigest: hash(JSON.stringify(cases)),
      records
    },
    null,
    2
  ) + "\n",
  { flag: "wx" }
)
console.log(
  JSON.stringify({
    output,
    count: records.length,
    rendered: records.filter((r) => r.providerInputRendered).length,
    dispatchable: records.filter((r) => r.dispatchable).length,
    moderationRendered: records.filter((r) => r.candidateId === "moderation-decision" && r.providerInputRendered).length
  })
)
if (process.argv.includes("--require-all-rendered"))
  assert(
    records.every((r) => r.dispatchable),
    "Some prepared projections rejected; inspect output"
  )
