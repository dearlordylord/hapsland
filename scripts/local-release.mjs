import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { readPreparedRelease } from "./prepared-release.mjs"
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
  !clean()
) {
  throw new Error("release requires clean master equal to origin/master")
}
if (!(["linux", "darwin"].includes(process.platform) && process.arch === "arm64") || process.version !== "v24.20.0") {
  throw new Error(
    [
      "release publication requires Linux/macOS arm64 and Node 24.20.0.",
      `Rerun with: mise exec node@24.20.0 -- npm run local-release (current: ${process.platform}/${process.arch}, Node ${process.version}).`
    ].join("\n")
  )
}
const manifest = JSON.parse(readFileSync("package.json", "utf8"))
if (manifest.name !== packageName || manifest.version !== version || manifest.private === true) {
  throw new Error(`release manifest does not match ${packageName}@${version}`)
}
// This admission never installs dependencies or starts a compiler. Missing,
// stale or corrupt candidates fail before npm authentication or publication.
const artifact = await readPreparedRelease(process.cwd(), releasePin)
const archive = artifact.archivePath
const digest = artifact.archiveDigest
const identity = output("npm", ["whoami", `--registry=${registry}`])
process.stdout.write(`npm identity: ${identity}\nRelease artifact: ${archive}\nSHA-256: ${digest}\n`)

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
  if (!clean() || output("git", ["rev-parse", "HEAD"]) !== head)
    throw new Error("Release inputs changed before publication")
  await readPreparedRelease(process.cwd(), releasePin)
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
