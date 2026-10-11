import { copyFileSync, mkdirSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"
import { bendProducerToolchain, bendProducerEnvironment, bendGeneratedLoaderEvidence } from "./bend-producer.mjs"
import { readBendPrecompile } from "./bend-precompile-inputs.mjs"

/** Emit into caller-owned staging, inside the existing package build lease. */
export async function emitBendPrecompile(root, node, stage, expected) {
  const recipe = readBendPrecompile(root, node)
  if (!recipe) return []
  const before = await bendProducerToolchain(root)
  if (JSON.stringify(before) !== JSON.stringify(expected)) throw new Error("Stale Bend precompile toolchain")
  const env = bendProducerEnvironment(root)
  const results = []
  for (const artifact of recipe.artifacts) {
    const output = resolve(stage, artifact.output)
    mkdirSync(dirname(output), { recursive: true })
    const executable = resolve(root, before.bend.path)
    const args = [artifact.source, "-o", output]
    const result = spawnSync(executable, args, {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 16 * 1024 * 1024
    })
    if (result.error || result.status !== 0)
      throw new Error(`Bend precompile failed: ${artifact.source}: ${result.stderr ?? ""}`, { cause: result.error })
    const loaders = bendGeneratedLoaderEvidence(readFileSync(output, "utf8"), artifact.output)
    if (loaders.modules.length || loaders.libraries.length || loaders.symbols.length)
      throw new Error("Preparation precompile must remain a pure artifact")
    const core = (await import(pathToFileURL(output))).default
    if (!["initial", "advance", "resume"].every((name) => typeof core?.[name] === "function"))
      throw new Error("Bend precompile entry ABI changed")
    copyFileSync(artifact.declaration, output.replace(/\.js$/, ".d.ts"))
    results.push({ output: artifact.output, loaders })
  }
  const after = await bendProducerToolchain(root)
  if (JSON.stringify(after) !== JSON.stringify(before))
    throw new Error("Bend precompile toolchain changed during emission")
  return results
}
