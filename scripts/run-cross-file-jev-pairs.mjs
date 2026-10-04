// Opt-in synthetic cross-file semantic validation; no raw provider material is retained.
import { execFileSync, spawnSync } from "node:child_process"
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import * as Effect from "effect/Effect"
import { decide, Live } from "../src/jev-decision.ts"
import { configuredRules } from "../src/policy/rules.ts"
import { TYPE_INPUT_CONTRACT } from "../src/rules/targets.ts"
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "../src/runtime/review-config.ts"
import { adaptCodexAdd } from "../src/direct-event/adapter.ts"
import { prepareObservation, preparedProviderInput, preparedUnitStillCurrent } from "../src/direct-event/pipeline.ts"
const root = resolve(new URL("../", import.meta.url).pathname)
const execute = process.argv.includes("--execute-paid")
const prepareOnly = process.argv.includes("--prepare-only")
const runId = process.argv.find((a) => a.startsWith("--run-id="))?.slice(9) ?? "1"
if (!/^[a-zA-Z0-9_-]{1,40}$/.test(runId)) throw new Error("Invalid run ID")
const declaration = Object.freeze({
  fixtureIds: ["rust-cross-file-bad", "rust-cross-file-good", "bend-cross-file-bad", "bend-cross-file-good"],
  repeatsPerFixture: 2,
  maximumProviderRequests: 8,
  deadlineMs: 15000,
  automaticRetries: 0,
  maximumFixtureFileBytes: 4096,
  targetRule: "r2_meaningless_combinations",
  threshold: 0.7,
  acceptance:
    "Every bad probability exceeds threshold and every good probability is below threshold; production preparation captures and freezes supporting-file evidence.",
  syntheticRepositoryOnly: true,
  retainedFields: [
    "fixture IDs",
    "probabilities",
    "transport status",
    "timings",
    "relative capture paths",
    "source hashes",
    "compiler outcomes",
    "freshness outcomes"
  ]
})
console.log(JSON.stringify({ milestone: "cross-file-paired-designs", runId, declaration, prepareOnly }))
if (!execute && !prepareOnly) process.exit(2)
if (execute && prepareOnly) throw new Error("Choose one execution mode")
const evidence = join(root, "evidence/cross-file-support")
if (execute) {
  await mkdir(evidence, { recursive: true })
  await writeFile(
    join(evidence, `declaration-${runId}.json`),
    JSON.stringify({ declaredAt: new Date().toISOString(), runId, declaration }, null, 2) + "\n",
    { flag: "wx" }
  )
}
const rustSupport = "pub enum PaymentStatus { Pending, Succeeded, Failed }\npub struct Receipt { pub value: String }"
const bendSupport =
  "import Base\ntype PaymentStatus is Data:\n  Pending{}\n  Succeeded{}\n  Failed{}\ntype Receipt is Data:\n  Receipt{value: String}\ntype OptionalReceipt is Data:\n  Absent{}\n  Present{value: Receipt}\ntype OptionalString is Data:\n  AbsentText{}\n  PresentText{value: String}"
const fixtures = [
  {
    id: "rust-cross-file-bad",
    language: "rust",
    entry: "src/lib.rs",
    files: {
      "Cargo.toml": '[package]\nname="synthetic_payment"\nversion="0.1.0"\nedition="2021"\n',
      "src/support.rs": rustSupport,
      "src/lib.rs":
        "mod support; use self::support::PaymentStatus; use self::support::Receipt;\npub struct PaymentState { pub status: PaymentStatus, pub receipt: Option<Receipt>, pub failure_reason: Option<String> }"
    }
  },
  {
    id: "rust-cross-file-good",
    language: "rust",
    entry: "src/lib.rs",
    files: {
      "Cargo.toml": '[package]\nname="synthetic_payment"\nversion="0.1.0"\nedition="2021"\n',
      "src/support.rs": rustSupport,
      "src/lib.rs":
        "mod support; use self::support::Receipt;\npub enum PaymentState { Pending, Succeeded { receipt: Receipt }, Failed { failure_reason: String } }"
    }
  },
  {
    id: "bend-cross-file-bad",
    language: "bend",
    entry: "payment.bend",
    files: {
      "support.bend": bendSupport,
      "payment.bend":
        "import Base\nimport ./support.bend as M\ntype PaymentState is Data:\n  PaymentState{status: M.PaymentStatus, receipt: M.OptionalReceipt, failure_reason: M.OptionalString}"
    }
  },
  {
    id: "bend-cross-file-good",
    language: "bend",
    entry: "payment.bend",
    files: {
      "support.bend": bendSupport,
      "payment.bend":
        "import Base\nimport ./support.bend as M\ntype PaymentState is Data:\n  Pending{}\n  Succeeded{receipt: M.Receipt}\n  Failed{failure_reason: String}"
    }
  }
]
let key = process.env.TYPESAFE_API_KEY
if (execute && !key) {
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
if (execute && !key) throw new Error("Jev credential unavailable")
if (execute) process.env.TYPESAFE_API_KEY = key
let providerRequests = 0
const transport = []
const originalFetch = globalThis.fetch
if (execute)
  globalThis.fetch = async (...args) => {
    const url = String(args[0]?.url ?? args[0])
    if (!url.includes("/v1/systemone")) return originalFetch(...args)
    if (providerRequests >= declaration.maximumProviderRequests) throw new Error("Provider budget exhausted")
    providerRequests++
    const started = performance.now()
    try {
      const response = await originalFetch(...args)
      transport.push({ status: response.status, durationMs: Math.round(performance.now() - started) })
      return response
    } catch {
      transport.push({ status: null, durationMs: Math.round(performance.now() - started) })
      throw new Error("Provider transport failed")
    }
  }
const preparations = [],
  outcomes = []
let harnessFailure = false
try {
  for (const fixture of fixtures) {
    const temp = await realpath(await mkdtemp(join(tmpdir(), "cross-file-")))
    try {
      execFileSync("git", ["init", "--quiet", temp])
      for (const [path, source] of Object.entries(fixture.files)) {
        if (Buffer.byteLength(source) > declaration.maximumFixtureFileBytes)
          throw new Error("Fixture exceeds byte bound")
        await mkdir(resolve(temp, path, ".."), { recursive: true })
        await writeFile(join(temp, path), source)
      }
      const source = fixture.files[fixture.entry]
      const event = {
        hook_event_name: "PostToolUse",
        tool_name: "apply_patch",
        session_id: "synthetic-cross-file",
        turn_id: fixture.id,
        tool_use_id: fixture.id,
        cwd: temp,
        tool_input: {
          command: `*** Begin Patch\n*** Add File: ${fixture.entry}\n${source
            .split("\n")
            .map((line) => "+" + line)
            .join("\n")}\n*** End Patch`
        },
        tool_response: { success: true }
      }
      const observation = await Effect.runPromise(adaptCodexAdd(event))
      if (!observation) throw new Error("Fixture adaptation failed")
      const selectedRules = configuredRules.filter((rule) => rule.id === declaration.targetRule)
      if (selectedRules.length !== 1) throw new Error("Target rule unavailable")
      const capturePaths = []
      const context = {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules: selectedRules,
        inputContract: TYPE_INPUT_CONTRACT,
        captureHooks: { sourceRead: (path) => capturePaths.push(path) }
      }
      const prepared = await Effect.runPromise(prepareObservation(observation, context))
      const ready = prepared.outcomes.find(
        (o) => o.status === "ready" && o.prepared.input.declaration.name === "PaymentState"
      )
      if (!ready) throw new Error("Cross-file PaymentState not ready")
      const state = preparedProviderInput(ready.prepared)
      const support = fixture.language === "rust" ? "src/support.rs" : "support.bend"
      const fingerprints = ready.prepared.input.sourceFingerprints ?? []
      const capturesSupport = fingerprints.some((f) => f.path === support) && capturePaths.includes(support)
      const includesSupport = state?.evidence.nodes.some((node) => node.domain === support)
      const frozen = state !== undefined && Object.isFrozen(state) && Object.isFrozen(state.evidence)
      const current = await Effect.runPromise(preparedUnitStillCurrent(observation, ready.prepared, context))
      await writeFile(join(temp, support), fixture.files[support] + "\n")
      const supportingMutationRejected = !(await Effect.runPromise(
        preparedUnitStillCurrent(observation, ready.prepared, context)
      ))
      await writeFile(join(temp, support), fixture.files[support])
      const restoredCurrent = await Effect.runPromise(preparedUnitStillCurrent(observation, ready.prepared, context))
      const compiler = spawnSync(
        fixture.language === "rust" ? "rustc" : "bend",
        fixture.language === "rust"
          ? ["--edition=2021", "--crate-type=lib", fixture.entry, "-o", join(temp, "fixture.rlib")]
          : [fixture.entry, "--check-only"],
        { cwd: temp, encoding: "utf8", timeout: 15000 }
      )
      const compilerOutcome = { available: !compiler.error, accepted: compiler.status === 0 }
      preparations.push({
        fixtureId: fixture.id,
        language: fixture.language,
        rootKind: ready.prepared.input.declaration.kind,
        rootHash: ready.prepared.input.declaration.sourceHash,
        capturePaths: [...new Set(capturePaths)].sort(),
        fingerprints: fingerprints.map((f) => ({ path: f.path, contentHash: f.contentHash, byteLength: f.byteLength })),
        evidencePaths: state?.evidence.nodes.map((n) => n.domain),
        capturesSupport,
        includesSupport,
        frozen,
        current,
        supportingMutationRejected,
        restoredCurrent,
        compiler: compilerOutcome
      })
      if (
        !capturesSupport ||
        !includesSupport ||
        !frozen ||
        !current ||
        !supportingMutationRejected ||
        !restoredCurrent ||
        !compilerOutcome.accepted
      )
        throw new Error("Cross-file preparation contract failed")
      if (execute)
        for (let repeat = 1; repeat <= declaration.repeatsPerFixture; repeat++) {
          if (!(await Effect.runPromise(preparedUnitStillCurrent(observation, ready.prepared, context))))
            throw new Error("Prepared fixture became stale")
          const decisions = Object.fromEntries(ready.prepared.input.rules.map((rule) => [rule.id, rule.decision]))
          const started = performance.now()
          const result = await Effect.runPromise(
            Effect.result(decide({ state, decisions }).pipe(Effect.provide(Live), Effect.timeout("15 seconds")))
          )
          const probability =
            result._tag === "Success" ? result.success.answers[declaration.targetRule].probability : null
          outcomes.push({
            fixtureId: fixture.id,
            repeat,
            rootHash: ready.prepared.input.declaration.sourceHash,
            durationMs: Math.round(performance.now() - started),
            probability,
            contract:
              Number.isFinite(probability) && probability !== null && probability >= 0 && probability <= 1
                ? "valid"
                : "failed"
          })
        }
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  }
} catch {
  harnessFailure = true
} finally {
  globalThis.fetch = originalFetch
}
const passed =
  !harnessFailure &&
  preparations.length === 4 &&
  (!execute ||
    (outcomes.length === 8 &&
      outcomes.every(
        (o) =>
          o.contract === "valid" &&
          (o.fixtureId.endsWith("bad") ? o.probability > declaration.threshold : o.probability < declaration.threshold)
      )))
const record = {
  schemaVersion: 1,
  sourceCommit: execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  platform: process.platform,
  architecture: process.arch,
  recordedAt: new Date().toISOString(),
  runId,
  declaration,
  prepareOnly,
  providerRequests,
  transport,
  preparations,
  outcomes,
  harnessFailure,
  verdict: passed ? "demonstrated" : "incomplete",
  rawBackendMaterialRetained: false
}
if (execute)
  await writeFile(join(evidence, `paired-designs-${runId}.json`), JSON.stringify(record, null, 2) + "\n", {
    flag: "wx"
  })
console.log(JSON.stringify(record, null, 2))
if (!passed) process.exitCode = 1
