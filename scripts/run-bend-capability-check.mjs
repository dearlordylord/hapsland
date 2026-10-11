import { readFileSync } from "node:fs"
import { resolve, relative } from "node:path"
import { spawnSync } from "node:child_process"
import { bendProducerEnvironment, bendProducerToolchain } from "./bend-producer.mjs"

const args = process.argv.slice(2)
const declaration = args.find((arg) => arg.startsWith("--environment="))
const file = args.find((arg) => !arg.startsWith("--"))
if (!file || args.some((arg) => arg.startsWith("--") && arg !== declaration))
  throw new Error(
    "Use run-bend-capability-check.mjs [--environment=producer-environment.json] owner/check.mjs|owner/PROOF.bend"
  )
const root = resolve(import.meta.dirname, "..")
const path = resolve(root, file)
const local = relative(root, path)
if (local.startsWith("../") || !/^(packages|src|scripts)\//u.test(local) || !/\.(mjs|bend)$/u.test(local))
  throw new Error("The check must be an authored repository source at its capability owner")
const inherited = { ...process.env }
if (declaration) inherited.HAPSLAND_BEND_PRODUCER_ENV = readFileSync(resolve(declaration.slice(14)), "utf8")
const env = bendProducerEnvironment(root, inherited)
Object.assign(process.env, env)
await bendProducerToolchain(root)
const isProof = path.endsWith(".bend")
const command = isProof ? "taskset" : process.execPath
const options = isProof ? ["-c", "10", "bend", path, "--verdict"] : [path]
const result = spawnSync(command, options, { cwd: root, env, stdio: "inherit", timeout: isProof ? 5000 : 120000 })
if (result.error) throw result.error
if (result.signal) throw new Error(`Capability check terminated by ${result.signal}`)
process.exitCode = result.status ?? 1
