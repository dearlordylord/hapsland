import { createHash } from "node:crypto"
import { lstat, opendir } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import * as Effect from "effect/Effect"
import { captureStable, type StableCapture } from "@hapsland/native-observation/direct-event/capture"
import { contextDirectFilePolicy, eligibleNamedPath } from "@hapsland/native-observation/direct-event/selection"
import type { GraphLimits } from "@hapsland/canonical-policy/canonical/graph-limits"
import { observationCaptureBudgetRefusal } from "../capture-budget.ts"
import { freezeGoBuildSnapshot, goFileMembership, goFilenameMembership } from "./go-build-context.ts"
import { goGraphFacts, inspectGoFile, type GoFile } from "./go.ts"
import type { GraphFacts, GraphReference, LanguageGraphHost, PreparedGraph } from "./contracts.ts"

export const MAX_GO_DIRECTORY_ENTRIES = 128
const inventory = async (root: string, directory: string): Promise<readonly string[] | undefined> => {
  try {
    let current = root
    for (const part of directory.split("/")) {
      if (part === ".") continue
      current = join(current, part)
      const status = await lstat(current)
      if (!status.isDirectory() || status.isSymbolicLink()) return undefined
    }
    const handle = await opendir(join(root, directory))
    const names: string[] = []
    let count = 0
    for await (const entry of handle) {
      if (++count > MAX_GO_DIRECTORY_ENTRIES) return undefined
      if (entry.name.endsWith(".go") && !/^[._]/u.test(entry.name) && !entry.name.endsWith("_test.go"))
        names.push(join(directory, entry.name))
    }
    return names.sort()
  } catch {
    return undefined
  }
}
/** Static, deliberately narrow module identity. Replacement authority is unsupported. */
export const goModuleName = (source: string): string | undefined => {
  if (/\/\*/u.test(source)) return undefined
  const lines = source
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/u, "").trim())
    .filter(Boolean)
  if (lines.some((line) => /^(?:replace|use|workspace)\b/u.test(line))) return undefined
  const declarations = lines.filter((line) => /^module\b/u.test(line))
  if (declarations.length !== 1) return undefined
  const name = /^module\s+([A-Za-z0-9_~.+/-]+)$/u.exec(declarations[0] ?? "")?.[1]
  return name !== undefined &&
    !name.startsWith("/") &&
    name.split("/").every((part) => part !== "" && part !== "." && part !== "..")
    ? name
    : undefined
}
type Package = {
  readonly files: readonly GoFile[]
  readonly facts: NonNullable<ReturnType<typeof goGraphFacts>>
  readonly name: string
}
const within = (base: string, path: string): boolean => {
  const tail = relative(base, path)
  return tail === "" || (tail !== ".." && !tail.startsWith("../"))
}
const importDirectory = (base: string, module: string, path: string): string | undefined => {
  if (path !== module && !path.startsWith(`${module}/`)) return undefined
  if (path === module) return base
  const tail = path.slice(module.length).replace(/^\//u, "")
  if (
    tail
      .split("/")
      .some((part) => part === "" || part === "." || part === ".." || part === "vendor" || part.includes("\\"))
  )
    return undefined
  return join(base, tail)
}
const internalAllowed = (from: string, target: string): boolean => {
  const parts = target.split("/")
  return parts.every((part, index) => part !== "internal" || within(parts.slice(0, index).join("/") || ".", from))
}

/** Captured module/package authorities share the existing source and graph budgets. */
export const prepareGoGraph = Effect.fn("Go.prepareLocalModule")(function* (
  path: string,
  capture: StableCapture,
  host: LanguageGraphHost,
  limits: GraphLimits,
  expired: () => boolean
): Effect.fn.Return<PreparedGraph | undefined> {
  if (host.branch === "function") return undefined
  const snapshot =
    host.analysisConfiguration?.go === undefined ? undefined : freezeGoBuildSnapshot(host.analysisConfiguration.go)
  const rootDirectory = dirname(path)
  const dependencies = new Set<string>()
  const identities: unknown[] = []
  const captures = new Map<string, StableCapture>([[path, capture]])
  let readBytes = capture.byteLength
  let work = 0
  let filesSpent = 1
  // Reserve one work item for admitting the edited root. Exhausted import
  // discovery must not make an independent reference-free root disappear.
  const chargeWork = () => {
    if (work >= limits.work - 1) return false
    work++
    return true
  }
  const source = Effect.fn("Go.captureAuthority")(function* (candidate: string) {
    if (expired()) return undefined
    const selected = yield* eligibleNamedPath(
      host.root,
      candidate,
      contextDirectFilePolicy(host.policy),
      host.rootIdentity
    )
    if (selected === undefined) {
      identities.push([candidate, "ineligible"])
      return undefined
    }
    let found = captures.get(candidate)
    if (found === undefined) {
      if (filesSpent >= limits.files || readBytes + limits.sourceBytes > limits.readBytes) return undefined
      if (
        host.captureCache !== undefined &&
        observationCaptureBudgetRefusal(host.captureCache, candidate) !== undefined
      )
        return undefined
      found = host.captureCache?.get(candidate)
      if (found === undefined) {
        const result = yield* (host.captureSource ?? captureStable)(
          host.root,
          selected,
          host.captureHooks,
          host.rootIdentity,
          limits.sourceBytes
        )
        if (result.status !== "captured") return undefined
        found = result.capture
        host.captureCache?.set(candidate, found)
      }
      filesSpent++
      readBytes += found.byteLength
      dependencies.add(candidate)
      captures.set(candidate, found)
    }
    if (found.byteLength > limits.sourceBytes || readBytes > limits.readBytes) return undefined
    identities.push([candidate, found.contentHash])
    return found
  })
  // Only names and file kinds are observed before selection. No metadata source
  // read bypasses the context include/exclusion, protected or physical gates.
  const exists = Effect.fn("Go.observeMetadataAlternative")(function* (candidate: string) {
    if (expired() || !chargeWork()) return true
    const state = yield* Effect.promise(() =>
      lstat(join(host.root, candidate))
        .then((stat) => (stat.isFile() ? "file" : "unsafe"))
        .catch((error: unknown) =>
          typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
            ? "absent"
            : "unavailable"
        )
    )
    identities.push([candidate, state])
    return state !== "absent"
  })
  const packages = new Map<string, Package | undefined>()
  const loadPackage = Effect.fn("Go.capturePackage")(function* (directory: string) {
    if (packages.has(directory)) return packages.get(directory)
    packages.set(directory, undefined)
    if (expired() || !chargeWork()) return undefined
    const candidates = yield* Effect.promise(() => inventory(host.root, directory))
    identities.push([directory, candidates ?? "unavailable-inventory"])
    if (candidates === undefined) return undefined
    const possible = candidates.filter((name) => goFilenameMembership(name, snapshot) !== "inactive")
    if (possible.length === 0 || filesSpent + possible.filter((name) => !captures.has(name)).length > limits.files)
      return undefined
    const files: GoFile[] = []
    for (const candidate of possible) {
      const captured = yield* source(candidate)
      if (captured === undefined) return undefined
      const membership = goFileMembership(candidate, captured.text, snapshot)
      if (membership === "unknown" || (candidate === path && membership !== "active")) return undefined
      if (membership !== "active") continue
      const file = inspectGoFile(candidate, captured.text)
      if (file === undefined || file.cgo || /^\/\/ Code generated .* DO NOT EDIT\.$/mu.test(captured.text))
        return undefined
      files.push(file)
    }
    if (files.length === 0 || new Set(files.map((file) => file.packageName)).size !== 1) return undefined
    const facts = goGraphFacts(files, limits.work - 1 - work)
    if (facts === undefined) return undefined
    work += facts.discoveryWork
    const name = files[0]?.packageName
    if (name === undefined) return undefined
    const pkg = { files, facts, name }
    packages.set(directory, pkg)
    return pkg
  })
  const root = yield* loadPackage(rootDirectory)
  if (root === undefined || !captures.has(path)) return undefined
  let moduleBase: string | undefined
  let moduleName: string | undefined
  let directory = rootDirectory
  let workspace = false
  for (let depth = 0; depth <= limits.depth; depth++) {
    workspace = (yield* exists(join(directory, "go.work"))) || workspace
    if (moduleBase === undefined && (yield* exists(join(directory, "go.mod")))) {
      moduleBase = directory
      const metadata = yield* source(join(directory, "go.mod"))
      moduleName = metadata === undefined ? undefined : goModuleName(metadata.text)
    }
    if (directory === ".") break
    directory = dirname(directory)
  }
  if (workspace || directory !== ".") moduleName = undefined
  const pending = [{ directory: rootDirectory, depth: 0 }]
  for (let index = 0; index < pending.length; index++) {
    const task = pending[index]
    if (task === undefined || expired() || !chargeWork()) break
    const pkg = packages.get(task.directory)
    if (pkg === undefined || moduleBase === undefined || moduleName === undefined || task.depth >= limits.depth)
      continue
    for (const file of pkg.files) {
      for (const imported of file.imports) {
        if (imported.name === "_" || imported.name === ".") continue
        if (!chargeWork() || expired()) break
        const target = importDirectory(moduleBase, moduleName, imported.path)
        if (target === undefined || !internalAllowed(task.directory, target) || packages.has(target)) continue
        let ancestor = target
        let nested = false
        for (let depth = 0; ancestor !== moduleBase && depth <= limits.depth; depth++) {
          if (!within(moduleBase, ancestor) || (yield* exists(join(ancestor, "go.mod")))) {
            nested = true
            break
          }
          ancestor = dirname(ancestor)
        }
        if (ancestor !== moduleBase) nested = true
        if (nested) {
          packages.set(target, undefined)
          continue
        }
        const loaded = yield* loadPackage(target)
        if (loaded !== undefined) pending.push({ directory: target, depth: task.depth + 1 })
      }
    }
  }
  // Every declaration uses package-qualified lookup keys. Artifact identities,
  // names and source remain the actual captured declarations.
  const declarations: Map<
    string,
    GraphFacts["declarations"] extends ReadonlyMap<string, infer T> ? T : never
  > = new Map()
  const constantDemands = new Map<string, readonly string[]>()
  const foreignGroups = new Set<string>()
  const key = (directory: string, name: string) => (directory === rootDirectory ? name : `${directory}::${name}`)
  for (const [directory, pkg] of packages) {
    if (pkg === undefined) continue
    const fileBindings = new Map<GoFile, Map<string, (string | undefined)[]>>()
    const bindingsFor = (file: GoFile) => {
      const cached = fileBindings.get(file)
      if (cached !== undefined) return cached
      const bindings = new Map<string, (string | undefined)[]>()
      for (const imported of file.imports) {
        if (imported.name === "_" || imported.name === "." || moduleBase === undefined || moduleName === undefined)
          continue
        const target = importDirectory(moduleBase, moduleName, imported.path)
        const targetPackage = target === undefined ? undefined : packages.get(target)
        const name = imported.name ?? targetPackage?.name
        if (name === undefined) continue
        const eligible =
          target !== undefined &&
          targetPackage !== undefined &&
          internalAllowed(directory, target) &&
          targetPackage.name !== "main"
        bindings.set(name, [...(bindings.get(name) ?? []), eligible ? target : undefined])
      }
      fileBindings.set(file, bindings)
      return bindings
    }
    for (const file of pkg.files) {
      const remap = (reference: GraphReference, origin = file) => {
        const qualified = /^([\p{L}_][\p{L}\p{N}_]*)\.([\p{L}_][\p{L}\p{N}_]*)$/u.exec(reference.name)
        if (reference.kind === "unsupported" && qualified !== null) {
          const qualifier = qualified[1] ?? ""
          const member = qualified[2] ?? ""
          const targets = bindingsFor(origin).get(qualifier)
          const target = targets?.length === 1 ? targets[0] : undefined
          const targetPackage = target === undefined ? undefined : packages.get(target)
          const constant = targetPackage?.files
            .flatMap((item) => item.constants)
            .find((group) => group.names.includes(member))
          const declaration = targetPackage?.facts.declarations.get(constant?.artifact.name ?? member)
          if (
            target !== undefined &&
            (declaration?.exported === true || (constant !== undefined && /^\p{Lu}/u.test(member))) &&
            !pkg.files.some((item) => item.bindings.includes(qualifier))
          )
            return { ...reference, kind: "named" as const, bindingName: key(target, constant?.artifact.name ?? member) }
        }
        return reference.kind === "named" ? { ...reference, bindingName: key(directory, reference.name) } : reference
      }
      for (const group of file.constants) {
        const inferred = pkg.facts.constantTypes.get(group.artifact.name) ?? []
        const groupKey = key(directory, group.artifact.name)
        if (inferred.some(({ name }) => name.includes("."))) foreignGroups.add(groupKey)
        constantDemands.set(
          groupKey,
          inferred.flatMap(({ name, sourcePath }) => {
            const origin = sourcePath === undefined ? file : pkg.files.find((item) => item.path === sourcePath)
            if (origin === undefined) return []
            const reference = remap({ kind: name.includes(".") ? "unsupported" : "named", name }, origin)
            return reference.kind === "named" ? [reference.bindingName ?? reference.name] : []
          })
        )
      }
      for (const declaration of [...file.types, ...file.constants]) {
        const facts = pkg.facts.declarations.get(declaration.artifact.name)
        if (facts !== undefined)
          declarations.set(key(directory, declaration.artifact.name), {
            ...facts,
            references: facts.references.map((reference) => remap(reference))
          })
      }
    }
  }
  // Reverse demands for constants declared with an imported type/constant use
  // established declaration bindings, not spelling or evaluated values.
  for (const groupKey of foreignGroups) {
    const group = declarations.get(groupKey)
    if (group === undefined) continue
    const pending = [...(constantDemands.get(groupKey) ?? [])]
    const visited = new Set<string>()
    for (let index = 0; index < pending.length; index++) {
      const targetKey = pending[index]
      if (targetKey === undefined || visited.has(targetKey)) continue
      visited.add(targetKey)
      const target = declarations.get(targetKey)
      if (target === undefined) continue
      if (!chargeWork() || expired()) return undefined
      if (target.artifact.kind === "constant-group") {
        pending.push(...(constantDemands.get(targetKey) ?? []))
      } else if (!target.references.some((reference) => reference.bindingName === groupKey)) {
        declarations.set(targetKey, {
          ...target,
          references: [...target.references, { kind: "named", name: group.artifact.name, bindingName: groupKey }]
        })
      }
    }
  }
  if (expired()) return undefined
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        host.analysisConfigurationIdentity ?? "unconfigured",
        snapshot?.fingerprint ?? "unconditional",
        identities
      ])
    )
    .digest("hex")
  return {
    dependencies: [...dependencies].sort(),
    bindingFingerprint: fingerprint,
    limits: {
      ...limits,
      files: limits.files - dependencies.size,
      work: Math.max(0, limits.work - work),
      readBytes: limits.readBytes - (readBytes - capture.byteLength)
    },
    session: {
      inspect: (file, _source, branch) =>
        file === path && branch === "type" ? { declarations, imports: new Map() } : undefined,
      importCandidates: () => []
    }
  }
})
