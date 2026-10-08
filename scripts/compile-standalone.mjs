import { assemblyArtifactPaths } from "./assemble-entry.mjs"
import {
  checkAssemblyPrerequisite,
  assemblyNativeArtifacts,
  requiredAssemblyNativePaths
} from "./assembly-prerequisites.mjs"
import { withBuildLock } from "./build-lock.mjs"
import { assemblyContext } from "./assembly-context.mjs"
import { checkAssemblyReceipt, assemblyReceiptDigest } from "./check-assembly-receipt.mjs"
import { readFileSync, rmSync, writeFileSync, mkdirSync, renameSync, chmodSync } from "node:fs"
import { dirname, resolve, basename, relative } from "node:path"
import { physicalNativeBindings } from "../packages/source-analysis/src/direct-event/languages/native-bindings.ts"
import { fileEvidence } from "./compiler-evidence.mjs"
import { checkAssemblyContributions } from "./build-contributions.mjs"
import { readPackageGraph } from "./package-graph.mjs"
import { createHash } from "node:crypto"
import { externalRuntimeEvidence } from "./external-runtime-evidence.mjs"
import { standaloneNativeRootExpression } from "./external-loader-profile.mjs"
import { sharedRuntimeBundle, sharedRuntimeLauncher } from "./shared-runtime-bundle.mjs"
const [entrypoint, target, outfile, sourceReceiptPath, receiptPath] = process.argv.slice(2)
const root = resolve(import.meta.dirname, "..")
await withBuildLock(root, async () => {
  if (!outfile || !receiptPath) throw new Error("Standalone assembly requires output and receipt paths")
  if (!entrypoint?.endsWith(".js")) throw new Error("Standalone assembly requires an emitted JavaScript entrypoint")
  if (!["bun-linux-arm64", "bun-darwin-arm64"].includes(target)) throw new Error("Unsupported assembly target")
  const snapshot = JSON.parse(readFileSync(sourceReceiptPath, "utf8"))
  const analysis = checkAssemblyPrerequisite(root, snapshot, { target: target.slice(4) })
  const graph = readPackageGraph(root),
    owner = graph.packages.get(snapshot.owner)
  const expected = assemblyArtifactPaths(root, owner, target.slice(4))
  if (
    resolve(entrypoint) !== resolve(root, snapshot.entry) ||
    resolve(outfile) !== expected.output ||
    resolve(receiptPath) !== expected.receipt
  )
    throw new Error("Standalone producer paths escape component owner")
  const clean = () => {
    rmSync(outfile, { force: true })
    rmSync(receiptPath, { force: true })
  }
  clean()
  try {
    const context = () =>
      assemblyContext(root, target, { version: Bun.version, executable: process.execPath }, snapshot)
    const before = await context()
    const native = assemblyNativeArtifacts(root, snapshot)
    const staging = dirname(outfile) + `.stage-${process.pid}`
    rmSync(staging, { recursive: true, force: true })
    mkdirSync(staging, { recursive: true })
    const stagedOutput = resolve(staging, basename(outfile))
    const sharedRuntime = snapshot.role !== "cli"
    const stagedBundle = `${stagedOutput}.js`
    let transformations = []
    let transformedText = new Map()
    const digest = (contents) => createHash("sha256").update(contents).digest("hex")
    const options = {
      entrypoints: [entrypoint],
      target: "bun",
      metafile: true,
      minify: true,
      format: "esm",
      plugins: [
        physicalNativeBindings(
          standaloneNativeRootExpression,
          false,
          ({ path, packageName, nativeBinding, original, transformed }) => {
            const evidence = fileEvidence(root, path)
            if (evidence.sha256 !== digest(original))
              throw new Error("Native loader input changed during transformation")
            transformations.push({
              ...evidence,
              policy: "physical-native-bindings",
              packageName,
              nativeBinding,
              transformedSha256: digest(transformed)
            })
            transformedText.set(evidence.path, transformed)
          }
        )
      ]
    }
    const assemble = async (compile) => {
      transformations = []
      transformedText = new Map()
      const result = await Bun.build({
        ...options,
        ...(compile && !sharedRuntime
          ? {
              compile: {
                target,
                outfile: stagedOutput,
                autoloadDotenv: false,
                autoloadBunfig: false,
                autoloadTsconfig: false,
                autoloadPackageJson: false
              }
            }
          : { write: false })
      })
      if (!result.success) {
        for (const log of result.logs) console.error(log)
        throw new Error("Standalone assembly failed")
      }
      if (compile && sharedRuntime) {
        if (result.outputs.length !== 1) throw new Error("Command bundle must produce exactly one JavaScript file")
        writeFileSync(stagedBundle, sharedRuntimeBundle(await result.outputs[0].text()), { mode: 0o644 })
        writeFileSync(stagedOutput, sharedRuntimeLauncher(basename(outfile)), { mode: 0o755 })
      }
      if (compile) chmodSync(stagedOutput, 0o755)
      const inputs = checkAssemblyContributions(
        root,
        entrypoint,
        result.metafile,
        analysis,
        undefined,
        (specifier, importer) => Bun.resolveSync(specifier, dirname(importer))
      )
      return {
        metafile: result.metafile,
        transformations: transformations.sort((left, right) => left.path.localeCompare(right.path)),
        inputs,
        externalRuntime: externalRuntimeEvidence(
          root,
          inputs,
          transformations,
          transformedText,
          target,
          (specifier, directory) => Bun.resolveSync(specifier, directory),
          entrypoint,
          analysis,
          native.assets
        )
      }
    }
    const preview = await assemble(false)
    const nativeAssets = (inputs) => {
      const wanted = requiredAssemblyNativePaths(graph, target.slice(4), inputs)
      return wanted.map((publicPath) => {
        const asset = native.assets.find((asset) => asset.installedPath === publicPath)
        if (!asset) throw new Error(`Missing owned native artifact: ${publicPath}`)
        return { ...fileEvidence(root, asset.physicalPath), owner: asset.owner, publicPath }
      })
    }
    const assetsBefore = nativeAssets(preview.inputs)
    const compiled = await assemble(true)
    if (JSON.stringify(preview.inputs) !== JSON.stringify(compiled.inputs)) {
      const evidence = resolve(root, ".test-runs/assembly-failures", target + "-" + outfile.split("/").at(-1) + ".json")
      mkdirSync(dirname(evidence), { recursive: true })
      writeFileSync(evidence, JSON.stringify({ preview: preview.inputs, compiled: compiled.inputs }, null, 2))
      throw new Error("Assembly inputs changed during compilation; evidence: " + evidence)
    }
    if (JSON.stringify(preview.transformations) !== JSON.stringify(compiled.transformations))
      throw new Error("Native loader transformations changed during compilation")
    if (JSON.stringify(preview.externalRuntime) !== JSON.stringify(compiled.externalRuntime))
      throw new Error("External runtime loader evidence changed during compilation")
    if (JSON.stringify(assetsBefore) !== JSON.stringify(nativeAssets(compiled.inputs)))
      throw new Error("Native assets changed during assembly")
    if (JSON.stringify(before) !== JSON.stringify(await context()))
      throw new Error("Assembly context changed during compilation")
    checkAssemblyPrerequisite(root, snapshot, { target: target.slice(4) })
    mkdirSync(dirname(receiptPath), { recursive: true })
    const receipt = {
      context: before,
      entry: fileEvidence(root, entrypoint),
      inputs: compiled.inputs,
      transformations: compiled.transformations,
      externalRuntime: compiled.externalRuntime,
      nativeAssets: assetsBefore,
      output: fileEvidence(root, stagedOutput),
      ...(sharedRuntime ? { bundle: fileEvidence(root, stagedBundle) } : {})
    }
    const stagedReceipt = { ...receipt, digest: assemblyReceiptDigest(receipt) }
    checkAssemblyReceipt(
      root,
      stagedReceipt,
      await context(),
      entrypoint,
      stagedOutput,
      assemblyNativeArtifacts(root, snapshot)
    )
    receipt.output.path = relative(root, outfile).replaceAll("\\", "/")
    if (receipt.bundle) receipt.bundle.path = `${receipt.output.path}.js`
    writeFileSync(
      resolve(staging, basename(receiptPath)),
      JSON.stringify({ ...receipt, digest: assemblyReceiptDigest(receipt) }, null, 2) + "\n"
    )
    rmSync(dirname(outfile), { recursive: true, force: true })
    renameSync(staging, dirname(outfile))
    checkAssemblyReceipt(
      root,
      JSON.parse(readFileSync(receiptPath, "utf8")),
      await context(),
      entrypoint,
      outfile,
      assemblyNativeArtifacts(root, snapshot)
    )
  } catch (error) {
    clean()
    rmSync(dirname(outfile) + `.stage-${process.pid}`, { recursive: true, force: true })
    throw error
  }
})
