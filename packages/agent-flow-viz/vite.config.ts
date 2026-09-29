import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@hapsland/agent-flow-projection": fileURLToPath(new URL("../agent-flow-projection/src/index.ts", import.meta.url)),
    },
  },
});
