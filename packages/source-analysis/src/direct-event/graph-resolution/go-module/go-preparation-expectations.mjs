import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { inspectGoFile } from "../../languages/go.ts"
import { factDeclaration } from "../frontend-codec.ts"
import { list } from "@hapsland/source-artifacts/direct-event/value/codec"
const sha = (text) => createHash("sha256").update(text).digest("hex")
const clocks = (count, captures = []) =>
  Array.from({ length: count }, (_, i) => [
    ["clock"],
    ...captures
      .filter(([tick]) => tick === i + 1)
      .flatMap(([, path]) => [
        ["capture", path],
        ["read", path],
        ["read", path]
      ])
  ]).flat()
const local = (name, fields = {}) => ({ $: "traversal/core." + name, ...fields })
const ref = (symbol, binding) => ({
  $: "Types.FactReference",
  kind: binding === undefined ? local("Unsupported") : local("BoundNamed", { binding }),
  name: symbol,
  expected: local("AnyKind"),
  target: { $: "None" }
})

// These are finite authored package/edge/effect plans. The parser supplies only
// artifact identity, source/location and export metadata. No package discovery,
// import resolution, budget decision or fingerprint input is read from Bend.
export function goPreparationExpectation(fixture, limits) {
  const files = fixture.files,
    path = fixture.path ?? "root.go",
    name = fixture.name
  const parsed = new Map(),
    nativeArtifacts = new Map()
  const file = (path) => {
    if (!parsed.has(path)) parsed.set(path, inspectGoFile(path, files[path]))
    assert.ok(parsed.get(path), "fixture parser facts " + path)
    return parsed.get(path)
  }
  const constant = (path) => file(path).constants[0].artifact.name
  const declaration = (path, name, key = name, references = []) => {
    const parsed = file(path)
    const source = [...parsed.types, ...parsed.constants].find((value) => value.artifact.name === name)
    assert.ok(source, "authored declaration " + path + ":" + name)
    nativeArtifacts.set(key, source.artifact)
    const value = {
      ...factDeclaration(name, { ...source, exported: source.exported ?? false, references: [] }),
      references: list(references)
    }
    const position = (value) => ({ $: "Types.GoSourcePosition", ...value })
    return {
      key,
      value,
      location: source.location
        ? {
            $: "Some",
            value: {
              $: "Types.GoSourceLocation",
              start: position(source.location.start),
              end: position(source.location.end)
            }
          }
        : { $: "None" }
    }
  }
  const root = (refs = []) => declaration(path, "Root", "Root", refs)
  const hashFile = (path) => [path, sha(files[path])]
  const packageFacts = (directory, paths, captured = paths) => [[directory, paths], ...captured.map(hashFile)]
  const absent = (path) => [path, "absent"]
  let prepared = true,
    count = 6,
    captures = [],
    deps = [],
    spentWork = 6,
    declarations = [root()],
    error
  let identities = [...packageFacts(path === "root.go" ? "." : "sub", [path]), absent("go.work"), absent("go.mod")]
  const moduleFacts = () => [
    ...packageFacts(path === "root.go" ? "." : "sub", [path]),
    ["go.work", name === "workspace" ? "file" : "absent"],
    ["go.mod", "file"],
    hashFile("go.mod")
  ]
  const moduleOnly = (work = 6, ticks = 7) => {
    deps = ["go.mod"]
    captures = [[5, "go.mod"]]
    count = ticks
    spentWork = work
    identities = moduleFacts()
  }
  const imported = (symbol = "lib.T", target = "lib/lib.go", key = "lib::T", type = "T", work = 12) => {
    moduleOnly(work, 12)
    deps.push(target)
    captures.push([10, target])
    declarations = [root([ref(symbol, key)]), declaration(target, type, key)]
    identities.push(absent("lib/go.mod"), ...packageFacts("lib", [target]))
  }
  switch (name) {
    case "single":
    case "inventory-128":
      break
    case "sibling":
      count = 7
      captures = [[2, "other.go"]]
      deps = ["other.go"]
      spentWork = 8
      declarations = [declaration("other.go", "Other"), root([ref("Other", "Other")])]
      identities = [...packageFacts(".", ["other.go", "root.go"]), absent("go.work"), absent("go.mod")]
      break
    case "module-import":
    case "module-grammar-0":
    case "module-grammar-6":
    case "module-grammar-7":
    case "module-grammar-8":
      imported()
      break
    case "foreign-constant": {
      imported("lib.T", "lib/lib.go", "lib::T", "T", 20)
      count = 13
      const c = constant(path)
      declarations = [
        root([ref(c, c)]),
        declaration(path, c, c, [ref("lib.T", "lib::T")]),
        declaration("lib/lib.go", "T", "lib::T", [ref(c, c)])
      ]
      break
    }
    case "module-unavailable":
    case "workspace":
    case "no-caller-cache":
    case "ignored-imports":
      moduleOnly()
      break
    case "mixed-package":
      prepared = false
      count = 3
      captures = [[2, "other.go"]]
      break
    case "generated":
    case "cgo":
    case "unknown-build":
    case "excluded-sibling":
    case "work-2":
    case "work-3":
    case "source-cap":
    case "read-cap":
      prepared = false
      count = 2
      break
    case "files-zero":
    case "files-one-sibling":
    case "deadline":
    case "inventory-129":
    case "work-0":
    case "work-1":
      prepared = false
      count = 1
      break
    case "function":
      prepared = false
      count = 0
      break
    case "invalid-target":
    case "invalid-tag":
      prepared = false
      count = 0
      error = {
        name: "RangeError",
        message: name === "invalid-target" ? "Unsupported Go analysis target" : "Unsupported Go analysis user tag"
      }
      break
    case "active-build":
      identities = [...packageFacts(".", ["root.go"]), absent("go.work"), absent("go.mod")]
      break
    case "inactive-sibling":
      identities = [...packageFacts(".", ["root.go", "s_windows.go"], ["root.go"]), absent("go.work"), absent("go.mod")]
      break
    case "work-4":
      spentWork = 3
      count = 7
      identities = [...packageFacts(".", ["root.go"]), ["go.mod", "ineligible"]]
      break
    case "work-8":
    case "work-20":
      break
    case "nested-root":
      moduleOnly(8, 9)
      captures = [[7, "go.mod"]]
      identities = [
        ...packageFacts("sub", [path]),
        absent("sub/go.work"),
        absent("sub/go.mod"),
        absent("go.work"),
        ["go.mod", "file"],
        hashFile("go.mod")
      ]
      break
    case "depth-zero":
      identities = [...packageFacts("sub", [path]), absent("sub/go.work"), absent("sub/go.mod")]
      break
    case "module-grammar-1":
    case "module-grammar-2":
    case "module-grammar-3":
    case "module-grammar-4":
    case "module-grammar-5":
    case "module-grammar-9":
      moduleOnly()
      declarations = [root([ref("lib.T")])]
      break
    case "nested-module":
      moduleOnly(8, 9)
      declarations = [root([ref("lib.T")])]
      identities.push(["lib/go.mod", "file"])
      break
    case "internal-allowed":
      moduleOnly(13, 13)
      deps.push("internal/lib/lib.go")
      captures.push([11, "internal/lib/lib.go"])
      declarations = [
        root([ref("lib.T", "internal/lib::T")]),
        declaration("internal/lib/lib.go", "T", "internal/lib::T")
      ]
      identities.push(
        absent("internal/lib/go.mod"),
        absent("internal/go.mod"),
        ...packageFacts("internal/lib", ["internal/lib/lib.go"])
      )
      break
    case "internal-denied":
      moduleOnly(7, 8)
      declarations = [root([ref("lib.T")])]
      break
    case "import-main":
      imported()
      declarations[0] = root([ref("main.T")])
      break
    case "duplicate-alias":
      moduleOnly(18, 17)
      deps.push("a/a.go", "b/b.go")
      captures.push([10, "a/a.go"], [14, "b/b.go"])
      declarations = [root([ref("x.T")]), declaration("a/a.go", "T", "a::T"), declaration("b/b.go", "T", "b::T")]
      identities.push(
        absent("a/go.mod"),
        ...packageFacts("a", ["a/a.go"]),
        absent("b/go.mod"),
        ...packageFacts("b", ["b/b.go"])
      )
      break
    case "shadowed-alias":
      imported()
      spentWork = 13
      count = 13
      captures = [
        [3, "shadow.go"],
        [6, "go.mod"],
        [11, "lib/lib.go"]
      ]
      deps.push("shadow.go")
      declarations[0] = root([ref("x.T")])
      identities = [
        ...packageFacts(".", ["root.go", "shadow.go"]),
        absent("go.work"),
        ["go.mod", "file"],
        hashFile("go.mod"),
        absent("lib/go.mod"),
        ...packageFacts("lib", ["lib/lib.go"])
      ]
      break
    case "unicode-exported": {
      imported("α.Τ", "lib/lib.go", "lib::Τ", "Τ", 21)
      count = 13
      const c = constant(path)
      declarations = [
        root([ref("α.Τ", "lib::Τ")]),
        declaration(path, c, c, [ref("α.Τ", "lib::Τ")]),
        declaration("lib/lib.go", "Τ", "lib::Τ", [ref(c, c)])
      ]
      break
    }
    case "private-constant": {
      const c = constant("lib/lib.go")
      imported("lib.c", "lib/lib.go", "lib::" + c, c, 15)
      declarations = [root([ref("lib.c")]), declaration("lib/lib.go", c, "lib::" + c)]
      break
    }
    case "import-cycle":
      imported()
      spentWork = 13
      count = 13
      declarations[1] = declaration("lib/lib.go", "T", "lib::T", [ref("p.Root", "Root")])
      break
    case "excluded-module":
      count = 7
      identities = [...packageFacts(".", ["root.go"]), absent("go.work"), ["go.mod", "file"], ["go.mod", "ineligible"]]
      break
    case "utf16-order":
      count = 8
      captures = [
        [3, "\u{10000}.go"],
        [4, "\ue000.go"]
      ]
      deps = ["\u{10000}.go", "\ue000.go"]
      spentWork = 10
      declarations = [root(), declaration("\u{10000}.go", "Supplementary"), declaration("\ue000.go", "BMP")]
      identities = [...packageFacts(".", ["root.go", "\u{10000}.go", "\ue000.go"]), absent("go.work"), absent("go.mod")]
      break
    default:
      throw new Error("Unspecified Go fixture " + name)
  }
  // Configuration normalization is an authored fact for the only two valid
  // configured fixtures; invalid targets/tags fail before any hash or clock.
  const configuration =
    name === "active-build"
      ? { goos: "linux", goarch: "amd64", tags: ["a"] }
      : name === "inactive-sibling"
        ? { goos: "linux", goarch: "amd64", tags: [] }
        : undefined
  const fingerprintInput = [
    "unconfigured",
    configuration ? sha(JSON.stringify(configuration)) : "unconditional",
    identities
  ]
  const expectedLimits = {
    $: "../../../../agent-flow-bend/ImportGraph.Limits",
    version: 1,
    source_bytes: limits.sourceBytes,
    tree_bytes: limits.treeBytes,
    files: limits.files - deps.length,
    read_bytes: limits.readBytes - deps.reduce((sum, path) => sum + Buffer.byteLength(files[path]), 0),
    outgoing_edges: limits.outgoingEdges,
    depth: limits.depth,
    work: limits.work - spentWork
  }
  const node = (key, references = []) => {
    assert.ok(nativeArtifacts.has(key), "authored whole artifact " + key)
    return { artifact: nativeArtifacts.get(key), references }
  }
  const expand = (symbol, key, references = []) => ({ kind: "expanded", site: { symbol }, node: node(key, references) })
  const include = (symbol, key) => ({ kind: "included", site: { symbol }, target: nativeArtifacts.get(key).id })
  const omit = (symbol) => ({
    kind: "omitted",
    site: { symbol },
    target: { kind: "unresolved", symbol },
    reason: "unsupported"
  })
  let references = []
  switch (name) {
    case "sibling":
      references = [expand("Other", "Other")]
      break
    case "module-import":
    case "module-grammar-0":
    case "module-grammar-6":
    case "module-grammar-7":
    case "module-grammar-8":
      references = [expand("lib.T", "lib::T")]
      break
    case "foreign-constant": {
      const c = constant(path)
      references = [expand(c, c, [expand("lib.T", "lib::T", [include(c, c)])])]
      break
    }
    case "unicode-exported": {
      const c = constant(path)
      references = [expand("α.Τ", "lib::Τ", [expand(c, c, [include("α.Τ", "lib::Τ")])])]
      break
    }
    case "import-cycle":
      references = [expand("lib.T", "lib::T", [include("p.Root", "Root")])]
      break
    case "internal-allowed":
      references = [expand("lib.T", "internal/lib::T")]
      break
    case "internal-denied":
    case "nested-module":
    case "module-grammar-1":
    case "module-grammar-2":
    case "module-grammar-3":
    case "module-grammar-4":
    case "module-grammar-5":
    case "module-grammar-9":
      references = [omit("lib.T")]
      break
    case "import-main":
      references = [omit("main.T")]
      break
    case "duplicate-alias":
    case "shadowed-alias":
      references = [omit("x.T")]
      break
    case "private-constant":
      references = [omit("lib.c")]
      break
  }
  const whole = prepared
    ? {
        bindingFingerprint: sha(JSON.stringify(fingerprintInput)),
        root: node("Root", references),
        sourceDependencies: deps.slice().sort()
      }
    : undefined
  return {
    prepared,
    error,
    whole,
    wholeError:
      name === "depth-zero"
        ? { name: "RangeError", message: "graphLimits.depth must be an integer from 1 to 4" }
        : error,
    wholeEvents: clocks(
      count + (name === "depth-zero" ? 2 : prepared ? 4 : 1),
      captures.map(([tick, path]) => [tick + 1, path])
    ),
    declarations,
    dependencies: deps.slice().sort(),
    limits: expectedLimits,
    fingerprint: sha(JSON.stringify(fingerprintInput)),
    hashInputs: prepared ? [...(configuration ? [configuration] : []), fingerprintInput] : [],
    events: clocks(count, captures),
    cachePaths: captures.map(([, path]) => path)
  }
}
