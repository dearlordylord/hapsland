import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, writeFile, readFile, lstat, rm, symlink } from "node:fs/promises"
import { join, dirname, relative, isAbsolute, sep, normalize } from "node:path"
import { pathToFileURL } from "node:url"
import {
  createServiceSession,
  unlist
} from "../../../packages/source-analysis/src/direct-event/graph-resolution/service-session.mjs"
import {
  inspectSourceFrontend,
  parsePythonSyntax
} from "../../../packages/source-analysis/src/direct-event/graph-resolution/frontends.mjs"
import { pythonAdapter } from "../../../packages/source-analysis/dist/direct-event/languages/python.js"
import { sourceFacts } from "../../../packages/source-analysis/src/direct-event/graph-resolution/frontend-codec.mjs"
import { Parser, Python } from "../../../packages/source-analysis/dist/direct-event/languages/native-parser.js"
import { projectPythonSyntax } from "../../../packages/source-analysis/src/direct-event/graph-resolution/python-module/syntax-projection.mjs"
const t = (name, fields = {}) => ({ $: "Types." + name, ...fields }),
  s = (name, fields = {}) => ({ $: "python-module/Session." + name, ...fields })
const temp = await mkdtemp("/tmp/hapsland-python-parents-")
try {
  const emitted = join(temp, "child.mjs")
  execFileSync(
    "taskset",
    [
      "-c",
      "10",
      "bend",
      join(
        import.meta.dirname,
        "../../../packages/source-analysis/src/direct-event/graph-resolution/PythonModule.bend"
      ),
      "-o",
      emitted
    ],
    { timeout: 5000 }
  )
  const { default: child } = await import(pathToFileURL(emitted))
  const native = await readFile(
    join(import.meta.dirname, "../../../packages/source-analysis/src/direct-event/languages/python-module-context.ts"),
    "utf8"
  )
  const body = native
    .slice(native.indexOf("    const candidates ="), native.indexOf("    const validateAuthority:"))
    .replaceAll(/Effect.fn\("Python\.(?:moduleAlternatives|packageParents|moduleTarget)"\)\(function\*/g, "(function*")
    .replace('Effect.fn("Python.resolveImport")(', "(")
    .replaceAll("!available", "!isAvailable()")
  const js = execFileSync(
    "bun",
    ["-e", 'process.stdout.write(new Bun.Transpiler({loader:"ts"}).transformSync(await Bun.stdin.text()))'],
    { input: body, encoding: "utf8", timeout: 5000 }
  )
  const referenceFactory = Function(
    "dirname",
    "relative",
    "within",
    "limits",
    "join",
    "normalize",
    "sep",
    "stat",
    "readAuthority",
    "staticPackageAuthority",
    "isAvailable",
    "absoluteRoots",
    "rootPath",
    "host",
    "selectedByDirectFilePolicy",
    "policyFor",
    "permit",
    "inspectPython",
    "hasPackageBinding",
    "authority",
    "canonicalCaptures",
    "let remaining;" + js + "\nreturn resolveImport"
  )
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
    let available = true,
      work = 0,
      started = false
    const membership = new Map(),
      authority = new Map(),
      canonical = new Set([fixture.rootPath ?? "root.py"]),
      captureCache = new Map(),
      failedCaptures = new Set(),
      deps = [],
      expected = [],
      actual = [],
      expectedFacts = [],
      actualFacts = [],
      depth = fixture.depth ?? 4,
      workBudget = fixture.workBudget ?? 40,
      filesBudget = fixture.filesBudget ?? 10,
      readBudget = fixture.readBudget ?? 10000
    const within = (path) => !isAbsolute(path) && path !== ".." && !path.startsWith(".." + sep),
      selected = (path) => path !== fixture.excluded
    const permit = (reserveFiles = 0, reserveBytes = 0) => {
      if (!available) return false
      expected.push("clock")
      return (
        !fixture.expired &&
        work <= workBudget &&
        authority.size + failedCaptures.size + reserveFiles <= filesBudget &&
        [...authority.values()].reduce((sum, c) => sum + c.byteLength, 0) + failedCaptures.size * 1024 + reserveBytes <=
          readBudget
      )
    }
    function* observe(path) {
      if (membership.has(path)) return membership.get(path)
      if (!within(path) || !permit() || work >= workBudget) {
        available = false
        return undefined
      }
      work++
      expected.push("probe:" + path)
      let status
      try {
        status = yield lstat(join(root, path))
      } catch (error) {
        if (error.code !== "ENOENT") available = false
      }
      if (status?.isSymbolicLink()) available = false
      membership.set(path, status)
      return status
    }
    function* stat(path) {
      if (!within(path)) {
        available = false
        return undefined
      }
      expected.push("select:" + path)
      if (!selected(path)) {
        available = false
        return undefined
      }
      const dirs = []
      let directory = dirname(path)
      while (directory !== ".") {
        if (dirs.length > depth + 1) {
          available = false
          return undefined
        }
        dirs.push(directory)
        directory = dirname(directory)
      }
      for (const dir of dirs.reverse()) {
        const status = yield* observe(dir)
        if (!available || !status) return undefined
        if (!status.isDirectory()) {
          available = false
          return undefined
        }
      }
      return yield* observe(path)
    }
    function* readAuthority(path) {
      if (authority.has(path)) return authority.get(path)
      if (failedCaptures.has(path)) return undefined
      let capture = captureCache.get(path)
      if (canonical.has(path)) return permit() ? capture : undefined
      if (!permit(1, capture?.byteLength ?? 1024)) return undefined
      expected.push("access:" + path)
      if (fixture.denyCapture) return undefined
      if (!capture) {
        failedCaptures.add(path)
        expected.push("capture:" + path)
        const text = yield readFile(join(root, path), "utf8")
        capture = { text, byteLength: Buffer.byteLength(text) }
        failedCaptures.delete(path)
        captureCache.set(path, capture)
      }
      if (capture.byteLength > 1024 || !permit(1, capture.byteLength)) return undefined
      authority.set(path, capture)
      if (!deps.includes(path)) deps.push(path)
      return capture
    }
    // Parser engines are reused; policy is independently evaluated by the exact
    // production authority consumer above, while this reference isolates chronology.
    const staticPackageAuthority = (text) => {
      expected.push("parse")
      const parser = new Parser()
      try {
        parser.setLanguage(Python)
        return child.static_package_authority(projectPythonSyntax(parser.parse(text).rootNode))
      } finally {
        parser.reset()
      }
    }
    const reference = referenceFactory(
      dirname,
      relative,
      within,
      { depth },
      join,
      normalize,
      sep,
      stat,
      readAuthority,
      staticPackageAuthority,
      () => available,
      function* () {
        return fixture.roots ?? [".", "src"]
      },
      fixture.rootPath ?? "root.py",
      {
        *selectContextPath(path) {
          return selected(path) ? { relativePath: path } : undefined
        }
      },
      (path) => {
        expected.push("select:" + path)
        return selected(path)
      },
      () => undefined,
      permit,
      (path, text) => {
        expected.push("inspect:" + path)
        const facts = pythonAdapter.inspect(path, text)
        expectedFacts.push(facts === undefined ? undefined : sourceFacts(facts))
        return facts
      },
      (text, name) => {
        const parser = new Parser()
        try {
          parser.setLanguage(Python)
          return child.has_package_binding(projectPythonSyntax(parser.parse(text).rootNode), name)
        } finally {
          parser.reset()
        }
      },
      authority,
      canonical
    )
    const gen = reference(fixture.from ?? "root.py", fixture.import, fixture.member, {
      files: filesBudget,
      readBytes: readBudget,
      work: workBudget
    })
    let it = gen.next()
    while (!it.done) {
      try {
        it = gen.next(await it.value)
      } catch (error) {
        it = gen.throw(error)
      }
    }
    assert.deepEqual(
      it.value,
      fixture.target === undefined ? undefined : { path: fixture.target, name: fixture.result },
      fixture.name + " fixture"
    )
    const io = createServiceSession({
      invocation: index + 1,
      root,
      now: () => {
        if (started) actual.push("clock")
        return fixture.expired && started ? 5000 : 0
      },
      selectContextPath: (path) => {
        actual.push("select:" + path)
        return selected(path)
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
        1024n,
        BigInt(depth),
        s("Remaining", {
          files: s("Nonnegative", { value: BigInt(filesBudget) }),
          read_bytes: s("Nonnegative", { value: BigInt(readBudget) }),
          work: s("Nonnegative", { value: BigInt(workBudget) })
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
        BigInt(index + 1),
        2n
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
        it.value,
        fixture.name
      )
      assert.deepEqual(actual, expected, fixture.name + " ordered effects")
      assert.deepEqual(actualFacts, expectedFacts, fixture.name + " complete extraction payload")
      assert.deepEqual(unlist(step.session.canonical), [...canonical], fixture.name + " canonical transfer")
      assert.equal(step.session.available, available, fixture.name)
      assert.equal(step.session.work, BigInt(work), fixture.name)
      assert.deepEqual(
        unlist(step.session.membership).map((row) => row.path),
        [...membership.keys()],
        fixture.name
      )
      assert.deepEqual(unlist(step.session.dependencies), deps, fixture.name)
      assert.deepEqual(
        unlist(step.session.authority).map((row) => [row.path, Number(row.bytes)]),
        [...authority].map(([path, capture]) => [path, capture.byteLength]),
        fixture.name
      )
    } finally {
      await io.close()
    }
  }
  console.log(
    JSON.stringify({
      status: "PASS",
      cases: fixtures.length,
      requests,
      scope:
        "whole resolveImport/native ordered effects and full SourceFacts payload, cached roots, physical membership/syntax, injected capture/selection; not full GraphSession/Canonical acceptance"
    })
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
