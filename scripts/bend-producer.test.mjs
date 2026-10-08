import { authoredTaskInputPath, prepareAuthoredTaskInputs } from "./authored-task-inputs.mjs"
import { buildBendProducers } from "./build-bend-producers.mjs"
import test from "node:test"
import assert from "node:assert/strict"
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  copyFileSync,
  chmodSync,
  existsSync,
  realpathSync
} from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { createHash } from "node:crypto"
import { fileInventory } from "./compiler-evidence.mjs"
import {
  bendProducerToolchain,
  buildBendProducer,
  bendImportInputs,
  bendGeneratedLoaderEvidence,
  bendDarwinLoadedLibraries,
  bendProducerContext,
  checkBendProducerReceipt
} from "./bend-producer.mjs"
const repository = resolve(import.meta.dirname, "..")
function temporary(t) {
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), "hapsland-bend-producer-")))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}
async function fixture(t) {
  const root = temporary(t),
    directory = resolve(root, "packages/agent-flow-bend")
  for (const sub of ["scripts", "abi", "dist"]) mkdirSync(resolve(directory, sub), { recursive: true })
  mkdirSync(resolve(root, "scripts"), { recursive: true })
  mkdirSync(resolve(root, "packages/agent-flow-bend"), { recursive: true })
  for (const name of [
    "bend-producer.mjs",
    "authored-task-inputs.mjs",
    "package-graph.mjs",
    "bend-toolchain.mjs",
    "source-loader-policy.mjs",
    "compiler-evidence.mjs",
    "native-toolchain-inputs.mjs",
    "build-process.mjs",
    "build-lock.mjs",
    "build-groups.mjs",
    "owned-lock.mjs"
  ])
    copyFileSync(resolve(repository, "scripts", name), resolve(root, "scripts", name))
  writeFileSync(
    resolve(directory, "package.json"),
    JSON.stringify({
      name: "@hapsland/agent-flow-bend",
      private: true,
      type: "module",
      hapsland: {
        toolchain: JSON.parse(readFileSync(resolve(repository, "packages/agent-flow-bend/package.json"), "utf8"))
          .hapsland.toolchain
      }
    })
  )
  mkdirSync(resolve(directory, "request-content"), { recursive: true })
  for (const name of ["CanonicalRuntime.bend", "ImportGraphRuntime.bend", "request-content/Runtime.bend"])
    writeFileSync(resolve(directory, name), "import Base\n")
  writeFileSync(resolve(directory, "request-content/Runtime.bend"), "import Base\nimport ./core.bend as Core\n")
  writeFileSync(resolve(directory, "request-content/core.bend"), "// Actual projector input fixture\n")
  for (const name of ["build-canonical.mjs", "build-import-graph.mjs", "build-request-content.mjs"])
    writeFileSync(resolve(directory, "scripts", name), "// Generator fixture identity\n")
  for (const name of ["canonical.generated.d.ts", "import-graph.generated.d.ts", "request-content.generated.d.ts"]) {
    writeFileSync(resolve(directory, "abi", name), "export declare const fixture: number;\n")
    writeFileSync(resolve(directory, "dist", name), "export declare const fixture: number;\n")
  }
  for (const name of ["canonical.generated.js", "import-graph.generated.js", "request-content.generated.js"])
    writeFileSync(resolve(directory, "dist", name), "export const fixture=1;\n")
  const node = { path: directory },
    context = await bendProducerContext(root, node)
  const outputs = fileInventory(root, resolve(directory, "dist"))
  const loaders = outputs
    .filter((input) => input.path.endsWith(".js"))
    .map((input) => ({
      path: input.path,
      ...bendGeneratedLoaderEvidence(readFileSync(resolve(root, input.path), "utf8"), input.path)
    }))
  const body = { format: 1, context, outputs, loaders }
  const receipt = { ...body, digest: createHash("sha256").update(JSON.stringify(body)).digest("hex") }
  writeFileSync(resolve(directory, "dist/.bend-receipt.json"), JSON.stringify(receipt))
  return { root, node, directory, context, receipt, verify: () => checkBendProducerReceipt(root, node) }
}
test("records transitive relative/Base imports once even with cycles", (t) => {
  const root = temporary(t)
  writeFileSync(resolve(root, "base.bend"), "# base\n")
  writeFileSync(resolve(root, "a.bend"), "import Base\nimport ./b.bend as B\n")
  writeFileSync(resolve(root, "b.bend"), "import ./a.bend as A\n")
  const inputs = bendImportInputs(root, [resolve(root, "a.bend")], resolve(root, "base.bend"))
  assert.deepEqual(inputs.map((input) => input.path).sort(), ["a.bend", "b.bend", "base.bend"])
  writeFileSync(resolve(root, "b.bend"), "import ./a.bend as A\n# changed\n")
  assert.notDeepEqual(bendImportInputs(root, [resolve(root, "a.bend")], resolve(root, "base.bend")), inputs)
})
test("rejects remote/named imports and missing transitive files", (t) => {
  const root = temporary(t),
    entry = resolve(root, "a.bend")
  writeFileSync(entry, "import HubPackage\n")
  assert.throws(() => bendImportInputs(root, [entry], entry), /Unsupported Bend producer import/)
  writeFileSync(entry, "import ./missing.bend as Missing\n")
  assert.throws(() => bendImportInputs(root, [entry], entry), /ENOENT/)
})
test("accounts finite generated system FFI libraries and symbols", () => {
  const text =
    'const ffi=require("bun:ffi"); const mac=process.platform==="darwin"; const lib=ffi.dlopen(mac ? "libSystem.dylib" : "libc.so.6",{}); lib.symbols[mac ? "__error" : "__errno_location"]();'
  assert.deepEqual(bendGeneratedLoaderEvidence(text, "generated.js"), {
    policy: "bend-system-ffi",
    modules: ["bun:ffi"],
    libraries: ["libSystem.dylib", "libc.so.6"],
    symbols: ["__errno_location", "__error"]
  })
})
for (const text of [
  "require(name)",
  'const load=require; load("fs")',
  'require("node:child_process")',
  'const ffi=require("bun:ffi");ffi.dlopen(path,{})',
  'const ffi=require("other");ffi.dlopen("libc.so.6",{})',
  'new Function("return require")',
  'import("fs")'
])
  test(`rejects unsupported generated loader ${text}`, () =>
    assert.throws(() => bendGeneratedLoaderEvidence(text, "generated.js"), /Unsupported generated Bend loader/))
test("valid receipt binds actual compiler/support/input bytes and exact six outputs", async (t) => {
  const f = await fixture(t)
  assert.equal(f.verify().format, 1)
  assert.equal(f.context.toolchain.version, "bend 2.0.36")
  assert.ok(f.context.toolchain.support.inventory.length)
  assert.ok(f.context.toolchain.toolLibraries.length)
  assert.equal(f.receipt.outputs.length, 6)
})
test("Bend-only scheduling replaces a stale PATH task stamp before the scheduler reads it", async (t) => {
  const f = await fixture(t)
  writeFileSync(resolve(f.root, "package.json"), JSON.stringify({ private: true }))
  const node = {
    ...f.node,
    directory: "packages/agent-flow-bend",
    compiler: "bend",
    manifest: JSON.parse(readFileSync(resolve(f.directory, "package.json")))
  }
  const graph = { packages: new Map([[node.manifest.name, node]]) }
  const stale = structuredClone(f.context.toolchain)
  stale.environment.PATH = `/old-scheduler-prefix:${stale.environment.PATH}`
  prepareAuthoredTaskInputs(f.root, graph, { bendToolchain: stale })
  const stampPath = authoredTaskInputPath(f.root, node)
  assert.equal(JSON.parse(readFileSync(stampPath)).toolchain.environment.PATH, stale.environment.PATH)
  mkdirSync(resolve(f.root, "node_modules/.bin"), { recursive: true })
  const scheduler = resolve(f.root, "node_modules/.bin/turbo")
  writeFileSync(
    scheduler,
    `#!${process.execPath}\nconst fs=require('node:fs');const assert=require('node:assert/strict');const stamp=JSON.parse(fs.readFileSync(${JSON.stringify(stampPath)}));const current=JSON.parse(fs.readFileSync('.test-runs/bend-toolchain.json'));assert.deepEqual(stamp.toolchain,current);assert.equal(stamp.toolchain.environment.PATH,JSON.parse(process.env.HAPSLAND_BEND_PRODUCER_ENV).PATH);fs.writeFileSync('scheduler-observed.json',JSON.stringify(stamp.toolchain));\n`,
    { mode: 0o755 }
  )
  await buildBendProducers(f.root, { ...process.env }, graph)
  assert.deepEqual(JSON.parse(readFileSync(resolve(f.root, "scheduler-observed.json"))), f.context.toolchain)
  assert.equal(f.verify().format, 1)
})
test("source repair and ABI edits cannot reuse a retained receipt", async (t) => {
  const f = await fixture(t)
  assert.ok(f.verify())
  writeFileSync(resolve(f.directory, "CanonicalRuntime.bend"), "import Base\n# source changed\n")
  assert.throws(f.verify, /Stale Bend producer receipt/)
})
test("extra/missing/corrupt output bytes cannot pass exact inventory", async (t) => {
  const f = await fixture(t)
  writeFileSync(resolve(f.directory, "dist/extra.js"), "extra")
  assert.throws(f.verify, /output inventory/)
  rmSync(resolve(f.directory, "dist/extra.js"))
  chmodSync(resolve(f.directory, "dist/canonical.generated.js"), 0o700)
  assert.throws(f.verify, /output inventory/)
})
test("changed compiler helper invalidates a receipt even when generated outputs match", async (t) => {
  const f = await fixture(t)
  writeFileSync(resolve(f.root, "scripts/source-loader-policy.mjs"), "// changed policy\n")
  assert.throws(f.verify, /Changed Bend producer toolchain/)
})
test("literal foreign Base includes are evidence, not parsed as Bend or ignored", (t) => {
  const root = temporary(t)
  mkdirSync(resolve(root, "effs"))
  writeFileSync(resolve(root, "base.bend"), 'def foreign():\n  import "./effs/print.c"\n  import "./effs/print.js"\n')
  writeFileSync(resolve(root, "effs/print.c"), "#include <stdio.h>\n")
  writeFileSync(resolve(root, "effs/print.js"), "// import expressions here are foreign bytes\n")
  const inputs = bendImportInputs(root, [resolve(root, "base.bend")], resolve(root, "base.bend"))
  assert.deepEqual(inputs.map((input) => input.path).sort(), ["base.bend", "effs/print.c", "effs/print.js"])
  writeFileSync(resolve(root, "effs/print.c"), "#include <stdio.h>\n// changed\n")
  assert.notDeepEqual(bendImportInputs(root, [resolve(root, "base.bend")], resolve(root, "base.bend")), inputs)
})
test("recomputed receipt cannot publish declarations that disagree with authored ABI", async (t) => {
  const f = await fixture(t)
  writeFileSync(resolve(f.directory, "dist/canonical.generated.d.ts"), "export declare const wrong: boolean;\n")
  const outputs = fileInventory(f.root, resolve(f.directory, "dist")).filter(
    (input) => !input.path.endsWith("/.bend-receipt.json")
  )
  const { digest: _old, ...body } = f.receipt
  body.outputs = outputs
  writeFileSync(
    resolve(f.directory, "dist/.bend-receipt.json"),
    JSON.stringify({ ...body, digest: createHash("sha256").update(JSON.stringify(body)).digest("hex") })
  )
  assert.throws(f.verify, /declarations differ from authored ABI/)
})
test("canonical producer env preserves ordered tool selection through npm/Turbo filtering", async () => {
  const { bendProducerEnvironment, bendProducerEnvironmentKeys } = await import("./bend-producer.mjs")
  const initial = bendProducerEnvironment("/project", {
    PATH: "./tools:/usr/bin",
    LC_ALL: "C.UTF-8",
    LC_CTYPE: "C.UTF-8",
    NODE_OPTIONS: "--no-warnings --max-old-space-size=4096"
  })
  const declared = Object.fromEntries(bendProducerEnvironmentKeys.map((key) => [key, initial[key] ?? null]))
  const child = bendProducerEnvironment("/project", {
    PATH: "/project/package/node_modules/.bin:/usr/bin",
    LC_ALL: "filtered",
    HOME: "filtered",
    HAPSLAND_BEND_PRODUCER_ENV: JSON.stringify(declared)
  })
  assert.equal(child.PATH, "/project/tools:/usr/bin")
  assert.equal(child.LC_ALL, "C.UTF-8")
  assert.equal(child.LC_CTYPE, "C.UTF-8")
  assert.equal(child.NODE_OPTIONS, initial.NODE_OPTIONS)
  assert.equal(child.HOME, undefined)
  assert.throws(
    () => bendProducerEnvironment("/project", { PATH: "/bin", NODE_OPTIONS: "--require=/tmp/injection.js" }),
    /Unsupported Bend producer NODE_OPTIONS/
  )
  assert.throws(
    () =>
      bendProducerEnvironment("/project", {
        PATH: "/bin",
        HAPSLAND_BEND_PRODUCER_ENV: JSON.stringify({ ...declared, extra: "unaccounted" })
      }),
    /environment keys/
  )
})
test("analyzer context changes when a same-name transitive implementation changes", async (t) => {
  const { bendAnalyzerDependencyInputs } = await import("./bend-producer.mjs")
  const root = temporary(t)
  for (const [name, dependencies] of [
    ["analyzer", { helper: "1.0.0" }],
    ["helper", {}]
  ]) {
    const directory = resolve(root, "node_modules", name)
    mkdirSync(directory, { recursive: true })
    writeFileSync(resolve(directory, "package.json"), JSON.stringify({ name, main: "index.js", dependencies }))
    writeFileSync(resolve(directory, "index.js"), "module.exports = 1;\n")
  }
  const entries = [resolve(root, "node_modules/analyzer/index.js")]
  const before = bendAnalyzerDependencyInputs(root, entries)
  assert.deepEqual(before.map((item) => item.name).sort(), ["analyzer", "helper"])
  writeFileSync(resolve(root, "node_modules/helper/index.js"), "module.exports = 2;\n")
  assert.notDeepEqual(bendAnalyzerDependencyInputs(root, entries), before)
})
test("Bun consumers validate the selected Node generator identity rather than their own executable", async (t) => {
  const f = await fixture(t)
  const { spawnSync } = await import("node:child_process")
  const { pathToFileURL } = await import("node:url")
  const script = `import {checkBendProducerReceipt} from ${JSON.stringify(pathToFileURL(resolve(repository, "scripts/bend-producer.mjs")).href)}; const receipt=checkBendProducerReceipt(${JSON.stringify(f.root)},${JSON.stringify(f.node)}); console.log(receipt.context.toolchain.node.path);`
  const child = spawnSync(resolve(repository, "node_modules/.bin/bun"), ["-e", script], {
    encoding: "utf8",
    timeout: 10000
  })
  assert.equal(child.status, 0, child.stderr)
  assert.equal(child.stdout.trim(), f.context.toolchain.node.path)
})

test("producer-owned compiler cohort changes invalidate retained output", async (t) => {
  const f = await fixture(t)
  f.verify()
  const path = resolve(f.directory, "package.json")
  const manifest = JSON.parse(readFileSync(path, "utf8"))
  manifest.hapsland.toolchain.bend.source = "abcdef0"
  writeFileSync(path, JSON.stringify(manifest))
  assert.throws(f.verify, /Changed Bend producer toolchain context/)
})
test("Bend producer rejects unconsumed authored input drift and clears owned outputs", async (t) => {
  const f = await fixture(t)
  writeFileSync(resolve(f.root, "package.json"), JSON.stringify({ workspaces: ["packages/agent-flow-bend"] }))
  const manifest = JSON.parse(readFileSync(resolve(f.directory, "package.json"), "utf8"))
  const owner = { path: f.directory, directory: "packages/agent-flow-bend", compiler: "bend", manifest }
  const generator = (name) =>
    `import {writeFileSync,copyFileSync,mkdirSync} from 'node:fs';import {resolve} from 'node:path';const output=resolve(process.argv[2]);mkdirSync(output,{recursive:true});writeFileSync(resolve(output,'${name}.generated.js'),'export const fixture=1;\\n');copyFileSync(resolve(import.meta.dirname,'../abi/${name}.generated.d.ts'),resolve(output,'${name}.generated.d.ts'));`
  writeFileSync(resolve(f.directory, "scripts/build-canonical.mjs"), generator("canonical"))
  writeFileSync(resolve(f.directory, "scripts/build-import-graph.mjs"), generator("import-graph"))
  writeFileSync(resolve(f.directory, "scripts/build-request-content.mjs"), generator("request-content"))
  let toolchain = await bendProducerToolchain(f.root)
  prepareAuthoredTaskInputs(f.root, { packages: new Map([[manifest.name, owner]]) }, { bendToolchain: toolchain })
  await buildBendProducer(f.root, owner)
  assert.ok(checkBendProducerReceipt(f.root, owner))
  writeFileSync(
    resolve(f.directory, "scripts/build-canonical.mjs"),
    generator("canonical") + "writeFileSync(resolve(import.meta.dirname,'../unconsumed.bend'),'new authored input');"
  )
  toolchain = await bendProducerToolchain(f.root)
  prepareAuthoredTaskInputs(f.root, { packages: new Map([[manifest.name, owner]]) }, { bendToolchain: toolchain })
  await assert.rejects(buildBendProducer(f.root, owner), /Authored task inputs changed/)
  assert.equal(existsSync(resolve(f.directory, "dist")), false)
})

test("request-content core and authored ABI remain producer receipt authority", async (t) => {
  const f = await fixture(t)
  f.verify()
  writeFileSync(resolve(f.directory, "request-content/core.bend"), "// Changed projection policy\n")
  assert.throws(f.verify, /Stale Bend producer receipt context|caller context is stale/)
})
for (const file of ["request-content.generated.js", "request-content.generated.d.ts"])
  test(`omitted third producer output ${file} cannot pass a receipt`, async (t) => {
    const f = await fixture(t)
    rmSync(resolve(f.directory, "dist", file))
    assert.throws(f.verify, /Incomplete or changed Bend producer output inventory/)
  })

test("Darwin loaded-library evidence records resolved and transitive paths without guessing rpaths", () => {
  assert.deepEqual(
    bendDarwinLoadedLibraries(
      "dyld[12]: <AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE> /tools/node\n" +
        "dyld[12]: move loaded to delayed: libOptional.dylib\n" +
        "dyld[12]: <AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE> /tools/lib/libnode.dylib\n" +
        "dyld[12]: <AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE> /usr/lib/libSystem.B.dylib\n",
      "/tools/node"
    ),
    ["/tools/lib/libnode.dylib", "/usr/lib/libSystem.B.dylib"]
  )
  assert.throws(() => bendDarwinLoadedLibraries("", "/tools/node"), /Missing Darwin loaded/)
  assert.throws(
    () => bendDarwinLoadedLibraries("dyld[12]: @rpath/libnode.dylib", "/tools/node"),
    /Unsupported Darwin loaded/
  )
  assert.throws(
    () => bendDarwinLoadedLibraries("dyld[12]: <AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE> /other/node", "/tools/node"),
    /Missing Darwin executable/
  )
})
