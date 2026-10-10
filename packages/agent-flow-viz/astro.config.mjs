import { defineConfig } from "astro/config"

export default defineConfig({
  srcDir: "./site",
  outDir: "./site-dist",
  output: "static",
  devToolbar: { enabled: false }
})
