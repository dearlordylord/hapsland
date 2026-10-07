import { realpathSync } from "node:fs"
import { readPackageGraph } from "./package-graph.mjs"
import { resolveBunRuntime } from "./pinned-bun.mjs"
import { join, resolve } from "node:path"
import { defineConfig } from "vitest/config"
import { inventoryTestHarness } from "./test-harness/inventory.mjs"
import { testDiscovery } from "./test-harness/test-scope.mjs"
import { UNIT_TEST_TIMEOUT_MS } from "./test-harness/policy.mjs"

const repositoryRoot = resolve(import.meta.dirname, "..")

// Keep fixture sockets within macOS path limits and remove /var aliases.
if (process.platform === "darwin") process.env.TMPDIR = realpathSync("/tmp")

process.env.HAPSLAND_BUILD_BUN = resolveBunRuntime().executable
// Keep runtime transpilation outside isolated product homes.
process.env.BUN_RUNTIME_TRANSPILER_CACHE_PATH = join(repositoryRoot, ".test-runs", "bun-transpiler-cache")

const focusedSelection = process.env.HAPSLAND_FOCUSED_TEST_SELECTION
const selectedFiles = focusedSelection ? JSON.parse(focusedSelection).files : undefined

export default defineConfig({
  root: repositoryRoot,
  test: {
    reporters: ["default", join(repositoryRoot, "scripts/test-harness/immediate-errors.mjs")],
    testTimeout: UNIT_TEST_TIMEOUT_MS,
    setupFiles: [join(repositoryRoot, "scripts/test-harness/setup.mts")],
    provide: { harnessInventory: inventoryTestHarness(repositoryRoot, selectedFiles) },
    ...testDiscovery(selectedFiles),
    coverage: {
      provider: "custom",
      customProviderModule: join(repositoryRoot, "scripts/coverage-provider.mjs"),
      autoAttachSubprocess: true,
      reporter: ["json", "text-summary"],
      reportOnFailure: true,
      include: [
        "src/**/*.ts",
        "scripts/test-support/**/*.ts",
        ...[...readPackageGraph(repositoryRoot).packages.values()].map((node) => `${node.directory}/src/**/*.ts`)
      ],
      exclude: ["**/*.test.ts", "**/*.d.ts"]
    }
  }
})
