import { expect, it } from "vitest"
import { formatRule, type RuleInventoryEntry } from "@hapsland/administration/rules/inventory"

const authored: RuleInventoryEntry = {
  id: "namespace/example",
  title: "Example",
  enabled: true,
  source: "definition.jsonc",
  path: "definition.jsonc",
  question: "Does the declaration admit an invalid state?",
  criteria: { false: "valid", true: "invalid" },
  inputs: [{ kind: "type", languages: ["typescript"], requires: ["root-declaration"] }],
  languages: undefined,
  filters: undefined,
  threshold: 0.8,
  message: "Check the state.",
  origin: undefined,
  reference: undefined,
  origins: []
}

it("shows authored defaults and configured overrides without losing input requirements", () => {
  const initial = formatRule(authored)
  expect(initial).toContain("Example (enabled)")
  expect(initial).toContain("Input: type; languages: typescript; requires: root-declaration")
  expect(initial).toContain("Configuration languages: authored languages")
  expect(initial).toContain("Includes: all globally selected paths")
  expect(initial).toContain("Excludes: none")
  const configured = formatRule({
    ...authored,
    enabled: false,
    path: undefined,
    inputs: [{ kind: "schema", dialect: "effect", languages: ["typescript"], requires: [] }],
    languages: ["typescript"],
    filters: { includes: ["src/**"], excludes: ["src/generated/**"] }
  })
  expect(configured).toContain("Example (disabled)")
  expect(configured).toContain("File: definition.jsonc")
  expect(configured).toContain("requires: none; dialect: effect")
  expect(configured).toContain("Configuration languages: typescript")
  expect(configured).toContain("Includes: src/**")
  expect(configured).toContain("Excludes: src/generated/**")
})
