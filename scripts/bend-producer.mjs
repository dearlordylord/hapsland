import { verifyAuthoredInputStamp } from "./authored-task-inputs.mjs"
import { readPackageGraph } from "./package-graph.mjs"
import { readBendToolchain } from "./bend-toolchain.mjs"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  renameSync,
  realpathSync,
  readdirSync
} from "node:fs"
import { dirname, resolve, join, delimiter } from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import { homedir } from "node:os"
import { parse } from "@babel/parser"
import traverseModule from "@babel/traverse"
import { fileEvidence, fileInventory } from "./compiler-evidence.mjs"
import { nativeToolSelection, nativeDirectoryInventory, nativeToolLibraries } from "./native-toolchain-inputs.mjs"
import { runBuildProcess } from "./build-process.mjs"
import { withBuildLock } from "./build-lock.mjs"
import { loaderPolicy } from "./source-loader-policy.mjs"
const traverse = traverseModule.default ?? traverseModule
export const bendProducerOutputs = Object.freeze([
  "canonical.generated.d.ts",
  "canonical.generated.js",
  "credential-policy.generated.d.ts",
  "credential-policy.generated.js",
  "import-graph.generated.d.ts",
  "import-graph.generated.js",
  "login-policy.generated.d.ts",
  "login-policy.generated.js",
  "maintenance-policy.generated.d.ts",
  "maintenance-policy.generated.js",
  "request-content.generated.d.ts",
  "request-content.generated.js",
  "rules-policy.generated.d.ts",
  "rules-policy.generated.js",
  "setup-policy.generated.d.ts",
  "setup-policy.generated.js",
  "setup-selection-policy.generated.d.ts",
  "setup-selection-policy.generated.js",
  "update-policy.generated.d.ts",
  "update-policy.generated.js",
  "verification-policy.generated.d.ts",
  "verification-policy.generated.js"
])
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
const packagePath = (root, node) => node?.path ?? resolve(root, "packages/agent-flow-bend")
const evidence = (root, path) => ({ requested: path, ...fileEvidence(root, realpathSync(path)) })
export const bendProducerEnvironmentKeys = Object.freeze([
  "PATH",
  "HOME",
  "BEND_LIB",
  "BENDTT",
  "BEND_HUB",
  "BEND_ORIGIN",
  "BEND_NO_TELEMETRY",
  "NODE_OPTIONS",
  "BUN_OPTIONS",
  "NODE_PATH",
  "LD_LIBRARY_PATH",
  "LD_PRELOAD",
  "LD_AUDIT",
  "DYLD_LIBRARY_PATH",
  "DYLD_FRAMEWORK_PATH",
  "DYLD_FALLBACK_LIBRARY_PATH",
  "DYLD_FALLBACK_FRAMEWORK_PATH",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_ROOT_PATH",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "SOURCE_DATE_EPOCH",
  "BABEL_8_BREAKING",
  "BABEL_TYPES_8_BREAKING"
])
const inputEnvironment = (env) => Object.fromEntries(bendProducerEnvironmentKeys.map((key) => [key, env[key] ?? null]))
export function bendProducerEnvironment(root, inherited = process.env) {
  const env = { ...inherited }
  if (inherited.HAPSLAND_BEND_PRODUCER_ENV !== undefined) {
    const declared = JSON.parse(inherited.HAPSLAND_BEND_PRODUCER_ENV)
    if (
      !declared ||
      Array.isArray(declared) ||
      typeof declared !== "object" ||
      Object.keys(declared).sort().join("\0") !== [...bendProducerEnvironmentKeys].sort().join("\0")
    )
      throw new Error("Invalid canonical Bend producer environment keys")
    for (const key of bendProducerEnvironmentKeys) {
      if (declared[key] !== null && typeof declared[key] !== "string")
        throw new Error("Invalid canonical Bend producer environment value")
      if (declared[key] === null) delete env[key]
      else env[key] = declared[key]
    }
  }
  if (typeof env.PATH !== "string") throw new Error("Missing Bend producer PATH")
  env.PATH = env.PATH.split(delimiter)
    .map((directory) => resolve(root, directory))
    .join(delimiter)
  env.BEND_NO_TELEMETRY = "1"
  if (
    env.NODE_OPTIONS &&
    !env.NODE_OPTIONS.trim()
      .split(/\s+/)
      .every((option) => option === "--no-warnings" || /^--max-old-space-size=\d+$/.test(option))
  )
    throw new Error("Unsupported Bend producer NODE_OPTIONS")
  if (existsSync("/etc/ld.so.preload") && readFileSync("/etc/ld.so.preload", "utf8").trim())
    throw new Error("Unsupported Bend compiler global loader injection")
  return env
}
/** Inventory actual analyzer package code and its declared runtime dependencies. */
export function bendAnalyzerDependencyInputs(
  root,
  initialEntries = [import.meta.resolve("@babel/parser"), import.meta.resolve("@babel/traverse")].map((value) =>
    fileURLToPath(value)
  )
) {
  const packages = new Map()
  const visit = (entry) => {
    const selected = realpathSync(entry)
    let directory = dirname(selected)
    while (!existsSync(resolve(directory, "package.json"))) {
      const parent = dirname(directory)
      if (parent === directory) throw new Error(`Missing Bend analyzer package owner: ${selected}`)
      directory = parent
    }
    const manifestPath = resolve(directory, "package.json")
    if (packages.has(manifestPath)) return
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
    const inventory = (directory) =>
      readdirSync(directory, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))
        .flatMap((entry) => {
          if (entry.name === "node_modules") return []
          const path = resolve(directory, entry.name)
          if (entry.isSymbolicLink()) throw new Error(`Unsupported analyzer package symlink: ${path}`)
          if (entry.isDirectory()) return inventory(path)
          return /\.(?:[cm]?js|json)$/.test(entry.name) ? [fileEvidence(root, path)] : []
        })
    const files = inventory(directory)
    packages.set(manifestPath, { name: manifest.name, manifest: evidence(root, manifestPath), files })
    const require = createRequire(manifestPath)
    for (const name of Object.keys(manifest.dependencies ?? {}).sort()) {
      let dependency
      try {
        dependency = require.resolve(`${name}/package.json`)
      } catch (error) {
        if (error.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error
        dependency = require.resolve(name)
      }
      visit(dependency)
    }
  }
  for (const entry of initialEntries) visit(entry)
  return [...packages.values()].sort((a, b) => a.manifest.path.localeCompare(b.manifest.path))
}
/** Base and relative imports are the supported offline producer grammar. */
export function bendImportInputs(root, entries, base) {
  const visited = new Set()
  const visit = (path) => {
    const actual = realpathSync(path)
    if (visited.has(actual)) return
    visited.add(actual)
    if (!actual.endsWith(".bend")) return
    const text = readFileSync(actual, "utf8")
    for (const line of text.split(/\r?\n/)) {
      if (!/^\s*import\b/.test(line)) continue
      const foreign = line.match(/^\s*import\s+"(\.\.?\/[^"\s]+\.(?:c|js))"\s*(?:#.*)?$/)
      if (foreign) {
        visit(resolve(dirname(actual), foreign[1]))
        continue
      }
      const match = line.match(
        /^\s*import\s+(Base|\.\.?\/[^\s#]+\.bend)(?:\s+as\s+[A-Za-z_][A-Za-z0-9_]*)?\s*(?:#.*)?$/
      )
      if (!match) throw new Error(`Unsupported Bend producer import: ${actual}: ${line}`)
      visit(match[1] === "Base" ? base : resolve(dirname(actual), match[1]))
    }
  }
  for (const entry of entries) visit(entry)
  return [...visited].sort().map((path) => evidence(root, path))
}
/** Independently inventory generated loader sites; no package-wide loader exemption. */
export function bendGeneratedLoaderEvidence(text, file) {
  const ast = parse(text, { sourceType: "module", createImportExpressions: true })
  const policy = loaderPolicy("bend-system-ffi")
  const modules = [],
    libraries = [],
    symbols = []
  const reject = (kind) => {
    throw new Error(`Unsupported generated Bend loader: ${file}: ${kind}`)
  }
  const isRequire = (node, moduleName) =>
    node?.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    node.callee.name === "require" &&
    node.arguments.length === 1 &&
    node.arguments[0].type === "StringLiteral" &&
    node.arguments[0].value === moduleName
  traverse(ast, {
    enter(path) {
      const node = path.node
      if (
        node.type === "ImportExpression" ||
        node.type === "ImportDeclaration" ||
        (node.type.startsWith("Export") && node.source)
      )
        reject("ES module load")
      if (path.isReferencedIdentifier() && ["eval", "Function", "createRequire", "module"].includes(node.name))
        reject(node.name)
      if (
        path.isReferencedIdentifier() &&
        node.name === "require" &&
        !(path.parentPath.isCallExpression() && path.parent.callee === node && !path.scope.getBinding("require"))
      )
        reject("aliased require")
      if (node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "require") {
        if (
          node.arguments.length !== 1 ||
          node.arguments[0].type !== "StringLiteral" ||
          !["fs", "bun:ffi"].includes(node.arguments[0].value)
        )
          reject("module target")
        modules.push(node.arguments[0].value)
      }
      if (node.type !== "MemberExpression") return
      const key = node.computed ? node.property.value : node.property.name
      if (["require", "eval", "Function", "constructor", "createRequire", "_load"].includes(key))
        reject(`reflective ${key}`)
      if (key === "dlopen") {
        if (node.object.type !== "Identifier" || !path.parentPath.isCallExpression() || path.parent.callee !== node)
          reject("aliased dlopen")
        const binding = path.scope.getBinding(node.object.name)
        if (!binding?.constant || !isRequire(binding.path.node.init, "bun:ffi")) reject("FFI provenance")
        const targets = policy.nativeLibraries(path.parent.arguments[0])
        if (!targets?.length) reject("native target")
        libraries.push(...targets)
      }
      if (node.computed && node.object.type === "MemberExpression" && node.object.property.name === "symbols") {
        if (!policy.nativeSymbol(node.property)) reject("native symbol")
        symbols.push("__error", "__errno_location")
      }
    }
  })
  return {
    policy: "bend-system-ffi",
    modules: [...new Set(modules)].sort(),
    libraries: [...new Set(libraries)].sort(),
    symbols: [...new Set(symbols)].sort()
  }
}
function contextInputs(root, node, toolchain) {
  const directory = packagePath(root, node)
  const generators = [
    "build-canonical.mjs",
    "build-import-graph.mjs",
    "build-request-content.mjs",
    "build-credential-policy.mjs",
    "build-login-policy.mjs",
    "build-verification-policy.mjs",
    "build-update-policy.mjs",
    "build-setup-policy.mjs",
    "build-maintenance-policy.mjs",
    "build-rules-policy.mjs",
    "build-setup-selection-policy.mjs"
  ].map((name) => resolve(directory, "scripts", name))
  const declarations = [
    "canonical.generated.d.ts",
    "import-graph.generated.d.ts",
    "request-content.generated.d.ts",
    "credential-policy.generated.d.ts",
    "login-policy.generated.d.ts",
    "verification-policy.generated.d.ts",
    "update-policy.generated.d.ts",
    "setup-policy.generated.d.ts",
    "maintenance-policy.generated.d.ts",
    "rules-policy.generated.d.ts",
    "setup-selection-policy.generated.d.ts"
  ].map((name) => resolve(directory, "abi", name))
  const sources = bendImportInputs(
    root,
    [
      resolve(directory, "CanonicalRuntime.bend"),
      resolve(directory, "ImportGraphRuntime.bend"),
      resolve(directory, "request-content/Runtime.bend"),
      resolve(directory, "credential-policy/PROOF.bend"),
      resolve(directory, "login-policy/PROOF.bend"),
      resolve(directory, "verification-policy/PROOF.bend"),
      resolve(directory, "update-policy/PROOF.bend"),
      resolve(directory, "setup-policy/PROOF.bend"),
      resolve(directory, "maintenance-policy/PROOF.bend"),
      resolve(directory, "rules-policy/PROOF.bend"),
      resolve(directory, "setup-selection-policy/PROOF.bend")
    ],
    toolchain.base.requested
  )
  return {
    toolchain,
    inputs: [
      ...sources,
      ...generators.map((path) => evidence(root, path)),
      evidence(root, resolve(root, "scripts/pure-bend-artifact.mjs")),
      ...declarations.map((path) => evidence(root, path)),
      evidence(root, resolve(directory, "package.json"))
    ].sort((a, b) => a.path.localeCompare(b.path))
  }
}
function toolchainCore(root, env) {
  if (!["linux", "darwin"].includes(process.platform))
    throw new Error(
      "Unsupported Bend producer host profile: compiler dynamic-library evidence requires Linux or Darwin"
    )
  for (const key of Object.keys(env).filter((key) => key.startsWith("DYLD_")))
    if (env[key]) throw new Error(`Unsupported Bend producer injection: ${key}`)
  for (const key of ["LD_PRELOAD", "LD_AUDIT", "LD_LIBRARY_PATH", "BUN_OPTIONS", "NODE_PATH"])
    if (env[key]) throw new Error(`Unsupported Bend producer injection: ${key}`)
  const bend = nativeToolSelection(root, "bend", env)
  const compiler = resolve(root, bend.path)
  const supportPath = resolve(dirname(compiler), "../bend2")
  if (!existsSync(resolve(supportPath, "base.bend"))) throw new Error("Missing Bend compiler Base/support installation")
  return {
    version: `bend ${readBendToolchain(root).bend.version}`,
    cohort: readBendToolchain(root),
    analyzers: bendAnalyzerDependencyInputs(root),
    platform: process.platform,
    architecture: process.arch,
    environment: inputEnvironment(env),
    bend,
    node: nativeToolSelection(root, "node", env),
    base: evidence(root, resolve(supportPath, "base.bend")),
    support: { path: supportPath, inventory: nativeDirectoryInventory(supportPath, true) },
    verifier: {
      path: env.BENDTT ?? join(homedir(), ".bend/bendtt"),
      inventory: nativeDirectoryInventory(env.BENDTT ?? join(homedir(), ".bend/bendtt"), true)
    },
    loaderConfiguration: ["/etc/ld.so.cache", "/etc/ld.so.conf", "/etc/ld.so.preload"].map((path) => ({
      path,
      evidence: existsSync(path) ? evidence(root, path) : null
    })),
    loaderIncludes: nativeDirectoryInventory("/etc/ld.so.conf.d", true),
    tooling: [
      "scripts/bend-producer.mjs",
      "scripts/authored-task-inputs.mjs",
      "scripts/package-graph.mjs",
      "packages/agent-flow-bend/package.json",
      "scripts/bend-toolchain.mjs",
      "scripts/source-loader-policy.mjs",
      "scripts/compiler-evidence.mjs",
      "scripts/native-toolchain-inputs.mjs",
      "scripts/build-process.mjs",
      "scripts/build-lock.mjs",
      "scripts/build-groups.mjs",
      "scripts/owned-lock.mjs"
    ].map((path) => evidence(root, resolve(root, path)))
  }
}
// The loader supplies resolved paths, including transitive dependencies. Unlike
// install names from otool, this accounts for actual @rpath/relative selection.
export function bendDarwinLoadedLibraries(text, executable) {
  const paths = text
    .trim()
    .split(/\r?\n/)
    .filter((line) => line && !/^dyld\[\d+\]: move loaded to delayed: [^\n]+$/.test(line))
    .map((line) => {
      const match = line.match(/^dyld\[\d+\]: <[A-Fa-f0-9-]{36}> (\/[^\n]+)$/)
      if (!match) throw new Error("Unsupported Darwin loaded-library evidence")
      return match[1]
    })
  if (!paths.length) throw new Error("Missing Darwin loaded-library evidence")
  if (!paths.includes(executable)) throw new Error("Missing Darwin executable loader evidence")
  const libraries = [...new Set(paths.filter((path) => path !== executable))].sort()
  if (!libraries.length) throw new Error("Missing Darwin loaded-library evidence")
  return libraries
}
const observeDarwinLibraries = (root, tools, env) => {
  const paths = new Set()
  for (const [tool, args] of tools) {
    const executable = realpathSync(tool)
    // These existing toolchain probes are bounded and do not evaluate user code.
    const result = spawnSync(executable, args, {
      cwd: root,
      env: { ...env, DYLD_PRINT_LIBRARIES: "1" },
      timeout: 5000,
      encoding: "utf8",
      stdio: ["ignore", "ignore", "pipe"]
    })
    if (result.error || result.status !== 0)
      throw new Error("Darwin toolchain loader observation failed", { cause: result.error })
    for (const path of bendDarwinLoadedLibraries(result.stderr, executable)) paths.add(path)
  }
  return [...paths].sort()
}
export async function bendProducerToolchain(root) {
  const env = bendProducerEnvironment(root)
  const core = toolchainCore(root, env)
  const executable = resolve(root, core.bend.path)
  const version = await runBuildProcess(executable, ["version"], { cwd: root, env, timeout: 5000, stdio: "pipe" })
  if (version.stdout.trim() !== core.version)
    throw new Error(`Bend producer requires exact ${core.version}; observed ${version.stdout.trim()}`)
  const libraryObserver = nativeToolSelection(root, process.platform === "linux" ? "ldd" : "/usr/lib/dyld", env)
  const libraryPaths = new Set()
  if (process.platform === "darwin") {
    for (const path of observeDarwinLibraries(
      root,
      [
        [executable, ["version"]],
        [resolve(root, core.node.path), ["--version"]]
      ],
      env
    ))
      libraryPaths.add(path)
  } else {
    for (const tool of [executable, resolve(root, core.node.path)]) {
      const libraries = await runBuildProcess(resolve(root, libraryObserver.path), [tool], {
        cwd: root,
        env,
        timeout: 5000,
        stdio: "pipe"
      })
      for (const path of nativeToolLibraries(libraries.stdout)) libraryPaths.add(path)
    }
  }
  const sharedCachePaths = ["/System/Library/dyld", "/System/Volumes/Preboot/Cryptexes/OS/System/Library/dyld"]
  const sharedCaches =
    process.platform === "darwin"
      ? sharedCachePaths.filter(existsSync).map((path) => ({ path, inventory: nativeDirectoryInventory(path, true) }))
      : []
  const toolLibraries = [...libraryPaths].sort().map((path) => {
    if (existsSync(path)) return evidence(root, path)
    if (
      process.platform !== "darwin" ||
      !sharedCaches.length ||
      (!path.startsWith("/usr/lib/") && !path.startsWith("/System/Library/"))
    )
      throw new Error(`Unaccounted Bend compiler shared library: ${path}`)
    return { requested: path, sharedCache: true }
  })
  const after = toolchainCore(root, env)
  if (JSON.stringify(core) !== JSON.stringify(after))
    throw new Error("Bend compiler inputs changed during toolchain observation")
  return { ...core, libraryObserver, toolLibraries, sharedCaches }
}
export async function bendProducerContext(root, node) {
  return contextInputs(root, node, await bendProducerToolchain(root))
}
const currentToolchain = (root, recorded) => {
  const core = toolchainCore(root, bendProducerEnvironment(root))
  const { libraryObserver, toolLibraries, sharedCaches, ...before } = recorded
  if (JSON.stringify(core) !== JSON.stringify(before)) throw new Error("Changed Bend producer toolchain context")
  const actualObserver = nativeToolSelection(
    root,
    process.platform === "linux" ? "ldd" : "/usr/lib/dyld",
    bendProducerEnvironment(root)
  )
  if (JSON.stringify(actualObserver) !== JSON.stringify(libraryObserver))
    throw new Error("Changed Bend producer library observer")
  if (!Array.isArray(toolLibraries) || !toolLibraries.length) throw new Error("Missing Bend compiler library evidence")
  for (const cache of sharedCaches ?? [])
    if (JSON.stringify(nativeDirectoryInventory(cache.path, true)) !== JSON.stringify(cache.inventory))
      throw new Error("Changed Bend compiler system shared cache")
  if (process.platform === "darwin") {
    const actual = observeDarwinLibraries(
      root,
      [
        [resolve(root, core.bend.path), ["version"]],
        [resolve(root, core.node.path), ["--version"]]
      ],
      bendProducerEnvironment(root)
    )
    if (JSON.stringify(actual) !== JSON.stringify(toolLibraries.map((input) => input.requested).sort()))
      throw new Error("Changed Bend compiler loaded-library selection")
  }
  for (const input of toolLibraries)
    if (
      input.sharedCache
        ? process.platform !== "darwin" || existsSync(input.requested) || !sharedCaches?.length
        : JSON.stringify(evidence(root, input.requested)) !== JSON.stringify(input)
    )
      throw new Error("Changed Bend compiler shared library")
  return recorded
}
export function checkBendProducerReceipt(root, node, currentContext) {
  const directory = packagePath(root, node)
  const receipt = JSON.parse(readFileSync(resolve(directory, "dist/.bend-receipt.json"), "utf8"))
  const { digest: recordedDigest, ...body } = receipt
  if (receipt.format !== 1 || recordedDigest !== digest(body))
    throw new Error("Missing or corrupt Bend producer receipt")
  const expected = contextInputs(root, node, currentToolchain(root, receipt.context.toolchain))
  if (currentContext && JSON.stringify(currentContext) !== JSON.stringify(expected))
    throw new Error("Bend producer caller context is stale")
  if (JSON.stringify(expected) !== JSON.stringify(receipt.context))
    throw new Error("Stale Bend producer receipt context")
  const inventory = fileInventory(root, resolve(directory, "dist")).filter(
    (input) => input.path !== receiptPath(root, directory)
  )
  if (
    JSON.stringify(inventory) !== JSON.stringify(receipt.outputs) ||
    inventory
      .map((input) => input.path.slice(input.path.lastIndexOf("/") + 1))
      .sort()
      .join("\0") !== bendProducerOutputs.join("\0")
  )
    throw new Error("Incomplete or changed Bend producer output inventory")
  for (const name of [
    "canonical.generated.d.ts",
    "import-graph.generated.d.ts",
    "request-content.generated.d.ts",
    "credential-policy.generated.d.ts",
    "login-policy.generated.d.ts",
    "verification-policy.generated.d.ts",
    "update-policy.generated.d.ts",
    "setup-policy.generated.d.ts",
    "maintenance-policy.generated.d.ts",
    "rules-policy.generated.d.ts",
    "setup-selection-policy.generated.d.ts"
  ])
    if (!readFileSync(resolve(directory, "dist", name)).equals(readFileSync(resolve(directory, "abi", name))))
      throw new Error("Generated Bend declarations differ from authored ABI")
  const loaderEvidence = inventory
    .filter((input) => input.path.endsWith(".js"))
    .map((input) => ({
      path: input.path,
      ...bendGeneratedLoaderEvidence(readFileSync(resolve(root, input.path), "utf8"), input.path)
    }))
  if (JSON.stringify(loaderEvidence) !== JSON.stringify(receipt.loaders))
    throw new Error("Changed Bend generated loader evidence")
  return receipt
}
const receiptPath = (root, directory) => resolve(directory, "dist/.bend-receipt.json").slice(resolve(root).length + 1)
export async function buildBendProducer(root, node) {
  node ??= readPackageGraph(root).packages.get("@hapsland/agent-flow-bend")
  if (!node) throw new Error("Missing Bend producer owner")
  return withBuildLock(root, async () => {
    const directory = packagePath(root, node),
      output = resolve(directory, "dist")
    mkdirSync(directory, { recursive: true })
    mkdirSync(resolve(directory, "artifacts"), { recursive: true })
    const stage = mkdtempSync(resolve(directory, "artifacts/.bend-stage-"))
    // Invalidate prior publication before attempting generation.
    rmSync(output, { recursive: true, force: true })
    try {
      const before = await bendProducerContext(root, node)
      const authored = verifyAuthoredInputStamp(root, node, undefined, { bendToolchain: before.toolchain })
      for (const generator of [
        "build-canonical.mjs",
        "build-import-graph.mjs",
        "build-request-content.mjs",
        "build-credential-policy.mjs",
        "build-login-policy.mjs",
        "build-verification-policy.mjs",
        "build-update-policy.mjs",
        "build-setup-policy.mjs",
        "build-maintenance-policy.mjs",
        "build-rules-policy.mjs",
        "build-setup-selection-policy.mjs"
      ])
        await runBuildProcess(
          resolve(root, before.toolchain.node.path),
          [resolve(directory, "scripts", generator), stage],
          { cwd: directory, env: bendProducerEnvironment(root), timeout: 130000 }
        )
      const staged = fileInventory(root, stage)
      if (
        staged
          .map((input) => input.path.slice(input.path.lastIndexOf("/") + 1))
          .sort()
          .join("\0") !== bendProducerOutputs.join("\0")
      )
        throw new Error("Bend generator output inventory differs from the declared ABI")
      for (const name of [
        "canonical.generated.d.ts",
        "import-graph.generated.d.ts",
        "request-content.generated.d.ts",
        "credential-policy.generated.d.ts",
        "login-policy.generated.d.ts",
        "verification-policy.generated.d.ts",
        "update-policy.generated.d.ts",
        "setup-policy.generated.d.ts",
        "maintenance-policy.generated.d.ts",
        "rules-policy.generated.d.ts",
        "setup-selection-policy.generated.d.ts"
      ])
        if (!readFileSync(resolve(stage, name)).equals(readFileSync(resolve(directory, "abi", name))))
          throw new Error("Generated Bend declarations differ from authored ABI")
      for (const input of staged.filter((input) => input.path.endsWith(".js")))
        bendGeneratedLoaderEvidence(readFileSync(resolve(root, input.path), "utf8"), input.path)
      const after = await bendProducerContext(root, node)
      if (JSON.stringify(before) !== JSON.stringify(after))
        throw new Error("Bend producer inputs changed during generation")
      verifyAuthoredInputStamp(root, node, authored, { bendToolchain: after.toolchain })
      renameSync(stage, output)
      const outputs = fileInventory(root, output)
      const loaders = outputs
        .filter((input) => input.path.endsWith(".js"))
        .map((input) => ({
          path: input.path,
          ...bendGeneratedLoaderEvidence(readFileSync(resolve(root, input.path), "utf8"), input.path)
        }))
      const body = { format: 1, context: after, outputs, loaders }
      writeFileSync(
        resolve(output, ".bend-receipt.json"),
        JSON.stringify({ ...body, digest: digest(body) }, null, 2) + "\n"
      )
      checkBendProducerReceipt(root, node, after)
      verifyAuthoredInputStamp(root, node, authored, { bendToolchain: after.toolchain })
    } catch (error) {
      rmSync(output, { recursive: true, force: true })
      if (!error.groupUnresolved) rmSync(stage, { recursive: true, force: true })
      throw error
    }
  })
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await buildBendProducer(resolve(import.meta.dirname, ".."))
