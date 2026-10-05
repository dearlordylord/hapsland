import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { validateReleaseCoordinates } from "./release-coordinates.mjs"

const [archiveArgument, commit] = process.argv.slice(2)
if (!archiveArgument || !/^[0-9a-f]{40}$/.test(commit ?? "")) {
  throw new Error("usage: node scripts/audit-release-tarball.mjs ARCHIVE.tgz RELEASE_COMMIT_SHA")
}
const archive = resolve(archiveArgument)
const command = (tool, args) => execFileSync(tool, args, { maxBuffer: 32 * 1024 * 1024 })
const head = command("git", ["rev-parse", "HEAD"]).toString().trim()
if (head !== commit || command("git", ["status", "--porcelain", "--untracked-files=normal"]).toString().trim()) {
  throw new Error("release audit requires the exact pinned commit in a clean worktree")
}
const archiveFile = (path) => command("tar", ["-xOzf", archive, `package/${path}`])
const gitFile = (path) => command("git", ["show", `${commit}:${path}`])
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")
const files = command("tar", ["-tzf", archive]).toString().trim().split("\n")
if (files.length !== new Set(files).size) throw new Error("tarball has duplicate entries")
const names = files
  .filter((name) => !name.endsWith("/"))
  .map((name) => {
    if (!name.startsWith("package/") || name.includes("..") || name.includes("\\")) {
      throw new Error(`unsafe tarball path: ${name}`)
    }
    return name.slice("package/".length)
  })
const defaultRuleFiles = command("git", ["ls-tree", "-r", "--name-only", commit, "src/rules/defaults"])
  .toString()
  .trim()
  .split("\n")
  .filter((name) => /^src\/rules\/defaults\/r[1-9]_[a-z_]+\.json$/.test(name))
if (defaultRuleFiles.length !== 9) throw new Error("release must contain nine individual default rules")
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
  ["dist/pi/extension.js", "dist/pi/inspection.js", "dist/runtime/hook-catalog.js"].includes(name) ||
  /^dist\/bin\/(?:linux|darwin)-arm64\/hapsland(?:-doctor|-parser|-resident)?$/.test(name) ||
  /^native\/prebuilt\/(?:linux|darwin)-arm64\//.test(name)
for (const name of names) {
  if (!allowed(name)) throw new Error(`unexpected registry tarball file: ${name}`)
}
const releasePin = validateReleaseCoordinates(JSON.parse(gitFile("scripts/npm-release-pin.json")))
const manifest = JSON.parse(archiveFile("package.json"))
if (JSON.stringify(manifest) !== JSON.stringify(JSON.parse(gitFile("package.json")))) {
  throw new Error("tarball manifest differs from the pinned release commit")
}
if (
  manifest.name !== "@hapsland/hapsland" ||
  manifest.version !== releasePin.version ||
  manifest.private === true ||
  manifest.bin?.hapsland !== "bin/launch.sh" ||
  Object.keys(manifest.bin ?? {}).some((name) => name.startsWith("review-tool")) ||
  manifest.scripts?.postinstall !== undefined ||
  manifest.optionalDependencies !== undefined ||
  manifest.devDependencies?.bun !== "1.3.14"
) {
  throw new Error("release package manifest differs from reviewed release coordinates or runtime contract")
}
const required = [
  ...defaultRuleFiles,
  "package.json",
  "package-runtime.json",
  "README.md",
  "bin/launch.sh",
  "dist/pi/extension.js",
  "dist/pi/inspection.js",
  "dist/runtime/hook-catalog.js"
]
for (const profile of ["linux-arm64", "darwin-arm64"]) {
  for (const command of ["hapsland", "hapsland-doctor", "hapsland-parser", "hapsland-resident"])
    required.push(`dist/bin/${profile}/${command}`)
  for (const artifact of [
    "credential-secret-service",
    "inspection-lock.node",
    "tree-sitter/build/Release/tree_sitter_runtime_binding.node",
    "tree-sitter-typescript/build/Release/tree_sitter_typescript_binding.node",
    "tree-sitter-rust/build/Release/tree_sitter_rust_binding.node",
    ...(profile === "darwin-arm64" ? ["capture-open"] : [])
  ]) {
    const path = `native/prebuilt/${profile}/${artifact}`
    required.push(path)
    if (sha256(archiveFile(path)) !== sha256(gitFile(path))) {
      throw new Error(`native artifact differs from pinned release commit: ${path}`)
    }
  }
}
for (const name of required) if (!names.includes(name)) throw new Error(`release tarball is missing ${name}`)
for (const name of defaultRuleFiles)
  if (sha256(archiveFile(name)) !== sha256(gitFile(name)))
    throw new Error(`shipped default rule differs from the pinned release commit: ${name}`)
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
process.stdout.write(
  JSON.stringify(
    {
      package: `${manifest.name}@${manifest.version}`,
      commit,
      archiveSha256: archiveHash,
      files: names.length,
      nativeArtifacts: required.filter((name) => name.startsWith("native/")).length,
      status: "audited"
    },
    null,
    2
  ) + "\n"
)
