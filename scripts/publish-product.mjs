import { randomUUID } from "node:crypto"
import { chmodSync, copyFileSync, existsSync, mkdirSync, realpathSync, renameSync, rmSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileEvidence, fileInventory } from "./compiler-evidence.mjs"

const pathParts = (path) => {
  if (typeof path !== "string" || !path || path.includes("\\") || path.startsWith("/"))
    throw new Error("Invalid publication path")
  const parts = path.split("/")
  if (parts.some((part) => !part || part === "." || part === "..")) throw new Error("Invalid publication path")
  return parts
}

export const revokePublishedProduct = (root) => rmSync(resolve(root, "dist"), { recursive: true, force: true })

// Cached producers own private artifacts. Only this uncached transaction exposes
// the complete release tree, after its caller has validated every owner receipt.
export async function publishProduct(root, mappings, guard) {
  if (!Array.isArray(mappings) || !mappings.length || typeof guard !== "function")
    throw new Error("Publication requires a complete inventory and a fresh guard")
  const destinations = new Set()
  const profiles = new Set()
  const canonicalRoot = realpathSync(root)
  for (const mapping of mappings) {
    const parts = pathParts(mapping.publicPath)
    pathParts(mapping.path)
    if (
      !(parts[0] === "dist" && parts.length > 1) &&
      !(parts[0] === "native" && parts[1] === "prebuilt" && /^(linux|darwin)-arm64$/.test(parts[2]) && parts.length > 3)
    )
      throw new Error("Publication destination escapes release ownership")
    if (destinations.has(mapping.publicPath)) throw new Error("Duplicate publication destination")
    destinations.add(mapping.publicPath)
    if (parts[0] === "native") profiles.add(parts[2])
    const source = realpathSync(resolve(root, mapping.path))
    if (!source.startsWith(canonicalRoot + "/packages/")) throw new Error("Publication source escapes private owners")
    const actual = fileEvidence(root, resolve(root, mapping.path))
    if (actual.mode !== mapping.mode || actual.sha256 !== mapping.sha256)
      throw new Error(`Publication source changed: ${mapping.path}`)
  }
  if (![...destinations].some((path) => path.startsWith("dist/"))) throw new Error("Publication omits the release tree")
  const stage = resolve(root, ".test-runs", `publication-${randomUUID()}`)
  mkdirSync(stage, { recursive: true, mode: 0o700 })
  let published = false
  try {
    await guard("prepare")
    for (const mapping of mappings) {
      const source = fileEvidence(root, resolve(root, mapping.path))
      if (source.sha256 !== mapping.sha256 || source.mode !== mapping.mode)
        throw new Error(`Publication source changed: ${mapping.path}`)
    }
    for (const mapping of mappings) {
      const destination = resolve(stage, mapping.publicPath)
      mkdirSync(dirname(destination), { recursive: true })
      copyFileSync(resolve(root, mapping.path), destination)
      chmodSync(destination, mapping.mode)
      const copied = fileEvidence(stage, destination)
      if (copied.sha256 !== mapping.sha256 || copied.mode !== mapping.mode)
        throw new Error(`Publication copy changed: ${mapping.path}`)
      const source = fileEvidence(root, resolve(root, mapping.path))
      if (source.sha256 !== mapping.sha256 || source.mode !== mapping.mode)
        throw new Error(`Publication source changed: ${mapping.path}`)
    }
    const expected = mappings
      .map(({ publicPath: path, mode, sha256 }) => ({ path, mode, sha256 }))
      .filter((file) => file.path.startsWith("dist/"))
      .sort((a, b) => a.path.localeCompare(b.path))
    const actual = fileInventory(stage, resolve(stage, "dist")).sort((a, b) => a.path.localeCompare(b.path))
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error("Publication inventory disagrees with staged release")
    await guard("staged")
    for (const mapping of mappings) {
      const source = fileEvidence(root, resolve(root, mapping.path))
      if (source.sha256 !== mapping.sha256 || source.mode !== mapping.mode)
        throw new Error(`Publication source changed: ${mapping.path}`)
    }
    // Native paths are the installed layout. They are exposed before dist, so a
    // failed transaction never leaves an installable release with stale natives.
    for (const profile of profiles) {
      const destination = resolve(root, "native/prebuilt", profile)
      if (existsSync(destination)) fileInventory(root, destination)
      const selected = mappings.filter((mapping) => mapping.publicPath.startsWith(`native/prebuilt/${profile}/`))
      for (const mapping of selected) {
        const output = resolve(root, mapping.publicPath)
        mkdirSync(dirname(output), { recursive: true })
        if (!realpathSync(dirname(output)).startsWith(canonicalRoot + "/native/prebuilt/"))
          throw new Error("Native publication destination escapes release ownership")
        // File rename preserves live users of the previous inode and never
        // removes the helper path while a replacement is being published.
        renameSync(resolve(stage, mapping.publicPath), output)
      }
      const keep = new Set(selected.map((mapping) => mapping.publicPath))
      for (const file of fileInventory(root, destination)) if (!keep.has(file.path)) rmSync(resolve(root, file.path))
    }
    // All freshness guards finish before the complete dist tree becomes visible.
    await guard("publish")
    for (const mapping of mappings) {
      const source = fileEvidence(root, resolve(root, mapping.path))
      if (source.sha256 !== mapping.sha256 || source.mode !== mapping.mode)
        throw new Error(`Publication source changed: ${mapping.path}`)
      const candidate = fileEvidence(
        mapping.publicPath.startsWith("dist/") ? stage : root,
        resolve(mapping.publicPath.startsWith("dist/") ? stage : root, mapping.publicPath)
      )
      if (candidate.sha256 !== mapping.sha256 || candidate.mode !== mapping.mode)
        throw new Error(`Publication candidate changed: ${mapping.publicPath}`)
    }
    revokePublishedProduct(root)
    renameSync(resolve(stage, "dist"), resolve(root, "dist"))
    published = true
    for (const mapping of mappings) {
      const source = fileEvidence(root, resolve(root, mapping.path))
      if (source.sha256 !== mapping.sha256 || source.mode !== mapping.mode)
        throw new Error(`Publication source changed: ${mapping.path}`)
      const output = fileEvidence(root, resolve(root, mapping.publicPath))
      if (output.sha256 !== mapping.sha256 || output.mode !== mapping.mode)
        throw new Error(`Published output changed: ${mapping.publicPath}`)
    }
    return expected
  } catch (error) {
    if (published) revokePublishedProduct(root)
    throw error
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
}
