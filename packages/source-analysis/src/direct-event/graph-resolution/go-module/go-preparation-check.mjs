import { artifactTransport } from "./artifact-check-codec.mjs"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, writeFile, lstat, rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"
import * as Effect from "effect/Effect"
import { captureStable } from "@hapsland/native-observation/direct-event/capture"
import {
  DEFAULT_DIRECT_FILE_POLICY,
  contextDirectFilePolicy,
  eligibleNamedPath
} from "@hapsland/native-observation/direct-event/selection"
import { list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import { prepareGoGraph } from "../../languages/go-module-context.ts"
import { createServiceRegistry, createServiceSession } from "../service-session.ts"
import { factDeclaration, pureReply } from "../frontend-codec.ts"
import { createEntryReferenceDriver } from "../entry-driver-check.mjs"

import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-limits"
import { resolveGraphUnit } from "../../graph-resolver.ts"
import { createBendResolver } from "../consumer.ts"
import { createOwnedArtifactDriver } from "../../../../../resident-runtime/src/resident/review-work/composition/owned-artifact-driver.mjs"
const entryMode = process.argv.includes("--entry")
const ownedMode = process.argv.includes("--owned") || entryMode
const artifactMode = process.argv.includes("--artifact")
const temp = await mkdtemp("/tmp/hapsland-go-preparation-")
const t = (name, fields = {}) => ({ $: `Types.${name}`, ...fields })
const m = (name, fields = {}) => ({
  $: name === "Configuration" ? "Configuration.Configuration" : `PreparationModel.${name}`,
  ...fields
})
const raw = (value) => ({
  $: "RawText.Text",
  value,
  characters: list(
    [...value].map((c) => ({ $: "RawText.Character", code: BigInt(c.codePointAt(0)), whitespace: /^\s$/u.test(c) }))
  )
})
const transport = (value, outgoing = false) => {
  if (typeof value === "number") return BigInt(value)
  if (Array.isArray(value)) return value.map((v) => transport(v, outgoing))
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        key,
        key === "$" && typeof v === "string"
          ? outgoing
            ? v
                .replace(/^\.\.\/Types\./u, "Types.")
                .replace(
                  "../../../../../source-artifacts/src/direct-event/value/Value.",
                  "../../../../source-artifacts/src/direct-event/value/Value."
                )
                .replace(/^\.\.\/traversal\/core\./u, "traversal/core.")
            : v
                .replace(/^Types\./u, "../Types.")
                .replace(
                  "../../../../source-artifacts/src/direct-event/value/Value.",
                  "../../../../../source-artifacts/src/direct-event/value/Value."
                )
                .replace(/^traversal\/core\./u, "../traversal/core.")
                .replace(/^go-module\/RawText\./u, "RawText.")
                .replace(/^go-module\/Input\./u, "Input.")
                .replace(/^go-module\/Configuration\./u, "Configuration.")
          : transport(v, outgoing)
      ])
    )
  return value
}
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
  const emitted = join(temp, "machine.mjs")
  execFileSync(
    "bend",
    [
      artifactMode
        ? join(
            import.meta.dirname,
            "../../../../../resident-runtime/src/resident/review-work/composition/GoArtifact.bend"
          )
        : join(import.meta.dirname, "PreparationMachine.bend"),
      "-o",
      emitted
    ],
    { timeout: 5000 }
  )
  const emittedCore = (await import(pathToFileURL(emitted))).default
  const project = (rawStep) => {
    const view = artifactTransport(emittedCore.view(rawStep), false)
    switch (view.$) {
      case "ArtifactProtocol.GoContinue":
        return { $: "Internal", state: rawStep }
      case "ArtifactProtocol.GoAwait":
        return { $: "Await", request: view.request, rawStep }
      case "ArtifactProtocol.GoReturned":
        return {
          $: "Returned",
          prepared:
            view.result.$ === "ArtifactProtocol.GoUnavailable"
              ? { $: "None" }
              : { $: "Some", value: view.result.prepared },
          next_request: view.next
        }
      case "ArtifactProtocol.GoFailed":
        return { $: "Failed", failure: view.failure, next_request: view.next }
      default:
        throw new Error(`Unknown Go artifact view ${view.$}`)
    }
  }
  const core = artifactMode
    ? {
        initial: (input) => project(emittedCore.begin(artifactTransport({ $: "ArtifactProtocol.GoPrepare", input }))),
        advance: (state) => project(emittedCore.advance(state)),
        resume: (step, reply) => project(emittedCore.resume(step.rawStep, artifactTransport(reply)))
      }
    : emittedCore
  const ownedFailures = []
  let ownedRequests = 0,
    ownedCases = 0
  const ownedArtifacts = {}
  let owner
  if (ownedMode)
    for (const [key, source] of [
      ["composition", "resident-runtime/src/resident/review-work/composition/ArtifactComposition.bend"],
      ["parent", "resident-runtime/src/resident/review-work/composition/GenericArtifact.bend"],
      ["python", "resident-runtime/src/resident/review-work/composition/PythonArtifact.bend"],
      ["go", "resident-runtime/src/resident/review-work/composition/GoArtifact.bend"],
      ["owner", "agent-flow-bend/preparation-lifecycle/CanonicalResolverOwner.bend"]
    ]) {
      const output = join(temp, key + ".mjs")
      execFileSync("bend", [join(import.meta.dirname, "../../../../../", source), "-o", output], { timeout: 5000 })
      const artifact = (await import(pathToFileURL(output))).default
      if (key === "owner") owner = artifact
      else ownedArtifacts[key] = artifact
    }
  const referenceEntry = entryMode
    ? await createEntryReferenceDriver({ temporary: temp, go: ownedArtifacts.go, artifactTransport })
    : undefined
  let requests = 0,
    transitions = 0
  for (const [index, fixture] of fixtures.entries()) {
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
      branch = fixture.branch ?? "type",
      policy = fixture.excluded
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
    const rootCapture = captured.capture
    const traces = { native: [], bend: [] },
      caches = { native: new Map(), bend: new Map() }
    const hooks = (lane) => ({ sourceRead: (path) => traces[lane].push(["read", path]) })
    const host = {
      root,
      rootIdentity,
      policy,
      branch,
      analysisConfiguration: fixture.configuration ? { go: fixture.configuration } : undefined,
      captureCache: fixture.noCache ? undefined : caches.native,
      captureHooks: hooks("native"),
      captureSource: (...args) =>
        Effect.gen(function* () {
          traces.native.push(["capture", args[1].relativePath])
          return yield* captureStable(...args)
        })
    }
    let native,
      nativeError,
      nativeFailed = false
    try {
      native = await Effect.runPromise(
        prepareGoGraph(path, rootCapture, host, limits, () => {
          traces.native.push(["clock"])
          return fixture.expired === true
        })
      )
    } catch (error) {
      nativeFailed = true
      nativeError = error
    }
    let started = false
    const io = createServiceSession({
      invocation: index + 1,
      root,
      callerCache: fixture.noCache ? undefined : caches.bend,
      readGoConfiguration: () => fixture.configuration,
      readAnalysisConfigurationIdentity: () => undefined,
      now: () => {
        if (started) traces.bend.push(["clock"])
        return started && fixture.expired ? 5000 : 0
      },
      access: (path, { signal } = {}) =>
        Effect.runPromise(eligibleNamedPath(root, path, contextDirectFilePolicy(policy), rootIdentity), { signal }),
      capture: (selection, cap, { signal } = {}) => {
        traces.bend.push(["capture", selection.relativePath])
        return Effect.runPromise(captureStable(root, selection, hooks("bend"), rootIdentity, cap), { signal })
      }
    })
    try {
      const clock = (await io.perform(t("Request", { invocation: index + 1, id: 0, operation: t("StartClock") })))
        .outcome.clock
      started = true
      const configuration = fixture.configuration
      let step = core.initial(
        transport(
          m("Input", {
            invocation: index + 1,
            next_request: 1,
            root_path: path,
            root_capture: io.registerCapture(rootCapture),
            root_bytes: rootCapture.byteLength,
            branch: t(branch === "function" ? "FunctionBranch" : "TypeBranch"),
            clock,
            caller_cache: io.callerCache,
            limits: {
              $: "../../../../../agent-flow-bend/ImportGraph.Limits",
              version: 1,
              source_bytes: limits.sourceBytes,
              tree_bytes: limits.treeBytes,
              files: limits.files,
              read_bytes: limits.readBytes,
              outgoing_edges: limits.outgoingEdges,
              depth: limits.depth,
              work: limits.work
            },
            configuration: configuration
              ? {
                  $: "Some",
                  value: m("Configuration", {
                    goos: configuration.goos,
                    goarch: configuration.goarch,
                    tags: list(configuration.tags.map(raw))
                  })
                }
              : { $: "None" },
            configuration_identity: { $: "None" }
          })
        )
      )
      while (step.$ === "Internal" || step.$ === "Await") {
        transitions++
        assert.ok(transitions < 1000000, fixture.name + " diagnostic runaway")
        if (step.$ === "Internal") step = core.advance(step.state)
        else {
          requests++
          step = core.resume(step, transport(await io.perform(transport(step.request, true))))
        }
      }
      if (nativeFailed) {
        assert.equal(step.$, "Failed", fixture.name)
        const error = io.exception(transport(step.failure.exception, true))
        assert.equal(error.constructor, nativeError.constructor, fixture.name)
        assert.equal(error.message, nativeError.message, fixture.name)
      } else {
        if (step.$ === "Failed" && step.failure.exception) throw io.exception(transport(step.failure.exception, true))
        assert.equal(
          step.$,
          "Returned",
          fixture.name + " " + JSON.stringify(step, (_, v) => (typeof v === "bigint" ? String(v) : v))
        )
        assert.equal(step.prepared.$ === "Some", native !== undefined, fixture.name)
        if (native !== undefined) {
          const prepared = step.prepared.value
          assert.deepEqual(unlist(prepared.dependencies), native.dependencies, fixture.name + " dependencies")
          assert.equal(prepared.binding_fingerprint, native.bindingFingerprint, fixture.name + " fingerprint")
          const expectedLimits = {
            $: "../../../../../agent-flow-bend/ImportGraph.Limits",
            version: native.limits.version,
            source_bytes: native.limits.sourceBytes,
            tree_bytes: native.limits.treeBytes,
            files: native.limits.files,
            read_bytes: native.limits.readBytes,
            outgoing_edges: native.limits.outgoingEdges,
            depth: native.limits.depth,
            work: native.limits.work
          }
          assert.deepEqual(prepared.limits, transport(expectedLimits), fixture.name + " limits")
          const facts = native.session.inspect(path, rootCapture.text, "type")
          const actualDeclarations = unlist(prepared.declarations).map(({ key, declaration }) => ({
            key,
            value: declaration.value,
            location: declaration.location
          }))
          const expectedDeclarations = [...facts.declarations].map(([key, declaration]) => ({
            key,
            value: transport(factDeclaration(declaration.artifact.name, declaration)),
            location: declaration.location
              ? {
                  $: "Some",
                  value: transport({
                    $: "Types.GoSourceLocation",
                    start: { $: "Types.GoSourcePosition", ...declaration.location.start },
                    end: { $: "Types.GoSourcePosition", ...declaration.location.end }
                  })
                }
              : { $: "None" }
          }))
          assert.deepEqual(actualDeclarations, expectedDeclarations, fixture.name + " declarations")
          if (artifactMode) {
            for (const [inspectPath, inspectBranch, present] of [
              [path, "TypeBranch", true],
              [path + ".other", "TypeBranch", false],
              [path, "FunctionBranch", false]
            ]) {
              const inspected = emittedCore.begin(
                artifactTransport({
                  $: "ArtifactProtocol.GoInspect",
                  prepared: artifactTransport(prepared),
                  path: inspectPath,
                  branch: artifactTransport(transport(t(inspectBranch))),
                  next: step.next_request
                })
              )
              const view = artifactTransport(emittedCore.view(inspected), false)
              assert.equal(view.$, "ArtifactProtocol.GoReturned")
              assert.equal(view.result.$, "ArtifactProtocol.GoInspected")
              assert.equal(view.next, step.next_request)
              assert.equal(view.result.facts.$ === "Some", present)
              if (present)
                assert.deepEqual(
                  unlist(view.result.facts.value.declarations),
                  expectedDeclarations.map(({ key, value }) => ({ ...value, key }))
                )
              const late = artifactTransport(
                emittedCore.view(
                  emittedCore.resume(
                    inspected,
                    artifactTransport(
                      transport(t("Reply", { invocation: index + 1, id: 0, outcome: t("ClockStarted", { clock }) }))
                    )
                  )
                ),
                false
              )
              assert.equal(late.$, "ArtifactProtocol.GoFailed")
              assert.equal(late.failure.$, "../Types.ReplyAfterTerminal")
              assert.equal(late.next, step.next_request)
            }
          }
        }
      }
      assert.deepEqual(traces.bend, traces.native, fixture.name + " physical chronology")
      assert.deepEqual(
        [...caches.bend].map(([p, c]) => [p, c.contentHash]),
        [...caches.native].map(([p, c]) => [p, c.contentHash]),
        fixture.name + " caller cache"
      )
    } finally {
      io.close()
    }
    if (ownedMode)
      for (const fault of [
        false,
        ...(fixture.name === "single" ? ["final-clock"] : []),
        ...(["sibling", "module-import"].includes(fixture.name) ? [true] : [])
      ]) {
        ownedCases++
        const captureFailure = new Error(fixture.name + " physical capture failure")
        let state = owner.initial_limits(100n, 100000000n, 100n, 100000000n)
        for (const [name, fields] of [
          ["OpenRound", {}],
          ["AdmitObservation", { round: 1n }],
          ["StartObservation", { round: 1n, observation: 1n }],
          ["BeginObservedPreparation", { round: 1n, observation: 1n, bytes: 1000n }]
        ]) {
          const result = owner.canonical_event(state, {
            $: "../Canonical." + name,
            partition: 1n,
            lifetime: 1n,
            ...fields
          })
          assert.equal(result.$, "Advanced")
          state = result.state
        }
        const registry = createServiceRegistry()
        const driver = createOwnedArtifactDriver({
          owner,
          initialState: state,
          scope: { $: "Scope", partition: 1n, lifetime: 1n, round: 1n, preparation: 2n },
          artifacts: ownedArtifacts,
          registry,
          foreign: async ([request], options) => {
            ownedRequests++
            return pureReply(await registry.get(Number(request.invocation)).perform(request, options))
          }
        })
        const resolver = createBendResolver({
          registry,
          drive: driver.drive,
          allocateInvocation: driver.allocateInvocation,
          onConstructionFailure: driver.constructionFailed
        })
        const wholeTraces = { native: [], bend: [], entry: [] },
          wholeCaches = { native: new Map(), bend: new Map(), entry: new Map() }
        const context = (lane) => {
          let ticks = 0
          return {
            root,
            rootIdentity,
            policy,
            branch,
            limits: { ...GRAPH_LIMIT_CEILINGS, ...fixture.limits },
            analysisConfiguration: fixture.configuration ? { go: fixture.configuration } : undefined,
            captureCache: fixture.noCache ? undefined : wholeCaches[lane],
            now: () => {
              wholeTraces[lane].push(["clock"])
              const tick = ticks++
              return (fixture.expired && tick > 0) || (fault === "final-clock" && tick >= 9) ? 5000 : 0
            },
            captureHooks: { sourceRead: (file) => wholeTraces[lane].push(["read", file]) },
            captureSource: (...args) =>
              Effect.gen(function* () {
                wholeTraces[lane].push(["capture", args[1].relativePath])
                if (fault === true) return yield* Effect.fail(captureFailure)
                return yield* captureStable(...args)
              })
          }
        }
        const outcome = async (task) => {
          try {
            return { ok: true, value: await task() }
          } catch (error) {
            return { ok: false, error }
          }
        }
        const expected = await outcome(() =>
          Effect.runPromise(resolveGraphUnit(path, rootCapture, "Root", context("native")))
        )
        const actual = await outcome(() => resolver(path, rootCapture, "Root", context("bend")))
        const reference =
          referenceEntry === undefined
            ? undefined
            : await outcome(() => createBendResolver(referenceEntry)(path, rootCapture, "Root", context("entry")))
        try {
          if (reference !== undefined) {
            assert.equal(
              reference.ok,
              expected.ok,
              fixture.name + " full reference entry failure: " + String(reference.error)
            )
            if (expected.ok) {
              assert.deepEqual(reference.value, expected.value, fixture.name + " full reference entry product")
              assert.equal(
                JSON.stringify(reference.value),
                JSON.stringify(expected.value),
                fixture.name + " full reference entry JSON order"
              )
            } else {
              assert.equal(
                reference.error.constructor,
                expected.error.constructor,
                fixture.name + " full reference entry error type"
              )
              assert.equal(
                reference.error.message,
                expected.error.message,
                fixture.name + " full reference entry error message"
              )
              if (fault === true)
                assert.equal(reference.error, captureFailure, fixture.name + " opaque entry error identity")
            }
            assert.deepEqual(wholeTraces.entry, wholeTraces.native, fixture.name + " full reference entry chronology")
            assert.deepEqual(
              [...wholeCaches.entry].map(([file, capture]) => [file, capture.contentHash]),
              [...wholeCaches.native].map(([file, capture]) => [file, capture.contentHash]),
              fixture.name + " full reference entry cache"
            )
          }
          assert.equal(actual.ok, expected.ok, fixture.name + " owned failure: " + String(expected.error))
          if (expected.ok) {
            assert.deepEqual(actual.value, expected.value, fixture.name + " owned whole unit")
            assert.equal(
              JSON.stringify(actual.value),
              JSON.stringify(expected.value),
              fixture.name + " owned JSON order"
            )
          } else {
            assert.equal(actual.error.constructor, expected.error.constructor, fixture.name + " owned error type")
            assert.equal(actual.error.message, expected.error.message, fixture.name + " owned error message")
            if (fault === true) {
              assert.equal(actual.error, captureFailure)
              assert.equal(expected.error, captureFailure)
            }
          }
          assert.deepEqual(wholeTraces.bend, wholeTraces.native, fixture.name + " owned chronology")
          assert.deepEqual(
            [...wholeCaches.bend].map(([file, capture]) => [file, capture.contentHash]),
            [...wholeCaches.native].map(([file, capture]) => [file, capture.contentHash]),
            fixture.name + " owned cache"
          )
        } catch (error) {
          ownedFailures.push(new Error(fixture.name + " / " + String(fault), { cause: error }))
        }
        assert.deepEqual(
          driver.resources,
          { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 },
          fixture.name + " owned resources"
        )
        assert.equal(registry.size, 0)
      }
  }
  if (ownedFailures.length > 0)
    throw new AggregateError(ownedFailures, `${ownedFailures.length} of ${ownedCases} owned Go cases failed`)
  console.log(
    JSON.stringify({
      passed: true,
      artifactMode,
      entryMode,
      entry: referenceEntry?.counts,
      entryEmissions: referenceEntry?.emissions,
      ownedMode,
      ownedRequests,
      ownedCases,
      cases: fixtures.length,
      requests,
      transitions,
      scope:
        "actual native prepareGoGraph whole effects/result/cache correspondence on physical fixtures; no universal proof/adoption"
    })
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
