import { createRequire } from "node:module"
import { readFileSync, realpathSync } from "node:fs"
import { resolve } from "node:path"
import { resolveDeclaredDependencyVersion } from "./package-graph.mjs"

// Supervise Turbo itself. Its npm wrapper exits on child `exit`, before the
// child's `close` and physical process-group teardown have completed.
export function resolveTurboExecutable(root) {
  if (!["linux", "darwin"].includes(process.platform) || !["arm64", "x64"].includes(process.arch))
    throw new Error("Unsupported Turbo build host")
  const release = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"))
  const expected = resolveDeclaredDependencyVersion(release, "turbo", release.devDependencies?.turbo)
  const wrapperPath = realpathSync(resolve(root, "node_modules/turbo/package.json"))
  const wrapper = JSON.parse(readFileSync(wrapperPath, "utf8"))
  const name = `@turbo/${process.platform}-${process.arch === "x64" ? "64" : process.arch}`
  const binaryRequire = createRequire(wrapperPath)
  const binary = JSON.parse(readFileSync(binaryRequire.resolve(`${name}/package.json`), "utf8"))
  if (wrapper.version !== expected || wrapper.optionalDependencies?.[name] !== expected || binary.version !== expected)
    throw new Error("Turbo executable does not match the declared pinned release")
  return realpathSync(binaryRequire.resolve(`${name}/bin/turbo`))
}
