import assert from "node:assert/strict"

const analyzerUrl = import.meta.resolve("@hapsland/source-analysis/direct-event/analyzer")
const analyzer = await import(analyzerUrl)
const native = await import(new URL("./combined-preflight/native.js", analyzerUrl))
const { Parser, typeScriptRoot, descendants } = await import(new URL("./languages/native-parser.js", analyzerUrl))
const { withNativeTypeScriptPreflight } = await import(new URL("./languages/typescript.js", analyzerUrl))
let cases = 0
// Actual native serialization, not the shared adapter's policy oracle.
const path = "ümlaut/💡.ts",
  source = "export function run() { return '💡' }"
const originalByteLength = Buffer.byteLength
const measurements = []
try {
  Buffer.byteLength = function (value, encoding) {
    measurements.push(value)
    return originalByteLength(value, encoding)
  }
  const actual = analyzer.combinedAnalyzerMaterializationPreflight(path, source)
  const artifact = {
    path,
    id: `${path}:function:run`,
    kind: "function",
    name: "run",
    source,
    sourceHash: "0".repeat(64)
  }
  assert.equal(measurements[0], JSON.stringify(artifact))
  assert.deepEqual(JSON.parse(measurements[0]), artifact)
  const root = typeScriptRoot(path, source)
  const node = root.namedChildren[0].namedChildren.find((child) => child.type === "function_declaration")
  const sites = descendants(node)
  assert.deepEqual(
    measurements.slice(1),
    sites.flatMap((site) => [site.text, path])
  )
  let bytes = originalByteLength(JSON.stringify(artifact), "utf8") + 1024
  for (const site of sites)
    bytes += 4 * (1024 + 6 * originalByteLength(site.text, "utf8") + 2 * originalByteLength(path, "utf8"))
  assert.deepEqual(actual, { declarations: 1, expandedUnitBytes: 0 + bytes, hasImports: false })
  cases++
} finally {
  Buffer.byteLength = originalByteLength
}
// One parser per Preflight invocation; no resource is reused by the next command.
const originalParse = Parser.prototype.parse
let parses = 0
try {
  Parser.prototype.parse = function (...args) {
    parses++
    return Reflect.apply(originalParse, this, args)
  }
  const fixture = "interface A { x: string }; function run() {}"
  analyzer.combinedAnalyzerMaterializationPreflight("a.ts", fixture)
  assert.equal(parses, 1)
  analyzer.combinedAnalyzerMaterializationPreflight("a.ts", fixture)
  assert.equal(parses, 2)
  cases++
} finally {
  Parser.prototype.parse = originalParse
}
// Type-phase byte faults propagate by identity; callable byte faults are caught.
const marker = Object.freeze({ nativeFault: "bytes" })
for (const typePhase of [false, true]) {
  try {
    Buffer.byteLength = function (value, encoding) {
      if (typeof value === "string" && value.includes(typePhase ? '"kind":"interface"' : '"kind":"function"'))
        throw marker
      return originalByteLength(value, encoding)
    }
    if (typePhase)
      assert.throws(
        () => analyzer.combinedAnalyzerMaterializationPreflight("a.ts", "interface A { x: string }; function run() {}"),
        (error) => error === marker
      )
    else assert.equal(analyzer.combinedAnalyzerMaterializationPreflight("a.ts", "function run() {}"), undefined)
    cases++
  } finally {
    Buffer.byteLength = originalByteLength
  }
}
// The actual physical driver must preserve faults before Ack and OR short-circuit.
const makeEffects = (fault, events) => {
  const read = (key, value) => {
    events.push(key)
    if (events.length === fault) throw marker
    return value
  }
  return {
    artifactBytes: () => read("artifact", 101),
    observeSites: () => read("sites", 2),
    siteBytes: () => read("site", 7),
    pathBytes: () => read("path", 3),
    typeBytes: () => read("type", -0),
    rootImports: () => read("root-imports", true),
    typeImports: () => {
      assert.fail("root true must skip type imports")
    }
  }
}
const input = { parseValid: true, types: 0, functions: 1 }
const expectedEvents = ["artifact", "sites", "site", "path", "site", "path", "type", "root-imports"]
const expected = { declarations: 1, expandedUnitBytes: 9701, hasImports: true }
const actualEvents = []
assert.deepEqual(native.runTypeScriptPreflight(input, undefined, makeEffects(undefined, actualEvents)), expected)
assert.deepEqual(actualEvents, expectedEvents)
for (let fault = 1; fault <= expectedEvents.length; fault++) {
  const events = []
  assert.throws(
    () => native.runTypeScriptPreflight(input, undefined, makeEffects(fault, events)),
    (error) => error === marker
  )
  assert.deepEqual(events, expectedEvents.slice(0, fault))
  cases++
}
// Numeric coercion may throw inside a group, including its final Add. Preserve
// the old expression's event prefix and thrown identity, with no imports suffix.
for (const field of ["artifactBytes", "siteBytes", "pathBytes", "typeBytes"]) {
  const effects = (events) => {
    const ports = makeEffects(undefined, events),
      read = ports[field]
    ports[field] = (...args) => {
      read(...args)
      return {
        [Symbol.toPrimitive]() {
          events.push(`${field}:coerce`)
          throw marker
        }
      }
    }
    return ports
  }
  const actualEvents = []
  const expectedPrefix = {
    artifactBytes: ["artifact"],
    siteBytes: ["artifact", "sites", "site"],
    pathBytes: ["artifact", "sites", "site", "path"],
    typeBytes: ["artifact", "sites", "site", "path", "site", "path", "type"]
  }[field]
  assert.throws(
    () => native.runTypeScriptPreflight(input, undefined, effects(actualEvents)),
    (error) => error === marker
  )
  assert.deepEqual(actualEvents, [...expectedPrefix, `${field}:coerce`])
  cases++
}
const bound = Object.freeze({ declarations: 1, expandedUnitBytes: 17, hasImports: false })
assert.equal(
  native.runGoPreflight(bound, () => {
    assert.fail("retained Go bound must skip inspection")
  }),
  bound
)
assert.deepEqual(
  native.runGoPreflight(undefined, () => true),
  { declarations: 0, expandedUnitBytes: 0, hasImports: true }
)
assert.equal(
  native.runGoPreflight(undefined, () => false),
  undefined
)
assert.deepEqual(
  native.runGoPreflight(null, () => true),
  { declarations: 0, expandedUnitBytes: 0, hasImports: true }
)
cases += 4
// ObserveSites failure occurs after artifact serialization, within combined catch.
const fixtureRoot = typeScriptRoot("a.ts", "function run() {}")
const wrapped = new WeakMap()
let armed = false,
  observed = false
const wrap = (node) => {
  if (node == null) return node
  if (wrapped.has(node)) return wrapped.get(node)
  const proxy = new Proxy(node, {
    get(target, key) {
      if (key === "namedChildren" && armed && target.type === "function_declaration") {
        observed = true
        throw marker
      }
      const value = Reflect.get(target, key, target)
      if (key === "namedChildren") return value.map(wrap)
      if (key === "parent") return wrap(value)
      return typeof value === "function" ? value.bind(target) : value
    }
  })
  wrapped.set(node, proxy)
  return proxy
}
const originalStringify = JSON.stringify
try {
  JSON.stringify = function (value, ...args) {
    const result = Reflect.apply(originalStringify, JSON, [value, ...args])
    if (value?.sourceHash === "0".repeat(64)) armed = true
    return result
  }
  assert.equal(
    withNativeTypeScriptPreflight("a.ts", "function run() {}", undefined, native.runTypeScriptPreflight, () =>
      wrap(fixtureRoot)
    ),
    undefined
  )
  assert.equal(observed, true)
  cases++
} finally {
  JSON.stringify = originalStringify
}
console.log(
  JSON.stringify({
    cases,
    scope:
      "packaged combined preflight: native sentinel/UTF8 measurements, parser invocation lifetime, phase-specific errors, lazy sites, import short-circuit and Go identity; ordinary physical regression checks"
  })
)
