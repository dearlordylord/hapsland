import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { resolve, relative, join, dirname } from "node:path"
import { tmpdir } from "node:os"
import { spawnSync } from "node:child_process"
import { bendProducerEnvironment, bendProducerToolchain } from "./bend-producer.mjs"

const args = process.argv.slice(2)
const declaration = args.find((arg) => arg.startsWith("--environment="))
const suite = args.find((arg) => arg.startsWith("--suite="))?.slice(8)
const files = args.filter((arg) => !arg.startsWith("--"))
const root = resolve(import.meta.dirname, "..")
const rejectionOwner = "packages/source-analysis/src/direct-event/graph-resolution/attachment"
const proofRejections = new Map(
  Object.entries(JSON.parse(readFileSync(resolve(root, rejectionOwner, "checks/proof-rejections.json"), "utf8"))).map(
    ([file, location]) => [`${rejectionOwner}/${file}`, location]
  )
)
const sourceOwners = [
  "packages/resident-runtime/src/resident/advice-delivery",
  "packages/source-artifacts/src/direct-event/value",
  "packages/source-analysis/src/direct-event/graph-resolution",
  "packages/source-analysis/src/direct-event/local-analysis",
  "packages/source-analysis/src/direct-event/combined-preflight",
  "packages/source-analysis/src/direct-event/analysis-checks",
  "packages/native-observation/src/direct-event/edit-attribution",
  "packages/native-observation/src/direct-event/languages/path-language",
  "packages/review-execution/src/direct-event/preparation",
  "packages/review-execution/src/direct-event/freshness",
  "packages/review-definition/src/rules/finalization",
  "packages/runtime-inputs/src/matcher/glob",
  "packages/runtime-inputs/src/configuration/review-backend",
  "packages/runtime-environment/src/runtime/backend",
  "packages/review-definition/src/review-providers",
  "packages/resident-runtime/src/resident/work-ownership/workspace",
  "packages/resident-runtime/src/resident/review-work/preparation",
  "packages/resident-runtime/src/resident/review-work/composition",
  "packages/resident-runtime/src/resident/review-work/evaluation",
  "packages/resident-runtime/src/resident/state/resolver-custody",
  "packages/agent-flow-bend/preparation-lifecycle",
  "src/direct-event/graph-resolution"
]
const authoredSources = (directory) =>
  readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? authoredSources(join(directory, entry.name))
      : /\.(mjs|bend|py)$/u.test(entry.name)
        ? [join(directory, entry.name)]
        : []
  )
const suites = {
  "preparation-sources": () => {
    const sources = sourceOwners.flatMap(authoredSources).sort()
    const bend = new Set(sources.filter((file) => file.endsWith(".bend")).map((file) => resolve(root, file)))
    const imported = new Set()
    for (const file of bend)
      for (const match of readFileSync(file, "utf8").matchAll(/^import\s+(\S+\.bend)(?:\s+as\s+\S+)?\s*$/gmu)) {
        const dependency = resolve(dirname(file), match[1])
        if (bend.has(dependency)) imported.add(dependency)
      }
    const roots = sources.filter((file) => !file.endsWith(".bend") || !imported.has(resolve(root, file)))
    const visited = new Set()
    const visit = (file) => {
      if (!bend.has(file) || visited.has(file)) return
      visited.add(file)
      for (const match of readFileSync(file, "utf8").matchAll(/^import\s+(\S+\.bend)(?:\s+as\s+\S+)?\s*$/gmu))
        visit(resolve(dirname(file), match[1]))
    }
    for (const file of roots) visit(resolve(root, file))
    const uncovered = [...bend].filter((file) => !visited.has(file))
    if (uncovered.length) throw new Error(`Bend sources without an acyclic checking root: ${uncovered.join(", ")}`)
    console.log(
      `Bend source closure: ${visited.size} files, ${roots.filter((file) => file.endsWith(".bend")).length} roots`
    )
    return roots
  },
  "delivery-protocol": () => [
    "packages/resident-runtime/src/resident/advice-delivery/handoff/verification/root-collection-trace-check.mjs",
    "packages/resident-runtime/src/resident/advice-delivery/handoff/verification/delivery-trace-check.mjs",
    "packages/resident-runtime/src/resident/advice-delivery/handoff/verification/finalize-trace-check.mjs",
    "packages/resident-runtime/src/resident/advice-delivery/handoff/verification/handoff.test.mjs",
    "packages/resident-runtime/src/resident/advice-delivery/handoff/verification/prepare-native.test.mjs",
    "packages/resident-runtime/src/resident/advice-delivery/verification/batch-fitting.test.mjs",
    "packages/resident-runtime/src/resident/advice-delivery/verification/collection.test.mjs",
    "packages/resident-runtime/src/resident/advice-delivery/verification/collection-native.test.mjs"
  ],
  "preparation-protocol": () => [
    "packages/review-execution/src/direct-event/preparation/unit-evidence-query-check.mjs",
    "packages/review-execution/src/direct-event/preparation/canonical-json-plan-validation-check.mjs",
    "packages/review-execution/src/direct-event/preparation/graph-native-group-check.mjs",
    "packages/review-execution/src/direct-event/freshness/lazy-json-check.mjs",
    "packages/review-execution/src/direct-event/freshness/snapshot-check.mjs",
    "packages/review-execution/src/direct-event/freshness/publication-retention-check.mjs",
    "packages/review-execution/src/direct-event/freshness/publication-check.mjs",
    "packages/source-analysis/src/direct-event/graph-resolution/verification/frontend-codec-check.mjs",
    "packages/source-analysis/src/direct-event/graph-resolution/composition/request-projection-check.mjs",
    "packages/resident-runtime/src/resident/review-work/preparation/verification/construction-cleanup.test.mjs",
    "packages/source-artifacts/src/direct-event/value/codec-check.mjs",
    "packages/resident-runtime/src/resident/review-work/preparation/verification/source-preparation-check.mjs",
    "packages/resident-runtime/src/resident/review-work/preparation/verification/post-preparation-check.mjs",
    "packages/resident-runtime/src/resident/review-work/preparation/verification/post-sizing-check.mjs",
    "packages/resident-runtime/src/resident/work-ownership/workspace/verification/workspace-sizing-check.mjs",
    "packages/resident-runtime/src/resident/review-work/preparation/verification/post-enrollment-check.mjs",
    "packages/resident-runtime/src/resident/review-work/preparation/verification/resident-owner-check.mjs",
    "packages/agent-flow-bend/preparation-lifecycle/canonical-owner-check.mjs",
    "packages/agent-flow-bend/preparation-lifecycle/public-preparation-mutation-check.py"
  ],
  "preparation-consumer": () => [
    "packages/review-execution/src/direct-event/freshness/canonical-effect-check.mjs",
    "packages/review-execution/src/direct-event/freshness/canonical-check.mjs",
    "packages/resident-runtime/src/resident/endpoint-lifecycle/verification/cleanup.test.mjs",
    "packages/resident-runtime/src/resident/review-work/preparation/verification/source-preparation-consumer.mjs",
    "packages/resident-runtime/src/resident/review-work/preparation/verification/resident-preparation-check.mjs",
    "packages/resident-runtime/src/resident/review-work/preparation/verification/resident-owned-root-check.mjs",
    "packages/source-analysis/src/direct-event/graph-resolution/composition/verification/artifact-owned-root-check.mjs",
    "packages/source-analysis/src/direct-event/graph-resolution/composition/verification/artifact-composed-root-check.mjs"
  ]
}
if (
  args.some((arg) => arg.startsWith("--") && arg !== declaration && arg !== `--suite=${suite}`) ||
  (suite ? files.length !== 0 || !Object.hasOwn(suites, suite) : files.length !== 1)
)
  throw new Error(
    "Use run-bend-capability-check.mjs [--environment=producer-environment.json] owner/check.mjs|owner/PROOF.bend|owner/check.py|--suite=preparation-sources|preparation-protocol|preparation-consumer|delivery-protocol"
  )
const selected = suite ? suites[suite]() : files
if (!selected.length) throw new Error("No authored capability sources selected")
if (suite === "preparation-sources")
  for (const file of proofRejections.keys())
    if (!selected.includes(file)) throw new Error(`Expected proof rejection is not a checking root: ${file}`)
for (const file of selected) {
  const local = relative(root, resolve(root, file))
  if (local.startsWith("../") || !/^(packages|src|scripts)\//u.test(local) || !/\.(mjs|bend|py)$/u.test(local))
    throw new Error("The check must be an authored repository source at its capability owner")
}
const inherited = { ...process.env }
if (declaration) inherited.HAPSLAND_BEND_PRODUCER_ENV = readFileSync(resolve(declaration.slice(14)), "utf8")
const env = bendProducerEnvironment(root, inherited)
Object.assign(process.env, env)
await bendProducerToolchain(root)
console.log(`Checking ${selected.length} authored capability files${suite ? ` (${suite})` : ""}`)
const runtimeEntries = new Set([
  "packages/source-analysis/src/direct-event/graph-resolution/Runtime.bend",
  "packages/source-analysis/src/direct-event/graph-resolution/runtime-observation/Runtime.bend",
  "packages/source-analysis/src/direct-event/graph-resolution/runtime-observation/Embedding.bend"
])
let passed = 0
const deadline = Date.now() + (suite === "preparation-consumer" ? 360000 : 600000)
for (const file of selected) {
  if (Date.now() >= deadline) throw new Error("Capability suite deadline expired")
  const path = resolve(root, file)
  const isProof = path.endsWith(".bend")
  // Owner-authorized exception, 2026-10-16: complete attachment proof measured
  // at 11.35s. Keep every other proof at its existing ten-second deadline.
  const proofTimeout =
    file === "packages/source-analysis/src/direct-event/graph-resolution/attachment/ATTACHMENT_TRANSACTION_LAWS.bend"
      ? 20000
      : 10000
  const isPython = path.endsWith(".py")
  const syntax = suite === "preparation-sources" && !isProof
  const command = isProof ? "taskset" : isPython ? "python3" : process.execPath
  const runtimeOutput = runtimeEntries.has(file)
    ? mkdtempSync(join(tmpdir(), "hapsland-runtime-source-check-"))
    : undefined
  const options = isProof
    ? ["-c", "10", "bend", path, ...(runtimeOutput ? ["-o", join(runtimeOutput, "runtime.js")] : ["--verdict"])]
    : syntax && isPython
      ? ["-c", "import ast,sys; ast.parse(open(sys.argv[1]).read(), filename=sys.argv[1])", path]
      : syntax
        ? ["--check", path]
        : path.endsWith(".test.mjs")
          ? ["--test", "--test-reporter=tap", path]
          : [path]
  const fixtureConsumer =
    !syntax &&
    [
      "packages/resident-runtime/src/resident/review-work/preparation/verification/source-preparation-consumer.mjs",
      "packages/resident-runtime/src/resident/review-work/preparation/verification/resident-preparation-check.mjs"
    ].includes(file)
  if (fixtureConsumer) {
    options.unshift(
      "--import",
      resolve(
        root,
        "packages/resident-runtime/src/resident/review-work/preparation/verification/compiled-host-loader.mjs"
      )
    )
  }
  let executionEnv = env
  if (file.endsWith("/artifact-owned-root-check.mjs") && !syntax) {
    const fixtures = spawnSync(
      process.execPath,
      [
        resolve(root, "packages/source-analysis/src/direct-event/graph-resolution/verification/fixtures.mjs"),
        "--emit-fixture-facts"
      ],
      { cwd: root, env, encoding: "utf8", timeout: 10000, maxBuffer: 8 * 1024 * 1024 }
    )
    if (fixtures.error || fixtures.signal || fixtures.status !== 0)
      throw new Error("Graph fixture facts preparation failed", { cause: fixtures.error ?? new Error(fixtures.stderr) })
    executionEnv = { ...env, HAPSLAND_GRAPH_FIXTURE_FACTS: fixtures.stdout }
  }
  if (fixtureConsumer) {
    const { bundledRules } = await import("./test-support/default-rules.ts")
    const { advicee } = await import("./test-support/test-fixtures.ts")
    executionEnv = {
      ...env,
      HAPSLAND_PREPARATION_FIXTURES: JSON.stringify({ rules: bundledRules, advicee: advicee() })
    }
  }
  const result = spawnSync(command, options, {
    cwd: root,
    env: executionEnv,
    stdio: ["inherit", "pipe", "pipe"],
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: Math.min(deadline - Date.now(), isProof ? proofTimeout : syntax ? 5000 : 120000)
  })
  if (runtimeOutput) rmSync(runtimeOutput, { recursive: true, force: true })
  process.stdout.write(result.stdout ?? "")
  process.stderr.write(result.stderr ?? "")
  if (result.error) throw new Error(`Capability check failed: ${file}`, { cause: result.error })
  if (result.signal) throw new Error(`Capability check terminated by ${result.signal}: ${file}`)
  const rejectedAt = proofRejections.get(file)
  if (rejectedAt !== undefined) {
    const diagnostic = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
    if (
      result.status !== 1 ||
      !diagnostic.includes("SOME PROOFS FAIL") ||
      !diagnostic.includes("\n- expected :") ||
      !diagnostic.includes("\n- observed :") ||
      !diagnostic.split("\n").includes(`Location: ${rejectedAt}`)
    )
      throw new Error(`Proof mutant did not fail at its expected law location ${rejectedAt}: ${file}`)
    console.log(`Expected proof rejection at ${rejectedAt}: ${file}`)
    passed++
    continue
  }
  if (result.status !== 0) {
    console.error(`Capability check failed: ${file}; ${passed}/${selected.length} passed`)
    process.exitCode = result.status ?? 1
    break
  }
  if (suite && suite !== "preparation-sources") {
    const summaries = result.stdout
      .split("\n")
      .filter((line) => line.startsWith('{"passed":'))
      .map((line) => JSON.parse(line))
    const tests = file.endsWith(".test.mjs") ? Number(result.stdout.match(/^# tests (\d+)$/mu)?.[1] ?? 0) : 0
    const passedTests = Number(result.stdout.match(/^# pass (\d+)$/mu)?.[1] ?? 0)
    if (
      !(tests > 0 && passedTests === tests) &&
      !summaries.some((summary) => summary.passed === true && Number(summary.cases ?? summary.assertions) > 0)
    )
      throw new Error(`Consumer did not report a passing non-empty summary or complete TAP result: ${file}`)
  }
  passed++
}
if (passed === selected.length) console.log(`Passed ${passed}/${selected.length} authored capability files`)
