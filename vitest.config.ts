import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/**/*.test.ts",
      "scripts/**/*.test.mts",
      "packages/monkey-business/src/**/*.test.ts",
    ],
    exclude: ["vendor/**", "node_modules/**"],
  },
});
