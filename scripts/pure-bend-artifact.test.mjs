import test from "node:test"
import assert from "node:assert/strict"
import { extractBendFunctions } from "./pure-bend-artifact.mjs"

test("pure artifact retains exact transitive bodies and omits unreachable IO", () => {
  const leaf = "function leaf(n) { return Math.min(n, 3); }"
  const root = 'function root(n) { const text = "} function falseRoot() {"; return leaf(n); }'
  const source = `${leaf}\nfunction unused() { return require("node:fs"); }\n${root}`
  const selected = extractBendFunctions(source, ["root"])
  assert.equal(selected, leaf + "\n\n" + root + "\n")
  assert.doesNotMatch(selected, /function unused|require/)
})
test("dependency cycles are included once without executing them", () => {
  const source = "function a(n) { return n ? b(n-1) : 0; }\nfunction b(n) { return a(n); }\nfunction c() { return 5; }"
  const selected = extractBendFunctions(source, ["a", "a"])
  assert.equal(selected.match(/function a/g).length, 1)
  assert.equal(selected.match(/function b/g).length, 1)
  assert.doesNotMatch(selected, /function c/)
})
test("missing roots, side effects and unretained global bindings fail closed", () => {
  assert.throws(() => extractBendFunctions("function a() {}", ["missing"]), /Missing compiled/)
  assert.throws(
    () => extractBendFunctions('function a() { return require("node:fs"); }', ["a"]),
    /Unsupported pure Bend call/
  )
  assert.throws(
    () => extractBendFunctions("const bias = 3; function a(n) { return n+bias; }", ["a"]),
    /Non-function top-level dependency/
  )
})
