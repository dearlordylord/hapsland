import { createHash } from "node:crypto"
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  chmodSync,
  renameSync,
  rmSync,
  mkdtempSync,
  lstatSync,
  readdirSync
} from "node:fs"
import { resolve, dirname, relative } from "node:path"
import { createRequire } from "node:module"
import { validateNativeBinary } from "./native-task-receipt.mjs"

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")
const producers = [
  "native-input-bundle",
  "native-binding-source",
  "native-task",
  "native-task-inputs",
  "native-task-receipt",
  "native-compiler-inputs",
  "native-linker-inputs",
  "native-toolchain-inputs",
  "native-header-search",
  "native-artifact",
  "compiler-evidence",
  "build-process"
]
export function nativeInputRecipe(root, plans, profile) {
  const sourceInventory = (directory) => {
    const files = []
    const walk = (path) => {
      for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        // node-gyp writes addon Makefiles beside build/; the actual addon headers are inventoried separately.
        if (["build", "prebuilds", "node_modules", "node-addon-api"].includes(entry.name)) continue
        const file = resolve(path, entry.name)
        if (entry.isDirectory()) walk(file)
        else if (entry.isFile()) files.push({ path: relative(directory, file), sha256: sha256(readFileSync(file)) })
        else throw new Error(`Unsupported parser source file: ${file}`)
      }
    }
    walk(directory)
    return files
  }
  const assets = plans.flatMap((plan) =>
    plan.assets
      .filter(({ asset }) => asset.producer.kind === "c" || asset.producer.profiles[profile].sourceBuild === true)
      .map(({ asset, installedPath }) => {
        if (asset.producer.kind === "c")
          return {
            path: installedPath,
            producer: asset.producer.profiles[profile],
            sourceSha256: sha256(readFileSync(resolve(root, asset.producer.profiles[profile].source)))
          }
        const require = createRequire(resolve(plan.node.path, "package.json"))
        const packageRoot = dirname(require.resolve(`${asset.producer.package}/package.json`))
        const addonRoot = dirname(
          createRequire(resolve(packageRoot, "package.json")).resolve("node-addon-api/package.json")
        )
        return {
          path: installedPath,
          producer: asset.producer,
          lockSha256: sha256(readFileSync(resolve(root, "bun.lock"))),
          sources: sourceInventory(packageRoot),
          headers: sourceInventory(addonRoot)
        }
      })
  )
  const tooling = producers.map((name) => ({
    path: `scripts/${name}.mjs`,
    sha256: sha256(readFileSync(resolve(root, `scripts/${name}.mjs`)))
  }))
  const recipe = { format: 1, profile, node: "24.20.0", assets, tooling }
  return { ...recipe, digest: sha256(JSON.stringify(recipe)) }
}
export const nativeInputDirectory = (root, recipe) =>
  resolve(root, ".test-runs/native-inputs", recipe.profile, recipe.digest)
export function readNativeInputBundle(directory, recipe, { transport = false } = {}) {
  const manifest = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8"))
  if (
    manifest.format !== 1 ||
    JSON.stringify(manifest.recipe) !== JSON.stringify(recipe) ||
    manifest.assets.length !== recipe.assets.length
  )
    throw new Error("Native input bundle does not match current source recipe")
  for (const [index, declaration] of recipe.assets.entries()) {
    const asset = manifest.assets[index]
    const path = resolve(directory, declaration.path)
    if (
      asset.path !== declaration.path ||
      !lstatSync(path).isFile() ||
      asset.mode !== 0o755 ||
      (!transport && (lstatSync(path).mode & 0o777) !== asset.mode) ||
      sha256(readFileSync(path)) !== asset.sha256
    )
      throw new Error(`Native input bundle changed: ${declaration.path}`)
    validateNativeBinary(path, recipe.profile)
  }
  return manifest
}
export function retainNativeInputBundle(root, recipe, files) {
  const directory = nativeInputDirectory(root, recipe)
  mkdirSync(dirname(directory), { recursive: true })
  const staging = mkdtempSync(resolve(dirname(directory), ".bundle-"))
  try {
    const assets = recipe.assets.map((asset, index) => {
      const target = resolve(staging, asset.path)
      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(files[index], target)
      chmodSync(target, 0o755)
      return { path: asset.path, mode: 0o755, sha256: sha256(readFileSync(target)) }
    })
    writeFileSync(resolve(staging, "manifest.json"), `${JSON.stringify({ format: 1, recipe, assets }, null, 2)}\n`)
    readNativeInputBundle(staging, recipe)
    rmSync(directory, { recursive: true, force: true })
    renameSync(staging, directory)
    return directory
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}
export function foreignNativeInput(root, plans, profile, installedPath) {
  const recipe = nativeInputRecipe(root, plans, profile)
  const directory = nativeInputDirectory(root, recipe)
  try {
    readNativeInputBundle(directory, recipe)
  } catch (error) {
    throw new Error(
      `Missing, stale or corrupt ${profile} native inputs. Run npm run native:inputs -- fetch ${profile}, or import a bundle built from these sources. ${error.message}`
    )
  }
  return { path: resolve(directory, installedPath), recipe }
}
