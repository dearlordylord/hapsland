import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { languageForPath } from "@hapsland/source-analysis/direct-event/languages/registry"
import { readNat } from "@hapsland/canonical-policy/canonical/boundary-schema"

// Authored reference/effect decisions, not a resolver or a serialized result inventory.
// Parsers supply declaration bytes/identity only. No imports, budgets or traversal
// are interpreted here; every connection, omission, capture and cache write is explicit.
const clocks = (count, effects = []) =>
  Array.from({ length: count }, (_, tick) => [
    ["clock", tick],
    ...effects.filter(([at]) => at === tick).map(([, event]) => event)
  ]).flat()
const capture = (after, path) => [after, ["capture", path]]
const diagnostic = (after, path, code, args = {}) => [after, ["diagnostic", path, { stage: "capture", code, args }]]
const errorShape = (error) => ({
  name: error.name,
  message: error.message,
  cause: { name: error.cause?.name, message: error.cause?.message }
})

// Fixed Go fixture hash preimages: package/status/capture facts are enumerated,
// not discovered. This asserts Bend's hash input decisions using native JSON/SHA.
function goFixtureBinding(sources, dependency, configuration) {
  const hash = (value) => createHash("sha256").update(value).digest("hex")
  const facts = [
    [".", ["root.go"]],
    ["root.go", hash(sources.get("root.go"))],
    ["go.work", "absent"],
    ["go.mod", "file"],
    ["go.mod", hash(sources.get("go.mod"))]
  ]
  if (dependency) {
    assert.ok(dependency === "lib/leaf.go" || dependency === "domain/child.go", "unknown Go fixture dependency")
    const directory = dependency === "lib/leaf.go" ? "lib" : "domain"
    facts.push(
      [directory + "/go.mod", "absent"],
      [directory, [dependency]],
      [dependency, hash(sources.get(dependency))]
    )
  }
  if (configuration !== undefined) assert.deepEqual(configuration, { goos: "linux", goarch: "amd64", tags: ["custom"] })
  return hash(
    JSON.stringify([
      configuration === undefined ? "unconfigured" : "configured-go",
      configuration === undefined
        ? "unconditional"
        : hash(JSON.stringify({ goos: "linux", goarch: "amd64", tags: ["custom"] })),
      facts
    ])
  )
}

export function fixtureExpectation(fixture, sources) {
  const path = fixture.path ?? "root.ts"
  const artifacts = new Map()
  const declaration = (file, name) => {
    const key = file + ":" + name
    if (artifacts.has(key)) return artifacts.get(key)
    const language = languageForPath(file)
    const facts =
      fixture.branch === "function"
        ? language?.analyzeFunctions?.(file, sources.get(file))?.functions
        : language?.inspect(file, sources.get(file))?.declarations
    const artifact = facts?.get(name)?.artifact
    assert.ok(artifact, `authored fixture declaration ${file}:${name}`)
    artifacts.set(key, artifact)
    return artifact
  }
  const node = (file, name, references = []) => ({ artifact: declaration(file, name), references })
  const expand = (symbol, file, name, references = []) => ({
    kind: "expanded",
    site: { symbol },
    node: node(file, name, references)
  })
  const include = (symbol, file, name) => ({ kind: "included", site: { symbol }, target: declaration(file, name).id })
  const omit = (symbol, reason) => ({
    kind: "omitted",
    site: { symbol },
    target: { kind: "unresolved", symbol },
    reason
  })
  const unit = (references = [], dependencies = []) => ({
    root: node(path, "Root", references),
    sourceDependencies: dependencies
  })
  const goUnit = (references, dependencies, dependency) => ({
    bindingFingerprint: goFixtureBinding(sources, dependency),
    ...unit(references, dependencies)
  })
  const result = (value, ticks, effects = [], cacheAdds = []) => ({ value, events: clocks(ticks, effects), cacheAdds })
  const noUnit = (ticks, effects = [], cacheAdds = []) => result(undefined, ticks, effects, cacheAdds)
  const rootRefusal = (symbol, ticks = 4, dependencies = [], effects = [], cacheAdds = []) =>
    result(
      unit([omit("Root", "unsupported"), ...(symbol ? [omit(symbol, "unresolved")] : [])], dependencies),
      ticks,
      effects,
      cacheAdds
    )
  const rustImport = (
    target,
    name = "A",
    dependencies = ["Cargo.toml"],
    ticks = 15,
    effects = [capture(4, "Cargo.toml"), capture(12, target)],
    cacheAdds = [path, "Cargo.toml", target]
  ) => result(unit([expand(name, target, name)], dependencies), ticks, effects, cacheAdds)
  const child = (target = "a.ts", name = "A", references = []) =>
    result(unit([expand(name, target, name, references)]), 8, [capture(5, target)])
  switch (fixture.name) {
    case "go-root-type":
      return result(goUnit([], ["go.mod"]), 11, [capture(5, "go.mod")])
    case "go-local-type-cycle":
      return result(goUnit([expand("Child", path, "Child", [include("Root", path, "Root")])], ["go.mod"]), 11, [
        capture(5, "go.mod")
      ])
    case "go-import-local-module":
      return result(
        goUnit([expand("domain.Child", "domain/child.go", "Child")], ["domain/child.go", "go.mod"], "domain/child.go"),
        16,
        [capture(5, "go.mod"), capture(10, "domain/child.go")]
      )
    case "python-empty-file-budget":
    case "python-preparation-deadline":
      return noUnit(2)
    case "python-function-unsupported":
    case "python-deadline-before-complete":
      return noUnit(3)
    case "python-tree-refusal":
      return noUnit(4)
    case "python-class-local-cycle":
      return result(unit([expand("Child", path, "Child", [include("Root", path, "Root")])]), 6)
    case "python-class-diamond":
      return result(
        unit([
          expand("Left", path, "Left", [expand("Leaf", path, "Leaf")]),
          expand("Right", path, "Right", [include("Leaf", path, "Leaf")])
        ]),
        6
      )
    case "python-type-alias":
    case "python-local-work-refusal":
      return result(unit([expand("Child", path, "Child")]), 6)
    case "python-import-unsupported":
      return result(unit([expand("Child", "other.py", "Child")]), 23, [capture(13, "other.py")])
    case "bend-unsupported-relative-import":
      return rootRefusal("A.A")
    case "absolute-import-spelling":
      return noUnit(2)
    case "typescript-js-replacement":
    case "typescript-uppercase-js-replacement":
      return child()
    case "typescript-mjs-replacement":
      return child("a.mts")
    case "typescript-cjs-replacement":
      return child("a.cts")
    case "bend-qualified-import":
      return result(unit([expand("A.A", "a.bend", "A")]), 8, [capture(5, "a.bend")])
    case "mixed-file-bundle":
    case "bend-bundled-list": {
      const declarations = [...languageForPath(path).supportingTypes(path, sources.get(path)).values()]
      const matches = declarations.filter((value) => value.artifact.name === "List")
      assert.equal(matches.length, 1, "one authored bundled List declaration")
      const artifact = matches[0].artifact
      const bundled = { artifact, references: [{ kind: "included", site: { symbol: "List" }, target: artifact.id }] }
      const references = [{ kind: "expanded", site: { symbol: "List" }, node: bundled }]
      if (fixture.name === "mixed-file-bundle")
        return result(unit([...references, expand("A.A", "a.bend", "A")]), 12, [capture(9, "a.bend")])
      return result(unit(references), 8)
    }
    case "large-local-reuse": {
      const shared = (i) => (i === 6 ? expand("Shared", path, "Shared") : include("Shared", path, "Shared"))
      const upper = (i) =>
        expand(
          `C${i}`,
          path,
          `C${i}`,
          Array.from({ length: 6 }, (_, j) =>
            i === 0 ? expand(`C${j + 6}`, path, `C${j + 6}`, [shared(j + 6)]) : include(`C${j + 6}`, path, `C${j + 6}`)
          )
        )
      return result(
        unit([
          ...Array.from({ length: 6 }, (_, i) => upper(i)),
          ...Array.from({ length: 6 }, (_, i) => include(`C${i + 6}`, path, `C${i + 6}`))
        ]),
        4
      )
    }
    case "large-import-diamond-cycle": {
      const children = Array.from({ length: 6 }, (_, i) => `a${i}.ts`)
      const refs = children.map((file, i) =>
        expand(`A${i}`, file, `A${i}`, [
          expand(`Leaf${i}`, file, `Leaf${i}`),
          i === 0
            ? expand("Shared", "shared.ts", "Shared", [include("Root", path, "Root")])
            : include("Shared", "shared.ts", "Shared")
        ])
      )
      return result(
        unit(refs),
        44,
        [...children.map((file, i) => capture(5 + i * 4, file)), capture(29, "shared.ts")],
        [...children, "shared.ts"]
      )
    }
    case "rust-malformed-cargo-port":
      return rootRefusal(undefined, 11, ["Cargo.toml"], [capture(4, "Cargo.toml")], [path, "Cargo.toml"])
    case "rust-function-binding-unsupported":
      return noUnit(9, [capture(4, "Cargo.toml")], [path, "Cargo.toml"])
    case "rust-absolute-cargo-library":
    case "rust-escaping-cargo-library":
    case "rust-non-rs-cargo-library":
      return rootRefusal("A", 11, ["Cargo.toml"], [capture(4, "Cargo.toml")], [path, "Cargo.toml"])
    case "rust-flat-automatic-cargo-binary":
      return rustImport("src/bin/a.rs")
    case "rust-directory-automatic-cargo-binary":
      return rustImport("src/bin/tool/a.rs")
    case "rust-preparation-observer-error":
    case "rust-preparation-capture-unavailable":
      return rootRefusal(
        "A",
        9,
        [],
        [capture(4, "Cargo.toml"), diagnostic(4, "Cargo.toml", "fixture-unavailable")],
        [path]
      )
    case "rust-private-preparation-cache":
    case "rust-context-read-policy":
    case "rust-date-library":
    case "rust-cargo-root":
      return rustImport("src/a.rs")
    case "rust-custom-library":
      return rustImport("library/a.rs")
    case "rust-automatic-bin":
      return rustImport("src/bin/a.rs")
    case "rust-explicit-bin":
      return rustImport("apps/a.rs")
    case "rust-unicode-multiple-roles":
      return result(
        unit([], ["Cargo.toml", "src/\u{10000}.rs", "src/\ue000.rs"]),
        19,
        [capture(4, "Cargo.toml"), capture(8, "src/\ue000.rs"), capture(12, "src/\u{10000}.rs")],
        [path, "Cargo.toml", "src/\ue000.rs", "src/\u{10000}.rs"]
      )
    case "rust-nonfile-manifest":
      return result(unit(), 9, [], [path])
    case "rust-preparation-work-refusal":
      return noUnit(7, [capture(4, "Cargo.toml")], [path, "Cargo.toml"])
    case "rust-deadline-before-complete":
      return noUnit(5, [], [path])
    case "rust-cargo-depth":
      return rootRefusal("B", 11, ["Cargo.toml"], [capture(4, "Cargo.toml")], [path, "Cargo.toml"])
    case "rust-local":
      return result(unit(), 5)
    case "rust-cargo-child":
      return rustImport(
        "src/b.rs",
        "B",
        ["Cargo.toml", "src/lib.rs"],
        19,
        [capture(4, "Cargo.toml"), capture(8, "src/lib.rs"), capture(16, "src/b.rs")],
        [path, "Cargo.toml", "src/lib.rs", "src/b.rs"]
      )
    case "rust-cargo-nested":
      return rustImport(
        "src/b.rs",
        "B",
        ["Cargo.toml", "src/a/mod.rs", "src/lib.rs"],
        23,
        [capture(4, "Cargo.toml"), capture(8, "src/lib.rs"), capture(12, "src/a/mod.rs"), capture(20, "src/b.rs")],
        [path, "Cargo.toml", "src/lib.rs", "src/a/mod.rs", "src/b.rs"]
      )
    case "rust-cargo-ambiguous-module":
      return rootRefusal(
        "B",
        15,
        ["Cargo.toml", "src/lib.rs"],
        [capture(4, "Cargo.toml"), capture(8, "src/lib.rs")],
        [path, "Cargo.toml", "src/lib.rs"]
      )
    case "rust-cargo-build":
      return rootRefusal(undefined, 11, ["Cargo.toml"], [capture(4, "Cargo.toml")], [path, "Cargo.toml"])
    case "rust-no-manifest":
      return result(unit(), 7, [], [path])
    case "rust-cargo-cache-refusal":
      return rootRefusal(
        undefined,
        9,
        [],
        [diagnostic(4, "Cargo.toml", "capture-budget-limit", { resource: "files", used: 65, requested: 1, limit: 64 })],
        [path]
      )
    case "bundled":
      return result(unit(), 4)
    case "negative-graph-work": {
      let error
      try {
        readNat(-1)
      } catch (value) {
        error = value
      }
      return { ...noUnit(10, [capture(5, "a.ts"), capture(9, "b.ts")], ["a.ts", "b.ts"]), error }
    }
    case "single-child":
      return child("a.ts", "A", [expand("Local", "a.ts", "Local")])
    case "bend-import":
      return rootRefusal("A")
    case "function-import":
      return child()
    case "nested-child":
      return result(unit([expand("A", "a.ts", "A", [expand("B", "b.ts", "B")])]), 12, [
        capture(5, "a.ts"),
        capture(9, "b.ts")
      ])
    case "rollback-pending-owner":
      return result(unit([omit("A", "reference-limit")]), 8, [capture(5, "a.ts")])
    case "tree-refusal":
      return result(unit([omit("A", "reference-limit")]), 8, [capture(5, "a.ts")])
    case "missing":
    case "ambiguous":
    case "outside":
    case "unsupported-extension":
      return result(unit([omit("A", "unavailable")]), 6)
    case "root-cycle":
      return result(unit([include("A", path, "Root")]), 6)
    case "unsupported-frontend":
      return result(unit([omit("A", "unavailable")]), 8, [capture(5, "a.ts")])
    case "source-oversize":
      return result(unit([omit("A", "unavailable")]), 7)
    case "cache-files":
      return result(unit([omit("A", "unavailable")]), 8, [
        diagnostic(5, "a.ts", "capture-budget-limit", { resource: "files", used: 64, requested: 1, limit: 64 })
      ])
    case "cache-bytes":
      return result(unit([omit("A", "unavailable")]), 8, [
        diagnostic(5, "a.ts", "capture-budget-limit", {
          resource: "bytes",
          used: 16777216,
          requested: 2097152,
          limit: 16777216
        })
      ])
    case "capture-unavailable":
      return result(unit([omit("A", "unavailable")]), 8, [
        capture(5, "a.ts"),
        diagnostic(5, "a.ts", "fixture-unavailable")
      ])
    case "bend-final-publication-deadline":
      return noUnit(4)
    default:
      throw new Error("Missing authored Graph expectation: " + fixture.name)
  }
}

export function assertFixtureOutcome({ fixture, sources, stable, actual, error, events, cache }) {
  const expected = fixtureExpectation(fixture, sources)
  if (expected.error) {
    assert.ok(error instanceof TypeError, fixture.name + " retains negative-work technical refusal")
    assert.deepEqual(errorShape(error), errorShape(expected.error), fixture.name + " native validation error")
  } else {
    assert.ifError(error)
    assert.deepEqual(actual, expected.value, fixture.name + " entire authored ReviewUnit")
  }
  assert.deepEqual(events, expected.events, fixture.name + " physical effect order")
  if (cache) {
    const expectedCache = new Map(fixture.cache)
    for (const file of expected.cacheAdds) expectedCache.set(file, stable(file))
    assert.deepEqual([...cache], [...expectedCache], fixture.name + " exact caller cache")
    for (const [file, value] of fixture.cache)
      if (!expected.cacheAdds.includes(file))
        assert.equal(cache.get(file), value, fixture.name + " retained cache identity")
  }
}

// The two physical admission fixtures above the 58 supplied cases have fixed
// sources too. Native parsing supplies artifacts, never the expected expansion.
export function physicalRootExpectation(path, source, name, configuration) {
  assert.ok(path === "root.py" || path === "root.go", "unknown physical Graph fixture path")
  const python = path === "root.py"
  const dependency = python ? "leaf.py" : "lib/leaf.go"
  const leafSource = python ? "class Foo:\n value: str\n" : "package lib\ntype Foo struct { Value string }\n"
  const language = languageForPath(path)
  return {
    ...(python
      ? {}
      : {
          bindingFingerprint: goFixtureBinding(
            new Map([
              [path, source],
              ["go.mod", "module example\n"],
              [dependency, leafSource]
            ]),
            dependency,
            configuration
          )
        }),
    root: {
      artifact: language.inspect(path, source).declarations.get(name).artifact,
      references: [
        {
          kind: "expanded",
          site: { symbol: python ? "Foo" : "lib.Foo" },
          node: { artifact: language.inspect(dependency, leafSource).declarations.get("Foo").artifact, references: [] }
        }
      ]
    },
    sourceDependencies: python ? [] : ["go.mod", dependency]
  }
}

// Failure prefixes are authored independently of both drivers. A failed capture
// must preserve the original defect, stop all suffix effects and retain only
// captures completed before the failure.
export function assertProviderFailureOutcome({ fixture, events, cache, stable }) {
  let expectedEvents, expectedCache
  switch (fixture.name) {
    case "expansion-capture-provider-error":
      expectedEvents = clocks(10, [capture(5, "a0.ts"), capture(9, "a1.ts")])
      expectedCache = [["a0.ts", stable("a0.ts")]]
      break
    case "preparation-capture-provider-error":
      expectedEvents = clocks(5, [capture(4, "Cargo.toml")])
      expectedCache = [["src/lib.rs", stable("src/lib.rs")]]
      break
    case "private-preparation-capture-provider-error":
      expectedEvents = clocks(13, [capture(4, "Cargo.toml"), capture(12, "src/a.rs")])
      assert.equal(cache, undefined, "private preparation never exposes its effective cache")
      break
    default:
      throw new Error("Unknown capture failure fixture: " + fixture.name)
  }
  assert.deepEqual(events, expectedEvents, fixture.name + " exact prefix and no effects after failure")
  if (cache) assert.deepEqual([...cache], expectedCache, fixture.name + " retained successful captures only")
}
