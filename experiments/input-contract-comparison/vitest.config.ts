import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["experiments/input-contract-comparison/**/*.test.ts"],
    exclude: ["vendor/**", "node_modules/**"],
  },
});
