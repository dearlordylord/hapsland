import { createHash } from "node:crypto"
import {
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from "node:fs"
import { join, resolve } from "node:path"
import { homedir } from "node:os"

const generated = new Set(["dist", "node_modules", ".git", ".test-runs", "coverage"])
const dependencyCaches = new Set([".cache", ".vite", ".vite-temp", ".vitest"])
const digest = (value) => createHash("sha256").update(value).digest("hex")
export const devCacheDirectory = (root, environment = process.env) =>
  join(environment.XDG_CACHE_HOME || join(homedir(), ".cache"), "hapsland", "dev-install", digest(resolve(root)))

/** Build owners and shipped files only. Dependency metadata includes edits and reinstalls. */
export function devBuildIdentity(root, toolchain, observeInputs) {
  const hash = createHash("sha256").update(JSON.stringify(toolchain))
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  const paths = new Map()
  const generatedNative = `native/prebuilt/${toolchain.profile}`
  const walk = (path, metadataOnly = false) => {
    if (path === generatedNative || path.startsWith(`${generatedNative}/`)) return
    let stat
    try {
      stat = lstatSync(join(root, path), { bigint: true })
    } catch (error) {
      if (error.code !== "ENOENT") throw error
      paths.set(path, "missing")
      return
    }
    if (stat.isSymbolicLink()) {
      paths.set(path, `link:${readlinkSync(join(root, path))}`)
      // Dependency symlinks can point at editable workspace packages.
      walkResolved(join(root, path), `${path}/target`, new Set(), metadataOnly)
    } else if (stat.isDirectory()) {
      for (const name of readdirSync(join(root, path)).sort()) {
        if (!metadataOnly || !dependencyCaches.has(name)) walk(`${path}/${name}`, metadataOnly)
      }
    } else if (stat.isFile()) {
      paths.set(
        path,
        metadataOnly
          ? `${stat.mode}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`
          : `${stat.mode}:${digest(readFileSync(join(root, path)))}`
      )
    }
  }
  const visitedDependencies = new Set()
  const walkResolved = (absolute, label, ancestors, metadataOnly = true) => {
    // Resolve directory symlinks with cycle detection rather than ignoring their contents.
    const actual = resolve(absolute)
    if (ancestors.has(actual)) {
      paths.set(`${label}/cycle`, "cycle")
      return
    }
    const next = new Set(ancestors).add(actual)
    let stat
    try {
      stat = lstatSync(actual, { bigint: true })
    } catch (error) {
      if (error.code !== "ENOENT") throw error
      paths.set(`${label}/target`, "missing")
      return
    }
    if (stat.isSymbolicLink())
      return walkResolved(resolve(actual, "..", readlinkSync(actual)), label, next, metadataOnly)
    if (stat.isDirectory()) {
      const physical = realpathSync(actual)
      if (metadataOnly && visitedDependencies.has(physical)) {
        paths.set(`${label}/reference`, physical)
        return
      }
      if (metadataOnly) visitedDependencies.add(physical)
      for (const name of readdirSync(actual).sort()) {
        if (!metadataOnly || !dependencyCaches.has(name))
          walkResolved(join(actual, name), `${label}/${name}`, next, metadataOnly)
      }
    } else if (stat.isFile())
      paths.set(
        label,
        metadataOnly
          ? `${stat.mode}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`
          : `${stat.mode}:${digest(readFileSync(actual))}`
      )
  }
  const sourceWalk = (path) => {
    const stat = lstatSync(join(root, path))
    if (stat.isDirectory()) {
      for (const name of readdirSync(join(root, path)).sort()) {
        if (!generated.has(name) && name !== "test-support" && name !== "conformance") sourceWalk(`${path}/${name}`)
      }
    } else if (!/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path) && !path.endsWith(".md")) walk(path)
  }
  for (const path of ["src", "native", "packages/agent-flow-bend", "packages/agent-flow-viz/src"]) sourceWalk(path)
  for (const path of [
    "verify-bend-artifacts.mjs",
    "check-canonical-authority.mjs",
    "check-production-authority.mjs",
    "clean-dist.mjs",
    "copy-bend-policy.mjs",
    "build-capture-helper.mjs",
    "native-artifact.mjs",
    "build-standalone.mjs",
    "compile-standalone.mjs",
    "prune-distribution.mjs",
    "verify-native-release.mjs"
  ])
    walk(`scripts/${path}`)
  for (const path of [
    "package.json",
    "package-runtime.json",
    "bun.lock",
    "package-lock.json",
    "tsconfig.json",
    "tsconfig.build.json"
  ])
    walk(path)
  for (const path of manifest.files ?? []) {
    const prefix = path.split(/[?*[]/, 1)[0].replace(/\/$/, "")
    if (!generated.has(prefix.split("/")[0])) walk(prefix)
  }
  walk("node_modules", true)
  observeInputs?.(new Map(paths))
  for (const [path, value] of [...paths].sort(([a], [b]) => a.localeCompare(b))) hash.update(`${path}\0${value}\0`)
  return hash.digest("hex")
}

export function readDevCandidate(directory, identity) {
  try {
    const record = JSON.parse(readFileSync(join(directory, "candidate.json"), "utf8"))
    if (
      record === null ||
      typeof record !== "object" ||
      record.identity !== identity ||
      typeof record.archive !== "string" ||
      typeof record.archiveSha256 !== "string"
    )
      return undefined
    if (digest(readFileSync(record.archive)) !== record.archiveSha256) return undefined
    return record
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return undefined
    throw error
  }
}

export function writeDevCandidate(directory, identity, archive) {
  mkdirSync(directory, { recursive: true })
  const record = { identity, archive, archiveSha256: digest(readFileSync(archive)) }
  const temporary = join(directory, `candidate-${process.pid}.json`)
  writeFileSync(temporary, JSON.stringify(record) + "\n", { mode: 0o600 })
  renameSync(temporary, join(directory, "candidate.json"))
}

/** Serialize shared dist assembly; release before interactive setup. */
export async function withDevInstallLock(directory, work) {
  mkdirSync(directory, { recursive: true })
  const lock = join(directory, "build.lock")
  try {
    writeFileSync(lock, String(process.pid), { flag: "wx", mode: 0o600 })
  } catch (error) {
    if (error.code !== "EEXIST") throw error
    const owner = Number(readFileSync(lock, "utf8"))
    if (!Number.isSafeInteger(owner) || owner <= 0) throw new Error(`Cannot identify dev-install lock owner: ${lock}`)
    try {
      process.kill(owner, 0)
    } catch (probe) {
      if (probe.code !== "ESRCH") throw probe
      unlinkSync(lock)
      return withDevInstallLock(directory, work)
    }
    throw new Error(`Another dev-install is running (PID ${owner}); retry when it finishes`)
  }
  try {
    return await work()
  } finally {
    unlinkSync(lock)
  }
}
