import { describe, expect, it } from "vitest";
import { Probability, RuleId } from "../domain/contracts.ts";
import { configuredRules, deriveAdvice } from "./rules.ts";

const snapshot = { path: "src/example.ts", contentHash: "abc123" };

describe("advice policy", () => {
  it("keeps zero and the threshold clean, and reports values above it", () => {
    const rule = configuredRules[0];
    if (rule === undefined) throw new Error("expected a configured rule");
    const atThreshold = { [rule.id]: Probability.make(0.7) };
    expect(deriveAdvice([rule], atThreshold, snapshot, 5)).toEqual([]);

    const above = { [rule.id]: Probability.make(1) };
    expect(deriveAdvice([rule], above, snapshot, 5)).toEqual([
      {
        ruleId: RuleId.make(rule.id),
        probability: Probability.make(1),
        message: rule.message,
        snapshot,
      },
    ]);
  });

  it("orders by probability then stable rule rank and enforces the budget", () => {
    const assessment = Object.fromEntries(
      configuredRules.map((rule) => [rule.id, Probability.make(0.9)]),
    );
    const advice = deriveAdvice(configuredRules, assessment, snapshot, 3);
    expect(advice).toHaveLength(3);
    expect(advice.map((item) => item.ruleId)).toEqual(
      configuredRules.slice(0, 3).map((rule) => rule.id),
    );
  });
});
