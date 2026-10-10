import { createHash } from "node:crypto"
import { basename } from "node:path"

export const GO_OS = [
  "aix",
  "android",
  "darwin",
  "dragonfly",
  "freebsd",
  "hurd",
  "illumos",
  "ios",
  "js",
  "linux",
  "netbsd",
  "openbsd",
  "plan9",
  "solaris",
  "wasip1",
  "windows"
] as const
export const GO_ARCH = [
  "386",
  "amd64",
  "arm",
  "arm64",
  "loong64",
  "mips",
  "mipsle",
  "mips64",
  "mips64le",
  "ppc64",
  "ppc64le",
  "riscv64",
  "s390x",
  "wasm"
] as const
const unix = new Set<string>([
  "aix",
  "android",
  "darwin",
  "dragonfly",
  "freebsd",
  "hurd",
  "illumos",
  "ios",
  "linux",
  "netbsd",
  "openbsd",
  "solaris"
])
const os = new Set<string>(GO_OS)
const arch = new Set<string>(GO_ARCH)
const aliases: Readonly<Record<string, string>> = { android: "linux", illumos: "solaris", ios: "darwin" }
export type GoAnalysisConfiguration = {
  readonly goos: string
  readonly goarch: string
  readonly tags: readonly string[]
}
export type GoBuildSnapshot = GoAnalysisConfiguration & { readonly fingerprint: string }
export type GoMembership = "active" | "inactive" | "unknown"
export const GO_CONSTRAINT_BYTES = 4096
export const GO_CONSTRAINT_TOKENS = 256
export const GO_CONSTRAINT_DEPTH = 32
const reserved = (tag: string): boolean =>
  os.has(tag) ||
  arch.has(tag) ||
  tag === "unix" ||
  ["cgo", "gc", "gccgo"].includes(tag) ||
  /^go1\.|^goexperiment\.|^\w+\./u.test(tag)
export const freezeGoBuildSnapshot = (configuration: GoAnalysisConfiguration): GoBuildSnapshot => {
  if (!os.has(configuration.goos) || !arch.has(configuration.goarch))
    throw new RangeError("Unsupported Go analysis target")
  if (
    configuration.tags.length > 64 ||
    configuration.tags.some((tag) => tag.length > 128 || !/^[A-Za-z0-9_]+$/u.test(tag) || reserved(tag))
  )
    throw new RangeError("Unsupported Go analysis user tag")
  const tags = Object.freeze([...new Set(configuration.tags)].sort())
  const facts = { goos: configuration.goos, goarch: configuration.goarch, tags }
  return Object.freeze({ ...facts, fingerprint: createHash("sha256").update(JSON.stringify(facts)).digest("hex") })
}
const fact = (tag: string, snapshot: GoBuildSnapshot | undefined): boolean | undefined => {
  if (["cgo", "gc", "gccgo"].includes(tag) || tag.includes(".")) return undefined
  if (snapshot === undefined) return undefined
  if (os.has(tag)) return tag === snapshot.goos || tag === aliases[snapshot.goos]
  if (arch.has(tag)) return tag === snapshot.goarch
  if (tag === "unix") return unix.has(snapshot.goos)
  return snapshot.tags.includes(tag)
}
/** Unknown facts taint the entire expression, even a logically dead branch. */
export const evaluateGoBuildExpression = (expression: string, snapshot?: GoBuildSnapshot): GoMembership => {
  if (Buffer.byteLength(expression, "utf8") > GO_CONSTRAINT_BYTES) return "unknown"
  const tokens = expression.match(/&&|\|\||[!()]|[A-Za-z0-9_.]+|\S/gu) ?? []
  if (tokens.length === 0 || tokens.length > GO_CONSTRAINT_TOKENS) return "unknown"
  let index = 0
  let uncertain = false
  const atom = (depth: number): boolean => {
    if (depth > GO_CONSTRAINT_DEPTH) throw new Error("constraint-depth")
    const token = tokens[index++]
    if (token === "!") return !atom(depth + 1)
    if (token === "(") {
      const value = disjunction(depth + 1)
      if (tokens[index++] !== ")") throw new Error("constraint-parenthesis")
      return value
    }
    if (token === undefined || !/^[A-Za-z0-9_.]+$/u.test(token)) throw new Error("constraint-token")
    const value = fact(token, snapshot)
    if (value === undefined) uncertain = true
    return value ?? false
  }
  const conjunction = (depth: number): boolean => {
    let value = atom(depth)
    while (tokens[index] === "&&") {
      index++
      const next = atom(depth)
      value = value && next
    }
    return value
  }
  const disjunction = (depth: number): boolean => {
    let value = conjunction(depth)
    while (tokens[index] === "||") {
      index++
      const next = conjunction(depth)
      value = value || next
    }
    return value
  }
  try {
    const value = disjunction(0)
    return index !== tokens.length || uncertain ? "unknown" : value ? "active" : "inactive"
  } catch {
    return "unknown"
  }
}
export const goFilenameMembership = (path: string, snapshot?: GoBuildSnapshot): GoMembership => {
  const name = basename(path)
  if (!name.endsWith(".go") || /^[._]/u.test(name) || name.endsWith("_test.go")) return "inactive"
  const parts = name.slice(0, -3).split("_")
  // Go requires a non-empty filename prefix before a platform suffix.
  if (parts.length < 2) return "active"
  const last = parts.at(-1)!
  const previous = parts.at(-2)!
  const constraints = arch.has(last)
    ? parts.length >= 3 && os.has(previous)
      ? [previous, last]
      : [last]
    : os.has(last)
      ? [last]
      : []
  if (constraints.length === 0) return "active"
  if (snapshot === undefined) return "unknown"
  return constraints.every((tag) => fact(tag, snapshot) === true) ? "active" : "inactive"
}
/** Only a leading line-comment header is supported; block/legacy headers are unknown. */
export const goFileMembership = (path: string, source: string, snapshot?: GoBuildSnapshot): GoMembership => {
  const filename = goFilenameMembership(path, snapshot)
  if (filename === "inactive") return filename
  const header = source.split(/\r?\n/u)
  const expressions: string[] = []
  let packageSeen = false
  for (const line of header) {
    const trimmed = line.trim()
    if (/^package\s/u.test(trimmed)) {
      packageSeen = true
      break
    }
    if (trimmed === "") continue
    if (!trimmed.startsWith("//")) return "unknown"
    if (/^\/\/\s*\+build\b/u.test(trimmed)) return "unknown"
    const constraint = /^\/\/go:build(?:\s+(.*))?$/u.exec(trimmed)
    if (constraint !== null) expressions.push(constraint[1] ?? "")
  }
  if (!packageSeen || expressions.length > 1) return "unknown"
  if (filename === "unknown") return "unknown"
  return expressions.length === 0 ? "active" : evaluateGoBuildExpression(expressions[0]!, snapshot)
}
