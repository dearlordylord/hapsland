import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        dashboard: fileURLToPath(new URL("./index.html", import.meta.url)),
        site: fileURLToPath(new URL("./site.html", import.meta.url))
      }
    }
  },
  resolve: {
    // Configuration schemas and browser decoders must share Effect's runtime
    // identities even when the root and this package have separate installs.
    dedupe: ["effect"],
    alias: {
      "@hapsland/agent-flow-projection": fileURLToPath(
        new URL("../agent-flow-projection/src/index.ts", import.meta.url)
      )
    }
  }
})
