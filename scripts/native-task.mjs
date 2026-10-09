import {
  readFileSync,
  mkdirSync,
  copyFileSync,
  chmodSync,
  writeFileSync,
  rmSync,
  mkdtempSync,
  renameSync,
  realpathSync
} from "node:fs"
import { resolve, dirname, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { readPackageGraph } from "./package-graph.mjs"
import { fileEvidence, fileInventory } from "./compiler-evidence.mjs"
import { withBuildLock } from "./build-lock.mjs"
import { runBuildProcess } from "./build-process.mjs"
import { nativeDependencyPaths } from "./native-compiler-inputs.mjs"
import { nativeLinkerEvidence } from "./native-linker-inputs.mjs"
import {
  nativeTaskPlans,
  nativeTaskDirectory,
  readNativeTaskInputs,
  observeNativeTaskInputs,
  nativeDigest
} from "./native-task-inputs.mjs"
import {
  checkNativeReceipt,
  nativeReceiptDigest,
  checkNativeTaskReceipt,
  validateNativeBinary
} from "./native-task-receipt.mjs"

const knownFiles = (root, input) => {
  const paths = new Set(input.files.map((entry) => resolve(root, entry.path)))
  const walk = (directory, entries) => {
    for (const entry of entries ?? []) {
      const path = resolve(directory, entry.name)
      if (entry.type === "file") paths.add(realpathSync(path))
      if (entry.type === "symlink" && entry.selected && entry.sha256) paths.add(entry.selected)
      if (entry.entries) walk(entry.selected ?? path, entry.entries)
    }
  }
  for (const search of input.search) walk(search.path, search.entries)
  return paths
}
async function compileC(root, asset, stagedOutput, env) {
  const input = asset.input,
    context = input.context,
    source = context.source
  const object = resolve(dirname(stagedOutput), "current.o"),
    deps = resolve(dirname(stagedOutput), "deps"),
    preview = resolve(dirname(stagedOutput), "preview")
  await runBuildProcess("cc", [...context.flags, "-MD", "-MF", deps, "-MT", "hapsland", "-c", source, "-o", object], {
    cwd: root,
    env,
    stdio: "pipe",
    timeout: 30000
  })
  const headers = nativeDependencyPaths(readFileSync(deps, "utf8")).map((requested) => {
    const match = input.headers.find((entry) => entry.requested === requested)
    if (!match) throw new Error("Unaccounted native compiler header")
    return { requested, ...fileEvidence(root, resolve(root, match.path)) }
  })
  if (JSON.stringify(headers) !== JSON.stringify(input.headers))
    throw new Error("Native compiler header inputs changed")
  if (process.platform === "darwin") {
    await runBuildProcess("cc", [...context.flags, object, ...context.linkFlags, "-o", stagedOutput], {
      cwd: root,
      env,
      stdio: "pipe",
      timeout: 30000
    })
    chmodSync(stagedOutput, 0o755)
    return {
      context,
      cacheable: false,
      output: fileEvidence(root, stagedOutput),
      limitation: "Clang/framework compilation is uncached; no reusable linker-closure evidence is claimed"
    }
  }
  const first = await runBuildProcess("cc", [...context.flags, object, ...context.linkFlags, "-Wl,-t", "-o", preview], {
    cwd: root,
    env,
    stdio: "pipe",
    timeout: 30000
  })
  const linker = nativeLinkerEvidence(root, first.stdout, object)
  const known = knownFiles(root, input)
  if (linker.some((entry) => !known.has(resolve(root, entry.path))))
    throw new Error("Native linker contribution is outside declared search/tool inputs")
  const final = await runBuildProcess(
    "cc",
    [...context.flags, object, ...context.linkFlags, "-Wl,-t", "-o", stagedOutput],
    { cwd: root, env, stdio: "pipe", timeout: 30000 }
  )
  if (JSON.stringify(nativeLinkerEvidence(root, final.stdout, object)) !== JSON.stringify(linker))
    throw new Error("Native linker contributions changed")
  chmodSync(stagedOutput, 0o755)
  const receipt = {
    context,
    headers,
    linker,
    tools: input.tools,
    toolSelections: input.toolSelections,
    toolLibraries: input.toolLibraries,
    resolution: input.resolution,
    search: input.search,
    output: fileEvidence(root, stagedOutput)
  }
  receipt.digest = nativeReceiptDigest(receipt)
  checkNativeReceipt(root, receipt, context, resolve(root, source), stagedOutput)
  return receipt
}
export async function probeNativeParserBindings(root, node, files, env = process.env) {
  const bindings = Object.fromEntries(
    Object.entries(files).map(([name, file]) => [name, dirname(dirname(dirname(file)))])
  )
  return runBuildProcess(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import{createRequire}from'node:module';const require=createRequire(${JSON.stringify(resolve(node.path, "package.json"))});const b=${JSON.stringify(bindings)};process.env.TREE_SITTER_PREBUILD=b['tree-sitter'];process.env.TREE_SITTER_TYPESCRIPT_PREBUILD=b['tree-sitter-typescript'];process.env.TREE_SITTER_RUST_PREBUILD=b['tree-sitter-rust'];process.env.TREE_SITTER_PYTHON_PREBUILD=b['tree-sitter-python'];const Parser=require('tree-sitter');const parser=new Parser();parser.setLanguage(require('tree-sitter-typescript').typescript);if(parser.parse('type Probe = string').rootNode.hasError)process.exit(1);parser.setLanguage(require('tree-sitter-rust'));if(parser.parse('struct Probe { value: Option<String> }').rootNode.hasError)process.exit(1);parser.setLanguage(require('tree-sitter-python'));if(parser.parse('class Probe:\\n  value: str').rootNode.hasError)process.exit(1);`
    ],
    { cwd: root, env, stdio: "inherit", timeout: 30000 }
  )
}
export async function buildNativeTask(root, owner, profile, environment = process.env) {
  const graph = readPackageGraph(root)
  const plan = nativeTaskPlans(root, graph, profile, [owner])[0]
  if (!plan) throw new Error(`Undeclared native task: ${owner}/${profile}`)
  return withBuildLock(root, async (leaseEnvironment) => {
    const inputs = readNativeTaskInputs(root, plan.node, profile)
    const env = { ...environment, ...leaseEnvironment }
    for (const [key, value] of Object.entries(inputs.environment)) {
      if (value === null) delete env[key]
      else env[key] = value
    }
    if (JSON.stringify(await observeNativeTaskInputs(root, graph, plan, env, inputs)) !== JSON.stringify(inputs))
      throw new Error("Native task stamp is stale before production")
    const directory = nativeTaskDirectory(plan.node, profile)
    mkdirSync(dirname(directory), { recursive: true })
    const staging = mkdtempSync(resolve(dirname(directory), ".native-task-"))
    let preserve = false
    try {
      const compilations = []
      for (const asset of inputs.assets) {
        const tail = relative(directory, resolve(root, asset.output)),
          output = resolve(staging, tail)
        mkdirSync(dirname(output), { recursive: true })
        if (asset.mode === "compiled") {
          const work = mkdtempSync(resolve(staging, ".compile-"))
          try {
            const compilation = await compileC(root, asset, resolve(work, "output"), env)
            renameSync(resolve(work, "output"), output)
            compilation.output = { ...fileEvidence(root, output), path: asset.output }
            if (compilation.digest) compilation.digest = nativeReceiptDigest(compilation)
            compilations.push(compilation)
          } catch (error) {
            if (error.groupUnresolved) preserve = true
            throw error
          } finally {
            if (!preserve) rmSync(work, { recursive: true, force: true })
          }
        } else {
          copyFileSync(resolve(root, asset.input.selected.path), output)
          chmodSync(output, 0o755)
        }
        validateNativeBinary(output, profile)
      }
      if (
        inputs.assets.some((asset) => asset.mode === "binding") &&
        profile === `${process.platform}-${process.arch}`
      ) {
        const bindings = Object.fromEntries(
          inputs.assets
            .filter((asset) => asset.mode === "binding")
            .map((asset) => [
              asset.declaration.producer.package,
              resolve(staging, relative(directory, resolve(root, asset.output)))
            ])
        )
        await probeNativeParserBindings(root, plan.node, bindings, env)
      }
      if (JSON.stringify(await observeNativeTaskInputs(root, graph, plan, env, inputs)) !== JSON.stringify(inputs))
        throw new Error("Native task inputs changed during production")
      const outputs = fileInventory(root, staging).map((entry) => ({
        ...entry,
        path: relative(root, resolve(directory, relative(staging, resolve(root, entry.path))))
      }))
      const body = { format: 1, owner, profile, inputs, outputs, compilations }
      writeFileSync(
        resolve(staging, ".native-task-receipt.json"),
        JSON.stringify({ ...body, digest: nativeDigest(body) })
      )
      rmSync(directory, { recursive: true, force: true })
      renameSync(staging, directory)
      return await checkNativeTaskReceipt(root, graph, plan, { environment: env })
    } catch (error) {
      preserve = error.groupUnresolved === true
      throw error
    } finally {
      if (!preserve) rmSync(staging, { recursive: true, force: true })
    }
  })
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(import.meta.dirname, "..")
  const graph = readPackageGraph(root)
  const owner = [...graph.packages.values()].find((node) => node.path === process.cwd())
  if (!owner || process.argv.length !== 3) throw new Error("Native task requires declared owner cwd and one profile")
  await buildNativeTask(root, owner.manifest.name, process.argv[2])
}
