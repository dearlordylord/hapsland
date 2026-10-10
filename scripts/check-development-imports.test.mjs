import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { checkDevelopmentImports } from "./check-development-imports.mjs"

const fixture = (t, source, dependencies = { "@hapsland/tools": "workspace:*", effect: "4.0.0" }) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "hapsland-development-imports-")))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const directory of ["scripts", "src", "packages/input/src"])
    mkdirSync(join(root, directory), { recursive: true })
  const put = (path, value) =>
    writeFileSync(join(root, path), typeof value === "string" ? value : JSON.stringify(value))
  put("package.json", { workspaces: ["scripts", "src", "packages/input"] })
  put("scripts/package.json", {
    name: "@hapsland/tools",
    private: true,
    type: "module",
    hapsland: { workspaceRole: "tooling" },
    exports: { "./helper": { types: "./helper.ts", default: "./helper.ts" } }
  })
  put("scripts/helper.ts", "export const value = 1")
  put("src/package.json", {
    name: "@hapsland/tests",
    private: true,
    type: "module",
    hapsland: { workspaceRole: "verification" },
    dependencies
  })
  put("src/example.test.ts", source)
  put("src/local.ts", "export const local = 1")
  put("packages/input/package.json", {
    name: "@hapsland/input",
    private: true,
    type: "module",
    exports: { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" } }
  })
  put("packages/input/src/index.ts", "export const input = 1")
  return root
}

test("development imports use exact source exports and declared external owners including types and literal lazy edges", (t) => {
  const root = fixture(
    t,
    'import type { value } from "@hapsland/tools/helper"; export { value } from "@hapsland/tools/helper"; const lazy = import("effect/Effect"); import "node:fs"; import "./local.ts"; const text = "import bad from missing";'
  )
  const result = checkDevelopmentImports(root)
  assert.equal(result.edges, 5)
  assert.equal(result.files, 3)
  assert.deepEqual(result.ambiguities, [])
  const edges = result.records.find((record) => record.file === "src/example.test.ts").imports
  assert.ok(edges.some((edge) => edge.external === "effect"))
  assert.ok(edges.some((edge) => edge.target === "scripts/helper.ts"))
})

test("undeclared external and private exports cannot borrow root dependencies", (t) => {
  assert.throws(() => checkDevelopmentImports(fixture(t, 'import "effect";', {})), /Undeclared development dependency/)
  assert.throws(
    () => checkDevelopmentImports(fixture(t, 'import "@hapsland/tools/private";')),
    /undeclared workspace export/
  )
  assert.throws(
    () => checkDevelopmentImports(fixture(t, 'import type { value } from "@hapsland/tools/helper";', {})),
    /Undeclared development dependency/
  )
})

test("type-query imports remain manifest-owned", (t) => {
  assert.throws(
    () => checkDevelopmentImports(fixture(t, 'type Model = import("undeclared").Model;')),
    /Undeclared development dependency/
  )
})

test("relative cross-owner and escaping symlinks fail instead of bypassing exports", (t) => {
  const exported = fixture(t, 'import "../scripts/helper.ts";')
  assert.equal(checkDevelopmentImports(exported).edges, 1)
  writeFileSync(join(exported, "scripts/private.ts"), "export {}")
  writeFileSync(join(exported, "src/example.test.ts"), 'import "../scripts/private.ts";')
  assert.throws(() => checkDevelopmentImports(exported), /Cross-owner development import/)
  const root = fixture(t, 'import "./link.ts";')
  symlinkSync(join(root, "scripts/helper.ts"), join(root, "src/link.ts"))
  assert.throws(() => checkDevelopmentImports(root), /Cross-owner development import|escapes owner/)
  assert.throws(
    () => checkDevelopmentImports(fixture(t, 'import "../../outside.ts";')),
    /Unresolved development import|no workspace owner/
  )
})

test("tooling bootstrap can access only the authored source of its declared production export", (t) => {
  const root = fixture(t, "")
  const manifest = JSON.parse(readFileSync(join(root, "scripts/package.json"), "utf8"))
  manifest.dependencies = { "@hapsland/input": "workspace:*" }
  writeFileSync(join(root, "scripts/package.json"), JSON.stringify(manifest))
  writeFileSync(join(root, "scripts/helper.ts"), 'import "../packages/input/src/index.ts";')
  assert.equal(checkDevelopmentImports(root).edges, 1)
  writeFileSync(join(root, "packages/input/src/private.ts"), "export {}")
  writeFileSync(join(root, "scripts/helper.ts"), 'import "../packages/input/src/private.ts";')
  assert.throws(() => checkDevelopmentImports(root), /Cross-owner development import/)
  writeFileSync(join(root, "scripts/helper.ts"), 'import "../packages/input/src/index.ts";')
  delete manifest.dependencies
  writeFileSync(join(root, "scripts/package.json"), JSON.stringify(manifest))
  assert.throws(() => checkDevelopmentImports(root), /Undeclared development dependency/)
})

test("computed import sites are explicitly reported as unresolved analysis rather than fixture strings", (t) => {
  const result = checkDevelopmentImports(
    fixture(t, 'const target = "effect"; import(target); const fixture = `import("undeclared")`;')
  )
  assert.equal(result.edges, 0)
  assert.equal(result.ambiguities.length, 1)
  assert.equal(result.ambiguities[0].file, "src/example.test.ts")
})

test("declared root JSON resources carry hashes and reject arbitrary root access", (t) => {
  const root = fixture(t, 'import resource from "../conformance/case.json";')
  mkdirSync(join(root, "conformance"))
  writeFileSync(join(root, "conformance/case.json"), '{"value":1}')
  const manifest = JSON.parse(readFileSync(join(root, "src/package.json"), "utf8"))
  manifest.hapsland.developmentResources = [{ path: "conformance/case.json", authority: "root-conformance" }]
  writeFileSync(join(root, "src/package.json"), JSON.stringify(manifest))
  const edge = checkDevelopmentImports(root).records.find((record) => record.file === "src/example.test.ts").imports[0]
  assert.match(edge.resource.sha256, /^[a-f0-9]{64}$/)
  manifest.hapsland.developmentResources[0].authority = "unknown"
  writeFileSync(join(root, "src/package.json"), JSON.stringify(manifest))
  assert.throws(() => checkDevelopmentImports(root), /Invalid development resource/)
})

test("Vite URL assets stay finite and within their declared verification owner", (t) => {
  const root = fixture(t, 'import icon from "./icon.svg?url";', { vite: "8.0.0" })
  writeFileSync(join(root, "src/icon.svg"), "<svg/>")
  const edge = checkDevelopmentImports(root).records.find((record) => record.file === "src/example.test.ts").imports[0]
  assert.equal(edge.profile, "vite-url")
  assert.match(edge.sha256, /^[a-f0-9]{64}$/)
  writeFileSync(join(root, "src/example.test.ts"), 'import icon from "../scripts/icon.svg?url";')
  writeFileSync(join(root, "scripts/icon.svg"), "<svg/>")
  assert.throws(() => checkDevelopmentImports(root), /Unsupported development asset/)
})

test("npm-owned dependencies require the pinned validated loader and lexical binding", (t) => {
  const root = fixture(t, "export {}")
  writeFileSync(
    join(root, "scripts/npm-tooling.mjs"),
    readFileSync(new URL("./npm-tooling.mjs", import.meta.url), "utf8")
  )
  writeFileSync(
    join(root, "scripts/consumer.mjs"),
    'import { npmToolingRequire } from "./npm-tooling.mjs"; const require = npmToolingRequire(); require("tar");'
  )
  const result = checkDevelopmentImports(root)
  assert.ok(
    result.records
      .find((record) => record.file === "scripts/consumer.mjs")
      .imports.some((edge) => edge.tool === "npm" && edge.sha256)
  )
  writeFileSync(
    join(root, "scripts/consumer.mjs"),
    'const npmToolingRequire = () => require; const require = npmToolingRequire(); require("tar");'
  )
  assert.throws(() => checkDevelopmentImports(root), /Undeclared development dependency/)
})

test("browser-root imports require the exact bounded Vite profile and target", (t) => {
  const root = fixture(t, "export {}")
  const directory = "packages/agent-flow-viz"
  mkdirSync(join(root, directory, "scripts"), { recursive: true })
  mkdirSync(join(root, directory, "src"), { recursive: true })
  const release = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  release.workspaces.push(directory)
  writeFileSync(join(root, "package.json"), JSON.stringify(release))
  writeFileSync(
    join(root, directory, "package.json"),
    JSON.stringify({
      name: "@hapsland/browser-profile",
      private: true,
      type: "module",
      hapsland: { workspaceRole: "verification" },
      dependencies: { vite: "8.0.0", playwright: "1.0.0" }
    })
  )
  const source = readFileSync(
    new URL("../packages/agent-flow-viz/scripts/check-render-browser.mjs", import.meta.url),
    "utf8"
  )
  const path = join(root, directory, "scripts/check-render-browser.mjs")
  writeFileSync(path, source)
  mkdirSync(join(root, directory, "src/simulation"), { recursive: true })
  writeFileSync(join(root, directory, "src/simulation/controller.ts"), "export const simulationRun = () => ({})")
  const result = checkDevelopmentImports(root)
  const edges = result.records.find((record) => record.file.endsWith("check-render-browser.mjs")).imports
  assert.equal(edges.filter((edge) => edge.profile === "vite-browser-root").length, 2)
  writeFileSync(path, source + "\n// changed profile\n")
  assert.throws(() => checkDevelopmentImports(root), /Undeclared development dependency/)
})
