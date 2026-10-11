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
import { createServiceSession } from "../service-session.ts"
import { factDeclaration } from "../frontend-codec.ts"

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
  const artifactOwner = "../../../../../source-analysis/src/direct-event/graph-resolution/"
  const artifactTransport = (value, incoming = true) => {
    if (Array.isArray(value)) return value.map((item) => artifactTransport(item, incoming))
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => {
          if (key !== "$" || typeof item !== "string") return [key, artifactTransport(item, incoming)]
          if (incoming) {
            if (item.startsWith("../Types.") || item.startsWith("../traversal/core."))
              return [key, artifactOwner + item.slice(3)]
            if (/^(?:PreparationModel|Configuration|RawText|Input|Package)\./u.test(item))
              return [key, artifactOwner + "go-module/" + item]
          } else if (item.startsWith(artifactOwner)) {
            const local = item.slice(artifactOwner.length)
            return [key, local.startsWith("go-module/") ? local.slice(10) : "../" + local]
          }
          return [key, item]
        })
      )
    return value
  }
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
        initial: (input) =>
          project(emittedCore.begin({ $: "ArtifactProtocol.GoPrepare", input: artifactTransport(input) })),
        advance: (state) => project(emittedCore.advance(state)),
        resume: (step, reply) => project(emittedCore.resume(step.rawStep, artifactTransport(reply)))
      }
    : emittedCore
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
              const inspected = emittedCore.begin({
                $: "ArtifactProtocol.GoInspect",
                prepared: artifactTransport(prepared),
                path: inspectPath,
                branch: artifactTransport(transport(t(inspectBranch))),
                next: step.next_request
              })
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
  }
  console.log(
    JSON.stringify({
      passed: true,
      artifactMode,
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
