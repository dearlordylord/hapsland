import * as Schema from "effect/Schema";
import {
  ComparisonResult,
  type ComparisonResult as ComparisonResultType,
  type Comparison,
  type Expectation,
  type Observation,
  strictParseOptions,
} from "./model.ts";
import { makeUncheckedExpectation, stableStringify } from "./digest.ts";

const decodeResult = (value: unknown): ComparisonResultType =>
  Schema.decodeUnknownSync(ComparisonResult, strictParseOptions)(value);

const sortedAssessment = (observation: Observation) =>
  (observation.assessment ?? [])
    .map((entry) => ({ ruleId: entry.ruleId, probability: entry.probability }))
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId));

const deterministicProjection = (observation: Observation) => ({
  request: observation.request,
  assessment: sortedAssessment(observation),
  findings: observation.findings,
  reviewStatus: observation.reviewStatus,
});

const conformanceFor = (
  observations: ReadonlyArray<Observation>,
): ComparisonResultType["conformance"] => {
  if (observations.some((observation) => observation.conformance.status === "failed")) {
    return "failed";
  }
  if (observations.every((observation) => observation.conformance.status === "passed")) {
    return "passed";
  }
  return "unchecked";
};

const transportFor = (
  observations: ReadonlyArray<Observation>,
): ComparisonResultType["transport"] => {
  if (observations.length === 0) return "unchecked";
  return observations.every((observation) => observation.transport.status === "available")
    ? "available"
    : "unavailable";
};

const probabilityFor = (
  observation: Observation,
  ruleId: string,
): number | undefined =>
  observation.assessment?.find((entry) => entry.ruleId === ruleId)?.probability;

/**
 * Missing labels are explicit unchecked records, never an implicit clear label.
 * Callers can persist the returned expectation in a local authored fixture set if
 * a missing label is later reviewed by a maintainer.
 */
export const resolveExpectation = (
  expectations: ReadonlyArray<Expectation>,
  fixtureId: string,
  ruleId: string,
): Expectation =>
  expectations.find(
    (expectation) =>
      expectation.fixtureId === fixtureId && expectation.ruleId === ruleId,
  ) ??
  makeUncheckedExpectation({
    fixtureId,
    ruleId,
    reason: "no human-authored expectation",
  });

const inBand = (
  value: number,
  band: NonNullable<Extract<Expectation["result"], { readonly kind: "clear" | "violation" }>>["band"],
): boolean =>
  (band.minimumInclusive ? value >= band.minimum : value > band.minimum) &&
  (band.maximumInclusive ? value <= band.maximum : value < band.maximum);

const semanticForObservation = (
  comparison: Comparison,
  observation: Observation,
): {
  readonly semantic: ComparisonResultType["semantic"];
  readonly reason?: string;
} => {
  const expectation = comparison.expectation;
  const ruleId = comparison.ruleId ?? expectation?.ruleId;
  if (expectation === undefined || ruleId === undefined) {
    return { semantic: "unchecked", reason: "missing-expectation" };
  }
  if (expectation.fixtureId !== observation.fixtureId) {
    return { semantic: "unchecked", reason: "fixture-context-mismatch" };
  }
  if (expectation.result.kind === "ambiguous") {
    return { semantic: "ambiguous", reason: expectation.result.reason };
  }
  if (expectation.result.kind === "unchecked") {
    return { semantic: "unchecked", reason: expectation.result.reason };
  }
  const probability = probabilityFor(observation, ruleId);
  if (probability === undefined) {
    return { semantic: "unchecked", reason: "missing-assessment" };
  }
  return inBand(probability, expectation.result.band)
    ? { semantic: "passed" }
    : { semantic: "failed", reason: "outside-expected-band" };
};

const buildResult = (input: {
  readonly comparison: Comparison;
  readonly deterministic: ComparisonResultType["deterministic"];
  readonly transport: ComparisonResultType["transport"];
  readonly conformance: ComparisonResultType["conformance"];
  readonly semantic: ComparisonResultType["semantic"];
  readonly reason?: string | undefined;
  readonly delta?: number | undefined;
}): ComparisonResultType => {
  const passed =
    input.transport === "available" &&
    input.conformance === "passed" &&
    (input.comparison.relation === "exact"
      ? input.deterministic === "passed"
      : input.semantic === "passed");
  return decodeResult({
    comparisonId: input.comparison.id,
    relation: input.comparison.relation,
    deterministic: input.deterministic,
    transport: input.transport,
    conformance: input.conformance,
    semantic: input.semantic,
    passed,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    ...(input.delta === undefined ? {} : { delta: input.delta }),
  });
};

/** Compare one observation to a semantic expectation or a missing expectation. */
export const compareObservation = (
  comparison: Comparison,
  observation: Observation,
): ComparisonResultType => {
  const transport = transportFor([observation]);
  const conformance = conformanceFor([observation]);
  if (comparison.relation === "exact") {
    return buildResult({
      comparison,
      deterministic: "unchecked",
      transport,
      conformance,
      semantic: "unchecked",
      reason: "exact-comparison-requires-two-observations",
    });
  }
  if (transport !== "available") {
    return buildResult({
      comparison,
      deterministic: "unchecked",
      transport,
      conformance,
      semantic: "unchecked",
      reason: "transport-unavailable",
    });
  }
  const semantic = semanticForObservation(comparison, observation);
  return buildResult({
    comparison,
    deterministic: "unchecked",
    transport,
    conformance,
    semantic: semantic.semantic,
    reason: semantic.reason,
  });
};

/** Compare an isolated/full or named interaction pair deterministically or semantically. */
export const compareObservationPair = (
  comparison: Comparison,
  left: Observation,
  right: Observation,
): ComparisonResultType => {
  const transport = transportFor([left, right]);
  const conformance = conformanceFor([left, right]);
  if (transport !== "available") {
    return buildResult({
      comparison,
      deterministic: "unchecked",
      transport,
      conformance,
      semantic: "unchecked",
      reason: "transport-unavailable",
    });
  }

  if (comparison.relation === "exact") {
    const equal =
      stableStringify(deterministicProjection(left)) ===
      stableStringify(deterministicProjection(right));
    return buildResult({
      comparison,
      deterministic: equal ? "passed" : "failed",
      transport,
      conformance,
      semantic: "unchecked",
      reason: equal ? undefined : "deterministic-observation-difference",
    });
  }

  if (comparison.relation === "semantic-band") {
    const semantic = semanticForObservation(comparison, right);
    return buildResult({
      comparison,
      deterministic: "unchecked",
      transport,
      conformance,
      semantic: semantic.semantic,
      reason: semantic.reason,
    });
  }

  const ruleId = comparison.ruleId;
  if (ruleId === undefined) {
    return buildResult({
      comparison,
      deterministic: "unchecked",
      transport,
      conformance,
      semantic: "unchecked",
      reason: "missing-comparison-rule",
    });
  }
  const leftProbability = probabilityFor(left, ruleId);
  const rightProbability = probabilityFor(right, ruleId);
  if (leftProbability === undefined || rightProbability === undefined) {
    return buildResult({
      comparison,
      deterministic: "unchecked",
      transport,
      conformance,
      semantic: "unchecked",
      reason: "missing-assessment",
    });
  }
  const sameLocation =
    left.request.domain === right.request.domain &&
    left.request.path === right.request.path;
  const sameContext =
    sameLocation &&
    ((left.fixtureId === right.fixtureId &&
      left.request.contentHash === right.request.contentHash) ||
      comparison.fixtureRelation === "transformed");
  if (!sameContext) {
    return buildResult({
      comparison,
      deterministic: "unchecked",
      transport,
      conformance,
      semantic: "unchecked",
      reason: "fixture-context-mismatch",
    });
  }
  const delta = rightProbability - leftProbability;
  const direction = comparison.direction ?? "change";
  const minimumDelta = comparison.minimumDelta ?? comparison.tolerance;
  const semanticPassed =
    direction === "increase"
      ? delta + comparison.tolerance >= minimumDelta
      : direction === "decrease"
        ? -delta + comparison.tolerance >= minimumDelta
        : direction === "no-change"
          ? Math.abs(delta) <= comparison.tolerance
          : Math.abs(delta) + comparison.tolerance >= minimumDelta;
  return buildResult({
    comparison,
    deterministic: "unchecked",
    transport,
    conformance,
    semantic: semanticPassed ? "passed" : "failed",
    reason: semanticPassed ? undefined : "change-outside-expected-relation",
    delta,
  });
};

/** Resolve a comparison against the provided observations without any backend call. */
export const compareObservations = (
  comparison: Comparison,
  observations: ReadonlyArray<Observation>,
): ComparisonResultType => {
  const byId = new Map(observations.map((observation) => [observation.id, observation]));
  if (comparison.relation === "exact" || comparison.relation === "measured-change") {
    const left = comparison.leftObservationId
      ? byId.get(comparison.leftObservationId)
      : undefined;
    const right = comparison.rightObservationId
      ? byId.get(comparison.rightObservationId)
      : undefined;
    if (left === undefined || right === undefined) {
      return buildResult({
        comparison,
        deterministic: "unchecked",
        transport: "unchecked",
        conformance: "unchecked",
        semantic: "unchecked",
        reason: "missing-observation",
      });
    }
    return compareObservationPair(comparison, left, right);
  }
  const target = comparison.observationId
    ? byId.get(comparison.observationId)
    : comparison.rightObservationId
      ? byId.get(comparison.rightObservationId)
      : undefined;
  if (target === undefined) {
    return buildResult({
      comparison,
      deterministic: "unchecked",
      transport: "unchecked",
      conformance: "unchecked",
      semantic: "unchecked",
      reason: "missing-observation",
    });
  }
  return compareObservation(comparison, target);
};

export const isComparisonPassed = (result: ComparisonResultType): boolean =>
  result.passed;
