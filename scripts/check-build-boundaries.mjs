import { relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readPackageGraph, resolveWorkspaceSource } from "./package-graph.mjs"
import { checkWorkspaceImports } from "./check-workspace-imports.mjs"
export const sourceContributionClosure = (root, graph, analysis, entry, policy, name) => {
  const records = new Map()
  for (const record of analysis.records) {
    if (records.has(record.file)) throw new Error(`Duplicate source contribution: ${record.file}`)
    records.set(record.file, record)
  }
  const pending = [relative(root, entry).replaceAll("\\", "/")],
    seen = new Set()
  while (pending.length) {
    const file = pending.pop()
    if (seen.has(file)) continue
    seen.add(file)
    const record = records.get(file)
    if (!record) throw new Error(`Unaccounted source contribution: ${name}: ${file}`)
    const owner = graph.packages.get(record.owner)
    if (!owner || !resolve(root, file).startsWith(owner.path + "/"))
      throw new Error(`Unaccounted source owner: ${record.owner}: ${file}`)
    const capabilities = owner.manifest.hapsland?.capabilities
    if (!Array.isArray(capabilities)) throw new Error(`Missing owner capabilities: ${record.owner}`)
    if (capabilities.some((capability) => policy.forbiddenCapabilities.includes(capability)))
      throw new Error(`Forbidden build boundary owner: ${name}: ${record.owner}: ${file}`)
    for (const edge of record.imports) {
      if (edge.external && policy.forbiddenExternalPackages.includes(edge.external))
        throw new Error(`Forbidden build boundary dependency: ${name}: ${edge.specifier}`)
      if (edge.target) pending.push(edge.target)
    }
  }
  return [...seen].sort()
}
export const checkBuildBoundary = (root, analysis, name, graph = readPackageGraph(root)) => {
  const policy = graph.release.hapsland?.buildBoundaries?.[name]
  if (!policy || !Array.isArray(policy.forbiddenCapabilities) || !Array.isArray(policy.forbiddenExternalPackages))
    throw new Error(`Invalid build boundary: ${name}`)
  if (
    ["administration", "credential-mutation", "provider-execution", "review-orchestration", "source-analysis"].some(
      (capability) => !policy.forbiddenCapabilities.includes(capability)
    ) ||
    [
      "@effect/ai-typesafe",
      "@effect/ai",
      "tree-sitter",
      "tree-sitter-typescript",
      "tree-sitter-rust",
      "tree-sitter-go"
    ].some((dependency) => !policy.forbiddenExternalPackages.includes(dependency))
  )
    throw new Error(`Build boundary policy omits protected capabilities: ${name}`)
  const entry = resolveWorkspaceSource(graph, policy.entry)
  const expected = [...graph.packages.values()].find((node) =>
    name === "standalone-hook"
      ? node.manifest.hapsland?.role === "hook"
      : node.manifest.hapsland?.surface === "pi-extension"
  )
  if (!expected || entry !== resolve(expected.path, expected.manifest.hapsland.entry))
    throw new Error(`Build boundary does not select its actual entry: ${name}`)
  return sourceContributionClosure(root, graph, analysis, entry, policy, name)
}
export const checkBuildBoundaries = (root, analysis = checkWorkspaceImports(root)) => {
  const graph = readPackageGraph(root),
    boundaries = graph.release.hapsland?.buildBoundaries
  if (!boundaries || typeof boundaries !== "object") throw new Error("Release must declare build boundaries")
  for (const name of ["standalone-hook", "pi-extension"])
    if (!Object.hasOwn(boundaries, name)) throw new Error(`Missing required build boundary: ${name}`)
  return Object.fromEntries(
    Object.keys(boundaries).map((name) => [name, checkBuildBoundary(root, analysis, name, graph)])
  )
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(
    Object.fromEntries(
      Object.entries(checkBuildBoundaries(resolve(import.meta.dirname, ".."))).map(([name, files]) => [
        name,
        files.length
      ])
    )
  )
