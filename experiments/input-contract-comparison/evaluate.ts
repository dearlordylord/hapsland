import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { configuredRules, type Rule } from "../../src/policy/rules.ts";
import { ReviewBackend } from "../../src/ports/review-backend.ts";
import { validateAssessment } from "../../src/runtime/assessment.ts";
import { AssessmentError, BackendError } from "../../src/domain/errors.ts";
import {
  bandContains,
  type Fixture,
  type InputMode,
  type Observation,
  type RenderedInput,
  type SemanticStatus,
} from "./protocol.ts";
import { renderInput, type ExtractionCaps } from "./render.ts";

export type ObservationOptions = {
  readonly rules?: readonly Rule[];
  readonly caps?: ExtractionCaps;
  readonly now?: () => number;
};

const expectationFor = (fixture: Fixture) => fixture.expectations.find((expectation) => expectation.ruleId === "r2_meaningless_combinations");

const semanticFor = (fixture: Fixture, probability: number | undefined, status: "reviewed" | "incomplete" | "unavailable"): SemanticStatus => {
  if (status !== "reviewed" || probability === undefined) return status === "incomplete" ? "inconclusive" : "inconclusive";
  const expectation = expectationFor(fixture);
  if (!expectation || expectation.kind === "unchecked") return "unchecked";
  if (expectation.kind === "ambiguous") return "ambiguous";
  return expectation.band && bandContains(expectation.band, probability) ? "passed" : "failed";
};

const unavailableCategory = (error: unknown) => error instanceof BackendError ? "transport" : error instanceof AssessmentError ? "invalid-assessment" : "unknown";

export type RenderedObservation = {
  readonly rendered: RenderedInput;
  readonly extractionMs: number;
  readonly renderingMs: number;
};

export const prepareInput = (fixture: Fixture, mode: InputMode, caps?: ExtractionCaps): RenderedObservation => {
  const rendered = renderInput(fixture, mode, caps);
  return { rendered, extractionMs: rendered.extractionMs, renderingMs: rendered.renderingMs };
};

export const observe = Effect.fn("InputComparison.observe")(function* (
  fixture: Fixture,
  mode: InputMode,
  repetition: number,
  options: ObservationOptions = {},
) {
  const started = performance.now();
  const prepared = prepareInput(fixture, mode, options.caps);
  const base = {
    id: `${fixture.id}:${mode}:${repetition}`,
    fixtureId: fixture.id,
    mode,
    repetition,
    rendered: prepared.rendered,
    extractionMs: prepared.extractionMs,
    renderingMs: prepared.renderingMs,
    durationMs: Math.max(0, performance.now() - started),
    attempts: 0,
    retries: 0,
  };
  if (prepared.rendered.completeness.status === "incomplete-required") {
    return { ...base, status: "incomplete" as const, semantic: "inconclusive" as const, errorCategory: "required-evidence-missing" } satisfies Observation;
  }
  const backend = yield* ReviewBackend.Service;
  const result = yield* backend.evaluate({
    path: prepared.rendered.path,
    source: prepared.rendered.source,
    rules: options.rules ?? configuredRules,
  }).pipe(Effect.result);
  if (Result.isFailure(result)) {
    return {
      ...base,
      status: "unavailable" as const,
      semantic: "inconclusive" as const,
      errorCategory: unavailableCategory(result.failure),
    } satisfies Observation;
  }
  const backendResponse = result.success;
  const assessmentResult = yield* validateAssessment(options.rules ?? configuredRules, backendResponse.answers).pipe(Effect.result);
  if (Result.isFailure(assessmentResult)) {
    return {
      ...base,
      status: "unavailable" as const,
      semantic: "inconclusive" as const,
      attempts: backendResponse.backend.retries + 1,
      retries: backendResponse.backend.retries,
      backendMs: backendResponse.backend.durationMs,
      usage: backendResponse.backend.usage,
      errorCategory: "invalid-assessment",
    } satisfies Observation;
  }
  const probability = Object.entries(assessmentResult.success).find(([ruleId]) => ruleId === "r2_meaningless_combinations")?.[1];
  return {
    ...base,
    status: "reviewed" as const,
    semantic: semanticFor(fixture, probability, "reviewed"),
    ...(probability === undefined ? {} : { probability }),
    attempts: backendResponse.backend.retries + 1,
    retries: backendResponse.backend.retries,
    backendMs: backendResponse.backend.durationMs,
    usage: backendResponse.backend.usage,
  } satisfies Observation;
});
