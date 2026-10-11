import { inspectGoFile } from "../../../packages/source-analysis/src/direct-event/languages/go.ts"
import { opendir } from "node:fs/promises"
import {
  artifactValueTag,
  binary64 as __binary64,
  fromBinary64,
  productValue,
  fromProductValue,
  list,
  unlist
} from "@hapsland/source-artifacts/direct-event/value/codec"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { createDispatcher } from "../../../packages/source-analysis/src/direct-event/graph-resolution/runtime-observation/transport.mjs"
import {
  createServiceSession,
  createServiceRegistry
} from "../../../packages/source-analysis/src/direct-event/graph-resolution/service-session.ts"
import {
  sourceFacts,
  tomlValue
} from "../../../packages/source-analysis/src/direct-event/graph-resolution/frontend-codec.ts"
import {
  inspectSourceFrontend,
  parseCargoSyntax,
  inspectRustModuleSyntax
} from "../../../packages/source-analysis/src/direct-event/graph-resolution/frontends.ts"
import { inspectTypeScript } from "../../../packages/source-analysis/dist/direct-event/languages/typescript.js"
import {
  inspectRust,
  inspectRustModules as __inspectRustModules
} from "../../../packages/source-analysis/dist/direct-event/languages/rust.js"
import { bendAdapter } from "../../../packages/source-analysis/dist/direct-event/languages/bend/adapter.js"
import { parse } from "smol-toml"
const folder = import.meta.dirname,
  temporary = mkdtempSync("/tmp/hapsland-whole-resolver-services-")
const tagged = (name, fields = {}) => ({ $: artifactValueTag(name) ?? "Types." + name, ...fields })
try {
  assert.equal(execFileSync("bend", ["version"], { encoding: "utf8", timeout: 5000 }).trim(), "bend 2.0.36")
  const program = join(temporary, "services.js")
  execFileSync(
    "bend",
    [join(folder, "../../../packages/source-analysis/src/direct-event/graph-resolution/Runtime.bend"), "-o", program],
    { timeout: 5000 }
  )
  const protocolPath = join(temporary, "protocol.mjs")
  execFileSync(
    "bend",
    [
      join(folder, "../../../packages/source-analysis/src/direct-event/graph-resolution/Protocol.bend"),
      "-o",
      protocolPath
    ],
    { timeout: 5000 }
  )
  const protocol = (await import(pathToFileURL(protocolPath))).default
  const goProbePath = join(temporary, "go-probe.mjs")
  execFileSync(
    "bend",
    [
      join(folder, "../../../packages/source-analysis/src/direct-event/graph-resolution/go-module/ABIProbe.bend"),
      "-o",
      goProbePath
    ],
    { timeout: 5000 }
  )
  const goProbe = (await import(pathToFileURL(goProbePath))).default
  const directoryRequest = tagged("Request", {
    invocation: 1n,
    id: 2n,
    operation: tagged("ReadDirectoryEntries", { path: ".", limit: 128n })
  })
  for (const outcome of [
    tagged("DirectoryEntriesObserved", { entries: list(["raw"]), complete: true }),
    tagged("DirectoryEntriesUnavailable")
  ]) {
    const reply = tagged("Reply", { invocation: 1n, id: 2n, outcome })
    assert.deepEqual(protocol.check(directoryRequest, reply), { $: "CheckedOutcome", outcome })
    assert.equal(protocol.check(directoryRequest, { ...reply, id: 3n }).failure.$, "Types.WrongCorrelation")
    assert.equal(protocol.check(directoryRequest, { ...reply, invocation: 4n }).failure.$, "Types.WrongInvocation")
  }
  assert.equal(
    protocol.check(
      directoryRequest,
      tagged("Reply", { invocation: 1n, id: 2n, outcome: tagged("ProductEncoded", { bytes: 1n }) })
    ).failure.$,
    "Types.WrongReplyKind"
  )
  const source = readFileSync(program, "utf8"),
    footer = "\ncli(process.argv.slice(1));\nio_exit($main$, null);"
  assert.ok(source.endsWith(footer))
  assert.ok(source.includes("function $call_service$(_request_0) {"))
  assert.deepEqual(
    [...source.matchAll(/io_eff\("([^"]+)",/g)].map((m) => m[1]),
    ["perform"]
  )
  const embedded = join(temporary, "embedded.mjs")
  writeFileSync(
    embedded,
    source.slice(0, -footer.length) +
      "\nexport const start=request=>run_loop($call_service$(request)(value=>({$:'Emit',value})));\nif(Object.keys($0eff).length!==1||!Object.hasOwn($0eff,'perform'))throw new Error('unexpected effect');\nexport const handlers=Object.freeze({perform:$0eff.perform});\n"
  )
  const { start, handlers } = await import(pathToFileURL(embedded)),
    invoke = createDispatcher(start, handlers)
  globalThis.__hapslandWholeResolverServices = createServiceRegistry()
  let nextInvocation = 1,
    total = 0
  const make = (options) => {
    const session = createServiceSession({ invocation: nextInvocation++, root: folder, ...options })
    globalThis.__hapslandWholeResolverServices.register(session)
    let id = 0
    return {
      session,
      async request(name, fields = {}) {
        total++
        const reply = await invoke([
          tagged("Request", { invocation: session.invocation, id: id++, operation: tagged(name, fields) })
        ])
        assert.equal(reply.$, "Types.Reply")
        assert.equal(reply.invocation, session.invocation)
        assert.equal(reply.id, id - 1)
        return reply.outcome
      },
      close() {
        globalThis.__hapslandWholeResolverServices.remove(session)
        session.close()
      }
    }
  }
  const goApi = make({})
  const goSources = [
    "package p\ntype Root struct { Value string }\n",
    "package p\ntype Duplicate int\ntype Duplicate bool\n",
    "package p\ntype Status int\nconst (\n A Status = iota\n B\n)\nconst C = B\n",
    'package p\nimport ext "example.test/domain"\ntype Alias = ext.Kind\nconst C = ext.Kind(1)\n',
    "package p\ntype Status int\nconst C = min(Status(1), Status(2)) << 1\n",
    'package p\nimport "C"\ntype Root int\n'
  ]
  for (const source of goSources) {
    const native = inspectGoFile("root.go", source)
    assert.ok(native, source)
    const capture = goApi.session.registerCapture({ text: source, byteLength: Buffer.byteLength(source) })
    const reply = await goApi.request("InspectGoFile", { path: "root.go", capture })
    if (reply.$ === "Types.ProviderRejected") throw goApi.session.exception(reply.exception)
    assert.equal(reply.$, "Types.GoFileResult")
    assert.equal(reply.outcome.$, "Types.GoFileInspected")
    const facts = reply.outcome.file
    assert.equal(facts.path, native.path)
    assert.equal(facts.package_name, native.packageName)
    assert.deepEqual(unlist(facts.bindings), native.bindings)
    assert.deepEqual(unlist(facts.imported_names), [...native.importedNames])
    assert.deepEqual(
      unlist(facts.aliases).map(({ name, target }) => [name, target]),
      [...native.aliases]
    )
    assert.deepEqual(
      unlist(facts.types).map(({ artifact }) => [artifact.name, artifact.source, artifact.source_hash]),
      native.types.map(({ artifact }) => [artifact.name, artifact.source, artifact.sourceHash])
    )
    assert.deepEqual(
      unlist(facts.constants).map(({ artifact }) => [artifact.name, artifact.source]),
      native.constants.map(({ artifact }) => [artifact.name, artifact.source])
    )
    assert.deepEqual(
      unlist(facts.type_locations).map((location) =>
        location.$ === "None"
          ? undefined
          : {
              start: { line: location.value.start.line, column: location.value.start.column },
              end: { line: location.value.end.line, column: location.value.end.column }
            }
      ),
      native.types.map((item) => item.location)
    )
    const rows = unlist(facts.expressions)
    for (const [index, group] of unlist(facts.groups).entries()) {
      assert.deepEqual(unlist(group.names), native.constants[index].names)
      for (const [memberIndex, member] of unlist(group.members).entries()) {
        const expected = native.constants[index].members[memberIndex]
        assert.equal(member.name, expected.name)
        assert.equal(member.type_name.$ === "Some" ? member.type_name.value : undefined, expected.typeName)
        if (expected.expression === undefined) assert.equal(member.expression.$, "None")
        else {
          assert.equal(member.expression.$, "Some")
          const node = rows[member.expression.value]
          assert.equal(node.kind, expected.expression.type)
          assert.equal(node.text, expected.expression.text)
          assert.equal(node.start, expected.expression.startIndex)
          for (const field of unlist(node.fields))
            assert.equal(rows[field.child].text, expected.expression.childForFieldName(field.name).text)
        }
      }
    }
    let numericTotal = 0n
    for (const row of rows) {
      for (const value of [
        row.id,
        row.start,
        row.end,
        ...unlist(row.children),
        ...unlist(row.fields).map((f) => f.child)
      ])
        numericTotal += BigInt(value)
    }
    for (const location of unlist(facts.type_locations))
      if (location.$ === "Some")
        for (const point of [location.value.start, location.value.end])
          numericTotal += BigInt(point.line + point.column)
    for (const group of unlist(facts.groups))
      for (const member of unlist(group.members))
        if (member.expression.$ === "Some") numericTotal += BigInt(member.expression.value) + 1n
    assert.equal(goProbe.numeric_total(facts), numericTotal)
    assert.equal(facts.cgo, native.cgo)
    const checked = protocol.check(
      tagged("Request", { invocation: 1n, id: 2n, operation: tagged("InspectGoFile", { path: "root.go", capture }) }),
      tagged("Reply", { invocation: 1n, id: 2n, outcome: reply })
    )
    assert.equal(checked.$, "CheckedOutcome")
    assert.equal(checked.outcome.$, "Types.GoFileResult")
    assert.equal(checked.outcome.outcome.file.path, native.path)
  }
  const invalidGo = goApi.session.registerCapture({ text: "package {", byteLength: 9 })
  assert.equal(
    (await goApi.request("InspectGoFile", { path: "root.go", capture: invalidGo })).outcome.$,
    "Types.GoFileUnsupported"
  )
  goApi.close()
  const directoryPath = join(temporary, "raw-directory")
  mkdirSync(directoryPath)
  for (const name of ["visible.go", ".hidden.go", "notes.txt", "sample_test.go", "_skip.go", "z.go"])
    writeFileSync(join(directoryPath, name), "")
  mkdirSync(join(directoryPath, "subdirectory"))
  const rawNames = []
  for await (const entry of await opendir(directoryPath)) rawNames.push(entry.name)
  const directoryApi = make({ root: temporary })
  for (const limit of [0, 1, rawNames.length - 1, rawNames.length, rawNames.length + 1]) {
    const observed = await directoryApi.request("ReadDirectoryEntries", { path: "raw-directory", limit })
    assert.equal(observed.$, "Types.DirectoryEntriesObserved")
    assert.deepEqual(unlist(observed.entries), rawNames.slice(0, limit + 1))
    assert.equal(observed.complete, limit >= rawNames.length)
  }
  assert.equal(
    (await directoryApi.request("ReadDirectoryEntries", { path: "missing", limit: 128 })).$,
    "Types.DirectoryEntriesUnavailable"
  )
  assert.equal(
    (await directoryApi.request("ReadDirectoryEntries", { path: "raw-directory/notes.txt", limit: 128 })).$,
    "Types.DirectoryEntriesUnavailable"
  )
  directoryApi.close()
  let directoryCloses = 0
  const injectedDirectory = make({
    async openDirectory() {
      return (async function* () {
        try {
          yield { name: ".hidden.go" }
          yield { name: "notes.txt" }
        } finally {
          await Promise.resolve()
          directoryCloses++
        }
      })()
    }
  })
  const overflow = await injectedDirectory.request("ReadDirectoryEntries", { path: "raw", limit: 0 })
  assert.deepEqual(unlist(overflow.entries), [".hidden.go"])
  assert.equal(overflow.complete, false)
  assert.equal(directoryCloses, 1)
  injectedDirectory.close()
  for (const phase of ["open", "read", "close"]) {
    const closeDirectory = async () => {
      directoryCloses++
      if (phase === "close") throw new Error("directory close")
    }
    const failingDirectory = make({
      async openDirectory() {
        if (phase === "open") throw new Error("directory open")
        return (async function* () {
          try {
            yield { name: "raw" }
            if (phase === "read") throw new Error("directory read")
          } finally {
            await closeDirectory()
          }
        })()
      }
    })
    assert.equal(
      (await failingDirectory.request("ReadDirectoryEntries", { path: "raw", limit: 128 })).$,
      "Types.DirectoryEntriesUnavailable"
    )
    failingDirectory.close()
  }
  assert.equal(directoryCloses, 3)

  const numbers = [
    0,
    -0,
    4999.999999999999,
    5000,
    5000.000000000001,
    -5000,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_VALUE,
    Number.MIN_VALUE
  ]
  for (const elapsed of numbers) {
    let calls = 0
    const api = make({
      now: () => {
        calls++
        return calls === 1 ? 0 : elapsed
      }
    })
    const clock = (await api.request("StartClock")).clock,
      bits = (await api.request("ReadClock", { clock })).bits
    assert.ok(Object.is(fromBinary64(bits), elapsed))
    assert.equal(calls, 2)
    api.close()
  }
  const api = make()
  assert.equal(
    (await api.request("PathBasename", { path: "src/foo.rs", suffix: { $: "Some", value: ".rs" } })).name,
    "foo"
  )
  assert.equal((await api.request("PathJoin", { parts: list(["src", "..", "root.ts"]) })).path, "root.ts")
  assert.equal((await api.request("ReadPathSeparator")).separator, "/")
  assert.equal(
    (
      await api.request("ReadFileStatus", {
        path: "../../../packages/source-analysis/src/direct-event/graph-resolution/Types.bend"
      })
    ).status.$,
    "Types.ExistingFile"
  )
  assert.equal((await api.request("ReadFileStatus", { path: "." })).status.$, "Types.ExistingOther")
  assert.equal((await api.request("ReadFileStatus", { path: "missing" })).status.$, "Types.FileAbsent")
  const joinedPathCases = [
    ["src/parent.bend/child/root.bend", "../../../packages/source-analysis/src/direct-event"],
    ["src/root.ts", "./a"],
    ["/root.ts", "../a"],
    ["src/root.ts", "../../a"],
    ["src/root.ts", "/absolute/a"],
    ["src/root.ts", ""],
    ["root.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution"],
    ["src/root.ts", "../x/../a.JS"],
    ["src/root.ts", "./a.mjs"],
    ["src/root.ts", "./a.cjs"],
    ["src/root.ts", "./a.json"],
    ["src/root.ts", "./😀"],
    ["src/root.ts", "./\u0000"],
    ["C:\\src\\root.ts", "..\\a.rs"]
  ]
  for (const [from, leaf] of joinedPathCases) {
    const directory = (await api.request("PathDirname", { path: from })).path
    const joined = (await api.request("PathJoin", { parts: list([directory, leaf]) })).path
    const normalized = (await api.request("PathNormalize", { path: joined })).path
    const separator = (await api.request("ReadPathSeparator")).separator
    const absolute = (await api.request("PathIsAbsolute", { path: normalized })).absolute
    const extension = (await api.request("PathExtension", { path: normalized })).extension
    const leaf_extension = (await api.request("PathExtension", { path: leaf })).extension
    assert.deepEqual(
      await api.request("JoinedPathFacts", { from, leaf }),
      tagged("JoinedPathFactsResult", { separator, normalized, absolute, extension, leaf_extension }),
      "batch projection onto individual actual foreign path operations"
    )
  }
  const value = {
    root: { artifact: { id: "😀", kind: "interface", name: "Root", source: "α", sourceHash: "abc" }, references: [] },
    sourceDependencies: ["Cargo.toml"]
  }
  const encoded = productValue(value)
  assert.deepEqual(fromProductValue(encoded), value)
  assert.equal(
    (await api.request("EncodeProduct", { value: encoded })).bytes,
    Buffer.byteLength(JSON.stringify(value), "utf8")
  )
  assert.equal((await api.request("EncodeSourceText", { text: "😀α" })).bytes, 6)
  const borrowed = new Map([["root.ts", { text: "interface Root {}", byteLength: 17 }]]),
    a = make({ callerCache: borrowed }),
    b = make({ callerCache: borrowed }),
    cacheA = a.session.callerCache.value,
    cacheB = b.session.callerCache.value
  const capA = (await a.request("LookupCaptureCache", { cache: cacheA, path: "root.ts" })).outcome.capture,
    capB = (await b.request("LookupCaptureCache", { cache: cacheB, path: "root.ts" })).outcome.capture
  assert.notEqual(capA.invocation, capB.invocation)
  const bad = await b.request("StoreCaptureCache", { cache: cacheB, path: "bad.ts", capture: capA })
  assert.equal(bad.$, "Types.ProviderRejected")
  assert.ok(b.session.exception(bad.exception) instanceof Error)
  assert.equal(borrowed.has("bad.ts"), false)
  assert.equal(
    (await a.request("LookupCaptureCache", { cache: cacheA, path: "absent" })).outcome.$,
    "Types.CacheAbsent"
  )
  assert.equal(a.session.callerCache.$, "Some")
  assert.equal(api.session.callerCache.$, "None")
  const privateCache = (await api.request("CreateInvocationCache")).cache
  assert.equal(unlist((await api.request("SnapshotCaptureCache", { cache: privateCache })).entries).length, 0)
  const events = [],
    rootCapture = { text: "interface Root {}", byteLength: 17 }
  const io = make({
    callerCache: new Map(),
    access: async (p) => {
      events.push("access:" + p)
      return { relativePath: p }
    },
    capture: async (selected, cap, { signal: _signal }) => {
      events.push("capture:" + selected.relativePath + ":" + cap)
      return { status: "available", capture: rootCapture }
    },
    frontend: inspectSourceFrontend,
    parseCargo: parseCargoSyntax,
    inspectRustModules: inspectRustModuleSyntax,
    diagnostic: () => {
      events.push("diagnostic")
      throw new Error("optional")
    }
  })
  const selection = (await io.request("AccessPath", { path: "root.ts" })).outcome.selection,
    captured = (await io.request("CaptureSource", { selection, source_cap: 100 })).outcome.capture
  await io.request("StoreCaptureCache", { cache: io.session.callerCache.value, path: "root.ts", capture: captured })
  assert.equal(
    (
      await io.request("InspectSource", {
        path: "root.ts",
        capture: captured,
        context: tagged("TypeScriptContext", { branch: tagged("TypeBranch") })
      })
    ).outcome.facts.$,
    "Types.SourceFacts"
  )
  await io.request("ObserveDiagnostic", {
    path: "root.ts",
    diagnostic: tagged("CaptureDiagnostic", {
      value: productValue({ stage: "capture", code: "capture-budget-limit", args: { used: 64 } })
    })
  })
  assert.deepEqual(events, ["access:root.ts", "capture:root.ts:100", "diagnostic"])
  for (const [p, text, inspect] of [
    ["root.rs", "pub struct Root { value: String }", inspectRust],
    ["root.bend", "type Root is Data:\n  Root{value: Nat}", bendAdapter.inspect]
  ])
    assert.equal(sourceFacts(inspect(p, text)).$, "Types.SourceFacts")
  assert.equal(
    tomlValue(parse('[package]\nname="root"\nedition="2021"\nautobins=false\n[[bin]]\npath="src/main.rs"')).$,
    "Types.TomlRecord"
  )
  const manifest = io.session.registerCapture({ text: '[package]\nname="root"\nedition="2021"', byteLength: 35 })
  assert.equal((await io.request("ParseCargo", { capture: manifest })).outcome.$, "Types.CargoInspected")
  const callable = io.session.registerCapture({
    text: "export function Root(value: string): string { return value }",
    byteLength: 58
  })
  const callableFacts = (
    await io.request("InspectSource", {
      path: "root.ts",
      capture: callable,
      context: tagged("TypeScriptContext", { branch: tagged("FunctionBranch") })
    })
  ).outcome.facts
  assert.ok(
    unlist(callableFacts.declarations).some(
      (d) => d.key === "function:Root" && d.artifact.kind.$ === "Types.FunctionArtifact"
    )
  )
  const module = io.session.registerCapture({ text: "mod child;", byteLength: 10 })
  assert.deepEqual(unlist((await io.request("InspectRustModules", { capture: module })).outcome.names), ["child"])
  const thrown = new Error("clock provider")
  const failure = make({
    now: () => {
      throw thrown
    }
  })
  const exception = (await failure.request("StartClock")).exception
  assert.equal(failure.session.exception(exception), thrown)
  for (const entry of [api, a, b, io, failure]) entry.close()
  assert.equal(globalThis.__hapslandWholeResolverServices.size, 0)
  assert.equal(borrowed.size, 1)
  const registry = createServiceRegistry(),
    first = createServiceSession({ invocation: 123, root: folder }),
    duplicate = createServiceSession({ invocation: 123, root: folder })
  registry.register(first)
  assert.throws(() => registry.register(duplicate), /duplicate/)
  registry.remove(first)
  first.close()
  duplicate.close()
  const failedSession = createServiceSession({ invocation: 124, root: folder })
  await assert.rejects(
    registry.run(failedSession, () => Promise.reject(new Error("failed invocation"))),
    /failed invocation/
  )
  assert.equal(registry.size, 0)
  const activeSession = createServiceSession({ invocation: 126, root: folder })
  let release
  const activeRun = registry.run(
    activeSession,
    () =>
      new Promise((resolve) => {
        release = resolve
      })
  )
  await assert.rejects(
    registry.run(activeSession, () => Promise.resolve()),
    /duplicate/
  )
  assert.equal(registry.get(126), activeSession)
  assert.equal(
    (await activeSession.perform(tagged("Request", { invocation: 126, id: 0, operation: tagged("ReadPathSeparator") })))
      .outcome.separator,
    "/"
  )
  release()
  await activeRun
  assert.equal(registry.size, 0)
  await assert.rejects(
    activeSession.perform(tagged("Request", { invocation: 126, id: 1, operation: tagged("ReadPathSeparator") })),
    /invalid request owner/
  )
  let done
  const lateSession = createServiceSession({
      invocation: 125,
      root: folder,
      access: () =>
        new Promise((resolve) => {
          done = resolve
        })
    }),
    late = lateSession.perform(
      tagged("Request", { invocation: 125, id: 1, operation: tagged("AccessPath", { path: "x" }) })
    )
  lateSession.close()
  done({ relativePath: "x" })
  await assert.rejects(late, /closed service session/)
  const ignoresPromise = make({ diagnostic: () => new Promise(() => {}) })
  await ignoresPromise.request("ObserveDiagnostic", {
    path: "x",
    diagnostic: tagged("CaptureDiagnostic", { value: productValue({ stage: "capture" }) })
  })
  ignoresPromise.close()
  const actual = inspectTypeScript("root.ts", "interface Root {}")
  const declaration = actual.declarations.get("Root")
  for (const ref of [
    { kind: "unknown", name: "X" },
    { kind: "named", name: "X", expectedKind: "unknown" }
  ])
    assert.throws(
      () => sourceFacts({ ...actual, declarations: new Map([["Root", { ...declaration, references: [ref] }]]) }),
      /invalid/
    )
  assert.equal(tomlValue(9223372036854775807n).decimal, "9223372036854775807")
  const record = {
    at: new Date().toISOString(),
    runtime: typeof Bun === "undefined" ? "node" : "bun",
    requests: total,
    goSingleFileExtractionCases: 7,
    rawDirectoryObservationCases: 11,
    rawDirectoryProtocolCases: 7,
    joinedPathFactProjectionCases: joinedPathCases.length,
    clockNumbers: numbers.length,
    clockProviderCallsPreserved: true,
    binary64Exact: true,
    cacheInvocationRebinding: true,
    foreignCaptureOwnership: true,
    callerCachePreservedOnClose: true,
    actualTSRustBendFrontends: true,
    actualTypeScriptFunctionFrontend: true,
    actualCargoParser: true,
    pathStatusAndEncoding: true,
    providerExceptionIdentity: true,
    optionalDiagnosticFailureIgnored: true,
    diagnosticPromiseIgnored: true,
    lateCloseNoRegistration: true,
    registryFinallyCleanup: true,
    duplicateRunPreservesActiveOwner: true,
    malformedFrontendRejected: true,
    arbitraryBigIntAsDecimal: true,
    scope: "typed service/foreign IO boundary only; no whole resolver transition or adoption claim"
  }
  const evidenceDirectory = join(folder, "../../../.test-runs/bend-migration")
  mkdirSync(evidenceDirectory, { recursive: true })
  writeFileSync(
    join(evidenceDirectory, "service-session-" + record.runtime + "-evidence.json"),
    JSON.stringify(record, null, 2) + "\n"
  )
  console.log(JSON.stringify(record))
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
