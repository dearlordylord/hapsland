import { createRequire } from "node:module"
import { accessSync, constants, realpathSync } from "node:fs"
import { delimiter, dirname, join, resolve } from "node:path"

const checkedRequire = (entrypoint) => {
  const require = createRequire(realpathSync(entrypoint))
  if (require("../package.json").name !== "npm") throw new Error("Selected entrypoint does not belong to npm")
  return require
}
/** Resolve npm's own dependencies without launching another npm process. */
export function npmToolingRequire(entrypoint = process.env.npm_execpath) {
  if (entrypoint !== undefined) return checkedRequire(entrypoint)
  const candidates = []
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    const path = join(directory, "npm")
    try {
      accessSync(path, constants.X_OK)
      const executable = realpathSync(path)
      candidates.push(executable, resolve(dirname(executable), "../lib/node_modules/npm/bin/npm-cli.js"))
      break
    } catch (error) {
      if (!["ENOENT", "EACCES"].includes(error.code)) throw error
    }
  }
  candidates.push(resolve(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js"))
  for (const candidate of candidates) {
    try {
      return checkedRequire(candidate)
    } catch (error) {
      if (!["ENOENT", "MODULE_NOT_FOUND"].includes(error.code)) throw error
    }
  }
  throw new Error("Cannot resolve npm tooling; run through npm run or supply its CLI entrypoint")
}

export async function npmPackageFiles(root, entrypoint = process.env.npm_execpath) {
  const require = npmToolingRequire(entrypoint)
  const Arborist = require("@npmcli/arborist")
  const tree = await new Arborist({ path: root }).loadActual()
  return require("npm-packlist")(tree, { path: root })
}
