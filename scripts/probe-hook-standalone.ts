import { createHash } from "node:crypto"
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  lstatSync,
  readlinkSync,
  realpathSync,
  writeFileSync
} from "node:fs"
import { join, relative, resolve } from "node:path"
import { physicalNativeBindings } from "../packages/source-analysis/src/direct-event/languages/native-bindings.ts"
import { BUN_VERSION } from "@hapsland/runtime-environment/runtime/bun-runtime"

// Candidate evidence only. This does not wire a production build or publish a release.
const destination = process.argv[2]
if (!destination) throw new Error("A fresh candidate output directory is required")
if (Bun.version !== BUN_VERSION || process.platform !== "linux" || process.arch !== "arm64")
  throw new Error("This bounded probe supports pinned Bun on the observed Linux arm64 host only")
const root = resolve(destination)
const emitted = join(root, "emitted")
const release = join(root, "release")
mkdirSync(root) // Refuse previous output rather than mistaking it for a new result.
mkdirSync(emitted)
const nativeRoot =
  'require("node:path").resolve(require("node:path").dirname(process.execPath), "../../../native/prebuilt", process.platform + "-" + process.arch)'
const emission = await Bun.build({
  entrypoints: [resolve("packages/hook-entry/src/hook-main.ts")],
  outdir: emitted,
  naming: "hook.js",
  target: "bun",
  format: "esm",
  metafile: true,
  plugins: [physicalNativeBindings(nativeRoot)]
})
if (!emission.success || !emission.metafile) throw new Error("Hook emission or compiler-input evidence failed")
writeFileSync(join(root, "emission-metafile.json"), JSON.stringify(emission.metafile, null, 2))
const executable = join(release, "dist/bin/linux-arm64/hapsland-hook")
mkdirSync(join(release, "dist/bin/linux-arm64"), { recursive: true })
const assembly = await Bun.build({
  entrypoints: [join(emitted, "hook.js")],
  target: "bun",
  format: "esm",
  minify: true,
  bytecode: true,
  metafile: true,
  compile: {
    target: "bun-linux-arm64",
    outfile: executable,
    autoloadDotenv: false,
    autoloadBunfig: false,
    autoloadTsconfig: false,
    autoloadPackageJson: false
  }
})
if (!assembly.success || !assembly.metafile) throw new Error("Hook assembly or contribution evidence failed")
writeFileSync(join(root, "assembly-metafile.json"), JSON.stringify(assembly.metafile, null, 2))
for (const path of ["native/prebuilt/linux-arm64", "src/rules/defaults", "package.json", "package-runtime.json"])
  cpSync(resolve(path), join(release, path), { recursive: true })
for (const name of ["hapsland", "hapsland-resident", "hapsland-parser", "hapsland-doctor"])
  cpSync(resolve("dist/bin/linux-arm64", name), join(release, "dist/bin/linux-arm64", name))
const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex")
const inputs = Object.keys((emission.metafile as unknown as { inputs: Record<string, unknown> }).inputs)
  .sort()
  .map((path) => ({ path, physicalPath: realpathSync(resolve(path)), sha256: sha256(resolve(path)) }))
const inventory = (directory: string): Array<{ path: string; mode: number; sha256?: string; target?: string }> => {
  const records: Array<{ path: string; mode: number; sha256?: string; target?: string }> = []
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name)
    const stat = lstatSync(path)
    if (stat.isDirectory()) records.push(...inventory(path))
    else if (stat.isFile())
      records.push({ path: relative(release, path), mode: stat.mode & 0o777, sha256: sha256(path) })
    else if (stat.isSymbolicLink())
      records.push({ path: relative(release, path), mode: stat.mode & 0o777, target: readlinkSync(path) })
    else throw new Error("Unsupported candidate artifact kind")
  }
  return records
}
writeFileSync(
  join(root, "identity.json"),
  JSON.stringify(
    {
      schemaVersion: 1,
      purpose: "Standalone candidate feasibility; not installed release or production build acceptance",
      bun: Bun.version,
      toolchain: { executable: process.execPath, sha256: sha256(process.execPath) },
      adapter: { path: "scripts/probe-hook-standalone.ts", sha256: sha256("scripts/probe-hook-standalone.ts") },
      inputs,
      artifacts: inventory(release),
      platform: process.platform,
      architecture: process.arch,
      source: { path: "packages/hook-entry/src/hook-main.ts", sha256: sha256("packages/hook-entry/src/hook-main.ts") },
      emitted: { path: join(emitted, "hook.js"), sha256: sha256(join(emitted, "hook.js")) },
      executable: { path: executable, sha256: sha256(executable) },
      emissionMetafile: sha256(join(root, "emission-metafile.json")),
      assemblyMetafile: sha256(join(root, "assembly-metafile.json")),
      limitations: [
        "Bundled JavaScript emission, not dependency-ordered package compilation",
        "No cache/publication enforcement",
        "No ordinary installed launcher or registration migration",
        "No platform or startup improvement claim"
      ]
    },
    null,
    2
  ) + "\n"
)
process.stdout.write(JSON.stringify({ executable, evidence: join(root, "identity.json") }) + "\n")
