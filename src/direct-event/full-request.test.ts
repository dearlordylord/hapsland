import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { Decision } from "effect/unstable/ai";
import { configuredRules } from "../policy/rules.ts";
import { controlledDecisionModelLayer } from "../test-support/controlled-decision-model.ts";
import { MAX_FULL_JEV_REQUEST_BYTES, encodedFullJevRequestBytes, evaluatePrepared } from "./pipeline.ts";
import type { PreparedUnit } from "./model.ts";

describe("finite complete Jev request", () => {
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
});
