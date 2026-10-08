import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { readFileSync } from "node:fs"
import { runBuildProcess } from "./build-process.mjs"
import { validateNativeBinary } from "./native-task-receipt.mjs"

export async function buildDeclaredParserSources(root, plans, profile, environment) {
  for (const plan of plans)
    for (const { asset } of plan.assets) {
      if (asset.producer.kind !== "package-binding" || asset.producer.profiles[profile].sourceBuild !== true) continue
      const require = createRequire(resolve(plan.node.path, "package.json"))
      const directory = dirname(require.resolve(`${asset.producer.package}/package.json`))
      const sdk = resolve(dirname(process.execPath), "..")
      const gyp = resolve(sdk, "lib/node_modules/npm/node_modules/node-gyp/bin/node-gyp.js")
      // Use the SDK shipped with the pinned Node installation; no header download.
      readFileSync(resolve(sdk, "include/node/node_api.h"))
      await runBuildProcess(process.execPath, [gyp, "rebuild", `--nodedir=${sdk}`], {
        cwd: directory,
        env: environment,
        timeout: 120000
      })
      validateNativeBinary(resolve(directory, asset.producer.localBuild), profile)
    }
}
