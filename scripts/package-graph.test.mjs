import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import {
  generatePackageConfigs,
  packageTypeScriptConfig,
  readPackageGraph,
  resolveDeclaredDependencyVersion,
  resolveDevelopmentWorkspaceSource,
  resolveWorkspaceSource,
  resolveWorkspaceTypeSource
} from "./package-graph.mjs"

const fixture = (t, manifests) => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-package-graph-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const workspaces = Object.keys(manifests).map((name) => `packages/${name}`)
  writeFileSync(join(root, "package.json"), JSON.stringify({ workspaces }))
  for (const [name, values] of Object.entries(manifests)) {
    const path = join(root, "packages", name)
    mkdirSync(path, { recursive: true })
    writeFileSync(
      join(path, "package.json"),
      JSON.stringify({ name: `@hapsland/${name}`, private: true, type: "module", ...values })
    )
  }
  return root
}

test("manifest changes regenerate dependency-first references without a second graph", (t) => {
  const root = fixture(t, {
    input: {},
    hook: { dependencies: { "@hapsland/input": "workspace:*" } },
    pi: { dependencies: { "@hapsland/input": "workspace:*" }, hapsland: { host: "node" } }
  })
  const graph = generatePackageConfigs(root)
  assert.ok(graph.order.indexOf("@hapsland/input") < graph.order.indexOf("@hapsland/hook"))
  assert.deepEqual(packageTypeScriptConfig(graph, "@hapsland/hook").references, [{ path: "../input/tsconfig.json" }])
  assert.deepEqual(packageTypeScriptConfig(graph, "@hapsland/pi").compilerOptions.customConditions, ["node"])
  generatePackageConfigs(root, true)
  writeFileSync(
    join(root, "packages/hook/package.json"),
    JSON.stringify({
      name: "@hapsland/hook",
      private: true,
      type: "module",
      dependencies: { "@hapsland/pi": "workspace:*" }
    })
  )
  assert.throws(() => generatePackageConfigs(root, true), /Stale generated configuration/)
  const updated = generatePackageConfigs(root)
  assert.deepEqual(packageTypeScriptConfig(updated, "@hapsland/hook").references, [{ path: "../pi/tsconfig.json" }])
})

test("cyclic and unresolved workspace declarations fail before build scheduling", (t) => {
  const cyclic = fixture(t, {
    hook: { dependencies: { "@hapsland/input": "workspace:*" } },
    input: { dependencies: { "@hapsland/hook": "workspace:*" } }
  })
  assert.throws(() => readPackageGraph(cyclic), /dependency cycle/)
  const missing = fixture(t, { hook: { dependencies: { "@hapsland/missing": "workspace:*" } } })
  assert.throws(() => readPackageGraph(missing), /Unknown workspace dependency/)
})

test("unsupported workspace and host branches cannot silently produce configurations", (t) => {
  const root = fixture(t, { pi: { hapsland: { host: "unknown" } } })
  assert.throws(() => generatePackageConfigs(root), /Unsupported compilation host/)
  writeFileSync(join(root, "package.json"), JSON.stringify({ workspaces: ["packages/*"] }))
  assert.throws(() => readPackageGraph(root), /Unsupported workspace declaration/)
})

const addAuxiliary = (root, directory, role, values = {}) => {
  const release = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  release.workspaces.push(directory)
  writeFileSync(join(root, "package.json"), JSON.stringify(release))
  mkdirSync(join(root, directory), { recursive: true })
  writeFileSync(
    join(root, directory, "package.json"),
    JSON.stringify({
      name: `@hapsland/${directory}`,
      private: true,
      type: "module",
      hapsland: { workspaceRole: role },
      ...values
    })
  )
}

test("tooling and verification are explicit owners outside the production scheduler and references", (t) => {
  const root = fixture(t, { input: {}, hook: { dependencies: { "@hapsland/input": "workspace:*" } } })
  addAuxiliary(root, "scripts", "tooling", { dependencies: { "@hapsland/input": "workspace:*" } })
  addAuxiliary(root, "src", "verification", {
    dependencies: { "@hapsland/hook": "workspace:*", "@hapsland/scripts": "workspace:*" }
  })
  const graph = generatePackageConfigs(root)
  assert.equal(graph.workspaces.size, 4)
  assert.equal(graph.auxiliaryWorkspaces.size, 2)
  assert.deepEqual(graph.order, ["@hapsland/input", "@hapsland/hook"])
  assert.equal(graph.packages.size, 2)
  assert.deepEqual(JSON.parse(readFileSync(join(root, "tsconfig.packages.json"), "utf8")).references, [
    { path: "packages/input/tsconfig.json" },
    { path: "packages/hook/tsconfig.json" }
  ])
  assert.throws(
    () => resolveWorkspaceSource(graph, "@hapsland/scripts/checker"),
    /Production source cannot import tooling/
  )
  assert.throws(
    () => resolveWorkspaceSource(graph, "@hapsland/src/test"),
    /Production source cannot import verification/
  )
  generatePackageConfigs(root, true)
})

test("physical workspace roles and names fail closed", (t) => {
  for (const [directory, role] of [
    ["scripts", undefined],
    ["scripts", "verification"],
    ["src", "tooling"],
    ["scripts", "other"]
  ]) {
    const root = fixture(t, { hook: {} })
    addAuxiliary(root, directory, role)
    assert.throws(() => readPackageGraph(root), /workspace role|Workspace role/)
  }
  const duplicate = fixture(t, { hook: {} })
  addAuxiliary(duplicate, "scripts", "tooling", { name: "@hapsland/hook" })
  assert.throws(() => readPackageGraph(duplicate), /Duplicate workspace name/)
  const nonproduction = fixture(t, { hook: { hapsland: { workspaceRole: "tooling" } } })
  assert.throws(() => readPackageGraph(nonproduction), /physical boundary/)
})

test("all dependency declarations validate actual workspace ownership and versions", (t) => {
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const root = fixture(t, { hook: { [field]: { "@hapsland/scripts": "workspace:*" } } })
    addAuxiliary(root, "scripts", "tooling")
    assert.throws(() => readPackageGraph(root), /Production workspace cannot depend on tooling/)
    const wrong = fixture(t, { hook: {} })
    addAuxiliary(wrong, "scripts", "tooling", { [field]: { "@hapsland/hook": "1.0.0" } })
    assert.throws(() => readPackageGraph(wrong), /Local dependency must use workspace/)
    const missing = fixture(t, { hook: {} })
    addAuxiliary(missing, "src", "verification", { [field]: { "@hapsland/missing": "workspace:*" } })
    assert.throws(() => readPackageGraph(missing), /Unknown workspace dependency/)
  }
})

const sourceExportFixture = (t, exports) => {
  const root = fixture(t, { hook: {} })
  addAuxiliary(root, "scripts", "tooling", { exports })
  mkdirSync(join(root, "scripts/test-support"), { recursive: true })
  writeFileSync(join(root, "scripts/test-support/helper.ts"), "export const value = 1\n")
  writeFileSync(join(root, "scripts/helper.mjs"), "export const value = 1\n")
  return root
}

test("auxiliary exports expose explicit existing source files in their physical owner", (t) => {
  const root = sourceExportFixture(t, {
    "./test-support/helper": { types: "./test-support/helper.ts", default: "./test-support/helper.ts" },
    "./helper": "./helper.mjs"
  })
  assert.equal(readPackageGraph(root).auxiliaryWorkspaces.size, 1)
  for (const exports of [
    { "./helper": { types: "./other.ts", default: "./test-support/helper.ts" } },
    { "./helper": { types: "./test-support/helper.ts", default: "./test-support/helper.ts", browser: "./helper.mjs" } },
    { "./helper": "./test-support/helper.ts" },
    { "./helper": "./../helper.mjs" },
    { "./helper": "././helper.mjs" },
    { "./helper": "./missing.mjs" },
    { "./*": "./helper.mjs" }
  ])
    assert.throws(() => readPackageGraph(sourceExportFixture(t, exports)), /workspace export|workspace source export/)
  const escaped = sourceExportFixture(t, { "./helper": "./escaped.mjs" })
  writeFileSync(join(escaped, "outside.mjs"), "export {}\n")
  symlinkSync(join(escaped, "outside.mjs"), join(escaped, "scripts/escaped.mjs"))
  assert.throws(() => readPackageGraph(escaped), /escaped workspace source export/)
})

test("development resolution follows exact auxiliary APIs while production remains isolated", (t) => {
  const root = sourceExportFixture(t, {
    "./test-support/helper": { types: "./test-support/helper.ts", default: "./test-support/helper.ts" }
  })
  const graph = readPackageGraph(root)
  assert.equal(
    resolveDevelopmentWorkspaceSource(graph, "@hapsland/scripts/test-support/helper"),
    join(root, "scripts/test-support/helper.ts")
  )
  assert.throws(
    () => resolveDevelopmentWorkspaceSource(graph, "@hapsland/scripts/helper"),
    /undeclared workspace export/
  )
  assert.throws(() => resolveWorkspaceSource(graph, "@hapsland/scripts/test-support/helper"), /Production source/)
  assert.equal(resolveDevelopmentWorkspaceSource(graph, "node:fs"), undefined)
})

test("auxiliary dependency cycles are explicit unscheduled consumer components", (t) => {
  const root = fixture(t, { hook: {} })
  addAuxiliary(root, "scripts", "tooling", { dependencies: { "@hapsland/src": "workspace:*" } })
  addAuxiliary(root, "src", "verification", { dependencies: { "@hapsland/scripts": "workspace:*" } })
  const graph = readPackageGraph(root)
  assert.deepEqual(graph.auxiliarySccs, [["@hapsland/scripts", "@hapsland/src"]])
  assert.deepEqual(graph.order, ["@hapsland/hook"])
})

const bendFixture = (t) => {
  const root = fixture(t, {
    producer: {
      hapsland: { compiler: "bend", abi: { "./canonical": "./abi/canonical.d.ts" } },
      exports: { "./canonical": { types: "./dist/canonical.d.ts", default: "./dist/canonical.js" } }
    },
    consumer: { dependencies: { "@hapsland/producer": "workspace:*" } }
  })
  mkdirSync(join(root, "packages/producer/abi"), { recursive: true })
  writeFileSync(join(root, "packages/producer/abi/canonical.d.ts"), "export declare const value: number")
  return root
}

test("Bend producers remain dependency-first scheduler owners without TypeScript projects or references", (t) => {
  const root = bendFixture(t)
  const graph = generatePackageConfigs(root)
  assert.deepEqual(graph.order, ["@hapsland/producer", "@hapsland/consumer"])
  assert.deepEqual(graph.typeScriptOrder, ["@hapsland/consumer"])
  assert.deepEqual(packageTypeScriptConfig(graph, "@hapsland/consumer").references, [])
  assert.throws(() => packageTypeScriptConfig(graph, "@hapsland/producer"), /no TypeScript configuration/)
  assert.deepEqual(JSON.parse(readFileSync(join(root, "tsconfig.packages.json"), "utf8")).references, [
    { path: "packages/consumer/tsconfig.json" }
  ])
  assert.equal(
    resolveWorkspaceTypeSource(graph, "@hapsland/producer/canonical"),
    join(root, "packages/producer/abi/canonical.d.ts")
  )
  assert.throws(
    () => resolveWorkspaceSource(graph, "@hapsland/producer/canonical"),
    /Missing or escaped Bend emitted export/
  )
  mkdirSync(join(root, "packages/producer/dist"), { recursive: true })
  writeFileSync(join(root, "packages/producer/dist/canonical.js"), "export const value = 1")
  assert.equal(
    resolveWorkspaceSource(graph, "@hapsland/producer/canonical"),
    join(root, "packages/producer/dist/canonical.js")
  )
  rmSync(join(root, "packages/producer/abi/canonical.d.ts"))
  assert.throws(() => readPackageGraph(root), /Missing or escaped Bend ABI/)
  assert.throws(() => resolveWorkspaceTypeSource(graph, "@hapsland/producer/canonical"), /Missing or escaped Bend ABI/)
})

test("verification visualization owner is explicit and never enters production scheduling", (t) => {
  const root = fixture(t, {
    "agent-flow-viz": { name: "@hapsland/agent-flow-viz", hapsland: { workspaceRole: "verification" } },
    hook: {}
  })
  const graph = readPackageGraph(root)
  assert.equal(graph.auxiliaryWorkspaces.get("@hapsland/agent-flow-viz").role, "verification")
  assert.deepEqual(graph.order, ["@hapsland/hook"])
})

test("manifest-declared optional verification owners never enter production scheduling or TypeScript references", (t) => {
  const root = fixture(t, { hook: {} })
  addAuxiliary(root, "packages/development-simulator", "verification", {
    name: "@hapsland/development-simulator",
    dependencies: { "@hapsland/hook": "workspace:*" },
    exports: { "./engine": "./engine.mjs" }
  })
  writeFileSync(join(root, "packages/development-simulator/engine.mjs"), "export const simulation = true")
  addAuxiliary(root, "prototypes/development-lab", "verification", {
    name: "@hapsland/development-lab",
    dependencies: { "@hapsland/development-simulator": "workspace:*" },
    exports: { "./lab": { types: "./lab.ts", default: "./lab.ts" } }
  })
  writeFileSync(join(root, "prototypes/development-lab/lab.ts"), "export const lab = true")
  const graph = generatePackageConfigs(root)
  assert.deepEqual(graph.order, ["@hapsland/hook"])
  assert.deepEqual(graph.typeScriptOrder, ["@hapsland/hook"])
  assert.equal(graph.auxiliaryWorkspaces.size, 2)
  assert.equal(
    resolveDevelopmentWorkspaceSource(graph, "@hapsland/development-lab/lab"),
    join(root, "prototypes/development-lab/lab.ts")
  )
  assert.throws(
    () => resolveWorkspaceSource(graph, "@hapsland/development-simulator/engine"),
    /Production source cannot import verification/
  )
  const releaseConfig = JSON.parse(readFileSync(join(root, "tsconfig.packages.json"), "utf8"))
  assert.deepEqual(releaseConfig.references, [{ path: "packages/hook/tsconfig.json" }])
})

test("prototype production and undeclared optional owners cannot masquerade as build packages", (t) => {
  const root = fixture(t, { hook: {} })
  addAuxiliary(root, "prototypes/development-lab", "production", { name: "@hapsland/development-lab" })
  assert.throws(() => readPackageGraph(root), /physical boundary/)
})

test("shared catalogs resolve exact pins without becoming a second workspace graph", (t) => {
  const root = fixture(t, { hook: { dependencies: { effect: "catalog:" } } })
  const release = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  release.catalog = { effect: "4.0.0", "@effect/ai": "4.0.0", typescript: "7.0.2" }
  writeFileSync(join(root, "package.json"), JSON.stringify(release))
  assert.equal(readPackageGraph(root).packages.get("@hapsland/hook").dependencyVersions.dependencies.effect, "4.0.0")
  assert.equal(resolveDeclaredDependencyVersion(release, "typescript", "catalog:"), "7.0.2")
  assert.equal(resolveDeclaredDependencyVersion(release, "unshared", "^1.0.0"), "^1.0.0")
  assert.throws(() => resolveDeclaredDependencyVersion(release, "missing", "catalog:"), /Unknown catalog dependency/)
  assert.throws(
    () => resolveDeclaredDependencyVersion(release, "effect", "catalog:other"),
    /Unsupported dependency catalog/
  )
  for (const version of ["^4.0.0", "latest", "workspace:*", "4.0", "*"]) {
    assert.throws(
      () => resolveDeclaredDependencyVersion({ catalog: { effect: version } }, "effect", "catalog:"),
      /exact version/
    )
  }
  release.catalog["@effect/ai"] = "4.0.1"
  writeFileSync(join(root, "package.json"), JSON.stringify(release))
  assert.throws(() => readPackageGraph(root), /Effect catalog cohort/)
})
