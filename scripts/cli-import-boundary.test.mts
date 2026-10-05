import { readFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { expect, it } from "vitest"
import { descendants, typeScriptRoot } from "../src/direct-event/languages/native-parser.ts"

// Follow static runtime imports/re-exports only. Dynamic workflow imports are
// deliberately outside the startup graph; type references execute no code.
const eagerImports = (file: string) => {
  const tree = typeScriptRoot(file, readFileSync(file, "utf8"))
  const imports: string[] = []
  for (const node of descendants(tree)) {
    if (!["import_statement", "export_statement"].includes(node.type)) continue
    if (/^(import|export)\s+type\b/u.test(node.text)) continue
    const source = node.childForFieldName("source")
    const specifiers = descendants(node).filter((child) =>
      ["import_specifier", "export_specifier"].includes(child.type)
    )
    const clause = node.namedChildren.find((child) => child.type === "import_clause")
    if (
      specifiers.length &&
      specifiers.every((child) => /^type\s/u.test(child.text)) &&
      (node.type === "export_statement" || clause?.namedChildren.every((child) => child.type === "named_imports"))
    )
      continue
    if (source?.type === "string") imports.push(source.text.slice(1, -1))
  }
  return imports
}

it("keeps administrative workflows, parsers and provider execution outside the shared CLI eager import graph", () => {
  const root = resolve(import.meta.dirname, "..")
  const pending = [resolve(root, "src/cli.ts")]
  const seen = new Set<string>()
  const external = new Set<string>()
  while (pending.length) {
    const file = pending.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    for (const specifier of eagerImports(file)) {
      if (specifier.startsWith(".")) pending.push(resolve(dirname(file), specifier))
      else external.add(specifier)
    }
  }
  const paths = [...seen].map((file) => relative(root, file))
  expect(paths).toContain("src/cli-command.ts")
  expect(paths).toContain("src/runtime/hook-invocation.ts")
  expect(eagerImports(resolve(root, "src/runtime/hook-invocation.ts"))).toEqual([])
  expect(paths).toContain("src/pi/transport.ts")
  expect(paths).toContain("src/resident/client.ts")
  expect(
    paths.filter(
      (path) =>
        /^src\/onboarding\/(?:.*-installation|setup|doctor|maintenance|client-lifecycle|first-review-demo)\.ts$/u.test(
          path
        ) ||
        path === "src/evaluation/command.ts" ||
        path === "src/direct-event/pipeline.ts" ||
        path === "src/direct-event/languages/native-parser.ts" ||
        path === "src/jev-decision.ts" ||
        path === "src/direct-event/languages/bend/extractor.ts" ||
        path === "src/review-providers/cloudflare.ts"
    )
  ).toEqual([])
  expect(
    [...external].filter((specifier) => specifier === "effect/ai" || specifier.startsWith("@effect/ai-typesafe"))
  ).toEqual([])
})
