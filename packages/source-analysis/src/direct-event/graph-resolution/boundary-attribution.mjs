import { createVerificationResolver } from "./verification/resolver-driver.mjs"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { join, dirname } from "node:path"
import { pathToFileURL } from "node:url"
import { createHash } from "node:crypto"
import * as Effect from "effect/Effect"
import { createTimedNativeResolver } from "./verification/native-boundary-timing.mjs"
import { resolveGraphUnit } from "../../../dist/direct-event/graph-resolution/verification/native-graph-resolver.js"
import { DEFAULT_DIRECT_FILE_POLICY } from "../../../../native-observation/dist/direct-event/selection.js"
import { createDispatcher as __createDispatcher } from "./runtime-observation/transport.mjs"
import { createServiceRegistry } from "./service-session.ts"
import { createGraphFixtures } from "./verification/fixtures.mjs"
import { GRAPH_LIMIT_CEILINGS } from "../../../../canonical-policy/dist/canonical/graph-limits.js"

// Diagnostic only. Ordinary native ports and dispatcher boundaries add timing;
// every result is checked against its uninstrumented reference on the same files.
const folder = import.meta.dirname,
  temporary = mkdtempSync(join(folder, ".service-attribution-"))
const selected = createGraphFixtures().map((fixture) => fixture.name)
const pairs = 1,
  records = [],
  sourceHashes = {}
let active
const span = (name, start) => {
  if (active) active.spans.push({ name, start, end: performance.now() })
}
const timedSync = (name, task) => {
  const start = performance.now()
  try {
    return task()
  } finally {
    span(name, start)
  }
}
const timedPromise = (name, task) => {
  const start = performance.now()
  let value
  try {
    value = task()
  } catch (error) {
    span(name, start)
    throw error
  }
  assert.ok(value && typeof value.then === "function")
  value.then(
    () => span(name, start),
    () => span(name, start)
  )
  return value
}
const providerCounts = {}
const timedProvider = (name, task) => {
  const start = performance.now()
  let value
  try {
    value = task()
  } catch (error) {
    if (active) {
      const counts = (providerCounts[name] ??= { sync: 0, async: 0 })
      counts.sync++
    }
    span(name, start)
    throw error
  }
  const asynchronous =
    value !== null && (typeof value === "object" || typeof value === "function") && typeof value.then === "function"
  if (active) {
    const counts = (providerCounts[name] ??= { sync: 0, async: 0 })
    counts[asynchronous ? "async" : "sync"]++
  }
  if (!asynchronous) {
    span(name, start)
    return value
  }
  Promise.resolve(value).then(
    () => span(name, start),
    () => span(name, start)
  )
  return value
}
globalThis.__hapslandAttribution = { timedSync, timedPromise, timedProvider }
try {
  for (const name of readdirSync(folder).filter((name) => /\.(bend|mjs|js)$/.test(name))) {
    const path = join(folder, name)
    sourceHashes[path] = createHash("sha256").update(readFileSync(path)).digest("hex")
  }
  // Effect starts at interpretation, and records on every success/failure exit.
  globalThis.__hapslandAttribution.effectSpan = span
  const instrumentedNative = createTimedNativeResolver({
    timedSync,
    timedPromise,
    timedEffect: (name, effect) =>
      Effect.suspend(() => {
        const start = performance.now()
        return effect.pipe(Effect.onExit(() => Effect.sync(() => span(name, start))))
      })
  })
  const native = (...args) => Effect.runPromise(instrumentedNative(...args))
  const runtime = join(temporary, "runtime.mjs")
  assert.equal(execFileSync("bend", ["version"], { encoding: "utf8", timeout: 10000 }).trim(), "bend 2.0.36")
  execFileSync("bend", [join(folder, "./Runtime.bend"), "-o", runtime], { timeout: 10000 })
  let emitted = readFileSync(runtime, "utf8")
  const marshallers = [...emitted.matchAll(/function (\$0m\d+)\(/g)].map((match) => match[1])
  assert.ok(marshallers.length > 0)
  const ffiBody = emitted.match(/function \$perform\$\([^)]*\) \{\n([^\n]+)\n\}/)?.[1]
  assert.ok(ffiBody)
  const requestMarshaller = ffiBody.match(/args: \[(\$0m\d+)\(/)?.[1],
    replyMarshaller = ffiBody.match(/f\((\$0m\d+)\(x\)\)/)?.[1]
  assert.ok(requestMarshaller && replyMarshaller)
  assert.notEqual(requestMarshaller, replyMarshaller)
  for (const name of marshallers)
    emitted +=
      "\n" +
      name +
      "=((original)=>(...args)=>globalThis.__hapslandAttribution.timedSync(" +
      JSON.stringify(
        name === requestMarshaller
          ? "abi:request-encoding"
          : name === replyMarshaller
            ? "abi:reply-decoding"
            : "abi:other"
      ) +
      ",()=>original(...args)))(" +
      name +
      ");"
  emitted += "\nexport const handlers=Object.freeze({perform:$0eff.perform});\n"
  writeFileSync(runtime, emitted)
  const { default: program, handlers } = await import(pathToFileURL(runtime))
  const registry = createServiceRegistry()
  globalThis.__hapslandWholeResolverServices = {
    get size() {
      return registry.size
    },
    get(id) {
      const session = registry.get(id)
      return session === undefined
        ? undefined
        : {
            perform: (request, options) =>
              timedPromise("service:" + request.operation.$, () => session.perform(request, options))
          }
    }
  }
  const observe = (operation) =>
    operation?.kont
      ? { ...operation, kont: (reply) => timedSync("continuation", () => observe(operation.kont(reply))) }
      : operation
  const dispatcher = __createDispatcher(
    (input) => timedSync("continuation", () => observe(program.resolve(input)((value) => ({ $: "Emit", value })))),
    handlers
  )
  const candidate = createVerificationResolver({
    resolveIO: (...args) => timedPromise("dispatcher:total", () => dispatcher(...args)),
    registry
  })
  const fixtures = createGraphFixtures()
    .filter((fixture) => selected.includes(fixture.name))
    .map((fixture) => {
      const root = join(temporary, fixture.name)
      mkdirSync(root)
      execFileSync("git", ["init", "-q", root])
      const path = fixture.path ?? "root.ts",
        source =
          fixture.source ??
          "import type { A } from '" + (fixture.importPath ?? "./a") + "'; export interface Root { a: A }",
        sources = new Map([[path, source], ...Object.entries(fixture.files)])
      for (const [path, text] of sources) {
        mkdirSync(dirname(join(root, path)), { recursive: true })
        writeFileSync(join(root, path), text)
      }
      for (const directory of fixture.directories ?? []) mkdirSync(join(root, directory), { recursive: true })
      return { ...fixture, root, path, sources }
    })
  const errorShape = (error) => ({
    name: error.name,
    message: error.message,
    ...(error.cause ? { cause: errorShape(error.cause) } : {})
  })
  async function run(resolver, fixture) {
    const events = [],
      cache = fixture.cache === undefined ? undefined : new Map(fixture.cache)
    let ticks = 0
    const capture = (path) => ({
      text: fixture.sources.get(path),
      byteLength: Buffer.byteLength(fixture.sources.get(path))
    })
    const context = {
      root: fixture.root,
      policy: fixture.policy ?? DEFAULT_DIRECT_FILE_POLICY,
      branch: fixture.branch ?? "type",
      limits: { ...GRAPH_LIMIT_CEILINGS, ...fixture.limits },
      captureCache: cache,
      now: () => {
        const count = ticks++
        events.push(["clock", count])
        return count >= (fixture.expireAt ?? Infinity) ? 5000 : 0
      },
      captureSource: (_root, selected) => {
        events.push(["capture", selected.relativePath])
        return Effect.succeed(
          fixture.unavailable
            ? { status: "unavailable", diagnostic: { stage: "capture", code: "fixture-unavailable", args: {} } }
            : { status: "captured", capture: capture(selected.relativePath) }
        )
      },
      observeCaptureDiagnostic: (path, value) => events.push(["diagnostic", path, value])
    }
    let unit, error
    try {
      unit = await resolver(fixture.path, capture(fixture.path), "Root", context)
    } catch (failure) {
      error = errorShape(failure)
    }
    return { unit: unit ?? null, error: error ?? null, events, cache: cache ? [...cache] : null }
  }
  const golden = new Map()
  for (const fixture of fixtures) {
    golden.set(
      fixture.name,
      JSON.stringify(await run((...args) => Effect.runPromise(resolveGraphUnit(...args)), fixture))
    )
    for (const resolver of [native, candidate])
      assert.equal(JSON.stringify(await run(resolver, fixture)), golden.get(fixture.name))
  }
  for (let pair = 0; pair < pairs; pair++)
    for (const fixture of fixtures)
      for (const lane of pair % 2 ? ["wholeBend", "typescript"] : ["typescript", "wholeBend"]) {
        active = { pair, name: fixture.name, lane, spans: [] }
        const before = performance.now()
        const output = await run(lane === "typescript" ? native : candidate, fixture)
        active.milliseconds = performance.now() - before
        records.push(active)
        active = undefined
        assert.equal(JSON.stringify(output), golden.get(fixture.name), "instrumented full result/effects")
      }
  const summary = []
  for (const record of records) {
    const groups = {}
    for (const interval of record.spans) {
      const nested = record.spans
        .filter((other) => other !== interval && other.start >= interval.start && other.end <= interval.end)
        .sort((a, b) => a.start - b.start)
      let covered = 0,
        end = interval.start
      for (const child of nested) {
        covered += Math.max(0, child.end - Math.max(end, child.start))
        end = Math.max(end, child.end)
      }
      const group = (groups[interval.name] ??= { count: 0, inclusiveMilliseconds: 0, exclusiveMilliseconds: 0 })
      group.count++
      group.inclusiveMilliseconds += interval.end - interval.start
      group.exclusiveMilliseconds += Math.max(0, interval.end - interval.start - covered)
    }
    summary.push({ ...record, spans: undefined, groups })
  }
  assert.equal(registry.size, 0)
  for (const [path, hash] of Object.entries(sourceHashes))
    assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"), hash, "diagnostic sources changed")
  const record = {
    at: new Date().toISOString(),
    runtime: typeof Bun === "undefined" ? "node" : "bun",
    pairs,
    sourceHashes,
    providerCounts,
    summary,
    allResultsAndEffectsEqual: true,
    registryClosed: true,
    scope:
      "Diagnostic only:45 declared full consumers on same physical fixtures with fixture capture provider, alternating orders, one paired full corpus after warmup; ordinary native ports and real consumers preserve complete original result/effects. Exclusive nested span subtraction avoids double counting. Candidate continuation includes state processing plus uninstrumented compiler glue; generated public ABI marshallers timed separately; private result conversion and internal frontend/queue spans are not measured. Native lstat/access/Rust module/Cargo parsing and graph session frontend boundaries observed. Startup excluded. Instrumentation overhead, microtask scheduling and omitted native/internal conversion mean these are not parity qualification or proof."
  }
  const evidence = new URL("../../../../../../.test-runs/bend-migration/diagnostics/", import.meta.url)
  mkdirSync(evidence, { recursive: true })
  writeFileSync(
    new URL("boundary-attribution-" + record.runtime + "-evidence.json", evidence),
    JSON.stringify(record, null, 2) + "\n"
  )
  console.log(
    JSON.stringify({ runtime: record.runtime, pairs, records: records.length, allResultsAndEffectsEqual: true })
  )
} finally {
  delete globalThis.__hapslandWholeResolverServices
  delete globalThis.__hapslandAttribution
  rmSync(temporary, { recursive: true, force: true })
}
