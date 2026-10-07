import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { withBuildLock } from "./build-lock.mjs"
import { runBuildProcess } from "./build-process.mjs"
import { readPackageGraph } from "./package-graph.mjs"
import { nativeTaskArtifacts } from "./native-task-inputs.mjs"
import { copyNativeArtifact } from "./native-artifact.mjs"
import { fileEvidence } from "./compiler-evidence.mjs"

/** Run ordinary Turbo producers, then atomically publish freshly verified native assets. */
export async function buildNativeTasks(root) {
  const profile = `${process.platform}-${process.arch}`
  if (!["linux-arm64", "darwin-arm64"].includes(profile)) throw new Error(`Unsupported native host: ${profile}`)
  await withBuildLock(
    root,
    async (leaseEnvironment) => {
      const environment = { ...leaseEnvironment, HAPSLAND_BUILD_PROFILE: profile }
      await runBuildProcess(process.execPath, [resolve(root, "scripts/build-workspaces.mjs"), "--with-native"], {
        cwd: root,
        env: environment,
        stdio: "inherit",
        timeout: 90000
      })
      const graph = readPackageGraph(root)
      const before = await nativeTaskArtifacts(root, graph, profile, { environment })
      const mappings = before.assets.map((asset) => ({ ...asset, evidence: fileEvidence(root, asset.physicalPath) }))
      for (const { physicalPath, installedPath, evidence } of mappings) {
        copyNativeArtifact(physicalPath, resolve(root, installedPath), evidence.mode)
        const actual = fileEvidence(root, resolve(root, installedPath))
        if (actual.sha256 !== evidence.sha256 || actual.mode !== evidence.mode)
          throw new Error(`Native publication differs from verified owner output: ${installedPath}`)
      }
      const after = await nativeTaskArtifacts(root, graph, profile, { environment })
      if (JSON.stringify(after) !== JSON.stringify(before))
        throw new Error("Native producer evidence changed during publication")
      for (const { installedPath, evidence } of mappings) {
        const actual = fileEvidence(root, resolve(root, installedPath))
        if (actual.sha256 !== evidence.sha256 || actual.mode !== evidence.mode)
          throw new Error(`Native publication changed after validation: ${installedPath}`)
      }
    },
    90000
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await buildNativeTasks(resolve(import.meta.dirname, ".."))
  console.log("Published native assets: fresh Turbo producer evidence verified")
}
