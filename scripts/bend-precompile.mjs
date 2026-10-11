import { copyFileSync, mkdirSync, readFileSync, renameSync } from "node:fs"
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
  if (JSON.stringify(before) !== JSON.stringify(expected)) {
    const changed = (a, b, path = "toolchain") => {
      if (JSON.stringify(a) === JSON.stringify(b)) return []
      if (a && b && typeof a === "object" && typeof b === "object")
        return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((key) =>
          changed(a[key], b[key], `${path}.${key}`)
        )
      return [path]
    }
    throw new Error(`Stale Bend precompile toolchain: ${changed(expected, before).join(", ")}`)
  }
  const env = bendProducerEnvironment(root)
  const results = []
  for (const artifact of recipe.artifacts) {
    const output = resolve(stage, artifact.output)
    mkdirSync(dirname(output), { recursive: true })
    const executable = resolve(root, before.bend.path)
    const libraryOutput = output.replace(/\.js$/, ".mjs")
    const args = [artifact.source, "-o", libraryOutput]
    const result = spawnSync(executable, args, {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 16 * 1024 * 1024
    })
    if (result.error || result.status !== 0)
      throw new Error(`Bend precompile failed: ${artifact.source}: ${result.stderr ?? ""}`, { cause: result.error })
    const loaders = bendGeneratedLoaderEvidence(readFileSync(libraryOutput, "utf8"), artifact.output)
    if (loaders.modules.length || loaders.libraries.length || loaders.symbols.length)
      throw new Error("Preparation precompile must remain a pure artifact")
    const core = (await import(pathToFileURL(libraryOutput))).default
    if (!["initial", "advance", "resume"].every((name) => typeof core?.[name] === "function"))
      throw new Error("Bend precompile entry ABI changed")
    renameSync(libraryOutput, output)
    copyFileSync(artifact.declaration, output.replace(/\.js$/, ".d.ts"))
    results.push({ output: artifact.output, loaders })
  }
  const after = await bendProducerToolchain(root)
  if (JSON.stringify(after) !== JSON.stringify(before))
    throw new Error("Bend precompile toolchain changed during emission")
  return results
}
