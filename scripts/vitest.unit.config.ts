import { defineConfig } from "vitest/config"
import { readPackageGraph, resolveDevelopmentWorkspaceSource } from "./package-graph.mjs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const graph = readPackageGraph(root)

export default defineConfig({
  root,
  plugins: [
    {
      name: "hapsland-unit-source",
      enforce: "pre",
      resolveId(specifier) {
        if (specifier.startsWith("@hapsland/")) return resolveDevelopmentWorkspaceSource(graph, specifier)
      }
    }
  ],
  test: { include: ["src/**/*.unit.test.ts"], testTimeout: 5_000 }
})
