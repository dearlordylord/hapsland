import { readFileSync, realpathSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileEvidence } from "./compiler-evidence.mjs"
import { contributionOwner } from "./build-contributions.mjs"
import {
  externalLoaderProfile,
  pinnedExternalLoaderProfiles,
  standaloneNativeRootExpression
} from "./external-loader-profile.mjs"
import { checkBuildBoundary } from "./check-build-boundaries.mjs"
import { readPackageGraph, resolveWorkspaceSource } from "./package-graph.mjs"
import { transformNativeBindingModule } from "../packages/source-analysis/src/direct-event/languages/native-bindings.ts"

import { standaloneBuiltin, proveStandaloneBuiltin } from "./standalone-runtime-profile.mjs"
export { standaloneBuiltin } from "./standalone-runtime-profile.mjs"

export function assertExternalEdgePolicy(graph, policy, contribution, file) {
  if (!policy) return
  if (contribution.owner) {
    const capabilities = graph.packages.get(contribution.owner)?.manifest.hapsland?.capabilities
    if (
      !Array.isArray(capabilities) ||
      capabilities.some((capability) => policy.forbiddenCapabilities.includes(capability))
    )
      throw new Error(`Forbidden external loader workspace target: ${contribution.owner}: ${file}`)
  } else if (policy.forbiddenExternalPackages.includes(contribution.external))
    throw new Error(`Forbidden external loader package target: ${contribution.external}: ${file}`)
}

export function externalRuntimeEvidence(
  root,
  inputs,
  transformations,
  transformedText,
  target,
  resolver,
  entry,
  analysis,
  nativeArtifacts
) {
  const graph = readPackageGraph(root)
  const derived = inputs.map((input) => {
    const actual = contributionOwner(root, graph, input.path)
    for (const key of ["owner", "source", "external", "manifest"])
      if (JSON.stringify(input[key]) !== JSON.stringify(actual[key]))
        throw new Error(`Missing or corrupt assembly input ownership: ${input.path}: ${key}`)
    return { ...input, ...actual }
  })
  const externalInputs = derived.filter((input) => input.external)
  if (!externalInputs.length) return []
  if (!entry) throw new Error("External runtime evidence requires the actual assembly entry")
  const selected = Object.entries(graph.release.hapsland.buildBoundaries).find(([, candidate]) => {
    const source = resolveWorkspaceSource(graph, candidate.entry)
    return resolve(root, entry) === source.replace("/src/", "/dist/").replace(/\.ts$/, ".js")
  })
  const policy = selected?.[1]
  let allowedSources = analysis?.sourceClosure
  const transformed = new Map(transformations.map((record) => [record.path, record]))
  return externalInputs
    .map((input) => {
      const file = resolve(root, input.path)
      const transformation = transformed.get(input.path)
      const text = transformation ? transformedText.get(input.path) : readFileSync(file, "utf8")
      if (typeof text !== "string") throw new Error(`Missing transformed external bytes: ${input.path}`)
      if (input.path.endsWith(".json")) {
        JSON.parse(text)
        return { path: input.path, kind: "json", sha256: input.sha256 }
      }
      if (!/\.(?:c|m)?js$/.test(input.path)) throw new Error(`Unsupported external runtime module: ${input.path}`)
      const nativeTarget =
        transformation &&
        `native/prebuilt/${target.slice(4)}/${transformation.packageName}/build/Release/${transformation.nativeBinding}`
      const approval = transformation && {
        file,
        packageName: transformation.packageName,
        nativeBinding: transformation.nativeBinding,
        originalSha256: transformation.sha256,
        transformedSha256: transformation.transformedSha256,
        policy: pinnedExternalLoaderProfiles[transformation.packageName]?.policy,
        nativeTargets: [nativeTarget]
      }
      const profile = externalLoaderProfile(text, file, {
        approval,
        resolveTarget: (specifier, importer, kind) => {
          if (kind === "native") {
            if (specifier !== nativeTarget) throw new Error("Native target disagrees with producer declaration")
            const asset = nativeArtifacts?.find((asset) => asset.installedPath === specifier)
            if (!asset) throw new Error("Missing owned native loader target")
            return { native: true, ...fileEvidence(root, asset.physicalPath), publicPath: asset.installedPath }
          }
          if (standaloneBuiltin(specifier))
            return { builtin: specifier, runtimeTarget: proveStandaloneBuiltin(specifier, dirname(importer), resolver) }
          const nodeTarget = createRequire(importer).resolve(specifier)
          const resolved = resolver ? resolver(specifier, dirname(importer)) : nodeTarget
          if (realpathSync(nodeTarget) !== realpathSync(resolved))
            throw new Error(`Unsupported Bun/Node external resolver disagreement: ${importer}: ${specifier}`)
          const owner = contributionOwner(root, graph, resolved)
          assertExternalEdgePolicy(graph, policy, owner, resolved)
          if ((selected || allowedSources) && owner.source) {
            allowedSources ??= checkBuildBoundary(root, analysis, selected[0], graph)
            if (!allowedSources.includes(owner.source))
              throw new Error(`External loader target disagrees with source closure: ${resolved}`)
          }
          return { ...fileEvidence(root, resolved), ...owner }
        }
      })
      return {
        path: input.path,
        kind: "javascript",
        sha256: profile.sha256,
        approval: profile.approval ? { ...profile.approval, file: input.path } : null,
        nativeUses: profile.nativeUses,
        codegenUses: profile.codegenUses,
        edges: profile.edges
      }
    })
    .sort((left, right) => left.path.localeCompare(right.path))
}
export function checkExternalRuntimeEvidence(root, receipt) {
  if (!Array.isArray(receipt.externalRuntime)) throw new Error("Missing external runtime loader evidence")
  const transformedText = new Map()
  for (const recorded of receipt.transformations) {
    const actual = transformNativeBindingModule(resolve(root, recorded.path), standaloneNativeRootExpression)
    if (actual.packageName !== recorded.packageName || actual.nativeBinding !== recorded.nativeBinding)
      throw new Error("Changed native loader transformation identity")
    transformedText.set(recorded.path, actual.transformed)
  }
  const expected = externalRuntimeEvidence(
    root,
    receipt.inputs,
    receipt.transformations,
    transformedText,
    receipt.context.target,
    undefined,
    receipt.entry.path,
    receipt.context.prerequisite?.analysis,
    receipt.context.prerequisite &&
      receipt.nativeAssets.map((asset) => ({
        physicalPath: resolve(root, asset.path),
        installedPath: asset.publicPath
      }))
  )
  if (JSON.stringify(expected) !== JSON.stringify(receipt.externalRuntime))
    throw new Error("Missing, corrupt or stale external runtime loader evidence")
}
