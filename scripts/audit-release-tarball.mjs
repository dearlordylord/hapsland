import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { archiveInventory } from "./archive-inventory.mjs"
import { validateReleaseTarget } from "./release-coordinates.mjs"
import { checkHostModuleReceipt } from "./assemble-host-modules.mjs"
import { fileEvidence } from "./compiler-evidence.mjs"
import { releaseAssetMappings } from "./release-assets.mjs"
import { assemblyPrerequisitePath } from "./assembly-prerequisites.mjs"
import { nativeTaskPlans, nativeTaskArtifacts, readNativeTaskInputs, nativeEnvironment } from "./native-task-inputs.mjs"
import { validateAssemblyArtifact } from "./assemble-entry.mjs"
import { assertReleaseSource } from "./release-inputs.mjs"
import { BUN_VERSION } from "./pinned-bun.mjs"
import { readPackageGraph, resolveDeclaredDependencyVersion } from "./package-graph.mjs"

export const validateReleasePublication = (root, output, archiveRecord) => {
  const owned = fileEvidence(root, resolve(root, output.path))
  const actual = fileEvidence(root, resolve(root, output.publicPath))
  for (const evidence of [owned, actual, ...(archiveRecord ? [archiveRecord] : [])])
    if (evidence.sha256 !== output.sha256 || evidence.mode !== output.mode)
      throw new Error(`Published release asset differs from owned evidence: ${output.publicPath}`)
}

// npm augments PATH for its build child. Re-observe the declared build
// environment and physical tools, rather than substituting the audit caller's
// ambient environment. Every owner in one target must agree on that declaration.
export async function nativeReleaseArtifacts(root, graph, profile, inherited = process.env) {
  const declarations = nativeTaskPlans(root, graph, profile).map(
    (plan) => readNativeTaskInputs(root, plan.node, profile).environment
  )
  if (!declarations.length) throw new Error(`Missing native release inputs: ${profile}`)
  const declared = declarations[0]
  if (
    Object.keys(declared).sort().join("\0") !== Object.keys(nativeEnvironment(inherited)).sort().join("\0") ||
    Object.values(declared).some((value) => value !== null && typeof value !== "string") ||
    declarations.some((value) => JSON.stringify(value) !== JSON.stringify(declared))
  )
    throw new Error("Native release environment declaration differs between owners")
  const environment = { ...inherited }
  for (const [key, value] of Object.entries(declared)) {
    if (value === null) delete environment[key]
    else environment[key] = value
  }
  return nativeTaskArtifacts(root, graph, profile, { environment })
}

export async function auditReleaseTarball(
  archiveArgument,
  commit,
  { root = process.cwd(), coordinates, print = true, deadline = Date.now() + 300000 } = {}
) {
  if (!archiveArgument || !/^[0-9a-f]{40}$/.test(commit ?? "")) {
    throw new Error("usage: node scripts/audit-release-tarball.mjs ARCHIVE.tgz RELEASE_COMMIT_SHA")
  }
  const requireTime = () => {
    if (!Number.isFinite(deadline) || Date.now() >= deadline) throw new Error("Release audit deadline exceeded")
  }
  requireTime()
  const archive = resolve(archiveArgument)
  const command = (tool, args) => execFileSync(tool, args, { cwd: root, timeout: 5000, maxBuffer: 32 * 1024 * 1024 })
  const pin = coordinates ?? JSON.parse(readFileSync(resolve(root, "scripts/npm-release-pin.json"), "utf8"))
  const head = command("git", ["rev-parse", "HEAD"]).toString().trim()
  if (head !== commit || assertReleaseSource(root, pin) !== commit) {
    throw new Error("release audit requires the exact pinned commit in a clean worktree")
  }
  const inventory = await archiveInventory(archive, { timeoutMs: deadline - Date.now() })
  const archiveRecord = (path) => {
    const record = inventory.get(`package/${path}`)
    if (!record || record.directory) throw new Error(`release tarball is missing ${path}`)
    return record
  }
  const archiveFile = (path) => {
    const record = archiveRecord(path)
    if (record.text === undefined) throw new Error(`Audit requested non-text contents: ${path}`)
    return record.text
  }
  const archiveContentDigest = (path) => archiveRecord(path).sha256
  const gitFile = (path) => command("git", ["show", `${commit}:${path}`])
  const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")
  const files = [...inventory.keys()]
  const names = files
    .filter((name) => !inventory.get(name).directory)
    .map((name) => {
      if (!name.startsWith("package/") || name.includes("..") || name.includes("\\")) {
        throw new Error(`unsafe tarball path: ${name}`)
      }
      return name.slice("package/".length)
    })
  const graph = readPackageGraph(root)
  const hostSnapshot = JSON.parse(readFileSync(assemblyPrerequisitePath(root, "pi-extension", "host"), "utf8"))
  const hostReceipt = await checkHostModuleReceipt(root, hostSnapshot)
  const validatePublished = (output) => validateReleasePublication(root, output)
  for (const output of hostReceipt.outputs) validatePublished(output)
  const hostFiles = hostReceipt.outputs.map((output) => output.publicPath)
  const ruleMappings = releaseAssetMappings(root, graph)
  if (!ruleMappings.length) throw new Error("Missing release asset inventory")
  const defaultRuleFiles = ruleMappings.map((output) => {
    if (
      !/^packages\/review-definition\/dist\/rules\/defaults\/[a-z_]+\.json$/.test(output.path) ||
      !/^dist\/rules\/defaults\/[a-z_]+\.json$/.test(output.publicPath)
    )
      throw new Error("Unsupported release rule inventory")
    validatePublished(output)
    if (output.sha256 !== sha256(gitFile(output.path.replace("/dist/", "/src/"))))
      throw new Error(`Release rule differs from pinned source: ${output.publicPath}`)
    return output.publicPath
  })
  if (new Set(defaultRuleFiles).size !== defaultRuleFiles.length) throw new Error("Duplicate release rule inventory")
  const nativeFiles = ["linux-arm64", "darwin-arm64"].flatMap((profile) =>
    nativeTaskPlans(root, graph, profile).flatMap((plan) => plan.assets.map((asset) => asset.installedPath))
  )
  if (!nativeFiles.length || new Set(nativeFiles).size !== nativeFiles.length)
    throw new Error("Invalid native release inventory")
  const allowed = (name) =>
    name === "package.json" ||
    name === "package-runtime.json" ||
    name === "README.md" ||
    defaultRuleFiles.includes(name) ||
    name === "bin/launch.sh" ||
    ["schemas/review-config-v1.schema.json", "schemas/review-rule-v1.schema.json"].includes(name) ||
    [
      "docs/codex-installation.md",
      "docs/claude-installation.md",
      "docs/opencode-installation.md",
      "docs/pi-installation.md",
      "docs/direct-event-v1-supported-profile.md",
      "docs/installed-release-compatibility.md",
      "docs/status.md",
      "docs/configuration.md",
      "docs/review-providers.md",
      "docs/installation-workflows.md",
      "docs/npm-publishing.md"
    ].includes(name) ||
    hostFiles.includes(name) ||
    /^dist\/bin\/(?:linux|darwin)-arm64\/hapsland(?:-doctor|-parser|-resident|-hook)?$/.test(name) ||
    nativeFiles.includes(name)
  for (const name of names) {
    if (!allowed(name)) throw new Error(`unexpected registry tarball file: ${name}`)
  }
  const releasePin = validateReleaseTarget(pin)
  const manifest = JSON.parse(archiveFile("package.json"))
  if (JSON.stringify(manifest) !== JSON.stringify(JSON.parse(gitFile("package.json")))) {
    throw new Error("tarball manifest differs from the pinned release commit")
  }
  const toolingManifest = JSON.parse(gitFile("scripts/package.json"))
  const declaredBun = resolveDeclaredDependencyVersion(manifest, "bun", toolingManifest.dependencies?.bun)
  if (
    manifest.name !== "@hapsland/hapsland" ||
    manifest.version !== releasePin.version ||
    manifest.private === true ||
    manifest.bin?.hapsland !== "bin/launch.sh" ||
    Object.keys(manifest.bin ?? {}).some((name) => name.startsWith("review-tool")) ||
    manifest.scripts?.postinstall !== undefined ||
    manifest.optionalDependencies !== undefined ||
    toolingManifest.name !== "@hapsland/build-tooling" ||
    toolingManifest.dependencies?.bun !== "catalog:" ||
    manifest.packageManager !== `bun@${declaredBun}`
  ) {
    throw new Error("release package manifest differs from reviewed release coordinates or runtime contract")
  }
  const required = [
    ...defaultRuleFiles,
    "package.json",
    "package-runtime.json",
    "README.md",
    "bin/launch.sh",
    ...hostFiles
  ]
  for (const profile of ["linux-arm64", "darwin-arm64"]) {
    for (const command of ["hapsland", "hapsland-doctor", "hapsland-parser", "hapsland-resident", "hapsland-hook"])
      required.push(`dist/bin/${profile}/${command}`)
  }
  for (const profile of ["linux-arm64", "darwin-arm64"]) {
    requireTime()
    const native = await nativeReleaseArtifacts(root, graph, profile)
    for (const asset of native.assets) {
      required.push(asset.installedPath)
      const owned = fileEvidence(root, asset.physicalPath)
      validateReleasePublication(
        root,
        { ...owned, publicPath: asset.installedPath },
        archiveRecord(asset.installedPath)
      )
    }
    for (const node of graph.packages.values()) {
      if (!node.manifest.hapsland?.role) continue
      requireTime()
      const snapshot = JSON.parse(
        readFileSync(assemblyPrerequisitePath(root, node.manifest.hapsland.role, profile), "utf8")
      )
      for (const output of (await validateAssemblyArtifact(root, node, profile, snapshot)).outputs)
        validateReleasePublication(root, output, archiveRecord(output.publicPath))
    }
  }
  for (const name of required) if (!names.includes(name)) throw new Error(`release tarball is missing ${name}`)
  for (const name of defaultRuleFiles)
    if (
      archiveContentDigest(name) !== ruleMappings.find((asset) => asset.publicPath === name).sha256 ||
      archiveRecord(name).mode !== ruleMappings.find((asset) => asset.publicPath === name).mode
    )
      throw new Error(`shipped default rule differs from the pinned release commit: ${name}`)
  for (const output of hostReceipt.outputs)
    if (
      archiveContentDigest(output.publicPath) !== output.sha256 ||
      archiveRecord(output.publicPath).mode !== output.mode
    )
      throw new Error(`shipped host module differs from validated assembly: ${output.publicPath}`)
  for (const name of names.filter((name) =>
    /^(?:dist\/.*\.js|docs\/.*\.md|README\.md|package-runtime\.json|bin\/launch\.sh)$/.test(name)
  )) {
    const contents = archiveFile(name).toString("utf8")
    if (
      /\/workspace\/|\/home\/node\/|BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY|TYPESAFE_API_KEY\s*=\s*["'][^"']{16,}/.test(
        contents
      )
    ) {
      throw new Error(`release tarball contains a private path or credential marker: ${name}`)
    }
  }
  const archiveHash = sha256(readFileSync(archive))
  if (command("git", ["rev-parse", "HEAD"]).toString().trim() !== commit || assertReleaseSource(root, pin) !== commit)
    throw new Error("release source identity changed during archive audit")
  requireTime()
  const record = {
    format: 1,
    package: `${manifest.name}@${manifest.version}`,
    repositoryUrl: releasePin.repositoryUrl,
    commit,
    sourceTreeSha256: pin.sourceTreeSha256,
    buildPlatform: pin.buildPlatform,
    toolchain: { node: process.version, bun: BUN_VERSION },
    archiveSha256: archiveHash,
    files: names.length,
    nativeArtifacts: nativeFiles.length,
    status: "audited"
  }
  if (print) process.stdout.write(`${JSON.stringify(record, null, 2)}\n`)
  return record
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await auditReleaseTarball(process.argv[2], process.argv[3], process.argv[4] ? JSON.parse(process.argv[4]) : undefined)
