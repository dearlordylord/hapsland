// Diagnostic-only source instrumentation; never selected by proof acceptance.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { execFileSync } from "node:child_process"
import { parse } from "@babel/parser"

const compiler = resolve(process.env.HAPSLAND_BEND_COMPILER_SOURCE ?? "")
assert.ok(process.env.HAPSLAND_BEND_COMPILER_SOURCE, "explicit pinned compiler source checkout required")
const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: compiler, encoding: "utf8" }).trim()
assert.equal(revision, "ae1101ca7d15364f9274fa6b1367d175884a7da7")
assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: compiler, encoding: "utf8" }).trim(), "")
assert.equal(process.argv.length, 4, "expected one complete proof file and --verdict")
assert.ok(process.argv[2].endsWith(".bend"), "expected a Bend proof file")
assert.equal(process.argv[3], "--verdict", "this diagnostic retains the complete verdict command")
assert.ok(process.env.BENDTT, "use an explicit existing kernel, without rebuilding it")

const header = `
const __hapslandFrames = [];
let __hapslandPass = 0;
function __hapslandEnter(name, definition) {
  if (name === "safe_pass") ++__hapslandPass;
  const frame = {name, definition, pass: __hapslandPass, start: performance.now(), child: 0};
  __hapslandFrames.push(frame);
  return frame;
}
function __hapslandLeave(frame) {
  const milliseconds = performance.now() - frame.start;
  if (__hapslandFrames.pop() !== frame) throw new Error("diagnostic stack mismatch");
  const parent = __hapslandFrames.at(-1);
  if (parent) parent.child += milliseconds;
  if (milliseconds >= 5 || frame.name !== "item_emit")
    console.error(JSON.stringify({diagnosticOnly: true, stage: frame.name,
      definition: frame.definition, pass: frame.pass,
      milliseconds, selfMilliseconds: milliseconds - frame.child}));
}
`
const instrument = (source, names) => {
  const tree = parse(source, { sourceType: "module", plugins: ["typescript"] })
  const edits = []
  for (const statement of tree.program.body) {
    const node = statement.declaration ?? statement
    if (node.type !== "FunctionDeclaration" || !names.includes(node.id?.name)) continue
    const name = node.id.name
    const definition = name === "item_emit" ? "k" : JSON.stringify(name)
    edits.push([
      node.body.start + 1,
      `\nconst __hapslandFrame = __hapslandEnter(${JSON.stringify(name)}, ${definition}); try {\n`
    ])
    edits.push([node.body.end - 1, "\n} finally { __hapslandLeave(__hapslandFrame); }\n"])
  }
  assert.equal(edits.length, names.length * 2, "all expected timing boundaries must exist")
  for (const [position, addition] of edits.sort((a, b) => b[0] - a[0]))
    source = source.slice(0, position) + addition + source.slice(position)
  const shebangEnd = source.startsWith("#!") ? source.indexOf("\n") + 1 : 0
  return source.slice(0, shebangEnd) + header + source.slice(shebangEnd)
}

Bun.plugin({
  name: "hapsland-full-verdict-attribution",
  setup(builder) {
    builder.onLoad({ filter: /\/(?:safe|main)\.ts$/ }, ({ path }) => {
      const safe = resolve(compiler, "bend2/safe.ts")
      const main = resolve(compiler, "bend2/main.ts")
      if (path !== safe && path !== main) return
      let source = readFileSync(path, "utf8")
      if (path === safe) {
        const retry = "    return null;\n  }\n  // a def that names a def out of scope is out too"
        const regroup = "  throw new Regroup(key);"
        const registration = "  let n = e.names.get(key);\n  if (n === undefined) {"
        assert.equal(source.split(registration).length, 2)
        source = source.replace(
          registration,
          `${registration}\n    if (k === "Nat.read.go") console.error(JSON.stringify({diagnosticOnly: true,\n      stage: "nat_read_registration", pass: __hapslandPass, live, stack: e.stack}));`
        )
        assert.equal(source.split(retry).length, 2)
        assert.equal(source.split(regroup).length, 2)
        source = source.replace(
          retry,
          `    console.error(JSON.stringify({diagnosticOnly: true, stage: "pass_retry",
            pass: __hapslandPass, grew: e.grew, initialGroups: g0, finalGroups: groups.size,
            triggeringKeys: [...e.names.keys()].filter(key => key[0] !== "\\t" && groups.has(key.split("\\n")[0]))}));
${retry}`
        )
        source = source.replace(
          regroup,
          `  console.error(JSON.stringify({diagnosticOnly: true, stage: "regroup",
            pass: __hapslandPass, key, leader: g.k, members: g.ms, grew: e.grew, stack: e.stack}));
${regroup}`
        )
        source = instrument(source, ["safe_pass", "item_emit"])
      } else {
        source = instrument(source, ["cli_verdict", "book_promises"])
        assert.equal(source.split("if (import.meta.main)").length, 2)
        source = source.replace("if (import.meta.main)", "if (true)")
      }
      return { contents: source, loader: "ts" }
    })
  }
})
console.error(JSON.stringify({ diagnosticOnly: true, compilerRevision: revision, kernel: process.env.BENDTT }))
await import(pathToFileURL(resolve(compiler, "bend2/main.ts")).href)
