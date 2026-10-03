import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Coverage instruments native subprocesses as well as test workers. This
    // watchdog bounds the test runner, not product deadlines or performance.
    testTimeout: process.argv.includes("--coverage") ? 30_000 : 5_000,
    include: [
      "src/**/*.test.ts",
      "scripts/**/*.test.mts",
      "packages/monkey-business/src/**/*.test.ts",
    ],
    exclude: ["vendor/**", "node_modules/**"],
    coverage: {
      provider: "custom",
      customProviderModule: "./scripts/coverage-provider.mjs",
      autoAttachSubprocess: true,
      reporter: ["json", "text-summary"],
      reportOnFailure: true,
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts"],
    },
  },
});
