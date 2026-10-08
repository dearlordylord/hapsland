import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"))
const inside = (root, path) => !relative(root, path).startsWith("..")

/** Default catalog entries own exact shared external dependency versions. */
export const resolveDeclaredDependencyVersion = (release, name, declaration) => {
  if (typeof declaration !== "string") throw new Error(`Invalid dependency declaration: ${name}`)
  if (!declaration.startsWith("catalog:")) return declaration
  if (declaration !== "catalog:") throw new Error(`Unsupported dependency catalog: ${name}: ${declaration}`)
  const catalog = release.catalog
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog) || !Object.hasOwn(catalog, name))
    throw new Error(`Unknown catalog dependency: ${name}`)
  const version = catalog[name]
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version))
    throw new Error(`Catalog dependency must use an exact version: ${name}`)
  if ((name === "effect" || name.startsWith("@effect/")) && version !== catalog.effect)
    throw new Error(`Effect catalog cohort must match effect exactly: ${name}`)
  return version
}

/** Workspace manifests own dependency edges; generated configurations are projections. */
export const readPackageGraph = (root) => {
  const release = readJson(resolve(root, "package.json"))
  if (!Array.isArray(release.workspaces) || release.workspaces.length === 0)
    throw new Error("Release manifest must list explicit build workspaces")
  if (release.catalog !== undefined) {
    if (!release.catalog || typeof release.catalog !== "object" || Array.isArray(release.catalog))
      throw new Error("Release catalog must be an exact dependency map")
    for (const name of Object.keys(release.catalog)) resolveDeclaredDependencyVersion(release, name, "catalog:")
  }
  const workspaces = new Map()
  const packages = new Map()
  const auxiliaryWorkspaces = new Map()
  const directories = new Set()
  for (const directory of release.workspaces) {
    if (
      typeof directory !== "string" ||
      !(/^(packages|prototypes)\/[a-z0-9-]+$/.test(directory) || ["scripts", "src"].includes(directory))
    )
      throw new Error(`Unsupported workspace declaration: ${directory}`)
    if (directories.has(directory)) throw new Error(`Duplicate workspace directory: ${directory}`)
    directories.add(directory)
    const path = resolve(root, directory)
    if (!inside(root, path)) throw new Error(`Workspace escapes release: ${directory}`)
    const manifest = readJson(resolve(path, "package.json"))
    if (!manifest.private || manifest.type !== "module" || typeof manifest.name !== "string")
      throw new Error(`Build workspace must be a named private ES module: ${directory}`)
    const role = manifest.hapsland?.workspaceRole ?? "production"
    if (!["production", "tooling", "verification"].includes(role))
      throw new Error(`Unsupported workspace role: ${directory}: ${role}`)
    if (
      (directory === "scripts" && role !== "tooling") ||
      (directory === "src" && role !== "verification") ||
      (directory.startsWith("packages/") && !["production", "verification"].includes(role)) ||
      (directory.startsWith("prototypes/") && role !== "verification")
    )
      throw new Error(`Workspace role does not match physical boundary: ${directory}: ${role}`)
    const compiler = manifest.hapsland?.compiler ?? "typescript"
    if (!["typescript", "bend"].includes(compiler) || (compiler === "bend" && role !== "production"))
      throw new Error(`Unsupported workspace compiler: ${manifest.name}: ${compiler}`)
    if (workspaces.has(manifest.name)) throw new Error(`Duplicate workspace name: ${manifest.name}`)
    for (const [key, conditions] of Object.entries(manifest.exports ?? {})) {
      if (!(key === "." || /^\.\/[a-zA-Z0-9_./-]+$/.test(key)) || key.includes(".."))
        throw new Error(`Unsupported workspace export key: ${manifest.name}: ${key}`)
      if (role !== "production") {
        const target = typeof conditions === "string" ? conditions : conditions?.default
        if (
          typeof conditions !== "string" &&
          (!conditions ||
            typeof conditions !== "object" ||
            Array.isArray(conditions) ||
            Object.keys(conditions).some((condition) => !["types", "default"].includes(condition)) ||
            (conditions.types !== undefined && conditions.types !== target))
        )
          throw new Error(`Unsupported workspace export conditions: ${manifest.name}: ${key}`)
        if (
          typeof target !== "string" ||
          !/^\.\/[a-zA-Z0-9_./-]+\.(ts|mjs)$/.test(target) ||
          target.includes("..") ||
          target
            .split("/")
            .slice(1)
            .some((segment) => segment === "." || segment === "") ||
          (target.endsWith(".ts") && (typeof conditions === "string" || conditions.types !== target))
        )
          throw new Error(`Unsupported workspace export targets: ${manifest.name}: ${key}`)
        const source = resolve(path, target)
        if (!existsSync(source) || !statSync(source).isFile() || !inside(realpathSync(path), realpathSync(source)))
          throw new Error(`Missing or escaped workspace source export: ${manifest.name}: ${key}`)
        continue
      }
      if (
        !conditions ||
        typeof conditions !== "object" ||
        Array.isArray(conditions) ||
        Object.keys(conditions).some((condition) => !["types", "default"].includes(condition))
      )
        throw new Error(`Unsupported workspace export conditions: ${manifest.name}: ${key}`)
      if (
        typeof conditions.default !== "string" ||
        !/^\.\/dist\/[a-zA-Z0-9_./-]+\.js$/.test(conditions.default) ||
        conditions.default.includes("..") ||
        conditions.types !== conditions.default.replace(/\.js$/, ".d.ts")
      )
        throw new Error(`Unsupported workspace export targets: ${manifest.name}: ${key}`)
    }
    if (compiler === "bend") {
      const abi = manifest.hapsland?.abi
      if (
        !abi ||
        typeof abi !== "object" ||
        Array.isArray(abi) ||
        Object.keys(abi).length !== Object.keys(manifest.exports ?? {}).length ||
        Object.keys(abi).some((key) => !Object.hasOwn(manifest.exports ?? {}, key))
      )
        throw new Error(`Bend workspace must declare exact export ABI: ${manifest.name}`)
      for (const [key, target] of Object.entries(abi)) {
        if (typeof target !== "string" || !/^\.\/abi\/[a-zA-Z0-9_.-]+\.d\.ts$/.test(target) || target.includes(".."))
          throw new Error(`Unsupported Bend ABI target: ${manifest.name}: ${key}`)
        const source = resolve(path, target)
        if (!existsSync(source) || !statSync(source).isFile() || !inside(realpathSync(path), realpathSync(source)))
          throw new Error(`Missing or escaped Bend ABI: ${manifest.name}: ${key}`)
      }
    }
    const node = { directory, path, manifest, role, compiler, dependencies: [], cycleDependencies: [] }
    workspaces.set(manifest.name, node)
    ;(role === "production" ? packages : auxiliaryWorkspaces).set(manifest.name, node)
  }
  for (const node of workspaces.values()) {
    node.dependencyVersions = {}
    for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      node.dependencyVersions[field] = {}
      for (const [name, declaration] of Object.entries(node.manifest[field] ?? {})) {
        const version = resolveDeclaredDependencyVersion(release, name, declaration)
        node.dependencyVersions[field][name] = version
        if (workspaces.has(name)) {
          if (version !== "workspace:*") throw new Error(`Local dependency must use workspace:*: ${name}`)
          if (node.role === "production" && workspaces.get(name).role !== "production")
            throw new Error(
              `Production workspace cannot depend on ${workspaces.get(name).role}: ${node.manifest.name} -> ${name}`
            )
          if (field === "dependencies" && !node.dependencies.includes(name)) node.dependencies.push(name)
          if (!node.cycleDependencies.includes(name)) node.cycleDependencies.push(name)
        } else if (String(version).startsWith("workspace:")) {
          throw new Error(`Unknown workspace dependency: ${name}`)
        }
      }
    }
    node.dependencies.sort()
  }
  const indices = new Map(),
    lowLinks = new Map(),
    stack = [],
    stacked = new Set()
  let nextIndex = 0
  const component = (name) => {
    indices.set(name, nextIndex)
    lowLinks.set(name, nextIndex++)
    stack.push(name)
    stacked.add(name)
    for (const dependency of workspaces.get(name).cycleDependencies) {
      if (!indices.has(dependency)) {
        component(dependency)
        lowLinks.set(name, Math.min(lowLinks.get(name), lowLinks.get(dependency)))
      } else if (stacked.has(dependency)) lowLinks.set(name, Math.min(lowLinks.get(name), indices.get(dependency)))
    }
    if (lowLinks.get(name) === indices.get(name)) {
      const members = []
      let member
      do {
        member = stack.pop()
        stacked.delete(member)
        members.push(member)
      } while (member !== name)
      if (members.length > 1 || workspaces.get(name).cycleDependencies.includes(name)) {
        throw new Error(`Package dependency cycle: ${members.sort().join(", ")}`)
      }
    }
  }
  for (const name of [...workspaces.keys()].sort()) if (!indices.has(name)) component(name)
  const order = []
  const active = []
  const visited = new Set()
  const visit = (name) => {
    if (active.includes(name)) throw new Error(`Package dependency cycle: ${[...active, name].join(" -> ")}`)
    if (visited.has(name)) return
    active.push(name)
    for (const dependency of packages.get(name).dependencies) visit(dependency)
    active.pop()
    visited.add(name)
    order.push(name)
  }
  for (const name of [...packages.keys()].sort()) visit(name)
  return {
    release,
    packages,
    order,
    typeScriptOrder: order.filter((name) => packages.get(name).compiler === "typescript"),
    workspaces,
    auxiliaryWorkspaces
  }
}

export const packageTypeScriptConfig = (graph, name) => {
  const node = graph.packages.get(name)
  if (!node) throw new Error(`Unknown build package: ${name}`)
  if (node.compiler === "bend") throw new Error(`Bend owner has no TypeScript configuration: ${name}`)
  const host = node.manifest.hapsland?.host ?? "bun"
  if (!["bun", "node"].includes(host)) throw new Error(`Unsupported compilation host: ${host}`)
  return {
    extends: "../../tsconfig.package.json",
    compilerOptions: {
      rootDir: "src",
      outDir: "dist",
      tsBuildInfoFile: "dist/.tsbuildinfo",
      ...(host === "node"
        ? { module: "NodeNext", moduleResolution: "NodeNext", customConditions: ["node"], types: ["node"] }
        : {})
    },
    include: ["src/**/*.ts", "src/**/*.json"],
    exclude: ["src/**/*.test.ts"],
    references: node.dependencies
      .filter((dependency) => graph.packages.get(dependency).compiler !== "bend")
      .map((dependency) => ({
        path: relative(node.path, resolve(graph.packages.get(dependency).path, "tsconfig.json")).replaceAll("\\", "/")
      }))
  }
}

/** Resolve explicit emitted exports to their compiler-owned source for source analysis. */
export const resolveWorkspaceSource = (graph, specifier) => {
  const match = /^(@[^/]+\/[^/]+|[^/]+)(\/.*)?$/.exec(specifier)
  const node = match && (graph.workspaces ?? graph.packages).get(match[1])
  if (node && node.role && node.role !== "production")
    throw new Error(`Production source cannot import ${node.role} workspace: ${specifier}`)
  if (!node) return undefined
  const key = match[2] ? `.${match[2]}` : "."
  const target = node.manifest.exports?.[key]?.default
  if (typeof target !== "string" || !target.startsWith("./dist/") || !target.endsWith(".js"))
    throw new Error(`Unsupported or undeclared workspace export: ${specifier}`)
  if (node.compiler === "bend") {
    const emitted = resolve(node.path, target)
    if (!existsSync(emitted) || !statSync(emitted).isFile() || !inside(realpathSync(node.path), realpathSync(emitted)))
      throw new Error(`Missing or escaped Bend emitted export: ${specifier}`)
    return emitted
  }
  const source = resolve(node.path, target.replace("./dist/", "./src/"))
  const candidates = [source.replace(/\.js$/, ".ts"), source]
  const path = candidates.find((candidate) => existsSync(candidate))
  if (!path) throw new Error(`Missing workspace source for ${specifier}`)
  return path
}

/** Resolve authored type evidence independently from Bend's emitted runtime code. */
export const resolveWorkspaceTypeSource = (graph, specifier) => {
  const match = /^(@[^/]+\/[^/]+|[^/]+)(\/.*)?$/.exec(specifier)
  const node = match && (graph.workspaces ?? graph.packages).get(match[1])
  if (!node) return undefined
  if (node.role && node.role !== "production") return resolveWorkspaceSource(graph, specifier)
  const key = match[2] ? `.${match[2]}` : "."
  if (!Object.hasOwn(node.manifest.exports ?? {}, key))
    throw new Error(`Unsupported or undeclared workspace export: ${specifier}`)
  if (node.compiler === "bend") {
    const target = node.manifest.hapsland?.abi?.[key]
    if (typeof target !== "string") throw new Error(`Missing Bend export ABI: ${specifier}`)
    const source = resolve(node.path, target)
    if (!existsSync(source) || !statSync(source).isFile() || !inside(realpathSync(node.path), realpathSync(source)))
      throw new Error(`Missing or escaped Bend ABI: ${specifier}`)
    return source
  }
  const declared = node.manifest.exports[key].types
  const authored = typeof declared === "string" ? resolve(node.path, declared.replace("./dist/", "./src/")) : undefined
  return authored && existsSync(authored) ? authored : resolveWorkspaceSource(graph, specifier)
}

/** Resolve declared source APIs for tooling and verification without widening production imports. */
export const resolveDevelopmentWorkspaceSource = (graph, specifier) => {
  const match = /^(@[^/]+\/[^/]+|[^/]+)(\/.*)?$/.exec(specifier)
  const node = match && (graph.workspaces ?? graph.packages).get(match[1])
  if (!node || !node.role || node.role === "production") return resolveWorkspaceSource(graph, specifier)
  const key = match[2] ? `.${match[2]}` : "."
  const exported = node.manifest.exports?.[key]
  const target = typeof exported === "string" ? exported : exported?.default
  if (typeof target !== "string") throw new Error(`Unsupported or undeclared workspace export: ${specifier}`)
  const source = resolve(node.path, target)
  if (!existsSync(source) || !statSync(source).isFile() || !inside(realpathSync(node.path), realpathSync(source)))
    throw new Error(`Missing or escaped workspace source export: ${specifier}`)
  return source
}

export const generatePackageConfigs = (root, check = false) => {
  const graph = readPackageGraph(root)
  const outputs = new Map(
    graph.typeScriptOrder.map((name) => [
      resolve(graph.packages.get(name).path, "tsconfig.json"),
      packageTypeScriptConfig(graph, name)
    ])
  )
  outputs.set(resolve(root, "tsconfig.packages.json"), {
    files: [],
    references: graph.typeScriptOrder.map((name) => ({ path: `${graph.packages.get(name).directory}/tsconfig.json` }))
  })
  for (const [path, value] of outputs) {
    const expected = `${JSON.stringify(value, null, 2)}\n`
    if (check) {
      let actual
      try {
        actual = readFileSync(path, "utf8")
      } catch {
        throw new Error(`Missing generated configuration: ${relative(root, path)}`)
      }
      if (actual !== expected) throw new Error(`Stale generated configuration: ${relative(root, path)}`)
    } else writeFileSync(path, expected)
  }
  return graph
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  const graph = generatePackageConfigs(root, process.argv.includes("--check"))
  process.stdout.write(`Checked ${graph.packages.size} manifest-owned build packages\n`)
}
