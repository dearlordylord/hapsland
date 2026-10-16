import { artifactValueTag, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises"
import { join, dirname, sep } from "node:path"
import { pathToFileURL } from "node:url"
import { createServiceSession } from "../../service-session.ts"
const t = (name, fields = {}) => ({ $: artifactValueTag(name) ?? "Types." + name, ...fields }),
  s = (name, fields = {}) => ({ $: "python-module/Session." + name, ...fields })
const temp = await mkdtemp("/tmp/hapsland-python-alternatives-")
try {
  const emitted = join(temp, "child.mjs")
  execFileSync("taskset", ["-c", "10", "bend", join(import.meta.dirname, "../../PythonModule.bend"), "-o", emitted], {
    timeout: 10000
  })
  const { default: child } = await import(pathToFileURL(emitted))
  const fixtures = [
    { name: "none", files: [], expected: [] },
    { name: "module-source", files: ["pkg.py"], expected: ["pkg.py"] },
    { name: "module-stub", files: ["pkg.pyi"], expected: ["pkg.pyi"] },
    { name: "source-precedence", files: ["pkg.py", "pkg.pyi"], expected: ["pkg.py"] },
    { name: "package-source", files: ["pkg/__init__.py", "pkg/__init__.pyi"], expected: ["pkg/__init__.py"] },
    { name: "package-stub", files: ["pkg/__init__.pyi"], expected: ["pkg/__init__.pyi"] },
    {
      name: "ambiguous",
      files: ["pkg.py", "pkg.pyi", "pkg/__init__.py", "pkg/__init__.pyi"],
      expected: ["pkg.py", "pkg/__init__.py"]
    },
    { name: "mixed-ambiguous", files: ["pkg.pyi", "pkg/__init__.py"], expected: ["pkg.pyi", "pkg/__init__.py"] },
    { name: "nonfile-source", files: ["pkg.pyi"], directory: "pkg.py" },
    { name: "nonfile-stub", files: [], directory: "pkg.pyi" },
    { name: "later-refusal", files: ["pkg.py"], excluded: "pkg/__init__.py" },
    {
      name: "excluded-stub",
      files: ["pkg.pyi", "pkg/__init__.py"],
      excluded: "pkg.pyi",
      expected: ["pkg/__init__.py"]
    },
    { name: "excluded-source", files: ["pkg.pyi"], excluded: "pkg.py" },
    { name: "symlink-source", files: ["actual.py"], link: ["actual.py", "pkg.py"] },
    { name: "absent-ancestor", files: [], base: "missing/pkg", expected: [] },
    { name: "non-directory-ancestor", files: ["parent"], base: "parent/pkg" },
    { name: "escape", files: [], base: "../pkg" },
    { name: "maximum-depth", files: [], base: "a/b/pkg", depth: 1, expected: [] },
    { name: "beyond-depth", files: [], base: "a/b/c/pkg", depth: 1 },
    { name: "expired", files: [], expired: true },
    { name: "work-cut", files: ["pkg.py"], work: 1 }
  ]
  const select = (path) => "select:" + path
  const probe = (path) => ["clock", "probe:" + path]
  const source = [select("pkg.py"), ...probe("pkg.py")]
  const stub = [select("pkg.pyi"), select("pkg.pyi"), ...probe("pkg.pyi")]
  const absentPackage = [
    select("pkg/__init__.py"),
    ...probe("pkg"),
    select("pkg/__init__.pyi"),
    select("pkg/__init__.pyi")
  ]
  const packageSource = [select("pkg/__init__.py"), ...probe("pkg"), ...probe("pkg/__init__.py")]
  const packageStub = [select("pkg/__init__.pyi"), select("pkg/__init__.pyi"), ...probe("pkg/__init__.pyi")]
  // Fixed fixture plans: ordered effects and terminal publication, never a search simulator.
  const plans = [
    [true, ["pkg.py", "pkg.pyi", "pkg"], [...source, ...stub, ...absentPackage]],
    [true, ["pkg.py", "pkg"], [...source, ...absentPackage]],
    [true, ["pkg.py", "pkg.pyi", "pkg"], [...source, ...stub, ...absentPackage]],
    [true, ["pkg.py", "pkg"], [...source, ...absentPackage]],
    [true, ["pkg.py", "pkg.pyi", "pkg", "pkg/__init__.py"], [...source, ...stub, ...packageSource]],
    [
      true,
      ["pkg.py", "pkg.pyi", "pkg", "pkg/__init__.py", "pkg/__init__.pyi"],
      [...source, ...stub, ...packageSource, ...packageStub]
    ],
    [true, ["pkg.py", "pkg", "pkg/__init__.py"], [...source, ...packageSource]],
    [true, ["pkg.py", "pkg.pyi", "pkg", "pkg/__init__.py"], [...source, ...stub, ...packageSource]],
    [true, ["pkg.py"], source],
    [true, ["pkg.py", "pkg.pyi"], [...source, ...stub]],
    [false, ["pkg.py"], [...source, select("pkg/__init__.py")]],
    [true, ["pkg.py", "pkg", "pkg/__init__.py"], [...source, select("pkg.pyi"), ...packageSource]],
    [false, [], [select("pkg.py")]],
    [false, ["pkg.py"], source],
    [
      true,
      ["missing"],
      [
        select("missing/pkg.py"),
        ...probe("missing"),
        select("missing/pkg.pyi"),
        select("missing/pkg.pyi"),
        select("missing/pkg/__init__.py"),
        select("missing/pkg/__init__.pyi"),
        select("missing/pkg/__init__.pyi")
      ]
    ],
    [false, ["parent"], [select("parent/pkg.py"), ...probe("parent")]],
    [true, [], []],
    [
      true,
      ["a"],
      [
        select("a/b/pkg.py"),
        ...probe("a"),
        select("a/b/pkg.pyi"),
        select("a/b/pkg.pyi"),
        select("a/b/pkg/__init__.py"),
        select("a/b/pkg/__init__.pyi"),
        select("a/b/pkg/__init__.pyi")
      ]
    ],
    [
      false,
      ["a"],
      [
        select("a/b/c/pkg.py"),
        ...probe("a"),
        select("a/b/c/pkg.pyi"),
        select("a/b/c/pkg.pyi"),
        select("a/b/c/pkg/__init__.py")
      ]
    ],
    [false, [], [select("pkg.py"), "clock"]],
    [false, ["pkg.py"], [...source, select("pkg/__init__.py"), "clock"]]
  ]
  assert.equal(plans.length, fixtures.length)
  let requests = 0
  for (const [index, fixture] of fixtures.entries()) {
    const root = join(temp, String(index))
    await mkdir(root)
    for (const path of fixture.files) {
      await mkdir(dirname(join(root, path)), { recursive: true })
      await writeFile(join(root, path), "class Item: pass")
    }
    if (fixture.directory) await mkdir(join(root, fixture.directory))
    if (fixture.link) await symlink(...fixture.link.map((path, i) => (i ? join(root, path) : path)))
    let started = false
    const actualEvents = [],
      cap = fixture.work ?? 40,
      depth = fixture.depth ?? 4
    const [available, membership, expectedEvents] = plans[index]
    const io = createServiceSession({
      invocation: index + 1,
      root,
      now: () => {
        if (started) actualEvents.push("clock")
        return fixture.expired && started ? 5000 : 0
      },
      selectContextPath: (path) => {
        actualEvents.push("select:" + path)
        return path !== fixture.excluded
      }
    })
    try {
      const clock = (await io.perform(t("Request", { invocation: index + 1, id: 0, operation: t("StartClock") })))
        .outcome.clock
      started = true
      const session = child.initial_session(
        "root.py",
        100,
        depth,
        s("Remaining", {
          files: s("Nonnegative", { value: 10 }),
          read_bytes: s("Nonnegative", { value: 10000 }),
          work: s("Nonnegative", { value: cap })
        })
      )
      let step = child.alternatives(session, fixture.base ?? "pkg", clock, sep, index + 1, 1)
      while (step.$.endsWith(".Await")) {
        requests++
        if (step.request.operation.$ === "Types.ReadPathMembership")
          actualEvents.push("probe:" + step.request.operation.path)
        step = child.resume_alternatives(step, await io.perform(step.request))
      }
      assert.equal(step.$, "python-module/AlternativesMachine.Returned", fixture.name)
      assert.deepEqual(step.paths.$ === "Some" ? unlist(step.paths.value) : undefined, fixture.expected, fixture.name)
      assert.equal(step.session.available, available, fixture.name)
      assert.equal(step.session.work, membership.length, fixture.name)
      assert.deepEqual(
        unlist(step.session.membership).map((row) => row.path),
        membership,
        fixture.name
      )
      assert.deepEqual(actualEvents, expectedEvents, fixture.name)
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
        "authored alternatives paths, ordered effects and terminal budgets/membership; physical ports; not full GraphSession"
    })
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
