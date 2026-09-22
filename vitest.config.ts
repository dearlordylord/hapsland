import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.mts"],
    exclude: ["vendor/**", "node_modules/**"],
  },
});
