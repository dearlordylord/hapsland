import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { resolve, dirname, relative, isAbsolute } from "node:path"
import { fileURLToPath } from "node:url"

const source = dirname(fileURLToPath(import.meta.url))
if (process.argv.length > 3) throw new Error("Use restore-sources.mjs [destination]")
const destination = resolve(process.argv[2] ?? resolve(source, "../../evidence/bend-strangler"))
const inventory = JSON.parse(readFileSync(resolve(source, "source-inventory.json"), "utf8"))
const digest = bytes => createHash("sha256").update(bytes).digest("hex")
const owned = (root, name) => {
  const path = resolve(root, name)
  const child = relative(root, path)
  if (!child || child === ".." || child.startsWith("../") || isAbsolute(child)) throw new Error("Escaped source path")
  return path
}
const checked = inventory.sources.map(item => {
  const bytes = readFileSync(owned(source, item.capture))
  if (digest(bytes) !== item.sha256) throw new Error(`Changed capture: ${item.path}`)
  const target = owned(destination, item.path)
  if (existsSync(target) && digest(readFileSync(target)) !== item.sha256)
    throw new Error(`Current work differs; preserved without overwrite: ${item.path}`)
  return { target, bytes }
})
let restored = 0
for (const { target, bytes } of checked) {
  if (existsSync(target)) continue
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, bytes, { flag: "wx" })
  restored++
}
console.log(`Verified ${checked.length} source captures; restored ${restored} missing files`)
