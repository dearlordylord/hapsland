import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as DecisionModel from "effect/unstable/ai/DecisionModel";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { TypeSafeClient, TypeSafeDecisionModel } from "@effect/ai-typesafe";
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

  it.effect("asserts the actual TypeSafe HTTP contract at a fake transport", () =>
    Effect.gen(function* () {
      const requests: Array<{
        readonly url: string;
        readonly authorization: string | undefined;
        readonly body: string;
      }> = [];
      const fakeHttp = HttpClient.make((request) => {
        const body =
          request.body._tag === "Uint8Array"
            ? new TextDecoder().decode(request.body.body)
            : "";
        requests.push({
          url: request.url,
          authorization: request.headers.authorization,
          body,
        });
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            new Response(
              JSON.stringify({
                model: "jev-latest",
                answers: { rule: { type: "noul", noul: 0.75 } },
                usage: { input_tokens: 11, output_tokens: 2 },
              }),
              { status: 200, headers: { "content-type": "application/json" } },
            ),
          ),
        );
      });
      const client = TypeSafeClient.layer({
        apiUrl: "https://fake.review.invalid/v1",
        apiKey: Redacted.make("SECRET-SENTINEL"),
      }).pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, fakeHttp)));
      const model = TypeSafeDecisionModel.layer({ model: "jev-latest" }).pipe(
        Layer.provide(client),
      );
      const result = yield* decide({
        state: {
          artifact: {
            domain: "src/example.ts",
            source: "SOURCE-SENTINEL",
          },
        },
        decisions: {
          rule: probability(
            { question: "QUESTION-SENTINEL", focus: "FOCUS-SENTINEL" },
            {
              false: { what: "FALSE-CRITERION", examples: ["false example"] },
              true: { what: "TRUE-CRITERION", examples: ["true example"] },
            },
          ),
        },
      }).pipe(Effect.provide(model));

      expect(result.answers.rule).toEqual({ probability: 0.75 });
      expect(requests).toHaveLength(1);
      const request = requests[0];
      if (request === undefined) throw new Error("expected one fake HTTP request");
      expect(request.url).toBe("https://fake.review.invalid/v1/systemone");
      expect(request.authorization).toBe("Bearer SECRET-SENTINEL");
      const payload = JSON.parse(request.body) as Record<string, unknown>;
      expect(Object.keys(payload).sort()).toEqual(["model", "questions", "state"]);
      expect(payload.model).toBe("jev-latest");
      expect(payload.state).toEqual({
        artifact: { domain: "src/example.ts", source: "SOURCE-SENTINEL" },
      });
      expect(payload.questions).toEqual({
        rule: {
          type: "noul",
          instructions: "QUESTION-SENTINEL\n\nFocus: FOCUS-SENTINEL",
          criteria: {
            false: "FALSE-CRITERION\n\nExamples:\n- false example",
            true: "TRUE-CRITERION\n\nExamples:\n- true example",
          },
        },
      });
      expect(request.body).not.toContain("TRANSCRIPT-SENTINEL");
      expect(request.body).not.toContain("TASK-SENTINEL");
      expect(request.body).not.toContain("/absolute/local/path");
      expect(request.body).not.toContain("SECRET-SENTINEL");
    }),
  );

});
