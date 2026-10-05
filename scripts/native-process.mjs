import { spawn } from "node:child_process"

/** Capture native host output only in memory, with finite time and byte budgets. */
export function executeNative(
  command,
  args,
  { cwd, env = process.env, input, timeout = 240000, maxOutputBytes = 16 * 1024 * 1024, killGraceMs = 500 } = {}
) {
  let inheritedDeadline = Infinity
  if (env.HAPSLAND_CHECK_CONTEXT) {
    const context = JSON.parse(env.HAPSLAND_CHECK_CONTEXT)
    if (!Number.isSafeInteger(context.deadline)) throw new Error("Invalid native process deadline")
    inheritedDeadline = context.deadline
  }
  const duration = Math.min(timeout, inheritedDeadline - Date.now())
  if (
    !Number.isSafeInteger(duration) ||
    duration <= 0 ||
    !Number.isSafeInteger(maxOutputBytes) ||
    maxOutputBytes <= 0 ||
    !Number.isSafeInteger(killGraceMs) ||
    killGraceMs <= 0
  )
    throw new Error("Native process requires finite positive budgets")
  return new Promise((resolve, reject) => {
    const grouped = process.platform !== "win32"
    const child = spawn(command, args, {
      cwd,
      env,
      detached: grouped,
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"]
    })
    const chunks = []
    let stdoutBytes = 0,
      stderrBytes = 0,
      failure,
      escalation
    const signal = (value) => {
      try {
        if (grouped) process.kill(-child.pid, value)
        else child.kill(value)
      } catch (error) {
        if (error.code !== "ESRCH") failure ??= error
      }
    }
    const stop = (message) => {
      if (failure) return
      failure = new Error(message)
      signal("SIGTERM")
      escalation = setTimeout(() => signal("SIGKILL"), killGraceMs)
    }
    const timer = setTimeout(() => stop("Native process deadline exceeded"), duration)
    const interrupted = () => stop("Native process interrupted")
    process.once("SIGTERM", interrupted)
    process.once("SIGINT", interrupted)
    child.stdout.on("data", (data) => {
      stdoutBytes += data.length
      if (stdoutBytes + stderrBytes > maxOutputBytes) stop("Native process output budget exceeded")
      else if (!failure) chunks.push(data)
    })
    child.stderr.on("data", (data) => {
      stderrBytes += data.length
      if (stdoutBytes + stderrBytes > maxOutputBytes) stop("Native process output budget exceeded")
    })
    child.once("error", (error) => {
      failure ??= error
    })
    child.once("close", (code, exitSignal) => {
      process.removeListener("SIGTERM", interrupted)
      process.removeListener("SIGINT", interrupted)
      clearTimeout(timer)
      if (failure) signal("SIGKILL")
      clearTimeout(escalation)
      if (failure) reject(failure)
      else resolve({ code, signal: exitSignal, stdout: Buffer.concat(chunks).toString("utf8"), stderrBytes })
    })
    if (input !== undefined) {
      child.stdin.on("error", (error) => {
        if (error.code !== "EPIPE") stop("Native process input failed")
      })
      child.stdin.end(input)
    }
  })
}
