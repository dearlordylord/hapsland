import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { pathToFileURL } from "node:url"
import { list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"

const A = "active",
  I = "inactive",
  U = "unknown"
const all = (value) => Array(7).fill(value)
const unknown = all(U),
  active = all(A),
  inactive = all(I)
const linux = [U, A, A, I, I, I, I]
const windows = [U, I, I, I, I, A, I]
const android = [U, I, A, I, I, I, I]
const darwin = [U, I, I, A, I, I, I]
const solaris = [U, I, I, I, A, I, I]
const arm64 = [U, I, A, A, I, I, I]
const amd64 = [U, A, I, I, A, I, I]
const unix = [U, A, A, A, A, I, I]
const custom = [U, I, A, I, I, I, A]
const yes = [U, I, I, I, A, I, A]
const absent = [U, I, I, I, I, I, I]
const GO_OS = [
  "aix",
  "android",
  "darwin",
  "dragonfly",
  "freebsd",
  "hurd",
  "illumos",
  "ios",
  "js",
  "linux",
  "netbsd",
  "openbsd",
  "plan9",
  "solaris",
  "wasip1",
  "windows"
]
const GO_ARCH = [
  "386",
  "amd64",
  "arm",
  "arm64",
  "loong64",
  "mips",
  "mipsle",
  "mips64",
  "mips64le",
  "ppc64",
  "ppc64le",
  "riscv64",
  "s390x",
  "wasm"
]
// Native engine observations only: character codes, whitespace and basename.
const raw = (value) => ({
  $: "RawText.Text",
  value,
  characters: list(
    [...value].map((character) => ({
      $: "RawText.Character",
      code: character.codePointAt(0),
      whitespace: /^\s$/u.test(character)
    }))
  )
})
const wireSnapshot = (value) =>
  value === undefined ? { $: "None" } : { $: "Some", value: { $: "Snapshot", ...value, tags: list(value.tags) } }
const membership = (value) => ({ Active: A, Inactive: I, Unknown: U })[value.$]
const temp = mkdtempSync(join(tmpdir(), "hapsland-go-build-"))
try {
  const output = join(temp, "build.mjs")
  execFileSync("bend", [join(import.meta.dirname, "BuildContext.bend"), "-o", output], { timeout: 10000 })
  const core = (await import(pathToFileURL(output))).default
  let configurationCases = 0,
    expressionCases = 0,
    filenameCases = 0,
    fileCases = 0
  for (const text of [
    "",
    "ascii",
    "é",
    "e\u0301",
    "𐐀",
    "\ud800",
    "\udfff",
    "\ud801\udc00",
    "\r\n",
    "\ufeff",
    "\u2028\u2029"
  ]) {
    assert.equal(core["RawTextMeasurement.bytes"](raw(text).characters), new TextEncoder().encode(text).length)
    assert.equal(core["RawTextMeasurement.utf16"](raw(text).characters), text.length)
  }
  const configurations = [
    ...GO_OS.map((goos) => [{ goos, goarch: "amd64", tags: ["z", "a", "a"] }, ["a", "z"]]),
    ...GO_ARCH.map((goarch) => [{ goos: "linux", goarch, tags: [] }, []]),
    ...["", "Linux", "bogus", "\ud800"].map((goos) => [{ goos, goarch: "amd64", tags: [] }, "InvalidTarget"]),
    ...[
      "",
      "unix",
      "cgo",
      "gc",
      "gccgo",
      "linux",
      "amd64",
      "go1.22",
      "goexperiment.x",
      "x.y",
      "x-y",
      "a ",
      "é",
      "𐐀",
      "\ud800",
      "x".repeat(129),
      "x\n",
      "x\r",
      "x\u2028",
      "x\u2029",
      "x\ufeff",
      "x\r\n"
    ].map((tag) => [{ goos: "linux", goarch: "amd64", tags: [tag] }, "InvalidUserTag"]),
    [{ goos: "linux", goarch: "amd64", tags: ["x"] }, ["x"]],
    [{ goos: "linux", goarch: "amd64", tags: ["x".repeat(128)] }, ["x".repeat(128)]],
    [{ goos: "linux", goarch: "amd64", tags: Array(64).fill("same") }, ["same"]],
    [{ goos: "linux", goarch: "amd64", tags: Array(65).fill("same") }, "InvalidUserTag"],
    [{ goos: "bogus", goarch: "bogus", tags: ["bad-tag"] }, "InvalidTarget"]
  ]
  for (const [configuration, expected] of configurations) {
    const actual = core.snapshot(configuration.goos, configuration.goarch, list(configuration.tags.map(raw)))
    if (typeof expected === "string") assert.equal(actual.$, expected, JSON.stringify(configuration))
    else {
      assert.equal(actual.$, "SnapshotValid")
      assert.deepEqual(
        { goos: actual.snapshot.goos, goarch: actual.snapshot.goarch, tags: unlist(actual.snapshot.tags) },
        { goos: configuration.goos, goarch: configuration.goarch, tags: expected }
      )
    }
    configurationCases++
  }
  for (const configuration of [
    { goos: "host", goarch: "arm64", tags: [] },
    { goos: "linux", goarch: "bogus", tags: [] }
  ]) {
    assert.equal(core.snapshot(configuration.goos, configuration.goarch, list([])).$, "InvalidTarget")
    configurationCases++
  }
  for (const tag of ["go1.27", "arm64.v8.0", "foo bar"]) {
    assert.equal(core.snapshot("linux", "arm64", list([raw(tag)])).$, "InvalidUserTag")
    configurationCases++
  }
  const snapshots = [
    undefined,
    { goos: "linux", goarch: "amd64", tags: [] },
    { goos: "android", goarch: "arm64", tags: ["custom"] },
    { goos: "ios", goarch: "arm64", tags: [] },
    { goos: "illumos", goarch: "amd64", tags: ["yes"] },
    { goos: "windows", goarch: "386", tags: [] },
    { goos: "js", goarch: "wasm", tags: ["custom", "yes"] }
  ]
  const atoms = [
    ["linux", linux],
    ["windows", windows],
    ["android", android],
    ["darwin", darwin],
    ["solaris", solaris],
    ["arm64", arm64],
    ["amd64", amd64],
    ["unix", unix],
    ["custom", custom],
    ["yes", yes],
    ["absent", absent],
    ["cgo", unknown],
    ["gc", unknown],
    ["gccgo", unknown],
    ["go1.22", unknown],
    ["x.y", unknown],
    ["_", absent],
    ["123", absent],
    [".", unknown]
  ]
  // Fixed logical outcome tables construct fixture expectations without parsing
  // a Go expression or deriving any target facts in JavaScript.
  const not = { [A]: I, [I]: A, [U]: U }
  const and = { [A]: { [A]: A, [I]: I, [U]: U }, [I]: { [A]: I, [I]: I, [U]: U }, [U]: { [A]: U, [I]: U, [U]: U } }
  const or = { [A]: { [A]: A, [I]: A, [U]: U }, [I]: { [A]: A, [I]: I, [U]: U }, [U]: { [A]: U, [I]: U, [U]: U } }
  const expressions = [
    ...["", " ", "()", "!", "&&", "a & b", "a | b", "a b", "(linux", "linux)", "min(a)", "é", "𐐀", "\ud800"].map(
      (text) => [text, unknown]
    ),
    ["linux\u00a0&&\ufeffunix", linux],
    ["linux\u200b", unknown],
    ["true || cgo", unknown],
    ["false && cgo", unknown],
    ...atoms,
    ...atoms.map(([text, values]) => [`!(${text})`, values.map((v) => not[v])])
  ]
  for (const [a, av] of atoms)
    for (const [b, bv] of [
      ["linux", linux],
      ["cgo", unknown],
      ["custom", custom]
    ])
      expressions.push(
        [`${a} && ${b}`, av.map((v, i) => and[v][bv[i]])],
        [`${a} || ${b}`, av.map((v, i) => or[v][bv[i]])],
        [`!${a} || ${b} && unix`, av.map((v, i) => or[not[v]][and[bv[i]][unix[i]]])],
        [`(${a} || ${b}) && !windows`, av.map((v, i) => and[or[v][bv[i]]][not[windows[i]]])]
      )
  expressions.push(
    ["!".repeat(31) + "linux", linux.map((v) => not[v])],
    ["(".repeat(31) + "linux" + ")".repeat(31), linux],
    ["!".repeat(32) + "linux", linux],
    ["(".repeat(32) + "linux" + ")".repeat(32), linux],
    ["!".repeat(33) + "linux", unknown],
    ["(".repeat(33) + "linux" + ")".repeat(33), unknown],
    [Array(127).fill("linux").join(" && "), linux],
    [Array(128).fill("linux").join(" && "), linux],
    [Array(129).fill("linux").join(" && "), unknown],
    ["a".repeat(4096), absent],
    ["a".repeat(4097), unknown],
    ["é".repeat(2048), unknown],
    ["é".repeat(2049), unknown]
  )
  const osNames = [
    absent,
    android,
    darwin,
    absent,
    absent,
    absent,
    solaris,
    darwin,
    [U, I, I, I, I, I, A],
    linux,
    absent,
    absent,
    absent,
    solaris,
    absent,
    windows
  ]
  const archNames = [
    windows,
    amd64,
    absent,
    arm64,
    absent,
    absent,
    absent,
    absent,
    absent,
    absent,
    absent,
    absent,
    absent,
    [U, I, I, I, I, I, A]
  ]
  const names = [
    ["x.go", active],
    ["x_test.go", inactive],
    [".x.go", inactive],
    ["_x.go", inactive],
    ["x.GO", inactive],
    ["go", inactive],
    ["x", inactive],
    ["x_.go", active],
    ["a__amd64.go", amd64],
    ["a_linux_amd64.go", [U, A, I, I, I, I, I]],
    ["a_android_arm64.go", android],
    ["a_ios.go", darwin],
    ["a_illumos.go", solaris],
    ["amd64.go", active],
    ["x_unknown.go", active],
    ["𐐀_linux.go", linux],
    ["\ud800_linux.go", linux],
    ...GO_OS.map((os, i) => [`d/x_${os}.go`, osNames[i]]),
    ...GO_ARCH.map((arch, i) => [`d/x_${arch}.go`, archNames[i]])
  ]
  const headers = [
    ["package p\n", active],
    ["\n// normal\npackage p\n", active],
    ["package\n", unknown],
    ["// no package\n", unknown],
    ["/* header */\npackage p\n", unknown],
    ["// +build linux\npackage p\n", unknown],
    ["//\t+buildé\npackage p\n", unknown],
    ["// +builder\npackage p\n", active],
    ["// +buildα\npackage p\n", unknown],
    ["//go:build linux\rpackage p\r", unknown],
    ["//go:build\npackage p\n", unknown],
    ["//go:buildlinux\npackage p\n", active],
    ["//go:build linux\n//go:build unix\npackage p\n", unknown],
    ["//go:build linux\npackage p\n//go:build cgo\n", linux],
    ["//go:build linux\r\npackage p\r\n", linux],
    ["//go:build linux\rcgo\npackage p\n", active],
    ["\ufeff//go:build linux\u00a0\npackage\u00a0p\n", linux],
    ["//go:build linux\u2028cgo\npackage p\n", active],
    ...expressions.slice(0, 70).map(([expression, values]) => [`//go:build ${expression}\npackage p\n`, values])
  ]
  const fileVectors = [
    ["root.go", active],
    ["root_linux.go", linux],
    ["root_windows.go", windows],
    ["root_test.go", inactive]
  ]
  for (const [index, snapshot] of snapshots.entries()) {
    const wire = wireSnapshot(snapshot)
    for (const [expression, values] of expressions) {
      assert.equal(
        membership(core.expression(raw(expression), wire)),
        values[index],
        `expression ${JSON.stringify(expression.slice(0, 100))} ${snapshot?.goos}`
      )
      expressionCases++
    }
    for (const [path, values] of names) {
      assert.equal(membership(core.filename(basename(path), wire)), values[index], `filename ${path} ${snapshot?.goos}`)
      filenameCases++
    }
    for (const [path, filenames] of fileVectors)
      for (const [source, values] of headers) {
        const fileOutcomes = { [A]: values[index], [I]: I, [U]: U }
        assert.equal(
          membership(core.file(basename(path), raw(source), wire)),
          fileOutcomes[filenames[index]],
          `file ${path} ${JSON.stringify(source)} ${snapshot?.goos}`
        )
        fileCases++
      }
  }
  // Meaningful cases formerly exercised only by the deleted TS-only unit API.
  const tags = ["paid", "demo", "paid"]
  const unitSnapshot = core.snapshot("linux", "arm64", list(tags.map(raw)))
  tags.push("after")
  assert.equal(unitSnapshot.$, "SnapshotValid")
  assert.deepEqual(unlist(unitSnapshot.snapshot.tags), ["demo", "paid"])
  configurationCases++
  const unitWire = { $: "Some", value: unitSnapshot.snapshot }
  for (const [text, expected] of [
    ["paid && linux && arm64", A],
    ["darwin || linux && !free", A],
    ["(darwin || linux) && free", I],
    ["!paid", I],
    ["!!paid", A],
    ["!goexperiment.rangefunc", U],
    ["amd64.v3", U],
    ["!".repeat(40) + "linux", U]
  ]) {
    assert.equal(membership(core.expression(raw(text), unitWire)), expected, text)
    expressionCases++
  }
  assert.equal(membership(core.filename("model_linux_arm64.go", unitWire)), A)
  filenameCases++
  assert.equal(membership(core.file("model.go", raw("//go:build paid\n\npackage p\n"), unitWire)), A)
  fileCases++
  for (const [target, alias] of [
    ["android", "linux"],
    ["ios", "darwin"],
    ["illumos", "solaris"]
  ]) {
    const aliasSnapshot = core.snapshot(target, "arm64", list([]))
    assert.equal(aliasSnapshot.$, "SnapshotValid")
    configurationCases++
    const wire = { $: "Some", value: aliasSnapshot.snapshot }
    assert.equal(membership(core.expression(raw(`${target} && ${alias} && unix`), wire)), A)
    expressionCases++
    assert.equal(membership(core.filename(`model_${alias}.go`, wire)), A)
    filenameCases++
  }
  console.log(
    JSON.stringify({
      passed: true,
      cases: configurationCases + expressionCases + filenameCases + fileCases,
      configurationCases,
      expressionCases,
      filenameCases,
      fileCases,
      scope:
        "actual Bend GoBuildContext against authored target/tag/filename/header facts and fixed logical outcome tables; native character/basename observations; full configured session and Canonical consumers qualified separately"
    })
  )
} finally {
  rmSync(temp, { recursive: true, force: true })
}
