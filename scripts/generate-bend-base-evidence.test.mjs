import assert from "node:assert/strict"
import { test } from "node:test"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { deriveBendBaseEvidence, generateBendBaseEvidence } from "./generate-bend-base-evidence.mjs"

const declaration = "type List<a, -A: Kind(a)> is Kind(a):\n  Nil{}\n  Con{head: A, tail: List<a, A>}"
const compiler = { version: "2.0.36", source: "ae1101c" }

test("bundled evidence retains the exact compiler declaration and excludes unrelated definitions", () => {
  const model = deriveBendBaseEvidence(
    `type Other is Data:\n  Other{}\n\n${declaration}\n\ndef unrelated():\n  0\n`,
    compiler
  )
  assert.equal(model.library, "bend/Base")
  assert.equal(model.compilerVersion, compiler.version)
  assert.equal(model.compilerSource, compiler.source)
  assert.deepEqual(
    model.declarations.map(({ name, source }) => ({ name, source })),
    [{ name: "List", source: declaration }]
  )
  assert.match(model.moduleHash, /^[a-f0-9]{64}$/)
  assert.match(model.declarations[0].sourceHash, /^[a-f0-9]{64}$/)
})

test("missing, ambiguous or unsupported compiler declarations cannot become bundled evidence", () => {
  for (const source of [
    "type Other is Data:\n  Other{}",
    `${declaration}\n\n${declaration}`,
    "type List is Data:\n    Nil{}",
    'def label():\n  "type List is Data: Nil{}"'
  ]) {
    assert.throws(() => deriveBendBaseEvidence(source, compiler), /List/)
  }
})

test("compiler declaration CRLF bytes remain unchanged", () => {
  const source = declaration.replaceAll("\n", "\r\n")
  assert.equal(deriveBendBaseEvidence(`${source}\r\n`, compiler).declarations[0].source, source)
})

test("ordinary build checks reject stale catalog or changed compiler input without rewriting source", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-bend-base-"))
  try {
    const directory = join(root, "packages/source-analysis/src/direct-event/languages/bend")
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(root, "base.bend"), `${declaration}\n`)
    const toolchain = {
      base: { path: "base.bend", sha256: createHash("sha256").update(`${declaration}\n`).digest("hex") },
      cohort: { bend: compiler }
    }
    generateBendBaseEvidence(root, toolchain)
    const path = join(directory, "base-declarations.generated.json")
    const before = readFileSync(path, "utf8")
    generateBendBaseEvidence(root, toolchain, true)
    assert.equal(readFileSync(path, "utf8"), before)
    writeFileSync(path, "stale evidence\n")
    assert.throws(() => generateBendBaseEvidence(root, toolchain, true), /Stale bundled Bend evidence/)
    assert.equal(readFileSync(path, "utf8"), "stale evidence\n")
    writeFileSync(join(root, "base.bend"), `${declaration}\n# changed\n`)
    assert.throws(() => generateBendBaseEvidence(root, toolchain), /changed after toolchain selection/)
    assert.equal(readFileSync(path, "utf8"), "stale evidence\n")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("Base namespace and declaration selection ignore comments and multiline literal contents", () => {
  const source = `# type List is Data:\n#   Fake{}\ndef text() -> String:\n  "literal\ntype List is Data:\n  Fake{}\ndef Phantom.call():\n  0\n"\ndef Escaped.name() -> String:\n  "say \\"type Forged is Data:\\" # quoted"\n${declaration}\n# def Ghost.call():\n`
  const model = deriveBendBaseEvidence(source, compiler)
  assert.deepEqual(
    model.declarations.map(({ source }) => source),
    [declaration]
  )
  assert.deepEqual(model.namespacePrefixes, ["Con", "Escaped", "List", "Nil", "text"])
})
