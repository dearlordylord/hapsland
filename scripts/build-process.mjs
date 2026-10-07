import { spawn } from "node:child_process"
import { buildProcessGroup } from "./build-groups.mjs"
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
// A build lock may be released only after the owned process group has stopped.
export async function runBuildProcess(command, args, { cwd, env, timeout = 300000, stdio = "inherit", onSpawn } = {}) {
  if (!Number.isSafeInteger(timeout) || timeout <= 0) throw new Error("Build process requires a finite deadline")
  if (
    onSpawn !== undefined &&
    (typeof onSpawn !== "function" || ["AsyncFunction", "AsyncGeneratorFunction"].includes(onSpawn.constructor.name))
  )
    throw new Error("Build spawn observer must be a synchronous function")
  if (process.platform === "win32") throw new Error("Unsupported build process ownership profile")
  const environment = env ?? process.env
  const deadline = Date.now() + timeout
  const inherited = process.env.HAPSLAND_BUILD_PROCESS_GROUP
  const group = inherited === "leader" ? buildProcessGroup() : inherited === undefined ? undefined : Number(inherited)
  if (group !== undefined && (!Number.isSafeInteger(group) || group <= 1))
    throw new Error("Invalid inherited build process group")
  const ownsGroup = group === undefined
  const child = spawn(command, args, {
    cwd,
    stdio,
    detached: ownsGroup,
    env: { ...environment, HAPSLAND_BUILD_PROCESS_GROUP: ownsGroup ? "leader" : String(group) }
  })
  let failure
  const alive = () => {
    if (!child.pid) return false
    try {
      process.kill(-child.pid, 0)
      return true
    } catch (error) {
      if (error.code === "ESRCH") return false
      throw error
    }
  }
  const signal = (value) => {
    if (!child.pid) return
    try {
      process.kill(-(group ?? child.pid), value)
    } catch (error) {
      if (error.code !== "ESRCH") failure ??= error
    }
  }
  let escalation
  const stop = (message) => {
    if (failure) return
    failure = message instanceof Error ? message : new Error(message)
    signal("SIGTERM")
    escalation ??= setTimeout(() => signal("SIGKILL"), 1000)
  }
  const output = [],
    diagnostics = []
  let outputBytes = 0
  for (const stream of [child.stdout, child.stderr])
    stream?.on("data", (data) => {
      outputBytes += data.length
      if (outputBytes > 1024 * 1024) stop("Build process output budget exceeded")
      else if (stream === child.stdout) output.push(data)
      else diagnostics.push(data)
    })
  child.stdin?.end()
  const interrupted = () => stop("Build process interrupted")
  process.on("SIGINT", interrupted)
  process.on("SIGTERM", interrupted)
  const timer = setTimeout(() => stop("Build process deadline exceeded"), Math.max(1, deadline - Date.now()))
  try {
    const result = await new Promise((resolve) => {
      child.once("error", (error) => {
        failure ??= error
      })
      child.once("close", (code, exitSignal) => resolve({ code, signal: exitSignal }))
      // Observers receive only the owned live process identity, after close,
      // signal, output and deadline guards are installed. Observer failure uses
      // the same stop-and-drain path as a producer deadline.
      if (child.pid && onSpawn) {
        try {
          const observation = onSpawn({ pid: child.pid, group: group ?? child.pid })
          if (observation !== undefined) {
            if (typeof observation?.then === "function") Promise.resolve(observation).catch(() => {})
            throw new Error("Build spawn observer must return synchronously without a value")
          }
        } catch (error) {
          stop(error)
        }
      }
    })
    // A wrapper can exit while its already-finishing descendants are still
    // being reaped. Join their physical group before allowing publication;
    // this grace consumes the original command deadline and never hides kills.
    if (ownsGroup && !failure && result.code === 0 && alive()) {
      const joinDeadline = Math.min(deadline, Date.now() + 100)
      while (!failure && alive() && Date.now() < joinDeadline) {
        await delay(Math.min(5, Math.max(1, joinDeadline - Date.now())))
      }
      if (!failure && Date.now() >= deadline) stop("Build process deadline exceeded")
    }
    clearTimeout(timer)
    if (ownsGroup && alive()) {
      failure ??= new Error("Build process group outlived its leader")
      signal("SIGTERM")
      await delay(100)
      if (alive()) signal("SIGKILL")
      for (let attempt = 0; alive() && attempt < 20; attempt++) await delay(50)
      if (alive()) failure.groupUnresolved = true
    }
    if (failure) throw failure
    if (result.code !== 0) throw new Error(`Build process failed (${result.code ?? result.signal}): ${command}`)
    return {
      ...result,
      stdout: Buffer.concat(output).toString("utf8"),
      stderr: Buffer.concat(diagnostics).toString("utf8")
    }
  } finally {
    clearTimeout(timer)
    clearTimeout(escalation)
    process.removeListener("SIGINT", interrupted)
    process.removeListener("SIGTERM", interrupted)
  }
}
