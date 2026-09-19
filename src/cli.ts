import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { readFileSync } from "node:fs";
import { Live as JevDecisionModelLive } from "./jev-decision.ts";
import {
  decodeCodexJson,
  toCodexOutput,
  toReviewRequest,
} from "./adapters/codex.ts";
import { decodeReviewRequest, type ReviewRequest } from "./domain/contracts.ts";
import { ReviewBackend } from "./ports/review-backend.ts";
import { DedupeStore } from "./ports/dedupe-store.ts";
import { SnapshotReader } from "./ports/snapshot-reader.ts";
import { review } from "./runtime/review.ts";
import {
  controlledDecisionModelLayer,
  type ControlledDecisionModelOptions,
} from "./test-support/controlled-decision-model.ts";

const readStdin = Effect.try({
  try: () => readFileSync(0, "utf8"),
  catch: () => new Error("could not read stdin"),
});

const decodeJson = (input: string) =>
  Effect.try({
    try: () => JSON.parse(input) as unknown,
    catch: () => new Error("stdin is not valid JSON"),
  });

const ControlledOptions = Schema.Struct({
  answers: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.Union([
        Schema.Struct({
          _tag: Schema.Literal("Probability"),
          probability: Schema.Number,
        }),
        Schema.Struct({
          _tag: Schema.Literal("Classify"),
          label: Schema.String,
          probabilities: Schema.Record(Schema.String, Schema.Number),
          confidence: Schema.optionalKey(Schema.Number),
        }),
        Schema.Struct({
          _tag: Schema.Literal("Rate"),
          rating: Schema.Number,
          probabilities: Schema.Record(Schema.String, Schema.Number),
          confidence: Schema.optionalKey(Schema.Number),
        }),
      ]),
    ),
  ),
  delayMs: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
  failure: Schema.optionalKey(Schema.String),
});

const controlledOptions = Config.String("REVIEW_CONTROL_JSON").pipe(
  Config.withDefault("{}"),
  Effect.flatMap((encoded) =>
    decodeJson(encoded).pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(ControlledOptions, {
          onExcessProperty: "error",
        }),
      ),
    ),
  ),
);

const runtimeLayer = (controlled: ControlledDecisionModelOptions | undefined) => {
  const decisionModel =
    controlled === undefined
      ? JevDecisionModelLive
      : controlledDecisionModelLayer(controlled);
  return Layer.mergeAll(
    SnapshotReader.layer,
    DedupeStore.layer,
    ReviewBackend.layer.pipe(Layer.provide(decisionModel)),
  );
};

const runRequest = (
  request: ReviewRequest,
  controlled: ControlledDecisionModelOptions | undefined,
) => review(request).pipe(Effect.provide(runtimeLayer(controlled)));

const isCodexHook = process.argv.includes("--codex-hook");
const isControlled = process.argv.includes("--controlled");

const program = Effect.gen(function* () {
  const input = yield* readStdin;
  const controlled = isControlled ? yield* controlledOptions : undefined;

  if (isCodexHook) {
    const event = yield* decodeCodexJson(input);
    const request = toReviewRequest(event);
    if (request === undefined) return {};
    const response = yield* runRequest(request, controlled).pipe(
      Effect.catchCause(() =>
        Effect.succeed({
          version: 1 as const,
          eventId: request.event.id,
          results: request.event.paths.map((path) => ({
            status: "unavailable" as const,
            path,
            reason: "review runtime unavailable; check backend credentials and configuration",
            retryable: false,
          })),
          advice: [],
        }),
      ),
    );
    return toCodexOutput(response);
  }

  const unknownRequest = yield* decodeJson(input);
  const request = yield* decodeReviewRequest(unknownRequest);
  return yield* runRequest(request, controlled).pipe(
    Effect.catchCause(() =>
      Effect.succeed({
        version: 1 as const,
        eventId: request.event.id,
        results: request.event.paths.map((path) => ({
          status: "unavailable" as const,
          path,
          reason: "review runtime unavailable; check backend credentials and configuration",
          retryable: false,
        })),
        advice: [],
      }),
    ),
  );
}).pipe(
  Effect.catchCause(() =>
    Effect.succeed(
      isCodexHook
        ? {
            systemMessage:
              "Review unavailable: invalid or unsupported Codex PostToolUse input.",
          }
        : {
            version: 1,
            error: {
              code: "invalid_request",
              message: "input does not satisfy the version-1 review contract",
            },
          },
    ),
  ),
);

const output = await Effect.runPromise(program);
process.stdout.write(`${JSON.stringify(output)}\n`);
