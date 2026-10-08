import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from "node:fs"
import { resolve } from "node:path"
import { createHash } from "node:crypto"
import { pathToFileURL } from "node:url"
export async function createBendReceiptFixture(root, repositoryRoot) {
  const producer = await import(pathToFileURL(resolve(repositoryRoot, "scripts/bend-producer.mjs")))
  const { fileInventory } = await import(pathToFileURL(resolve(repositoryRoot, "scripts/compiler-evidence.mjs")))
  const directory = resolve(root, "packages/agent-flow-bend")
  for (const child of ["scripts", "abi", "dist", "request-content"])
    mkdirSync(resolve(directory, child), { recursive: true })
  mkdirSync(resolve(root, "scripts"), { recursive: true })
  for (const name of [
    "bend-producer.mjs",
    "authored-task-inputs.mjs",
    "package-graph.mjs",
    "bend-toolchain.mjs",
    "source-loader-policy.mjs",
    "compiler-evidence.mjs",
    "native-toolchain-inputs.mjs",
    "build-process.mjs",
    "build-lock.mjs",
    "build-custody-gate.mjs",
    "build-groups.mjs",
    "owned-lock.mjs",
    "pure-bend-artifact.mjs"
  ])
    copyFileSync(resolve(repositoryRoot, "scripts", name), resolve(root, "scripts", name))
  mkdirSync(resolve(root, "native/src"), { recursive: true })
  copyFileSync(resolve(repositoryRoot, "native/src/inspection-lock.c"), resolve(root, "native/src/inspection-lock.c"))
  const manifestPath = resolve(directory, "package.json")
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  const authority = JSON.parse(readFileSync(resolve(repositoryRoot, "packages/agent-flow-bend/package.json"), "utf8"))
  manifest.hapsland = { ...manifest.hapsland, toolchain: authority.hapsland.toolchain }
  writeFileSync(manifestPath, JSON.stringify(manifest))
  for (const name of ["CanonicalRuntime.bend", "ImportGraphRuntime.bend", "request-content/Runtime.bend"])
    writeFileSync(resolve(directory, name), "import Base\n")
  const policies = [
    "credential",
    "login",
    "verification",
    "update",
    "setup",
    "maintenance",
    "rules",
    "setup-selection",
    "selection-ui"
  ]
  for (const policy of policies) {
    const policyDirectory = resolve(directory, policy + "-policy")
    mkdirSync(policyDirectory, { recursive: true })
    writeFileSync(resolve(policyDirectory, "core.bend"), "import Base\n")
    writeFileSync(resolve(policyDirectory, "PROOF.bend"), "import Base\nimport ./core.bend as Core\n")
  }
  for (const name of [
    "build-canonical.mjs",
    "build-import-graph.mjs",
    "build-request-content.mjs",
    ...policies.map((policy) => "build-" + policy + "-policy.mjs")
  ])
    writeFileSync(resolve(directory, "scripts", name), "// Fixture generator identity\n")
  for (const name of producer.bendProducerOutputs.filter((name) => name.endsWith(".d.ts"))) {
    writeFileSync(resolve(directory, "abi", name), "export declare const fixture: number;\n")
    writeFileSync(resolve(directory, "dist", name), "export declare const fixture: number;\n")
  }
  for (const name of producer.bendProducerOutputs.filter((name) => name.endsWith(".js")))
    writeFileSync(resolve(directory, "dist", name), "export const fixture = 1;\n")
  const context = await producer.bendProducerContext(root, { path: directory })
  const outputs = fileInventory(root, resolve(directory, "dist"))
  const loaders = outputs
    .filter((item) => item.path.endsWith(".js"))
    .map((item) => ({
      path: item.path,
      ...producer.bendGeneratedLoaderEvidence(readFileSync(resolve(root, item.path), "utf8"), item.path)
    }))
  const body = { format: 1, context, outputs, loaders }
  const receipt = { ...body, digest: createHash("sha256").update(JSON.stringify(body)).digest("hex") }
  writeFileSync(resolve(directory, "dist/.bend-receipt.json"), JSON.stringify(receipt))
  producer.checkBendProducerReceipt(root, { path: directory })
  return receipt
}
