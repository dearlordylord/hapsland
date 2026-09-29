import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { Decision } from "effect/unstable/ai";
import { configuredRules } from "../policy/rules.ts";
import { controlledDecisionModelLayer } from "../test-support/controlled-decision-model.ts";
import { encodedPreparedProviderInputBytes, encodedPreparedProviderHttpBodyBytes, evaluatePrepared } from "./pipeline.ts";
import type { PreparedUnit } from "./model.ts";
import { encodedProviderHttpBodyBytes } from "./provider-body-size.ts";
import { TYPE_INPUT_CONTRACT } from "../rules/targets.ts";

describe("complete Jev request measurement", () => {
  it("marks unsupported or invalid provider bodies as unmeasurable", () => {
    const decision = Decision.probability({ instructions: "Check", criteria: { false: "No", true: "Yes" } });
    const valid = [{ id: "one", decision }];
    expect(encodedProviderHttpBodyBytes({ nested: undefined }, valid)).toBe(Number.POSITIVE_INFINITY);
    expect(encodedProviderHttpBodyBytes({ ok: true }, [])).toBe(Number.POSITIVE_INFINITY);
    expect(encodedProviderHttpBodyBytes({ ok: true }, [valid[0]!, valid[0]!])).toBe(Number.POSITIVE_INFINITY);
    expect(encodedProviderHttpBodyBytes({ ok: true }, [{ id: "__proto__", decision }])).toBe(Number.POSITIVE_INFINITY);
    expect(encodedProviderHttpBodyBytes({ ok: true }, [{ id: "invalid", decision: {
      _tag: "Rate", instructions: "Check", criteria: ["No", "Yes"],
    } as unknown as typeof decision }])).toBe(Number.POSITIVE_INFINITY);
  });
  it.effect("keeps the evidence limit while allowing a large rule instruction", () => Effect.gen(function* () {
    const rule = configuredRules[0];
    if (rule === undefined) throw new Error("missing rule fixture");
    const decision = Decision.probability({ instructions: "x".repeat(150_000),
      criteria: { false: "No", true: "Yes" } });
    const prepared: PreparedUnit = {
      root: "/fixture", advicee: { host: "codex-cli", hostVersion: "0.155.1", sessionId: "s",
        turnId: "t", toolUseId: "u", subagentId: null },
      identity: "fixture",
      input: { contract: TYPE_INPUT_CONTRACT, candidateProjection: true, completeness: "complete", path: "a.ts",
        declaration: { path: "a.ts", id: "a.ts:type-alias:A", kind: "type-alias", name: "A",
          source: "type A = number", sourceHash: "fixture" },
        unit: { root: { artifact: { path: "a.ts", id: "a.ts:type-alias:A", kind: "type-alias", name: "A",
          source: "type A = number", sourceHash: "fixture" }, references: [] } },
        rules: [{ ...rule, decision }], interpretation: "probability-strictly-greater-than-threshold" },
    };
    expect(encodedPreparedProviderInputBytes(prepared)).toBeLessThanOrEqual(20_480);
    expect(encodedPreparedProviderHttpBodyBytes(prepared)).toBeGreaterThan(150_000);
    let started = false;
    const result = yield* evaluatePrepared(prepared, Effect.sync(() => { started = true; })).pipe(
      Effect.provide(controlledDecisionModelLayer({ answers: {
        [rule.id]: { _tag: "Probability", probability: 0.1 },
      } })));
    expect(result.status).not.toBe("input-limit");
    expect(started).toBe(true);
  }));
});
