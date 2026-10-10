import { lstat } from "node:fs/promises"
import { dirname, isAbsolute, join, normalize, relative, sep } from "node:path"
import * as Effect from "effect/Effect"
import { parse } from "smol-toml"
import { captureStable, type StableCapture } from "@hapsland/native-observation/direct-event/capture"
import {
  contextDirectFilePolicy,
  eligibleNamedPath,
  selectedByDirectFilePolicy
} from "@hapsland/native-observation/direct-event/selection"
import { observationCaptureBudgetRefusal, observeCaptureDiagnostic } from "../capture-budget.ts"
import type { GraphSession, LanguageAdapter } from "./contracts.ts"

const within = (path: string): boolean => !isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`)
const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
const staticRoot = (source: string): string | undefined => {
  try {
    const data = parse(source)
    const tool = record(data.tool)
    const setuptools = record(tool?.setuptools)
    const mapping = record(setuptools?.["package-dir"])
    // Only one literal package-dir mapping is adopted. Other loader/root authorities are unavailable.
    if (tool?.poetry !== undefined || tool?.hatch !== undefined || tool?.pdm !== undefined) return undefined
    const find = record(record(setuptools?.packages)?.find)
    const where = find?.where
    if (where !== undefined && (!Array.isArray(where) || where.length !== 1 || typeof where[0] !== "string"))
      return undefined
    const discovered = Array.isArray(where) ? normalize(where[0] as string) : undefined
    if (discovered !== undefined && (!within(discovered) || discovered.split(sep).length > 4)) return undefined
    if (mapping === undefined) return discovered ?? "."
    const entries = Object.entries(mapping)
    if (entries.length !== 1 || entries[0]?.[0] !== "" || typeof entries[0]?.[1] !== "string") return undefined
    const path = normalize(entries[0][1])
    return within(path) && path.split(sep).length <= 4 && (discovered === undefined || discovered === path)
      ? path
      : undefined
  } catch {
    return undefined
  }
}

type Remaining = { readonly files: number; readonly readBytes: number; readonly work: number }
type Membership = {
  readonly path: string
  readonly signature: string
  readonly status: Awaited<ReturnType<typeof lstat>> | undefined
}
const signature = (status: Awaited<ReturnType<typeof lstat>> | undefined): string =>
  status === undefined
    ? "absent"
    : [status.mode, status.dev, status.ino, status.size, status.mtimeMs, status.ctimeMs].join(":")

/** Construct one bounded language session; parsing remains owned by the adapter. */
export const createPythonGraphPreparation = (
  inspectPython: LanguageAdapter["inspect"],
  staticPackageAuthority: (source: string) => boolean,
  hasPackageBinding: (source: string, name: string) => boolean
): LanguageAdapter["prepareGraph"] =>
  Effect.fn("Python.prepareGraph")(function* (rootPath, rootCapture, host, limits, expired) {
    if (expired() || limits.files < 1 || limits.work < 1) return undefined
    const captures = host.captureCache ?? new Map<string, StableCapture>()
    captures.set(rootPath, rootCapture)
    const dependencies: string[] = []
    const authority = new Map<string, StableCapture>()
    const failedCaptures = new Set<string>()
    const canonicalCaptures = new Set([rootPath])
    const membership = new Map<string, Membership>()
    let work = 0
    let available = true
    let remaining: Remaining = {
      files: limits.files - 1,
      readBytes: limits.readBytes - rootCapture.byteLength,
      work: limits.work
    }
    const usage = () => ({
      files: authority.size + failedCaptures.size,
      readBytes:
        [...authority.values()].reduce((n, item) => n + item.byteLength, 0) + failedCaptures.size * limits.sourceBytes,
      work
    })
    const permit = (reserveFiles = 0, reserveBytes = 0): boolean => {
      const spent = usage()
      return (
        available &&
        !expired() &&
        spent.files + reserveFiles <= remaining.files &&
        spent.readBytes + reserveBytes <= remaining.readBytes &&
        spent.work <= remaining.work
      )
    }
    const policyFor = (_path: string) => contextDirectFilePolicy(host.policy)
    const observePath = Effect.fn("Python.observeMembership")(function* (path: string, refresh = false) {
      const known = membership.get(path)
      if (known !== undefined && !refresh) return known.status
      if (!within(path) || !permit() || work >= remaining.work) {
        available = false
        return undefined
      }
      work++
      const result = yield* Effect.promise(async () => {
        try {
          return { ok: true, status: await lstat(join(host.root, path)) }
        } catch (error) {
          return { ok: (error as NodeJS.ErrnoException).code === "ENOENT", status: undefined }
        }
      })
      if (!result.ok || result.status?.isSymbolicLink()) available = false
      const current = signature(result.status)
      if (known !== undefined && known.signature !== current) available = false
      membership.set(path, { path, signature: current, status: result.status })
      return result.status
    })
    const stat = Effect.fn("Python.bindingMembership")(function* (path: string) {
      if (!within(path) || !selectedByDirectFilePolicy(path, policyFor(path))) {
        available = false
        return undefined
      }
      // Never follow an ancestor symlink even for negative membership probes.
      const ancestors: string[] = []
      let directory = dirname(path)
      while (directory !== ".") {
        if (ancestors.length > limits.depth + 1) {
          available = false
          return undefined
        }
        ancestors.push(directory)
        directory = dirname(directory)
      }
      for (const ancestor of ancestors.reverse()) {
        const status = yield* observePath(ancestor)
        if (!available) return undefined
        if (status === undefined) return undefined
        if (!status.isDirectory()) {
          available = false
          return undefined
        }
      }
      return yield* observePath(path)
    })
    const readAuthority = Effect.fn("Python.captureAuthority")(function* (path: string) {
      const known = authority.get(path)
      if (known !== undefined) return known
      if (failedCaptures.has(path)) return undefined
      // Every full-file reservation consumes the same source/read/file limits as graph evidence.
      const cached = captures.get(path)
      if (canonicalCaptures.has(path)) return permit() ? cached : undefined
      if (!permit(1, cached?.byteLength ?? limits.sourceBytes)) return undefined
      const selected = yield* eligibleNamedPath(host.root, path, policyFor(path), host.rootIdentity)
      if (selected === undefined) return undefined
      const refusal = observationCaptureBudgetRefusal(captures, path, limits.sourceBytes)
      if (refusal !== undefined) {
        observeCaptureDiagnostic(host, path, refusal)
        return undefined
      }
      let capture = cached
      if (capture === undefined) {
        failedCaptures.add(path)
        const result = yield* (host.captureSource ?? captureStable)(
          host.root,
          selected,
          host.captureHooks,
          host.rootIdentity,
          limits.sourceBytes
        )
        if (result.status === "unavailable") {
          observeCaptureDiagnostic(host, path, result.diagnostic)
          return undefined
        }
        capture = result.capture
        failedCaptures.delete(path)
        captures.set(path, capture)
      }
      if (capture.byteLength > limits.sourceBytes || !permit(1, capture.byteLength)) return undefined
      authority.set(path, capture)
      if (!dependencies.includes(path)) dependencies.push(path)
      return capture
    })
    let roots: readonly string[] | undefined
    let rootsAttempted = false
    const absoluteRoots = Effect.fn("Python.importRoots")(function* () {
      if (rootsAttempted) return roots
      rootsAttempted = true
      // Root metadata is not exempt from includes, exclusions, language policy or Git containment.
      const metadata = "pyproject.toml"
      const status = yield* stat(metadata)
      if (!available) return undefined
      let selectedRoots: readonly string[] = [".", "src"]
      if (status !== undefined) {
        if (!status.isFile()) return undefined
        const capture = yield* readAuthority(metadata)
        const declared = capture === undefined ? undefined : staticRoot(capture.text)
        if (declared === undefined) return undefined
        selectedRoots = [...new Set([".", "src", declared])]
      }
      // setup.py and setup.cfg may establish conflicting/custom roots; no execution or inference.
      for (const alternative of ["setup.py", "setup.cfg"]) {
        const status = yield* stat(alternative)
        if (!available || status !== undefined) return undefined
      }
      roots = selectedRoots
      return roots
    })
    const candidates = Effect.fn("Python.moduleAlternatives")(function* (base: string) {
      if (!within(base)) return undefined
      const found: string[] = []
      for (const tail of [".py", "/__init__.py"]) {
        const source = normalize(base + tail)
        const sourceStatus = yield* stat(source)
        if (!available) return undefined
        // A source implementation governs its own module/package route, even alongside a stub.
        if (sourceStatus !== undefined) {
          if (!sourceStatus.isFile()) return undefined
          found.push(source)
          continue
        }
        const stub = source + "i"
        if (!selectedByDirectFilePolicy(stub, policyFor(stub))) continue
        const stubStatus = yield* stat(stub)
        if (!available) return undefined
        if (stubStatus !== undefined) {
          if (!stubStatus.isFile()) return undefined
          found.push(stub)
        }
      }
      return found
    })
    const packageParents = Effect.fn("Python.packageParents")(function* (path: string, root: string) {
      let directory = dirname(path)
      const directories: string[] = []
      while (directory !== root) {
        if (!within(relative(root, directory)) || directories.length >= limits.depth) return false
        directories.push(directory)
        const parent = dirname(directory)
        if (parent === directory) return false
        directory = parent
      }
      for (const dir of directories.reverse()) {
        const source = join(dir, "__init__.py")
        const sourceStatus = yield* stat(source)
        if (!available) return false
        let selected = source
        if (sourceStatus === undefined) {
          selected += "i"
          const stubStatus = yield* stat(selected)
          if (!available || !stubStatus?.isFile()) return false
        } else if (!sourceStatus.isFile()) return false
        const capture = yield* readAuthority(selected)
        if (capture === undefined || !staticPackageAuthority(capture.text)) return false
      }
      return true
    })
    const moduleTarget = Effect.fn("Python.moduleTarget")(function* (from: string, importPath: string) {
      const match = /^(\.*)([\p{ID_Start}_][\p{ID_Continue}]*(?:\.[\p{ID_Start}_][\p{ID_Continue}]*)*)?$/u.exec(
        importPath
      )
      if (match === null || importPath.length === 0) return undefined
      const dots = match[1]!.length
      const tail = (match[2] ?? "").split(".").filter(Boolean)
      if (tail.length + dots > limits.depth + 1) return undefined
      let relativeRoot = rootPath.startsWith(`src${sep}`) ? "src" : "."
      const choices: Array<{ path: string; root: string }> = []
      if (dots > 0) {
        if (!(yield* packageParents(from, relativeRoot))) {
          const declared = yield* absoluteRoots()
          const alternatives = declared?.filter((root) => root !== "." && within(relative(root, from))) ?? []
          if (alternatives.length !== 1 || !(yield* packageParents(from, alternatives[0]!))) return undefined
          relativeRoot = alternatives[0]!
        }
        let directory = dirname(from)
        for (let level = 1; level < dots; level++) directory = dirname(directory)
        if (!within(relative(relativeRoot, directory)) || directory === relativeRoot) return undefined
        const base = tail.length === 0 ? directory : join(directory, ...tail)
        const found =
          tail.length === 0 ? [join(base, "__init__.py"), join(base, "__init__.pyi")] : yield* candidates(base)
        if (tail.length === 0) {
          const source = yield* stat(found![0]!)
          if (!available) return undefined
          if (source?.isFile()) choices.push({ path: found![0]!, root: relativeRoot })
          else {
            const stub = yield* stat(found![1]!)
            if (stub?.isFile()) choices.push({ path: found![1]!, root: relativeRoot })
          }
        } else for (const path of found ?? []) choices.push({ path, root: relativeRoot })
      } else {
        const declared = yield* absoluteRoots()
        if (declared === undefined) return undefined
        for (const root of declared) {
          const found = yield* candidates(join(root, ...tail))
          if (found === undefined) return undefined
          for (const path of found) choices.push({ path, root })
        }
      }
      if (!available || choices.length !== 1) return undefined
      const chosen = choices[0]!
      if (!(yield* packageParents(chosen.path, chosen.root))) return undefined
      return chosen.path
    })
    const resolveImport: NonNullable<GraphSession["resolveImport"]> = Effect.fn("Python.resolveImport")(
      function* (from, importPath, name, budget) {
        remaining = budget
        const visited = new Set<string>()
        let owner = from,
          module = importPath,
          member = name
        for (let depth = 0; depth <= limits.depth; depth++) {
          if (!permit()) return undefined
          const target = yield* moduleTarget(owner, module)
          if (target === undefined) return undefined
          const key = `${target}:${member}`
          if (visited.has(key)) return undefined
          visited.add(key)
          // Only initializers are reexport authority. Ordinary modules must own the declaration.
          if (!/__init__\.pyi?$/u.test(target)) return member.includes(".") ? undefined : { path: target, name: member }
          const capture = yield* readAuthority(target)
          if (capture === undefined || !staticPackageAuthority(capture.text)) return undefined
          const file = inspectPython(target, capture.text)
          const [head, ...tail] = member.split(".")
          if (tail.length > 0) {
            const forwarded = file?.imports.get(head!)
            if (forwarded !== undefined) {
              const next = yield* moduleTarget(target, forwarded.path)
              if (next === target && forwarded.name === head) {
                // Explicit `from . import module` authorizes the local submodule fallback.
                module += (module.endsWith(".") ? "" : ".") + head
                member = tail.join(".")
                continue
              }
              owner = target
              module = forwarded.path
              member = [forwarded.name, ...tail].join(".")
              continue
            }
            if (hasPackageBinding(capture.text, head!)) return undefined
            module += (module.endsWith(".") ? "" : ".") + head
            member = tail.join(".")
            continue
          }
          if (file?.declarations.has(member)) {
            authority.delete(target) // transfer this capture to canonical supporting-source accounting
            canonicalCaptures.add(target)
            return { path: target, name: member }
          }
          const forwarded = file?.imports.get(member)
          if (forwarded === undefined) return undefined
          owner = target
          module = forwarded.path
          member = forwarded.name
        }
        return undefined
      }
    )
    const validateAuthority: NonNullable<GraphSession["validateAuthority"]> = Effect.fn("Python.revalidateMembership")(
      function* (budget) {
        remaining = budget
        for (const fact of [...membership.values()]) {
          const current = yield* observePath(fact.path, true)
          if (!available || signature(current) !== fact.signature) return false
        }
        return permit()
      }
    )
    return {
      dependencies,
      limits,
      session: {
        inspect: (path, source, branch) => (branch === "type" ? inspectPython(path, source) : undefined),
        importCandidates: () => [],
        resolveImport,
        authorityUsage: usage,
        validateAuthority
      }
    }
  })
