import { createHash } from "node:crypto"
import { readFile, mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { artifactStoreDirectory, fileDigest } from "./artifact-store.mjs"
import { assertReleaseSource } from "./release-inputs.mjs"
import { validateReleaseCoordinates } from "./release-coordinates.mjs"
import { BUN_VERSION } from "./pinned-bun.mjs"
import { checkReleaseSize } from "./release-size.mjs"

export async function retainReleaseAudit(root, record) {
  const bytes = `${JSON.stringify(record, null, 2)}\n`
  const auditSha256 = createHash("sha256").update(bytes).digest("hex")
  const directory = join(await artifactStoreDirectory(root), "release-audits")
  await mkdir(directory, { recursive: true })
  const path = join(directory, `${auditSha256}.json`)
  try {
    await writeFile(path, bytes, { flag: "wx", mode: 0o600 })
  } catch (error) {
    if (error.code !== "EEXIST" || (await readFile(path, "utf8")) !== bytes) throw error
  }
  return auditSha256
}

export async function readPreparedRelease(root, coordinates) {
  const pin = validateReleaseCoordinates(coordinates)
  const head = assertReleaseSource(root, pin)
  const store = await artifactStoreDirectory(root)
  const archivePath = join(store, "archives", pin.archiveSha256, pin.archiveFilename)
  let auditBytes, digest
  try {
    auditBytes = await readFile(join(store, "release-audits", `${pin.auditSha256}.json`))
    checkReleaseSize(archivePath)
    digest = await fileDigest(archivePath)
  } catch (error) {
    if (error.code === "ENOENT")
      throw new Error(
        "Prepared release archive or audit is missing on this host. Run npm run release:prepare; local-release never rebuilds."
      )
    throw error
  }
  if (digest !== pin.archiveSha256 || createHash("sha256").update(auditBytes).digest("hex") !== pin.auditSha256)
    throw new Error("Prepared release archive or audit is corrupt. Run npm run release:prepare.")
  const audit = JSON.parse(auditBytes)
  if (
    audit.format !== 1 ||
    audit.status !== "audited" ||
    audit.package !== `${pin.packageName}@${pin.version}` ||
    audit.repositoryUrl !== pin.repositoryUrl ||
    audit.commit !== pin.sourceCommit ||
    audit.sourceTreeSha256 !== pin.sourceTreeSha256 ||
    audit.archiveSha256 !== pin.archiveSha256 ||
    audit.buildPlatform !== pin.buildPlatform ||
    audit.toolchain?.node !== "v24.20.0" ||
    audit.toolchain?.bun !== BUN_VERSION
  )
    throw new Error("Prepared release audit does not match the pin. Run npm run release:prepare.")
  return { archivePath, archiveDigest: digest, audit, head }
}
