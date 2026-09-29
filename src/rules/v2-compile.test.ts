import { describe, expect, it } from "vitest";
import { compileRulePackV2, selectApplicableRules } from "./compiler.ts";
import { V2_FUNCTION_CONTRACT, V2_TYPE_CONTRACT } from "./v2-targets.ts";

const pack = () => ({ schemaVersion: 2, id: "team", contentVersion: "1", rules: [{
  id: "readable", question: "Is it readable?", criteria: { false: "No", true: "Yes" },
  threshold: 0.8, message: "Improve readability", reviewTargets: [
    { artifactKind: "typeShape", inputContract: V2_TYPE_CONTRACT,
      capabilities: ["root-declaration", "resolved-outbound-types"] },
    { artifactKind: "function", inputContract: V2_FUNCTION_CONTRACT,
      capabilities: ["signature", "body"] },
  ],
}] });

describe("explicit v2 rule target compilation", () => {
  it("selects only the exact branch and complete declared capabilities", () => {
    const rules = compileRulePackV2(pack(), "fixture-v2");
    expect(rules).toHaveLength(1);
    expect(rules[0]?.threshold).toBe(0.8);
    expect(selectApplicableRules(rules, "function run() {}", "a.ts", {
      artifactKind: "function", inputContract: V2_FUNCTION_CONTRACT, complete: true,
      capabilities: ["signature", "body", "resolved-local-calls", "resolved-outbound-types"],
    })).toHaveLength(1);
    expect(selectApplicableRules(rules, "function run() {}", "a.ts", {
      artifactKind: "function", inputContract: V2_FUNCTION_CONTRACT, complete: true,
      capabilities: ["signature"],
    })).toEqual([]);
    expect(selectApplicableRules(rules, "function run() {}", "a.ts", {
      artifactKind: "function", inputContract: V2_TYPE_CONTRACT, complete: true,
      capabilities: ["root-declaration", "resolved-outbound-types"],
    })).toEqual([]);
    expect(selectApplicableRules(rules, "type A = number", "a.ts", {
      artifactKind: "typeShape", inputContract: V2_TYPE_CONTRACT, complete: false,
      capabilities: ["root-declaration", "resolved-outbound-types"],
    })).toEqual([]);
  });

  it("changes compiled identity when an authored target or effective threshold changes", () => {
    const original = compileRulePackV2(pack(), "fixture-v2")[0];
    const changed = pack();
    changed.rules[0]!.reviewTargets[1]!.capabilities.push("resolved-local-calls");
    const targetChanged = compileRulePackV2(changed, "fixture-v2")[0];
    const thresholdChanged = compileRulePackV2({ ...pack(), rules: [{ ...pack().rules[0], threshold: 0.6 }] }, "fixture-v2")[0];
    expect(targetChanged?.definitionDigest).not.toBe(original?.definitionDigest);
    expect(thresholdChanged?.threshold).not.toBe(original?.threshold);
  });
});
