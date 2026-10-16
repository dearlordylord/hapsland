import { goPreparationExpectation } from "./go-preparation-expectations.mjs"
import { artifactTransport } from "./artifact-check-codec.mjs"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, writeFile, lstat, rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Cause from "effect/Cause"
import { resolveCanonicalGraphFixture } from "@hapsland/source-analysis/testing/canonical-graph"
import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-limits"
import { captureStable } from "@hapsland/native-observation/direct-event/capture"
import {
  DEFAULT_DIRECT_FILE_POLICY,
  contextDirectFilePolicy,
  eligibleNamedPath
} from "@hapsland/native-observation/direct-event/selection"
import { unlist, fromProductValue } from "@hapsland/source-artifacts/direct-event/value/codec"
import { createServiceSession } from "../service-session.ts"
const temp = await mkdtemp("/tmp/hapsland-go-preparation-")
const t = (name, fields = {}) => ({ $: "Types." + name, ...fields })
const label = (value) => value.$.split(".").at(-1)
const rootText = "package p\ntype Root int\n"
const fixtures = [
  { name: "single", files: { "root.go": rootText } },
  { name: "sibling", files: { "root.go": "package p\ntype Root Other\n", "other.go": "package p\ntype Other int\n" } },
  {
    name: "module-import",
    files: {
      "root.go": 'package p\nimport "example/lib"\ntype Root lib.T\n',
      "go.mod": "module example\n",
      "lib/lib.go": "package lib\ntype T int\n"
    }
  },
  {
    name: "foreign-constant",
    files: {
      "root.go": 'package p\nimport "example/lib"\ntype Root [C]int\nconst C lib.T = 1\n',
      "go.mod": "module example\n",
      "lib/lib.go": "package lib\ntype T int\n"
    }
  },
  { name: "module-unavailable", files: { "root.go": rootText, "go.mod": "replace x => y\nmodule example\n" } },
  { name: "workspace", files: { "root.go": rootText, "go.work": "go 1.22\n", "go.mod": "module example\n" } },
  { name: "mixed-package", files: { "root.go": rootText, "other.go": "package q\ntype Other int\n" } },
  { name: "generated", files: { "root.go": "// Code generated test DO NOT EDIT.\n" + rootText } },
  { name: "cgo", files: { "root.go": 'package p\nimport "C"\ntype Root int\n' } },
  { name: "unknown-build", files: { "root.go": "//go:build cgo\n" + rootText } },
  {
    name: "active-build",
    configuration: { goos: "linux", goarch: "amd64", tags: ["a", "a"] },
    files: { "root.go": "//go:build linux\n" + rootText }
  },
  {
    name: "inactive-sibling",
    configuration: { goos: "linux", goarch: "amd64", tags: [] },
    files: { "root.go": rootText, "s_windows.go": "package other\n" }
  },
  {
    name: "invalid-target",
    configuration: { goos: "bogus", goarch: "amd64", tags: [] },
    files: { "root.go": rootText }
  },
  {
    name: "invalid-tag",
    configuration: { goos: "linux", goarch: "amd64", tags: ["cgo"] },
    files: { "root.go": rootText }
  },
  {
    name: "function",
    branch: "function",
    configuration: { goos: "bogus", goarch: "amd64", tags: [] },
    files: { "root.go": rootText }
  },
  ...[0, 1, 2, 3, 4, 8, 20].map((work) => ({ name: `work-${work}`, limits: { work }, files: { "root.go": rootText } })),
  { name: "files-zero", limits: { files: 0 }, files: { "root.go": rootText } },
  {
    name: "files-one-sibling",
    limits: { files: 1 },
    files: { "root.go": rootText, "other.go": "package p\ntype Other int\n" }
  },
  { name: "source-cap", limits: { sourceBytes: 5 }, files: { "root.go": rootText } },
  { name: "read-cap", limits: { readBytes: 5 }, files: { "root.go": rootText } },
  { name: "deadline", expired: true, files: { "root.go": rootText } },
  { name: "no-caller-cache", noCache: true, files: { "root.go": rootText, "go.mod": "module example\n" } },
  { name: "nested-root", path: "sub/root.go", files: { "sub/root.go": rootText, "go.mod": "module example\n" } },
  {
    name: "depth-zero",
    path: "sub/root.go",
    limits: { depth: 0 },
    files: { "sub/root.go": rootText, "go.mod": "module example\n" }
  },
  ...[
    "module example\r\n",
    "module example // trailing\r\n",
    "module example\n/* block */",
    "module example\nuseα x\n",
    "module example\nmodule other\n",
    "module /example\n",
    "module example//comment\n",
    "module example\u2028// comment\n",
    "\ufeffmodule example\n",
    "module example\nreplace x => y\n"
  ].map((metadata, index) => ({
    name: `module-grammar-${index}`,
    files: {
      "root.go": 'package p\nimport "example/lib"\ntype Root lib.T\n',
      "go.mod": metadata,
      "lib/lib.go": "package lib\ntype T int\n"
    }
  })),
  {
    name: "nested-module",
    files: {
      "root.go": 'package p\nimport "example/lib"\ntype Root lib.T\n',
      "go.mod": "module example\n",
      "lib/go.mod": "module independent\n",
      "lib/lib.go": "package lib\ntype T int\n"
    }
  },
  {
    name: "internal-allowed",
    files: {
      "root.go": 'package p\nimport "example/internal/lib"\ntype Root lib.T\n',
      "go.mod": "module example\n",
      "internal/lib/lib.go": "package lib\ntype T int\n"
    }
  },
  {
    name: "internal-denied",
    files: {
      "root.go": 'package p\nimport "example/else/internal/lib"\ntype Root lib.T\n',
      "go.mod": "module example\n",
      "else/internal/lib/lib.go": "package lib\ntype T int\n"
    }
  },
  {
    name: "import-main",
    files: {
      "root.go": 'package p\nimport "example/lib"\ntype Root main.T\n',
      "go.mod": "module example\n",
      "lib/lib.go": "package main\ntype T int\n"
    }
  },
  {
    name: "duplicate-alias",
    files: {
      "root.go": 'package p\nimport ( x "example/a"; x "example/b" )\ntype Root x.T\n',
      "go.mod": "module example\n",
      "a/a.go": "package a\ntype T int\n",
      "b/b.go": "package b\ntype T int\n"
    }
  },
  {
    name: "shadowed-alias",
    files: {
      "root.go": 'package p\nimport x "example/lib"\ntype Root x.T\n',
      "shadow.go": "package p\nvar x int\n",
      "go.mod": "module example\n",
      "lib/lib.go": "package lib\ntype T int\n"
    }
  },
  {
    name: "unicode-exported",
    files: {
      "root.go": 'package p\nimport α "example/lib"\ntype Root α.Τ\nconst C = α.Τ(1)\n',
      "go.mod": "module example\n",
      "lib/lib.go": "package lib\ntype Τ int\n"
    }
  },
  {
    name: "private-constant",
    files: {
      "root.go": 'package p\nimport "example/lib"\ntype Root [lib.c]int\n',
      "go.mod": "module example\n",
      "lib/lib.go": "package lib\nconst c = 1\n"
    }
  },
  {
    name: "import-cycle",
    files: {
      "root.go": 'package p\nimport "example/lib"\ntype Root lib.T\n',
      "go.mod": "module example\n",
      "lib/lib.go": 'package lib\nimport "example"\ntype T p.Root\n'
    }
  },
  {
    name: "ignored-imports",
    files: {
      "root.go": 'package p\nimport (_ "example/lib"; . "example/lib")\ntype Root int\n',
      "go.mod": "module example\n",
      "lib/lib.go": "package lib\ntype T int\n"
    }
  },
  {
    name: "excluded-sibling",
    excluded: ["other.go"],
    files: { "root.go": rootText, "other.go": "package p\ntype Other int\n" }
  },
  { name: "excluded-module", excluded: ["go.mod"], files: { "root.go": rootText, "go.mod": "module example\n" } },
  ...[128, 129].map((count) => ({
    name: `inventory-${count}`,
    files: Object.fromEntries([
      ["root.go", rootText],
      ...Array.from({ length: count - 2 }, (_, i) => [`file${i}.txt`, ""])
    ])
  })),
  {
    name: "utf16-order",
    files: {
      "root.go": rootText,
      "\u{10000}.go": "package p\ntype Supplementary int\n",
      "\ue000.go": "package p\ntype BMP int\n"
    }
  }
]
try {
  const output = join(temp, "go-artifact.mjs")
  execFileSync("bend", [join(import.meta.dirname, "../composition/GoArtifact.bend"), "-o", output], { timeout: 10000 })
  const core = (await import(pathToFileURL(output))).default
  const wholeFailures = []
  let canonicalCases = 0,
    requests = 0,
    transitions = 0
  for (const [index, fixture] of fixtures.entries()) {
    console.log(JSON.stringify({ goFixture: fixture.name }))
    const root = join(temp, String(index))
    await mkdir(root)
    execFileSync("git", ["init", "-q", root], { timeout: 5000 })
    for (const [path, source] of Object.entries(fixture.files)) {
      await mkdir(dirname(join(root, path)), { recursive: true })
      await writeFile(join(root, path), source)
    }
    const rootStat = await lstat(root),
      gitStat = await lstat(join(root, ".git"))
    const rootIdentity = {
      rootDevice: String(rootStat.dev),
      rootInode: String(rootStat.ino),
      gitDirectory: join(root, ".git"),
      gitDevice: String(gitStat.dev),
      gitInode: String(gitStat.ino)
    }
    const path = fixture.path ?? "root.go",
      branch = fixture.branch ?? "type"
    const policy = fixture.excluded
      ? { ...DEFAULT_DIRECT_FILE_POLICY, contextExcludes: fixture.excluded }
      : DEFAULT_DIRECT_FILE_POLICY
    const limits = {
      version: 1,
      sourceBytes: 2097152,
      treeBytes: 4194304,
      files: 32,
      readBytes: 16777216,
      outgoingEdges: 32,
      depth: 8,
      work: 500,
      ...fixture.limits
    }
    const selected = await Effect.runPromise(eligibleNamedPath(root, path, policy, rootIdentity))
    assert.ok(selected)
    const captured = await Effect.runPromise(captureStable(root, selected, {}, rootIdentity, 2097152))
    assert.equal(captured.status, "captured")
    const rootCapture = captured.capture,
      events = [],
      cache = fixture.noCache ? undefined : new Map(),
      hashInputs = [],
      capturedValues = new Map()
    const expected = goPreparationExpectation(fixture, limits)
    let started = false,
      actualError
    const io = createServiceSession({
      invocation: index + 1,
      root,
      callerCache: cache,
      readGoConfiguration: () => fixture.configuration,
      readAnalysisConfigurationIdentity: () => undefined,
      now: () => {
        if (started) events.push(["clock"])
        return started && fixture.expired ? 5000 : 0
      },
      access: (path, { signal } = {}) =>
        Effect.runPromise(eligibleNamedPath(root, path, contextDirectFilePolicy(policy), rootIdentity), { signal }),
      capture: (selection, cap, { signal } = {}) => {
        events.push(["capture", selection.relativePath])
        return Effect.runPromise(
          captureStable(root, selection, { sourceRead: (path) => events.push(["read", path]) }, rootIdentity, cap),
          { signal }
        ).then((result) => {
          if (result.status === "captured") capturedValues.set(selection.relativePath, result.capture)
          return result
        })
      }
    })
    try {
      const clock = (await io.perform(t("Request", { invocation: index + 1, id: 0, operation: t("StartClock") })))
        .outcome.clock
      started = true
      let state = core.begin(
        artifactTransport({
          $: "ArtifactProtocol.GoPrepare",
          input: {
            $: "ArtifactProtocol.Input",
            invocation: index + 1,
            next_request: 1,
            root_path: path,
            root_capture: io.registerCapture(rootCapture),
            root_bytes: rootCapture.byteLength,
            branch: t(branch === "function" ? "FunctionBranch" : "TypeBranch"),
            clock,
            caller_cache: io.callerCache,
            limits: {
              $: "../../../../agent-flow-bend/ImportGraph.Limits",
              version: 1,
              source_bytes: limits.sourceBytes,
              tree_bytes: limits.treeBytes,
              files: limits.files,
              read_bytes: limits.readBytes,
              outgoing_edges: limits.outgoingEdges,
              depth: limits.depth,
              work: limits.work
            },
            configuration: { $: "None" },
            configuration_identity: { $: "None" }
          }
        })
      )
      let view,
        next = 1
      for (;;) {
        view = artifactTransport(core.view(state), false)
        if (label(view) === "GoContinue") {
          transitions++
          assert.ok(transitions < 1000000)
          state = core.advance(state)
          continue
        }
        if (label(view) !== "GoAwait") break
        requests++
        assert.equal(view.request.id, next++, fixture.name + " request successor")
        if (view.request.operation.$ === "Types.HashJsonProduct")
          hashInputs.push(fromProductValue(view.request.operation.value))
        state = core.resume(state, artifactTransport(await io.perform(view.request)))
      }
      if (label(view) === "GoFailed" && view.failure.exception) throw io.exception(view.failure.exception)
      assert.equal(label(view), "GoReturned", fixture.name)
      const prepared = label(view.result) === "GoPrepared" ? view.result.prepared : undefined
      assert.equal(expected.error, undefined, fixture.name + " expected RangeError")
      assert.equal(Boolean(prepared), expected.prepared, fixture.name + " preparation admission")
      assert.equal(view.next, next, fixture.name + " terminal successor")
      if (prepared) {
        assert.deepEqual(
          {
            declarations: unlist(prepared.declarations).map(({ key, declaration }) => ({
              key,
              value: declaration.value,
              location: declaration.location
            })),
            dependencies: unlist(prepared.dependencies),
            limits: prepared.limits,
            fingerprint: prepared.binding_fingerprint
          },
          {
            declarations: expected.declarations,
            dependencies: expected.dependencies,
            limits: expected.limits,
            fingerprint: expected.fingerprint
          },
          fixture.name + " complete prepared facts"
        )
        for (const [inspectPath, branch, present] of [
          [path, "TypeBranch", true],
          [path + ".other", "TypeBranch", false],
          [path, "FunctionBranch", false]
        ]) {
          const inspected = core.begin(
            artifactTransport({ $: "ArtifactProtocol.GoInspect", prepared, path: inspectPath, branch: t(branch), next })
          )
          const inspectedView = artifactTransport(core.view(inspected), false)
          assert.equal(label(inspectedView.result), "GoInspected")
          assert.equal(inspectedView.next, next)
          assert.equal(inspectedView.result.facts.$ === "Some", present)
          if (present)
            assert.deepEqual(
              unlist(inspectedView.result.facts.value.declarations),
              expected.declarations.map(({ key, value }) => ({ ...value, key }))
            )
          const late = artifactTransport(
            core.view(
              core.resume(
                inspected,
                artifactTransport(t("Reply", { invocation: index + 1, id: 0, outcome: t("ClockStarted", { clock }) }))
              )
            ),
            false
          )
          assert.equal(label(late), "GoFailed")
          assert.equal(late.failure.$, "Types.ReplyAfterTerminal")
          assert.equal(late.next, next)
        }
      }
      const terminalLate = artifactTransport(
        core.view(
          core.resume(
            state,
            artifactTransport(t("Reply", { invocation: index + 1, id: 0, outcome: t("ClockStarted", { clock }) }))
          )
        ),
        false
      )
      assert.equal(terminalLate.failure.$, "Types.ReplyAfterTerminal")
      assert.equal(terminalLate.next, next)
    } catch (error) {
      actualError = error
    } finally {
      io.close()
    }
    if (expected.error) {
      assert.deepEqual({ name: actualError?.name, message: actualError?.message }, expected.error, fixture.name)
    } else assert.ifError(actualError)
    assert.deepEqual(events, expected.events, fixture.name + " exact clock/capture/read chronology")
    assert.deepEqual(hashInputs, expected.hashInputs, fixture.name + " authored fingerprint preimages")
    if (cache) {
      assert.deepEqual([...cache.keys()], expected.cachePaths, fixture.name + " ordered cache")
      for (const [path, value] of cache)
        assert.equal(value, capturedValues.get(path), fixture.name + " capture identity")
    }
    for (const variant of [
      "ordinary",
      ...(fixture.name === "single" ? ["final-clock"] : []),
      ...(fixture.name === "sibling" ? [0] : fixture.name === "module-import" ? [0, 1] : [])
    ]) {
      canonicalCases++
      const captureDefect = new Error(fixture.name + " capture fault", {
        cause: new Error("underlying Go capture fault")
      })
      const wholeEvents = [],
        wholeCache = fixture.noCache ? undefined : new Map(),
        wholeCaptures = new Map()
      let tick = 0,
        captureCount = 0
      const exit = await Effect.runPromiseExit(
        resolveCanonicalGraphFixture(path, rootCapture, "Root", {
          root,
          rootIdentity,
          policy,
          branch,
          limits: { ...GRAPH_LIMIT_CEILINGS, ...fixture.limits },
          analysisConfiguration: fixture.configuration ? { go: fixture.configuration } : undefined,
          captureCache: wholeCache,
          now: () => {
            wholeEvents.push(["clock"])
            const current = tick++
            return (fixture.expired && current > 0) || (variant === "final-clock" && current >= 9) ? 5000 : 0
          },
          captureHooks: { sourceRead: (path) => wholeEvents.push(["read", path]) },
          captureSource: (...args) =>
            Effect.gen(function* () {
              wholeEvents.push(["capture", args[1].relativePath])
              if (captureCount++ === variant) return yield* Effect.die(captureDefect)
              const result = yield* captureStable(...args)
              if (result.status === "captured") wholeCaptures.set(args[1].relativePath, result.capture)
              return result
            })
        })
      )
      const fault = typeof variant === "number"
      let expectedEvents = expected.wholeEvents,
        expectedCachePaths = expected.cachePaths
      if (fault) {
        let seen = 0
        const last = expectedEvents.findIndex((event) => event[0] === "capture" && seen++ === variant)
        assert.ok(last >= 0, "authored capture fault position")
        expectedEvents = expectedEvents.slice(0, last + 1)
        expectedCachePaths = expectedCachePaths.slice(0, variant)
      }
      const checkWhole = (part, check) => {
        try {
          check()
        } catch (error) {
          wholeFailures.push(error)
          console.log(
            JSON.stringify({
              failure: Exit.isFailure(exit)
                ? { name: Cause.squash(exit.cause)?.name, message: Cause.squash(exit.cause)?.message }
                : undefined,
              variant,
              wholeMismatch: fixture.name,
              part,
              events: wholeEvents,
              cache: wholeCache && [...wholeCache.keys()]
            })
          )
        }
      }
      checkWhole("result", () => {
        if (fault || expected.wholeError) {
          assert.ok(Exit.isFailure(exit), fixture.name)
          const error = Cause.squash(exit.cause)
          if (fault) {
            assert.equal(error, captureDefect)
            assert.equal(error.cause, captureDefect.cause)
          } else assert.deepEqual({ name: error.name, message: error.message }, expected.wholeError, fixture.name)
          assert.deepEqual(
            exit.cause.reasons.map((reason) => ({ kind: reason._tag, defect: reason.defect })),
            [{ kind: "Die", defect: error }]
          )
        } else {
          assert.ok(Exit.isSuccess(exit), fixture.name)
          assert.deepEqual(
            exit.value,
            variant === "final-clock" ? undefined : expected.whole,
            fixture.name + " whole authored ReviewUnit"
          )
        }
      })
      checkWhole("effects", () =>
        assert.deepEqual(wholeEvents, expectedEvents, fixture.name + " whole physical chronology")
      )
      if (wholeCache)
        checkWhole("cache", () => {
          assert.deepEqual([...wholeCache.keys()], expectedCachePaths, fixture.name + " whole cache order")
          for (const [path, value] of wholeCache)
            assert.equal(value, wholeCaptures.get(path), fixture.name + " whole capture identity")
        })
    }
  }
  if (wholeFailures.length) throw new AggregateError(wholeFailures, "Go Canonical expectations failed")
  console.log(
    JSON.stringify({
      passed: true,
      cases: fixtures.length + canonicalCases,
      artifactCases: fixtures.length,
      canonicalCases,
      requests,
      transitions,
      scope:
        "GoArtifact protocol and actual Canonical whole Graph over authored package/edge/hash/effect/cache facts; shared native parser metadata, not universal equivalence or whole Preparation acceptance."
    })
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
