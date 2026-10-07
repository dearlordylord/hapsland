import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { fileEvidence } from "./compiler-evidence.mjs"
import { readPackageGraph, resolveDeclaredDependencyVersion } from "./package-graph.mjs"

export const authoredTaskToolingFiles = (node) =>
  [
    "authored-task-inputs",
    "compiler-evidence",
    "package-graph",
    "build-lock",
    "owned-lock",
    "build-process",
    "build-groups",
    ...(node.compiler === "bend"
      ? ["bend-producer", "bend-toolchain"]
      : ["compile-package", "compiler-context", "pinned-typescript"])
  ].map((name) => `scripts/${name}.mjs`)

const identity = (node) => {
  const domain = node.manifest.hapsland?.domain
  if (domain !== undefined && (typeof domain !== "string" || !/^[a-z0-9-]+$/.test(domain)))
    throw new Error(`Invalid authored task owner domain: ${node.manifest.name}`)
  return domain ?? encodeURIComponent(node.manifest.name)
}
export const authoredTaskInputPath = (root, node) =>
  resolve(root, ".test-runs/task-inputs", identity(node), "build.json")
const authoredInventory = (root, node) => {
  const files = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (["dist", "artifacts", "node_modules", ".test-runs", ".turbo"].includes(entry.name)) continue
      const path = resolve(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`Authored task input symlink is unsupported: ${relative(root, path)}`)
      if (entry.isDirectory()) visit(path)
      else if (!entry.name.endsWith(".test.ts")) files.push(fileEvidence(root, path))
    }
  }
  visit(node.compiler === "bend" ? node.path : resolve(node.path, "src"))
  return files.sort((left, right) => left.path.localeCompare(right.path))
}
const selectedToolchain = (root, node, options) => {
  const supplied = node.compiler === "bend" ? (options.bendToolchain ?? options.toolchain) : options.toolchain
  const recorded =
    supplied ??
    JSON.parse(
      readFileSync(
        resolve(root, node.compiler === "bend" ? ".test-runs/bend-toolchain.json" : ".test-runs/build-toolchain.json"),
        "utf8"
      )
    )
  const selected = node.compiler === "bend" ? recorded : { node: recorded.node, typescript: recorded.typescript }
  if (
    !selected ||
    typeof selected !== "object" ||
    Array.isArray(selected) ||
    (node.compiler !== "bend" && (!selected.node || !selected.typescript))
  )
    throw new Error(`Missing authored task toolchain: ${node.manifest.name}`)
  const verify = (value) => {
    if (!value || typeof value !== "object") return
    if (typeof value.path === "string" && typeof value.sha256 === "string") {
      const actual = fileEvidence(root, resolve(root, value.path))
      if (actual.sha256 !== value.sha256 || actual.mode !== value.mode)
        throw new Error(`Authored task toolchain changed: ${value.path}`)
    }
    for (const child of Object.values(value)) if (child && typeof child === "object") verify(child)
  }
  verify(selected)
  return selected
}

/** Capture authored membership before Turbo hashes tasks; upstream outputs are deliberately absent. */
export const authoredSourceContext = (root, node) => {
  const configuration = [`${node.directory}/package.json`, ...authoredTaskToolingFiles(node)]
  if (node.compiler !== "bend")
    configuration.push("tsconfig.json", "tsconfig.package.json", `${node.directory}/tsconfig.json`)
  const manifest = JSON.parse(readFileSync(resolve(node.path, "package.json"), "utf8"))
  const release = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"))
  const dependencyVersions = Object.fromEntries(
    ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].map((field) => [
      field,
      Object.fromEntries(
        Object.entries(manifest[field] ?? {}).map(([name, declaration]) => [
          name,
          resolveDeclaredDependencyVersion(release, name, declaration)
        ])
      )
    ])
  )
  return {
    owner: node.manifest.name,
    compiler: node.compiler,
    source: authoredInventory(root, node),
    configuration: configuration.map((path) => fileEvidence(root, resolve(root, path))),
    dependencyVersions
  }
}

/** A validated stamp adds byte-verified tool identity to the pure authored projection. */
export const captureAuthoredInputs = (root, node, options = {}) => ({
  ...authoredSourceContext(root, node),
  toolchain: selectedToolchain(root, node, options)
})

export const captureAuthoredTaskInputs = (root, graph = readPackageGraph(root), options = {}) => {
  const stamps = new Map(),
    paths = new Set(),
    toolchains = new Map()
  for (const node of graph.packages.values()) {
    if (!["typescript", "bend"].includes(node.compiler)) continue
    if (!toolchains.has(node.compiler)) toolchains.set(node.compiler, selectedToolchain(root, node, options))
    const stamp = { ...authoredSourceContext(root, node), toolchain: toolchains.get(node.compiler) }
    const path = authoredTaskInputPath(root, node)
    if (paths.has(path)) throw new Error(`Duplicate authored task stamp path: ${path}`)
    paths.add(path)
    stamps.set(node.manifest.name, stamp)
  }
  return stamps
}

export const prepareAuthoredTaskInputs = (root, graph = readPackageGraph(root), options = {}) => {
  const stamps = captureAuthoredTaskInputs(root, graph, options)
  for (const node of graph.packages.values()) {
    const stamp = stamps.get(node.manifest.name)
    if (!stamp) continue
    const path = authoredTaskInputPath(root, node),
      text = JSON.stringify(stamp, null, 2) + "\n"
    mkdirSync(dirname(path), { recursive: true })
    if (!existsSync(path) || readFileSync(path, "utf8") !== text) writeFileSync(path, text)
  }
  return stamps
}

export const verifyAuthoredTaskInputs = (root, graph, expected, options = {}) => {
  if (!(expected instanceof Map)) throw new Error("Expected authored task inputs must be a Map")
  const current = captureAuthoredTaskInputs(root, graph, options)
  if (JSON.stringify([...current]) !== JSON.stringify([...expected]))
    throw new Error("Authored task inputs changed during production phase")
  return expected
}

export const verifyAuthoredInputStamp = (
  root,
  node,
  stamp = JSON.parse(readFileSync(authoredTaskInputPath(root, node), "utf8")),
  options = {}
) => {
  const current = captureAuthoredInputs(root, node, options)
  if (JSON.stringify(current) !== JSON.stringify(stamp))
    throw new Error(`Authored task inputs changed: ${node.manifest.name}`)
  return stamp
}
