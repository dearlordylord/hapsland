import { execFileSync } from "node:child_process"
import { readFile, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileDigest } from "./artifact-store.mjs"
import { DISTRIBUTION_REPOSITORY, PROFILES, homebrewFormula, verifyPlatformArchive } from "./platform-distribution.mjs"

import { readPreparedRelease } from "./prepared-release.mjs"
import { archiveInventory } from "./archive-inventory.mjs"

const args = process.argv.slice(2)
if (
  args.length !== 3 ||
  !args[0].startsWith("--directory=") ||
  !args[1].startsWith("--candidate=") ||
  !["--verify-only", "--publish"].includes(args[2])
)
  throw new Error(
    "usage: node scripts/publish-platform-distribution.mjs --directory=PATH --candidate=PATH --verify-only|--publish"
  )
const directory = resolve(args[0].slice("--directory=".length))
const manifest = JSON.parse(await readFile(join(directory, "distribution.json"), "utf8"))
if (
  manifest.format !== 1 ||
  !["latest", "next"].includes(manifest.channel) ||
  manifest.archives?.length !== 2 ||
  new Set(manifest.archives.map((a) => a.profile)).size !== 2 ||
  !manifest.archives.every((a) => PROFILES.includes(a.profile)) ||
  !/^[a-f0-9]{40}$/u.test(manifest.sourceCommit) ||
  ![manifest.sourceTreeSha256, manifest.npmArchiveSha256, manifest.auditSha256].every((value) =>
    /^[a-f0-9]{64}$/u.test(value)
  )
)
  throw new Error("Invalid platform distribution manifest")
const candidate = resolve(args[1].slice("--candidate=".length))
const pin = JSON.parse(await readFile(join(candidate, "scripts/npm-release-pin.json"), "utf8"))
const prepared = await readPreparedRelease(candidate, pin)
for (const [field, pinField] of [
  ["version", "version"],
  ["channel", "tag"],
  ["sourceCommit", "sourceCommit"],
  ["sourceTreeSha256", "sourceTreeSha256"],
  ["npmArchiveSha256", "archiveSha256"],
  ["auditSha256", "auditSha256"]
])
  if (manifest[field] !== pin[pinField]) throw new Error("Distribution differs from the prepared release pin")
const inventory = await archiveInventory(prepared.archivePath)
homebrewFormula(manifest)
for (const asset of manifest.archives)
  if ((await fileDigest(join(directory, asset.filename))) !== asset.sha256)
    throw new Error("Distribution asset is corrupt")
const sums = manifest.archives.map((a) => `${a.sha256}  ${a.filename}\n`).join("")
if ((await readFile(join(directory, "SHA256SUMS"), "utf8")) !== sums)
  throw new Error("Distribution checksum list differs")
for (const asset of manifest.archives)
  await verifyPlatformArchive(inventory, join(directory, asset.filename), asset.profile)
if (args[2] === "--verify-only") {
  console.log("Verified platform distribution", manifest.version)
  process.exit(0)
}
await readPreparedRelease(candidate, pin)
const gh = (...parameters) =>
  execFileSync("gh", parameters, { encoding: "utf8", timeout: 120000, maxBuffer: 1024 * 1024 })
const tag = `v${manifest.version}`
const assets = [...manifest.archives.map((a) => a.filename), "distribution.json", "SHA256SUMS"]
const notes = `Self-contained Hapsland ${manifest.version} for macOS arm64 and Linux arm64. No external Node/Bun required.\n\nSource candidate: ${manifest.sourceCommit}\nAudited npm archive: ${manifest.npmArchiveSha256}\nAudit: ${manifest.auditSha256}\n\nThese are platform subsets of the accepted candidate, with retained file bytes and modes. Offline installed checks do not establish every agent-runtime compatibility profile.\n`
gh(
  "release",
  "create",
  tag,
  ...assets.map((file) => join(directory, file)),
  "--repo",
  DISTRIBUTION_REPOSITORY,
  "--draft",
  "--title",
  `Hapsland ${manifest.version}`,
  "--notes",
  notes,
  ...(manifest.channel === "next" ? ["--prerelease"] : [])
)
const downloaded = await mkdtemp(join(tmpdir(), "hapsland-publication-"))
try {
  gh("release", "download", tag, "--repo", DISTRIBUTION_REPOSITORY, "--dir", downloaded)
  for (const file of assets)
    if ((await fileDigest(join(directory, file))) !== (await fileDigest(join(downloaded, file))))
      throw new Error("Uploaded release differs; retaining draft")
  console.log(
    gh(
      "release",
      "edit",
      tag,
      "--repo",
      DISTRIBUTION_REPOSITORY,
      "--draft=false",
      ...(manifest.channel === "latest" ? ["--latest"] : [])
    )
  )
  console.log(`https://github.com/${DISTRIBUTION_REPOSITORY}/releases/tag/${tag}`)
} finally {
  await rm(downloaded, { recursive: true, force: true })
}
