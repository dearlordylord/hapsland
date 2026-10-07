import { lstat, readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { buildProcessGroup } from "./build-groups.mjs"
// A disappeared stage group does not clear a checkout lease left by its build.
// This observer preserves evidence; recovering an abandoned lease needs an owned
// process audit, including admission state, before any lock can be removed.
export async function unresolvedBuildOwnership(root, { enclosingToken } = {}) {
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
    if (
      typeof enclosingToken === "string" &&
      /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(enclosingToken) &&
      lease.token === enclosingToken &&
      lease.state === "open" &&
      owner.pid === process.pid &&
      lease.group === buildProcessGroup()
    )
      return undefined
    return "Product build ownership remains after stage exit; checkout lock retained"
  } catch {
    return "Incomplete product build ownership; checkout lock retained"
  }
}
