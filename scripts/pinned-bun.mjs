import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import { BUN_VERSION } from "../src/runtime/bun-runtime.ts"

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
