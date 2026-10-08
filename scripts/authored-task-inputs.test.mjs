import assert from "node:assert/strict"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import test from "node:test"
import {
  authoredTaskInputPath,
  authoredTaskToolingFiles,
  captureAuthoredInputs,
  captureAuthoredTaskInputs,
  prepareAuthoredTaskInputs,
  verifyAuthoredInputStamp,
  verifyAuthoredTaskInputs
} from "./authored-task-inputs.mjs"
import { fileEvidence } from "./compiler-evidence.mjs"
const fixture = (t, compiler = "typescript") => {
  const root = mkdtempSync(resolve(tmpdir(), "haps-authored-inputs-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const directory of ["scripts", "native/src", "packages/owner/src"])
    mkdirSync(resolve(root, directory), { recursive: true })
  const put = (path, value) =>
    writeFileSync(resolve(root, path), typeof value === "string" ? value : JSON.stringify(value))
  put("package.json", { catalog: { effect: "4.0.0" } })
  put("packages/owner/package.json", { name: "@hapsland/owner", dependencies: { effect: "catalog:" } })
  for (const path of ["tsconfig.json", "tsconfig.package.json", "packages/owner/tsconfig.json"]) put(path, {})
  for (const path of authoredTaskToolingFiles({ compiler }))
    copyFileSync(new URL(`../${path}`, import.meta.url), resolve(root, path))
  put("packages/owner/src/main.ts", "export const value = 1")
  put("compiler", "exact compiler")
  const identity = fileEvidence(root, resolve(root, "compiler")),
    options = { toolchain: { node: identity, typescript: identity }, bendToolchain: { compiler: identity } }
  const node = {
    directory: "packages/owner",
    path: resolve(root, "packages/owner"),
    compiler,
    manifest: { name: "@hapsland/owner", hapsland: { domain: "owner" } }
  }
  return { root, node, options, put }
}
test("authored stamps preserve semantic stability and omit upstream emitted outputs", (t) => {
  const { root, node, options, put } = fixture(t)
  const graph = { packages: new Map([[node.manifest.name, node]]) }
  const stamps = prepareAuthoredTaskInputs(root, graph, options)
  const path = authoredTaskInputPath(root, node),
    before = statSync(path).mtimeMs
  mkdirSync(resolve(node.path, "dist"))
  put("packages/owner/dist/main.js", "new upstream bytes")
  prepareAuthoredTaskInputs(root, graph, options)
  assert.equal(statSync(path).mtimeMs, before)
  assert.deepEqual(
    verifyAuthoredInputStamp(root, node, stamps.get(node.manifest.name), options),
    stamps.get(node.manifest.name)
  )
  assert.equal(readFileSync(path, "utf8"), JSON.stringify(stamps.get(node.manifest.name), null, 2) + "\n")
})
for (const mutation of ["change", "add", "delete", "config", "catalog", "compiler", "adapter"])
  test(`detects ${mutation} between task hashing and execution`, (t) => {
    const { root, node, options, put } = fixture(t)
    const stamp = captureAuthoredInputs(root, node, options)
    if (mutation === "change") put("packages/owner/src/main.ts", "export const value = 2")
    if (mutation === "add") put("packages/owner/src/added.ts", "export {}")
    if (mutation === "delete") rmSync(resolve(node.path, "src/main.ts"))
    if (mutation === "config") put("tsconfig.package.json", { strict: false })
    if (mutation === "catalog") put("package.json", { catalog: { effect: "4.0.1" } })
    if (mutation === "compiler") put("compiler", "different compiler")
    if (mutation === "adapter") put("scripts/compile-package.mjs", "different compiler adapter")
    assert.throws(
      () => verifyAuthoredInputStamp(root, node, stamp, options),
      /Authored task (inputs|toolchain) changed/
    )
  })
test("checked generated JS remains authored and Bend membership excludes emitted dist", (t) => {
  const { root, node, options, put } = fixture(t, "bend")
  put("packages/owner/src/policy.generated.js", "export const law = true")
  put("packages/owner/Policy.bend", "def main = 1")
  const stamp = captureAuthoredInputs(root, node, options)
  assert.ok(stamp.source.some((entry) => entry.path.endsWith("policy.generated.js")))
  assert.ok(stamp.source.some((entry) => entry.path.endsWith("Policy.bend")))
  mkdirSync(resolve(node.path, "dist"))
  put("packages/owner/dist/policy.generated.js", "generated output")
  assert.deepEqual(captureAuthoredInputs(root, node, options), stamp)
})

test("batch verification freshly observes the phase without rewriting declared stamps", (t) => {
  const { root, node, options, put } = fixture(t)
  const graph = { packages: new Map([[node.manifest.name, node]]) }
  const expected = prepareAuthoredTaskInputs(root, graph, options)
  const path = authoredTaskInputPath(root, node),
    before = readFileSync(path, "utf8"),
    beforeTime = statSync(path).mtimeMs
  assert.deepEqual(captureAuthoredTaskInputs(root, graph, options), expected)
  assert.equal(verifyAuthoredTaskInputs(root, graph, expected, options), expected)
  put("packages/owner/src/main.ts", "export const value = 99")
  assert.throws(() => verifyAuthoredTaskInputs(root, graph, expected, options), /during production phase/)
  assert.equal(readFileSync(path, "utf8"), before)
  assert.equal(statSync(path).mtimeMs, beforeTime)
})
