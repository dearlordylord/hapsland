import { defineConfig } from "vitest/config"
import { inventoryTestHarness } from "./scripts/test-harness/inventory.mjs"
import { testDiscovery } from "./scripts/test-harness/test-scope.mjs"
import { UNIT_TEST_TIMEOUT_MS } from "./scripts/test-harness/policy.mjs"

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
