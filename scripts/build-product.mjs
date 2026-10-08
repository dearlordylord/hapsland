import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { runBuildProcess } from "./build-process.mjs"
import { withBuildLock } from "./build-lock.mjs"
import { readPackageGraph } from "./package-graph.mjs"
import { checkCompilerReceipts } from "./check-compiler-receipts.mjs"
import { checkWorkspaceImports } from "./check-workspace-imports.mjs"
import { checkCompilerContributions } from "./build-contributions.mjs"
import { sourceAnalysisContext, sourceAnalysisReceipt } from "./source-analysis-receipt.mjs"
import { nativeTaskArtifacts } from "./native-task-inputs.mjs"
import { createAssemblyPrerequisites, writeAssemblyPrerequisites } from "./assembly-prerequisites.mjs"
import { validateAssemblyArtifact } from "./assemble-entry.mjs"
import { checkHostModuleReceipt } from "./assemble-host-modules.mjs"
import { releaseAssetMappings } from "./release-assets.mjs"
import { publishProduct, revokePublishedProduct } from "./publish-product.mjs"
import { fileEvidence } from "./compiler-evidence.mjs"
import { PRODUCT_COMPILATION_TIMEOUT_MS, PRODUCT_ASSEMBLY_TIMEOUT_MS } from "./build-deadlines.mjs"
const root = resolve(import.meta.dirname, "..")
await withBuildLock(root, async (environment) => {
  revokePublishedProduct(root)
  try {
    const compositionInputs = [
      "package.json",
      "bun.lock",
      "tsconfig.json",
      "tsconfig.package.json",
      "tsconfig.packages.json",
      "turbo.json",
      "scripts/check-ui-flows.mjs",
      "packages/administration/src/interaction/flow-registry.ts",
      ...[
        "build-product",
        "build-deadlines",
        "build-workspaces",
        "publish-product",
        "release-assets",
        "generate-release-identity",
        "build-bend-producers",
        "generate-turbo-config"
      ].map((name) => `scripts/${name}.mjs`)
    ].map((path) => fileEvidence(root, resolve(root, path)))
    await runBuildProcess(process.execPath, [resolve(root, "scripts/build-workspaces.mjs"), "--with-native"], {
      cwd: root,
      env: environment,
      stdio: "inherit",
      timeout: PRODUCT_COMPILATION_TIMEOUT_MS
    })
    const graph = readPackageGraph(root)
    const profiles = environment.HAPSLAND_BUILD_PROFILE
      ? [environment.HAPSLAND_BUILD_PROFILE]
      : ["linux-arm64", "darwin-arm64"]
    checkCompilerReceipts(root)
    const before = sourceAnalysisContext(root)
    const analysis = checkWorkspaceImports(root)
    const contributions = checkCompilerContributions(root, graph, analysis)
    sourceAnalysisReceipt(root, analysis, before)
    for (const stage of ["check-canonical-authority", "check-production-authority"])
      await runBuildProcess(process.execPath, [resolve(root, `scripts/${stage}.mjs`)], {
        cwd: root,
        env: environment,
        stdio: "inherit",
        timeout: 60000
      })
    const native = new Map()
    for (const profile of profiles)
      native.set(profile, await nativeTaskArtifacts(root, graph, profile, { environment }))
    const snapshots = createAssemblyPrerequisites(root, graph, analysis, contributions, profiles, native)
    writeAssemblyPrerequisites(root, snapshots, { token: environment.HAPSLAND_BUILD_LOCK_LEASE })
    const bendToolchain = JSON.parse(readFileSync(resolve(root, ".test-runs/bend-toolchain.json"), "utf8"))
    await runBuildProcess(
      resolve(root, "node_modules/.bin/turbo"),
      [
        "run",
        ...profiles.map((profile) => `assemble:${profile}`),
        "assemble:host",
        "--cache=local:rw",
        "--concurrency=2",
        "--cache-dir=.test-runs/turbo-cache",
        ...graph.order.map((name) => `--filter=${name}`)
      ],
      {
        cwd: root,
        stdio: "inherit",
        timeout: PRODUCT_ASSEMBLY_TIMEOUT_MS,
        env: {
          ...environment,
          TURBO_TELEMETRY_DISABLED: "1",
          HAPSLAND_BEND_PRODUCER_ENV: JSON.stringify(bendToolchain.environment)
        }
      }
    )
    const mappings = releaseAssetMappings(root, graph)
    for (const snapshot of snapshots.values()) {
      if (snapshot.profile === "host") mappings.push(...(await checkHostModuleReceipt(root, snapshot)).outputs)
      else
        mappings.push(
          ...(await validateAssemblyArtifact(root, graph.packages.get(snapshot.owner), snapshot.profile, snapshot))
            .outputs
        )
    }
    for (const proof of native.values())
      for (const asset of proof.assets)
        mappings.push({ ...fileEvidence(root, asset.physicalPath), publicPath: asset.installedPath })
    await publishProduct(root, mappings, async (boundary) => {
      for (const recorded of compositionInputs)
        if (JSON.stringify(fileEvidence(root, resolve(root, recorded.path))) !== JSON.stringify(recorded))
          throw new Error(`Product composition input changed: ${recorded.path}`)
      sourceAnalysisReceipt(root, analysis, before)
      if (boundary !== "publish") return
      checkCompilerReceipts(root)
      for (const profile of profiles) await nativeTaskArtifacts(root, graph, profile, { environment })
      sourceAnalysisReceipt(root, analysis, before)
    })
    console.log("Published product: fresh source, compiler, native and artifact evidence verified")
  } catch (error) {
    revokePublishedProduct(root)
    throw error
  }
})
