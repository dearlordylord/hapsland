import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as DecisionModel from "effect/unstable/ai/DecisionModel";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { TypeSafeClient, TypeSafeDecisionModel } from "@effect/ai-typesafe";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ReviewRequest } from "./domain/contracts.ts";
import { DedupeStore } from "./ports/dedupe-store.ts";
import { ReviewBackend } from "./ports/review-backend.ts";
import { SnapshotReader } from "./ports/snapshot-reader.ts";
import { configuredRules } from "./policy/rules.ts";
import { review } from "./runtime/review.ts";
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

  it.effect("sends only the reviewed artifact through the complete review path", () =>
    Effect.gen(function* () {
      const root = yield* Effect.tryPromise(() => mkdtemp(join(tmpdir(), "review-http-path-")));
      try {
        yield* Effect.tryPromise(() => mkdir(join(root, "src"), { recursive: true }));
        const source = "export type SourceIntent = { value: string };\n";
        yield* Effect.tryPromise(() => writeFile(join(root, "src/example.ts"), source));
        const requests: Array<{ readonly url: string; readonly body: string }> = [];
        const capturedLogs: Array<string> = [];
        const fakeHttp = HttpClient.make((request) => {
          const body =
            request.body._tag === "Uint8Array"
              ? new TextDecoder().decode(request.body.body)
              : "";
          requests.push({ url: request.url, body });
          // Product logs intentionally capture only the destination and payload,
          // never authorization headers or upstream event metadata.
          capturedLogs.push(`${request.url} ${body}`);
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response(
                JSON.stringify({
                  model: "jev-latest",
                  answers: Object.fromEntries(
                    configuredRules.map((rule) => [rule.id, { type: "noul", noul: 0.1 }]),
                  ),
                  usage: { input_tokens: 11, output_tokens: 2 },
                }),
                { status: 200, headers: { "content-type": "application/json" } },
              ),
            ),
          );
        });
        const client = TypeSafeClient.layer({
          apiUrl: "https://fake.review.invalid/v1",
          apiKey: Redacted.make("CREDENTIAL-SENTINEL"),
        }).pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, fakeHttp)));
        const model = TypeSafeDecisionModel.layer({ model: "jev-latest" }).pipe(
          Layer.provide(client),
        );
        const input: ReviewRequest = {
          version: 1,
          event: {
            id: "TRANSCRIPT-SENTINEL",
            kind: "successful-edit",
            host: "TASK-SENTINEL ENVIRONMENT-DUMP-SENTINEL",
            cwd: root,
            paths: [
              "src/example.ts",
              "UNRELATED-FILE-SENTINEL.txt",
              "/absolute/path/ABSOLUTE-PATH-SENTINEL.txt",
            ],
          },
        };
        const output = yield* review(input).pipe(
          Effect.provide(
            Layer.mergeAll(
              SnapshotReader.layer,
              DedupeStore.testLayer,
              ReviewBackend.layer.pipe(Layer.provide(model)),
            ),
          ),
        );
        expect(output.results.filter((result) => result.status === "reviewed")).toHaveLength(1);
        expect(requests).toHaveLength(1);
        const request = requests[0];
        if (request === undefined) throw new Error("expected one fake HTTP request");
        expect(request.url).toBe("https://fake.review.invalid/v1/systemone");
        const payload = JSON.parse(request.body) as {
          state: { artifact: { domain: string; source: string } };
          questions: Record<string, { instructions: string; criteria: Record<string, string> }>;
        };
        expect(payload.state.artifact).toEqual({
          domain: "src/example.ts",
          source,
        });
        expect(Object.keys(payload.questions).length).toBeGreaterThan(0);
        const firstQuestion = Object.values(payload.questions)[0];
        expect(firstQuestion?.instructions).toContain("Focus:");
        expect(firstQuestion?.criteria.true).toBeTruthy();
        expect(firstQuestion?.criteria.false).toBeTruthy();
        for (const sentinel of [
          "TRANSCRIPT-SENTINEL",
          "TASK-SENTINEL",
          "UNRELATED-FILE-SENTINEL",
          "ABSOLUTE-PATH-SENTINEL",
          "ENVIRONMENT-DUMP-SENTINEL",
          "CREDENTIAL-SENTINEL",
        ]) {
          expect(request.body).not.toContain(sentinel);
          expect(capturedLogs.join("\n")).not.toContain(sentinel);
        }
        expect(request.body).toContain("src/example.ts");
        expect(request.body).toContain("SourceIntent");
        expect(request.body).toContain("Focus:");
        expect(request.body).toContain("criteria");
      } finally {
        yield* Effect.tryPromise(() => rm(root, { recursive: true, force: true }));
      }
    }),
  );
});
