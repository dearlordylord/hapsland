import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Decision, DecisionModel } from "effect/unstable/ai";
import { controlledDecisionModelLayer } from "./controlled-decision-model.ts";

const before = "type OrderCount = number";
const after = 'type OrderCount = number & { readonly __brand: "OrderCount" }';
const definition = Decision.make({
  input: Schema.Json,
  decisions: { r6_bare_domain_value: Decision.probability({
    instructions: "Is this a bare domain value?",
    criteria: { true: "bare", false: "branded" },
  }) },
});

const decide = (source: string, scenario: "control" | "finding", domain = "order-count.ts") =>
  Effect.gen(function* () {
    const model = yield* DecisionModel.DecisionModel;
    return yield* model.decide(definition, { input: { artifact: { domain, source } } });
  }).pipe(Effect.provide(controlledDecisionModelLayer({ syntheticR6BrandedRepair: scenario })));

describe("source-sensitive synthetic r6 fixture", () => {
  it.effect("classifies each exact line ending for bare and branded snapshots", () =>
    Effect.gen(function* () {
      for (const ending of ["", "\n", "\r\n"]) {
        const initial = yield* decide(`${before}${ending}`, "finding");
        const repaired = yield* decide(`${after}${ending}`, "finding");
        const control = yield* decide(`${before}${ending}`, "control");
        expect(initial.answers.r6_bare_domain_value.probability).toBe(0.9);
        expect(repaired.answers.r6_bare_domain_value.probability).toBe(0);
        expect(control.answers.r6_bare_domain_value.probability).toBe(0);
      }
    }));

  it("rejects an unknown snapshot instead of returning a clear answer", async () => {
    for (const source of ["type OrderCount = string", `${before}\n\n`, `${after} `, `${after}\r`]) {
      await expect(Effect.runPromise(decide(source, "finding"))).rejects.toThrow();
    }
    await expect(Effect.runPromise(decide(`${after}\n`, "control"))).rejects.toThrow();
    await expect(Effect.runPromise(decide(before, "finding", "other.ts"))).rejects.toThrow();
  });
});
