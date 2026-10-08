import { foreignNativeInput, nativeInputRecipe } from "./native-input-bundle.mjs"
import { createHash } from "node:crypto"
import { existsSync, lstatSync, readFileSync, realpathSync, mkdirSync, writeFileSync, renameSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve, relative } from "node:path"
import { fileEvidence } from "./compiler-evidence.mjs"
import { nativeHeaderSearch } from "./native-header-search.mjs"
import { nativeCompilerInputs } from "./native-compiler-inputs.mjs"
import {
  nativeToolchainInputs,
  nativeDirectoryInventory,
  nativeToolSelection,
  nativeToolNames
} from "./native-toolchain-inputs.mjs"
import { runBuildProcess } from "./build-process.mjs"
import { resolveDeclaredDependencyVersion } from "./package-graph.mjs"
import { checkNativeTaskReceipt, validateNativeBinary } from "./native-task-receipt.mjs"

export const nativeDigest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
export const nativeEnvironment = (env) =>
  Object.fromEntries(
    [
      "PATH",
      "CPATH",
      "C_INCLUDE_PATH",
      "LIBRARY_PATH",
      "COMPILER_PATH",
      "GCC_EXEC_PREFIX",
      "LD_LIBRARY_PATH",
      "LD_PRELOAD",
      "LD_AUDIT",
      "LDEMULATION",
      "GNUTARGET",
      "PKG_CONFIG_PATH",
      "PKG_CONFIG_LIBDIR",
      "PKG_CONFIG_SYSROOT_DIR",
      "SOURCE_DATE_EPOCH",
      "LANG",
      "LC_ALL",
      "LC_CTYPE",
      "LC_MESSAGES",
      "GCC_COMPARE_DEBUG",
      "GCC_COMPARE_DEBUG_OPT",
      "DEPENDENCIES_OUTPUT",
      "SUNPRO_DEPENDENCIES",
      "SDKROOT",
      "MACOSX_DEPLOYMENT_TARGET",
      "NODE_OPTIONS",
      "NODE_PATH",
      "BUN_OPTIONS"
    ].map((key) => [key, env[key] ?? null])
  )
const record = (root, path) => ({ requested: path, ...fileEvidence(root, realpathSync(resolve(root, path))) })
const safeRelative = (path) =>
  typeof path === "string" && !path.startsWith("/") && !path.split("/").some((part) => ["", ".", ".."].includes(part))
export const nativeTaskDirectory = (node, profile) => resolve(node.path, "artifacts/native", profile)
export const nativeTaskStampPath = (root, node, profile) =>
  resolve(root, ".test-runs/native-task-inputs", node.manifest.hapsland.domain, `${profile}.json`)
export function nativeTaskPlans(root, graph, profile, selectedOwners) {
  if (!["linux-arm64", "darwin-arm64"].includes(profile)) throw new Error(`Unsupported native target: ${profile}`)
  const result = []
  for (const node of graph.packages.values()) {
    if (selectedOwners && !selectedOwners.includes(node.manifest.name)) continue
    const assets = []
    for (const asset of node.manifest.hapsland?.nativeAssets ?? []) {
      if (
        !asset.producer?.profiles ||
        !["c", "package-binding"].includes(asset.producer.kind) ||
        !safeRelative(asset.source) ||
        !asset.path?.startsWith("native/prebuilt/{profile}/")
      )
        throw new Error(`Unsupported native producer declaration: ${node.manifest.name}`)
      if (Object.keys(asset.producer.profiles).some((key) => !["linux-arm64", "darwin-arm64"].includes(key)))
        throw new Error("Unsupported native producer profile")
      if (!Object.hasOwn(asset.producer.profiles, profile)) continue
      const tail = asset.path.slice("native/prebuilt/{profile}/".length)
      if (!safeRelative(tail)) throw new Error("Escaped native artifact path")
      const installedPath = asset.path.replace("{profile}", profile)
      assets.push({ asset, output: resolve(nativeTaskDirectory(node, profile), tail), installedPath })
    }
    if (assets.length) {
      if (!/^[a-z0-9-]+$/.test(node.manifest.hapsland.domain))
        throw new Error("Native owner must declare an exact domain")
      if (new Set(assets.map((asset) => asset.output)).size !== assets.length)
        throw new Error("Duplicate native output")
      result.push({ node, profile, assets })
    }
  }
  return result
}
export const generatedNativePaths = (root, graph) =>
  ["linux-arm64", "darwin-arm64"].flatMap((profile) =>
    nativeTaskPlans(root, graph, profile).flatMap((plan) =>
      plan.assets.map(({ installedPath }) => resolve(root, installedPath))
    )
  )
export function validateNativeEvidence(root, evidence) {
  for (const input of evidence.files ?? []) {
    const current = record(root, input.requested ?? resolve(root, input.path))
    if (JSON.stringify(current) !== JSON.stringify(input)) throw new Error(`Native input changed: ${input.path}`)
  }
  for (const directory of evidence.search ?? []) {
    if (
      JSON.stringify(nativeDirectoryInventory(directory.path, directory.recursive === true)) !==
      JSON.stringify(directory.entries)
    )
      throw new Error(`Native search directory changed: ${directory.path}`)
  }
  for (const tool of evidence.toolSelections ?? []) {
    const { name: _name, ...selected } = tool
    if (
      JSON.stringify(nativeToolSelection(root, tool.command, evidence.context.environment)) !== JSON.stringify(selected)
    )
      throw new Error(`Native tool changed: ${tool.name}`)
  }
}
const tooling = (root) =>
  [
    "native-input-bundle",
    "native-binding-source",
    "native-task-inputs",
    "native-task",
    "native-task-receipt",
    "native-artifact",
    "native-compiler-inputs",
    "native-linker-inputs",
    "native-toolchain-inputs",
    "native-header-search",
    "build-process",
    "build-lock",
    "build-groups",
    "owned-lock",
    "compiler-evidence",
    "package-graph"
  ].map((name) => fileEvidence(root, resolve(root, `scripts/${name}.mjs`)))
async function cInputs(root, asset, profile, env, previous) {
  const declaration = asset.producer.profiles[profile]
  if (
    !safeRelative(declaration.source) ||
    !Array.isArray(declaration.compileFlags) ||
    !Array.isArray(declaration.linkFlags)
  )
    throw new Error("Incomplete C producer declaration")
  const flags = [...declaration.compileFlags],
    linkFlags = [...declaration.linkFlags]
  const extra = []
  if (declaration.nodeApiHeaders) {
    const candidates = [
      resolve(dirname(process.execPath), "../include/node"),
      "/usr/local/include/node",
      "/usr/include/node",
      "/opt/homebrew/include/node"
    ]
    const selected = candidates.find((path) => existsSync(resolve(path, "node_api.h")))
    if (!selected) throw new Error("Native inspection requires Node-API headers")
    flags.push(`-I${selected}`)
    extra.push({
      nodeHeaderCandidates: candidates.map((path) => ({
        path,
        header: existsSync(resolve(path, "node_api.h")) ? record(root, resolve(path, "node_api.h")) : null
      }))
    })
  }
  if (declaration.pkgConfig) {
    if (declaration.pkgConfig !== "libsecret-1") throw new Error("Unsupported native pkg-config profile")
    const result = await runBuildProcess("pkg-config", ["--cflags", "--libs", declaration.pkgConfig], {
      cwd: root,
      env,
      stdio: "pipe",
      timeout: 30000
    })
    const selected = result.stdout.trim().split(/\s+/)
    flags.push(...selected.filter((flag) => !flag.startsWith("-l")))
    linkFlags.push(...selected.filter((flag) => flag.startsWith("-l")))
  }
  const context = {
    platform: process.platform,
    architecture: process.arch,
    source: declaration.source,
    flags,
    linkFlags,
    environment: nativeEnvironment(env),
    driver: nativeToolSelection(root, "cc", env),
    sourceBytes: record(root, resolve(root, declaration.source)),
    extra
  }
  if (previous && JSON.stringify(previous.context) === JSON.stringify(context)) {
    try {
      validateNativeEvidence(root, previous)
      return previous
    } catch {
      /* Rediscover changed inputs before Turbo hashes the stamp. */
    }
  }
  const headers = await nativeCompilerInputs(root, declaration.source, flags, env)
  const headerSearch = (await nativeHeaderSearch(root, declaration.source, flags, env)).map((path) => ({
    path,
    recursive: true,
    entries: nativeDirectoryInventory(path, true)
  }))
  if (process.platform === "darwin") {
    const frameworks = [
      "/System/Library/Frameworks/Security.framework",
      "/System/Library/Frameworks/CoreFoundation.framework"
    ]
      .filter(existsSync)
      .map((path) => ({ path, recursive: true, entries: nativeDirectoryInventory(path, true) }))
    return { context, headers, files: headers, search: [...headerSearch, ...frameworks], cacheable: false }
  }
  if (process.platform !== "linux" || process.arch !== "arm64")
    throw new Error("Unsupported compiled native cache evidence")
  if (
    flags.some(
      (flag) =>
        !["-O2", "-std=c11", "-Wall", "-Wextra", "-Werror", "-fPIC", "-pthread"].includes(flag) && !/^-I\//.test(flag)
    ) ||
    linkFlags.some((flag) => flag !== "-shared" && !/^-l[a-zA-Z0-9_+.-]+$/.test(flag))
  )
    throw new Error("Unsupported native compiler/linker profile")
  const tools = [],
    toolSelections = []
  for (const name of nativeToolNames) {
    const command = ["cc", "pkg-config", "ldd"].includes(name)
      ? name
      : (
          await runBuildProcess("cc", [`-print-prog-name=${name}`], { cwd: root, env, stdio: "pipe", timeout: 5000 })
        ).stdout.trim()
    const selection = nativeToolSelection(root, command, env)
    toolSelections.push({ name, ...selection })
    if (name !== "ldd")
      tools.push({ name, requested: selection.requested, ...fileEvidence(root, resolve(root, selection.path)) })
  }
  const toolchain = await nativeToolchainInputs(root, tools, env)
  const search = [
    ...new Set([
      ...Object.values(toolchain.search)
        .flat()
        .map((directory) => directory.path),
      "/etc/ld.so.conf.d"
    ])
  ].map((path) => ({ path, entries: nativeDirectoryInventory(path) }))
  const resolution = [
    "/etc/ld.so.cache",
    "/etc/ld.so.conf",
    ...(existsSync("/etc/ld.so.conf.d")
      ? nativeDirectoryInventory("/etc/ld.so.conf.d").map((entry) => resolve("/etc/ld.so.conf.d", entry.name))
      : [])
  ].map((path) => record(root, path))
  const toolLibraries = toolchain.libraries.map((input) => record(root, input.requested))
  return {
    context,
    headers,
    tools,
    toolSelections,
    toolLibraries,
    resolution,
    search: [...search, ...headerSearch],
    files: [...headers, ...tools.map(({ name: _name, ...input }) => input), ...toolLibraries, ...resolution],
    cacheable: true
  }
}
function bindingInputs(root, graph, node, plan, profile) {
  const producer = plan.asset.producer
  if (
    !safeRelative(producer.localBuild) ||
    !safeRelative(producer.publishedPrebuild.replace("{profile}", profile)) ||
    !Object.hasOwn(node.manifest.dependencies ?? {}, producer.package)
  )
    throw new Error("Incomplete parser binding ownership")
  const require = createRequire(resolve(node.path, "package.json"))
  const packagePath = require.resolve(`${producer.package}/package.json`)
  const metadata = JSON.parse(readFileSync(packagePath, "utf8"))
  const expected = resolveDeclaredDependencyVersion(
    graph.release,
    producer.package,
    node.manifest.dependencies[producer.package]
  )
  if (metadata.name !== producer.package || metadata.version !== expected)
    throw new Error("Parser package identity disagrees with manifest")
  const packageRoot = dirname(packagePath),
    host = `${process.platform}-${process.arch}`
  const candidates = [
    ...(profile === host ? [resolve(packageRoot, producer.localBuild)] : []),
    ...(producer.profiles[profile].sourceBuild === true
      ? []
      : [resolve(packageRoot, producer.publishedPrebuild.replace("{profile}", profile))])
  ]
  const observed = []
  let selected
  for (const path of candidates) {
    try {
      lstatSync(path)
    } catch (error) {
      if (error.code !== "ENOENT") throw error
      observed.push({ path, evidence: null })
      continue
    }
    const evidence = record(root, path)
    observed.push({ path, evidence })
    try {
      validateNativeBinary(path, profile)
    } catch (error) {
      if (error.message.startsWith("Native artifact has the wrong format or architecture:")) continue
      throw error
    }
    selected = evidence
    break
  }
  let recipe =
    producer.profiles[profile].sourceBuild === true
      ? nativeInputRecipe(root, nativeTaskPlans(root, graph, profile), profile)
      : undefined
  if (!selected && producer.profiles[profile].sourceBuild === true) {
    const supplied = foreignNativeInput(root, nativeTaskPlans(root, graph, profile), profile, plan.installedPath)
    selected = record(root, supplied.path)
    recipe = supplied.recipe
  }
  if (!selected) throw new Error(`Missing declared parser binding: ${producer.package}/${profile}`)
  return {
    mode: profile === host ? "selected-host-binding" : "retained-foreign-binding",
    package: record(root, packagePath),
    candidates: observed,
    ...(recipe ? { recipe } : {}),
    selected
  }
}
export async function observeNativeTaskInputs(root, graph, plan, env = process.env, previous) {
  const assets = []
  for (let index = 0; index < plan.assets.length; index++) {
    const item = plan.assets[index],
      { asset, installedPath, output } = item
    const mode =
      asset.producer.kind === "package-binding"
        ? "binding"
        : plan.profile === `${process.platform}-${process.arch}`
          ? "compiled"
          : "retained"
    const input =
      mode === "binding"
        ? bindingInputs(root, graph, plan.node, item, plan.profile)
        : mode === "retained"
          ? (() => {
              const input = foreignNativeInput(
                root,
                nativeTaskPlans(root, graph, plan.profile),
                plan.profile,
                installedPath
              )
              return { selected: record(root, input.path), recipe: input.recipe, mode: "source-bound-foreign-bundle" }
            })()
          : await cInputs(root, asset, plan.profile, env, previous?.assets[index]?.input)
    assets.push({ declaration: asset, installedPath, output: relative(root, output), mode, input })
  }
  return {
    format: 1,
    owner: plan.node.manifest.name,
    profile: plan.profile,
    manifest: fileEvidence(root, resolve(plan.node.path, "package.json")),
    tooling: tooling(root),
    environment: nativeEnvironment(env),
    host: `${process.platform}-${process.arch}`,
    assets
  }
}
export async function prepareNativeTaskInputs(
  root,
  graph,
  environment = process.env,
  selectedOwners,
  profiles = ["linux-arm64", "darwin-arm64"]
) {
  const stamps = []
  for (const profile of profiles)
    for (const plan of nativeTaskPlans(root, graph, profile, selectedOwners)) {
      const path = nativeTaskStampPath(root, plan.node, profile)
      let previous
      try {
        previous = JSON.parse(readFileSync(path, "utf8"))
      } catch {
        /* Cold task discovery. */
      }
      const inputs = await observeNativeTaskInputs(root, graph, plan, environment, previous)
      mkdirSync(dirname(path), { recursive: true })
      const temporary = `${path}.${process.pid}.tmp`
      writeFileSync(temporary, JSON.stringify(inputs))
      renameSync(temporary, path)
      stamps.push({
        owner: plan.node.manifest.name,
        profile,
        path,
        cacheable: inputs.assets.every((asset) => asset.input.cacheable !== false),
        inputs
      })
    }
  return stamps
}
export function readNativeTaskInputs(root, node, profile) {
  return JSON.parse(readFileSync(nativeTaskStampPath(root, node, profile), "utf8"))
}
export async function nativeTaskArtifacts(root, graph, target, options = {}) {
  const assets = [],
    receipts = []
  for (const plan of nativeTaskPlans(root, graph, target)) {
    const receipt = await checkNativeTaskReceipt(root, graph, plan, options)
    receipts.push({
      owner: plan.node.manifest.name,
      path: resolve(nativeTaskDirectory(plan.node, target), ".native-task-receipt.json"),
      receipt
    })
    for (const asset of plan.assets)
      assets.push({
        owner: plan.node.manifest.name,
        physicalPath: asset.output,
        installedPath: asset.installedPath,
        receipt
      })
  }
  const parser = nativeTaskPlans(root, graph, target).find((plan) =>
    plan.assets.some(({ asset }) => asset.producer.kind === "package-binding")
  )
  return { parserRoot: parser ? nativeTaskDirectory(parser.node, target) : undefined, assets, receipts }
}
