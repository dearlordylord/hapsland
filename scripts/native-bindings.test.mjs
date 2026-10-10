import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { resolveBunRuntime } from "./pinned-bun.mjs"
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { resolve, join } from "node:path"
import { randomBytes } from "node:crypto"
import { pathToFileURL } from "node:url"

for (const runtime of [
  { name: "Node", executable: process.execPath },
  { name: "Bun", ...resolveBunRuntime() }
])
  test(`source ${runtime.name} loads physical TypeScript, Rust and Go parser bindings`, () => {
    const probe = `
    const { Parser, Rust, Go, typeScriptRoot } = await import("./packages/source-analysis/src/direct-event/languages/native-parser.ts");
    const ts = typeScriptRoot("fixture.ts", "type Count = number");
    const parser = new Parser();
    parser.setLanguage(Rust);
    const rust = parser.parse("type Count = u32;").rootNode;
    parser.setLanguage(Go);
    const go = parser.parse("package p\\ntype Count int\\n").rootNode;
    console.log(JSON.stringify({ go: go.type, goError: go.hasError, ts: ts.type, tsError: ts.hasError, rust: rust.type, rustError: rust.hasError }));
  `
    const result = execFileSync(runtime.executable, ["-e", probe], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      timeout: 10000
    })
    assert.deepEqual(JSON.parse(result), {
      go: "source_file",
      goError: false,
      ts: "program",
      tsError: false,
      rust: "source_file",
      rustError: false
    })
  })

test("materialized Bun runtime loads the owner parser artifacts", (t) => {
  const root = resolve(import.meta.dirname, "..")
  const directory = join(root, ".test-runs/source-runtime", randomBytes(32).toString("hex"))
  mkdirSync(directory, { recursive: true })
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const entry = join(directory, "probe.ts"),
    output = join(directory, "parser.mjs")
  writeFileSync(
    entry,
    `import { typeScriptRoot } from ${JSON.stringify(join(root, "packages/source-analysis/src/direct-event/languages/native-parser.ts"))};
console.log(typeScriptRoot("fixture.ts", "type Count = number").type);`
  )
  const plugin = pathToFileURL(
    join(root, "packages/source-analysis/src/direct-event/languages/native-bindings.ts")
  ).href
  const nativeRoot =
    'require("node:path").resolve(require("node:path").dirname(process.argv[1]),"../../../packages/source-analysis/artifacts/native",process.platform+"-"+process.arch)'
  const build = `import {physicalNativeBindings} from ${JSON.stringify(plugin)};
const result=await Bun.build({entrypoints:[${JSON.stringify(entry)}],outdir:${JSON.stringify(directory)},naming:"parser.mjs",target:"bun",plugins:[physicalNativeBindings(${JSON.stringify(nativeRoot)})]});
if(!result.success)throw new Error(result.logs.map(String).join("\\n"));`
  const bun = resolveBunRuntime().executable
  execFileSync(bun, ["-e", build], { cwd: root, timeout: 10000, stdio: "pipe" })
  assert.equal(execFileSync(bun, [output], { cwd: root, encoding: "utf8", timeout: 10000 }).trim(), "program")
})
