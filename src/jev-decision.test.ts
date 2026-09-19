import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as DecisionModel from "effect/unstable/ai/DecisionModel";
import { decide, probability } from "./jev-decision.ts";

describe("Jev Decision adapter", () => {
  it.effect("renders structured Noul wording and batches typed answers", () =>
    Effect.gen(function* () {
      const calls: Array<DecisionModel.ProviderOptions> = [];
      const FakeDecisionModel = Layer.effect(
        DecisionModel.DecisionModel,
        DecisionModel.make({
          decide: (request) => {
            calls.push(request);
            return Effect.succeed({
              answers: {
                first: { _tag: "Probability", probability: 0.25 },
                second: { _tag: "Probability", probability: 0.75 },
              },
              usage: { inputTokens: 12, outputTokens: 3 },
            });
          },
        }),
      );
      const first = probability(
        { question: "Question one?", focus: "Focus one." },
        {
          false: { what: "False one.", examples: ["false example"] },
          true: { what: "True one.", examples: ["true example"] },
        },
      );
      const second = probability(
        { question: "Question two?", focus: "Focus two." },
        {
          false: { what: "False two.", examples: ["false example 2"] },
          true: { what: "True two.", examples: ["true example 2"] },
        },
      );

      const result = yield* decide({
        state: { artifact: { domain: "example.ts", source: "type A = string" } },
        decisions: { first, second },
      }).pipe(Effect.provide(FakeDecisionModel));

      expect(calls).toHaveLength(1);
      const call = calls[0];
      if (call === undefined) throw new Error("expected one provider call");
      const requestedFirst = call.decisions.first;
      if (requestedFirst?._tag !== "Probability") {
        throw new Error("expected a probability decision named first");
      }
      expect(Object.keys(call.decisions)).toEqual(["first", "second"]);
      expect(requestedFirst.instructions).toBe(
        "Question one?\n\nFocus: Focus one.",
      );
      expect(requestedFirst.criteria.true).toBe(
        "True one.\n\nExamples:\n- true example",
      );
      expect(result.answers.first.probability).toBe(0.25);
      expect(result.answers.second.probability).toBe(0.75);
      expect(result.usage.inputTokens).toBe(12);
    }),
  );
});
