// Diagnostic-only instrumentation of generated ABI boundaries in memory.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parse } from "@babel/parser"

export function installAbiAttribution(root) {
  const records = new Map()
  const key = Symbol.for("hapsland.diagnostic.bend-abi")
  assert.equal(globalThis[key], undefined)
  globalThis[key] = records
  const targets = new Set([
    resolve(root, "packages/agent-flow-bend/dist/canonical-resolver-owner.generated.js"),
    resolve(root, "packages/review-execution/dist/direct-event/preparation/preparation-finalization-core.js")
  ])
  Bun.plugin({
    name: "hapsland-diagnostic-abi-attribution",
    setup(builder) {
      builder.onLoad(
        { filter: /(?:canonical-resolver-owner\.generated|preparation-finalization-core)\.js$/ },
        ({ path }) => {
          if (!targets.has(path)) return
          let source = readFileSync(path, "utf8")
          const tree = parse(source, { sourceType: "module" })
          const edits = []
          let converters = 0
          for (const node of tree.program.body) {
            if (node.type === "ExportDefaultDeclaration" && node.declaration.type === "ObjectExpression") {
              for (const property of node.declaration.properties) {
                assert.equal(property.type, "ObjectProperty")
                const name = property.key.value ?? property.key.name
                const body = property.value.arguments?.[0]?.body
                assert.equal(body?.type, "BlockStatement", "expected generated export wrapper")
                const label = name === "advance" ? `${JSON.stringify(name + ":")} + a0.$` : JSON.stringify(name)
                edits.push([
                  body.start + 1,
                  `const __label = ${label}; __record.methods[__label] = (__record.methods[__label] ?? 0) + 1;`
                ])
              }
            }
            if (node.type !== "FunctionDeclaration" || !/^\$0m\d+$/.test(node.id?.name ?? "")) continue
            converters++
            edits.push([
              node.body.start + 1,
              "const __outer = __conversionDepth++ === 0; const __start = __outer ? performance.now() : 0; try {"
            ])
            edits.push([
              node.body.end - 1,
              "} finally { --__conversionDepth; if (__outer) { __record.conversionCalls++; __record.conversionMilliseconds += performance.now() - __start; } }"
            ])
          }
          assert.ok(converters > 0, "expected generated converters")
          for (const [position, insertion] of edits.sort((a, b) => b[0] - a[0]))
            source = source.slice(0, position) + insertion + source.slice(position)
          const entry = ": f(...a);"
          assert.equal(source.split(entry).length, 2, "expected exact generated run_lib boundary")
          source = source.replace(entry, ": __entry(() => f(...a));")
          const record = {
            entries: 0,
            conversionCalls: 0,
            conversionMilliseconds: 0,
            entryMilliseconds: 0,
            methods: {}
          }
          records.set(path, record)
          const header = `
const __record = globalThis[Symbol.for("hapsland.diagnostic.bend-abi")].get(${JSON.stringify(path)});
let __conversionDepth = 0;
function __entry(run) {
  const start = performance.now();
  __record.entries++;
  try { return run(); } finally { __record.entryMilliseconds += performance.now() - start; }
}
`
          return { contents: header + source, loader: "js" }
        }
      )
    }
  })
  return {
    reset() {
      assert.equal(records.size, targets.size, "both actual ABI modules must have loaded")
      for (const record of records.values()) {
        for (const name of Object.keys(record)) if (typeof record[name] === "number") record[name] = 0
        record.methods = {}
      }
    },
    snapshot() {
      return Object.fromEntries(records)
    }
  }
}
