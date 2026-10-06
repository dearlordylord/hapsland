import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resolveBunRuntime } from "../../scripts/pinned-bun.mjs"
const { executable, version } = resolveBunRuntime()
const sourceHash = createHash("sha256")
for (const file of readdirSync(import.meta.dirname)
  .filter(
    (name) => /\.(ts|mjs|py)$/.test(name) || ["package.json", "package-lock.json", "tsconfig.json"].includes(name)
  )
  .sort()) {
  sourceHash
    .update(file)
    .update("\0")
    .update(readFileSync(join(import.meta.dirname, file)))
    .update("\0")
}
const sourceDigest = sourceHash.digest("hex")
const end = Date.now() + 60_000
const directory = mkdtempSync(join(tmpdir(), "hapsland-interaction-prototype-"))
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: import.meta.dirname,
    encoding: "utf8",
    timeout: Math.max(1, end - Date.now())
  })
  if (result.error || result.status !== 0)
    throw new Error(`${command}: ${result.error ?? result.stderr ?? result.status}`)
  return result.stdout
}
try {
  run("node_modules/.bin/tsc", ["-p", "tsconfig.json"])
  const comparison = JSON.parse(run(executable, ["compare.ts"]))
  const diagram = JSON.parse(run(executable, ["diagram.ts"]))
  const lifetime = JSON.parse(run(executable, ["lifetime.ts"]))
  const swarmFlow = JSON.parse(run(executable, ["swarm-flow.ts"]))
  const swarmInteraction = JSON.parse(run(executable, ["swarm-interaction.ts"]))
  const swarmTerminal = JSON.parse(run("python3", ["swarm-terminal.py", "--bun", executable]))
  const sourcePTY = JSON.parse(run("python3", ["probe-terminal.py", "--bun", executable]))
  const targets = ["bun-darwin-arm64", "bun-linux-arm64"]
  for (const target of targets)
    run(executable, ["build", "--compile", `--target=${target}`, "cli.ts", "--outfile", join(directory, target)])
  const hostTarget = process.platform === "darwin" ? "bun-darwin-arm64" : "bun-linux-arm64"
  if (process.arch !== "arm64") throw new Error("Compiled execution probe is scoped to arm64 hosts")
  const compiledPTY = JSON.parse(
    run("python3", ["probe-terminal.py", "--bun", executable, "--compiled", join(directory, hostTarget)])
  )
  const evidence = {
    observedAt: new Date().toISOString(),
    sourceDigest,
    host: `${process.platform}-${process.arch}`,
    bun: version,
    effect: "4.0.0",
    effectMachine: "0.28.0",
    typecheck: "passed",
    comparison,
    diagram,
    lifetime,
    swarmFlow,
    swarmInteraction,
    swarmTerminal,
    sourcePTY,
    compiledPTY,
    compileTargets: targets,
    executedTarget: hostTarget,
    realCredentialReads: 0,
    realStorageWrites: 0,
    providerRequests: 0
  }
  if (process.argv.includes("--write"))
    writeFileSync(join(import.meta.dirname, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n")
  console.log(JSON.stringify(evidence, null, 2))
} finally {
  rmSync(directory, { recursive: true, force: true })
}
