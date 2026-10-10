import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const sharedModules = [
  "packages/source-analysis/src/direct-event/analyzer.ts",
  "packages/source-analysis/src/direct-event/function-analyzer.ts",
  "packages/source-analysis/src/direct-event/graph-resolver.ts",
  "packages/review-execution/src/direct-event/pipeline.ts",
  "packages/review-execution/src/direct-event/review-renderer.ts"
]
const publicLanguageModules = new Set([
  "./languages/registry.ts",
  "./languages/contracts.ts",
  "./languages/function-facts.ts",
  "@hapsland/source-analysis/direct-event/languages/registry"
])

describe("source-language architecture boundary", () => {
  it.each(sharedModules)("keeps %s independent of language implementations and grammar bindings", (module) => {
    const source = readFileSync(new URL(`../../${module}`, import.meta.url), "utf8")
    const imports = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)["']([^"']+)["']/gu)].map((match) => match[1]!)
    for (const imported of imports) {
      expect(imported.startsWith("tree-sitter"), `${module} imports a grammar directly`).toBe(false)
      if (imported.includes("/languages/")) {
        expect(publicLanguageModules.has(imported), `${module} imports a language implementation: ${imported}`).toBe(
          true
        )
      }
    }
    expect(source).not.toMatch(/rustCrateRoot|rustExternalModule|rustCrateModules|GraphInspectionOptions/u)
  })
})
