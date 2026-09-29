import { describe, expect, it } from "vitest";
import { decodeRulePackDocument } from "./schema.ts";
import { FUNCTION_INPUT_CONTRACT, TYPE_INPUT_CONTRACT } from "./targets.ts";

const pack = () => ({ schemaVersion: 1, id: "pack", contentVersion: "1", rules: [{
  id: "rule", question: "Q", criteria: { false: "N", true: "Y" }, message: "M",
  reviewTargets: [{ artifactKind: "typeShape", inputContract: TYPE_INPUT_CONTRACT,
    capabilities: ["root-declaration"] }],
}] });
const decode = (value: unknown) => decodeRulePackDocument(value, "fixture.jsonc");

describe("current rule-pack targets", () => {
  it("accepts one target per artifact kind and includes targets in identity", () => {
    const original = decode(pack());
    const base = pack();
    const both = { ...base, rules: [{ ...base.rules[0]!, reviewTargets: [
      ...base.rules[0]!.reviewTargets,
      { artifactKind: "function", inputContract: FUNCTION_INPUT_CONTRACT,
        capabilities: ["signature", "body"] },
    ] }] };
    expect(decode(both).rules[0]?.reviewTargets).toHaveLength(2);
    expect(decode(both).contentDigest).not.toBe(original.contentDigest);
  });

  it("rejects missing, mismatched, duplicated, and unsupported target declarations", () => {
    const base = pack();
    const rule = base.rules[0]!;
    const invalid = [
      { ...base, schemaVersion: 2 },
      { ...base, rules: [{ ...rule, reviewTargets: [] }] },
      { ...base, rules: [{ ...rule, reviewTargets: [{ ...rule.reviewTargets[0], inputContract: FUNCTION_INPUT_CONTRACT }] }] },
      { ...base, rules: [{ ...rule, reviewTargets: [{ ...rule.reviewTargets[0], capabilities: ["body"] }] }] },
      { ...base, rules: [{ ...rule, reviewTargets: [{ ...rule.reviewTargets[0], capabilities: ["root-declaration", "root-declaration"] }] }] },
      { ...base, rules: [{ ...rule, reviewTargets: [rule.reviewTargets[0], rule.reviewTargets[0]] }] },
      { ...base, rules: [{ id: rule.id, question: rule.question, criteria: rule.criteria, message: rule.message }] },
      { ...base, rules: [{ ...rule, resultForm: "choice" }] },
    ];
    for (const candidate of invalid) expect(() => decode(candidate)).toThrow();
  });
});
