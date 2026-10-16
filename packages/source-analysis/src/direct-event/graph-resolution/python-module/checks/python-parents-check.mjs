import { artifactValueTag, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises"
import { join, dirname, sep } from "node:path"
import { pathToFileURL } from "node:url"
import { createServiceSession } from "../../service-session.ts"
import { parsePythonSyntax } from "../../frontends.ts"
const t = (name, fields = {}) => ({ $: artifactValueTag(name) ?? "Types." + name, ...fields }),
  s = (name, fields = {}) => ({ $: "python-module/Session." + name, ...fields })
const temp = await mkdtemp("/tmp/hapsland-python-parents-")
try {
  const emitted = join(temp, "child.mjs")
  execFileSync("taskset", ["-c", "10", "bend", join(import.meta.dirname, "../../PythonModule.bend"), "-o", emitted], {
    timeout: 10000
  })
  const { default: child } = await import(pathToFileURL(emitted))
  const fixtures = [
    { name: "root-direct", path: "leaf.py", files: {}, valid: true },
    { name: "one-parent", files: { "pkg/__init__.py": "" }, valid: true },
    { name: "stub-parent", files: { "pkg/__init__.pyi": "from .foo import Foo" }, valid: true },
    { name: "source-precedence", files: { "pkg/__init__.py": "", "pkg/__init__.pyi": "run()" }, valid: true },
    {
      name: "ordered-parents",
      path: "pkg/sub/leaf.py",
      files: { "pkg/__init__.py": "", "pkg/sub/__init__.py": "" },
      valid: true
    },
    {
      name: "invalid-outer",
      path: "pkg/sub/leaf.py",
      files: { "pkg/__init__.py": "run()", "pkg/sub/__init__.py": "" },
      valid: false
    },
    {
      name: "invalid-inner",
      path: "pkg/sub/leaf.py",
      files: { "pkg/__init__.py": "", "pkg/sub/__init__.py": "run()" },
      valid: false
    },
    { name: "missing-parent", files: {}, valid: false },
    { name: "nonfile-source", files: { "pkg/__init__.pyi": "" }, directory: "pkg/__init__.py", valid: false },
    { name: "excluded-source", files: { "pkg/__init__.pyi": "" }, excluded: "pkg/__init__.py", valid: false },
    { name: "parent-symlink", files: { "other/__init__.py": "" }, link: ["other", "pkg"], valid: false },
    { name: "declared-root", root: "src", path: "src/pkg/leaf.py", files: { "src/pkg/__init__.py": "" }, valid: true },
    { name: "outside-root", root: "src", path: "pkg/leaf.py", files: { "pkg/__init__.py": "" }, valid: false },
    {
      name: "depth-boundary",
      path: "pkg/sub/leaf.py",
      depth: 2,
      files: { "pkg/__init__.py": "", "pkg/sub/__init__.py": "" },
      valid: true
    },
    {
      name: "depth-overflow",
      path: "pkg/sub/leaf.py",
      depth: 1,
      files: { "pkg/__init__.py": "", "pkg/sub/__init__.py": "" },
      valid: false
    },
    { name: "metadata-executable", files: { "pkg/__init__.py": "from .foo import *" }, valid: false },
    {
      name: "typed-static-parent",
      files: { "pkg/__init__.py": "from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n from .foo import Foo\n" },
      valid: true
    }
  ]
  const probe = (path) => ["clock", "probe:" + path]
  const capture = (path) => ["clock", "access:" + path, "capture:" + path, "clock", "parse"]
  const outer = ["select:pkg/__init__.py", ...probe("pkg"), ...probe("pkg/__init__.py")]
  const inner = ["select:pkg/sub/__init__.py", ...probe("pkg/sub"), ...probe("pkg/sub/__init__.py")]
  const outerCapture = capture("pkg/__init__.py")
  const innerCapture = capture("pkg/sub/__init__.py")
  const outerMembership = ["pkg", "pkg/__init__.py"]
  const bothMembership = [...outerMembership, "pkg/sub", "pkg/sub/__init__.py"]
  // Finite plans preserve ordered authority publication, including a captured
  // initializer whose syntax subsequently refuses package authority.
  const plans = [
    [true, [], [], []],
    [true, outerMembership, ["pkg/__init__.py"], [...outer, ...outerCapture]],
    [
      true,
      [...outerMembership, "pkg/__init__.pyi"],
      ["pkg/__init__.pyi"],
      [...outer, "select:pkg/__init__.pyi", ...probe("pkg/__init__.pyi"), ...capture("pkg/__init__.pyi")]
    ],
    [true, outerMembership, ["pkg/__init__.py"], [...outer, ...outerCapture]],
    [
      true,
      bothMembership,
      ["pkg/__init__.py", "pkg/sub/__init__.py"],
      [...outer, ...outerCapture, ...inner, ...innerCapture]
    ],
    [true, outerMembership, ["pkg/__init__.py"], [...outer, ...outerCapture]],
    [
      true,
      bothMembership,
      ["pkg/__init__.py", "pkg/sub/__init__.py"],
      [...outer, ...outerCapture, ...inner, ...innerCapture]
    ],
    [true, ["pkg"], [], ["select:pkg/__init__.py", ...probe("pkg"), "select:pkg/__init__.pyi"]],
    [true, outerMembership, [], outer],
    [false, [], [], ["select:pkg/__init__.py"]],
    [false, ["pkg"], [], ["select:pkg/__init__.py", ...probe("pkg")]],
    [
      true,
      ["src", "src/pkg", "src/pkg/__init__.py"],
      ["src/pkg/__init__.py"],
      [
        "select:src/pkg/__init__.py",
        ...probe("src"),
        ...probe("src/pkg"),
        ...probe("src/pkg/__init__.py"),
        ...capture("src/pkg/__init__.py")
      ]
    ],
    [true, [], [], []],
    [
      true,
      bothMembership,
      ["pkg/__init__.py", "pkg/sub/__init__.py"],
      [...outer, ...outerCapture, ...inner, ...innerCapture]
    ],
    [true, [], [], []],
    [true, outerMembership, ["pkg/__init__.py"], [...outer, ...outerCapture]],
    [true, outerMembership, ["pkg/__init__.py"], [...outer, ...outerCapture]]
  ]
  assert.equal(plans.length, fixtures.length)
  let requests = 0
  for (const [index, fixture] of fixtures.entries()) {
    const root = join(temp, String(index))
    await mkdir(root)
    for (const [path, text] of Object.entries(fixture.files)) {
      await mkdir(dirname(join(root, path)), { recursive: true })
      await writeFile(join(root, path), text)
    }
    if (fixture.directory) await mkdir(join(root, fixture.directory))
    if (fixture.link) await symlink(fixture.link[0], join(root, fixture.link[1]))
    let started = false
    const actual = [],
      depth = fixture.depth ?? 4
    const [available, membership, deps, expected] = plans[index]
    const io = createServiceSession({
      invocation: index + 1,
      root,
      now: () => {
        if (started) actual.push("clock")
        return 0
      },
      selectContextPath: (path) => {
        actual.push("select:" + path)
        return path !== fixture.excluded
      },
      access: async (path) => {
        actual.push("access:" + path)
        return { relativePath: path }
      },
      capture: async (selection) => {
        actual.push("capture:" + selection.relativePath)
        const text = await readFile(join(root, selection.relativePath), "utf8")
        return { status: "available", capture: { text, byteLength: Buffer.byteLength(text) } }
      },
      parsePythonSyntax: (text) => {
        actual.push("parse")
        return parsePythonSyntax(text)
      }
    })
    try {
      const clock = (await io.perform(t("Request", { invocation: index + 1, id: 0, operation: t("StartClock") })))
          .outcome.clock,
        cache = (
          await io.perform(t("Request", { invocation: index + 1, id: 1, operation: t("CreateInvocationCache") }))
        ).outcome.cache
      started = true
      const state = child.initial_session(
        "root.py",
        1024,
        depth,
        s("Remaining", {
          files: s("Nonnegative", { value: 10 }),
          read_bytes: s("Nonnegative", { value: 10000 }),
          work: s("Nonnegative", { value: 40 })
        })
      )
      let step = child.package_parents(
        state,
        fixture.path ?? "pkg/leaf.py",
        fixture.root ?? ".",
        clock,
        cache,
        sep,
        index + 1,
        2
      )
      while (step.$.endsWith(".Await")) {
        requests++
        if (step.request.operation.$ === "Types.ReadPathMembership") actual.push("probe:" + step.request.operation.path)
        step = child.resume_parents(step, await io.perform(step.request))
      }
      assert.equal(step.$, "python-module/PackageParentsMachine.Returned", fixture.name)
      assert.equal(step.valid, fixture.valid, fixture.name)
      assert.deepEqual(actual, expected, fixture.name + " ordered effects")
      assert.equal(step.session.available, available, fixture.name)
      assert.equal(step.session.work, membership.length, fixture.name)
      assert.deepEqual(
        unlist(step.session.membership).map((row) => row.path),
        membership,
        fixture.name
      )
      assert.deepEqual(unlist(step.session.dependencies), deps, fixture.name)
      assert.deepEqual(
        unlist(step.session.authority).map((row) => [row.path, Number(row.bytes)]),
        deps.map((path) => [path, Buffer.byteLength(fixture.files[path])]),
        fixture.name
      )
    } finally {
      await io.close()
    }
  }
  console.log(
    JSON.stringify({
      passed: true,
      cases: fixtures.length,
      requests,
      scope:
        "authored parent outcomes, ordered physical observations and authority/dependency publication; native parser facts; not whole GraphSession acceptance"
    })
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
