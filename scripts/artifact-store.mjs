import { withBuildLock } from "./build-lock.mjs"
import { withOwnedLock } from "./owned-lock.mjs"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import {
  cp,
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  lstat,
  realpath,
  rename,
  rm,
  writeFile
} from "node:fs/promises"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { dirname, join, relative, resolve } from "node:path"
import { sourceIdentity } from "./test-harness/source-identity.mjs"
import { npmToolingRequire, npmPackageFiles } from "./npm-tooling.mjs"
import { readPackageGraph } from "./package-graph.mjs"
import { generatedNativePaths } from "./native-task-inputs.mjs"

const execute = promisify(execFile)
const requireTime = (deadline) => {
  if (Date.now() >= deadline) throw new Error("Artifact preparation deadline exceeded")
  return deadline - Date.now()
}
const hash = (value) => createHash("sha256").update(value).digest("hex")
export async function fileDigest(path, { deadline = Date.now() + 30000 } = {}) {
  requireTime(deadline)
  const digest = createHash("sha256")
  for await (const chunk of createReadStream(path, { signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) }))
    digest.update(chunk)
  return digest.digest("hex")
}
const json = async (path) => JSON.parse(await readFile(path, "utf8"))
const exists = async (path) =>
  lstat(path).then(
    () => true,
    (error) => {
      if (error.code === "ENOENT") return false
      throw error
    }
  )
export async function treeInventory(root, { deadline = Date.now() + 30000 } = {}) {
  const files = []
  const visit = async (directory, prefix) => {
    requireTime(deadline)
    if (!(await exists(directory))) return
    for (const name of (await readdir(directory)).sort()) {
      const path = join(directory, name),
        relative = prefix ? `${prefix}/${name}` : name
      const metadata = await lstat(path)
      if (metadata.isDirectory()) await visit(path, relative)
      else if (metadata.isFile())
        files.push({ path: relative, mode: metadata.mode & 0o777, sha256: await fileDigest(path, { deadline }) })
      else throw new Error(`Artifact output is not a regular file: ${relative}`)
    }
  }
  await visit(root, "")
  return files
}
export async function artifactStoreDirectory(root) {
  const result = await execute("git", ["-C", root, "rev-parse", "--git-common-dir"], { timeout: 5000 })
  return join(await realpath(resolve(root, result.stdout.trim())), "hapsland-artifacts")
}
// Hash dependency contents under logical names, following workspace links without
// putting a checkout's physical path or timestamps into the artifact identity.
export async function verifyArtifact(directory, expectedIdentity, { deadline = Date.now() + 30000 } = {}) {
  requireTime(deadline)
  let record
  try {
    record = await json(join(directory, "artifact.json"))
  } catch (error) {
    if (error.code === "ENOENT") return undefined
    throw error
  }
  if (record.identity !== expectedIdentity) throw new Error("Artifact identity differs from requested inputs")
  if (!Array.isArray(record.outputs) || !(await exists(join(directory, "outputs"))))
    throw new Error("Artifact output manifest is incomplete")
  if (JSON.stringify(await treeInventory(join(directory, "outputs"), { deadline })) !== JSON.stringify(record.outputs))
    throw new Error("Artifact output checksum or inventory differs from its manifest")
  return record
}
async function publishManifest(directory, record) {
  const temporary = join(directory, `artifact-${process.pid}.tmp`)
  await writeFile(temporary, JSON.stringify(record))
  await rename(temporary, join(directory, "artifact.json"))
}
// Only called under the identity lock, and only when no manifest was published.
async function discardUnpublished(directory) {
  for (const name of await readdir(directory)) {
    if (name !== "lock") await rm(join(directory, name), { recursive: true, force: true })
  }
}
async function checkedStage(runStage, stage) {
  const result = await runStage(stage)
  if (
    result.exitCode !== 0 ||
    result.signal ||
    result.timedOut ||
    result.error ||
    result.groupUnresolved ||
    (result.state !== undefined && result.state !== "passed")
  )
    throw Object.assign(new Error(`${stage.name} failed; see ${result.logPath ?? "stage result"}`), {
      groupUnresolved: Boolean(result.groupUnresolved)
    })
}
// Immutable execution fixtures retain their own source identity and checksum
// verification independently of ordinary package builds.
export async function ensureExecutionArtifact({
  root,
  kind,
  identify,
  prepare,
  destination,
  store,
  deadline = Date.now() + 120000
}) {
  root = resolve(root)
  if (!/^[a-z][a-z-]*$/.test(kind)) throw new Error("Invalid execution artifact kind")
  store ??= await artifactStoreDirectory(root)
  const requested = await identify({ deadline })
  if (!/^[a-f0-9]{64}$/.test(requested.identity)) throw new Error("Invalid execution artifact identity")
  const directory = join(store, kind, requested.identity)
  return withOwnedLock(
    directory,
    async () => {
      if ((await identify({ deadline })).identity !== requested.identity)
        throw new Error("Execution inputs changed while waiting for the artifact lock")
      let record = await verifyArtifact(directory, requested.identity, { deadline })
      const reused = record !== undefined
      if (!record) {
        await discardUnpublished(directory)
        const staging = join(directory, `staging-${process.pid}`)
        await mkdir(staging, { recursive: true })
        await prepare(staging, { deadline, checkedStage })
        if ((await identify({ deadline })).identity !== requested.identity)
          throw new Error("Execution inputs changed during preparation")
        const outputs = await treeInventory(staging, { deadline })
        if (!outputs.length) throw new Error("Execution preparation produced no outputs")
        await rename(staging, join(directory, "outputs"))
        record = { ...requested, outputs }
        requireTime(deadline)
        await publishManifest(directory, record)
      }
      const target = resolve(destination(requested.identity))
      if (await exists(target)) {
        if (JSON.stringify(await treeInventory(target, { deadline })) !== JSON.stringify(record.outputs))
          throw new Error("Materialized execution artifact differs from its manifest")
      } else {
        await mkdir(dirname(target), { recursive: true })
        const staging = await mkdtemp(join(dirname(target), ".hapsland-execution-"))
        try {
          await cp(join(directory, "outputs"), staging, { recursive: true })
          requireTime(deadline)
          await rename(staging, target)
        } finally {
          await rm(staging, { recursive: true, force: true })
        }
      }
      if ((await identify({ deadline })).identity !== requested.identity)
        throw new Error("Execution inputs changed during materialization")
      requireTime(deadline)
      return { ...record, directory: target, reused }
    },
    requireTime(deadline)
  )
}
// Retained archives are immutable evidence, never authority to skip a build,
// validation or pack. Scheduling and output restoration belong to ordinary build.
export async function preparePackageArchive({
  root,
  runStage,
  store,
  recipe = "development",
  validateArchive,
  environment = process.env,
  deadline = Date.now() + 300000
}) {
  root = resolve(root)
  if (!["development", "release"].includes(recipe)) throw new Error("Unknown packaging recipe")
  requireTime(deadline)
  store ??= await artifactStoreDirectory(root)
  return withBuildLock(
    root,
    async (leaseEnvironment) => {
      const env = { ...environment, HAPSLAND_BUILD_LOCK_LEASE: leaseEnvironment.HAPSLAND_BUILD_LOCK_LEASE }
      if (recipe === "release") env.HAPSLAND_BUILD_PROFILE = undefined
      const before = await packageSourceIdentity(root, { deadline })
      await checkedStage(runStage, {
        name: "package-build",
        command: process.execPath,
        args: [npmToolingRequire().resolve("./npm-cli.js"), "run", "build"],
        cwd: root,
        env
      })
      if ((await packageSourceIdentity(root, { deadline })) !== before)
        throw new Error("Package source inputs changed during compilation")
      await checkedStage(runStage, {
        name: "package-validation",
        command: process.execPath,
        args: [npmToolingRequire().resolve("./npm-cli.js"), "run", "verify:release-native"],
        cwd: root,
        env
      })
      if ((await packageSourceIdentity(root, { deadline })) !== before)
        throw new Error("Package source inputs changed during validation")
      const outputs = await packageRuntimeInventory(root, { deadline })
      const stagingRoot = join(root, ".test-runs/package-preparation")
      await mkdir(stagingRoot, { recursive: true })
      const staging = await mkdtemp(join(stagingRoot, "archive-"))
      let preserveStaging = false
      try {
        await checkedStage(runStage, {
          name: "package-pack",
          command: process.execPath,
          args:
            recipe === "release"
              ? [
                  npmToolingRequire().resolve("./npm-cli.js"),
                  "pack",
                  "--ignore-scripts=true",
                  "--json",
                  "--pack-destination",
                  staging
                ]
              : [join(root, "scripts/dev-pack.mjs"), root, staging],
          cwd: root,
          env
        })
        if ((await packageSourceIdentity(root, { deadline })) !== before)
          throw new Error("Package source inputs changed during packing")
        if (JSON.stringify(await packageRuntimeInventory(root, { deadline })) !== JSON.stringify(outputs))
          throw new Error("Package runtime outputs changed during packing")
        const archives = (await readdir(staging)).filter((file) => file.endsWith(".tgz"))
        if (archives.length !== 1) throw new Error("Package stage must produce exactly one archive")
        const file = archives[0],
          archiveDigest = await fileDigest(join(staging, file), { deadline })
        const directory = join(store, "archives", archiveDigest),
          archivePath = join(directory, file)
        await withOwnedLock(
          directory,
          async () => {
            if ((await packageSourceIdentity(root, { deadline })) !== before)
              throw new Error("Package source inputs changed before archive retention")
            if (JSON.stringify(await packageRuntimeInventory(root, { deadline })) !== JSON.stringify(outputs))
              throw new Error("Package runtime outputs changed before archive retention")
            if (await exists(archivePath)) {
              if ((await fileDigest(archivePath, { deadline })) !== archiveDigest)
                throw new Error("Retained archive checksum differs from its identity")
            } else {
              const temporary = join(directory, `archive-${process.pid}.tmp`)
              await copyFile(join(staging, file), temporary)
              if ((await fileDigest(temporary, { deadline })) !== archiveDigest)
                throw new Error("Archive bytes changed during retention")
              requireTime(deadline)
              await rename(temporary, archivePath)
            }
          },
          requireTime(deadline)
        )
        const artifact = { archivePath, archiveDigest }
        // Release audit consumes the same fresh receipts under this build lease.
        requireTime(deadline)
        if (validateArchive) await validateArchive(artifact)
        requireTime(deadline)
        return artifact
      } catch (error) {
        preserveStaging = error.groupUnresolved === true
        throw error
      } finally {
        if (!preserveStaging) await rm(staging, { recursive: true, force: true })
      }
    },
    requireTime(deadline)
  )
}

export async function packageSourceIdentity(root, { deadline = Date.now() + 30000 } = {}) {
  const manifest = await json(join(root, "package.json"))
  const graph = manifest.workspaces ? readPackageGraph(root) : undefined
  const excludedDirectories = graph
    ? [...graph.workspaces.values()].flatMap((owner) => [
        `${owner.directory}/dist`,
        ...(owner.manifest.hapsland?.nativeAssets?.length ? [`${owner.directory}/artifacts/native`] : [])
      ])
    : []
  const excludedFiles = graph
    ? generatedNativePaths(root, graph).map((path) => relative(root, path).replaceAll("\\", "/"))
    : []
  const source = await sourceIdentity(root, undefined, undefined, { deadline, excludedDirectories, excludedFiles })
  const shipped = []
  for (const path of (await npmPackageFiles(root)).sort()) {
    if (
      path.startsWith("dist/") ||
      excludedFiles.includes(path) ||
      excludedDirectories.some((directory) => path === directory || path.startsWith(`${directory}/`))
    )
      continue
    const metadata = await lstat(join(root, path))
    if (!metadata.isFile()) throw new Error(`Packaged input is not a regular file: ${path}`)
    shipped.push({ path, mode: metadata.mode & 0o777, sha256: await fileDigest(join(root, path), { deadline }) })
  }
  return hash(JSON.stringify({ source, shipped }))
}
async function packageRuntimeInventory(root, { deadline }) {
  const result = []
  for (const directory of ["dist", "native/prebuilt"]) {
    const path = join(root, directory)
    if (await exists(path)) result.push({ directory, files: await treeInventory(path, { deadline }) })
  }
  if (!result.some((owner) => owner.directory === "dist" && owner.files.length))
    throw new Error("Build produced no runtime outputs")
  return result
}
