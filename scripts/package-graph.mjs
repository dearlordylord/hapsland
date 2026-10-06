import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"))
const inside = (root, path) => !relative(root, path).startsWith("..")

/** Workspace manifests own dependency edges; generated configurations are projections. */
export const readPackageGraph = (root) => {
  const release = readJson(resolve(root, "package.json"))
  if (!Array.isArray(release.workspaces) || release.workspaces.length === 0)
    throw new Error("Release manifest must list explicit build workspaces")
  const packages = new Map()
  for (const directory of release.workspaces) {
    if (typeof directory !== "string" || !/^packages\/[a-z0-9-]+$/.test(directory))
      throw new Error(`Unsupported workspace declaration: ${directory}`)
    const path = resolve(root, directory)
    if (!inside(root, path)) throw new Error(`Workspace escapes release: ${directory}`)
    const manifest = readJson(resolve(path, "package.json"))
    if (!manifest.private || manifest.type !== "module" || typeof manifest.name !== "string")
      throw new Error(`Build workspace must be a named private ES module: ${directory}`)
    if (packages.has(manifest.name)) throw new Error(`Duplicate workspace name: ${manifest.name}`)
    packages.set(manifest.name, { directory, path, manifest, dependencies: [] })
  }
  for (const node of packages.values()) {
    for (const [name, version] of Object.entries(node.manifest.dependencies ?? {})) {
      if (packages.has(name)) {
        if (version !== "workspace:*") throw new Error(`Local dependency must use workspace:*: ${name}`)
        node.dependencies.push(name)
      } else if (String(version).startsWith("workspace:")) {
        throw new Error(`Unknown workspace dependency: ${name}`)
      }
    }
    node.dependencies.sort()
  }
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
  return { release, packages, order }
}

export const packageTypeScriptConfig = (graph, name) => {
  const node = graph.packages.get(name)
  if (!node) throw new Error(`Unknown build package: ${name}`)
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
    references: node.dependencies.map((dependency) => ({
      path: relative(node.path, resolve(graph.packages.get(dependency).path, "tsconfig.json")).replaceAll("\\", "/")
    }))
  }
}

/** Resolve explicit emitted exports to their compiler-owned source for source analysis. */
export const resolveWorkspaceSource = (graph, specifier) => {
  const match = /^(@[^/]+\/[^/]+|[^/]+)(\/.*)?$/.exec(specifier)
  const node = match && graph.packages.get(match[1])
  if (!node) return undefined
  const key = match[2] ? `.${match[2]}` : "."
  const target = node.manifest.exports?.[key]?.default
  if (typeof target !== "string" || !target.startsWith("./dist/") || !target.endsWith(".js"))
    throw new Error(`Unsupported or undeclared workspace export: ${specifier}`)
  const source = resolve(node.path, target.replace("./dist/", "./src/"))
  const candidates = [source.replace(/\.js$/, ".ts"), source]
  const path = candidates.find((candidate) => existsSync(candidate))
  if (!path) throw new Error(`Missing workspace source for ${specifier}`)
  return path
}

export const generatePackageConfigs = (root, check = false) => {
  const graph = readPackageGraph(root)
  const outputs = new Map(
    graph.order.map((name) => [
      resolve(graph.packages.get(name).path, "tsconfig.json"),
      packageTypeScriptConfig(graph, name)
    ])
  )
  outputs.set(resolve(root, "tsconfig.packages.json"), {
    files: [],
    references: graph.order.map((name) => ({ path: `${graph.packages.get(name).directory}/tsconfig.json` }))
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
