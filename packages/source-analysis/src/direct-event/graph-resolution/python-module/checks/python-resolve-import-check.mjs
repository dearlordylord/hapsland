import { artifactValueTag, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises"
import { join, dirname, sep } from "node:path"
import { pathToFileURL } from "node:url"
import { createServiceSession } from "../../service-session.ts"
import { inspectSourceFrontend, parsePythonSyntax } from "../../frontends.ts"
import { pythonAdapter } from "../../../../../dist/direct-event/languages/python.js"
import { sourceFacts } from "../../frontend-codec.ts"
const t = (name, fields = {}) => ({ $: artifactValueTag(name) ?? "Types." + name, ...fields }),
  s = (name, fields = {}) => ({ $: "python-module/Session." + name, ...fields })
const temp = await mkdtemp("/tmp/hapsland-python-import-")
try {
  const emitted = join(temp, "child.mjs")
  execFileSync("taskset", ["-c", "10", "bend", join(import.meta.dirname, "../../PythonModule.bend"), "-o", emitted], {
    timeout: 10000
  })
  const { default: child } = await import(pathToFileURL(emitted))
  const fixtures = [
    { name: "ordinary-module", import: "foo", member: "Foo", files: { "foo.py": "" }, target: "foo.py", result: "Foo" },
    { name: "ordinary-dotted-refusal", import: "foo", member: "nested.Foo", files: { "foo.py": "" } },
    {
      name: "initializer-own-declaration",
      import: "pkg",
      member: "Foo",
      files: { "pkg/__init__.py": "class Foo:\n id: str\n" },
      target: "pkg/__init__.py",
      result: "Foo"
    },
    {
      name: "initializer-reexport",
      import: "pkg",
      member: "Foo",
      files: { "pkg/__init__.py": "from .leaf import Foo", "pkg/leaf.py": "class Foo:\n id: str\n" },
      target: "pkg/leaf.py",
      result: "Foo"
    },
    {
      name: "aliased-reexport",
      import: "pkg",
      member: "Public",
      files: { "pkg/__init__.py": "from .leaf import Foo as Public", "pkg/leaf.py": "" },
      target: "pkg/leaf.py",
      result: "Foo"
    },
    {
      name: "dotted-self-fallback",
      import: "pkg",
      member: "child.Foo",
      files: { "pkg/__init__.py": "from . import child", "pkg/child.py": "" },
      target: "pkg/child.py",
      result: "Foo"
    },
    {
      name: "dotted-unbound-fallback",
      import: "pkg",
      member: "child.Foo",
      files: { "pkg/__init__.py": "", "pkg/child.py": "" },
      target: "pkg/child.py",
      result: "Foo"
    },
    {
      name: "dotted-binding-blocks-fallback",
      import: "pkg",
      member: "child.Foo",
      files: { "pkg/__init__.py": "child = 1", "pkg/child.py": "" }
    },
    {
      name: "dotted-forward",
      import: "pkg",
      member: "child.Foo",
      files: { "pkg/__init__.py": "from . import nested as child", "pkg/nested.py": "" },
      target: "pkg/nested.py",
      result: "Foo"
    },
    {
      name: "dotted-empty-tail-forward",
      import: "pkg",
      member: "child..Foo",
      files: { "pkg/__init__.py": "from . import nested as child", "pkg/nested.py": "" },
      target: "pkg/nested.py",
      result: "Foo"
    },
    { name: "cycle", import: "pkg", member: "Foo", files: { "pkg/__init__.py": "from . import Foo" } },
    {
      name: "mutual-cycle",
      import: "pkg",
      member: "Foo",
      files: { "pkg/__init__.py": "from other import Foo", "other/__init__.py": "from pkg import Foo" }
    },
    {
      name: "depth-ceiling",
      depth: 1,
      import: "pkg",
      member: "Foo",
      files: { "pkg/__init__.py": "from other import Foo", "other/__init__.py": "from leaf import Foo", "leaf.py": "" }
    },
    {
      name: "depth-boundary",
      depth: 2,
      import: "pkg",
      member: "Foo",
      files: { "pkg/__init__.py": "from other import Foo", "other/__init__.py": "from leaf import Foo", "leaf.py": "" },
      target: "leaf.py",
      result: "Foo"
    },
    { name: "initializer-executable", import: "pkg", member: "Foo", files: { "pkg/__init__.py": "install_loader()" } },
    { name: "unknown-declaration", import: "pkg", member: "Foo", files: { "pkg/__init__.py": "" } },
    {
      name: "stub-initializer",
      import: "pkg",
      member: "Foo",
      files: { "pkg/__init__.pyi": "from .leaf import Foo", "pkg/leaf.pyi": "" },
      target: "pkg/leaf.pyi",
      result: "Foo"
    },
    {
      name: "static-typing-forward",
      import: "pkg",
      member: "Foo",
      files: {
        "pkg/__init__.py": "from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n from .leaf import Foo\n",
        "pkg/leaf.py": ""
      },
      target: "pkg/leaf.py",
      result: "Foo"
    },
    {
      name: "original-root-relative",
      rootPath: "src/pkg/use.py",
      from: "src/pkg/use.py",
      import: ".",
      member: "Foo",
      files: { "src/pkg/__init__.py": "from .leaf import Foo", "src/pkg/leaf.py": "" },
      target: "src/pkg/leaf.py",
      result: "Foo"
    },
    { name: "ambiguous-module", import: "foo", member: "Foo", files: { "foo.py": "", "foo/__init__.py": "" } },
    { name: "missing", import: "foo", member: "Foo", files: {} },
    { name: "expired-before-target", expired: true, import: "foo", member: "Foo", files: { "foo.py": "" } },
    { name: "zero-work", workBudget: 0, import: "foo", member: "Foo", files: { "foo.py": "" } },
    {
      name: "zero-authority-files",
      filesBudget: 0,
      import: "pkg",
      member: "Foo",
      files: { "pkg/__init__.py": "class Foo:\n id: str\n" }
    },
    {
      name: "insufficient-read-reservation",
      readBudget: 100,
      import: "pkg",
      member: "Foo",
      files: { "pkg/__init__.py": "class Foo:\n id: str\n" }
    },
    {
      name: "capture-denied",
      denyCapture: true,
      import: "pkg",
      member: "Foo",
      files: { "pkg/__init__.py": "class Foo:\n id: str\n" }
    }
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
  const missingSrc = [
    select("src/foo.py"),
    ...probe("src"),
    select("src/foo.pyi"),
    select("src/foo.pyi"),
    select("src/foo/__init__.py"),
    select("src/foo/__init__.pyi"),
    select("src/foo/__init__.pyi")
  ]
  const ordinary = ["clock", ...fooSource, ...missingFooPackage, ...missingSrc]
  const searchPkg = [
    select("pkg.py"),
    ...probe("pkg.py"),
    select("pkg.pyi"),
    select("pkg.pyi"),
    ...probe("pkg.pyi"),
    select("pkg/__init__.py"),
    ...probe("pkg"),
    ...probe("pkg/__init__.py"),
    ...missingSrc.map((event) => event.replaceAll("foo", "pkg"))
  ]
  const pkgParent = [select("pkg/__init__.py"), ...capture("pkg/__init__.py")]
  const pkgPrelude = ["clock", ...searchPkg, ...pkgParent]
  const pkgInspection = [...pkgPrelude, "parse", "inspect:pkg/__init__.py"]
  const pkgMembership = ["pkg.py", "pkg.pyi", "pkg", "pkg/__init__.py", "src"]
  const retainedParent = [select("pkg/__init__.py"), "parse"]
  const packageItself = [...retainedParent, select("pkg/__init__.py"), ...retainedParent]
  const leaf = [
    select("pkg/leaf.py"),
    ...probe("pkg/leaf.py"),
    select("pkg/leaf/__init__.py"),
    ...probe("pkg/leaf"),
    select("pkg/leaf/__init__.pyi"),
    select("pkg/leaf/__init__.pyi")
  ]
  const relativeLeaf = ["clock", ...retainedParent, ...leaf, ...retainedParent]
  const childAbsolute = [
    "clock",
    ...leaf.map((event) => event.replaceAll("leaf", "child")),
    ...missingSrc
      .map((event) => event.replaceAll("foo", "pkg/child"))
      .filter((event) => event !== "clock" && event !== "probe:src"),
    ...retainedParent
  ]
  const otherSearch = searchPkg.map((event) => event.replaceAll("pkg", "other"))
  // The second package uses the already observed missing src root.
  const otherPrelude = [
    "clock",
    ...otherSearch.slice(0, -missingSrc.length),
    ...missingSrc
      .map((event) => event.replaceAll("foo", "other"))
      .filter((event) => event !== "clock" && event !== "probe:src"),
    select("other/__init__.py"),
    ...capture("other/__init__.py"),
    "parse",
    "inspect:other/__init__.py"
  ]
  const cachedPkgSearch = [
    select("pkg.py"),
    select("pkg.pyi"),
    select("pkg.pyi"),
    select("pkg/__init__.py"),
    ...missingSrc
      .map((event) => event.replaceAll("foo", "pkg"))
      .filter((event) => event !== "clock" && event !== "probe:src"),
    ...retainedParent
  ]
  const leafAbsolute = [
    "clock",
    ...fooSource.map((event) => event.replaceAll("foo", "leaf")),
    ...missingFooPackage.map((event) => event.replaceAll("foo", "leaf")),
    ...missingSrc
      .map((event) => event.replaceAll("foo", "leaf"))
      .filter((event) => event !== "clock" && event !== "probe:src")
  ]
  const stubSearch = [
    select("pkg.py"),
    ...probe("pkg.py"),
    select("pkg.pyi"),
    select("pkg.pyi"),
    ...probe("pkg.pyi"),
    select("pkg/__init__.py"),
    ...probe("pkg"),
    ...probe("pkg/__init__.py"),
    select("pkg/__init__.pyi"),
    select("pkg/__init__.pyi"),
    ...probe("pkg/__init__.pyi"),
    ...missingSrc.map((event) => event.replaceAll("foo", "pkg"))
  ]
  const stubParent = [select("pkg/__init__.py"), select("pkg/__init__.pyi"), "parse"]
  const stubPrelude = [
    "clock",
    ...stubSearch,
    select("pkg/__init__.py"),
    select("pkg/__init__.pyi"),
    ...capture("pkg/__init__.pyi"),
    "parse",
    "inspect:pkg/__init__.pyi"
  ]
  const stubLeaf = [
    select("pkg/leaf.py"),
    ...probe("pkg/leaf.py"),
    select("pkg/leaf.pyi"),
    select("pkg/leaf.pyi"),
    ...probe("pkg/leaf.pyi"),
    select("pkg/leaf/__init__.py"),
    ...probe("pkg/leaf"),
    select("pkg/leaf/__init__.pyi"),
    select("pkg/leaf/__init__.pyi")
  ]
  const srcParent = [
    select("src/pkg/__init__.py"),
    ...probe("src"),
    ...probe("src/pkg"),
    ...probe("src/pkg/__init__.py"),
    ...capture("src/pkg/__init__.py")
  ]
  const retainedSrc = [select("src/pkg/__init__.py"), "parse"]
  const srcLeaf = leaf.map((event) => event.replaceAll("pkg/", "src/pkg/"))
  // Authored routes, publications and effect sequences; no native resolver or
  // mutable probe/capture simulator determines the expected result.
  const plans = [
    [true, ["foo.py", "foo", "src"], [], [], [], [], ordinary],
    [true, ["foo.py", "foo", "src"], [], [], [], [], ordinary],
    [true, pkgMembership, ["pkg/__init__.py"], [], ["pkg/__init__.py"], ["pkg/__init__.py"], pkgInspection],
    [
      true,
      [...pkgMembership, "pkg/leaf.py", "pkg/leaf"],
      ["pkg/__init__.py"],
      ["pkg/__init__.py"],
      [],
      ["pkg/__init__.py"],
      [...pkgInspection, ...relativeLeaf]
    ],
    [
      true,
      [...pkgMembership, "pkg/leaf.py", "pkg/leaf"],
      ["pkg/__init__.py"],
      ["pkg/__init__.py"],
      [],
      ["pkg/__init__.py"],
      [...pkgInspection, ...relativeLeaf]
    ],
    [
      true,
      [...pkgMembership, "pkg/child.py", "pkg/child"],
      ["pkg/__init__.py"],
      ["pkg/__init__.py"],
      [],
      ["pkg/__init__.py"],
      [...pkgInspection, ...packageItself, ...childAbsolute]
    ],
    [
      true,
      [...pkgMembership, "pkg/child.py", "pkg/child"],
      ["pkg/__init__.py"],
      ["pkg/__init__.py"],
      [],
      ["pkg/__init__.py"],
      [...pkgInspection, ...childAbsolute]
    ],
    [true, pkgMembership, ["pkg/__init__.py"], ["pkg/__init__.py"], [], ["pkg/__init__.py"], pkgInspection],
    [
      true,
      [...pkgMembership, "pkg/nested.py", "pkg/nested"],
      ["pkg/__init__.py"],
      ["pkg/__init__.py"],
      [],
      ["pkg/__init__.py", "pkg/__init__.py"],
      [
        ...pkgInspection,
        ...packageItself,
        "clock",
        ...packageItself,
        "parse",
        "inspect:pkg/__init__.py",
        ...relativeLeaf.map((event) => event.replaceAll("leaf", "nested"))
      ]
    ],
    [
      true,
      [...pkgMembership, "pkg/nested.py", "pkg/nested"],
      ["pkg/__init__.py"],
      ["pkg/__init__.py"],
      [],
      ["pkg/__init__.py", "pkg/__init__.py"],
      [
        ...pkgInspection,
        ...packageItself,
        "clock",
        ...packageItself,
        "parse",
        "inspect:pkg/__init__.py",
        ...relativeLeaf.map((event) => event.replaceAll("leaf", "nested"))
      ]
    ],
    [
      true,
      pkgMembership,
      ["pkg/__init__.py"],
      ["pkg/__init__.py"],
      [],
      ["pkg/__init__.py"],
      [...pkgInspection, "clock", ...packageItself]
    ],
    [
      true,
      [...pkgMembership, "other.py", "other.pyi", "other", "other/__init__.py"],
      ["pkg/__init__.py", "other/__init__.py"],
      ["pkg/__init__.py", "other/__init__.py"],
      [],
      ["pkg/__init__.py", "other/__init__.py"],
      [...pkgInspection, ...otherPrelude, "clock", ...cachedPkgSearch]
    ],
    [
      true,
      [...pkgMembership, "other.py", "other.pyi", "other", "other/__init__.py"],
      ["pkg/__init__.py", "other/__init__.py"],
      ["pkg/__init__.py", "other/__init__.py"],
      [],
      ["pkg/__init__.py", "other/__init__.py"],
      [...pkgInspection, ...otherPrelude]
    ],
    [
      true,
      [...pkgMembership, "other.py", "other.pyi", "other", "other/__init__.py", "leaf.py", "leaf"],
      ["pkg/__init__.py", "other/__init__.py"],
      ["pkg/__init__.py", "other/__init__.py"],
      [],
      ["pkg/__init__.py", "other/__init__.py"],
      [...pkgInspection, ...otherPrelude, ...leafAbsolute]
    ],
    [true, pkgMembership, ["pkg/__init__.py"], ["pkg/__init__.py"], [], [], pkgPrelude],
    [true, pkgMembership, ["pkg/__init__.py"], ["pkg/__init__.py"], [], ["pkg/__init__.py"], pkgInspection],
    [
      true,
      [...pkgMembership.slice(0, 4), "pkg/__init__.pyi", "src", "pkg/leaf.py", "pkg/leaf.pyi", "pkg/leaf"],
      ["pkg/__init__.pyi"],
      ["pkg/__init__.pyi"],
      [],
      ["pkg/__init__.pyi"],
      [...stubPrelude, "clock", ...stubParent, ...stubLeaf, ...stubParent]
    ],
    [
      true,
      [...pkgMembership, "pkg/leaf.py", "pkg/leaf"],
      ["pkg/__init__.py"],
      ["pkg/__init__.py"],
      [],
      ["pkg/__init__.py"],
      [...pkgInspection, ...relativeLeaf]
    ],
    [
      true,
      ["src", "src/pkg", "src/pkg/__init__.py", "src/pkg/leaf.py", "src/pkg/leaf"],
      ["src/pkg/__init__.py"],
      ["src/pkg/__init__.py"],
      [],
      ["src/pkg/__init__.py"],
      [
        "clock",
        ...srcParent,
        select("src/pkg/__init__.py"),
        ...retainedSrc,
        "parse",
        "inspect:src/pkg/__init__.py",
        "clock",
        ...retainedSrc,
        ...srcLeaf,
        ...retainedSrc
      ]
    ],
    [
      true,
      ["foo.py", "foo", "foo/__init__.py", "src"],
      [],
      [],
      [],
      [],
      ["clock", ...fooSource, select("foo/__init__.py"), ...probe("foo"), ...probe("foo/__init__.py"), ...missingSrc]
    ],
    [
      true,
      ["foo.py", "foo.pyi", "foo", "src"],
      [],
      [],
      [],
      [],
      ["clock", ...fooSource, ...fooStub, ...missingFooPackage, ...missingSrc]
    ],
    [true, [], [], [], [], [], ["clock"]],
    [false, [], [], [], [], [], ["clock", select("foo.py"), "clock"]],
    [true, pkgMembership, [], [], [], [], ["clock", ...searchPkg, select("pkg/__init__.py"), "clock"]],
    [true, pkgMembership, [], [], [], [], ["clock", ...searchPkg, select("pkg/__init__.py"), "clock"]],
    [
      true,
      pkgMembership,
      [],
      [],
      [],
      [],
      ["clock", ...searchPkg, select("pkg/__init__.py"), "clock", "access:pkg/__init__.py"]
    ]
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
      actualFacts = [],
      depth = fixture.depth ?? 4,
      workBudget = fixture.workBudget ?? 40,
      filesBudget = fixture.filesBudget ?? 10,
      readBudget = fixture.readBudget ?? 10000
    const [available, membership, deps, authority, transferred, inspections, expected] = plans[index]
    const expectedFacts = inspections.map((path) => {
      const facts = pythonAdapter.inspect(path, fixture.files[path])
      return facts === undefined ? undefined : sourceFacts(facts)
    })
    const io = createServiceSession({
      invocation: index + 1,
      root,
      now: () => {
        if (started) actual.push("clock")
        return fixture.expired && started ? 5000 : 0
      },
      selectContextPath: (path) => {
        actual.push("select:" + path)
        return path !== fixture.excluded
      },
      access: async (path) => {
        actual.push("access:" + path)
        return fixture.denyCapture ? undefined : { relativePath: path }
      },
      capture: async (selection) => {
        actual.push("capture:" + selection.relativePath)
        const text = await readFile(join(root, selection.relativePath), "utf8")
        return { status: "available", capture: { text, byteLength: Buffer.byteLength(text) } }
      },
      frontend: (path, text, context) => {
        actual.push("inspect:" + path)
        const facts = inspectSourceFrontend(path, text, context)
        actualFacts.push(facts)
        return facts
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
        fixture.rootPath ?? "root.py",
        1024,
        depth,
        s("Remaining", {
          files: s("Nonnegative", { value: filesBudget }),
          read_bytes: s("Nonnegative", { value: readBudget }),
          work: s("Nonnegative", { value: workBudget })
        })
      )
      const state = child.cached_roots(initial, list(fixture.roots ?? [".", "src"]))
      let step = child.resolve_import(
        state,
        state.remaining,
        fixture.from ?? "root.py",
        fixture.import,
        fixture.member,
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
        step = child.resume_import(step, await io.perform(step.request))
      }
      assert.equal(step.$, "python-module/ResolveImportMachine.Returned", fixture.name)
      assert.deepEqual(
        step.resolution.$ === "None"
          ? undefined
          : { path: step.resolution.value.path, name: step.resolution.value.name },
        fixture.target === undefined ? undefined : { path: fixture.target, name: fixture.result },
        fixture.name
      )
      assert.deepEqual(actual, expected, fixture.name + " ordered effects")
      assert.deepEqual(actualFacts, expectedFacts, fixture.name + " complete extraction payload")
      assert.deepEqual(
        unlist(step.session.canonical),
        [fixture.rootPath ?? "root.py", ...transferred],
        fixture.name + " canonical transfer"
      )
      assert.equal(step.session.available, available, fixture.name)
      assert.equal(step.session.work, membership.length, fixture.name)
      assert.deepEqual(unlist(step.session.failed), [], fixture.name + " no retained capture reservation")
      assert.deepEqual(
        child.usage(step.session),
        s("Usage", {
          files: authority.length,
          read_bytes: authority.reduce((bytes, path) => bytes + Buffer.byteLength(fixture.files[path]), 0),
          work: membership.length
        }),
        fixture.name + " exact published usage"
      )

      assert.deepEqual(
        unlist(step.session.membership).map((row) => row.path),
        membership,
        fixture.name
      )
      assert.deepEqual(unlist(step.session.dependencies), deps, fixture.name)
      assert.deepEqual(
        unlist(step.session.authority).map((row) => [row.path, Number(row.bytes)]),
        authority.map((path) => [path, Buffer.byteLength(fixture.files[path])]),
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
        "authored import routes, ordered physical effects, full parser payload, canonical transfer and authority budgets; not whole GraphSession/Canonical acceptance"
    })
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
