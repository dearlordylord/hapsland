import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { fileEvidence, fileInventory } from "./compiler-evidence.mjs"
import { compilerContext, readCompilerToolchain } from "./compiler-context.mjs"
import { readPackageGraph } from "./package-graph.mjs"
import { checkBendProducerReceipt } from "./bend-producer.mjs"

const freezeObservation = (value) => {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeObservation(child)
    Object.freeze(value)
  }
  return value
}
export const checkCompilerReceipts = (root) => {
  const graph = readPackageGraph(root)
  const toolchain = freezeObservation(readCompilerToolchain(root))
  for (const node of graph.packages.values()) {
    if (node.compiler === "bend") {
      checkBendProducerReceipt(root, node)
      continue
    }
    const receiptPath = resolve(node.path, "dist/.compile-receipt.json")
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"))
    if (
      receipt.package !== node.manifest.name ||
      receipt.host !== node.manifest.hapsland.host ||
      !Array.isArray(receipt.inputs) ||
      !receipt.inputs.length ||
      !Array.isArray(receipt.outputs) ||
      !receipt.outputs.length
    )
      throw new Error(`Invalid compiler receipt: ${node.manifest.name}`)
    if (JSON.stringify(receipt.context) !== JSON.stringify(compilerContext(root, node, toolchain)))
      throw new Error(`Stale compiler context: ${node.manifest.name}`)
    for (const input of receipt.inputs) {
      const actual = fileEvidence(root, resolve(root, input.path))
      if (JSON.stringify(actual) !== JSON.stringify(input))
        throw new Error(`Stale compiler input: ${node.manifest.name}: ${input.path}`)
    }
    const outputs = fileInventory(node.path, resolve(node.path, "dist")).filter(
      (entry) => entry.path !== "dist/.compile-receipt.json"
    )
    if (JSON.stringify(outputs) !== JSON.stringify(receipt.outputs))
      throw new Error(`Corrupt or stale compiler outputs: ${node.manifest.name}`)
  }
  if (JSON.stringify(toolchain) !== JSON.stringify(readCompilerToolchain(root)))
    throw new Error("Compiler toolchain changed during receipt validation")
  return graph.packages.size
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(`Validated ${checkCompilerReceipts(resolve(import.meta.dirname, ".."))} compiler receipts`)
