import {
  nativeTaskDirectory,
  readNativeTaskInputs,
  observeNativeTaskInputs,
  nativeDigest
} from "./native-task-inputs.mjs"
import { nativeDirectoryInventory, nativeToolSelection, nativeToolNames } from "./native-toolchain-inputs.mjs"
import { createHash } from "node:crypto"
import { realpathSync, existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileEvidence, fileInventory } from "./compiler-evidence.mjs"
export const nativeReceiptDigest = ({ digest: _digest, ...receipt }) =>
  createHash("sha256").update(JSON.stringify(receipt)).digest("hex")
// Current context is supplied by the producer; cached context is never authority.
export function checkNativeReceipt(root, receipt, context, source, output) {
  if (
    !receipt ||
    receipt.digest !== nativeReceiptDigest(receipt) ||
    JSON.stringify(receipt.context) !== JSON.stringify(context)
  )
    throw new Error("Missing, corrupt or stale native receipt")
  if (
    !Array.isArray(receipt.toolSelections) ||
    JSON.stringify(receipt.toolSelections.map((tool) => tool.name)) !== JSON.stringify(nativeToolNames)
  )
    throw new Error("Missing or invalid native tool selection evidence")
  for (const tool of receipt.toolSelections) {
    if (["cc", "pkg-config", "ldd"].includes(tool.name) && tool.command !== tool.name)
      throw new Error("Invalid native tool command selection")
    const { name: _name, ...recorded } = tool
    const actual = nativeToolSelection(root, tool.command, context.environment)
    if (JSON.stringify(actual) !== JSON.stringify(recorded))
      throw new Error(`Native tool selection changed: ${tool.name}`)
  }
  const evidence = []
  for (const owner of ["headers", "linker", "tools", "toolLibraries", "resolution"]) {
    const inputs = receipt[owner]
    if (!Array.isArray(inputs) || !inputs.length) throw new Error(`Missing native ${owner} evidence`)
    const seen = new Set()
    for (const input of inputs) {
      if (!input?.path || seen.has(input.requested ?? input.path))
        throw new Error(`Duplicate or invalid native ${owner} evidence`)
      seen.add(input.requested ?? input.path)
      evidence.push(input)
    }
  }
  if (
    JSON.stringify(receipt.tools.map((tool) => tool.name)) !==
    JSON.stringify(nativeToolNames.filter((name) => name !== "ldd"))
  )
    throw new Error("Missing or invalid native selected tool evidence")
  for (const tool of receipt.tools) {
    const selected = receipt.toolSelections.find((selection) => selection.name === tool.name)
    if (
      tool.requested !== selected.requested ||
      tool.path !== selected.path ||
      tool.mode !== selected.mode ||
      tool.sha256 !== selected.sha256
    )
      throw new Error("Native selected tool differs from resolution evidence")
  }
  if (!receipt.headers.some((input) => input.path === fileEvidence(root, source).path))
    throw new Error("Native source contribution is missing")
  if (receipt.output?.path !== fileEvidence(root, output).path) throw new Error("Native output identity differs")
  evidence.push(receipt.output)
  for (const input of evidence) {
    const actual = fileEvidence(
      root,
      input.requested ? realpathSync(resolve(root, input.requested)) : resolve(root, input.path)
    )
    if (actual.path !== input.path || actual.mode !== input.mode || actual.sha256 !== input.sha256)
      throw new Error(`Stale native input or output: ${input.path}`)
  }
  if (!Array.isArray(receipt.search) || !receipt.search.length) throw new Error("Missing native search evidence")
  for (const directory of receipt.search) {
    const path = resolve(root, directory.path)
    const entries = nativeDirectoryInventory(path, directory.recursive === true)
    if (JSON.stringify(entries) !== JSON.stringify(directory.entries))
      throw new Error(`Native search directory changed: ${directory.path}`)
  }
  return receipt
}

export function validateNativeBinary(path, profile) {
  const bytes = readFileSync(path)
  const elf =
    bytes.length >= 20 && bytes.subarray(0, 4).toString("hex") === "7f454c46" && bytes.readUInt16LE(18) === 183
  const magic = bytes.subarray(0, 4).toString("hex")
  const mach =
    bytes.length >= 8 &&
    ["cffaedfe", "feedfacf"].includes(magic) &&
    (magic === "cffaedfe" ? bytes.readUInt32LE(4) : bytes.readUInt32BE(4)) === 0x0100000c
  if (!(profile === "linux-arm64" ? elf : mach))
    throw new Error(`Native artifact has the wrong format or architecture: ${profile}/${path}`)
}
export async function checkNativeTaskReceipt(root, graph, plan, options = {}) {
  const directory = nativeTaskDirectory(plan.node, plan.profile)
  const path = resolve(directory, ".native-task-receipt.json")
  if (!existsSync(path)) throw new Error(`Missing native task receipt: ${plan.node.manifest.name}/${plan.profile}`)
  const receipt = JSON.parse(readFileSync(path, "utf8"))
  const { digest, ...body } = receipt
  const inputs = readNativeTaskInputs(root, plan.node, plan.profile)
  if (
    receipt.format !== 1 ||
    digest !== nativeDigest(body) ||
    receipt.owner !== plan.node.manifest.name ||
    receipt.profile !== plan.profile ||
    JSON.stringify(receipt.inputs) !== JSON.stringify(inputs)
  )
    throw new Error("Missing, corrupt or stale native task receipt")
  if (
    JSON.stringify(await observeNativeTaskInputs(root, graph, plan, options.environment ?? process.env, inputs)) !==
    JSON.stringify(inputs)
  )
    throw new Error("Native task inputs changed")
  const outputs = fileInventory(root, directory).filter((entry) => resolve(root, entry.path) !== path)
  if (
    JSON.stringify(outputs) !== JSON.stringify(receipt.outputs) ||
    outputs.length !== plan.assets.length ||
    outputs.some((entry) => !plan.assets.some((asset) => asset.output === resolve(root, entry.path)))
  )
    throw new Error("Native task output inventory changed")
  if (
    !Array.isArray(receipt.compilations) ||
    receipt.compilations.length !== inputs.assets.filter((asset) => asset.mode === "compiled").length
  )
    throw new Error("Incomplete native compilation evidence")
  for (const asset of inputs.assets) {
    const output = resolve(root, asset.output)
    validateNativeBinary(output, plan.profile)
    const evidence = fileEvidence(root, output)
    if (evidence.mode !== 0o755) throw new Error("Native artifact mode differs")
    if (asset.mode !== "compiled" && evidence.sha256 !== asset.input.selected.sha256)
      throw new Error("Native retained/selected artifact differs from its input")
    if (asset.mode === "compiled") {
      const compilation = receipt.compilations.find((entry) => entry.output.path === asset.output)
      if (!compilation) throw new Error("Native compiler contribution missing")
      if (plan.profile === "linux-arm64")
        checkNativeReceipt(root, compilation, asset.input.context, resolve(root, asset.input.context.source), output)
      else if (
        compilation.cacheable !== false ||
        JSON.stringify(compilation.context) !== JSON.stringify(asset.input.context) ||
        JSON.stringify(compilation.output) !== JSON.stringify(evidence)
      )
        throw new Error("Uncached Darwin compilation evidence differs")
    }
  }
  return receipt
}
