import { existsSync, readFileSync, realpathSync } from "node:fs"
import { join } from "node:path"

export const installedCommands = (prefix, hookRole) => {
  if (!["cli", "hook"].includes(hookRole)) throw new Error("declare hookRole as cli or hook")
  const root = realpathSync(join(prefix, "node_modules/@hapsland/hapsland"))
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  const launcherName = hookRole === "hook" ? "hapsland-hook" : "hapsland"
  const launcher = join(prefix, "node_modules/.bin", launcherName)
  const registration = manifest.bin?.[launcherName]
  if (typeof registration !== "string" || realpathSync(launcher) !== realpathSync(join(root, registration)))
    throw new Error("installed hook launcher differs from package bin registration")
  const runtimeDeclaration = JSON.parse(readFileSync(join(root, "package-runtime.json"), "utf8"))
  if (runtimeDeclaration.runtime.name === "bun") {
    const directory = join(root, "dist/bin", `${process.platform}-${process.arch}`)
    return {
      runtimeDeclaration,
      hookRole,
      launcher,
      hook: { executable: realpathSync(join(directory, launcherName)), args: [] },
      cli: { executable: realpathSync(join(directory, "hapsland")), args: [] },
      resident: { executable: realpathSync(join(directory, "hapsland-resident")), args: [] }
    }
  }
  if (hookRole === "hook") throw new Error("dedicated hook measurement requires standalone Bun")
  if (runtimeDeclaration.runtime.name !== "node") throw new Error("unsupported benchmark runtime")
  const runtimePackage = `node-${process.platform === "darwin" ? "bin-darwin" : process.platform}-${process.arch}`
  const candidates = [
    join(root, "node_modules", runtimePackage, "bin/node"),
    join(prefix, "node_modules", runtimePackage, "bin/node")
  ]
  const runtime = candidates.find(existsSync)
  if (!runtime) throw new Error("installed benchmark runtime missing")
  return {
    runtimeDeclaration,
    hookRole,
    launcher,
    hook: { executable: realpathSync(runtime), args: [realpathSync(join(root, "dist/cli.js"))] },
    cli: { executable: realpathSync(runtime), args: [realpathSync(join(root, "dist/cli.js"))] },
    resident: { executable: realpathSync(runtime), args: [realpathSync(join(root, "dist/resident/main.js"))] }
  }
}
