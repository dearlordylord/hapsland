import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

export default defineConfig({
  // Worktrees can share node_modules, but optimizer caches include checkout paths.
  cacheDir: fileURLToPath(new URL("../../.test-runs/vite-agent-flow-viz/", import.meta.url)),
  base: "./",
  build: { rollupOptions: { input: { dashboard: fileURLToPath(new URL("./index.html", import.meta.url)) } } },
  resolve: {
    // Configuration schemas and browser decoders must share Effect's runtime
    // identities even when the root and this package have separate installs.
    dedupe: ["effect"],
    alias: [
      {
        find: /^@hapsland\/agent-flow-projection$/,
        replacement: fileURLToPath(new URL("../agent-flow-projection/src/index.ts", import.meta.url))
      }
    ]
  }
})
