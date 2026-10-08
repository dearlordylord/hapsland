import { pinnedExternalLoaderProfiles } from "./external-loader-profile.mjs"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { resolve, relative, dirname } from "node:path"
import { fileEvidence } from "./compiler-evidence.mjs"
import { readPackageGraph } from "./package-graph.mjs"
import { nativeTaskPlans } from "./native-task-inputs.mjs"
import { checkBuildBoundary, sourceContributionClosure } from "./check-build-boundaries.mjs"

export const assemblySnapshotDigest = (snapshot) => createHash("sha256").update(JSON.stringify(snapshot)).digest("hex")
export const assemblyPrerequisitePath = (root, role, profile) => {
  if (!/^[a-z][a-z-]*$/.test(role) || !["linux-arm64", "darwin-arm64", "host"].includes(profile))
    throw new Error("Invalid assembly component")
  return resolve(root, ".test-runs/assembly-prerequisites", role, `${profile}.json`)
}
export const assemblyProducerFiles = [
  "scripts/assembly-prerequisites.mjs",
  "scripts/native-task-inputs.mjs",
  "scripts/native-input-bundle.mjs",
  "scripts/native-binding-source.mjs",
  "scripts/assemble-entry.mjs",
  "scripts/compile-standalone.mjs",
  "scripts/assembly-context.mjs",
  "scripts/check-assembly-receipt.mjs",
  "scripts/build-contributions.mjs",
  "scripts/compiler-evidence.mjs",
  "scripts/package-graph.mjs",
  "scripts/check-build-boundaries.mjs",
  "scripts/external-runtime-evidence.mjs",
  "scripts/external-loader-profile.mjs",
  "scripts/standalone-runtime-profile.mjs",
  "scripts/build-process.mjs",
  "scripts/build-deadlines.mjs",
  "scripts/build-lock.mjs",
  "scripts/owned-lock.mjs",
  "scripts/build-groups.mjs",
  "packages/source-analysis/src/direct-event/languages/native-bindings.ts"
]
const hostProducerFiles = [
  "scripts/assemble-host-modules.mjs",
  "scripts/host-module-graph.mjs",
  "scripts/host-module-plan.mjs",
  "scripts/host-module-imports.mjs"
]
const policyFor = (graph, role) =>
  role === "hook"
    ? ["standalone-hook", graph.release.hapsland.buildBoundaries["standalone-hook"]]
    : role === "pi-extension"
      ? ["pi-extension", graph.release.hapsland.buildBoundaries["pi-extension"]]
      : [null, { forbiddenCapabilities: [], forbiddenExternalPackages: [] }]
export function createAssemblyPrerequisites(
  root,
  graph,
  analysis,
  compilerContributions,
  targets,
  nativeByTarget = new Map()
) {
  const records = new Map(analysis.records.map((record) => [record.file, record]))
  if (records.size !== analysis.records.length) throw new Error("Duplicate global source records")
  const toolchain = JSON.parse(readFileSync(resolve(root, ".test-runs/build-toolchain.json"), "utf8"))
  const result = new Map()
  for (const owner of graph.packages.values()) {
    const role =
      owner.manifest.hapsland?.role ??
      (owner.manifest.hapsland?.surface === "pi-extension" ? "pi-extension" : undefined)
    if (!role) continue
    const source = resolve(owner.path, owner.manifest.hapsland.entry)
    const [boundary, policy] = policyFor(graph, role)
    const closure = boundary
      ? checkBuildBoundary(root, analysis, boundary, graph)
      : sourceContributionClosure(root, graph, analysis, source, policy, role)
    const selectedRecords = closure.map((file) => records.get(file))
    const owners = [...new Set(selectedRecords.map((record) => record.owner))].sort()
    const configuration = [
      ...new Set([
        "package.json",
        "bun.lock",
        "tsconfig.json",
        "tsconfig.package.json",
        ...owners.flatMap((name) => {
          const node = graph.packages.get(name)
          return [
            `${node.directory}/package.json`,
            ...(node.compiler === "bend" ? [] : [`${node.directory}/tsconfig.json`])
          ]
        }),
        ...assemblyProducerFiles,
        ...(role === "pi-extension" ? hostProducerFiles : [])
      ])
    ]
      .sort()
      .map((file) => fileEvidence(root, resolve(root, file)))
    const emitted = relative(root, source).replaceAll("\\", "/").replace("/src/", "/dist/").replace(/\.ts$/, ".js")
    const compiler = owners.map((name) => {
      const node = graph.packages.get(name)
      return fileEvidence(
        root,
        resolve(node.path, node.compiler === "bend" ? "dist/.bend-receipt.json" : "dist/.compile-receipt.json")
      )
    })
    const compiledOutputs = owners
      .flatMap((name) => {
        const node = graph.packages.get(name)
        const receipt = JSON.parse(
          readFileSync(
            resolve(node.path, node.compiler === "bend" ? "dist/.bend-receipt.json" : "dist/.compile-receipt.json"),
            "utf8"
          )
        )
        if (!Array.isArray(receipt.outputs) || !receipt.outputs.length)
          throw new Error(`Missing compiled output prerequisite: ${name}`)
        return receipt.outputs.map((output) => ({
          ...output,
          path: node.compiler === "bend" ? output.path : `${node.directory}/${output.path}`
        }))
      })
      .sort((a, b) => a.path.localeCompare(b.path))
    for (const profile of role === "pi-extension" ? ["host"] : targets) {
      const native = nativeByTarget instanceof Map ? nativeByTarget.get(profile) : nativeByTarget[profile]
      const nativePlans = profile === "host" ? [] : nativeTaskPlans(root, graph, profile, owners)
      const nativeOwners = nativePlans.map((plan) => plan.node.manifest.name)
      if (nativeOwners.length && !native) throw new Error(`Missing verified native prerequisite: ${role}/${profile}`)
      const nativeProof = {
        assets: (native?.assets ?? [])
          .filter((asset) => nativeOwners.includes(asset.owner))
          .map((asset) => ({
            ...fileEvidence(root, asset.physicalPath),
            publicPath: asset.installedPath,
            owner: asset.owner
          }))
          .sort((a, b) => a.path.localeCompare(b.path)),
        receipts: (native?.receipts ?? [])
          .filter((receipt) => nativeOwners.includes(receipt.owner))
          .map((receipt) => ({ ...fileEvidence(root, receipt.path), owner: receipt.owner }))
          .sort((a, b) => a.path.localeCompare(b.path))
      }
      const expectedNative = nativePlans.flatMap((plan) => plan.assets.map((asset) => asset.installedPath)).sort()
      if (
        JSON.stringify(nativeProof.assets.map((asset) => asset.publicPath).sort()) !== JSON.stringify(expectedNative) ||
        nativeOwners.some((name) => !nativeProof.receipts.some((receipt) => receipt.owner === name))
      )
        throw new Error(`Incomplete native prerequisite: ${role}/${profile}`)
      const snapshot = {
        format: 1,
        owner: owner.manifest.name,
        role,
        profile,
        entry: emitted,
        boundary,
        policy,
        sources: closure.map((file) => fileEvidence(root, resolve(root, file))),
        analysis: { records: selectedRecords, sourceClosure: closure, compiledOutputs },
        compiler,
        contributions: boundary ? compilerContributions[boundary] : [],
        configuration,
        toolchain,
        native: nativeProof
      }
      if (boundary && !Array.isArray(snapshot.contributions))
        throw new Error(`Missing compiler boundary evidence: ${boundary}`)
      result.set(`${role}/${profile}`, snapshot)
    }
  }
  return result
}
export function writeAssemblyPrerequisites(root, snapshots, admission) {
  if (!admission?.token || !snapshots.size) throw new Error("Assembly admission requires the current build lease")
  const components = {}
  for (const [component, snapshot] of snapshots) {
    const path = assemblyPrerequisitePath(root, snapshot.role, snapshot.profile)
    mkdirSync(dirname(path), { recursive: true })
    const text = JSON.stringify(snapshot) + "\n"
    let current
    try {
      current = readFileSync(path, "utf8")
    } catch (error) {
      if (error.code !== "ENOENT") throw error
    }
    if (current !== text) writeFileSync(path, text)
    components[component] = { owner: snapshot.owner, digest: assemblySnapshotDigest(snapshot) }
  }
  const admissionPath = resolve(root, ".test-runs/assembly-admission.json")
  writeFileSync(admissionPath, JSON.stringify({ format: 1, token: admission.token, components }), { mode: 0o600 })
  return admissionPath
}
export function checkAssemblyPrerequisite(root, snapshot, admission) {
  if (
    snapshot?.format !== 1 ||
    !Array.isArray(snapshot.sources) ||
    !snapshot.sources.length ||
    !Array.isArray(snapshot.analysis?.records) ||
    !Array.isArray(snapshot.configuration) ||
    !snapshot.configuration.length ||
    !Array.isArray(snapshot.analysis?.compiledOutputs) ||
    !snapshot.analysis.compiledOutputs.length ||
    !Array.isArray(snapshot.compiler) ||
    !snapshot.compiler.length
  )
    throw new Error("Missing assembly prerequisite evidence")
  const graph = readPackageGraph(root),
    owner = graph.packages.get(snapshot.owner)
  const role =
    owner?.manifest.hapsland?.role ??
    (owner?.manifest.hapsland?.surface === "pi-extension" ? "pi-extension" : undefined)
  const [boundary, policy] = policyFor(graph, role)
  if (
    !owner ||
    role !== snapshot.role ||
    !["linux-arm64", "darwin-arm64", "host"].includes(snapshot.profile) ||
    (role === "pi-extension") !== (snapshot.profile === "host") ||
    boundary !== snapshot.boundary ||
    JSON.stringify(policy) !== JSON.stringify(snapshot.policy)
  )
    throw new Error("Assembly prerequisite owner or policy changed")
  const source = resolve(owner.path, owner.manifest.hapsland.entry)
  if (
    snapshot.entry !== relative(root, source).replaceAll("\\", "/").replace("/src/", "/dist/").replace(/\.ts$/, ".js")
  )
    throw new Error("Assembly prerequisite entry changed")
  const closure = boundary
    ? checkBuildBoundary(root, snapshot.analysis, boundary, graph)
    : sourceContributionClosure(root, graph, snapshot.analysis, source, policy, role)
  if (
    JSON.stringify(closure) !== JSON.stringify(snapshot.sources.map((file) => file.path)) ||
    JSON.stringify(closure) !== JSON.stringify(snapshot.analysis.records.map((record) => record.file).sort())
  )
    throw new Error("Assembly prerequisite has missing or additional source records")
  for (const recorded of [
    ...snapshot.sources,
    ...snapshot.configuration,
    ...snapshot.compiler,
    ...snapshot.analysis.compiledOutputs
  ])
    if (JSON.stringify(fileEvidence(root, resolve(root, recorded.path))) !== JSON.stringify(recorded))
      throw new Error(`Stale assembly prerequisite: ${recorded.path}`)
  if (!Array.isArray(snapshot.native?.assets) || !Array.isArray(snapshot.native?.receipts))
    throw new Error("Missing component native proof")
  for (const recorded of [...snapshot.native.assets, ...snapshot.native.receipts]) {
    const { path, mode, sha256 } = recorded
    if (JSON.stringify(fileEvidence(root, resolve(root, path))) !== JSON.stringify({ path, mode, sha256 }))
      throw new Error(`Stale native assembly prerequisite: ${path}`)
  }
  if (admission) {
    const envelope = JSON.parse(
      readFileSync(admission.admissionPath ?? resolve(root, ".test-runs/assembly-admission.json"), "utf8")
    )
    const token = process.env.HAPSLAND_BUILD_LOCK_LEASE
    const lease = JSON.parse(readFileSync(resolve(root, ".test-runs/product-build/lease.json"), "utf8"))
    const component = envelope.components?.[`${snapshot.role}/${snapshot.profile}`]
    if (
      !token ||
      lease.state !== "open" ||
      lease.token !== token ||
      envelope.token !== token ||
      envelope.format !== 1 ||
      component?.owner !== snapshot.owner ||
      component.digest !== assemblySnapshotDigest(snapshot) ||
      (admission.owner && admission.owner !== snapshot.owner) ||
      (admission.target && admission.target !== snapshot.profile)
    )
      throw new Error("Missing or stale assembly admission")
  }
  return snapshot.analysis
}

export function assemblyNativeArtifacts(root, snapshot) {
  return {
    assets: snapshot.native.assets.map((asset) => ({
      ...asset,
      physicalPath: resolve(root, asset.path),
      installedPath: asset.publicPath
    }))
  }
}

export function requiredAssemblyNativePaths(graph, profile, inputs) {
  const wanted = new Set()
  for (const [name, profilePolicy] of Object.entries(pinnedExternalLoaderProfiles))
    if (inputs.some((input) => input.external === name))
      wanted.add(`native/prebuilt/${profile}/${name}/build/Release/${profilePolicy.nativeBinding}`)
  for (const plan of nativeTaskPlans(graph.root, graph, profile))
    for (const { asset, installedPath } of plan.assets)
      if (inputs.some((input) => input.source === `${plan.node.directory}/${asset.source}`)) wanted.add(installedPath)
  return [...wanted].sort()
}
