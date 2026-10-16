import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { join, sep } from "node:path"
import { pathToFileURL } from "node:url"
import { parse } from "smol-toml"
import { tomlValue } from "../../frontend-codec.ts"
import { createServiceSession } from "../../service-session.ts"
const temp = await mkdtemp("/tmp/hapsland-python-root-policy-")
try {
  const emitted = join(temp, "child.mjs")
  execFileSync("taskset", ["-c", "10", "bend", join(import.meta.dirname, "../../PythonModule.bend"), "-o", emitted], {
    timeout: 10000
  })
  const { default: child } = await import(pathToFileURL(emitted))
  const fixtures = [
    ["", "."],
    ['[project]\nname="x"', "."],
    ["[tool.poetry]", undefined],
    ["tool.hatch=false", undefined],
    ['tool.pdm="x"', undefined],
    ["tool=1979-05-27T07:32:00Z", "."],
    ["tool.setuptools.package-dir=1979-05-27T07:32:00Z", undefined],
    ["tool.setuptools.package-dir=[]", "."],
    ["tool.setuptools.package-dir={}", undefined],
    ['tool.setuptools.package-dir={""="src","other"="lib"}', undefined],
    ['tool.setuptools.package-dir={"named"="src"}', undefined],
    ["tool.setuptools.packages.find.where=[]", undefined],
    ['tool.setuptools.packages.find.where=["src","lib"]', undefined],
    ["tool.setuptools.packages.find.where=[false]", undefined],
    ['tool.setuptools.packages.find.where="src"', undefined]
  ]
  // Finite authored normalization/authority outcomes; no resolver policy oracle.
  const paths = [
    [".", "."],
    ["src", "src"],
    ["src/", `src${sep}`],
    ["./src", "src"],
    ["src/../lib", "lib"],
    ["../src", undefined],
    ["/src", undefined],
    ["a/b/c/d", ["a", "b", "c", "d"].join(sep)],
    ["a/b/c/d/e", undefined],
    ["", "."],
    ["..", undefined],
    ["a//b", ["a", "b"].join(sep)],
    ["a/../../../b", undefined]
  ]
  for (const [path, expected] of paths) {
    fixtures.push([`tool.setuptools.packages.find.where=[${JSON.stringify(path)}]`, expected])
    fixtures.push([`tool.setuptools.package-dir={""=${JSON.stringify(path)}}`, expected])
    fixtures.push([
      `tool.setuptools.packages.find.where=[${JSON.stringify(path)}]\ntool.setuptools.package-dir={""=${JSON.stringify(path)}}`,
      expected
    ])
    fixtures.push([
      `tool.setuptools.packages.find.where=[${JSON.stringify(path)}]\ntool.setuptools.package-dir={""="other"}`,
      undefined
    ])
  }
  let effects = 0
  for (const [index, [source, expected]] of fixtures.entries()) {
    const io = createServiceSession({ invocation: index + 1, root: temp })
    let step = child.declared_root(tomlValue(parse(source)), sep, index + 1, 0)
    while (step.$.endsWith(".Await")) {
      effects++
      step = child.resume_declared_root(step, await io.perform(step.request))
    }
    assert.equal(step.$, "python-module/RootPolicyMachine.Returned", source)
    assert.equal(step.root.$ === "Some" ? step.root.value : undefined, expected, source)
    await io.close()
  }
  console.log(
    JSON.stringify({
      passed: true,
      cases: fixtures.length,
      pathEffects: effects,
      scope:
        "authored declared-root authority and normalization outcomes over native TOML/path effects; excludes composed resolver"
    })
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
