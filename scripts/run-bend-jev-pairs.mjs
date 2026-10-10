// Opt-in, bounded Bend paired validation through the production analyzer and renderer.
import { bendFixtures as fixtures } from "./bend-validation-fixtures.mjs"
import { execFileSync } from "node:child_process"
import { readFile, mkdir, writeFile } from "node:fs/promises"
import { resolve, join } from "node:path"
import * as Effect from "effect/Effect"
import { decide, Live } from "@hapsland/review-execution/jev-decision"
import { E0 } from "@hapsland/review-definition/questions"
import { analyzeNamedUnit, inspectGraphFile } from "@hapsland/source-analysis/direct-event/analyzer"
import { candidateReviewInput } from "@hapsland/review-execution/direct-event/pipeline"
import { renderCandidateReviewInput } from "@hapsland/review-execution/direct-event/review-renderer"
const root = resolve(new URL("../", import.meta.url).pathname)
const declaration = Object.freeze({
  attempt: 1,
  fixtureIds: ["bend-payment-bad", "bend-payment-good"],
  repeatsPerFixture: 3,
  maximumProviderRequests: 6,
  deadlineMs: 15000,
  automaticRetries: 0,
  maximumFixtureFileBytes: 4096,
  targetRule: "r2_meaningless_combinations",
  threshold: 0.7,
  acceptance: "All bad probabilities exceed threshold; all good probabilities are below threshold.",
  retainedFields: [
    "fixture IDs",
    "probabilities",
    "durations",
    "transport status",
    "contract outcome",
    "source hashes"
  ],
  syntheticRepositoryOnly: true
})
console.log(JSON.stringify({ milestone: "bend-paired-designs", declaration }))
if (!process.argv.includes("--execute-paid")) process.exit(2)
await mkdir(join(root, ".test-runs/bend-support"), { recursive: true })
await writeFile(
  join(root, ".test-runs/bend-support/paired-declaration-1.json"),
  JSON.stringify({ declaredAt: new Date().toISOString(), declaration }, null, 2) + "\n",
  { flag: "wx" }
)
let key = process.env.TYPESAFE_API_KEY
if (!key) {
  const worktrees = execFileSync("git", ["-C", root, "worktree", "list", "--porcelain"], { encoding: "utf8" })
  const primary = worktrees
    .split("\n\n")
    .find((e) => /branch refs\/heads\/(?:main|master)(?:\n|$)/.test(e))
    ?.match(/^worktree (.+)$/m)?.[1]
  for (const path of [root, primary].filter(Boolean)) {
    const text = await readFile(join(path, ".env"), "utf8").catch(() => "")
    key = text.match(/^\s*(?:export\s+)?TYPESAFE_API_KEY\s*=\s*(.*?)\s*$/m)?.[1]?.replace(/^(['"])(.*)\1$/, "$2")
    if (key) break
  }
}
if (!key) throw new Error("Jev credential unavailable")
process.env.TYPESAFE_API_KEY = key
let providerRequests = 0
const transport = []
const originalFetch = globalThis.fetch
globalThis.fetch = async (...args) => {
  const url = String(args[0]?.url ?? args[0])
  if (!url.includes("/v1/systemone")) return originalFetch(...args)
  if (providerRequests >= declaration.maximumProviderRequests) throw new Error("Provider budget exhausted")
  providerRequests++
  const at = performance.now()
  try {
    const response = await originalFetch(...args)
    transport.push({ status: response.status, durationMs: Math.round(performance.now() - at) })
    return response
  } catch {
    transport.push({ status: null, durationMs: Math.round(performance.now() - at) })
    throw new Error("Provider transport failed")
  }
}
const outcomes = []
let harnessFailure = false
try {
  for (const fixture of fixtures) {
    if (Buffer.byteLength(fixture.source) > declaration.maximumFixtureFileBytes)
      throw new Error("Fixture exceeds byte bound")
    const analyzed = analyzeNamedUnit("payment.bend", fixture.source, "PaymentState")
    const graph = inspectGraphFile("payment.bend", fixture.source)
    // Named analyzer units omit paths; production graph inspection supplies their path-bearing artifacts.
    const attachGraphArtifacts = (node) => ({
      artifact: graph?.declarations.get(node.artifact.name)?.artifact,
      references: node.references.map((ref) =>
        ref.kind === "expanded" ? { ...ref, node: attachGraphArtifacts(ref.node) } : ref
      )
    })
    const unit = analyzed && graph ? { root: attachGraphArtifacts(analyzed.root) } : undefined
    if (!unit) throw new Error("Bend analyzer did not produce fixture unit")
    const candidate = candidateReviewInput({
      contract: "direct-event/type-shape/v1",
      candidateProjection: true,
      completeness: "complete",
      path: "payment.bend",
      declaration: unit.root.artifact,
      unit,
      rules: [],
      interpretation: "probability-strictly-greater-than-threshold"
    })
    const state = candidate === undefined ? undefined : renderCandidateReviewInput(candidate)
    if (!state) throw new Error("Production renderer rejected Bend fixture")
    for (let repeat = 0; repeat < declaration.repeatsPerFixture; repeat++) {
      const at = performance.now()
      const result = await Effect.runPromise(
        Effect.result(
          decide({ state, decisions: { r2_meaningless_combinations: E0.r2_meaningless_combinations } }).pipe(
            Effect.provide(Live),
            Effect.timeout("15 seconds")
          )
        )
      )
      const probability =
        result._tag === "Success" ? result.success.answers.r2_meaningless_combinations.probability : null
      outcomes.push({
        fixtureId: fixture.id,
        repeat: repeat + 1,
        sourceHash: unit.root.artifact.sourceHash,
        durationMs: Math.round(performance.now() - at),
        probability,
        contract:
          probability !== null && Number.isFinite(probability) && probability >= 0 && probability <= 1
            ? "valid"
            : "failed"
      })
    }
  }
} catch {
  harnessFailure = true
} finally {
  globalThis.fetch = originalFetch
}
const passed =
  !harnessFailure &&
  outcomes.length === 6 &&
  outcomes.every(
    (o) =>
      o.contract === "valid" &&
      (o.fixtureId.endsWith("bad") ? o.probability > declaration.threshold : o.probability < declaration.threshold)
  )
const record = {
  schemaVersion: 1,
  recordedAt: new Date().toISOString(),
  declaration,
  providerRequests,
  transport,
  outcomes,
  harnessFailure,
  verdict: passed ? "demonstrated" : "incomplete",
  rawBackendMaterialRetained: false
}
await mkdir(join(root, ".test-runs/bend-support"), { recursive: true })
await writeFile(join(root, ".test-runs/bend-support/paired-designs.json"), JSON.stringify(record, null, 2) + "\n", {
  flag: "wx"
})
console.log(JSON.stringify(record, null, 2))
if (!passed) process.exitCode = 1
