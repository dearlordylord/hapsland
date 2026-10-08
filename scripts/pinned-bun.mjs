import { execFileSync } from "node:child_process"
import { resolve, dirname } from "node:path"
import { createRequire } from "node:module"
import { readFileSync, copyFileSync, chmodSync } from "node:fs"
import { BUN_VERSION } from "../packages/runtime-environment/src/runtime/bun-runtime.ts"
export { BUN_VERSION }

export function resolveBunRuntime(env = process.env) {
  const candidates = env.HAPSLAND_BUILD_BUN === undefined ? ["bun"] : [env.HAPSLAND_BUILD_BUN]
  for (const candidate of candidates) {
    try {
      if (execFileSync(candidate, ["--version"], { encoding: "utf8", timeout: 5000 }).trim() === BUN_VERSION) {
        const executable = execFileSync(candidate, ["--print", "process.execPath"], {
          encoding: "utf8",
          timeout: 5000
        }).trim()
        return { executable, version: BUN_VERSION }
      }
    } catch {
      /* Try the next declared location. */
    }
  }
  if (env.HAPSLAND_BUILD_BUN !== undefined) throw new Error(`HAPSLAND_BUILD_BUN must select exact Bun ${BUN_VERSION}`)
  try {
    const directory = execFileSync("mise", ["where", `bun@${BUN_VERSION}`], { encoding: "utf8", timeout: 5000 }).trim()
    return resolveBunRuntime({ ...env, HAPSLAND_BUILD_BUN: resolve(directory, "bin/bun") })
  } catch {
    throw new Error(`Install Bun ${BUN_VERSION} or select it with HAPSLAND_BUILD_BUN.`)
  }
}

// Frozen installs deliberately skip dependency lifecycle scripts. Turbo still
// invokes the package-manager launcher, so initialize only this pinned binary
// from the already-verified runtime rather than running arbitrary postinstalls.
export function ensurePinnedBunLauncher(root, runtime = resolveBunRuntime()) {
  if (
    runtime.version !== BUN_VERSION ||
    execFileSync(runtime.executable, ["--version"], { encoding: "utf8", timeout: 5000 }).trim() !== BUN_VERSION
  )
    throw new Error(`Package-manager launcher requires exact Bun ${BUN_VERSION}`)
  const manifestPath = createRequire(resolve(root, "package.json")).resolve("bun/package.json")
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  if (manifest.name !== "bun" || manifest.version !== BUN_VERSION || manifest.bin?.bun !== "bin/bun.exe")
    throw new Error("Installed Bun launcher differs from the pinned package contract")
  const output = resolve(dirname(manifestPath), manifest.bin.bun)
  if (resolve(runtime.executable) !== output) copyFileSync(runtime.executable, output)
  chmodSync(output, 0o755)
  return output
}
