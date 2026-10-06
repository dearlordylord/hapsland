import { resolveBunRuntime } from "./scripts/pinned-bun.mjs"
import { join } from "node:path"
import { realpathSync } from "node:fs"
import { defineConfig } from "vitest/config"
import { inventoryTestHarness } from "./scripts/test-harness/inventory.mjs"
import { testDiscovery } from "./scripts/test-harness/test-scope.mjs"
import { UNIT_TEST_TIMEOUT_MS } from "./scripts/test-harness/policy.mjs"

// Keep macOS fixture sockets within its 104-byte limit and avoid /var path aliases.
if (process.platform === "darwin") process.env.TMPDIR = realpathSync("/tmp")

process.env.HAPSLAND_BUILD_BUN = resolveBunRuntime().executable
// Keep runtime transpilation outside isolated product homes.
process.env.BUN_RUNTIME_TRANSPILER_CACHE_PATH = join(import.meta.dirname, ".test-runs", "bun-transpiler-cache")

const focusedSelection = process.env.HAPSLAND_FOCUSED_TEST_SELECTION
const selectedFiles = focusedSelection ? JSON.parse(focusedSelection).files : undefined

export default defineConfig({
  test: {
    reporters: ["default", "./scripts/test-harness/immediate-errors.mjs"],
    testTimeout: UNIT_TEST_TIMEOUT_MS,
    setupFiles: ["./scripts/test-harness/setup.mts"],
    provide: { harnessInventory: inventoryTestHarness(import.meta.dirname, selectedFiles) },
    ...testDiscovery(selectedFiles),
    coverage: {
      provider: "custom",
      customProviderModule: "./scripts/coverage-provider.mjs",
      autoAttachSubprocess: true,
      reporter: ["json", "text-summary"],
      reportOnFailure: true,
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts"]
    }
  }
})
