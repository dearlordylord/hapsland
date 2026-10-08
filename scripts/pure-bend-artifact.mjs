import assert from "node:assert/strict"
import { parse } from "@babel/parser"

/** Preserve exact compiled function bodies while selecting a pure dependency closure. */
export function extractBendFunctions(source, roots) {
  const program = parse(source, { sourceType: "module" }).program
  const functions = new Map(
    program.body.filter((node) => node.type === "FunctionDeclaration").map((node) => [node.id.name, node])
  )
  const variables = new Set(
    program.body
      .filter((node) => node.type === "VariableDeclaration")
      .flatMap((node) =>
        node.declarations
          .filter((declaration) => declaration.id.type === "Identifier")
          .map((declaration) => declaration.id.name)
      )
  )
  const needed = new Set(),
    queue = [...roots]
  const walk = (value, visit) => {
    if (value === null || typeof value !== "object") return
    if (Array.isArray(value)) {
      for (const item of value) walk(item, visit)
      return
    }
    visit(value)
    for (const item of Object.values(value)) walk(item, visit)
  }
  while (queue.length) {
    const name = queue.shift()
    if (needed.has(name)) continue
    const node = functions.get(name)
    assert.ok(node, `Missing compiled Bend function: ${name}`)
    needed.add(name)
    walk(node.body, (value) => {
      if (value.type === "Identifier") {
        assert.ok(!variables.has(value.name), `Non-function top-level dependency: ${value.name}`)
        if (functions.has(value.name)) queue.push(value.name)
      }
      if (value.type === "CallExpression" && value.callee.type === "Identifier") {
        assert.ok(
          functions.has(value.callee.name) || ["Number", "BigInt", "String", "Boolean"].includes(value.callee.name),
          `Unsupported pure Bend call: ${value.callee.name}`
        )
      }
    })
  }
  return (
    program.body
      .filter((node) => node.type === "FunctionDeclaration" && needed.has(node.id.name))
      .map((node) => source.slice(node.start, node.end))
      .join("\n\n") + "\n"
  )
}
