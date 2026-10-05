import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import {
  cp,
  copyFile,
  chmod,
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
import { basename, dirname, join, resolve } from "node:path"
import { sourceIdentity } from "./test-harness/source-identity.mjs"
import { BUN_VERSION } from "../src/runtime/bun-runtime.ts"
import { resolveBunRuntime } from "./pinned-bun.mjs"
import { npmToolingRequire, npmPackageFiles } from "./npm-tooling.mjs"
import { dependencyDigestMemo } from "./dependency-digests.mjs"

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
  return join(resolve(root, result.stdout.trim()), "hapsland-artifacts")
}
export async function buildToolchain(environment = process.env) {
  const version = async (command, args) => {
    const result = await execute(command, args, { timeout: 5000 })
    return (result.stdout || result.stderr).trim().split("\n")[0]
  }
  return {
    node: process.version,
    bun: await version(resolveBunRuntime(environment).executable, ["--version"]),
    requiredBun: BUN_VERSION,
    bend: await version("bend", ["version"]),
    cc: await version("cc", ["--version"]),
    libsecret: process.platform === "linux" ? await version("pkg-config", ["--modversion", "libsecret-1"]) : null,
    npm: npmToolingRequire(environment.npm_execpath)("../package.json").version,
    targets: environment.HAPSLAND_BUILD_PROFILE
      ? [environment.HAPSLAND_BUILD_PROFILE]
      : ["linux-arm64", "darwin-arm64"],
    platform: process.platform,
    architecture: process.arch,
    modules: process.versions.modules
  }
}
// Hash dependency contents under logical names, following workspace links without
// putting a checkout's physical path or timestamps into the artifact identity.
let dependencyReaders = 0
const dependencyReadQueue = []
async function readDependency(path, metadata, deadline, memo) {
  if (Date.now() >= deadline) throw new Error("Dependency identity deadline exceeded")
  if (dependencyReaders >= 8) await new Promise((ready) => dependencyReadQueue.push(ready))
  else dependencyReaders += 1
  try {
    return await memo.digest(path, metadata)
  } finally {
    const next = dependencyReadQueue.shift()
    if (next) next()
    else dependencyReaders -= 1
  }
}
export async function dependencyIdentity(root, { deadline = Date.now() + 30000, metrics } = {}) {
  const memo = await dependencyDigestMemo({
    directory: join(await artifactStoreDirectory(root), "dependency-digests"),
    deadline,
    metrics
  })
  const directories = new Map()
  const visit = async (path, ancestors) => {
    if (Date.now() >= deadline) throw new Error("Dependency identity deadline exceeded")
    if (!(await exists(path))) return { digest: hash("missing"), cyclic: false }
    let actual
    try {
      actual = await realpath(path)
    } catch (error) {
      if (error.code !== "ENOENT") throw error
      return { digest: hash("missing-target"), cyclic: false }
    }
    const metadata = await lstat(actual, { bigint: true })
    if (metadata.isFile()) {
      const digest = await readDependency(actual, metadata, deadline, memo)
      if ((await realpath(path)) !== actual) throw new Error("Dependency link changed during hashing")
      return { digest: hash(`${metadata.mode & 0o777n}:${digest}`), cyclic: false }
    }
    if (!metadata.isDirectory()) throw new Error("Unsupported dependency input")
    if (ancestors.has(actual)) return { digest: hash("cycle"), cyclic: true }
    if (directories.has(actual)) return directories.get(actual)
    const next = new Set([...ancestors, actual])
    const names = (await readdir(actual))
      .sort()
      .filter((name) => ![".cache", ".vite", ".vite-temp", ".vitest", ".git"].includes(name))
    const children = await Promise.all(names.map((name) => visit(join(actual, name), next)))
    const entries = children.map((child, index) => [names[index], child.digest])
    const cyclic = children.some((child) => child.cyclic)
    const result = { digest: hash(JSON.stringify(entries)), cyclic }
    if (!cyclic) directories.set(actual, result)
    return result
  }
  const identity = (await visit(join(root, "node_modules"), new Set())).digest
  await memo.publish()
  return identity
}
export async function artifactIdentities(
  root,
  toolchain,
  recipe = "development",
  { deadline = Date.now() + 30000 } = {}
) {
  if (!["development", "release"].includes(recipe)) throw new Error("Unknown packaging recipe")
  const nativeOutput = `native/prebuilt/${toolchain.platform}-${toolchain.architecture}`
  const buildInput = (path) =>
    !path.endsWith(".md") &&
    !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path) &&
    !/\/(?:conformance|fixtures|validation-evidence)\//.test(path) &&
    path !== nativeOutput &&
    !path.startsWith(`${nativeOutput}/`) &&
    (["src", "scripts", "native", "vendor", "bin", "packages"].includes(path.split("/")[0]) ||
      ["package.json", "package-runtime.json", "bun.lock", "tsconfig.json", "tsconfig.build.json"].includes(path))
  const manifest = await json(join(root, "package.json"))
  const selections = (manifest.files ?? []).map((path) => path.replace(/\/$/, "").split(/[?*[]/, 1)[0])
  const packageInput = (path) =>
    path !== nativeOutput &&
    !path.startsWith(`${nativeOutput}/`) &&
    (["package.json", "README.md", ".npmignore", ".gitignore"].includes(path) ||
      /(?:^|\/)(?:licen[cs]e|copying)(?:\.|$)/i.test(path) ||
      selections.some((prefix) => path === prefix || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)))
  const build = {
    source: await sourceIdentity(root, undefined, buildInput, { deadline }),
    dependencies: await dependencyIdentity(root, { deadline }),
    toolchain
  }
  const shipped = []
  for (const path of (await npmPackageFiles(root)).sort()) {
    requireTime(deadline)
    if (path === "dist" || path.startsWith("dist/") || path === nativeOutput || path.startsWith(`${nativeOutput}/`))
      continue
    const metadata = await lstat(join(root, path))
    if (!metadata.isFile()) throw new Error(`Packaged input is not a regular file: ${path}`)
    shipped.push({ path, mode: metadata.mode & 0o777, sha256: await fileDigest(join(root, path), { deadline }) })
  }
  return {
    build: hash(JSON.stringify(build)),
    package: hash(
      JSON.stringify({
        recipe: recipe === "development" ? "npm-packlist/tar-gzip-1" : "npm-pack",
        build,
        source: await sourceIdentity(root, undefined, packageInput, { deadline }),
        shipped
      })
    ),
    inputs: build
  }
}
const ownerAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error.code === "ESRCH") return false
    throw error
  }
}
export async function withArtifactLock(directory, work, timeoutMs = 300000) {
  await mkdir(directory, { recursive: true })
  const lock = join(directory, "lock"),
    deadline = Date.now() + timeoutMs
  while (true) {
    try {
      await mkdir(lock)
      break
    } catch (error) {
      if (error.code !== "EEXIST") throw error
      const owner = await json(join(lock, "owner.json")).catch((error) => {
        if (error.code === "ENOENT") return undefined
        throw error
      })
      if (owner && (!Number.isInteger(owner.pid) || owner.pid <= 1))
        throw new Error(`Invalid artifact lock owner: ${lock}`)
      if (owner && !ownerAlive(owner.pid)) throw new Error(`Abandoned artifact lock needs owned-process audit: ${lock}`)
      if (Date.now() >= deadline) throw new Error(`Artifact lock deadline exceeded: ${lock}`)
      await new Promise((done) => setTimeout(done, 25))
    }
  }
  let preserveLock = false
  try {
    await writeFile(join(lock, "owner.tmp"), JSON.stringify({ pid: process.pid }))
    await rename(join(lock, "owner.tmp"), join(lock, "owner.json"))
    requireTime(deadline)
    return await work()
  } catch (error) {
    preserveLock = error.groupUnresolved === true
    throw error
  } finally {
    if (!preserveLock) await rm(lock, { recursive: true, force: true })
  }
}
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
  if (record.archive) {
    if (
      typeof record.archive.file !== "string" ||
      basename(record.archive.file) !== record.archive.file ||
      !/^[a-f0-9]{64}$/.test(record.archive.sha256)
    )
      throw new Error("Artifact archive manifest is invalid")
    if ((await fileDigest(join(directory, record.archive.file), { deadline })) !== record.archive.sha256)
      throw new Error("Artifact archive checksum differs from its manifest")
  }
  return record
}
async function restoreNativeOutputs(directory, root, nativePath, outputs) {
  for (const file of outputs.filter((file) => file.path.startsWith(`${nativePath}/`))) {
    const target = join(root, file.path)
    await mkdir(dirname(target), { recursive: true })
    const staging = await mkdtemp(join(dirname(target), ".hapsland-native-restore-"))
    try {
      const temporary = join(staging, "artifact")
      await copyFile(join(directory, "outputs", file.path), temporary)
      await chmod(temporary, file.mode)
      // Never truncate a binding or executable that a live process has mapped.
      await rename(temporary, target)
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
  }
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
// Immutable execution artifacts use the same locks, manifests and checksum
// verification as package artifacts, without requiring package compilation.
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
  return withArtifactLock(
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
export async function ensurePackageArtifact({
  root,
  runStage,
  store,
  toolchain,
  identity = artifactIdentities,
  recipe = "development",
  deadline = Date.now() + 300000
}) {
  root = resolve(root)
  store ??= await artifactStoreDirectory(root)
  toolchain ??= await buildToolchain()
  const requested = await identity(root, toolchain, recipe, { deadline })
  const buildDirectory = join(store, "builds", requested.build),
    packageDirectory = join(store, "packages", requested.package)
  const nativePath = `native/prebuilt/${toolchain.platform}-${toolchain.architecture}`
  const remaining = () => {
    if (Date.now() >= deadline) throw new Error("Artifact preparation deadline exceeded")
    return deadline - Date.now()
  }
  // A content lock coordinates worktrees; the checkout lock protects mutable dist.
  return withArtifactLock(
    join(store, "worktrees", hash(await realpath(root))),
    () =>
      withArtifactLock(
        buildDirectory,
        async () => {
          let build = await verifyArtifact(buildDirectory, requested.build, { deadline })
          const buildReused = build !== undefined
          if (!build) {
            await discardUnpublished(buildDirectory)
            await checkedStage(runStage, {
              name: "package-build",
              command: process.execPath,
              args: [npmToolingRequire().resolve("./npm-cli.js"), "run", "build"],
              cwd: root,
              env: {}
            })
            if ((await identity(root, toolchain, recipe, { deadline })).build !== requested.build)
              throw new Error("Build inputs changed during compilation")
            const staging = join(buildDirectory, `staging-${process.pid}`)
            await mkdir(staging, { recursive: true })
            await cp(join(root, "dist"), join(staging, "dist"), { recursive: true })
            if (await exists(join(root, nativePath)))
              await cp(join(root, nativePath), join(staging, nativePath), { recursive: true })
            const outputs = await treeInventory(staging, { deadline })
            if (!outputs.length) throw new Error("Build produced no runtime outputs")
            await rename(staging, join(buildDirectory, "outputs"))
            build = { identity: requested.build, inputs: requested.inputs, outputs }
            remaining()
            await publishManifest(buildDirectory, build)
          } else {
            await rm(join(root, "dist"), { recursive: true, force: true })
            await cp(join(buildDirectory, "outputs/dist"), join(root, "dist"), { recursive: true })
            await restoreNativeOutputs(buildDirectory, root, nativePath, build.outputs)
          }
          return withArtifactLock(
            packageDirectory,
            async () => {
              let packaged = await verifyArtifact(packageDirectory, requested.package, { deadline })
              const packageReused = packaged !== undefined
              if (!packaged) {
                await discardUnpublished(packageDirectory)
                const staging = join(packageDirectory, `staging-${process.pid}`)
                await mkdir(staging, { recursive: true })
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
                  env: {}
                })
                const current = await identity(root, toolchain, recipe, { deadline })
                if (current.package !== requested.package) throw new Error("Package inputs changed during packing")
                const archives = (await readdir(staging)).filter((file) => file.endsWith(".tgz"))
                if (archives.length !== 1) throw new Error("Package stage must produce exactly one archive")
                const file = archives[0],
                  sha256 = await fileDigest(join(staging, file), { deadline })
                await rename(join(staging, file), join(packageDirectory, file))
                await rm(staging, { recursive: true, force: true })
                await mkdir(join(packageDirectory, "outputs"))
                packaged = {
                  identity: requested.package,
                  buildIdentity: requested.build,
                  outputs: [],
                  archive: { file, sha256 }
                }
                remaining()
                await publishManifest(packageDirectory, packaged)
              }
              const verifiedInputs = await identity(root, toolchain, recipe, { deadline })
              if (verifiedInputs.build !== requested.build || verifiedInputs.package !== requested.package)
                throw new Error("Artifact inputs changed during preparation")
              remaining()
              return {
                archivePath: join(packageDirectory, packaged.archive.file),
                archiveDigest: packaged.archive.sha256,
                buildIdentity: requested.build,
                packageIdentity: requested.package,
                buildReused,
                packageReused
              }
            },
            remaining()
          )
        },
        remaining()
      ),
    remaining()
  )
}
