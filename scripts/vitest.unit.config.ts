import { defineConfig } from "vitest/config"
import { readPackageGraph, resolveDevelopmentWorkspaceSource } from "./package-graph.mjs"
import { dirname, resolve } from "node:path"
import { existsSync } from "node:fs"
import { readBendPrecompile } from "./bend-precompile-inputs.mjs"

const root = resolve(import.meta.dirname, "..")
const graph = readPackageGraph(root)
const privateCores = new Map(
  [...graph.packages.values()].flatMap((node) =>
    (readBendPrecompile(root, node)?.artifacts ?? []).map(({ output }) => [
      resolve(node.path, "src", output),
      resolve(node.path, "dist", output)
    ])
  )
)

export default defineConfig({
  root,
  plugins: [
    {
      name: "hapsland-unit-source",
      enforce: "pre",
      resolveId(specifier, importer) {
        if (specifier.startsWith("@hapsland/")) return resolveDevelopmentWorkspaceSource(graph, specifier)
        const emitted =
          importer && specifier.startsWith(".") ? privateCores.get(resolve(dirname(importer), specifier)) : undefined
        if (emitted) {
          if (!existsSync(emitted)) throw new Error("Build workspaces before testing a private Bend core: " + emitted)
          return emitted
        }
      }
    }
  ],
  test: { include: ["src/**/*.unit.test.ts"], testTimeout: 5_000 }
})
