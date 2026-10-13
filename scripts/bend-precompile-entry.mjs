import assert from "node:assert/strict"
import { parse } from "@babel/parser"

// The pinned library adapter only creates a curried wrapper; constructing an
// unused export executes no algorithm or converter. Keep their bodies intact.
const libraryAdapter =
  "functionrun_lib(f,n){return(...a)=>a.length<n?run_lib((...b)=>f(...a,...b),n-a.length):f(...a);}"

export function selectBendPrecompileEntries(source, required) {
  assert.ok(required.length > 0 && new Set(required).size === required.length, "Invalid private entry ABI")
  const body = parse(source, { sourceType: "module" }).program.body
  const exports = body.filter((node) => node.type.startsWith("Export"))
  assert.equal(exports.length, 1, "Unknown Bend library export layout")
  assert.equal(exports[0].type, "ExportDefaultDeclaration", "Unknown Bend library export layout")
  const object = exports[0].declaration
  assert.equal(object.type, "ObjectExpression", "Unknown Bend library export layout")
  const adapter = body.filter((node) => node.type === "FunctionDeclaration" && node.id?.name === "run_lib")
  assert.equal(adapter.length, 1, "Unknown Bend library adapter")
  assert.equal(source.slice(adapter[0].start, adapter[0].end).replace(/\s+/gu, ""), libraryAdapter)
  const names = new Set()
  for (const property of object.properties) {
    assert.ok(
      property.type === "ObjectProperty" && !property.computed && property.key.type === "StringLiteral",
      "Unknown Bend library property"
    )
    assert.ok(!names.has(property.key.value), "Duplicate Bend library export")
    names.add(property.key.value)
    const expression = property.value
    assert.ok(
      expression.type === "CallExpression" &&
        expression.callee.type === "Identifier" &&
        expression.callee.name === "run_lib" &&
        expression.arguments.length === 2 &&
        expression.arguments[0].type === "ArrowFunctionExpression" &&
        expression.arguments[1].type === "NumericLiteral" &&
        Number.isInteger(expression.arguments[1].value) &&
        expression.arguments[1].value >= 0,
      "Unknown or effectful Bend library export expression"
    )
  }
  assert.ok(
    required.every((name) => names.has(name)),
    "Missing private Bend entry method"
  )
  const selected = object.properties.filter((property) => required.includes(property.key.value))
  return (
    source.slice(0, object.start) +
    "{\n" +
    selected.map((property) => source.slice(property.start, property.end)).join(",\n") +
    "\n}" +
    source.slice(object.end)
  )
}
