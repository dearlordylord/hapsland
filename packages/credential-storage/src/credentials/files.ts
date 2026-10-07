import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs"
import { dirname, isAbsolute, parse, resolve } from "node:path"
import { parseEnv } from "node:util"
import type { SavePlan } from "@hapsland/runtime-inputs/credentials/policy"

export type FileObservation = {
  identity: string
  parents: ReadonlyArray<{ path: string; identity: string }>
  content?: string
}
const absent = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
const identity = (stats: import("node:fs").Stats) =>
  [stats.dev, stats.ino, stats.size, stats.mtimeMs, stats.ctimeMs, stats.mode, stats.uid, stats.nlink].join(":")
const ancestors = (file: string) => {
  if (!isAbsolute(file) || file.includes("\0")) throw new Error("Credential target must be absolute")
  let current = dirname(file)
  const paths: string[] = []
  while (current !== parse(current).root) {
    paths.unshift(current)
    current = dirname(current)
  }
  return paths
}
const validateParents = (file: string) => {
  for (const path of ancestors(file)) {
    let stats
    try {
      stats = lstatSync(path)
    } catch (error) {
      if (absent(error)) continue
      throw error
    }
    if (!stats.isDirectory() || stats.isSymbolicLink() || ((stats.mode & 0o022) !== 0 && (stats.mode & 0o1000) === 0))
      throw new Error("Credential parent is unsafe or symlinked")
  }
}
const parentObservations = (file: string) =>
  ancestors(file).flatMap((path) => {
    try {
      const stat = lstatSync(path)
      return [{ path, identity: [stat.dev, stat.ino, stat.uid, stat.mode].join(":") }]
    } catch (error) {
      if (absent(error)) return []
      throw error
    }
  })
const parentChanged = (before: FileObservation, after: FileObservation) =>
  before.parents.some(
    (parent) => !after.parents.some((current) => current.path === parent.path && current.identity === parent.identity)
  )
const validateGit = (plan: SavePlan, root: string | undefined) => {
  if (plan.destination !== "project-local") return
  if (root === undefined || resolve(root, ".env.local") !== plan.target)
    throw new Error("Project target is outside the reviewed repository")
  const git = (args: string[]) =>
    execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      timeout: 2_000,
      stdio: ["ignore", "pipe", "ignore"]
    })
  if (git(["ls-files", "--", ".env.local"]).length !== 0)
    throw new Error(".env.local is tracked; untrack it and Git-ignore it before reviewing a fresh proposal")
  try {
    git(["check-ignore", "-q", "--", ".env.local"])
  } catch {
    throw new Error(".env.local is not Git-ignored; add it to your ignore rules and review a fresh proposal")
  }
}
export const observeFileTarget = (plan: SavePlan, root?: string): FileObservation => {
  validateParents(plan.target)
  validateGit(plan, root)
  const parents = parentObservations(plan.target)
  let stats
  try {
    stats = lstatSync(plan.target)
  } catch (error) {
    if (absent(error)) return { identity: "absent", parents }
    throw error
  }
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.nlink !== 1 ||
    stats.uid !== process.getuid?.() ||
    (stats.mode & 0o077) !== 0 ||
    stats.size > 65_536
  )
    throw new Error("Credential file must be an owner-only bounded regular file without links")
  const fd = openSync(plan.target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    if (identity(fstatSync(fd)) !== identity(stats)) throw new Error("Credential target changed")
    const buffer = Buffer.alloc(65_537)
    let length = 0
    for (;;) {
      const read = readSync(fd, buffer, length, buffer.length - length, null)
      length += read
      if (read === 0 || length === buffer.length) break
    }
    const content = buffer.subarray(0, length).toString("utf8")
    if (Buffer.byteLength(content) > 65_536 || identity(fstatSync(fd)) !== identity(stats))
      throw new Error("Credential target changed")
    parseEnv(content)
    return { identity: identity(stats), parents, content }
  } finally {
    closeSync(fd)
  }
}
// Parsed logical entries allow quoted multiline values. Preserve every unrelated
// byte by removing only the selected key's assignments, including continuations.
const replaceEntry = (content: string, envVar: string, value: string): string => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(envVar)) throw new Error("Invalid credential reference")
  const lines = content.match(/[^\n]*\n|[^\n]+$/gu) ?? []
  const kept: string[] = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]*)$/u.exec(line)
    if (!match) {
      kept.push(line)
      continue
    }
    let entry = line
    const first = match[2]!.trimStart()[0]
    if (first === '"' || first === "'" || first === "`") {
      // Node dotenv closes a quoted field at the next matching quote.
      while (entry.slice(entry.indexOf(first) + 1).indexOf(first) < 0 && index + 1 < lines.length)
        entry += lines[++index]
    }
    if (match[1] !== envVar) kept.push(entry)
  }
  // Single quoting preserves literal double quotes/backslashes; choose double
  // quoting for apostrophes. Node dotenv has no quote escaping: reject both.
  if (value.includes("'") && value.includes('"')) throw new Error("Key contains incompatible dotenv quotes")
  const quote = value.includes("'") ? '"' : "'"
  const prefix = kept.join("")
  const result = `${prefix}${prefix.length && !prefix.endsWith("\n") ? "\n" : ""}${envVar}=${quote}${value}${quote}\n`
  if (parseEnv(result)[envVar] !== value || Buffer.byteLength(result) > 65_536)
    throw new Error("Key cannot be represented safely in dotenv")
  return result
}
export const commitFileCredential = (
  plan: SavePlan,
  observed: FileObservation,
  envVar: string,
  value: string,
  root?: string
): "stored" | "stale" | "busy" | "unavailable" => {
  let temporary: string | undefined
  let descriptor: number | undefined
  try {
    const content = replaceEntry(observed.content ?? "", envVar, value)
    const before = observeFileTarget(plan, root)
    if (before.identity !== observed.identity || parentChanged(observed, before)) return "stale"
    for (const parent of ancestors(plan.target)) {
      try {
        mkdirSync(parent, { mode: 0o700 })
      } catch (error) {
        if (!(typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST")) throw error
      }
      validateParents(plan.target)
    }
    const ready = observeFileTarget(plan, root)
    if (ready.identity !== observed.identity || parentChanged(observed, ready)) return "stale"
    temporary = `${plan.target}.${randomUUID()}.tmp`
    descriptor = openSync(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600
    )
    writeFileSync(descriptor, content)
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    const current = observeFileTarget(plan, root)
    if (current.identity !== observed.identity || parentChanged(ready, current)) return "stale"
    renameSync(temporary, plan.target)
    return "stored"
  } catch {
    return "unavailable"
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor)
      } catch {
        /* preserve outcome */
      }
    }
    if (temporary !== undefined) {
      try {
        rmSync(temporary, { force: true })
      } catch {
        /* preserve outcome */
      }
    }
  }
}
