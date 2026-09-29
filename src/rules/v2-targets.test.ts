import { describe, expect, it } from "vitest";
import { decodeRulePackV2, V2_FUNCTION_CONTRACT, V2_TYPE_CONTRACT } from "./v2-targets.ts";

const base = (): { schemaVersion: number; id: string; contentVersion: string; rules: Array<{ id: string; question: string; criteria: { false: string; true: string }; message: string; reviewTargets: Array<{ artifactKind: string; inputContract: string; capabilities: string[] }> }> } => ({ schemaVersion: 2, id: "pack", contentVersion: "1", rules: [{
  id: "rule", question: "Question?", criteria: { false: "No", true: "Yes" }, message: "Advice",
  reviewTargets: [{ artifactKind: "typeShape", inputContract: V2_TYPE_CONTRACT,
    capabilities: ["root-declaration", "resolved-outbound-types"] }],
}] });

describe("decodeRulePackV2", () => {
  it("returns frozen branch-specific target facts with content identities", () => {
    const raw = base();
    raw.rules[0]!.reviewTargets.push({ artifactKind: "function", inputContract: V2_FUNCTION_CONTRACT,
      capabilities: ["signature", "body"] });
    const decoded = decodeRulePackV2(raw);
    expect(decoded.rules[0]?.reviewTargets).toHaveLength(2);
    expect(Object.isFrozen(decoded.rules[0]?.reviewTargets[0]?.capabilities)).toBe(true);
    const before = decoded.contentDigest;
    raw.rules[0]!.reviewTargets[0]!.capabilities.push("selected-source-type-closure");
    expect(decodeRulePackV2(raw).contentDigest).not.toBe(before);
    expect(decoded.rules[0]?.reviewTargets[0]?.capabilities).toHaveLength(2);
  });
  it.each([
    [{ artifactKind: "typeShape", inputContract: V2_FUNCTION_CONTRACT, capabilities: ["root-declaration"] }],
    [{ artifactKind: "typeShape", inputContract: "direct-event/type-shape", capabilities: ["root-declaration"] }],
    [{ artifactKind: "typeShape", inputContract: V2_TYPE_CONTRACT, capabilities: ["body"] }],
    [{ artifactKind: "function", inputContract: V2_FUNCTION_CONTRACT, capabilities: ["unknown"] }],
    [{ artifactKind: "function", inputContract: V2_FUNCTION_CONTRACT, capabilities: [] }],
  ])("rejects unsupported target declarations", (targets) => {
    const raw = base();
    expect(() => decodeRulePackV2({ ...raw, rules: [{ ...raw.rules[0], reviewTargets: targets }] })).toThrow();
  });
  it("rejects v1 packs, omitted targets, duplicate targets, and unknown rule fields", () => {
    const raw = base();
    expect(() => decodeRulePackV2({ ...raw, schemaVersion: 1 })).toThrow();
    expect(() => decodeRulePackV2({ ...raw, rules: [{ id: "rule", question: "Q", criteria: { false: "N", true: "Y" }, message: "M" }] })).toThrow();
    expect(() => decodeRulePackV2({ ...raw, rules: [{ ...raw.rules[0], reviewTargets: [raw.rules[0]!.reviewTargets[0], raw.rules[0]!.reviewTargets[0]] }] })).toThrow();
    expect(() => decodeRulePackV2({ ...raw, rules: [{ ...raw.rules[0], resultForm: "other" }] })).toThrow();
  });
});
