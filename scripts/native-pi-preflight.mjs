import { execFileSync } from "node:child_process"
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  chmodSync,
  existsSync,
  rmSync
} from "node:fs"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { NATIVE_AGENT_PROFILES } from "./native-agent-profiles.mjs"
import { piModelProfile } from "./native-pi-observation.mjs"

const settingsDigest = (settings) => createHash("sha256").update(JSON.stringify(settings)).digest("hex")
export function piPreflightContext(env) {
  if (!env.HAPSLAND_CHECK_CONTEXT) return undefined
  let context
  try {
    context = JSON.parse(env.HAPSLAND_CHECK_CONTEXT)
  } catch {
    throw new Error("Invalid Pi preflight run context")
  }
  if (
    !context ||
    typeof context.id !== "string" ||
    !context.id ||
    !Number.isSafeInteger(context.deadline) ||
    context.deadline <= Date.now()
  )
    throw new Error("Invalid Pi preflight run context")
  return context
}
export function reusablePiPreflight(env, settings, version) {
  if (!env.HAPSLAND_PI_PREFLIGHT) return undefined
  const proof = JSON.parse(env.HAPSLAND_PI_PREFLIGHT),
    context = piPreflightContext(env)
  if (
    !context ||
    proof.runId !== context.id ||
    Date.now() >= context.deadline ||
    proof.settingsDigest !== settingsDigest(settings) ||
    proof.version !== version ||
    proof.provider !== NATIVE_AGENT_PROFILES.pi.provider ||
    proof.model !== NATIVE_AGENT_PROFILES.pi.model ||
    proof.status !== "authenticated"
  )
    throw new Error("Pi preflight receipt does not match the current owned run/profile")
  return proof
}
export function preflightPi({ env = process.env, execute = execFileSync, deadline = Date.now() + 20000 } = {}) {
  if (!Number.isSafeInteger(deadline) || deadline <= Date.now())
    throw new Error("Pi preflight deadline must be finite and in the future")
  const context = piPreflightContext(env)
  deadline = Math.min(deadline, context?.deadline ?? Infinity)
  const remaining = () => {
    const ms = deadline - Date.now()
    if (ms <= 0) throw new Error("Pi preflight deadline exceeded")
    return ms
  }
  const binary = env.HAPSLAND_TEST_PI ?? "/home/node/bin/pi"
  let version
  try {
    version = execute(binary, ["--version"], {
      env,
      encoding: "utf8",
      timeout: Math.min(5000, remaining()),
      killSignal: "SIGKILL",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim()
  } catch {
    throw new Error("Pi preflight could not verify the runtime")
  }
  if (version !== NATIVE_AGENT_PROFILES.pi.version) throw new Error("Pi preflight requires exact Pi 1.0.0")
  const ordinaryHome = env.PI_CODING_AGENT_DIR ?? "/home/node/.pi/agent"
  let settings
  try {
    settings = JSON.parse(readFileSync(join(ordinaryHome, "settings.json"), "utf8"))
  } catch {
    throw new Error("Pi preflight could not read model settings")
  }
  const model = piModelProfile(settings)
  const temp = mkdtempSync(join(tmpdir(), "hapsland-pi-preflight-")),
    started = Date.now()
  try {
    const home = join(temp, "agent")
    mkdirSync(home, { mode: 0o700 })
    for (const name of ["auth.json", "models.json"]) {
      if (!existsSync(join(ordinaryHome, name))) continue
      copyFileSync(join(ordinaryHome, name), join(home, name))
      chmodSync(join(home, name), 0o600)
    }
    writeFileSync(
      join(home, "settings.json"),
      JSON.stringify({ ...settings, extensions: [], packages: [], quietStartup: true }),
      { mode: 0o600 }
    )
    let stream
    try {
      stream = execute(
        binary,
        [
          "--print",
          "--mode",
          "json",
          "--no-session",
          "--provider",
          model.provider,
          "--model",
          model.model,
          "--offline",
          "--no-tools",
          "--no-extensions",
          "--no-context-files",
          "--no-skills",
          "--no-prompt-templates",
          "--thinking",
          "off",
          "Reply with OK only."
        ],
        {
          cwd: temp,
          env: { ...env, PI_CODING_AGENT_DIR: home },
          encoding: "utf8",
          timeout: remaining(),
          killSignal: "SIGKILL",
          maxBuffer: 1048576,
          stdio: ["ignore", "pipe", "pipe"]
        }
      )
    } catch {
      throw new Error("Pi auth/model probe failed or exceeded its deadline")
    }
    let messages
    try {
      messages = stream
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .filter((event) => event.type === "message_end" && event.message?.role === "assistant")
    } catch {
      throw new Error("Pi auth/model probe returned malformed events")
    }
    if (
      !messages.length ||
      messages.some(
        ({ message }) =>
          message.provider !== model.provider ||
          message.model !== model.model ||
          ["error", "aborted"].includes(message.stopReason) ||
          message.errorMessage
      )
    )
      throw new Error("Pi auth/model probe did not confirm the selected profile")
    remaining()
    return {
      status: "authenticated",
      runId: context?.id ?? null,
      ...model,
      version,
      settingsDigest: settingsDigest(settings),
      elapsedMs: Date.now() - started
    }
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(preflightPi()))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
