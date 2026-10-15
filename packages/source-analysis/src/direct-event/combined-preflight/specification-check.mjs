import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"

// Falsify the draft equations against the old native expression, including each
// measurement's fault prefix. This is not a proof or production qualification.
const temporary = mkdtempSync(join(tmpdir(), "hapsland-combined-preflight-spec-"))
try {
  const output = join(temporary, "specification.mjs")
  execFileSync(
    "timeout",
    ["10s", "taskset", "-c", "10", "bend", join(import.meta.dirname, "Specification.bend"), "-o", output],
    { timeout: 11000 }
  )
  const spec = (await import(pathToFileURL(output))).default
  const operationEvents = (operations, fixture, fault, faultToken) => {
    const stack = [],
      events = []
    const read = (key, value) => {
      events.push(key)
      if (events.length === fault) throw faultToken
      return value
    }
    try {
      for (const operation of operations) {
        switch (operation.$) {
          case "Push":
            stack.push(operation.value)
            break
          case "MeasureArtifact":
            stack.push(read(`artifact:${operation.function_slot}`, fixture.artifact))
            break
          case "ObserveSites":
            read(`sites:${operation.function_slot}`, undefined)
            break
          case "MeasureRawSite":
            stack.push(read(`site:${operation.function_slot}:${operation.site_slot}`, fixture.site))
            break
          case "MeasureRawPath":
            stack.push(read("path", fixture.path))
            break
          case "ReadTypeBytes":
            stack.push(read("type", fixture.type ?? 0))
            break
          case "ObserveRootImports":
            read("root-imports", fixture.rootImports)
            break
          case "ReadTypeImports":
            read("type-imports", fixture.typeImports)
            break
          case "Swap": {
            const right = stack.pop(),
              left = stack.pop()
            stack.push(right, left)
            break
          }
          case "Add": {
            const right = stack.pop(),
              left = stack.pop()
            stack.push(left + right)
            break
          }
          case "Multiply": {
            const right = stack.pop(),
              left = stack.pop()
            stack.push(left * right)
            break
          }
          default:
            assert.fail(operation.$)
        }
      }
      assert.equal(stack.length, 1)
      return { value: stack[0], events }
    } catch (error) {
      return { error, events }
    }
  }
  const original = (counts, fixture, fault, faultToken) => {
    const events = []
    const read = (key, value) => {
      events.push(key)
      if (events.length === fault) throw faultToken
      return value
    }
    try {
      let total = 0
      for (let f = 0; f < counts.length; f++) {
        let bytes = read(`artifact:${f}`, fixture.artifact) + 1024
        read(`sites:${f}`, undefined)
        for (let s = 0; s < counts[f]; s++)
          bytes += 4 * (1024 + 6 * read(`site:${f}:${s}`, fixture.site) + 2 * read("path", fixture.path))
        total += bytes
      }
      const value = read("type", fixture.type ?? 0) + total
      read("root-imports", fixture.rootImports) || read("type-imports", fixture.typeImports)
      return { value, events }
    } catch (error) {
      return { error, events }
    }
  }
  let cases = 0
  for (const counts of [[], [0], [1], [3, 0, 2]]) {
    for (const type of [undefined, -0, 13, NaN, Infinity]) {
      const fixture = { type, artifact: 111, site: 17, path: 5, rootImports: type === 13, typeImports: true }
      const operations = unlist(spec.measured_operations(list(counts), fixture.rootImports))
      const expected = original(counts, fixture)
      assert.deepEqual(operationEvents(operations, fixture), expected)
      for (let fault = 1; fault <= expected.events.length; fault++) {
        const faultToken = Object.freeze({ fault })
        const actual = operationEvents(operations, fixture, fault, faultToken)
        assert.deepEqual(actual, original(counts, fixture, fault, faultToken))
        assert.equal(actual.error, faultToken)
      }
      cases += expected.events.length + 1
    }
  }
  for (const valid of [false, true])
    for (const types of [0, 1, 1024, 1025])
      for (const counts of [[], [0], [0, 1]])
        for (const bound of [false, true])
          for (const imports of [false, true])
            for (const typeImports of [false, true]) {
              const plan = spec.typescript(valid, types, list(counts), bound, imports, typeImports)
              const count = types + counts.length
              const refused = !valid || count > 1024 || (count > 0 && types > 0 && !bound)
              assert.equal(plan.decision.$, refused ? "Unavailable" : count === 0 ? "MeasuredEmpty" : "Measured")
              if (refused) assert.deepEqual(unlist(plan.operations), [])
              else {
                assert.equal(plan.decision.imports, imports || typeImports)
                if (count > 0) assert.equal(plan.decision.declarations, count)
              }
              if (!refused && count === 0)
                assert.deepEqual(
                  unlist(plan.operations),
                  imports ? [{ $: "ObserveRootImports" }] : [{ $: "ObserveRootImports" }, { $: "ReadTypeImports" }]
                )
              cases++
            }
  for (const bound of [false, true])
    for (const valid of [false, true]) {
      const plan = spec.go(bound, valid)
      assert.equal(plan.decision.$, bound ? "RetainBound" : valid ? "MeasuredEmpty" : "Unavailable")
      assert.deepEqual(unlist(plan.operations), bound ? [] : [{ $: "InspectGo" }])
      cases++
    }
  for (const bound of [false, true]) {
    assert.deepEqual(spec.passthrough(bound), {
      $: "Plan",
      decision: { $: bound ? "RetainBound" : "Unavailable" },
      operations: list([])
    })
    cases++
  }
  console.log(
    JSON.stringify({
      cases,
      scope:
        "draft combined preflight admission, exact native measurement/fault order and IEEE expression; no universal proof or production connection claimed"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
