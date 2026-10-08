import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve, dirname } from "node:path"
import { resolveTurboExecutable } from "./pinned-turbo.mjs"
import { resolveDeclaredDependencyVersion } from "./package-graph.mjs"

const root = resolve(import.meta.dirname, "..")
test("the pinned physical Turbo executable reports the declared release", () => {
  const executable = resolveTurboExecutable(root)
  assert.match(executable, /@turbo\/[^/]+\/bin\/turbo$/)
  const release = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"))
  assert.equal(
    execFileSync(executable, ["--version"], { encoding: "utf8", timeout: 5000 }).trim(),
    resolveDeclaredDependencyVersion(release, "turbo", release.devDependencies.turbo)
  )
})
for (const mismatch of ["wrapper", "declaration", "binary"])
  test(`Turbo refuses a mismatched ${mismatch} before executing it`, (t) => {
    const fixture = mkdtempSync(resolve(tmpdir(), "hapsland-turbo-pin-"))
    t.after(() => rmSync(fixture, { recursive: true, force: true }))
    const name = `@turbo/${process.platform}-${process.arch === "x64" ? "64" : process.arch}`
    const write = (path, value) => {
      const target = resolve(fixture, path)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, JSON.stringify(value))
    }
    write("package.json", { devDependencies: { turbo: "2.11.7" } })
    write("node_modules/turbo/package.json", {
      version: mismatch === "wrapper" ? "2.11.6" : "2.11.7",
      optionalDependencies: { [name]: mismatch === "declaration" ? "2.11.6" : "2.11.7" }
    })
    write(`node_modules/${name}/package.json`, { version: mismatch === "binary" ? "2.11.6" : "2.11.7" })
    assert.throws(() => resolveTurboExecutable(fixture), /does not match the declared pinned release/)
  })
