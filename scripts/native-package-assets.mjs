import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
const hash = (value) => createHash("sha256").update(value).digest("hex")

// Documentation/evidence updates do not change the observed production runtime inventory.
export const nativePackageAssetsDigest = (packageRoot) => {
  const assets = []
  const visit = (path, prefix, onlyJavaScript = false) => {
    if (!existsSync(path)) return
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name),
        name = `${prefix}/${entry.name}`
      if (entry.isDirectory()) visit(child, name, onlyJavaScript)
      else if (!onlyJavaScript || entry.name.endsWith(".js")) assets.push([name, hash(readFileSync(child))])
    }
  }
  visit(join(packageRoot, "dist"), "dist")
  visit(join(packageRoot, "native", "prebuilt"), "native/prebuilt")
  visit(join(packageRoot, "schemas"), "schemas")
  for (const name of ["bin/launch.sh", "package-runtime.json"])
    assets.push([name, hash(readFileSync(join(packageRoot, name)))])
  assets.sort(([a], [b]) => a.localeCompare(b))
  return { sha256: hash(JSON.stringify(assets)), files: assets.length }
}
