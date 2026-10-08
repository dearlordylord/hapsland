import { BUN_VERSION } from "./pinned-bun.mjs"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { basename } from "node:path"
import { preparePackageArchive } from "./artifact-store.mjs"
import { validateReleaseCoordinates } from "./release-coordinates.mjs"

if (process.argv.length > 2)
  throw new Error("release coordinates are pinned in scripts/npm-release-pin.json; this command takes no arguments")
const releasePin = validateReleaseCoordinates(JSON.parse(readFileSync("scripts/npm-release-pin.json", "utf8")))

const registry = "https://registry.npmjs.org/"
const packageName = releasePin.packageName
const version = releasePin.version
const run = (command, args, { stdio = "pipe", env = process.env } = {}) => {
  const result = spawnSync(command, args, { encoding: "utf8", stdio, timeout: 300_000, env })
  if (result.error) throw result.error
  return result
}
const output = (command, args) => {
  const result = run(command, args)
  if (result.status !== 0) throw new Error(`${command} ${args[0] ?? ""} failed: ${result.stderr?.trim() ?? ""}`)
  return result.stdout.trim()
}
const checked = (command, args, options) => {
  const result = run(command, args, options)
  if (result.status !== 0) throw new Error(`${command} ${args[0] ?? ""} exited ${result.status}`)
}
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")
const clean = () => output("git", ["status", "--porcelain", "--untracked-files=normal"]) === ""
const head = output("git", ["rev-parse", "HEAD"])
if (
  output("git", ["branch", "--show-current"]) !== "master" ||
  head !== output("git", ["rev-parse", "origin/master"]) ||
  !clean() ||
  run("git", ["merge-base", "--is-ancestor", releasePin.sourceCommit, head]).status !== 0
) {
  throw new Error("release requires clean master equal to origin/master and containing the pinned release commit")
}
if (!(["linux", "darwin"].includes(process.platform) && process.arch === "arm64") || process.version !== "v24.20.0") {
  throw new Error(
    [
      "release assembly requires Linux/macOS arm64 and Node 24.20.0.",
      `Rerun with: mise exec node@24.20.0 -- npm run local-release (current: ${process.platform}/${process.arch}, Node ${process.version}).`
    ].join("\n")
  )
}
const manifest = JSON.parse(readFileSync("package.json", "utf8"))
if (
  manifest.name !== packageName ||
  manifest.version !== version ||
  manifest.private === true ||
  manifest.packageManager !== `bun@${BUN_VERSION}`
) {
  throw new Error(`release manifest does not match ${packageName}@${version}`)
}
const identity = output("npm", ["whoami", `--registry=${registry}`])
process.stdout.write(`npm identity: ${identity}\n`)
checked("mise", ["exec", manifest.packageManager, "--", "bun", "install", "--frozen-lockfile", "--ignore-scripts"], {
  stdio: "inherit",
  env: { ...process.env, CI: "true" }
})
if (!clean()) throw new Error("frozen dependency installation changed tracked or untracked files")
const artifact = await preparePackageArchive({
  root: process.cwd(),
  recipe: "release",
  runStage: async ({ command, args, env }) => {
    checked(command, args, { stdio: "inherit", env })
    return { exitCode: 0 }
  }
})
if (!clean()) throw new Error("release build changed tracked or untracked files")
const archive = artifact.archivePath
if (basename(archive) !== releasePin.archiveFilename)
  throw new Error("packaging did not produce the pinned archive filename")
const digest = sha256(readFileSync(archive))
if (digest !== releasePin.archiveSha256) {
  throw new Error(`archive checksum differs from the reviewed release pin: ${digest}`)
}
checked(process.execPath, ["scripts/audit-release-tarball.mjs", archive, head], { stdio: "inherit" })
process.stdout.write(`Release artifact: ${archive}\nSHA-256: ${digest}\n`)

const tarballUrl = () => {
  const result = run("npm", ["view", `${packageName}@${version}`, "dist.tarball", "--json", `--registry=${registry}`])
  if (result.status !== 0) {
    if (result.stderr?.includes("E404")) return undefined
    throw new Error(`npm view failed: ${result.stderr?.trim() ?? "unknown error"}`)
  }
  return JSON.parse(result.stdout)
}
let publishedUrl = tarballUrl()
if (publishedUrl === undefined) {
  checked(
    "npm",
    [
      "publish",
      archive,
      "--access=public",
      `--tag=${releasePin.tag}`,
      "--ignore-scripts=true",
      `--registry=${registry}`
    ],
    { stdio: "inherit" }
  )
  for (let attempt = 0; attempt < 6 && publishedUrl === undefined; attempt += 1) {
    publishedUrl = tarballUrl()
    if (publishedUrl === undefined) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5_000)
  }
}
if (typeof publishedUrl !== "string" || !publishedUrl.startsWith(registry)) {
  throw new Error("registry did not return the public package tarball URL")
}
const response = await fetch(publishedUrl)
if (!response.ok) throw new Error(`registry tarball download failed: ${response.status}`)
const registryDigest = sha256(Buffer.from(await response.arrayBuffer()))
if (registryDigest !== digest) throw new Error(`registry artifact differs from the reviewed archive: ${registryDigest}`)
const taggedVersion = output("npm", ["view", `${packageName}@${releasePin.tag}`, "version", `--registry=${registry}`])
if (taggedVersion !== version) throw new Error(`${releasePin.tag} tag does not point to ${version}: ${taggedVersion}`)
process.stdout.write(
  `${packageName}@${version} is published as ${releasePin.tag}; registry SHA-256 matches ${digest}\n`
)
