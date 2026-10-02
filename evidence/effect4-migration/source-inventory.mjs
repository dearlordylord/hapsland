// Executable implementation evidence; syntax observations are not proof of behavior.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { typeScriptRoot, descendants } from "../../src/direct-event/languages/native-parser.ts";

const root = resolve(import.meta.dirname, "../..");
const expectedExclusions = ["src/**/*.test.ts", "src/test-support/**", "src/conformance/**",
  "src/direct-event/test-fixtures.ts", "src/resident/runtime-fixture.ts"];
const configuredExclusions = JSON.parse(readFileSync(resolve(root, "tsconfig.build.json"), "utf8")).exclude;
if (JSON.stringify(configuredExclusions) !== JSON.stringify(expectedExclusions)) {
  throw new Error("Production exclusions changed; update and review the source inventory traversal");
}
const pending = [];
const visitDirectory = directory => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) visitDirectory(path);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") && !entry.name.endsWith(".test.ts")) {
      const name = relative(root, path).replaceAll("\\", "/");
      if (!name.startsWith("src/test-support/") && !name.startsWith("src/conformance/") &&
        !["src/direct-event/test-fixtures.ts", "src/resident/runtime-fixture.ts"].includes(name)) pending.push(path);
    }
  }
};
visitDirectory(resolve(root, "src"));
const seen = new Set();
const modules = [];
while (pending.length > 0) {
  const path = pending.pop();
  if (seen.has(path)) continue;
  seen.add(path);
  const bytes = readFileSync(path);
  const syntax = typeScriptRoot(path, bytes.toString("utf8"));
  const parserErrors = descendants(syntax).filter(node => node.type === "ERROR").map(node => node.startPosition.row + 1);
  const nativeImports = new Set(), effectImports = new Set();
  const runtimeEntries = [], asyncFunctions = [], environmentAccess = [];
  const effectCalls = {};
  for (const node of descendants(syntax)) {
    const line = node.startPosition.row + 1;
    if (["import_statement", "export_statement"].includes(node.type)) {
      const token = node.childForFieldName("source")?.text;
      if (token !== undefined) {
        const name = token.slice(1, -1);
        if (name.startsWith("node:")) nativeImports.add(name);
        if (name === "effect" || name.startsWith("effect/") || name.startsWith("@effect/")) effectImports.add(name);
        if (name.startsWith(".")) {
          const imported = resolve(dirname(path), name);
          const candidate = imported.endsWith(".js") ? imported.slice(0, -3) + ".ts" : imported;
          if (candidate.startsWith(resolve(root, "src") + "/") && candidate.endsWith(".ts") &&
            !candidate.endsWith(".d.ts") && existsSync(candidate)) pending.push(candidate);
        }
      }
    }
    if (["function_declaration", "function_expression", "arrow_function", "method_definition"].includes(node.type) &&
      /^async\b/.test(node.text)) asyncFunctions.push(line);
    if (node.type === "member_expression" && node.childForFieldName("object")?.text === "process" &&
      node.childForFieldName("property")?.text === "env") environmentAccess.push(line);
    if (node.type === "call_expression") {
      const callee = node.childForFieldName("function");
      if (callee?.type === "member_expression" && callee.childForFieldName("object")?.text === "Effect") {
        const operation = callee.childForFieldName("property")?.text;
        if (operation === undefined) continue;
        effectCalls[operation] = (effectCalls[operation] ?? 0) + 1;
        if (["runPromise", "runSync", "runFork"].includes(operation)) runtimeEntries.push({ operation, line });
      }
    }
  }
  modules.push({ path: relative(root, path).replaceAll("\\", "/"),
    parserHasError: syntax.hasError === true, parserErrors,
    sha256: createHash("sha256").update(bytes).digest("hex"), nativeImports: [...nativeImports].sort(),
    effectImports: [...effectImports].sort(), runtimeEntries, asyncFunctions, environmentAccess, effectCalls });
}
modules.sort((a, b) => a.path.localeCompare(b.path));
process.stdout.write(JSON.stringify({ purpose: "Production source-graph Effect migration inventory",
  authority: "Source-inspection evidence; no behavioral, release or platform acceptance",
  method: "Tree-sitter AST traversal of production .ts roots using current tsconfig.build.json exclusions, followed by relative imports/exports including production-imported fixture ports. Hashes bind observations. Pure modules and native adapters require individual review. Counts recognize direct Effect and process.env syntax; aliases/dynamic imports require review.",
  moduleCount: modules.length, modules }, null, 2) + "\n");
