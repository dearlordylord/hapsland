import { dirname, isAbsolute, join, normalize, relative, sep } from "node:path"
import type { lstat } from "node:fs/promises"
import * as Effect from "effect/Effect"
import type { GraphLimits } from "@hapsland/canonical-policy/canonical/graph-limits"
import type { StableCapture } from "@hapsland/native-observation/direct-event/capture"
import type { LanguageAdapter } from "../../../languages/contracts.ts"
import type { GraphSession } from "../../verification/native-language-contract.ts"

export const within = (path: string): boolean => !isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`)
type Remaining = Parameters<NonNullable<GraphSession["resolveImport"]>>[3]
type ResolutionPorts = {
  readonly rootPath: string
  readonly limits: Pick<GraphLimits, "depth">
  readonly stat: (path: string) => Effect.Effect<Awaited<ReturnType<typeof lstat>> | undefined>
  readonly readAuthority: (path: string) => Effect.Effect<StableCapture | undefined>
  readonly isSelected: (path: string) => boolean
  readonly isAvailable: () => boolean
  readonly absoluteRoots: () => Effect.Effect<readonly string[] | undefined>
  readonly staticPackageAuthority: (source: string) => boolean
  readonly inspectPython: LanguageAdapter["inspect"]
  readonly hasPackageBinding: (source: string, name: string) => boolean
  readonly permit: () => boolean
  readonly setRemaining: (budget: Remaining) => void
  readonly transferAuthority: (path: string) => void
}

/** One native reference algorithm; the session retains all authority, availability and budget state. */
export const createPythonModuleResolution = (ports: ResolutionPorts) => {
  const {
    rootPath,
    limits,
    stat,
    readAuthority,
    isSelected,
    isAvailable,
    absoluteRoots,
    staticPackageAuthority,
    inspectPython,
    hasPackageBinding,
    permit,
    setRemaining,
    transferAuthority
  } = ports
  const candidates = Effect.fn("Python.moduleAlternatives")(function* (base: string) {
    if (!within(base)) return undefined
    const found: string[] = []
    for (const tail of [".py", "/__init__.py"]) {
      const source = normalize(base + tail)
      const sourceStatus = yield* stat(source)
      if (!isAvailable()) return undefined
      // A source implementation governs its own module/package route, even alongside a stub.
      if (sourceStatus !== undefined) {
        if (!sourceStatus.isFile()) return undefined
        found.push(source)
        continue
      }
      const stub = source + "i"
      if (!isSelected(stub)) continue
      const stubStatus = yield* stat(stub)
      if (!isAvailable()) return undefined
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
      if (!isAvailable()) return false
      let selected = source
      if (sourceStatus === undefined) {
        selected += "i"
        const stubStatus = yield* stat(selected)
        if (!isAvailable() || !stubStatus?.isFile()) return false
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
        if (!isAvailable()) return undefined
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
    if (!isAvailable() || choices.length !== 1) return undefined
    const chosen = choices[0]!
    if (!(yield* packageParents(chosen.path, chosen.root))) return undefined
    return chosen.path
  })
  const resolveImport: NonNullable<GraphSession["resolveImport"]> = Effect.fn("Python.resolveImport")(
    function* (from, importPath, name, budget) {
      setRemaining(budget)
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
            member = [forwarded.name, ...tail].filter(Boolean).join(".")
            continue
          }
          if (hasPackageBinding(capture.text, head!)) return undefined
          module += (module.endsWith(".") ? "" : ".") + head
          member = tail.join(".")
          continue
        }
        if (file?.declarations.has(member)) {
          transferAuthority(target) // transfer this capture to canonical supporting-source accounting
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
  return { candidates, packageParents, moduleTarget, resolveImport }
}
