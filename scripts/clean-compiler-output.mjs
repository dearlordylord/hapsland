import { lstatSync, realpathSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readPackageGraph } from "./package-graph.mjs"
import { withBuildLock } from "./build-lock.mjs"

/** Uncached Turbo prerequisite: restoration replaces an exact owner inventory. */
export async function cleanCompilerOutput(root, ownerPath = process.cwd()) {
  const canonicalRoot = realpathSync(root)
  return withBuildLock(canonicalRoot, async () => {
    const graph = readPackageGraph(canonicalRoot)
    const owner = [...graph.packages.values()].find((node) => node.path === resolve(ownerPath))
    if (!owner || !["typescript", "bend"].includes(owner.compiler))
      throw new Error("Compiler cleanup requires a declared production compiler owner")
    const directory = resolve(canonicalRoot, owner.directory)
    if (
      lstatSync(directory).isSymbolicLink() ||
      realpathSync(directory) !== directory ||
      !directory.startsWith(canonicalRoot + "/packages/")
    )
      throw new Error("Compiler cleanup owner escapes its physical boundary")
    const output = resolve(directory, "dist")
    try {
      if (lstatSync(output).isSymbolicLink()) throw new Error("Compiler cleanup output symlink is unsupported")
    } catch (error) {
      if (error.code !== "ENOENT") throw error
    }
    // rm does not traverse nested symlinks; public dist and sibling artifacts
    // are never destinations of this owner-local operation.
    rmSync(output, { recursive: true, force: true })
  })
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error("Compiler cleanup takes no arguments")
  await cleanCompilerOutput(resolve(import.meta.dirname, ".."))
}
