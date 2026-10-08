import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve, relative } from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"
import { deriveTurboTaskConfiguration } from "./generate-turbo-config.mjs"
import { assemblyPrerequisitePath } from "./assembly-prerequisites.mjs"

const owner = (name, dependencies = [], hapsland = {}) => ({
  directory: `packages/${name}`,
  path: `/fixture/packages/${name}`,
  compiler: "typescript",
  dependencies,
  manifest: {
    name: `@probe/${name}`,
    scripts: {
      build: "node build.mjs",
      "clean:compiler": "node clean.mjs",
      "assemble:linux-arm64": "node assemble.mjs",
      "assemble:darwin-arm64": "node assemble.mjs",
      "assemble:host": "node assemble.mjs",
      "native:linux-arm64": "node native.mjs",
      "native:darwin-arm64": "node native.mjs"
    },
    hapsland: { domain: name, ...hapsland }
  }
})
const graph = () => {
  const input = owner("input", [], {
    nativeAssets: [{ producer: { kind: "c", profiles: { "linux-arm64": {}, "darwin-arm64": {} } } }]
  })
  const hook = owner("hook", [input.manifest.name], {
    role: "hook",
    executable: "hapsland-hook",
    assembly: { profiles: ["linux-arm64", "darwin-arm64"] }
  })
  const admin = owner("admin")
  const pi = owner("pi", [input.manifest.name], { surface: "pi-extension", assembly: { profiles: ["host"] } })
  return { packages: new Map([input, hook, admin, pi].map((node) => [node.manifest.name, node])) }
}
test("task projection scopes assembly inputs to the actual declared build and native closure", () => {
  const result = deriveTurboTaskConfiguration(graph(), "/fixture")
  const assembly = result.tasks["@probe/hook#assemble:linux-arm64"]
  assert.deepEqual(assembly.dependsOn, ["@probe/hook#build", "@probe/input#build", "@probe/input#native:linux-arm64"])
  assert.ok(!JSON.stringify(assembly).includes("@probe/admin"))
  assert.ok(
    assembly.inputs.includes("$TURBO_ROOT$/packages/source-analysis/src/direct-event/languages/native-bindings.ts")
  )
  assert.ok(!JSON.stringify(assembly.inputs).includes("native-bindings.js"))
  assert.deepEqual(assembly.inputs.at(-1).from, assembly.dependsOn)
  assert.deepEqual(assembly.outputs, [
    "artifacts/linux-arm64/hapsland-hook",
    "artifacts/linux-arm64/assembly-receipt.json"
  ])
  assert.deepEqual(result.tasks["@probe/pi#assemble:host"].outputs, ["artifacts/host/**"])
  assert.deepEqual(result.tasks["@probe/pi#assemble:host"].inputs.at(-1).globs, ["dist/**/*.js", "dist/**/*.json"])
  assert.ok(
    result.tasks["@probe/pi#assemble:host"].inputs.includes(
      `$TURBO_ROOT$/${relative("/fixture", assemblyPrerequisitePath("/fixture", "pi-extension", "host"))}`
    )
  )
  assert.equal(result.tasks["@probe/input#native:darwin-arm64"].cache, false)
  for (const task of [
    "@probe/hook#assemble:linux-arm64",
    "@probe/hook#assemble:darwin-arm64",
    "@probe/pi#assemble:host"
  ])
    assert.ok(result.tasks[task].passThroughEnv.includes("HAPSLAND_BUILD_BUN"))
  assert.ok(!JSON.stringify(result).includes("dist/bin"))
})
test("unsupported profiles and missing producer scripts fail before config publication", () => {
  const invalid = graph()
  invalid.packages.get("@probe/hook").manifest.hapsland.assembly.profiles = ["linux-x64"]
  assert.throws(() => deriveTurboTaskConfiguration(invalid), /Unsupported assembly task profiles/)
  const missing = graph()
  delete missing.packages.get("@probe/hook").manifest.scripts["assemble:linux-arm64"]
  assert.throws(() => deriveTurboTaskConfiguration(missing), /Missing assembly task script/)
})
test("pinned Turbo accepts generated exact task keys and owner-relative artifact dependencies", (t) => {
  const root = mkdtempSync(resolve(tmpdir(), "haps-turbo-projection-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const fixture = graph()
  writeFileSync(
    resolve(root, "package.json"),
    JSON.stringify({ name: "probe", private: true, packageManager: "bun@1.3.14", workspaces: ["packages/*"] })
  )
  for (const node of fixture.packages.values()) {
    node.path = resolve(root, node.directory)
    mkdirSync(node.path, { recursive: true })
    writeFileSync(
      resolve(node.path, "package.json"),
      JSON.stringify({
        ...node.manifest,
        version: "1.0.0",
        private: true,
        dependencies: Object.fromEntries(node.dependencies.map((name) => [name, "workspace:*"]))
      })
    )
  }
  writeFileSync(resolve(root, "turbo.json"), JSON.stringify(deriveTurboTaskConfiguration(fixture, root)))
  const install = spawnSync("bun", ["install", "--ignore-scripts"], { cwd: root, encoding: "utf8", timeout: 10000 })
  assert.equal(install.status, 0, install.stderr)
  const result = spawnSync(
    resolve(import.meta.dirname, "../node_modules/.bin/turbo"),
    [
      "--skip-infer",
      "run",
      "assemble:linux-arm64",
      "assemble:darwin-arm64",
      "assemble:host",
      "--filter=@probe/hook",
      "--filter=@probe/pi",
      "--dry=json"
    ],
    { cwd: root, encoding: "utf8", timeout: 10000, env: { ...process.env, TURBO_TELEMETRY_DISABLED: "1" } }
  )
  assert.equal(result.status, 0, result.stderr)
  const tasks = JSON.parse(result.stdout).tasks
  assert.ok(tasks.some((task) => task.taskId === "@probe/hook#assemble:linux-arm64" && task.hash === null))
  assert.ok(!tasks.some((task) => task.package === "@probe/admin"))
})

test("uncached compiler cleanup has static inputs and remains a build prerequisite", () => {
  const result = deriveTurboTaskConfiguration(graph(), "/fixture")
  const cleanup = result.tasks["@probe/hook#clean:compiler"]
  assert.equal(cleanup.cache, false)
  assert.deepEqual(cleanup.outputs, [])
  assert.ok(cleanup.inputs.includes("package.json"))
  assert.ok(cleanup.inputs.includes("$TURBO_ROOT$/scripts/clean-compiler-output.mjs"))
  assert.ok(!cleanup.inputs.some((input) => input.startsWith("src/")))
  assert.deepEqual(result.tasks["@probe/hook#build"].dependsOn, ["@probe/hook#clean:compiler", "@probe/input#build"])
  const missing = graph()
  delete missing.packages.get("@probe/hook").manifest.scripts["clean:compiler"]
  assert.throws(() => deriveTurboTaskConfiguration(missing, "/fixture"), /Missing compiler cleanup/)
})
