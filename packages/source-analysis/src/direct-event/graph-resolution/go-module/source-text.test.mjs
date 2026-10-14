import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import fc from "fast-check"

// Native operations are independent oracles for the mechanical observations;
// grammar, graph policy and resource authority remain in their original owners.
const temporary = await mkdtemp("/tmp/hapsland-go-source-text-")
try {
  const cores = {}
  for (const name of ["Input", "RawText", "RawTextMeasurement", "PreparationData"]) {
    const emitted = join(temporary, name + ".mjs")
    execFileSync("taskset", ["-c", "10", "bend", join(import.meta.dirname, name + ".bend"), "-o", emitted], {
      timeout: 10000
    })
    cores[name] = (await import(pathToFileURL(emitted))).default
  }
  const list = (items) => items.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
  const characters = (text, prefix = "") =>
    list(
      [...text].map((char) => ({
        $: prefix + "Character",
        code: BigInt(char.codePointAt(0)),
        whitespace: /^\s$/u.test(char)
      }))
    )
  const text = (items) => {
    const chars = []
    while (items.$ === "Con") {
      chars.push(String.fromCodePoint(Number(items.head.code)))
      items = items.tail
    }
    assert.equal(items.$, "Nil")
    return chars.join("")
  }
  let cases = 0
  const check = (left, right) => {
    assert.equal(cores.Input.same_text(left, right), left === right)
    const spellings = list([{ $: "Spelling", text: left, characters: list([]) }])
    assert.equal(cores.Input.has(spellings, right), left === right)
    const chars = characters(left)
    assert.equal(BigInt(cores.RawTextMeasurement.utf16(characters(left, "RawText."))), BigInt(left.length))
    assert.equal(BigInt(cores.RawTextMeasurement.bytes(characters(left, "RawText."))), BigInt(Buffer.byteLength(left, "utf8")))
    assert.equal(cores.RawText.ascii_text(chars), left)
    assert.equal(text(cores.RawText.skip_space(chars)), left.trimStart())
    assert.equal(text(cores.RawText.trim(chars)), left.trim())
    assert.equal(
      cores.PreparationData.generated({ $: "RawText.Text", value: left, characters: characters(left, "RawText.") }),
      /^\/\/ Code generated .* DO NOT EDIT\.$/mu.test(left)
    )
    cases += 1
  }
  const strings = fc
    .array(fc.oneof(fc.integer({ min: 0, max: 0xd7ff }), fc.integer({ min: 0xe000, max: 0x10ffff })), { maxLength: 64 })
    .map((points) => String.fromCodePoint(...points))
  fc.assert(
    fc.property(strings, strings, (left, right) => {
      check(left, right)
      check(left, left)
      check(left, left + "x")
    }),
    { seed: 8948343, numRuns: 200 }
  )
  for (const value of ["", "x".repeat(22000), "😀".repeat(11000), " \t\r\n".repeat(5500)])
    for (const right of [value, value + "x", value.slice(0, -1)]) check(value, right)
  // Raw code-point widths admit lone surrogates; Bend Char/String operations
  // retain the original Unicode-scalar restriction and are not claimed for them.
  for (const value of ["\ud800", "\udc00"]) {
    const chars = characters(value)
    assert.equal(BigInt(cores.RawTextMeasurement.utf16(characters(value, "RawText."))), BigInt(value.length))
    assert.equal(BigInt(cores.RawTextMeasurement.bytes(characters(value, "RawText."))), BigInt(Buffer.byteLength(value, "utf8")))
    assert.equal(text(cores.RawText.trim(chars)), value.trim())
    assert.throws(
      () => cores.RawText.ascii_text(chars),
      (error) => String(error).includes("not a Unicode scalar value")
    )
  }
  for (const newline of ["\n", "\r", "\r\n", "\u2028", "\u2029"])
    for (const body of ["", "text", "😀", "x".repeat(22000)])
      check(`package p${newline}// Code generated ${body} DO NOT EDIT.${newline}type Root struct {}`, "other")
  console.log(
    JSON.stringify({
      passed: true,
      cases,
      seed: 8948343,
      scope:
        "emitted Go source text equality/spelling presence, UTF-16/UTF-8 widths, raw reconstruction/whitespace and generated-header predicate against native ECMAScript operations; generated Unicode and retained large-input regressions; component properties, not whole workflow or universal proof"
    })
  )
} finally {
  await rm(temporary, { recursive: true, force: true })
}
