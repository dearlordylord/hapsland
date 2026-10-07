import { lstat, readFile } from "node:fs/promises"
import { resolve } from "node:path"
// A disappeared stage group does not clear a checkout lease left by its build.
// This observer preserves evidence; recovering an abandoned lease needs an owned
// process audit, including admission state, before any lock can be removed.
export async function unresolvedBuildOwnership(root) {
  const directory = resolve(root, ".test-runs/product-build")
  try {
    await lstat(resolve(directory, "lock"))
  } catch (error) {
    if (error.code === "ENOENT") return undefined
    throw error
  }
  try {
    const owner = JSON.parse(await readFile(resolve(directory, "lock/owner.json"), "utf8"))
    const lease = JSON.parse(await readFile(resolve(directory, "lease.json"), "utf8"))
    if (!Number.isSafeInteger(owner.pid) || owner.pid <= 1 || lease.pid !== owner.pid)
      return "Invalid product build ownership; checkout lock retained"
    return "Product build ownership remains after stage exit; checkout lock retained"
  } catch {
    return "Incomplete product build ownership; checkout lock retained"
  }
}
