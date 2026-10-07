import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { resolveBunRuntime } from "./pinned-bun.mjs"

test("source Bun loads physical TypeScript and Rust parser bindings", () => {
  const runtime = resolveBunRuntime()
  const probe = `
    const { Parser, Rust, typeScriptRoot } = await import("./packages/source-analysis/src/direct-event/languages/native-parser.ts");
    const ts = typeScriptRoot("fixture.ts", "type Count = number");
    const parser = new Parser();
    parser.setLanguage(Rust);
    const rust = parser.parse("type Count = u32;").rootNode;
    console.log(JSON.stringify({ ts: ts.type, tsError: ts.hasError, rust: rust.type, rustError: rust.hasError }));
  `
  const result = execFileSync(runtime.executable, ["-e", probe], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    timeout: 10000
  })
  assert.deepEqual(JSON.parse(result), { ts: "program", tsError: false, rust: "source_file", rustError: false })
})
