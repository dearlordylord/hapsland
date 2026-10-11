import { readFileSync, readdirSync } from "node:fs"
import { resolve, relative, join, dirname } from "node:path"
import { spawnSync } from "node:child_process"
import { bendProducerEnvironment, bendProducerToolchain } from "./bend-producer.mjs"

const args = process.argv.slice(2)
const declaration = args.find((arg) => arg.startsWith("--environment="))
const suite = args.find((arg) => arg.startsWith("--suite="))?.slice(8)
const files = args.filter((arg) => !arg.startsWith("--"))
const root = resolve(import.meta.dirname, "..")
const sourceOwners = [
  "packages/source-analysis/src/direct-event/graph-resolution",
  "packages/native-observation/src/direct-event/edit-attribution",
  "packages/review-execution/src/direct-event/preparation",
  "packages/resident-runtime/src/resident/review-work/preparation",
  "packages/resident-runtime/src/resident/review-work/composition",
  "packages/resident-runtime/src/resident/review-work/evaluation",
  "packages/resident-runtime/src/resident/state/resolver-custody",
  "packages/agent-flow-bend/preparation-lifecycle",
  "src/resident/preparation"
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
  "preparation-protocol": () => [
    "src/resident/preparation/source-preparation-check.mjs",
    "src/resident/preparation/post-preparation-check.mjs",
    "src/resident/preparation/resident-owner-check.mjs",
    "packages/agent-flow-bend/preparation-lifecycle/canonical-owner-check.mjs"
  ],
  "preparation-consumer": () => [
    "src/resident/preparation/source-preparation-consumer.mjs",
    "src/resident/preparation/resident-preparation-check.mjs",
    "src/resident/preparation/resident-owned-root-check.mjs"
  ]
}
if (
  args.some((arg) => arg.startsWith("--") && arg !== declaration && arg !== `--suite=${suite}`) ||
  (suite ? files.length !== 0 || !Object.hasOwn(suites, suite) : files.length !== 1)
)
  throw new Error(
    "Use run-bend-capability-check.mjs [--environment=producer-environment.json] owner/check.mjs|owner/PROOF.bend|owner/check.py|--suite=preparation-sources|preparation-protocol|preparation-consumer"
  )
const selected = suite ? suites[suite]() : files
if (!selected.length) throw new Error("No authored capability sources selected")
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
let passed = 0
const deadline = Date.now() + (suite === "preparation-consumer" ? 360000 : 600000)
for (const file of selected) {
  if (Date.now() >= deadline) throw new Error("Capability suite deadline expired")
  const path = resolve(root, file)
  const isProof = path.endsWith(".bend")
  const isPython = path.endsWith(".py")
  const syntax = suite === "preparation-sources" && !isProof
  const command = isProof ? "taskset" : isPython ? "python3" : process.execPath
  const options = isProof
    ? ["-c", "10", "bend", path, "--verdict"]
    : syntax && isPython
      ? ["-c", "import ast,sys; ast.parse(open(sys.argv[1]).read(), filename=sys.argv[1])", path]
      : syntax
        ? ["--check", path]
        : [path]
  const result = spawnSync(command, options, {
    cwd: root,
    env,
    stdio: ["inherit", "pipe", "inherit"],
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: Math.min(deadline - Date.now(), isProof || syntax ? 5000 : 120000)
  })
  process.stdout.write(result.stdout ?? "")
  if (result.error) throw new Error(`Capability check failed: ${file}`, { cause: result.error })
  if (result.signal) throw new Error(`Capability check terminated by ${result.signal}: ${file}`)
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
    if (!summaries.some((summary) => summary.passed === true && Number(summary.cases ?? summary.assertions) > 0))
      throw new Error(`Consumer executed no verified cases: ${file}`)
  }
  passed++
}
if (passed === selected.length) console.log(`Passed ${passed}/${selected.length} authored capability files`)
