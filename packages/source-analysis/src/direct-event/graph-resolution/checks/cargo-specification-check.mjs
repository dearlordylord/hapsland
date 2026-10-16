import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { join, sep } from "node:path"
import { pathToFileURL } from "node:url"
import { stringify, parse } from "smol-toml"
import { tomlValue } from "../frontend-codec.ts"
import { unlist } from "@hapsland/source-artifacts/direct-event/value/codec"

const temporary = await mkdtemp("/tmp/hapsland-cargo-authored-")
try {
  assert.equal(sep, "/", "qualifies Linux path spelling only")
  const modules = {}
  for (const [name, source] of [
    ["spec", "CargoSpecificationCheck"],
    ["production", "Cargo"]
  ]) {
    const emitted = join(temporary, name + ".mjs")
    execFileSync("bend", [join(import.meta.dirname, "../" + source + ".bend"), "-o", emitted], { timeout: 10000 })
    modules[name] = (await import(pathToFileURL(emitted))).default
  }
  const pkg = { name: "demo", edition: "2024" }
  const defaultPlan = { raw: ["src/lib.rs", "src/main.rs"], automatic: true, index: 2 }
  const libraryOnly = { raw: ["src/lib.rs"], automatic: false, index: 2 }
  const fixtures = [
    ["default", { package: pkg }, defaultPlan],
    ["edition-2018", { package: { ...pkg, edition: "2018" } }, defaultPlan],
    ["edition-2021", { package: { ...pkg, edition: "2021" } }, defaultPlan],
    ["build-disabled", { package: { ...pkg, build: false } }, defaultPlan],
    ["no-library", { package: { ...pkg, autolib: false } }, { raw: ["src/main.rs"], automatic: true, index: 1 }],
    ["no-auto-binaries", { package: { ...pkg, autobins: false } }, libraryOnly],
    [
      "no-auto-targets",
      { package: { ...pkg, autolib: false, autobins: false } },
      { raw: [], automatic: false, index: 1 }
    ],
    ["empty-library", { package: pkg, lib: {} }, defaultPlan],
    ["date-library", { package: pkg, lib: new Date("2024-01-01T00:00:00Z") }, defaultPlan],
    ["explicit-library-overrides-disable", { package: { ...pkg, autolib: false }, lib: {} }, defaultPlan],
    [
      "custom-library",
      { package: pkg, lib: { path: "custom.rs" } },
      { raw: ["custom.rs", "src/main.rs"], automatic: true, index: 2 }
    ],
    ["empty-explicit-binaries", { package: pkg, bin: [] }, libraryOnly],
    [
      "one-binary",
      { package: pkg, bin: [{ name: "one", path: "one.rs" }] },
      { raw: ["src/lib.rs", "one.rs"], automatic: false, index: 2 }
    ],
    [
      "ordered-binaries",
      {
        package: pkg,
        bin: [
          { name: "one", path: "one.rs" },
          { name: "two", path: "two.rs" }
        ]
      },
      { raw: ["src/lib.rs", "one.rs", "two.rs"], automatic: false, index: 2 }
    ],
    ["zero-limit-defaults", { package: pkg }, defaultPlan, "src/lib.rs", 0],
    ["zero-limit-explicit", { package: pkg, bin: [{ name: "one", path: "one.rs" }] }, undefined, "src/lib.rs", 0],
    [
      "exact-explicit-limit",
      { package: pkg, bin: [{ name: "one", path: "one.rs" }] },
      { raw: ["src/lib.rs", "one.rs"], automatic: false, index: 2 },
      "src/lib.rs",
      1
    ],
    [
      "over-explicit-limit",
      {
        package: pkg,
        bin: [
          { name: "one", path: "one.rs" },
          { name: "two", path: "two.rs" }
        ]
      },
      undefined,
      "src/lib.rs",
      1
    ],
    ["missing-package", {}, undefined],
    ["package-nonrecord", { package: false }, undefined],
    ["empty-name", { package: { ...pkg, name: "" } }, undefined],
    ["name-nontext", { package: { ...pkg, name: false } }, undefined],
    ["edition-2015", { package: { ...pkg, edition: "2015" } }, undefined],
    ["edition-nontext", { package: { ...pkg, edition: 2024 } }, undefined],
    ["build-script", { package: { ...pkg, build: "script.rs" } }, undefined],
    ["build-true", { package: { ...pkg, build: true } }, undefined],
    ["autolib-nonbool", { package: { ...pkg, autolib: "false" } }, undefined],
    ["autobins-nonbool", { package: { ...pkg, autobins: "true" } }, undefined],
    ["library-nonrecord", { package: pkg, lib: false }, undefined],
    ["empty-library-path", { package: pkg, lib: { path: "" } }, undefined],
    ["library-path-nontext", { package: pkg, lib: { path: false } }, undefined],
    ["library-edition", { package: pkg, lib: { edition: "2024" } }, undefined],
    ["binary-nonarray", { package: pkg, bin: false }, undefined],
    ["binary-nonrecord", { package: pkg, bin: [false] }, undefined],
    ["empty-binary", { package: pkg, bin: [{}] }, undefined],
    ["unnamed-binary", { package: pkg, bin: [{ name: "", path: "one.rs" }] }, undefined],
    ["binary-edition", { package: pkg, bin: [{ name: "one", path: "one.rs", edition: "2024" }] }, undefined],
    [
      "duplicate-binary-name",
      {
        package: pkg,
        bin: [
          { name: "one", path: "one.rs" },
          { name: "one", path: "two.rs" }
        ]
      },
      undefined
    ],
    // The production selector returns a raw plan; its actual Rust path driver
    // rejects absolute/escaping/non-rs targets. Canonical fixtures own that check.
    [
      "absolute-library",
      { package: pkg, lib: { path: "/absolute.rs" } },
      undefined,
      "src/lib.rs",
      4,
      { raw: ["/absolute.rs", "src/main.rs"], automatic: true, index: 2 }
    ],
    [
      "absolute-binary",
      { package: pkg, bin: [{ name: "one", path: "/one.rs" }] },
      undefined,
      "src/lib.rs",
      4,
      { raw: ["src/lib.rs", "/one.rs"], automatic: false, index: 2 }
    ],
    [
      "escaping-raw-library",
      { package: pkg, lib: { path: "../outside.rs" } },
      { raw: ["../outside.rs", "src/main.rs"], automatic: true, index: 2 }
    ],
    [
      "non-rs-raw-library",
      { package: pkg, lib: { path: "custom.RS" } },
      { raw: ["custom.RS", "src/main.rs"], automatic: true, index: 2 }
    ]
  ]
  for (const kind of ["test", "example", "bench"])
    fixtures.push(["explicit-" + kind, { package: pkg, [kind]: [] }, undefined])
  for (const selected of [
    "build.rs",
    "tests",
    "tests/check.rs",
    "examples",
    "examples/main.rs",
    "benches",
    "benches/main.rs"
  ])
    fixtures.push(["excluded-selection-" + selected, { package: pkg }, undefined, selected])
  for (const selected of ["src/bin/tool.rs", "src/bin/tool/main.rs", "src/bin/tool/deep.rs", "../outside.rs"])
    fixtures.push(["raw-selection-" + selected, { package: pkg }, defaultPlan, selected])
  const project = (result) =>
    result.$ === "None"
      ? undefined
      : {
          raw: unlist(result.value.raw_targets),
          automatic: result.value.automatic_binary,
          index: result.value.automatic_index
        }
  for (const [
    name,
    manifest,
    expected,
    selected = "src/lib.rs",
    limit = 4,
    productionExpected = expected
  ] of fixtures) {
    const syntax = tomlValue(parse(stringify(manifest)))
    assert.deepEqual(
      project(modules.spec.select(syntax, selected, limit)),
      expected,
      name + " independent specification"
    )
    assert.deepEqual(
      project(modules.production.select(syntax, selected, sep, limit)),
      productionExpected,
      name + " production raw policy"
    )
  }
  console.log(
    JSON.stringify({
      passed: true,
      cases: fixtures.length,
      comparisons: fixtures.length * 2,
      scope:
        "authored Cargo field/selection/raw-plan outcomes on existing production and independent Bend specification; actual Canonical fixtures qualify full path realization, not a JS policy simulator"
    })
  )
} finally {
  await rm(temporary, { recursive: true, force: true })
}
