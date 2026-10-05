// Throwaway offline witness: observe debug stderr from a freshly installed resident module.
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { promisify } from "node:util"

const exec = promisify(execFile)
const marker = "INSTALLED_DEBUG_SOURCE_MARKER"
const command = async (bin, args, cwd = process.cwd(), env = process.env) =>
  exec(bin, args, { cwd, env, timeout: 120_000, maxBuffer: 1024 * 1024 })

if (process.argv[2] === "child") {
  const installation = process.argv[3]
  const root = process.argv[4]
  if (installation === undefined || root === undefined) throw new Error("missing installed child fixture paths")
  const packageRoot = join(installation, "node_modules", "@hapsland", "hapsland")
  const installed = async (path) => import(pathToFileURL(join(packageRoot, "dist", path)).href)
  const Effect = await import(pathToFileURL(join(installation, "node_modules", "effect", "dist", "Effect.js")).href)
  const Scope = await import(pathToFileURL(join(installation, "node_modules", "effect", "dist", "Scope.js")).href)
  const Exit = await import(pathToFileURL(join(installation, "node_modules", "effect", "dist", "Exit.js")).href)
  const { adaptCodexDirectEvent } = await installed("direct-event/adapter.js")
  const { makeResidentRuntime } = await installed("resident/server.js")
  const { residentPaths } = await installed("resident/paths.js")
  await command("git", ["init", "-q", root])
  await command("git", ["-C", root, "config", "user.email", "test@example.invalid"])
  await command("git", ["-C", root, "config", "user.name", "Test"])
  await writeFile(join(root, "type.ts"), `type OrderCount = number // ${marker}\n`)
  const statePath = join(root, "consent")
  const event = {
    hook_event_name: "PostToolUse",
    tool_name: "apply_patch",
    session_id: "session",
    turn_id: "turn",
    tool_use_id: "tool-use",
    cwd: root,
    tool_input: {
      command: `*** Begin Patch\n*** Add File: type.ts\n+type OrderCount = number // ${marker}\n*** End Patch`
    },
    tool_response: {}
  }
  const observation = await Effect.runPromise(adaptCodexDirectEvent(event))
  if (observation === undefined) throw new Error("installed event adapter returned no observation")
  const fixtureScope = await Effect.runPromise(Scope.make())
  const server = await Effect.runPromise(
    makeResidentRuntime(residentPaths(join(root, "runtime")), undefined, {
      afterPrepare: async () => {
        throw new Error(marker)
      }
    }).pipe(Effect.provideService(Scope.Scope, fixtureScope))
  )
  const admitted = await Effect.runPromise(
    server.admit(observation, {
      statePath,
      userConfigPath: null,
      credential: null,
      controlled: { capturePath: join(root, "called") }
    })
  )
  if (admitted.status !== "accepted") throw new Error(`installed admission was ${admitted.status}`)
  await Effect.runPromise(server.whenIdle())
  await Effect.runPromise(Scope.close(fixtureScope, Exit.void))
} else {
  const temporary = await mkdtemp(join(tmpdir(), "hapsland-security-installed-debug-"))
  try {
    await command("npm", ["pack", "--ignore-scripts=true", "--pack-destination", temporary])
    const archive = join(temporary, "hapsland-hapsland-0.1.0.tgz")
    const archiveHash = createHash("sha256").update(readFileSync(archive)).digest("hex")
    const installation = join(temporary, "installation")
    await command(
      "npm",
      [
        "install",
        "--global=false",
        "--legacy-peer-deps",
        "--ignore-scripts=true",
        "--prefer-offline",
        "--omit=dev",
        "--bin-links=true",
        "--prefix",
        installation,
        archive
      ],
      temporary
    )
    const { stderr } = await command(
      process.execPath,
      [new URL(import.meta.url).pathname, "child", installation, join(temporary, "repository")],
      temporary,
      { ...process.env, REVIEW_RESIDENT_DEBUG: "1" }
    )
    if (stderr.includes(marker) || !stderr.includes("resident preparation unavailable")) {
      throw new Error(
        `installed debug sink mismatch: marker=${stderr.includes(marker)}, category=${stderr.includes("resident preparation unavailable")}`
      )
    }
    console.log(
      JSON.stringify({
        status: "pass",
        archiveSha256: archiveHash,
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        sourceMarkerInStderr: false,
        boundedCategoryInStderr: true
      })
    )
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
