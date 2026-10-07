import { checkBendProducerReceipt } from "./bend-producer.mjs"
import { existsSync, readFileSync, realpathSync } from "node:fs"
import { proveStandaloneBuiltin } from "./standalone-runtime-profile.mjs"
import { dirname, relative, resolve } from "node:path"
import { fileEvidence } from "./compiler-evidence.mjs"
import { readPackageGraph, resolveWorkspaceSource } from "./package-graph.mjs"
import { checkBuildBoundaries, checkBuildBoundary } from "./check-build-boundaries.mjs"

const inside = (directory, file) => file.startsWith(directory + "/")
const contributionOwnerObserved = (root, graph, file, producerReceipt) => {
  const path = realpathSync(resolve(root, file))
  for (const owner of graph.packages.values()) {
    if (!inside(realpathSync(owner.path), path)) continue
    const local = relative(realpathSync(owner.path), path).replaceAll("\\", "/")
    if (owner.compiler === "bend") {
      const receipt = producerReceipt(root, owner)
      const output = receipt.outputs.find((input) => resolve(root, input.path) === path)
      if (local.startsWith("dist/") && output) {
        if (local.endsWith(".js")) return { owner: owner.manifest.name, source: `${owner.directory}/${local}` }
        const exported = Object.entries(owner.manifest.exports).find(
          ([, conditions]) => resolve(owner.path, conditions.types) === path
        )
        const abi = exported && owner.manifest.hapsland.abi[exported[0]]
        if (abi) return { owner: owner.manifest.name, source: `${owner.directory}/${abi.slice(2)}` }
      }
      if (Object.values(owner.manifest.hapsland.abi).some((abi) => resolve(owner.path, abi) === path))
        return { owner: owner.manifest.name, source: `${owner.directory}/${local}` }
      throw new Error(`Unaccounted Bend producer contribution: ${file}`)
    }
    let source = local
    if (local.startsWith("dist/")) {
      source = local.replace(/^dist\//, "src/")
      const candidates = source.endsWith(".d.ts")
        ? [source.slice(0, -5) + ".ts", source]
        : source.endsWith(".js")
          ? [source.slice(0, -3) + ".ts", source]
          : [source]
      source = candidates.find((candidate) => existsSync(resolve(owner.path, candidate)))
    }
    if (!source?.startsWith("src/") || !existsSync(resolve(owner.path, source)))
      throw new Error(`Unaccounted workspace contribution: ${file}`)
    return { owner: owner.manifest.name, source: `${owner.directory}/${source}` }
  }
  if (!inside(realpathSync(resolve(root, "node_modules")), path))
    throw new Error(`Unaccounted external contribution: ${file}`)
  let directory = dirname(path)
  while (inside(root, directory)) {
    const manifestPath = resolve(directory, "package.json")
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
      if (typeof manifest.name === "string")
        return { external: manifest.name, manifest: fileEvidence(root, manifestPath) }
    }
    directory = dirname(directory)
  }
  throw new Error(`External contribution has no package owner: ${file}`)
}
export const contributionOwner = (root, graph, file) =>
  contributionOwnerObserved(root, graph, file, checkBendProducerReceipt)

const assertPolicy = (graph, policy, contribution, file) => {
  if (contribution.owner) {
    const capabilities = graph.packages.get(contribution.owner).manifest.hapsland?.capabilities
    if (
      !Array.isArray(capabilities) ||
      capabilities.some((capability) => policy.forbiddenCapabilities.includes(capability))
    )
      throw new Error(`Forbidden compiled contribution: ${contribution.owner}: ${file}`)
  } else if (policy.forbiddenExternalPackages.includes(contribution.external))
    throw new Error(`Forbidden external contribution: ${contribution.external}: ${file}`)
}
export const checkCompilerContributions = (root, graph = readPackageGraph(root), analysis) => {
  // Validate the policy and its actual entry before consulting compiler evidence.
  checkBuildBoundaries(root, analysis)
  const result = {}
  for (const [name, policy] of Object.entries(graph.release.hapsland.buildBoundaries)) {
    const source = resolveWorkspaceSource(graph, policy.entry)
    const owner = [...graph.packages.values()].find((owner) => inside(owner.path, source))
    const receipt = JSON.parse(readFileSync(resolve(owner.path, "dist/.compile-receipt.json"), "utf8"))
    if (receipt.package !== owner.manifest.name || !Array.isArray(receipt.inputs) || !receipt.inputs.length)
      throw new Error(`Missing compiler contribution evidence: ${name}`)
    result[name] = receipt.inputs.map((input) => {
      const contribution = contributionOwner(root, graph, input.path)
      assertPolicy(graph, policy, contribution, input.path)
      return { ...input, ...contribution }
    })
  }
  return result
}
export const checkAssemblyContributions = (
  root,
  entry,
  metafile,
  analysis,
  graph = readPackageGraph(root),
  resolveImport
) => {
  const inputs = Object.entries(metafile?.inputs ?? {})
  const outputs = Object.values(metafile?.outputs ?? {})
  if (
    !inputs.length ||
    !outputs.length ||
    !outputs.some((output) => resolve(root, output.entryPoint ?? "") === resolve(entry))
  )
    throw new Error("Missing assembly entry/input/output evidence")
  const selected = Object.entries(graph.release.hapsland.buildBoundaries).find(([, policy]) => {
    const source = resolveWorkspaceSource(graph, policy.entry)
    return resolve(entry) === source.replace("/src/", "/dist/").replace(/\.ts$/, ".js")
  })
  const allowedSources = selected ? checkBuildBoundary(root, analysis, selected[0], graph) : analysis.sourceClosure
  const producers = new Map()
  const observedOwner = (file) =>
    contributionOwnerObserved(root, graph, file, (producerRoot, owner) => {
      if (!producers.has(owner)) producers.set(owner, checkBendProducerReceipt(producerRoot, owner))
      return producers.get(owner)
    })
  const verifyCompiledInput = (file, contribution) => {
    if (!analysis.compiledOutputs || !contribution.owner) return
    const path = relative(root, realpathSync(resolve(root, file))).replaceAll("\\", "/")
    if (!path.includes("/dist/")) return
    const expected = analysis.compiledOutputs.find((output) => output.path === path)
    if (!expected || JSON.stringify(fileEvidence(root, resolve(root, path))) !== JSON.stringify(expected))
      throw new Error(`Changed compiled assembly prerequisite: ${file}`)
  }
  const inputPaths = new Set(inputs.map(([file]) => realpathSync(resolve(root, file))))
  const evidence = inputs.map(([file, metadata]) => {
    if (/\.(?:ts|tsx|mts|cts)$/.test(file)) throw new Error(`Assembly consumed TypeScript: ${file}`)
    const contribution = observedOwner(file)
    verifyCompiledInput(file, contribution)
    if (!selected && allowedSources && contribution.source && !allowedSources.includes(contribution.source))
      throw new Error(`Assembly disagrees with source closure: ${file}`)
    if (selected) {
      assertPolicy(graph, selected[1], contribution, file)
      if (contribution.source && !allowedSources.includes(contribution.source))
        throw new Error(`Assembly disagrees with source closure: ${file}`)
    }
    if (!Array.isArray(metadata.imports)) throw new Error(`Missing assembly import evidence: ${file}`)
    const imports = metadata.imports.map((imported) => {
      if (!["import-statement", "dynamic-import", "require-call", "require-resolve"].includes(imported.kind))
        throw new Error(`Unsupported emitted import kind: ${file}: ${imported.kind}`)
      if (
        (imported.external &&
          proveStandaloneBuiltin(
            imported.path,
            dirname(resolve(root, file)),
            resolveImport && ((specifier) => resolveImport(specifier, resolve(root, file)))
          )) ||
        imported.path === "bun:wrap"
      ) {
        return { kind: imported.kind, path: imported.path, external: true }
      } else {
        const resolved = imported.path.startsWith("/")
          ? imported.path
          : resolveImport?.(imported.path, resolve(root, file))
        if (!resolved) throw new Error(`Unaccounted emitted import target: ${file}: ${imported.path}`)
        const dependency = observedOwner(resolved)
        verifyCompiledInput(resolved, dependency)
        if (!selected && allowedSources && dependency.source && !allowedSources.includes(dependency.source))
          throw new Error(`Resolved import disagrees with source closure: ${file}: ${resolved}`)
        if (selected) {
          assertPolicy(graph, selected[1], dependency, resolved)
          if (dependency.source && !allowedSources.includes(dependency.source))
            throw new Error(`Resolved import disagrees with source closure: ${file}: ${resolved}`)
        }
        // Bun retains unresolved specifiers for discarded imports. Record their
        // actual resolver target separately from files that contributed to output.
        return {
          kind: imported.kind,
          resolved: fileEvidence(root, realpathSync(resolved)),
          contributed: inputPaths.has(realpathSync(resolved)),
          metadataExternal: imported.external === true
        }
      }
    })
    return { ...fileEvidence(root, resolve(root, file)), ...contribution, imports }
  })
  for (const output of outputs) {
    if (!output.inputs || typeof output.inputs !== "object" || !Array.isArray(output.imports))
      throw new Error("Missing emitted output contribution evidence")
    for (const file of Object.keys(output.inputs))
      if (!inputPaths.has(realpathSync(resolve(root, file))))
        throw new Error(`Unaccounted output contribution: ${file}`)
    if (output.imports.length) throw new Error("Standalone assembly retained external output imports")
  }
  for (const [owner, before] of producers)
    if (JSON.stringify(before) !== JSON.stringify(checkBendProducerReceipt(root, owner)))
      throw new Error(`Bend producer changed during assembly contribution validation: ${owner.manifest.name}`)
  return evidence.sort((a, b) => a.path.localeCompare(b.path))
}
