import { artifactValueTag, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, writeFile, appendFile, lstat, rm } from "node:fs/promises"
import { join, dirname, sep } from "node:path"
import { pathToFileURL } from "node:url"
import * as Effect from "effect/Effect"
import { languageForPath } from "@hapsland/source-analysis/direct-event/languages/registry"
import { captureStable } from "@hapsland/native-observation/direct-event/capture"
import {
  eligibleNamedPath,
  contextDirectFilePolicy,
  selectedByDirectFilePolicy,
  DEFAULT_DIRECT_FILE_POLICY
} from "@hapsland/native-observation/direct-event/selection"
import { createServiceSession } from "../../service-session.ts"
import { inspectSourceFrontend, parsePythonSyntax, parseCargoSyntax } from "../../frontends.ts"
import { sourceFacts } from "../../frontend-codec.ts"
const t = (name, fields = {}) => ({ $: artifactValueTag(name) ?? "Types." + name, ...fields }),
  s = (name, fields = {}) => ({ $: "python-module/Session." + name, ...fields }),
  p = (name, fields = {}) => ({ $: "python-module/PreparationMachine." + name, ...fields })
const pythonAdapter = languageForPath("root.py")
assert.ok(pythonAdapter, "native Python parser is registered")
const temp = await mkdtemp("/tmp/hapsland-python-persistent-session-")
const limits = {
  version: 1,
  files: 8,
  sourceBytes: 2048,
  treeBytes: 100000,
  readBytes: 20000,
  depth: 4,
  work: 80,
  outgoingEdges: 40
}
const remaining = { files: 7, readBytes: 19000, work: 80 }
const bounded = (child, budget) =>
  s("Remaining", {
    files: child.difference(Number(Math.max(0, budget.files)), Number(Math.max(0, -budget.files))),
    read_bytes: child.difference(Number(Math.max(0, budget.readBytes)), Number(Math.max(0, -budget.readBytes))),
    work: child.difference(Number(Math.max(0, budget.work)), Number(Math.max(0, -budget.work)))
  })
try {
  const emitted = join(temp, "child.mjs")
  execFileSync("taskset", ["-c", "10", "bend", join(import.meta.dirname, "../../PythonModule.bend"), "-o", emitted], {
    timeout: 10000
  })
  const { default: child } = await import(pathToFileURL(emitted))
  const fixtures = [
    {
      name: "persistent-transfer",
      files: { "pkg/__init__.py": "class Foo:\n id: str\n" },
      calls: [
        ["pkg", "Foo"],
        ["pkg", "Foo"]
      ]
    },
    {
      name: "persistent-reexport",
      files: { "pkg/__init__.py": "from .leaf import Foo", "pkg/leaf.py": "class Foo:\n id: str\n" },
      calls: [
        ["pkg", "Foo"],
        ["pkg", "Foo"]
      ]
    },
    {
      name: "declared-root",
      files: {
        "pyproject.toml": 'tool.setuptools.package-dir={""="lib"}',
        "lib/pkg/__init__.py": "from .leaf import Foo",
        "lib/pkg/leaf.py": ""
      },
      calls: [
        ["pkg", "Foo"],
        ["pkg", "Foo"]
      ]
    },
    {
      name: "missing-membership-becomes-present",
      files: { "pkg/__init__.py": "from .leaf import Foo" },
      calls: [["pkg", "Foo"]],
      mutate: ["pkg/leaf.py", "class Foo:\n id: str\n"]
    },
    {
      name: "authority-changed",
      files: { "pkg/__init__.py": "from .leaf import Foo", "pkg/leaf.py": "" },
      calls: [["pkg", "Foo"]],
      mutate: ["pkg/__init__.py", "class Changed:\n id: int\n"]
    },
    {
      name: "conflicting-root-metadata",
      files: { "setup.cfg": "[metadata]" },
      calls: [
        ["pkg", "Foo"],
        ["pkg", "Foo"]
      ]
    },
    {
      name: "unstable-capture-reservation",
      unstableCapture: true,
      files: { "pkg/__init__.py": "from .leaf import Foo", "pkg/leaf.py": "" },
      calls: [
        ["pkg", "Foo"],
        ["pkg", "Foo"]
      ]
    },
    { name: "expired-terminal", files: { "foo.py": "" }, calls: [["foo", "Foo"]], expiredTerminal: true },
    {
      name: "terminal-work-refusal",
      files: { "foo.py": "" },
      calls: [["foo", "Foo"]],
      terminalBudget: { files: 7, readBytes: 19000, work: 0 }
    }
  ]
  // Finite authored session expectations. No import discovery or graph traversal:
  // these fixtures name each authority, resolution, debit and physical IO prefix.
  const init = "pkg/__init__.py",
    leaf = "pkg/leaf.py",
    project = "pyproject.toml",
    libInit = "lib/pkg/__init__.py"
  const stateFacts = (files, readBytes, work, dependencies = []) => ({
    usage: { files, readBytes, work },
    dependencies,
    cachePaths: ["root.py", ...dependencies]
  })
  const read = (path) => [
    ["capture", path],
    ["source-read", path],
    ["source-read", path]
  ]
  const resolution = (path) => (path === undefined ? undefined : { path, name: "Foo" })
  const step = (facts, effects, path) => ({ facts, effects, resolution: resolution(path) })
  const authority = stateFacts(1, 21, 10, [init])
  const reexport = step(authority, [10, ...read(init), 4], leaf)
  const unchangedResolution = step(authority, [2], leaf)
  const expected = {
    "persistent-transfer": {
      imports: [
        step(stateFacts(0, 0, 8, [init]), [10, ...read(init), 1], init),
        step(stateFacts(0, 0, 8, [init]), [3], init)
      ],
      terminal: { valid: true, facts: stateFacts(0, 0, 16, [init]), effects: [9] }
    },
    "persistent-reexport": {
      imports: [reexport, unchangedResolution],
      terminal: { valid: true, facts: stateFacts(1, 21, 20, [init]), effects: [11] }
    },
    "declared-root": {
      imports: [
        step(
          stateFacts(2, 59, 16, [project, libInit]),
          [3, ...read(project), 13, ...read(libInit), 6],
          "lib/pkg/leaf.py"
        ),
        step(stateFacts(2, 59, 16, [project, libInit]), [2], "lib/pkg/leaf.py")
      ],
      terminal: { valid: true, facts: stateFacts(2, 59, 32, [project, libInit]), effects: [17] }
    },
    "missing-membership-becomes-present": {
      imports: [step(stateFacts(1, 21, 11, [init]), [10, ...read(init), 5])],
      terminal: { valid: false, facts: stateFacts(1, 21, 17, [init]), effects: [6] }
    },
    "authority-changed": {
      imports: [reexport],
      terminal: { valid: false, facts: stateFacts(1, 21, 17, [init]), effects: [7] }
    },
    "conflicting-root-metadata": {
      imports: [step(stateFacts(0, 0, 3), [4]), step(stateFacts(0, 0, 3), [1])],
      terminal: { valid: true, facts: stateFacts(0, 0, 6), effects: [4] }
    },
    "unstable-capture-reservation": {
      imports: [step(stateFacts(1, 2048, 8), [10, ...read(init)]), step(stateFacts(1, 2048, 8), [1])],
      terminal: { valid: false, facts: stateFacts(1, 2048, 15), effects: [7] }
    },
    "expired-terminal": {
      imports: [step(stateFacts(0, 0, 6), [7], "foo.py")],
      terminal: { valid: false, facts: stateFacts(0, 0, 6), effects: [1] }
    },
    "terminal-work-refusal": {
      imports: [step(stateFacts(0, 0, 6), [7], "foo.py")],
      terminal: { valid: false, facts: stateFacts(0, 0, 6), effects: [1] }
    }
  }
  assert.deepEqual(
    Object.keys(expected),
    fixtures.map((fixture) => fixture.name),
    "every fixture has authored expectations"
  )
  let requests = 0,
    resolutions = 0,
    inspections = 0
  for (const [index, fixture] of fixtures.entries()) {
    const expectation = expected[fixture.name]
    assert.equal(expectation.imports.length, fixture.calls.length)
    const root = join(temp, String(index))
    await mkdir(root)
    execFileSync("git", ["init", "-q", root], { timeout: 5000 })
    await writeFile(join(root, "root.py"), "from pkg import Foo\nclass Root:\n value: Foo\n")
    for (const [path, text] of Object.entries(fixture.files)) {
      await mkdir(dirname(join(root, path)), { recursive: true })
      await writeFile(join(root, path), text)
    }
    const rootStat = await lstat(root),
      gitStat = await lstat(join(root, ".git")),
      rootIdentity = {
        rootDevice: String(rootStat.dev),
        rootInode: String(rootStat.ino),
        gitDirectory: join(root, ".git"),
        gitDevice: String(gitStat.dev),
        gitInode: String(gitStat.ino)
      }
    const policy = DEFAULT_DIRECT_FILE_POLICY,
      contextPolicy = contextDirectFilePolicy(policy)
    const selected = await Effect.runPromise(eligibleNamedPath(root, "root.py", policy, rootIdentity))
    assert.ok(selected)
    const rootResult = await Effect.runPromise(captureStable(root, selected, {}, rootIdentity, limits.sourceBytes))
    assert.equal(rootResult.status, "captured")
    const rootCapture = rootResult.capture
    const traces = { candidate: [] },
      caches = { candidate: new Map() }
    let elapsed = 0,
      started = false
    const hooks = (lane) => ({
      sourceRead: (path) => traces[lane].push(["source-read", path]),
      ...(fixture.unstableCapture
        ? {
            betweenReads: () =>
              Effect.promise(() => appendFile(join(root, "pkg/__init__.py"), "\n# changed between reads\n"))
          }
        : {})
    })
    const io = createServiceSession({
      invocation: index + 1,
      root,
      callerCache: caches.candidate,
      now: () => {
        if (started) traces.candidate.push(["clock"])
        return elapsed
      },
      access: (path, { signal } = {}) =>
        Effect.runPromise(eligibleNamedPath(root, path, contextPolicy, rootIdentity), { signal }),
      capture: (selection, cap, { signal } = {}) => {
        traces.candidate.push(["capture", selection.relativePath])
        return Effect.runPromise(captureStable(root, selection, hooks("candidate"), rootIdentity, cap), { signal })
      },
      frontend: inspectSourceFrontend,
      parsePythonSyntax,
      parseCargo: parseCargoSyntax,
      selectContextPath: (path) => selectedByDirectFilePolicy(path, contextPolicy)
    })
    try {
      const clock = (await io.perform(t("Request", { invocation: index + 1, id: 0, operation: t("StartClock") })))
        .outcome.clock
      started = true
      const rootToken = io.registerCapture(rootCapture)
      async function drive(step, resume) {
        while (step.$.endsWith(".Await")) {
          requests++
          step = resume(step, await io.perform(step.request))
        }
        assert.ok(step.$.endsWith(".Returned"), step.$)
        return step
      }
      const preparation = await drive(
        child.prepare_session(
          p("Input", {
            root: "root.py",
            capture: rootToken,
            root_bytes: Number(rootCapture.byteLength),
            files: Number(limits.files),
            read_bytes: Number(limits.readBytes),
            work: Number(limits.work),
            source_cap: Number(limits.sourceBytes),
            depth: Number(limits.depth),
            clock,
            invocation: Number(index + 1),
            caller_cache: io.callerCache
          }),
          1
        ),
        child.resume_preparation
      )
      assert.equal(preparation.prepared.$, "Some", fixture.name)
      let state = preparation.prepared.value.session,
        next = preparation.next
      const cache = preparation.prepared.value.cache
      const expectedTrace = []
      const priorCache = new Map()
      function compare(facts, effects = []) {
        for (const effect of effects)
          expectedTrace.push(
            ...(typeof effect === "number" ? Array.from({ length: effect }, () => ["clock"]) : [effect])
          )
        const used = child.session_usage(state)
        assert.deepEqual(
          { files: Number(used.files), readBytes: Number(used.read_bytes), work: Number(used.work) },
          facts.usage,
          fixture.name + " authority debit"
        )
        assert.deepEqual(unlist(state.dependencies), facts.dependencies, fixture.name + " ordered dependencies")
        assert.deepEqual(traces.candidate, expectedTrace, fixture.name + " exact physical capture/clock prefix")
        assert.deepEqual([...caches.candidate.keys()], facts.cachePaths, fixture.name + " cache publications")
        assert.equal(caches.candidate.get("root.py"), rootCapture, fixture.name + " original root identity")
        for (const [path, capture] of caches.candidate) {
          const text = path === "root.py" ? rootCapture.text : fixture.files[path]
          assert.equal(capture.text, text)
          assert.equal(capture.byteLength, Buffer.byteLength(text))
          assert.equal(capture.contentHash, createHash("sha256").update(text).digest("hex"))
          if (priorCache.has(path))
            assert.equal(capture, priorCache.get(path), fixture.name + " retained capture identity")
          priorCache.set(path, capture)
        }
      }
      const preparedFacts = stateFacts(0, 0, 0)
      compare(preparedFacts, [1])
      for (const branch of ["type", "function"]) {
        const expected = branch === "type" ? pythonAdapter.inspect("root.py", rootCapture.text) : undefined
        const actual = await drive(
          child.inspect_session(
            t(branch === "type" ? "TypeBranch" : "FunctionBranch"),
            "root.py",
            "root.py",
            rootToken,
            Number(index + 1),
            next
          ),
          child.resume_inspect
        )
        next = actual.next
        assert.deepEqual(
          actual.facts.$ === "None" ? undefined : actual.facts.value,
          expected === undefined ? undefined : sourceFacts(expected),
          fixture.name + " root inspect " + branch
        )
        inspections++
        compare(preparedFacts)
      }
      for (const [callIndex, [module, member]] of fixture.calls.entries()) {
        const actual = await drive(
          child.resolve_import(
            state,
            bounded(child, remaining),
            "root.py",
            module,
            member,
            "root.py",
            clock,
            cache,
            sep,
            Number(index + 1),
            next
          ),
          child.resume_import
        )
        state = actual.session
        next = actual.next_request
        const wanted = expectation.imports[callIndex]
        assert.deepEqual(
          actual.resolution.$ === "None"
            ? undefined
            : { path: actual.resolution.value.path, name: actual.resolution.value.name },
          wanted.resolution,
          fixture.name + " import resolution"
        )
        resolutions++
        compare(wanted.facts, wanted.effects)
      }
      if (fixture.mutate) {
        await writeFile(join(root, fixture.mutate[0]), fixture.mutate[1])
      }
      if (fixture.expiredTerminal) elapsed = 5000
      const terminal = fixture.terminalBudget ?? remaining
      const actual = await drive(
        child.revalidate(child.session_remaining(state, bounded(child, terminal)), clock, sep, Number(index + 1), next),
        child.resume_revalidation
      )
      state = actual.session
      assert.equal(actual.valid, expectation.terminal.valid, fixture.name + " terminal revalidation")
      compare(expectation.terminal.facts, expectation.terminal.effects)
    } finally {
      await io.close()
    }
  }
  console.log(
    JSON.stringify({
      passed: true,
      status: "PASS",
      cases: fixtures.length,
      requests,
      resolutions,
      inspections,
      scope:
        "actual Bend persistent session against authored preparation/inspection/import/usage/revalidation expectations; actual eligibleNamedPath/captureStable/cache/physical mutation; not resolver/Canonical acceptance"
    })
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
