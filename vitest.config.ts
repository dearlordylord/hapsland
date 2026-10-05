import { defineConfig } from "vitest/config"
import { inventoryTestHarness } from "./scripts/test-harness/inventory.mjs"
import { UNIT_TEST_TIMEOUT_MS } from "./scripts/test-harness/policy.mjs"

const focusedSelection = process.env.HAPSLAND_FOCUSED_TEST_SELECTION
const selectedFiles = focusedSelection ? JSON.parse(focusedSelection).files : undefined

export default defineConfig({
  test: {
    reporters: ["default", "./scripts/test-harness/immediate-errors.mjs"],
    testTimeout: UNIT_TEST_TIMEOUT_MS,
    setupFiles: ["./scripts/test-harness/setup.mts"],
    provide: { harnessInventory: inventoryTestHarness(import.meta.dirname, selectedFiles) },
    include: ["src/**/*.test.ts", "scripts/**/*.test.mts", "packages/monkey-business/src/**/*.test.ts"],
    exclude: ["vendor/**", "node_modules/**"],
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
