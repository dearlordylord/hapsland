import assert from "node:assert/strict"
import { extractSource } from "@hapsland/source-analysis/direct-event/source-extraction"
import { languageForPath } from "@hapsland/source-analysis/direct-event/languages/registry"
import { Parser } from "@hapsland/source-analysis/direct-event/languages/native-parser"

const fixtures = [
  ["a.ts", "export interface Root { value: string }"],
  ["a.ts", "export function root(value: string): string { return value }"],
  ["a.ts", "import type { X } from './x'; export interface Root { value: X }"],
  ["a.ts", "import X from './x'; interface Root { value: X }"],
  ["a.ts", "namespace N { export interface Root { value: string } }"],
  ["a.ts", "interface Root {} interface Root {}"],
  ["a.ts", "type Root = Missing"],
  ["a.ts", "interface Root {"],
  ["a.py", "class Root:\n value: str\n"],
  ["a.py", "from dataclasses import dataclass\n@dataclass\nclass Root:\n value: str\n"],
  ["a.py", "from .other import Other\nclass Root:\n value: Other\n"],
  ["a.py", "from .other import *\nclass Root:\n value: str\n"],
  ["a.py", "class Root:\n value: str\nclass Root:\n value: int\n"],
  ["a.py", "class Root(:\n"],
  ["a.go", "package fixture\ntype Root struct { Value string }\n"],
  ["a.go", "package fixture\ntype string struct { Value int }\ntype Root struct { Value string }\n"],
  ["a.go", "package fixture\nconst Root = 1\n"],
  ["a.go", "package fixture\ntype Root struct {}\ntype Root struct {}\n"],
  ["a.go", 'package fixture\nimport x "example.test/x"\ntype Root struct { Value x.Type }\n'],
  ["a.go", "package fixture\ntype Root struct {\n"],
  ["a.rs", "pub struct Root { pub value: String }\n"],
  ["a.rs", "use crate::other::Other; pub struct Root { pub value: Other }"],
  ["a.rs", "pub struct Root {} pub struct Root {}"],
  ["a.rs", "mod child; pub struct Root { value: child::Other }"],
  ["a.rs", "pub struct Root {"],
  ["a.bend", "type Root is Data:\n  Root{}\n"],
  ["a.bend", "type Leaf is Data:\n  Leaf{}\ntype Root is Data:\n  Root{leaf: Leaf}\n"],
  ["a.bend", "type Root is Data:\n  Root{value: Missing}\n"],
  ["a.bend", "type Root is Data:\n  Root{}\ntype Root is Data:\n  Other{}\n"],
  ["a.bend", "type Root is Data:\n Root{\n"],
  ...["ts", "py", "go", "rs", "bend"].map((extension) => ["empty." + extension, ""]),
  ["a.txt", "unsupported source"]
]
const declarations = (render, count = 1025) => Array.from({ length: count }, (_, index) => render(index)).join("\n")
fixtures.push(
  ["limit.ts", declarations((i) => `interface T${i} { value: string }`)],
  ["limit.py", declarations((i) => `class T${i}:\n value: str`)],
  ["limit.go", "package fixture\n" + declarations((i) => `type T${i} struct {}`)],
  ["limit.rs", declarations((i) => `struct T${i} {}`)],
  ["limit.bend", declarations((i) => `type T${i} is Data:\n T${i}{}`)],
  ["budget.go", "package fixture\n" + declarations((i) => `type T${i} struct {}`, 129)]
)
for (const [path, source] of fixtures) {
  const language = languageForPath(path)
  const graph = language?.inspect(path, source)
  const functions = language?.analyzeFunctions?.(path, source)
  const actual = extractSource(path, source)
  assert.deepEqual(actual.graph, graph, path + ": graph parser facts")
  assert.deepEqual(actual.functions, functions, path + ": function parser facts")
  // Map equality alone does not establish the iteration order consumed by Source.
  if (graph !== undefined)
    for (const key of ["declarations", "imports"])
      assert.deepEqual([...actual.graph[key].keys()], [...graph[key].keys()], path + ": ordered " + key)
  if (functions !== undefined)
    for (const key of ["functions", "types", "imports", "excludedFunctions"])
      assert.deepEqual([...actual.functions[key].keys()], [...functions[key].keys()], path + ": ordered " + key)
}
const mainParses = []
for (const [path, source] of fixtures
  .filter(([path]) => ["a.ts", "a.py", "a.go", "a.rs"].includes(path))
  .filter((_, index, all) => all.findIndex(([path]) => path === all[index][0]) === index)) {
  const parse = Parser.prototype.parse
  let count = 0
  Parser.prototype.parse = function (input, ...args) {
    if (input === source) count++
    return Reflect.apply(parse, this, [input, ...args])
  }
  try {
    const first = extractSource(path, source)
    assert.equal(count, 1, "one main-source parse per extraction: " + path)
    const second = extractSource(path, source)
    assert.equal(count, 2, "no parser cache between invocations: " + path)
    assert.notEqual(first.graph, second.graph)
    const name = first.graph.declarations.keys().next().value
    assert.notEqual(first.graph.declarations.get(name).artifact, second.graph.declarations.get(name).artifact)
    mainParses.push({ path, invocations: 2, mainSourceParses: count })
  } finally {
    Parser.prototype.parse = parse
  }
}
console.log(
  JSON.stringify({
    passed: true,
    cases: fixtures.length,
    mainParses,
    scope:
      "compiled invocation-local extraction: physical graph/function parser facts and ordering; deterministic parser facts, no cross-command cache; whole Preparation acceptance remains open"
  })
)
