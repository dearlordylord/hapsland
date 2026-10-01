import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as DecisionModel from "effect/unstable/ai/DecisionModel";
import * as AiError from "effect/unstable/ai/AiError";
import { appendFile } from "node:fs/promises";

export type ControlledDecisionModelOptions = {
  readonly answers?: Readonly<Record<string, DecisionModel.ProviderAnswer>>;
  readonly delayMs?: number;
  readonly failure?: string;
  /** Test-only failure for one prepared unit selected by its declaration source. */
  readonly failureOnSourceIncludes?: string;
  readonly onRequest?: Effect.Effect<void>;
  readonly inspectRequest?: (
    request: DecisionModel.ProviderOptions,
  ) => Effect.Effect<void>;
  /** Injected after provider normalization to exercise consumer exact-key checks. */
  readonly extraDecisionKey?: string;
  /** Test-only subprocess transcript path; never enabled by the live layer. */
  readonly capturePath?: string;
  /** Test-only source-free request shape; never writes the provider input. */
  readonly requestSummaryPath?: string;
  /** Test-only source-free terminal outcome path; consumed by the resident. */
  readonly outcomePath?: string;
  /** Installed acceptance seam: exercise production credential resolution before the controlled transport. */
  readonly requireCredential?: boolean;
  /** Exact, source-sensitive #94 offline fixture. Unknown snapshots fail closed. */
  readonly syntheticR6BrandedRepair?: "control" | "finding";
};

const syntheticBefore = "type OrderCount = number";
const syntheticAfter = 'type OrderCount = number & { readonly __brand: "OrderCount" }';
const exactLine = (source: unknown, line: string): boolean =>
  typeof source === "string" &&
  (source === line || source === `${line}\n` || source === `${line}\r\n`);

const syntheticAnswers = (
  request: DecisionModel.ProviderOptions,
  scenario: "control" | "finding",
): Effect.Effect<Readonly<Record<string, DecisionModel.ProviderAnswer>>, AiError.AiError> => {
  const state = request.state;
  const artifact = typeof state === "object" && state !== null && !Array.isArray(state)
    ? (state as Record<string, unknown>).artifact : undefined;
  const artifactRecord = typeof artifact === "object" && artifact !== null && !Array.isArray(artifact)
    ? artifact as Record<string, unknown> : undefined;
  const source = artifactRecord?.source;
  const before = exactLine(source, syntheticBefore);
  const expected = artifactRecord?.domain === "order-count.ts" &&
    (before || (scenario === "finding" && exactLine(source, syntheticAfter)));
  if (!expected || !Object.hasOwn(request.decisions, "r6_bare_domain_value")) {
    return Effect.fail(AiError.make({
      module: "ControlledDecisionModel",
      method: "decide",
      reason: new AiError.InvalidOutputError({ description: "unknown synthetic review snapshot" }),
    }));
  }
  return Effect.succeed(Object.fromEntries(Object.keys(request.decisions).map((key) => [
    key, { _tag: "Probability", probability: scenario === "finding" &&
      before && key === "r6_bare_domain_value" ? 0.9 : 0 },
  ])));
};

export const controlledDecisionModelLayer = (
  options: ControlledDecisionModelOptions,
) =>
  Layer.effect(
    DecisionModel.DecisionModel,
    DecisionModel.make({
      decide: (request) => {
        const failure = options.failure ?? (options.failureOnSourceIncludes !== undefined &&
          JSON.stringify(request).includes(options.failureOnSourceIncludes)
          ? "controlled unit failure" : undefined);
        const answers = options.syntheticR6BrandedRepair === undefined
          ? Effect.succeed(options.answers ?? Object.fromEntries(
            Object.keys(request.decisions).map((key) => [
              key,
              { _tag: "Probability" as const, probability: 0 },
            ]),
          ))
          : syntheticAnswers(request, options.syntheticR6BrandedRepair);
        const result =
          failure === undefined
            ? answers.pipe(Effect.map((answers) => ({
                answers,
                usage: { inputTokens: 0, outputTokens: 0 },
              })))
            : Effect.fail(
                AiError.make({
                  module: "ControlledDecisionModel",
                  method: "decide",
                  reason: new AiError.UnknownError({ description: failure }),
                }),
              );
        const delayed =
          options.delayMs === undefined || options.delayMs === 0
            ? result
            : result.pipe(Effect.delay(`${options.delayMs} millis`));
        const capturePath = options.capturePath;
        const capture =
          capturePath === undefined
            ? Effect.succeed(undefined)
            : Effect.tryPromise({
                try: () => appendFile(capturePath, "called\n", "utf8"),
                catch: () => new Error("capture unavailable"),
              }).pipe(Effect.catch(() => Effect.succeed(undefined)));
        const requestSummary = options.requestSummaryPath === undefined
          ? Effect.void
          : Effect.tryPromise({
              try: () => {
                const state = request.state as { artifact?: { kind?: unknown }; evidence?: {
                  nodes?: unknown[]; edges?: { kind?: unknown }[] } } | undefined;
                const edges = state?.evidence?.edges ?? [];
                return appendFile(options.requestSummaryPath!, `${JSON.stringify({
                  rootKind: state?.artifact?.kind ?? "unknown",
                  evidenceNodes: state?.evidence?.nodes?.length ?? 0,
                  expandedEdges: edges.filter((edge) => edge.kind === "expanded").length,
                  includedEdges: edges.filter((edge) => edge.kind === "included").length,
                  omittedEdges: edges.filter((edge) => edge.kind === "omitted").length,
                })}\n`, "utf8");
              },
              catch: () => new Error("request summary unavailable"),
            }).pipe(Effect.catch(() => Effect.void));
        return (options.onRequest ?? Effect.succeed(undefined)).pipe(
          Effect.andThen(options.inspectRequest?.(request) ?? Effect.void),
          Effect.andThen(capture),
          Effect.andThen(requestSummary),
          Effect.andThen(delayed),
        );
      },
    }).pipe(
      Effect.map((model) =>
        options.extraDecisionKey === undefined
          ? model
          : DecisionModel.DecisionModel.of({
              ...model,
              decide: (definition, decideOptions) =>
                model.decide(definition, decideOptions).pipe(
                  Effect.map((response) => ({
                    ...response,
                    answers: {
                      ...response.answers,
                      [options.extraDecisionKey ?? "extra"]: { probability: 0 },
                    },
                  })),
                ),
            }),
      ),
    ),
  );
