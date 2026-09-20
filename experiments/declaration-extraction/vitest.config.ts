import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["experiments/declaration-extraction/extract.test.ts"],
    exclude: ["vendor/**", "node_modules/**"],
    testTimeout: 30_000,
  },
});
