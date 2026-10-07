import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const objectRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value)

export const readBendToolchain = (root) => {
  const metadata = JSON.parse(readFileSync(resolve(root, "packages/agent-flow-bend/package.json"), "utf8")).hapsland
    ?.toolchain
  if (
    !objectRecord(metadata) ||
    !objectRecord(metadata.bend) ||
    !objectRecord(metadata.lean) ||
    typeof metadata.bend.version !== "string" ||
    typeof metadata.bend.source !== "string" ||
    typeof metadata.lean.version !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(metadata.bend?.version ?? "") ||
    !/^[a-f0-9]{7,40}$/.test(metadata.bend?.source ?? "") ||
    !/^\d+\.\d+\.\d+$/.test(metadata.lean?.version ?? "") ||
    !objectRecord(metadata.platforms) ||
    !Object.keys(metadata.platforms).length
  )
    throw new Error("Invalid producer-owned Bend toolchain metadata")
  for (const [platform, archive] of Object.entries(metadata.platforms)) {
    if (
      !objectRecord(archive) ||
      typeof archive.bend !== "string" ||
      typeof archive.lean !== "string" ||
      typeof archive.leanName !== "string" ||
      !/^(linux|darwin)-(x64|arm64)$/.test(platform) ||
      !/^[a-f0-9]{64}$/.test(archive.bend) ||
      !/^[a-f0-9]{64}$/.test(archive.lean) ||
      !/^[a-z0-9_]+$/.test(archive.leanName)
    )
      throw new Error(`Invalid Bend toolchain archive: ${platform}`)
  }
  return metadata
}
