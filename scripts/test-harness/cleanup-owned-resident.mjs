import { execFileSync } from "node:child_process"
import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { sharedRuntimeLauncher } from "../shared-runtime-bundle.mjs"

const absent = (error) => error.code === "ENOENT" || error.code === "ESRCH"
const canonical = (path) => realpathSync(path)
const canonicalArgument = (argument) => (argument.startsWith("--") ? argument : canonical(argument))
const processCommand = (command) => {
  if (command.args.length !== 0 || basename(command.executable) !== "hapsland-resident") return command
  if (statSync(command.executable).size > 1024) return command
  if (readFileSync(command.executable, "utf8") !== sharedRuntimeLauncher("hapsland-resident")) return command
  const directory = dirname(canonical(command.executable))
  return {
    executable: join(directory, "hapsland"),
    args: ["--no-install", "--no-env-file", "--config=/dev/null", join(directory, "hapsland-resident.js")]
  }
}
const pause = () => new Promise((resolve) => setTimeout(resolve, 20))
export const observeOwnedResidentProcess = (pid, directory, commands, options = {}) => {
  const platform = options.platform ?? process.platform
  const probe = options.probe ?? (() => process.kill(pid, 0))
  const inspectPs =
    options.inspectPs ??
    (() =>
      execFileSync("ps", ["-ww", "-p", String(pid), "-o", "lstart=", "-o", "command="], {
        encoding: "utf8",
        timeout: 1000
      }))
  try {
    commands = commands.map(processCommand)
    if (platform !== "linux") {
      const output = inspectPs().trim()
      if (!output) return undefined
      const owned = commands.some((command) =>
        output.endsWith(
          `${canonical(command.executable)} ${[...command.args.map(canonicalArgument), canonical(directory)].join(" ")}`
        )
      )
      return { pid, start: output.slice(0, 24), owned }
    }
    const encodedStat = readFileSync(`/proc/${pid}/stat`, "utf8")
    const stat = encodedStat.slice(encodedStat.lastIndexOf(")") + 2).split(" ")
    if (stat[0] === "Z") return undefined
    const executable = canonical(`/proc/${pid}/exe`)
    const args = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean)
    const owned = commands.some((command) => {
      const expected = [command.executable, ...command.args, directory]
      try {
        return (
          executable === canonical(command.executable) &&
          args.length === expected.length &&
          args.every((argument, index) => canonicalArgument(argument) === canonicalArgument(expected[index]))
        )
      } catch {
        return false
      }
    })
    return { pid, start: stat[19], owned }
  } catch (_error) {
    try {
      probe()
    } catch (cause) {
      if (cause.code === "ESRCH") return undefined
    }
    throw new Error(`Unable to establish resident ownership for PID ${pid}`)
  }
}
const candidates = (directory, commands) => {
  const pids = new Set()
  for (const path of [join(directory, "owner.json"), join(directory, "owner.lock/owner.json")]) {
    try {
      const owner = JSON.parse(readFileSync(path, "utf8"))
      if (!Number.isSafeInteger(owner.pid) || owner.pid <= 1 || owner.pid === process.pid)
        throw new Error("Invalid owner PID")
      pids.add(owner.pid)
    } catch (error) {
      if (!absent(error)) throw new Error("Unable to read resident owner during cleanup")
    }
  }
  if (process.platform === "linux")
    for (const entry of readdirSync("/proc")) {
      if (!/^\d+$/u.test(entry)) continue
      try {
        if (readFileSync(`/proc/${entry}/cmdline`, "utf8").split("\0").includes(directory)) pids.add(Number(entry))
      } catch (error) {
        if (!absent(error)) throw new Error("Unable to inspect pending resident during cleanup")
      }
    }
  return [...pids].map((pid) => observeOwnedResidentProcess(pid, directory, commands)).filter(Boolean)
}
const currentIdentity = (identity, directory, commands) => {
  const current = observeOwnedResidentProcess(identity.pid, directory, commands)
  if (!current || current.start !== identity.start) return undefined
  if (!current.owned) throw new Error("Resident ownership changed during cleanup; retaining fixture state")
  return current
}
const waitForDeath = async (identity, directory, commands) => {
  const deadline = performance.now() + 3000
  while (performance.now() < deadline) {
    try {
      if (!currentIdentity(identity, directory, commands)) return true
    } catch {
      /* Exit can clear proc argv/exe before PID disappearance. Never signal without a fresh proof. */
    }
    await pause()
  }
  return false
}
export const cleanupOwnedResident = async (directory, commands) => {
  const identities = candidates(directory, commands)
  if (identities.some((identity) => !identity.owned))
    throw new Error("Unproven resident owner; retaining fixture state")
  for (const identity of identities) {
    for (const signal of ["SIGTERM", "SIGKILL"]) {
      if (!currentIdentity(identity, directory, commands)) break
      try {
        process.kill(identity.pid, signal)
      } catch (error) {
        if (!absent(error)) throw error
      }
      if (await waitForDeath(identity, directory, commands)) break
      if (signal === "SIGKILL") throw new Error("Resident failed to terminate; retaining fixture state")
    }
  }
}
