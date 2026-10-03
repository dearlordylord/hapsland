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

const conformanceFor = (observations: ReadonlyArray<Observation>): ComparisonResultType["conformance"] => {
  if (observations.some((observation) => observation.conformance.status === "failed")) {
    return "failed";
  }
  if (observations.every((observation) => observation.conformance.status === "passed")) {
    return "passed";
  }
  return "unchecked";
};

const transportFor = (observations: ReadonlyArray<Observation>): ComparisonResultType["transport"] => {
  if (observations.length === 0) return "unchecked";
  return observations.every((observation) => observation.transport.status === "available")
    ? "available"
    : "unavailable";
};

const probabilityFor = (observation: Observation, ruleId: string): number | undefined =>
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
  expectations.find((expectation) => expectation.fixtureId === fixtureId && expectation.ruleId === ruleId) ??
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

const expectationRuleId = (comparison: Comparison): string | undefined =>
  comparison.ruleId ?? comparison.expectation?.ruleId;
const semanticForObservation = (
  comparison: Comparison,
  observation: Observation,
): {
  readonly semantic: ComparisonResultType["semantic"];
  readonly reason?: string;
} => {
  const expectation = comparison.expectation;
  const ruleId = expectationRuleId(comparison);
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
    (input.comparison.relation === "exact" ? input.deterministic === "passed" : input.semantic === "passed");
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
export const compareObservation = (comparison: Comparison, observation: Observation): ComparisonResultType => {
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

type PairFrame = {
  readonly comparison: Comparison;
  readonly left: Observation;
  readonly right: Observation;
  readonly transport: ComparisonResultType["transport"];
  readonly conformance: ComparisonResultType["conformance"];
};
const uncheckedPair = (frame: PairFrame, reason: string): ComparisonResultType =>
  buildResult({ ...frame, deterministic: "unchecked", semantic: "unchecked", reason });
const exactPair = (frame: PairFrame): ComparisonResultType => {
  const equal =
    stableStringify(deterministicProjection(frame.left)) === stableStringify(deterministicProjection(frame.right));
  return buildResult({
    ...frame,
    deterministic: equal ? "passed" : "failed",
    semantic: "unchecked",
    reason: equal ? undefined : "deterministic-observation-difference",
  });
};
const semanticPair = (frame: PairFrame): ComparisonResultType => {
  const semantic = semanticForObservation(frame.comparison, frame.right);
  return buildResult({ ...frame, deterministic: "unchecked", semantic: semantic.semantic, reason: semantic.reason });
};
const sameComparisonContext = ({ comparison, left, right }: PairFrame): boolean => {
  const sameLocation = left.request.domain === right.request.domain && left.request.path === right.request.path;
  return (
    sameLocation &&
    ((left.fixtureId === right.fixtureId && left.request.contentHash === right.request.contentHash) ||
      comparison.fixtureRelation === "transformed")
  );
};
const expectedChange = (comparison: Comparison, delta: number): boolean => {
  const direction = comparison.direction ?? "change";
  const minimumDelta = comparison.minimumDelta ?? comparison.tolerance;
  switch (direction) {
    case "increase":
      return delta + comparison.tolerance >= minimumDelta;
    case "decrease":
      return -delta + comparison.tolerance >= minimumDelta;
    case "no-change":
      return Math.abs(delta) <= comparison.tolerance;
    default:
      return Math.abs(delta) + comparison.tolerance >= minimumDelta;
  }
};
const measuredPair = (frame: PairFrame): ComparisonResultType => {
  const { comparison, left, right } = frame;
  const ruleId = comparison.ruleId;
  if (ruleId === undefined) return uncheckedPair(frame, "missing-comparison-rule");
  const leftProbability = probabilityFor(left, ruleId);
  const rightProbability = probabilityFor(right, ruleId);
  if (leftProbability === undefined || rightProbability === undefined)
    return uncheckedPair(frame, "missing-assessment");
  if (!sameComparisonContext(frame)) return uncheckedPair(frame, "fixture-context-mismatch");
  const delta = rightProbability - leftProbability;
  const passed = expectedChange(comparison, delta);
  return buildResult({
    ...frame,
    deterministic: "unchecked",
    semantic: passed ? "passed" : "failed",
    reason: passed ? undefined : "change-outside-expected-relation",
    delta,
  });
};
/** Compare an isolated/full or named interaction pair deterministically or semantically. */
export const compareObservationPair = (
  comparison: Comparison,
  left: Observation,
  right: Observation,
): ComparisonResultType => {
  const frame: PairFrame = {
    comparison,
    left,
    right,
    transport: transportFor([left, right]),
    conformance: conformanceFor([left, right]),
  };
  if (frame.transport !== "available") return uncheckedPair(frame, "transport-unavailable");
  switch (comparison.relation) {
    case "exact":
      return exactPair(frame);
    case "semantic-band":
      return semanticPair(frame);
    default:
      return measuredPair(frame);
  }
};
const missingObservationResult = (comparison: Comparison): ComparisonResultType =>
  buildResult({
    comparison,
    deterministic: "unchecked",
    transport: "unchecked",
    conformance: "unchecked",
    semantic: "unchecked",
    reason: "missing-observation",
  });
const observationById = (byId: ReadonlyMap<string, Observation>, id: string | undefined): Observation | undefined =>
  id ? byId.get(id) : undefined;
const semanticTargetObservation = (
  comparison: Comparison,
  byId: ReadonlyMap<string, Observation>,
): Observation | undefined =>
  observationById(byId, comparison.observationId ? comparison.observationId : comparison.rightObservationId);
/** Resolve a comparison against the provided observations without any backend call. */
export const compareObservations = (
  comparison: Comparison,
  observations: ReadonlyArray<Observation>,
): ComparisonResultType => {
  const byId = new Map(observations.map((observation) => [observation.id, observation]));
  if (comparison.relation === "exact" || comparison.relation === "measured-change") {
    const left = observationById(byId, comparison.leftObservationId);
    const right = observationById(byId, comparison.rightObservationId);
    if (left === undefined || right === undefined) return missingObservationResult(comparison);
    return compareObservationPair(comparison, left, right);
  }
  const target = semanticTargetObservation(comparison, byId);
  if (target === undefined) return missingObservationResult(comparison);
  return compareObservation(comparison, target);
};

export const isComparisonPassed = (result: ComparisonResultType): boolean => result.passed;
