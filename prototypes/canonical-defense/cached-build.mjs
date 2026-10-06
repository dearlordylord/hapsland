import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { accessSync, constants, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { arch, homedir, platform, release } from "node:os"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const digest = value => createHash("sha256").update(value).digest("hex")
const fileDigest = path => digest(readFileSync(path))
const buildEnvironment = ["SDKROOT", "MACOSX_DEPLOYMENT_TARGET", "DEVELOPER_DIR", "CPATH", "C_INCLUDE_PATH", "CPLUS_INCLUDE_PATH", "OBJC_INCLUDE_PATH", "LIBRARY_PATH", "CUDA_HOME", "BEND_DIR"]

function executable(command, environment) {
  const candidates = isAbsolute(command) || command.includes("/")
    ? [resolve(command)]
    : (environment.PATH ?? "").split(":").map(directory => resolve(directory, command))
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK)
      return realpathSync(candidate)
    } catch { /* Try the next PATH entry. */ }
  }
  throw new Error(`Executable not found: ${command}`)
}

function tool(command, args, environment) {
  const path = executable(command, environment)
  const sha256 = fileDigest(path)
  const result = spawnSync(path, args, { env: environment, encoding: "utf8", timeout: 5000 })
  if (result.error || result.status !== 0 || !result.stdout.trim() || fileDigest(path) !== sha256) {
    throw new Error(`Cannot identify ${command}: ${result.error?.message ?? result.stderr}`)
  }
  return { path, sha256, version: result.stdout.trim() }
}

function compiler(environment) {
  // Match Bend's CC / clang / newest clang-NN selection, then pin the selected
  // executable during the build so PATH changes cannot silently change it.
  const numbered = new Set()
  for (const directory of (environment.PATH ?? "").split(":")) {
    try {
      for (const name of readdirSync(directory)) if (/^clang-\d+$/.test(name)) numbered.add(name)
    } catch { /* PATH can contain absent directories. */ }
  }
  const candidates = [environment.BEND_CANONICAL_DEFENSE_CC ?? environment.CC, "clang", ...[...numbered].sort((a, b) => Number(b.slice(6)) - Number(a.slice(6)))].filter(Boolean)
  for (const candidate of candidates) {
    try {
      const found = tool(candidate, ["--version"], environment)
      const version = /^(Apple )?(?:\w+ )?clang version (\d+)/m.exec(found.version)
      if (version && Number(version[2]) >= 14) return found
    } catch { /* Bend also falls back when a CC candidate cannot be used. */ }
  }
  throw new Error("Bend requires clang 14 or newer")
}

function sourceIdentity(prototypeDir, bendDirectory) {
  const files = new Map()
  function visit(path) {
    path = realpathSync(path)
    if (files.has(path)) return
    const contents = readFileSync(path)
    files.set(path, digest(contents))
    if (/\.[ch]$/.test(path)) {
      for (const match of contents.toString().matchAll(/^\s*#\s*(?:include|embed)\s*"([^"]+)"/gm)) {
        visit(resolve(dirname(path), match[1]))
      }
    }
    if (!path.endsWith(".bend")) return
    for (const match of contents.toString().matchAll(/^\s*import\s+(?:"([^"]+)"|([^\s#]+))/gm)) {
      if (match[2] === "Base") continue // The installed runtime tree is hashed below.
      const imported = match[1] ?? match[2]
      if (imported.includes("@") || imported.startsWith("0x")) {
        throw new Error(`Cannot cache unresolved hub import: ${imported}`)
      }
      visit(resolve(dirname(path), imported))
    }
  }
  function runtime(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) runtime(path)
      else visit(path)
    }
  }
  visit(join(prototypeDir, "DefenseMain.bend"))
  for (const name of ["run.sh", "cached-build.mjs", "clang-no-stack-check.sh", "recording-launch.mjs"]) visit(join(prototypeDir, name))
  runtime(bendDirectory)
  return [...files].sort(([a], [b]) => a.localeCompare(b))
}

export function cachedBinary({ prototypeDir, cacheDir, environment = process.env, bendDirectory = join(homedir(), ".bend", "bend2"), host = { platform: platform(), arch: arch(), release: release() }, notice = message => console.error(message) }) {
  const buildEnv = { ...environment, BEND_NO_TELEMETRY: "1" }
  function identity() {
    const bend = tool("bend", ["version"], buildEnv)
    const clang = compiler(buildEnv)
    return {
      host, bend, clang,
      wrapper: environment.BEND_CANONICAL_DEFENSE_CC ? realpathSync(environment.CC) : null,
      environment: Object.fromEntries(buildEnvironment.map(name => [name, environment[name] ?? null])),
      sources: sourceIdentity(prototypeDir, bendDirectory)
    }
  }
  const inputs = identity()
  const key = digest(JSON.stringify(inputs))
  const binary = join(cacheDir, key)
  const receipt = `${binary}.json`
  try {
    const saved = JSON.parse(readFileSync(receipt, "utf8"))
    accessSync(binary, constants.X_OK)
    if (saved.key === key && saved.sha256 === fileDigest(binary)) {
      notice("Canonical defense: using cached build.")
      return { binary, key, reused: true }
    }
  } catch { /* A missing, partial or damaged entry requires a fresh build. */ }
  mkdirSync(cacheDir, { recursive: true })
  const temporary = mkdtempSync(join(cacheDir, ".build-"))
  try {
    const output = join(temporary, "game")
    const env = inputs.wrapper
      ? { ...buildEnv, CC: inputs.wrapper, BEND_CANONICAL_DEFENSE_CC: inputs.clang.path }
      : { ...buildEnv, CC: inputs.clang.path }
    notice("Canonical defense: building (no matching cached binary).")
    const result = spawnSync(inputs.bend.path, ["DefenseMain.bend", "-o", output], { cwd: prototypeDir, env, stdio: ["inherit", 2, 2] })
    if (result.error || result.status !== 0) throw new Error(`Bend build failed: ${result.error?.message ?? result.signal ?? result.status}`)
    accessSync(output, constants.X_OK)
    if (digest(JSON.stringify(identity())) !== key) throw new Error("Build inputs changed during compilation; rerun to build the current sources")
    writeFileSync(join(temporary, "receipt.json"), JSON.stringify({ key, sha256: fileDigest(output), inputs }) + "\n")
    // Both files are published by atomic rename only after a successful build.
    // The digest check rejects any partial pair left by an interrupted publish.
    renameSync(output, binary)
    renameSync(join(temporary, "receipt.json"), receipt)
    return { binary, key, reused: false }
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  const prototypeDir = dirname(fileURLToPath(import.meta.url))
  try {
    const result = cachedBinary({ prototypeDir, cacheDir: resolve(prototypeDir, "../../.tools/canonical-defense") })
    console.log(result.binary)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
