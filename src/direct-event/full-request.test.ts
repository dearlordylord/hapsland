import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { Decision } from "effect/unstable/ai";
import { configuredRules } from "../policy/rules.ts";
import { controlledDecisionModelLayer } from "../test-support/controlled-decision-model.ts";
import { MAX_FULL_JEV_REQUEST_BYTES, encodedFullJevRequestBytes,
  encodedPreparedProviderHttpBodyBytes, evaluatePrepared } from "./pipeline.ts";
import type { PreparedUnit } from "./model.ts";
import { encodedProviderHttpBodyBytes } from "./provider-body-size.ts";

describe("finite complete Jev request", () => {
  it("fails closed for unsupported or invalid provider bodies", () => {
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
  it.effect("rejects an oversized rule instruction before dispatch", () => Effect.gen(function* () {
    const rule = configuredRules[0];
    if (rule === undefined) throw new Error("missing rule fixture");
    const decision = Decision.probability({ instructions: "x".repeat(MAX_FULL_JEV_REQUEST_BYTES),
      criteria: { false: "No", true: "Yes" } });
    const prepared: PreparedUnit = {
      root: "/fixture", advicee: { host: "codex-cli", hostVersion: "0.155.1", sessionId: "s",
        turnId: "t", toolUseId: "u", subagentId: null },
      identity: "fixture",
      input: { contract: "fixture", completeness: "complete", path: "a.ts",
        declaration: { id: "a.ts:type-alias:A", kind: "type-alias", name: "A",
          source: "type A = number", sourceHash: "fixture" },
        unit: { root: { artifact: { id: "a.ts:type-alias:A", kind: "type-alias", name: "A",
          source: "type A = number", sourceHash: "fixture" }, references: [] } },
        rules: [{ ...rule, decision }], interpretation: "probability-strictly-greater-than-threshold" },
    };
    expect(encodedFullJevRequestBytes(prepared)).toBeGreaterThan(MAX_FULL_JEV_REQUEST_BYTES);
    let started = false;
    const result = yield* evaluatePrepared(prepared, Effect.sync(() => { started = true; })).pipe(
      Effect.provide(controlledDecisionModelLayer({ answers: {} })));
    expect(result.status).toBe("input-limit");
    expect(started).toBe(false);
  }));

  it.effect("dispatches at the exact provider body cap and denies one byte beyond", () => Effect.gen(function* () {
    const rule = configuredRules[0];
    if (rule === undefined) throw new Error("missing rule fixture");
    const base: PreparedUnit = {
      root: "/fixture", advicee: { host: "codex-cli", hostVersion: "0.155.1", sessionId: "s",
        turnId: "t", toolUseId: "u", subagentId: null },
      identity: "fixture",
      input: { contract: "fixture", completeness: "complete", path: "a.ts",
        declaration: { id: "a.ts:type-alias:A", kind: "type-alias", name: "A",
          source: "type A = number", sourceHash: "fixture" },
        unit: { root: { artifact: { id: "a.ts:type-alias:A", kind: "type-alias", name: "A",
          source: "type A = number", sourceHash: "fixture" }, references: [] } },
        rules: [{ ...rule, decision: Decision.probability({ instructions: "",
          criteria: { false: "No", true: "Yes" } }) }],
        interpretation: "probability-strictly-greater-than-threshold" },
    };
    const preparedAt = (length: number): PreparedUnit => ({ ...base, input: { ...base.input,
      rules: [{ ...rule, decision: Decision.probability({ instructions: "x".repeat(length),
        criteria: { false: "No", true: "Yes" } }) }] } });
    const exact = preparedAt(MAX_FULL_JEV_REQUEST_BYTES - encodedPreparedProviderHttpBodyBytes(base));
    const oversized = preparedAt(MAX_FULL_JEV_REQUEST_BYTES - encodedPreparedProviderHttpBodyBytes(base) + 1);
    expect(encodedPreparedProviderHttpBodyBytes(exact)).toBe(MAX_FULL_JEV_REQUEST_BYTES);
    expect(encodedPreparedProviderHttpBodyBytes(oversized)).toBe(MAX_FULL_JEV_REQUEST_BYTES + 1);
    let started = 0;
    const model = controlledDecisionModelLayer({ answers: {
      [rule.id]: { _tag: "Probability", probability: 0.1 },
    } });
    const admitted = yield* evaluatePrepared(exact, Effect.sync(() => { started++; })).pipe(Effect.provide(model));
    expect(admitted.status).not.toBe("input-limit");
    expect(started).toBe(1);
    const denied = yield* evaluatePrepared(oversized, Effect.sync(() => { started++; })).pipe(Effect.provide(model));
    expect(denied.status).toBe("input-limit");
    expect(started).toBe(1);

    const fourRules = (length: number): PreparedUnit => ({ ...base, input: { ...base.input,
      rules: Array.from({ length: 4 }, (_, index) => ({ ...rule, id: `rule-${index}`,
        decision: Decision.probability({ instructions: index === 0 ? "x".repeat(length) : "",
          criteria: { false: "No", true: "Yes" } }) })) } });
    const fourBase = fourRules(0);
    const providerAtCap = fourRules(MAX_FULL_JEV_REQUEST_BYTES - encodedPreparedProviderHttpBodyBytes(fourBase));
    expect(encodedPreparedProviderHttpBodyBytes(providerAtCap)).toBe(MAX_FULL_JEV_REQUEST_BYTES);
    expect(encodedFullJevRequestBytes(providerAtCap)).toBeGreaterThan(MAX_FULL_JEV_REQUEST_BYTES);
    const fourAnswers = Object.fromEntries(providerAtCap.input.rules.map(({ id }) =>
      [id, { _tag: "Probability" as const, probability: 0.1 }]));
    const localOverProviderFits = yield* evaluatePrepared(providerAtCap,
      Effect.sync(() => { started++; })).pipe(Effect.provide(controlledDecisionModelLayer({ answers: fourAnswers })));
    expect(localOverProviderFits.status).not.toBe("input-limit");
    expect(started).toBe(2);
  }));
});
