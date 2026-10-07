import { readFileSync, writeFileSync } from "node:fs"
import { relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readPackageGraph, resolveDeclaredDependencyVersion } from "./package-graph.mjs"

export const generateReleaseIdentity = (root, check = false) => {
  const graph = readPackageGraph(root)
  const bunVersion = resolveDeclaredDependencyVersion(graph.release, "bun", "catalog:")
  const bunTypesVersion = resolveDeclaredDependencyVersion(graph.release, "@types/bun", "catalog:")
  if (graph.release.packageManager !== `bun@${bunVersion}`)
    throw new Error("Package manager must match the authoritative Bun catalog version")
  if (bunTypesVersion !== bunVersion)
    throw new Error("Bun type companion must match the authoritative Bun catalog version")
  const sources = {},
    emitted = {},
    commands = {}
  for (const node of graph.packages.values()) {
    const { role, entry, executable } = node.manifest.hapsland ?? {}
    if (!role) continue
    if (Object.hasOwn(sources, role)) throw new Error(`Duplicate release role: ${role}`)
    if (!entry?.startsWith("src/") || !entry.endsWith(".ts") || !/^[a-z][a-z-]+$/.test(executable))
      throw new Error(`Invalid release role declaration: ${role}`)
    sources[role] = `${node.directory}/${entry}`
    emitted[role] = `${node.directory}/${entry.replace(/^src\//, "dist/").replace(/\.ts$/, ".js")}`
    commands[role] = executable
  }
  const roles = Object.keys(sources).sort()
  if (roles.join(",") !== "cli,doctor,hook,parser,resident")
    throw new Error("Release requires exactly its five executable roles")
  const sorted = (value) => Object.fromEntries(roles.map((role) => [role, value[role]]))
  const source = [
    "// Generated from the release and role package manifests; do not edit.",
    `export const BUN_VERSION = ${JSON.stringify(bunVersion)} as const`,
    `export const RELEASE_VERSION = ${JSON.stringify(graph.release.version)} as const`,
    `export const RELEASE_NAME = ${JSON.stringify(graph.release.name)} as const`,
    `export const SOURCE_ENTRIES = ${JSON.stringify(sorted(sources), null, 2)} as const`,
    `export const EMITTED_ENTRIES = ${JSON.stringify(sorted(emitted), null, 2)} as const`,
    `export const RELEASE_COMMAND_NAMES = ${JSON.stringify(sorted(commands), null, 2)} as const`,
    ""
  ].join("\n")
  const owner = graph.packages.get("@hapsland/runtime-environment")
  if (!owner) throw new Error("Missing release identity domain owner")
  const path = resolve(owner.path, "src/runtime/release-identity.generated.ts")
  if (check) {
    if (readFileSync(path, "utf8") !== source) throw new Error(`Stale release identity: ${relative(root, path)}`)
  } else writeFileSync(path, source)
  return { graph, path, sources: sorted(sources), emitted: sorted(emitted), commands: sorted(commands) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  generateReleaseIdentity(resolve(import.meta.dirname, ".."), process.argv.includes("--check"))
