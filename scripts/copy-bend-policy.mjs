import { copyFileSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
mkdirSync(resolve(root, "dist/canonical"), { recursive: true })
copyFileSync(
  resolve(root, "src/canonical/canonical.generated.js"),
  resolve(root, "dist/canonical/canonical.generated.js")
)

copyFileSync(
  resolve(root, "src/canonical/import-graph.generated.js"),
  resolve(root, "dist/canonical/import-graph.generated.js")
)

mkdirSync(resolve(root, "dist/review-providers"), { recursive: true })
copyFileSync(
  resolve(root, "src/review-providers/request-content.generated.js"),
  resolve(root, "dist/review-providers/request-content.generated.js")
)
