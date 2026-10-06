import { spawn, execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync, existsSync, realpathSync, mkdtempSync, rmSync, mkdirSync } from "node:fs"
import { connect as netConnect } from "node:net"
import { connectResidentPort } from "../src/resident/port.ts"
import { tmpdir } from "node:os"
import { join, resolve, dirname } from "node:path"

// Offline full-process evidence, not a microbenchmark or platform-support gate.
const declarationPath = resolve(process.argv[2])
const declaration = JSON.parse(readFileSync(declarationPath, "utf8"))
if (
  declaration.version !== 1 ||
  !Number.isInteger(declaration.readySamples) ||
  !Number.isInteger(declaration.coldSamples)
)
  throw new Error("Invalid measurement declaration")
const output = resolve(declaration.output)
mkdirSync(dirname(output), { recursive: true })
const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")
const report = {
  version: 1,
  startedAt: new Date().toISOString(),
  declaration,
  declarationSha256: digest(declarationPath),
  runnerSha256: digest(import.meta.filename),
  platform: process.platform,
  architecture: process.arch,
  node: process.version,
  scope:
    "Offline installed-layout standalone hook processes; no source edits or provider calls. OS cache and scheduler uncontrolled.",
  variants: declaration.variants.map((v) => ({
    ...v,
    cliSha256: digest(join(v.root, "dist/bin", `${process.platform}-${process.arch}`, "hapsland")),
    residentSha256: digest(join(v.root, "dist/bin", `${process.platform}-${process.arch}`, "hapsland-resident"))
  })),
  samples: [],
  cleanup: [],
  status: "running"
}
const persist = () => writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const deadline = Date.now() + declaration.timeoutMs
const fixture = (variant) => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-port-measure-"))
  execFileSync("git", ["init", "--quiet", root], { timeout: 5000 })
  const bin = join(resolve(variant.root), "dist/bin", `${process.platform}-${process.arch}`)
  const directory = join(root, "runtime")
  return {
    variant,
    root,
    directory,
    cli: join(bin, "hapsland"),
    resident: join(bin, "hapsland-resident"),
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) => !/^(REVIEW_|HAPSLAND_|NODE_OPTIONS|NODE_V8_COVERAGE|TYPESAFE_API_KEY|JEV_API_KEY)/.test(key)
        )
      ),
      REVIEW_RESIDENT_DIR: directory,
      REVIEW_STATE_PATH: join(root, "state"),
      REVIEW_ACTIVITY_PATH: join(root, "activity"),
      REVIEW_USER_CONFIG_PATH: join(root, "user.json")
    }
  }
}
const request = (f, operation) =>
  new Promise((done, reject) => {
    const owner = JSON.parse(readFileSync(join(f.directory, "owner.json"), "utf8"))
    const endpoint =
      f.variant.transport === "unix" ? undefined : JSON.parse(readFileSync(join(f.directory, "endpoint.json"), "utf8"))
    const send = (connection) =>
      connection.write(
        `${JSON.stringify({ version: 1, operation, ...(operation === "hello" ? {} : { lifetime: owner.lifetime }) })}\n`
      )
    const socket = endpoint
      ? connectResidentPort(endpoint, (connection) => {
          connection.on("data", receive)
          send(connection)
        })
      : netConnect(join(f.directory, "resident.sock"))
    let encoded = ""
    socket.setTimeout(1000, () => socket.destroy(new Error("deadline")))
    socket.once("error", reject)
    socket.once("close", () => reject(new Error("closed")))
    if (!endpoint) socket.once("connect", () => send(socket))
    function receive(chunk) {
      encoded += chunk.toString("utf8")
      if (encoded.length > 262144) return socket.destroy(new Error("oversized"))
      if (!encoded.includes("\n")) return
      socket.destroy()
      try {
        done(JSON.parse(encoded.slice(0, encoded.indexOf("\n"))))
      } catch {
        reject(new Error("invalid"))
      }
    }
    if (!endpoint) socket.on("data", receive)
  })
const ready = async (f) => {
  const until = Math.min(deadline, Date.now() + 15000)
  while (Date.now() < until) {
    try {
      if ((await request(f, "hello")).status === "ready") return
    } catch {}
    await sleep(20)
  }
  throw new Error("Resident readiness failed")
}
const owned = (pid, f) => {
  try {
    return (
      realpathSync(`/proc/${pid}/exe`) === realpathSync(f.resident) &&
      readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean).slice(1).join("\0") === f.directory
    )
  } catch {
    return false
  }
}
const cleanup = async (f) => {
  const ownerFile = join(f.directory, "owner.json")
  if (existsSync(ownerFile)) {
    const { pid } = JSON.parse(readFileSync(ownerFile, "utf8"))
    if (!owned(pid, f)) throw new Error("Cleanup refused unproven resident identity")
    process.kill(pid, "SIGTERM")
    const until = Date.now() + 5000
    while (owned(pid, f) && Date.now() < until) await sleep(20)
    if (owned(pid, f)) {
      process.kill(pid, "SIGKILL")
      const killUntil = Date.now() + 2000
      while (owned(pid, f) && Date.now() < killUntil) await sleep(20)
    }
    if (owned(pid, f)) throw new Error("Owned resident survived cleanup")
  }
  report.cleanup.push({ variant: f.variant.name, removed: true })
  rmSync(f.root, { recursive: true, force: true })
  persist()
}
const call = (f, host, index, mode) =>
  new Promise((done, reject) => {
    const id = `${host}-${mode}-${index}`
    const pi = host === "pi"
    const args = pi ? ["--pi-hook"] : ["--composed-before-edit-hook", `--composed-host=${host}`]
    const body = pi
      ? {
          operation: "before",
          cwd: f.root,
          session_id: "port-measure",
          tool_use_id: id,
          host_version: "1.0.0",
          tool_name: "edit"
        }
      : {
          hook_event_name: "PreToolUse",
          cwd: f.root,
          session_id: "port-measure",
          tool_use_id: id,
          tool_name: host === "codex-cli" ? "apply_patch" : "Edit",
          tool_input: {}
        }
    const start = performance.now()
    const child = spawn(f.cli, args, { env: f.env, stdio: ["pipe", "pipe", "pipe"] })
    let outputBytes = 0,
      encoded = "",
      timedOut = false
    const timer = setTimeout(
      () => {
        timedOut = true
        child.kill("SIGKILL")
      },
      Math.min(15000, Math.max(1, deadline - Date.now()))
    )
    child.stdin.on("error", () => {})
    child.stdout.on("data", (chunk) => {
      outputBytes += chunk.length
      encoded += chunk
      if (outputBytes > 262144) child.kill("SIGKILL")
    })
    child.stderr.on("data", () => {}) // Never retain potentially source-bearing errors.
    child.once("error", reject)
    child.once("close", (exitCode) => {
      clearTimeout(timer)
      let responseStatus = pi ? "invalid" : "silent"
      if (pi) {
        try {
          responseStatus = JSON.parse(encoded).status
        } catch {}
      }
      const sample = {
        variant: f.variant.name,
        host,
        mode,
        index,
        elapsedMs: performance.now() - start,
        exitCode,
        timedOut,
        responseStatus
      }
      report.samples.push(sample)
      persist()
      if (exitCode !== 0 || timedOut || (pi && responseStatus !== "registered"))
        reject(new Error("Hook observation failed"))
      else done()
    })
    child.stdin.end(JSON.stringify(body))
  })
persist()
const warm = []
try {
  for (const variant of declaration.variants) {
    const f = fixture(variant)
    warm.push(f)
    const resident = spawn(f.resident, [f.directory], { env: f.env, stdio: "ignore" })
    resident.once("error", () => {})
    await ready(f)
  }
  for (let i = 0; i < declaration.readySamples; i++)
    for (const f of warm)
      for (const host of declaration.hosts) {
        if (Date.now() >= deadline) throw new Error("Measurement deadline")
        await call(f, host, i, "ready-resident")
      }
  for (const f of warm) await cleanup(f)
  warm.length = 0
  for (let i = 0; i < declaration.coldSamples; i++)
    for (const variant of declaration.variants)
      for (const host of declaration.hosts) {
        const f = fixture(variant)
        try {
          await call(f, host, i, "cold-resident")
          await ready(f)
        } finally {
          await cleanup(f)
        }
      }
  report.status = "passed"
} catch (error) {
  report.status = "failed"
  report.failure = error.message
  process.exitCode = 1
} finally {
  for (const f of warm) {
    try {
      await cleanup(f)
    } catch {
      report.cleanup.push({ variant: f.variant.name, removed: false })
      process.exitCode = 1
    }
  }
  report.finishedAt = new Date().toISOString()
  persist()
  console.log(JSON.stringify({ status: report.status, samples: report.samples.length, output }))
}
