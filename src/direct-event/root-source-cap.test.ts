import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { resolveConfiguration } from "../configuration/resolve.ts";
import { effectiveGraphLimits } from "../configuration/resolve.ts";
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "../runtime/review-config.ts";
import { configuredRules } from "../policy/rules.ts";
import { compileRulePackV2 } from "../rules/compiler.ts";
import { V2_FUNCTION_CONTRACT, V2_TYPE_CONTRACT } from "../rules/v2-targets.ts";
import { controlledDecisionModelLayer } from "../test-support/controlled-decision-model.ts";
import { adaptCodexDirectEvent } from "./adapter.ts";
import { DIRECT_EVENT_INPUT_CONTRACT } from "./model.ts";
import { measuredRootSourceDecision, prepareObservation, reviewObservation } from "./pipeline.ts";
import { addEvent, makeGitFixture, put } from "./test-fixtures.ts";

const rules = compileRulePackV2({
  schemaVersion: 2, id: "root-cap", contentVersion: "1", rules: [
    { id: "type", question: "Is the type clear?", criteria: { false: "No", true: "Yes" },
      message: "Review type", reviewTargets: [{ artifactKind: "typeShape",
        inputContract: V2_TYPE_CONTRACT, capabilities: ["root-declaration"] }] },
    { id: "function", question: "Is the function clear?", criteria: { false: "No", true: "Yes" },
      message: "Review function", reviewTargets: [{ artifactKind: "function",
        inputContract: V2_FUNCTION_CONTRACT, capabilities: ["signature", "body"] }] },
  ],
}, "fixture:root-cap");

describe("configured v2 root source cap", () => {
  for (const branch of [
    { contract: V2_TYPE_CONTRACT, declaration: "export interface A { value: string }" },
    { contract: V2_FUNCTION_CONTRACT, declaration: "export function A(): number { return 1 }" },
  ] as const) {
    it.effect(`lets Bend reject measured ${branch.contract} root bytes before parsing`, () => Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture);
      const source = `// ${"x".repeat(100)}\n${branch.declaration}\n`;
      const measuredBytes = Buffer.byteLength(source, "utf8");
      expect(measuredBytes).toBeGreaterThan(80);
      yield* Effect.promise(() => put(root, "a.ts", source));
      const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]));
      if (observation === undefined) throw new Error("fixture adaptation failed");
      const configuration = { policy: resolveConfiguration([{
        name: "user", source: "fixture:root-cap",
        document: { version: 1, graphLimits: { version: 1, sourceBytes: 80, readBytes: 80 } },
      }], root) };
      const limits = effectiveGraphLimits(configuration.policy);
      expect(measuredRootSourceDecision(measuredBytes, limits))
        .toEqual({ kind: "unitIncomplete", reason: "ReadLimit" });
      let preflightCalls = 0;
      const reads: string[] = [];
      const context = {
        controlledWriter: true, advicee: observation.advicee,
        inputContract: branch.contract,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION, configuration },
        rules,
        allowCandidateCrossFileEgress: true,
        captureHooks: { sourceRead: (path: string) => { reads.push(path); } },
        beforeAnalyze: () => Effect.sync(() => { preflightCalls += 1; return true; }),
      } as const;
      const prepared = yield* prepareObservation(observation, context);
      expect(reads).toEqual([]);
      expect(preflightCalls).toBe(0);
      expect(prepared.outcomes).toEqual([{ status: "skipped", path: "a.ts" }]);
      expect(prepared.observation.outcomes).toMatchObject([{
        status: "incomplete", path: "a.ts", reason: "capture-unavailable",
      }]);
      let providerCalls = 0;
      const reviewed = yield* reviewObservation(observation, context).pipe(
        Effect.provide(controlledDecisionModelLayer({
          onRequest: Effect.sync(() => { providerCalls += 1; }),
        })));
      expect(reviewed.status).toBe("no-advice");
      expect(providerCalls).toBe(0);
      expect(preflightCalls).toBe(0);
    }));
  }

  it.effect("retains the legacy same-file v1 path under a lower graph source cap", () => Effect.gen(function* () {
    const root = yield* Effect.promise(makeGitFixture);
    yield* Effect.promise(() => put(root, "a.ts", `// ${"x".repeat(100)}\ninterface A { value: string }\n`));
    const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]));
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const configuration = { policy: resolveConfiguration([{
      name: "user", source: "fixture:root-cap",
      document: { version: 1, graphLimits: { version: 1, sourceBytes: 80, readBytes: 80 } },
    }], root) };
    let preflightCalls = 0;
    const prepared = yield* prepareObservation(observation, {
      controlledWriter: true, advicee: observation.advicee,
      inputContract: DIRECT_EVENT_INPUT_CONTRACT,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION, configuration },
      rules: configuredRules,
      beforeAnalyze: () => Effect.sync(() => { preflightCalls += 1; return true; }),
    });
    expect(preflightCalls).toBe(1);
    expect(prepared.observation.outcomes[0]).toMatchObject({
      status: "observed", analysis: { status: "complete" },
      units: [{ root: { artifact: { name: "A" } } }],
    });
  }));
});
