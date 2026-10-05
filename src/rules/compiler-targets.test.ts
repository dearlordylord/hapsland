import { describe, expect, it } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as Effect from "effect/Effect"
import { loadReviewSettings } from "../runtime/review-config.ts"
import { SHIPPED_DEFAULT_PACK } from "./shipped.ts"
import { compileRulePack, compileRules, parseQualifiedRuleId, selectApplicableRules } from "./compiler.ts"
import { FUNCTION_INPUT_CONTRACT, TYPE_INPUT_CONTRACT } from "./targets.ts"

const pack = () => ({
  schemaVersion: 1,
  id: "team",
  contentVersion: "1",
  rules: [
    {
      id: "readable",
      question: "Is it readable?",
      criteria: { false: "No", true: "Yes" },
      threshold: 0.8,
      message: "Improve readability",
      reviewTargets: [
        {
          artifactKind: "typeShape",
          inputContract: TYPE_INPUT_CONTRACT,
          capabilities: ["root-declaration", "resolved-outbound-types"]
        },
        { artifactKind: "function", inputContract: FUNCTION_INPUT_CONTRACT, capabilities: ["signature", "body"] }
      ]
    }
  ]
})

describe("explicit rule target compilation", () => {
  it("applies the bundled Noul minimum rung through Bend", () => {
    const rules = compileRules({
      packs: [
        {
          ...SHIPPED_DEFAULT_PACK,
          path: "built-in:noul",
          enabled: true,
          origin: { layer: "built-in", source: "built-in:noul", field: "bundled.noul" }
        }
      ]
    })
    const raw = selectApplicableRules(rules, '{"value":1}', "a.ts").map((rule) => rule.ruleId)
    const typed = selectApplicableRules(rules, "type Value = number", "a.ts").map((rule) => rule.ruleId)
    expect(raw).not.toContain("r3_split_correlations")
    expect(typed).toContain("r3_split_correlations")
  })

  it("loads an authored pack for both active review branches", async () => {
    const root = mkdtempSync(join(tmpdir(), "hapsland-rule-pack-"))
    try {
      writeFileSync(join(root, ".hapsland.jsonc"), JSON.stringify({ version: 1, packs: ["rules.jsonc"] }))
      writeFileSync(join(root, "rules.jsonc"), JSON.stringify(pack()))
      const settings = await Effect.runPromise(loadReviewSettings(root))
      const authored = settings.rules?.filter((rule) => rule.packId === "team") ?? []
      expect(authored).toHaveLength(1)
      expect(
        selectApplicableRules(authored, "type A = number", "a.ts", {
          artifactKind: "typeShape",
          inputContract: TYPE_INPUT_CONTRACT,
          complete: true,
          capabilities: ["root-declaration", "resolved-outbound-types", "selected-source-type-closure"]
        })
      ).toHaveLength(1)
      expect(
        selectApplicableRules(authored, "function run() {}", "a.ts", {
          artifactKind: "function",
          inputContract: FUNCTION_INPUT_CONTRACT,
          complete: true,
          capabilities: ["signature", "body", "resolved-local-calls", "resolved-outbound-types"]
        })
      ).toHaveLength(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it("selects only the exact branch and complete declared capabilities", () => {
    const rules = compileRulePack(pack(), "fixture-rule-pack")
    expect(rules).toHaveLength(1)
    expect(rules[0]?.threshold).toBe(0.8)
    expect(
      selectApplicableRules(rules, "function run() {}", "a.ts", {
        artifactKind: "function",
        inputContract: FUNCTION_INPUT_CONTRACT,
        complete: true,
        capabilities: ["signature", "body", "resolved-local-calls", "resolved-outbound-types"]
      })
    ).toHaveLength(1)
    expect(
      selectApplicableRules(rules, "function run() {}", "a.ts", {
        artifactKind: "function",
        inputContract: FUNCTION_INPUT_CONTRACT,
        complete: true,
        capabilities: ["signature"]
      })
    ).toEqual([])
    expect(
      selectApplicableRules(rules, "function run() {}", "a.ts", {
        artifactKind: "function",
        inputContract: TYPE_INPUT_CONTRACT,
        complete: true,
        capabilities: ["root-declaration", "resolved-outbound-types"]
      })
    ).toEqual([])
    expect(
      selectApplicableRules(rules, "type A = number", "a.ts", {
        artifactKind: "typeShape",
        inputContract: TYPE_INPUT_CONTRACT,
        complete: false,
        capabilities: ["root-declaration", "resolved-outbound-types"]
      })
    ).toEqual([])
  })

  it("changes compiled identity when an authored target or effective threshold changes", () => {
    const original = compileRulePack(pack(), "fixture-rule-pack")[0]
    const changed = pack()
    changed.rules[0]!.reviewTargets[1]!.capabilities.push("resolved-local-calls")
    const targetChanged = compileRulePack(changed, "fixture-rule-pack")[0]
    const thresholdChanged = compileRulePack(
      { ...pack(), rules: [{ ...pack().rules[0], threshold: 0.6 }] },
      "fixture-rule-pack"
    )[0]
    expect(targetChanged?.definitionDigest).not.toBe(original?.definitionDigest)
    expect(thresholdChanged?.threshold).not.toBe(original?.threshold)
  })
})

it.each([
  ["team/rule", { packId: "team", ruleId: "rule" }],
  ["team:rule", { packId: "team", ruleId: "rule" }],
  ["team:profile/rule", { packId: "team:profile", ruleId: "rule" }],
  ["team/rule:variant", { packId: "team", ruleId: "rule:variant" }],
  ["rule", undefined],
  ["/rule", undefined],
  ["team/", undefined],
  ["team/rule/other", undefined],
  ["team:rule:other", undefined],
  [":rule", undefined],
  ["team:", undefined]
])("parses qualified identity %j", (value, expected) => {
  expect(parseQualifiedRuleId(value)).toEqual(expected)
})
