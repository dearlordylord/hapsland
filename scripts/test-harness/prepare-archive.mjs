import { mkdir, readdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { sourceIdentity } from "./source-identity.mjs"
import { ensurePackageArtifact } from "../artifact-store.mjs"

/** Reuse verified build outputs and archives, but always record fresh run evidence. */
export async function prepareArchive({ root, runDirectory, runStage, toolchain, deadline = Date.now() + 300000 }) {
  root = resolve(root)
  runDirectory = resolve(runDirectory)
  const artifacts = join(runDirectory, "package")
  await mkdir(artifacts, { recursive: true })
  if ((await readdir(artifacts)).length !== 0) throw new Error("Archive output directory must be empty")
  const sourceDigest = await sourceIdentity(root, runDirectory, undefined, { deadline })
  const artifact = await ensurePackageArtifact({ root, runStage, toolchain, deadline })
  if ((await sourceIdentity(root, runDirectory, undefined, { deadline })) !== sourceDigest)
    throw new Error("Source inputs changed during archive preparation; archive cannot validate these sources")
  const evidence = { ...artifact, sourceDigest }
  await writeFile(join(artifacts, "artifact.json"), `${JSON.stringify(artifact, null, 2)}\n`)
  await writeFile(join(runDirectory, "archive.json"), `${JSON.stringify(evidence, null, 2)}\n`)
  return evidence
}
