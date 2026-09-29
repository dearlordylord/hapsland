import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { BUNDLED_NOUL_PACK, NOUL_MESSAGES } from "./bundled.ts";
import { compileRulePackV2, selectApplicableRules } from "./compiler.ts";
import { V2_FUNCTION_CONTRACT, V2_TYPE_CONTRACT } from "./v2-targets.ts";

const proposedUrl = new URL("../../evidence/issue-138-adoption/proposed-type-rule-pack-v2.json", import.meta.url);
const proposed = JSON.parse(await readFile(proposedUrl, "utf8")) as {
  schemaVersion: number;
  id: string;
  contentVersion: string;
  rules: Array<{
    id: string; question: string; criteria: { false: string; true: string };
    threshold: number; message: string;
    reviewTargets: Array<{ artifactKind: string; inputContract: string; capabilities: string[] }>;
  }>;
};
const bundled = BUNDLED_NOUL_PACK.rules.find((rule) => rule.id === "r2_meaningless_combinations");

// These hashes identify this unapproved proposal. Any authored content change needs review.
const PACK_DIGEST = "41e92afe7d4b91471d5d59e61936cad7debc37df6133eb3a4c8ab7a9efa7e5e8";
const DEFINITION_DIGEST = "f0ed1d1bdb68df2a44eb74bbf5620bcb4b020c562bd97a58583394a22901a59f";

const completeType = {
  artifactKind: "typeShape" as const, inputContract: V2_TYPE_CONTRACT, complete: true,
  capabilities: ["root-declaration", "resolved-outbound-types", "selected-source-type-closure"] as const,
};

describe("unapproved Noul r2 type v2 pack proposal", () => {
  it("copies bundled r2 semantic text, criteria, threshold, and message byte for byte", () => {
    expect(bundled).toBeDefined();
    if (bundled === undefined) throw new Error("bundled Noul r2 missing");
    expect(proposed.schemaVersion).toBe(2);
    expect(proposed.id).toBe("noul-type-v2-proposal");
    expect(proposed.contentVersion).toBe("0.0.0-proposal.1");
    expect(proposed.rules).toHaveLength(1);
    const rule = proposed.rules[0];
    expect(rule).toBeDefined();
    if (rule === undefined) throw new Error("proposal rule missing");
    expect({ id: rule.id, question: rule.question, criteria: rule.criteria,
      threshold: rule.threshold, message: rule.message }).toEqual({
      id: bundled.id, question: bundled.question, criteria: bundled.criteria,
      threshold: bundled.threshold, message: bundled.message,
    });
    expect(Buffer.from(rule.question)).toEqual(Buffer.from(bundled.question));
    expect(Buffer.from(JSON.stringify(rule.criteria))).toEqual(Buffer.from(JSON.stringify(bundled.criteria)));
    const noulMessage = NOUL_MESSAGES.r2_meaningless_combinations;
    if (noulMessage === undefined) throw new Error("bundled Noul r2 message missing");
    expect(Buffer.from(rule.message)).toEqual(Buffer.from(noulMessage));
    expect(rule.reviewTargets).toEqual([{ artifactKind: "typeShape", inputContract: V2_TYPE_CONTRACT,
      capabilities: ["root-declaration", "resolved-outbound-types", "selected-source-type-closure"] }]);
    expect(BUNDLED_NOUL_PACK.schemaVersion).toBe(1);
    expect("reviewTargets" in bundled).toBe(false);
  });

  it("compiles to fixed identities and selects exactly the complete type target", () => {
    const compiled = compileRulePackV2(proposed, "proposal:issue-138");
    expect(compiled).toHaveLength(1);
    const rule = compiled[0];
    expect(rule).toBeDefined();
    if (rule === undefined) throw new Error("compiled proposal missing");
    expect(rule.id).toBe("noul-type-v2-proposal/r2_meaningless_combinations");
    expect(rule.packDigest).toBe(PACK_DIGEST);
    expect(rule.definitionDigest).toBe(DEFINITION_DIGEST);
    expect(rule.decision).toEqual({ _tag: "Probability", instructions: bundled?.question,
      criteria: bundled?.criteria });
    expect(rule.message).toBe(bundled?.message);
    expect(rule.threshold).toBe(bundled?.threshold);
    expect(selectApplicableRules(compiled, "interface Order { amount: Amount }", "src/order.ts", completeType))
      .toEqual([rule]);
    expect(selectApplicableRules(compiled, "interface Order { amount: Amount }", "src/order.ts",
      { ...completeType, complete: false })).toEqual([]);
    expect(selectApplicableRules(compiled, "interface Order { amount: Amount }", "src/order.ts",
      { ...completeType, capabilities: ["root-declaration", "resolved-outbound-types"] })).toEqual([]);
    expect(selectApplicableRules(compiled, "function order() {}", "src/order.ts",
      { artifactKind: "function", inputContract: V2_FUNCTION_CONTRACT, complete: true,
        capabilities: ["signature", "body", "resolved-local-calls", "resolved-outbound-types"] })).toEqual([]);
  });
});
