import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

// Parser comparison before checker adoption. Resolution and emitted inputs are
// deliberately separate evidence requirements.
const [parserArgument, outputArgument] = process.argv.slice(2)
assert(parserArgument && outputArgument, "usage: node scripts/probe-source-checker.mjs BABEL_PARSER OUTPUT.json")
const { parse } = await import(pathToFileURL(resolve(parserArgument)).href)
const output = resolve(outputArgument)
assert(!existsSync(output), "do not overwrite retained observations")
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex")
const parserOptions = {
  sourceType: "module",
  plugins: ["typescript"],
  errorRecovery: false,
  createImportExpressions: true
}
function analyze(source) {
  const ast = parse(source, parserOptions)
  const edges = []
  const unknown = []
  function walk(node, parent) {
    if (!node || typeof node !== "object") return
    const literal = (value) => (value?.type === "StringLiteral" ? value.value : undefined)
    if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type) && node.source)
      edges.push({ kind: node.type, target: literal(node.source) })
    if (node.source?.type === "StringLiteral" && ["node:module", "module"].includes(node.source.value))
      unknown.push("loader-module")
    if (node.type === "TSImportType") {
      const target = literal(node.source)
      if (target === undefined) unknown.push("type-import-target")
      else edges.push({ kind: "TSImportType", target })
    }
    if (node.type === "ImportExpression") {
      if (node.options) unknown.push("unsupported-import-options")
      const target = literal(node.source)
      if (target === undefined) unknown.push("computed-import")
      else edges.push({ kind: "ImportExpression", target })
    }
    if (node.type === "CallExpression" && node.callee?.type === "Identifier" && node.callee.name === "require") {
      const target = literal(node.arguments[0])
      if (target === undefined || node.arguments.length !== 1 || node.typeArguments || node.typeParameters)
        unknown.push("unsupported-require")
      else edges.push({ kind: "require", target })
    }
    if (
      node.type === "Identifier" &&
      node.name === "require" &&
      !(parent?.type === "CallExpression" && parent.callee === node)
    )
      unknown.push("loader-reference")
    if (node.type === "Identifier" && node.name === "createRequire") unknown.push("loader-factory")
    if (node.type === "Identifier" && ["eval", "Function", "getBuiltinModule", "_load"].includes(node.name))
      unknown.push("dynamic-code-or-loader")
    const member = ["MemberExpression", "OptionalMemberExpression"].includes(node.type)
    if (
      node.type === "Identifier" &&
      ["process", "global", "globalThis"].includes(node.name) &&
      !(["MemberExpression", "OptionalMemberExpression"].includes(parent?.type) && parent.object === node)
    )
      unknown.push("runtime-global-reference")
    if (member && (node.property?.name === "constructor" || literal(node.property) === "constructor"))
      unknown.push("dynamic-code-constructor")
    if (member && ["module", "Module"].includes(node.object?.name)) unknown.push("module-loader-access")
    if (member && node.computed && ["globalThis", "global", "process"].includes(node.object?.name))
      unknown.push("computed-runtime-access")
    if (
      member &&
      (["require", "createRequire"].includes(node.property?.name) ||
        ["require", "createRequire"].includes(literal(node.property)))
    )
      unknown.push("member-loader")
    if (node.type === "TSImportEqualsDeclaration") unknown.push("import-equals")
    for (const [key, value] of Object.entries(node)) {
      if (["loc", "start", "end", "extra", "comments", "tokens"].includes(key)) continue
      if (Array.isArray(value)) for (const child of value) walk(child, node)
      else if (value && typeof value === "object") walk(value, node)
    }
  }
  walk(ast)
  if (edges.some((edge) => ["node:module", "module"].includes(edge.target))) unknown.push("loader-module-edge")
  return { edges, unknown }
}
const cases = [
  ["static", 'import { x } from "./admin.ts";', "edge"],
  ["type-only", 'import type { X } from "./admin.ts";', "edge"],
  ["reexport", 'export { x } from "./admin.ts";', "edge"],
  ["type-star-reexport", 'export type * from "./admin.ts";', "edge"],
  ["lazy-literal", 'await import("./admin.ts");', "edge"],
  ["commented-literal", 'await import(/* @vite-ignore */ "./admin.ts");', "edge"],
  ["import-type", 'type X = import("./admin.ts").X;', "edge"],
  ["literal-require", 'require("./admin.ts");', "edge"],
  ["computed-import", 'const p = "./admin.ts"; await import(p);', "reject"],
  ["template-import", "await import(`./admin.ts`);", "reject"],
  ["typed-import", 'const p: string = "./admin.ts"; await import(p);', "reject"],
  ["satisfies-import", 'await import("./admin.ts" satisfies string);', "reject"],
  ["computed-require", 'const p = "./admin.ts"; require(p);', "reject"],
  ["generic-require", 'require<string>("./admin.ts");', "reject"],
  ["aliased-require", 'const load = require; load("./admin.ts");', "reject"],
  ["member-require", 'module.require("./admin.ts");', "reject"],
  ["computed-member-require", 'module["require"]("./admin.ts");', "reject"],
  [
    "loader-factory",
    'import { createRequire as makeLoader } from "node:module"; makeLoader(import.meta.url)("./admin.ts");',
    "reject"
  ],
  ["import-equals", 'import admin = require("./admin.ts");', "reject"],
  [
    "computed-factory",
    'import * as m from "node:module"; m["create" + "Require"](import.meta.url)("./admin.ts");',
    "reject"
  ],
  ["module-load", 'Module._load("./admin.ts");', "reject"],
  ["computed-module-loader", 'module["requ" + "ire"]("./admin.ts");', "reject"],
  ["eval-loader", 'eval("require")("./admin.ts");', "reject"],
  ["function-loader", 'new Function("return require")()("./admin.ts");', "reject"],
  ["computed-global-loader", 'globalThis["requ" + "ire"]("./admin.ts");', "reject"],
  [
    "builtin-module-loader",
    'process.getBuiltinModule("module").createRequire(import.meta.url)("./admin.ts");',
    "reject"
  ],
  ["import-options", 'await import("./admin.ts", { with: { type: "json" } });', "reject"],
  ["optional-computed-loader", 'module?.["requ" + "ire"]("./admin.ts");', "reject"],
  [
    "required-loader-module",
    'const m = require("node:module"); m["create" + "Require"](import.meta.url)("./admin.ts");',
    "reject"
  ],
  [
    "aliased-runtime-global",
    'const p = process; p["getBuiltin" + "Module"]("module")["create" + "Require"](import.meta.url)("./admin.ts");',
    "reject"
  ],
  ["function-constructor-loader", '(() => {}).constructor("return require")()("./admin.ts");', "reject"],
  ["invalid-syntax", 'import { from "./admin.ts";', "parse-reject"]
]
const report = {
  schemaVersion: 1,
  identity: {
    parserSha256: digest(readFileSync(resolve(parserArgument))),
    checkerSha256: digest(readFileSync(import.meta.filename)),
    parserOptions
  },
  cases: [],
  productionParse: [],
  limitations: [
    "Syntax/loader comparison only; no package resolution, owner authorization, compiler-input or emitted contribution claim"
  ]
}
try {
  for (const [name, source, expected] of cases) {
    let observation
    try {
      observation = analyze(source)
    } catch (error) {
      observation = { parseRejected: true, reason: error.message }
    }
    report.cases.push({ name, expected, ...observation })
    if (expected === "parse-reject") assert(observation.parseRejected, name)
    else {
      assert(!observation.parseRejected, name)
      if (expected === "reject") assert(observation.unknown.length > 0, name)
      else
        assert(
          observation.edges.some((edge) => edge.target === "./admin.ts"),
          name
        )
    }
  }
  const root = resolve(import.meta.dirname, "../src")
  function inspect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) inspect(path)
      else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        const source = readFileSync(path, "utf8")
        const result = analyze(source)
        report.productionParse.push({
          path: path.slice(root.length + 1),
          sourceSha256: digest(source),
          edgeCount: result.edges.length,
          unknown: result.unknown
        })
      }
    }
  }
  inspect(root)
  report.completed = true
} catch (error) {
  report.failure = error.stack
  process.exitCode = 1
} finally {
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  console.log(
    JSON.stringify(
      {
        completed: report.completed ?? false,
        cases: report.cases.length,
        sourceFiles: report.productionParse.length,
        failure: report.failure
      },
      null,
      2
    )
  )
}
