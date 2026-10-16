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
const temp = await mkdtemp("/tmp/hapsland-python-target-")
try {
  const emitted = join(temp, "child.mjs")
  execFileSync("taskset", ["-c", "10", "bend", join(import.meta.dirname, "../../PythonModule.bend"), "-o", emitted], {
    timeout: 10000
  })
  const { default: child } = await import(pathToFileURL(emitted))
  const fixtures = [
    { name: "ordinary-absolute", import: "foo", files: { "foo.py": "" }, target: "foo.py" },
    { name: "source-before-stub", import: "foo", files: { "foo.py": "", "foo.pyi": "" }, target: "foo.py" },
    { name: "stub-only", import: "foo", files: { "foo.pyi": "" }, target: "foo.pyi" },
    { name: "package", import: "foo", files: { "foo/__init__.py": "" }, target: "foo/__init__.py" },
    { name: "module-package-ambiguity", import: "foo", files: { "foo.py": "", "foo/__init__.py": "" } },
    { name: "roots-ambiguity", import: "foo", files: { "foo.py": "", "src/foo.py": "" } },
    { name: "later-root-refusal", import: "foo", excluded: "src/foo.py", files: { "foo.py": "" } },
    {
      name: "relative-member",
      from: "pkg/use.py",
      import: ".foo",
      files: { "pkg/__init__.py": "", "pkg/foo.py": "" },
      target: "pkg/foo.py"
    },
    {
      name: "relative-package",
      from: "pkg/use.py",
      import: ".",
      files: { "pkg/__init__.py": "" },
      target: "pkg/__init__.py"
    },
    {
      name: "relative-stub",
      from: "pkg/use.py",
      import: ".",
      files: { "pkg/__init__.pyi": "" },
      target: "pkg/__init__.pyi"
    },
    {
      name: "relative-source-nonfile",
      from: "pkg/use.py",
      import: ".",
      directory: "pkg/__init__.py",
      files: { "pkg/__init__.pyi": "" }
    },
    { name: "root-boundary", import: ".", files: {} },
    {
      name: "relative-ascent",
      from: "pkg/sub/use.py",
      import: "..foo",
      files: { "pkg/__init__.py": "", "pkg/sub/__init__.py": "", "pkg/foo.py": "" },
      target: "pkg/foo.py"
    },
    {
      name: "src-original-root",
      rootPath: "src/pkg/use.py",
      from: "src/pkg/use.py",
      import: ".foo",
      files: { "src/pkg/__init__.py": "", "src/pkg/foo.py": "" },
      target: "src/pkg/foo.py"
    },
    {
      name: "declared-fallback",
      from: "lib/pkg/use.py",
      roots: [".", "src", "lib"],
      import: ".foo",
      files: { "lib/pkg/__init__.py": "", "lib/pkg/foo.py": "" },
      target: "lib/pkg/foo.py"
    },
    {
      name: "original-root-retained",
      rootPath: "root.py",
      from: "src/pkg/use.py",
      import: ".foo",
      files: { "src/pkg/__init__.py": "", "src/pkg/foo.py": "" },
      target: "src/pkg/foo.py"
    },
    { name: "unicode", import: "删除", files: { "删除.py": "" }, target: "删除.py" },
    { name: "bad-grammar", import: "foo..bar", files: {} },
    { name: "empty", import: "", files: {} },
    { name: "depth-overflow", depth: 1, import: "foo.bar.baz", files: {} },
    { name: "missing", import: "foo", files: {} }
  ]
  const list = (values) => values.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
  const select = (path) => "select:" + path
  const probe = (path) => ["clock", "probe:" + path]
  const capture = (path) => ["clock", "access:" + path, "capture:" + path, "clock", "parse"]
  const fooSource = [select("foo.py"), ...probe("foo.py")]
  const fooStub = [select("foo.pyi"), select("foo.pyi"), ...probe("foo.pyi")]
  const missingFooPackage = [
    select("foo/__init__.py"),
    ...probe("foo"),
    select("foo/__init__.pyi"),
    select("foo/__init__.pyi")
  ]
  const fooPackage = [select("foo/__init__.py"), ...probe("foo"), ...probe("foo/__init__.py")]
  const missingSrc = [
    select("src/foo.py"),
    ...probe("src"),
    select("src/foo.pyi"),
    select("src/foo.pyi"),
    select("src/foo/__init__.py"),
    select("src/foo/__init__.pyi"),
    select("src/foo/__init__.pyi")
  ]
  const ordinary = [...fooSource, ...missingFooPackage, ...missingSrc]
  const ordinaryMembership = ["foo.py", "foo", "src"]
  const parent = [
    select("pkg/__init__.py"),
    ...probe("pkg"),
    ...probe("pkg/__init__.py"),
    ...capture("pkg/__init__.py")
  ]
  const retainedParent = [select("pkg/__init__.py"), "parse"]
  const relative = [
    select("pkg/foo.py"),
    ...probe("pkg/foo.py"),
    select("pkg/foo/__init__.py"),
    ...probe("pkg/foo"),
    select("pkg/foo/__init__.pyi"),
    select("pkg/foo/__init__.pyi")
  ]
  const relativeMembership = ["pkg", "pkg/__init__.py", "pkg/foo.py", "pkg/foo"]
  const nestedParent = [
    select("pkg/sub/__init__.py"),
    ...probe("pkg/sub"),
    ...probe("pkg/sub/__init__.py"),
    ...capture("pkg/sub/__init__.py")
  ]
  const srcParent = [
    select("src/pkg/__init__.py"),
    ...probe("src"),
    ...probe("src/pkg"),
    ...probe("src/pkg/__init__.py"),
    ...capture("src/pkg/__init__.py")
  ]
  const srcRelative = [
    select("src/pkg/foo.py"),
    ...probe("src/pkg/foo.py"),
    select("src/pkg/foo/__init__.py"),
    ...probe("src/pkg/foo"),
    select("src/pkg/foo/__init__.pyi"),
    select("src/pkg/foo/__init__.pyi")
  ]
  const libInitial = [
    select("lib/__init__.py"),
    ...probe("lib"),
    ...probe("lib/__init__.py"),
    select("lib/__init__.pyi"),
    ...probe("lib/__init__.pyi")
  ]
  const libParent = [
    select("lib/pkg/__init__.py"),
    ...probe("lib/pkg"),
    ...probe("lib/pkg/__init__.py"),
    ...capture("lib/pkg/__init__.py")
  ]
  const libRelative = [
    select("lib/pkg/foo.py"),
    ...probe("lib/pkg/foo.py"),
    select("lib/pkg/foo/__init__.py"),
    ...probe("lib/pkg/foo"),
    select("lib/pkg/foo/__init__.pyi"),
    select("lib/pkg/foo/__init__.pyi")
  ]
  // Fixed fixture plans contain no target search, ancestor walk or reservation policy.
  const plans = [
    [true, ordinaryMembership, [], ordinary],
    [true, ordinaryMembership, [], ordinary],
    [true, ["foo.py", "foo.pyi", "foo", "src"], [], [...fooSource, ...fooStub, ...missingFooPackage, ...missingSrc]],
    [
      true,
      ["foo.py", "foo.pyi", "foo", "foo/__init__.py", "src"],
      ["foo/__init__.py"],
      [...fooSource, ...fooStub, ...fooPackage, ...missingSrc, select("foo/__init__.py"), ...capture("foo/__init__.py")]
    ],
    [true, ["foo.py", "foo", "foo/__init__.py", "src"], [], [...fooSource, ...fooPackage, ...missingSrc]],
    [
      true,
      ["foo.py", "foo", "src", "src/foo.py", "src/foo"],
      [],
      [
        ...fooSource,
        ...missingFooPackage,
        select("src/foo.py"),
        ...probe("src"),
        ...probe("src/foo.py"),
        select("src/foo/__init__.py"),
        ...probe("src/foo"),
        select("src/foo/__init__.pyi"),
        select("src/foo/__init__.pyi")
      ]
    ],
    [false, ["foo.py", "foo"], [], [...fooSource, ...missingFooPackage, select("src/foo.py")]],
    [true, relativeMembership, ["pkg/__init__.py"], [...parent, ...relative, ...retainedParent]],
    [true, ["pkg", "pkg/__init__.py"], ["pkg/__init__.py"], [...parent, select("pkg/__init__.py"), ...retainedParent]],
    [
      true,
      ["pkg", "pkg/__init__.py", "pkg/__init__.pyi"],
      ["pkg/__init__.pyi"],
      [
        select("pkg/__init__.py"),
        ...probe("pkg"),
        ...probe("pkg/__init__.py"),
        select("pkg/__init__.pyi"),
        ...probe("pkg/__init__.pyi"),
        ...capture("pkg/__init__.pyi"),
        select("pkg/__init__.py"),
        select("pkg/__init__.pyi"),
        select("pkg/__init__.py"),
        select("pkg/__init__.pyi"),
        "parse"
      ]
    ],
    [true, ["pkg", "pkg/__init__.py"], [], [select("pkg/__init__.py"), ...probe("pkg"), ...probe("pkg/__init__.py")]],
    [true, [], [], []],
    [
      true,
      ["pkg", "pkg/__init__.py", "pkg/sub", "pkg/sub/__init__.py", "pkg/foo.py", "pkg/foo"],
      ["pkg/__init__.py", "pkg/sub/__init__.py"],
      [...parent, ...nestedParent, ...relative, ...retainedParent]
    ],
    [
      true,
      ["src", "src/pkg", "src/pkg/__init__.py", "src/pkg/foo.py", "src/pkg/foo"],
      ["src/pkg/__init__.py"],
      [...srcParent, ...srcRelative, select("src/pkg/__init__.py"), "parse"]
    ],
    [
      true,
      ["lib", "lib/__init__.py", "lib/__init__.pyi", "lib/pkg", "lib/pkg/__init__.py", "lib/pkg/foo.py", "lib/pkg/foo"],
      ["lib/pkg/__init__.py"],
      [...libInitial, ...libParent, ...libRelative, select("lib/pkg/__init__.py"), "parse"]
    ],
    [
      true,
      ["src", "src/__init__.py", "src/__init__.pyi", "src/pkg", "src/pkg/__init__.py", "src/pkg/foo.py", "src/pkg/foo"],
      ["src/pkg/__init__.py"],
      [
        select("src/__init__.py"),
        ...probe("src"),
        ...probe("src/__init__.py"),
        select("src/__init__.pyi"),
        ...probe("src/__init__.pyi"),
        select("src/pkg/__init__.py"),
        ...probe("src/pkg"),
        ...probe("src/pkg/__init__.py"),
        ...capture("src/pkg/__init__.py"),
        ...srcRelative,
        select("src/pkg/__init__.py"),
        "parse"
      ]
    ],
    [
      true,
      ordinaryMembership.map((path) => path.replaceAll("foo", "删除")),
      [],
      ordinary.map((event) => event.replaceAll("foo", "删除"))
    ],
    [true, [], [], []],
    [true, [], [], []],
    [true, [], [], []],
    [true, ["foo.py", "foo.pyi", "foo", "src"], [], [...fooSource, ...fooStub, ...missingFooPackage, ...missingSrc]]
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
      const initial = child.initial_session(
        "root.py",
        1024,
        depth,
        s("Remaining", {
          files: s("Nonnegative", { value: 10 }),
          read_bytes: s("Nonnegative", { value: 10000 }),
          work: s("Nonnegative", { value: 40 })
        })
      )
      const state = child.cached_roots(initial, list(fixture.roots ?? [".", "src"]))
      let step = child.module_target(
        state,
        fixture.from ?? "root.py",
        fixture.import,
        fixture.rootPath ?? "root.py",
        clock,
        cache,
        sep,
        index + 1,
        2
      )
      while (step.$.endsWith(".Await")) {
        requests++
        if (step.request.operation.$ === "Types.ReadPathMembership") actual.push("probe:" + step.request.operation.path)
        step = child.resume_target(step, await io.perform(step.request))
      }
      assert.equal(step.$, "python-module/ModuleTargetMachine.Returned", fixture.name)
      assert.equal(step.path.$ === "None" ? undefined : step.path.value, fixture.target, fixture.name)
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
        "authored target outcomes and ordered root/parent observations, budgets and authority publication; physical ports; not whole GraphSession acceptance"
    })
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
