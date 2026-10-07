import { checkBendProducerReceipt } from "./bend-producer.mjs"
import { createHash } from "node:crypto"
import { fileEvidence, fileInventory } from "./compiler-evidence.mjs"
import { readPackageGraph } from "./package-graph.mjs"
import { resolve } from "node:path"
import { readCompilerToolchain } from "./compiler-context.mjs"
const context = (root, graph) => {
  const toolchain = readCompilerToolchain(root)
  for (const executable of [toolchain.node, toolchain.bun])
    if (
      !executable ||
      JSON.stringify(fileEvidence(root, resolve(root, executable.path))) !== JSON.stringify(executable)
    )
      throw new Error("Source checker executable identity changed")
  return {
    toolchain,
    configuration: [
      "package.json",
      "bun.lock",
      "tsconfig.json",
      "tsconfig.package.json",
      "tsconfig.packages.json",
      "turbo.json",
      "scripts/package-graph.mjs",
      "scripts/check-workspace-imports.mjs",
      "scripts/check-build-boundaries.mjs",
      "scripts/source-loader-policy.mjs",
      "scripts/source-type-evidence.mjs",
      "scripts/source-analysis-receipt.mjs",
      ...[...graph.packages.values()].flatMap((owner) => [
        `${owner.directory}/package.json`,
        ...(owner.compiler === "bend" ? [] : [`${owner.directory}/tsconfig.json`])
      ])
    ]
      .sort()
      .map((file) => fileEvidence(root, resolve(root, file))),
    producers: [...graph.packages.values()]
      .filter((owner) => owner.compiler === "bend")
      .map((owner) => ({ owner: owner.manifest.name, receipt: checkBendProducerReceipt(root, owner) })),
    sources: [...graph.packages.values()]
      .flatMap((owner) =>
        (owner.compiler === "bend" ? ["dist", "abi"] : ["src"]).flatMap((directory) =>
          fileInventory(root, resolve(owner.path, directory))
        )
      )
      .filter((file) => !file.path.endsWith(".test.ts"))
  }
}
export const sourceAnalysisContext = (root) => context(root, readPackageGraph(root))
export const sourceAnalysisReceipt = (root, analysis, before) => {
  const after = sourceAnalysisContext(root)
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Source changed during boundary analysis")
  return { context: after, analysis, digest: createHash("sha256").update(JSON.stringify(analysis)).digest("hex") }
}
export const checkSourceAnalysisReceipt = (root, receipt, dependencies) => {
  if (
    !dependencies ||
    receipt?.context?.toolchain?.dependencies !== dependencies ||
    !receipt?.analysis?.records?.length ||
    receipt.digest !== createHash("sha256").update(JSON.stringify(receipt.analysis)).digest("hex") ||
    JSON.stringify(receipt.context) !== JSON.stringify(sourceAnalysisContext(root))
  )
    throw new Error("Missing or stale source analysis receipt")
  const files = receipt.context.sources
    .filter((file) => /\.(?:ts|js|json)$/.test(file.path))
    .map((file) => file.path)
    .sort()
  if (JSON.stringify(files) !== JSON.stringify(receipt.analysis.records.map((record) => record.file).sort()))
    throw new Error("Source analysis has missing or duplicate contributions")
  return receipt.analysis
}
