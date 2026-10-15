import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"

const temporary = mkdtempSync(join(tmpdir(), "hapsland-json-batch-"))
const label = (value) => value.$.split(".").at(-1)
const literal = (value) => ({ $: "CanonicalJsonPlan.LiteralPiece", value })
const primitive = (value) => ({
  $: "CanonicalJsonPlan.PrimitivePiece",
  value: { $: "CanonicalJson.StringPrimitive", value }
})
const token = (command, value) => ({ $: "Token", invocation: command.invocation, request: command.request, value })
const observed = (command, value) => ({ $: "Observed", request: command.request, token: value })
const maybeValues = (result) => {
  assert.equal(label(result), "Some")
  return unlist(result.value)
}
// Independent finite reference: only primitive pieces consume request IDs/tokens.
const referenceSelect = (parts, invocation, first) => {
  const commands = []
  for (const part of parts)
    if (label(part) === "PrimitivePiece")
      commands.push({ $: "Command", invocation, request: first + BigInt(commands.length), primitive: part.value })
  return commands
}
const referenceBind = (parts, tokens) => {
  const output = []
  let index = 0
  for (const part of parts) {
    if (label(part) === "LiteralPiece") output.push(part.value)
    else {
      if (index === tokens.length) return undefined
      output.push(tokens[index++])
    }
  }
  return index === tokens.length ? output : undefined
}
const sameCommands = (actual, expected) => {
  assert.equal(actual.length, expected.length)
  for (let index = 0; index < actual.length; index++) {
    assert.equal(label(actual[index]), "Command")
    assert.equal(actual[index].invocation, expected[index].invocation)
    assert.equal(actual[index].request, expected[index].request)
    assert.equal(label(actual[index].primitive), "StringPrimitive")
    assert.equal(actual[index].primitive.value, expected[index].primitive.value)
  }
}
try {
  const output = join(temporary, "batch.mjs")
  execFileSync(
    "timeout",
    [
      "-s",
      "KILL",
      "10s",
      "taskset",
      "-c",
      "10",
      process.env.BEND ?? "bend",
      join(import.meta.dirname, "CanonicalJsonBatch.bend"),
      "-o",
      output
    ],
    { timeout: 11000 }
  )
  const batch = (await import(pathToFileURL(output))).default
  const streams = [
    [],
    [literal("")],
    [literal("["), literal("]")],
    [primitive("first")],
    [literal("{"), primitive("key"), literal(":"), primitive("value"), literal("}")],
    [primitive("a"), primitive("b"), primitive("c")],
    [literal("before"), primitive("😀"), literal("between"), primitive("\u0000"), literal("after")]
  ]
  let cases = 0,
    refusals = 0,
    rawCases = 0
  for (const parts of streams)
    for (const invocation of [0n, 17n])
      for (const first of [0n, 9n]) {
        const expected = referenceSelect(parts, invocation, first)
        const commands = unlist(batch.select(list(parts), invocation, first))
        sameCommands(commands, expected)
        for (const outer of [0n, 101n]) {
          const scheduled = unlist(batch.schedule(list(commands), outer))
          assert.deepEqual(
            scheduled.map((value) => value.request),
            commands.map((_, index) => outer + BigInt(index))
          )
          sameCommands(
            scheduled.map((value) => value.command),
            expected
          )
          const values = commands.map((_, index) => ["", '"\\\n😀', "arbitrary-token"][index % 3])
          const tokens = commands.map((command, index) => token(command, values[index]))
          const envelopes = scheduled.map((command, index) => observed(command, tokens[index]))
          assert.deepEqual(maybeValues(batch.strip_outer(list(scheduled), list(envelopes))), tokens)
          assert.deepEqual(maybeValues(batch.accept(list(commands), list(tokens))), values)
          assert.deepEqual(maybeValues(batch.bind(list(parts), list(values))), referenceBind(parts, values))
          const badInner = [tokens.concat(token({ invocation, request: first }, "extra"))]
          const badOuter = [
            envelopes.concat(observed({ request: outer }, token({ invocation, request: first }, "extra")))
          ]
          if (tokens.length) {
            badInner.push(
              tokens.slice(1),
              [{ ...tokens[0], invocation: invocation + 1n }, ...tokens.slice(1)],
              [{ ...tokens[0], request: first + 1n }, ...tokens.slice(1)]
            )
            badOuter.push(envelopes.slice(1), [{ ...envelopes[0], request: outer + 1n }, ...envelopes.slice(1)])
          }
          if (tokens.length > 1) {
            badInner.push([...tokens].reverse())
            badOuter.push([...envelopes].reverse())
          }
          for (const invalid of badInner) {
            assert.equal(label(batch.accept(list(commands), list(invalid))), "None")
            refusals++
          }
          for (const invalid of badOuter) {
            assert.equal(label(batch.strip_outer(list(scheduled), list(invalid))), "None")
            refusals++
          }
          assert.equal(label(batch.bind(list(parts), list([...values, "extra"]))), "None")
          refusals++
          if (values.length) {
            assert.equal(label(batch.bind(list(parts), list(values.slice(1)))), "None")
            refusals++
          }
          cases++
        }
      }
  let coercions = 0
  const opaque = {
    toString() {
      coercions++
      throw new Error("unexpected early coercion")
    }
  }
  for (const raw of [undefined, 7, opaque, Symbol("raw-json-token")]) {
    const parts = [literal("["), primitive("first"), literal(","), primitive("second"), literal("]")]
    const commands = unlist(batch.select(list(parts), 13n, 27n))
    const scheduled = unlist(batch.schedule(list(commands), 53n))
    const tokens = [token(commands[0], raw), token(commands[1], "second-token")]
    const stripped = maybeValues(
      batch.strip_outer(list(scheduled), list(scheduled.map((value, index) => observed(value, tokens[index]))))
    )
    assert.strictEqual(stripped[0].value, raw)
    const accepted = maybeValues(batch.accept(list(commands), list(stripped)))
    assert.strictEqual(accepted[0], raw)
    const bound = maybeValues(batch.bind(list(parts), list(accepted)))
    assert.strictEqual(bound[1], raw)
    assert.deepEqual(bound.slice(2), [",", "second-token", "]"])
    assert.equal(coercions, 0)
    rawCases++
  }
  console.log(
    JSON.stringify({
      cases,
      refusals,
      rawCases,
      scope: "emitted CanonicalJsonBatch ABI; no runtime integration or whole-proof claim"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
