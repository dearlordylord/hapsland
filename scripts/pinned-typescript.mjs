import { resolveDeclaredDependencyVersion } from "./package-graph.mjs"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { readFileSync, realpathSync, readdirSync, statSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, resolve, relative } from "node:path"
import { pathToFileURL, fileURLToPath } from "node:url"

const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")
const evidence = (path) => ({ path: realpathSync(path), sha256: hash(path), mode: statSync(path).mode & 0o777 })
const inventory = (directory) =>
  readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name)
      return entry.isDirectory()
        ? inventory(path)
        : entry.isFile()
          ? [evidence(path)]
          : (() => {
              throw new Error(`Unsupported compiler support entry: ${path}`)
            })()
    })
    .sort((a, b) => a.path.localeCompare(b.path))

// Node caches canonical package paths. Re-read the ordered filesystem candidates
// so a package symlink retarget cannot leave the producer bound to an old install.
const resolveCompilerPackage = (require, name) => {
  const candidates = require.resolve.paths(`${name}/package.json`)
  if (!Array.isArray(candidates)) throw new Error(`Unsupported compiler package lookup: ${name}`)
  for (const directory of candidates) {
    const packageDirectory = resolve(directory, name)
    let actualDirectory
    try {
      actualDirectory = realpathSync(packageDirectory)
    } catch (error) {
      if (["ENOENT", "ENOTDIR"].includes(error.code)) continue
      throw error
    }
    if (!statSync(actualDirectory).isDirectory()) throw new Error(`Unsupported compiler package directory: ${name}`)
    const manifest = join(actualDirectory, "package.json")
    if (realpathSync(manifest) !== manifest) throw new Error(`Compiler package metadata escapes its owner: ${name}`)
    const metadata = JSON.parse(readFileSync(manifest, "utf8"))
    if (metadata.exports !== undefined && metadata.exports?.["./package.json"] !== "./package.json")
      throw new Error(`Unsupported compiler package metadata export: ${name}`)
    return manifest
  }
  throw new Error(`Missing declared compiler package: ${name}`)
}

/** Select the declared compiler package, never the shared npm binary link. */
export async function resolvePinnedTypeScript(owner = resolve(import.meta.dirname)) {
  const releaseManifest = JSON.parse(readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8"))
  const manifestPath = resolve(owner, "package.json")
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  const declaration = manifest.dependencies?.typescript ?? manifest.devDependencies?.typescript
  if (declaration !== "catalog:")
    throw new Error(`Compiler owner must declare TypeScript through the root catalog: ${manifestPath}`)
  const expectedVersion = resolveDeclaredDependencyVersion(releaseManifest, "typescript", declaration)
  const require = createRequire(manifestPath)
  const packagePath = resolveCompilerPackage(require, "typescript")
  const metadata = JSON.parse(readFileSync(packagePath, "utf8"))
  if (metadata.name !== "typescript" || metadata.version !== expectedVersion)
    throw new Error(`Selected compiler must be TypeScript ${expectedVersion}`)
  const platformName = `@typescript/typescript-${process.platform}-${process.arch}`
  if (metadata.optionalDependencies?.[platformName] !== expectedVersion)
    throw new Error(`Unsupported declared TypeScript platform: ${platformName}`)
  const compilerRequire = createRequire(packagePath)
  const platformPath = resolveCompilerPackage(compilerRequire, platformName)
  const platform = JSON.parse(readFileSync(platformPath, "utf8"))
  if (platform.name !== platformName || platform.version !== expectedVersion)
    throw new Error("Compiler platform package identity disagrees with TypeScript")
  const helperPath = join(dirname(packagePath), "lib/getExePath.js")
  const { default: getExePath } = await import(pathToFileURL(realpathSync(helperPath)).href)
  const executable = realpathSync(getExePath())
  const expectedExecutable = realpathSync(
    join(dirname(platformPath), "lib", process.platform === "win32" ? "tsc.exe" : "tsc")
  )
  if (executable !== expectedExecutable)
    throw new Error("Compiler helper selected an executable outside its declared platform package")
  const result = spawnSync(executable, ["--version"], { encoding: "utf8", timeout: 5000 })
  if (result.error || result.status !== 0 || result.stdout.trim() !== `Version ${expectedVersion}`)
    throw result.error ?? new Error(`Native compiler version disagrees: ${result.stdout}${result.stderr}`)
  return {
    executable,
    version: expectedVersion,
    identity: {
      owner: manifest.name,
      compiler: evidence(packagePath),
      platform: evidence(platformPath),
      helper: evidence(helperPath),
      executable: evidence(executable),
      support: inventory(dirname(packagePath)).filter(
        (entry) => !relative(dirname(packagePath), entry.path).startsWith(`node_modules/`)
      ),
      platformSupport: inventory(dirname(platformPath))
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const selection = await resolvePinnedTypeScript(process.cwd())
  const result = spawnSync(selection.executable, process.argv.slice(2), { stdio: "inherit", timeout: 180000 })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
}
