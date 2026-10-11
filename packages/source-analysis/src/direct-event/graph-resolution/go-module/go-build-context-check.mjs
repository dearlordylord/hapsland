import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { pathToFileURL } from "node:url"
import {
  GO_OS,
  GO_ARCH,
  freezeGoBuildSnapshot,
  evaluateGoBuildExpression,
  goFilenameMembership,
  goFileMembership
} from "../../languages/go-build-context.ts"
import { list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"

// Only engine observations: no token, constraint or membership computation.
const raw = (value) => ({
  $: "RawText.Text",
  value,
  characters: list(
    [...value].map((character) => ({
      $: "RawText.Character",
      code: BigInt(character.codePointAt(0)),
      whitespace: /^\s$/u.test(character)
    }))
  )
})
const wireSnapshot = (value) =>
  value === undefined
    ? { $: "None" }
    : { $: "Some", value: { $: "Snapshot", goos: value.goos, goarch: value.goarch, tags: list(value.tags) } }
const membership = (value) => ({ Active: "active", Inactive: "inactive", Unknown: "unknown" })[value.$]
const temp = mkdtempSync(join(tmpdir(), "hapsland-go-build-"))
try {
  const output = join(temp, "build.mjs")
  execFileSync("bend", [join(import.meta.dirname, "BuildContext.bend"), "-o", output], { timeout: 5000 })
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
    assert.equal(
      core["RawText.bytes"](raw(text).characters),
      BigInt(new TextEncoder().encode(text).length),
      JSON.stringify(text)
    )
    assert.equal(core["RawText.utf16"](raw(text).characters), BigInt(text.length))
  }
  const configurations = [
    ...GO_OS.map((goos) => ({ goos, goarch: "amd64", tags: ["z", "a", "a"] })),
    ...GO_ARCH.map((goarch) => ({ goos: "linux", goarch, tags: [] })),
    ...["", "Linux", "bogus", "\ud800"].map((goos) => ({ goos, goarch: "amd64", tags: [] })),
    ...[
      "",
      "x",
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
      "x".repeat(128),
      "x".repeat(129),
      "x\n",
      "x\r",
      "x\u2028",
      "x\u2029",
      "x\ufeff",
      "x\r\n"
    ].map((tag) => ({ goos: "linux", goarch: "amd64", tags: [tag] })),
    { goos: "linux", goarch: "amd64", tags: Array(64).fill("same") },
    { goos: "linux", goarch: "amd64", tags: Array(65).fill("same") },
    { goos: "bogus", goarch: "bogus", tags: ["bad-tag"] }
  ]
  for (const configuration of configurations) {
    let native, failure
    try {
      native = freezeGoBuildSnapshot(configuration)
    } catch (error) {
      failure = error
    }
    const actual = core.snapshot(configuration.goos, configuration.goarch, list(configuration.tags.map(raw)))
    if (failure) {
      assert.ok(failure instanceof RangeError)
      assert.equal(
        actual.$,
        failure.message === "Unsupported Go analysis target" ? "InvalidTarget" : "InvalidUserTag",
        JSON.stringify(configuration)
      )
    } else {
      assert.equal(actual.$, "SnapshotValid")
      const facts = { goos: actual.snapshot.goos, goarch: actual.snapshot.goarch, tags: unlist(actual.snapshot.tags) }
      assert.deepEqual(facts, { goos: native.goos, goarch: native.goarch, tags: [...native.tags] })
      assert.equal(createHash("sha256").update(JSON.stringify(facts)).digest("hex"), native.fingerprint)
    }
    configurationCases++
  }
  const snapshots = [
    undefined,
    ...[
      ["linux", "amd64", []],
      ["android", "arm64", ["custom"]],
      ["ios", "arm64", []],
      ["illumos", "amd64", ["yes"]],
      ["windows", "386", []],
      ["js", "wasm", ["custom", "yes"]]
    ].map(([goos, goarch, tags]) => freezeGoBuildSnapshot({ goos, goarch, tags }))
  ]
  const atoms = [
    "linux",
    "windows",
    "android",
    "darwin",
    "solaris",
    "arm64",
    "amd64",
    "unix",
    "custom",
    "yes",
    "absent",
    "cgo",
    "gc",
    "gccgo",
    "go1.22",
    "x.y",
    "_",
    "123",
    "."
  ]
  const expressions = [
    "",
    " ",
    "()",
    "!",
    "&&",
    "a & b",
    "a | b",
    "a b",
    "(linux",
    "linux)",
    "min(a)",
    "é",
    "𐐀",
    "\ud800",
    "linux\u00a0&&\ufeffunix",
    "linux\u200b",
    "true || cgo",
    "false && cgo",
    ...atoms,
    ...atoms.map((x) => `!(${x})`),
    ...atoms.flatMap((a) =>
      ["linux", "cgo", "custom"].flatMap((b) => [
        `${a} && ${b}`,
        `${a} || ${b}`,
        `!${a} || ${b} && unix`,
        `(${a} || ${b}) && !windows`
      ])
    ),
    ...[31, 32, 33].flatMap((n) => ["!".repeat(n) + "linux", "(".repeat(n) + "linux" + ")".repeat(n)]),
    ...[127, 128, 129].map((n) => Array(n).fill("linux").join(" && ")),
    "a".repeat(4096),
    "a".repeat(4097),
    "é".repeat(2048),
    "é".repeat(2049)
  ]
  const names = [
    "x.go",
    "x_test.go",
    ".x.go",
    "_x.go",
    "x.GO",
    "go",
    "x",
    "x_.go",
    "a__amd64.go",
    "a_linux_amd64.go",
    "a_android_arm64.go",
    "a_ios.go",
    "a_illumos.go",
    "amd64.go",
    "x_unknown.go",
    "𐐀_linux.go",
    "\ud800_linux.go",
    ...GO_OS.map((os) => `d/x_${os}.go`),
    ...GO_ARCH.map((arch) => `d/x_${arch}.go`)
  ]
  const headers = [
    "package p\n",
    "\n// normal\npackage p\n",
    "package\n",
    "// no package\n",
    "/* header */\npackage p\n",
    "// +build linux\npackage p\n",
    "//\t+buildé\npackage p\n",
    "// +builder\npackage p\n",
    "// +buildα\npackage p\n",
    "//go:build linux\rpackage p\r",
    "//go:build\npackage p\n",
    "//go:buildlinux\npackage p\n",
    "//go:build linux\n//go:build unix\npackage p\n",
    "//go:build linux\npackage p\n//go:build cgo\n",
    "//go:build linux\r\npackage p\r\n",
    "//go:build linux\rcgo\npackage p\n",
    "\ufeff//go:build linux\u00a0\npackage\u00a0p\n",
    "//go:build linux\u2028cgo\npackage p\n",
    ...expressions.slice(0, 70).map((expression) => `//go:build ${expression}\npackage p\n`)
  ]
  for (const snapshot of snapshots) {
    const wire = wireSnapshot(snapshot)
    for (const expression of expressions) {
      assert.equal(
        membership(core.expression(raw(expression), wire)),
        evaluateGoBuildExpression(expression, snapshot),
        `expression ${JSON.stringify(expression.slice(0, 100))} ${snapshot?.goos}`
      )
      expressionCases++
    }
    for (const path of names) {
      assert.equal(
        membership(core.filename(basename(path), wire)),
        goFilenameMembership(path, snapshot),
        `filename ${path}`
      )
      filenameCases++
    }
    for (const path of ["root.go", "root_linux.go", "root_windows.go", "root_test.go"])
      for (const source of headers) {
        assert.equal(
          membership(core.file(basename(path), raw(source), wire)),
          goFileMembership(path, source, snapshot),
          `file ${path} ${JSON.stringify(source)} ${snapshot?.goos}`
        )
        fileCases++
      }
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
        "whole native go-build-context functions, mechanical character/basename/SHA observations; no whole Go session or universal-law claim"
    })
  )
} finally {
  rmSync(temp, { recursive: true, force: true })
}
