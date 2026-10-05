import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const model = "docs/models/sessionInspection.qnt"
const tests = "docs/models/sessionInspection_test.qnt"
const inputs = new Map([model, tests].map((path) => [path, readFileSync(resolve(root, path), "utf8")]))
const actions = [
  "enable",
  "disable",
  "ingress",
  "prepare",
  "invoke",
  "result",
  "join",
  "cache",
  "settleReuse",
  "ready",
  "authorize",
  "startWrite",
  "written",
  "failOutput",
  "uncertain",
  "acknowledge",
  "commit",
  "failWrite",
  "prune",
  "snapshot",
  "replay",
  "repeat",
  "pause",
  "resume",
  "tick",
  "retire",
  "restart",
  "overflow",
  "reenabled"
]
const deadline = Date.now() + 600_000
const execute = (args) =>
  execFileSync("quint", args, {
    cwd: root,
    encoding: "utf8",
    timeout: Math.max(1, Math.min(180_000, deadline - Date.now())),
    maxBuffer: 2 * 1024 * 1024
  })
const version = execute(["--version"]).trim()
execute(["typecheck", model])
const testOutput = execute(["test", tests, "--seed", "226", "--backend", "typescript"])
const testsPassed = Number(testOutput.match(/(\d+) passing/)?.[1])
const declaredTests = [...inputs.get(tests).matchAll(/\brun\s+\w+Test\s*=/g)].length
if (testsPassed !== declaredTests || testsPassed === 0 || testOutput.includes("failed")) throw new Error(testOutput)
const modelText = inputs.get(model)
const bound = (name) => {
  const match = modelText.match(new RegExp(`pure val ${name} = (\\d+)`))
  if (!match) throw new Error(`Missing literal model bound: ${name}`)
  return Number(match[1])
}
const logDirectory = resolve(root, ".scratch/inspection-model")
mkdirSync(logDirectory, { recursive: true })
const runs = [226, 233, 225].map((seed) => {
  const started = Date.now()
  const output = execute([
    "run",
    model,
    "--backend",
    "typescript",
    "--seed",
    String(seed),
    "--max-samples",
    "1000",
    "--max-steps",
    "120",
    "--invariant",
    "safety",
    "--witnesses",
    ...actions.map((action) => `${action}Witness`),
    "--verbosity",
    "1"
  ])
  if (!output.includes("[ok] No violation found")) throw new Error(output)
  const witnesses = Object.fromEntries(
    actions.map((action) => {
      const match = output.match(
        new RegExp(`${action}Witness was witnessed in (\\d+) trace\\(s\\) out of 1000 explored`)
      )
      if (!match) throw new Error(`Missing witness output: ${action}\n${output}`)
      return [action, Number(match[1])]
    })
  )
  writeFileSync(resolve(logDirectory, `seed-${seed}.log`), output)
  process.stderr.write(
    `Seed ${seed}: 1000 samples, 120 maximum steps, no invariant violation; ${Date.now() - started}ms\n`
  )
  return { seed, samples: 1000, maxSteps: 120, witnesses, invariant: "safety", counterexampleObserved: false }
})
for (const action of actions) {
  if (runs.every((run) => run.witnesses[action] === 0)) throw new Error(`Unreached action: ${action}`)
}
for (const [path, content] of inputs) {
  if (readFileSync(resolve(root, path), "utf8") !== content)
    throw new Error(`Model candidate changed while running: ${path}`)
}
const result = {
  purpose: "Bounded executable design evidence for issue #226; not production validation",
  authority: "Accepted requirements: https://github.com/dearlordylord/hapsland/issues/225",
  sourceHashes: Object.fromEntries(
    [model, tests].map((path) => [
      path,
      createHash("sha256")
        .update(readFileSync(resolve(root, path)))
        .digest("hex")
    ])
  ),
  quintVersion: version,
  backend: "typescript",
  init: "init",
  step: "step",
  bounds: {
    endpoints: bound("ENDPOINTS"),
    lifetimesPerEndpoint: bound("LIFETIMES"),
    queueItems: bound("QUEUE_LIMIT"),
    retainedItems: bound("STORE_LIMIT"),
    ageTicks: bound("AGE"),
    clockTicks: bound("CLOCK_LIMIT"),
    consentEpochsPerLifetime: bound("EPOCH_LIMIT"),
    editsPerLifetime: bound("EDIT_LIMIT")
  },
  testsPassed,
  runs,
  limitations: [
    "Random sampling, not exhaustive proof",
    "One unit per edit and one output attempt per unit; no full fan-out or batch-membership model",
    "Abstract immutable byte tokens",
    "No filesystem access, allocated-byte accounting, HTTP/process or native delivery evidence",
    "No fairness, complete capture, remote receipt, model reading or repair claims"
  ],
  lifecycle: "Regenerate after model changes; replace this evidence in place"
}
if (process.argv.includes("--write-evidence")) {
  const target = resolve(root, "evidence/inspection/model-sampling.json")
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`)
}
console.log(JSON.stringify(result, null, 2))
