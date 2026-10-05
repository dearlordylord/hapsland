import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const model = "docs/models/sessionInspection.qnt"
const tests = "docs/models/sessionInspection_test.qnt"
const actions = [
  "enable",
  "disable",
  "ingress",
  "prepare",
  "invoke",
  "result",
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
const deadline = Date.now() + 60_000
const execute = (args) =>
  execFileSync("quint", args, {
    cwd: root,
    encoding: "utf8",
    timeout: Math.max(1, Math.min(45_000, deadline - Date.now())),
    maxBuffer: 2 * 1024 * 1024
  })
const version = execute(["--version"]).trim()
execute(["typecheck", model])
const testOutput = execute(["test", tests, "--seed", "226"])
if (!testOutput.includes("13 passing") || testOutput.includes("failed")) throw new Error(testOutput)
const runs = [226, 233, 225].map((seed) => {
  const output = execute([
    "run",
    model,
    "--backend",
    "rust",
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
  return { seed, samples: 1000, maxSteps: 120, witnesses, invariant: "safety", counterexampleObserved: false }
})
for (const action of actions) {
  if (runs.every((run) => run.witnesses[action] === 0)) throw new Error(`Unreached action: ${action}`)
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
  backend: "rust",
  init: "init",
  step: "step",
  bounds: {
    endpoints: 2,
    lifetimesPerEndpoint: 2,
    queueItems: 2,
    retainedItems: 4,
    ageTicks: 3,
    clockTicks: 12,
    consentEpochsPerLifetime: 4,
    editsPerLifetime: 3
  },
  testsPassed: 13,
  runs,
  limitations: [
    "Random sampling, not exhaustive proof",
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
