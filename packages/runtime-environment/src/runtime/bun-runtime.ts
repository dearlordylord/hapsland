import { realpathSync } from "node:fs"

import { BUN_VERSION } from "./release-identity.generated.ts"

export { BUN_VERSION } from "./release-identity.generated.ts"
/** Tooling resolves and verifies this path before application subprocesses run. */
export const bunExecutable = (): string => {
  const active = (globalThis as { readonly Bun?: { readonly version?: string } }).Bun
  if (active?.version === BUN_VERSION) return realpathSync(process.execPath)
  const executable = process.env.HAPSLAND_BUILD_BUN
  if (executable !== undefined) return realpathSync(executable)
  throw new Error(`Use Bun ${BUN_VERSION}; tooling must resolve HAPSLAND_BUILD_BUN before launching source commands.`)
}
