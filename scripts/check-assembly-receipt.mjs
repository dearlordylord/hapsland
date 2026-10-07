import { readPackageGraph } from "./package-graph.mjs"
import { checkAssemblyPrerequisite, requiredAssemblyNativePaths } from "./assembly-prerequisites.mjs"
import { createHash } from "node:crypto"
import { standaloneBuiltin } from "./standalone-runtime-profile.mjs"
import { resolve } from "node:path"
import { fileEvidence } from "./compiler-evidence.mjs"
import { checkExternalRuntimeEvidence } from "./external-runtime-evidence.mjs"

export const assemblyReceiptDigest = ({ digest: _digest, ...receipt }) =>
  createHash("sha256").update(JSON.stringify(receipt)).digest("hex")

// Callers supply the current producer context, never the cached receipt's context.
export const checkAssemblyReceipt = (root, receipt, context, entry, output, native) => {
  if (
    !receipt ||
    receipt.digest !== assemblyReceiptDigest(receipt) ||
    JSON.stringify(receipt.context) !== JSON.stringify(context) ||
    !Array.isArray(receipt.inputs) ||
    !receipt.inputs.length ||
    !Array.isArray(receipt.transformations) ||
    !Array.isArray(receipt.nativeAssets) ||
    receipt.entry?.path !== fileEvidence(root, entry).path ||
    receipt.output?.path !== fileEvidence(root, output).path
  )
    throw new Error("Missing, mismatched or stale assembly receipt")
  if (context.prerequisite) {
    checkAssemblyPrerequisite(root, context.prerequisite)
    const required = requiredAssemblyNativePaths(readPackageGraph(root), context.target.slice(4), receipt.inputs)
    if (JSON.stringify(required) !== JSON.stringify(receipt.nativeAssets.map((asset) => asset.publicPath).sort()))
      throw new Error("Missing or additional owned native artifact")
    if (receipt.nativeAssets.length && !native) throw new Error("Missing current owned native artifact proof")
    for (const asset of receipt.nativeAssets) {
      const selected = native.assets.find((candidate) => candidate.installedPath === asset.publicPath)
      if (!selected || selected.owner !== asset.owner || resolve(root, asset.path) !== selected.physicalPath)
        throw new Error("Unaccounted owned native artifact")
    }
  }
  const evidence = [receipt.entry, receipt.output, ...receipt.nativeAssets]
  const transformed = new Set()
  for (const transformation of receipt.transformations) {
    if (
      !transformation?.path ||
      transformed.has(transformation.path) ||
      transformation.policy !== "physical-native-bindings" ||
      !["tree-sitter", "tree-sitter-typescript", "tree-sitter-rust"].includes(transformation.packageName) ||
      !/^[a-f0-9]{64}$/.test(transformation.transformedSha256 ?? "") ||
      !/^[a-z_]+\.node$/.test(transformation.nativeBinding ?? "") ||
      !receipt.nativeAssets.some(
        (asset) =>
          asset.publicPath ===
          `native/prebuilt/${context.target.slice(4)}/${transformation.packageName}/build/Release/${transformation.nativeBinding}`
      ) ||
      !receipt.inputs.some(
        (input) => input.path === transformation.path && input.external === transformation.packageName
      )
    )
      throw new Error("Unaccounted or duplicate loader transformation")
    transformed.add(transformation.path)
    evidence.push(transformation)
  }
  const seen = new Set()
  for (const input of receipt.inputs) {
    if (
      ["tree-sitter", "tree-sitter-typescript", "tree-sitter-rust"].includes(input.external) &&
      input.path?.endsWith(".js") &&
      !transformed.has(input.path)
    )
      throw new Error("Assembly receipt omits a native loader transformation")
    if (!input?.path || seen.has(input.path) || !Array.isArray(input.imports))
      throw new Error("Missing or duplicate assembly input evidence")
    seen.add(input.path)
    evidence.push(input)
    if (input.manifest) evidence.push(input.manifest)
    for (const imported of input.imports) {
      if (imported.resolved) evidence.push(imported.resolved)
      else if (imported.external !== true || typeof imported.path !== "string" || !standaloneBuiltin(imported.path))
        throw new Error("Unaccounted assembly import evidence")
    }
  }
  for (const input of receipt.inputs)
    for (const imported of input.imports)
      if (imported.contributed === true && !seen.has(imported.resolved?.path))
        throw new Error("Assembly receipt omits a contributing import target")
  const assetPaths = receipt.nativeAssets.map((asset) => asset.path)
  if (new Set(assetPaths).size !== assetPaths.length) throw new Error("Duplicate native asset evidence")
  for (const recorded of evidence) {
    const actual = fileEvidence(root, resolve(root, recorded.path))
    if (actual.path !== recorded.path || actual.mode !== recorded.mode || actual.sha256 !== recorded.sha256)
      throw new Error(`Changed assembly evidence: ${recorded.path}`)
  }
  if (!seen.has(receipt.entry.path)) throw new Error("Assembly entry is absent from input evidence")
  checkExternalRuntimeEvidence(root, receipt)
  return receipt
}
