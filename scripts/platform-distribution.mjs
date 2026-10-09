import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { statSync } from "node:fs"
import { archiveInventory } from "./archive-inventory.mjs"
import { npmToolingRequire } from "./npm-tooling.mjs"
import { artifactStoreDirectory, fileDigest } from "./artifact-store.mjs"
import { BUN_VERSION } from "./pinned-bun.mjs"
import { readPreparedRelease } from "./prepared-release.mjs"

export const DISTRIBUTION_REPOSITORY = "dearlordylord/hapsland-releases"
export const PROFILES = ["darwin-arm64", "linux-arm64"]
export function platformFiles(inventory, profile) {
  if (!PROFILES.includes(profile)) throw new Error("Unsupported distribution profile")
  return [...inventory]
    .filter(([path, record]) => {
      if (record.directory) return false
      const match = /^package\/(?:dist\/bin|native\/prebuilt)\/([^/]+)\//u.exec(path)
      if (match && !PROFILES.includes(match[1])) throw new Error(`Unknown platform asset: ${path}`)
      return !match || match[1] === profile
    })
    .map(([path]) => path)
    .sort()
}
export async function splitPlatformArchive(archive, output, profile) {
  const inventory = await archiveInventory(archive)
  const files = platformFiles(inventory, profile)
  for (const command of ["hapsland", "hapsland-hook", "hapsland-resident", "hapsland-parser", "hapsland-doctor"])
    if (!files.includes(`package/dist/bin/${profile}/${command}`))
      throw new Error(`Missing platform command: ${command}`)
  const stage = await mkdtemp(join(tmpdir(), "hapsland-distribution-"))
  const tar = npmToolingRequire()("tar")
  try {
    const selected = new Set(files)
    await tar.x({ file: archive, cwd: stage, strict: true, filter: (path) => selected.has(path) })
    await tar.c({ file: output, cwd: stage, portable: true, mtime: new Date(0), gzip: { level: 9 } }, files)
    await verifyPlatformArchive(inventory, output, profile)
    return {
      profile,
      filename: output.split(/[\\/]/u).at(-1),
      sha256: await fileDigest(output),
      bytes: statSync(output).size
    }
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}
export async function verifyPlatformArchive(inventory, archive, profile) {
  const selected = new Set(platformFiles(inventory, profile))
  const actual = await archiveInventory(archive)
  const published = [...actual].filter(([, record]) => !record.directory)
  if (published.length !== selected.size) throw new Error("Distribution inventory differs from the selected platform")
  for (const [path, record] of published) {
    const expected = inventory.get(path)
    if (!selected.has(path) || record.sha256 !== expected.sha256 || record.mode !== expected.mode)
      throw new Error(`Distribution changed audited bytes or modes: ${path}`)
  }
}
export function homebrewFormula(manifest) {
  const asset = (profile) => {
    const record = manifest.archives.find((item) => item.profile === profile)
    if (
      !record ||
      !/^[a-f0-9]{64}$/u.test(record.sha256) ||
      record.filename !== `hapsland-${manifest.version}-${profile}.tar.gz`
    )
      throw new Error("Invalid formula asset")
    return `url "https://github.com/${DISTRIBUTION_REPOSITORY}/releases/download/v${manifest.version}/${record.filename}"\n      sha256 "${record.sha256}"`
  }
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(manifest.version)) throw new Error("Invalid distribution version")
  return `class Hapsland < Formula
  desc "Runtime-neutral code review integration for coding agents"
  homepage "https://github.com/${DISTRIBUTION_REPOSITORY}"
  version "${manifest.version}"
  depends_on arch: :arm64

  on_macos do
    on_arm do
      ${asset("darwin-arm64")}
    end
  end

  on_linux do
    on_arm do
      ${asset("linux-arm64")}
    end
  end

  def install
    libexec.install Dir["*"]
    %w[hapsland hapsland-hook hapsland-resident hapsland-parser hapsland-doctor].each do |command|
      bin.install_symlink libexec/"bin/launch.sh" => command
    end
  end

  def caveats
    <<~EOS
      Package installation does not activate coding-agent hooks. Run:
        #{opt_bin}/hapsland setup --target=#{opt_bin}/hapsland

      To update an existing installation, keep old packages until activation:
        HOMEBREW_NO_INSTALL_CLEANUP=1 brew upgrade dearlordylord/tap/hapsland
        #{opt_bin}/hapsland update --target=#{opt_bin}/hapsland

      Do not remove old packages while hooks or running sessions still use them.
    EOS
  end

  test do
    assert_match(/usage/i, shell_output("#{bin}/hapsland --help"))
    assert_match "${BUN_VERSION}", shell_output("#{bin}/hapsland-hook --runtime-identity")
    assert_match(/usage/i, shell_output("#{bin}/hapsland-resident --help"))
    assert_match(/usage/i, shell_output("#{bin}/hapsland-parser --help"))
    assert_match(/usage/i, shell_output("#{bin}/hapsland-doctor --help"))
  end
end
`
}
export async function preparePlatformDistribution(candidate) {
  const pin = JSON.parse(await readFile(join(candidate, "scripts/npm-release-pin.json"), "utf8"))
  const prepared = await readPreparedRelease(candidate, pin)
  const directory = join(await artifactStoreDirectory(candidate), "distributions", pin.archiveSha256)
  await mkdir(directory, { recursive: true })
  const manifest = {
    format: 1,
    version: pin.version,
    channel: pin.tag,
    sourceCommit: pin.sourceCommit,
    sourceTreeSha256: pin.sourceTreeSha256,
    npmArchiveSha256: pin.archiveSha256,
    auditSha256: pin.auditSha256,
    archives: []
  }
  for (const profile of PROFILES)
    manifest.archives.push(
      await splitPlatformArchive(
        prepared.archivePath,
        join(directory, `hapsland-${pin.version}-${profile}.tar.gz`),
        profile
      )
    )
  await writeFile(join(directory, "distribution.json"), `${JSON.stringify(manifest, null, 2)}\n`)
  await writeFile(join(directory, "SHA256SUMS"), manifest.archives.map((a) => `${a.sha256}  ${a.filename}\n`).join(""))
  await writeFile(join(directory, "hapsland.rb"), homebrewFormula(manifest))
  await readPreparedRelease(candidate, pin)
  return { directory, manifest }
}
