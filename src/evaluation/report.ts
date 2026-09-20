import * as Schema from "effect/Schema";
import {
  AggregateCounts,
  type AggregateCounts as AggregateCountsType,
  ComparisonSummary,
  type ComparisonSummary as ComparisonSummaryType,
  type ComparisonResult,
  EvaluationCoverage,
  EvaluationTimingEvidence,
  EvaluationReport,
  type EvaluationReport as EvaluationReportType,
  type EvaluationPlan,
  type EvaluationRun,
  type EvaluationScenario,
  type Expectation,
  strictParseOptions,
} from "./model.ts";
import { digestValue } from "./digest.ts";
import { enforceCallBudget } from "./plan.ts";

const decode = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: unknown,
): S["Type"] => Schema.decodeUnknownSync(schema, strictParseOptions)(value);

const emptyCounts = (): AggregateCountsType => ({
  total: 0,
  passed: 0,
  failed: 0,
  unchecked: 0,
  ambiguous: 0,
});

const increment = (
  counts: AggregateCountsType,
  status: "passed" | "failed" | "unchecked" | "ambiguous",
): AggregateCountsType => ({
  ...counts,
  total: counts.total + 1,
  [status]: counts[status] + 1,
});

const percentile = (sorted: ReadonlyArray<number>, quantile: number): number => {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index] ?? 0;
};

/** Keep provider timing useful for milestone evidence without retaining a
 * duration for any individual paid response. */
const aggregateTiming = (
  observations: ReadonlyArray<import("./model.ts").Observation>,
): EvaluationTimingEvidence => {
  const durations = observations
    .map((observation) => observation.transport.durationMs)
    .sort((left, right) => left - right);
  const sampleCount = durations.length;
  const totalDurationMs = durations.reduce((total, duration) => total + duration, 0);
  const meanDurationMs = sampleCount === 0 ? 0 : totalDurationMs / sampleCount;
  return decode(EvaluationTimingEvidence, {
    sampleCount,
    totalDurationMs,
    minimumDurationMs: durations[0] ?? 0,
    maximumDurationMs: durations.at(-1) ?? 0,
    meanDurationMs,
    p50DurationMs: percentile(durations, 0.5),
    p95DurationMs: percentile(durations, 0.95),
  });
};

const summarizeComparison = (
  result: ComparisonResult,
): ComparisonSummaryType =>
  decode(ComparisonSummary, {
    id: result.comparisonId,
    relation: result.relation,
    passed: result.passed,
    deterministic: result.deterministic,
    transport: result.transport,
    conformance: result.conformance,
    semantic: result.semantic,
    ...(result.reason === undefined ? {} : { reason: result.reason }),
    ...(result.delta === undefined ? {} : { delta: result.delta }),
  });

export interface ReportInput {
  readonly run: EvaluationRun;
  readonly plan: EvaluationPlan;
  readonly scenarios: ReadonlyArray<EvaluationScenario>;
  readonly observations: ReadonlyArray<import("./model.ts").Observation>;
  readonly comparisons: ReadonlyArray<ComparisonResult>;
  /** Authored comparison declarations are kept separate from sanitized results. */
  readonly comparisonInputs?: ReadonlyArray<import("./model.ts").Comparison>;
}

/**
 * Build the source-free aggregate report.  This function never copies fixture source,
 * provider responses, messages, or individual probabilities into the returned report.
 */
export const buildEvaluationReport = (
  input: ReportInput,
): EvaluationReportType => {
  let transport = emptyCounts();
  let conformance = emptyCounts();
  for (const observation of input.observations) {
    transport = increment(
      transport,
      observation.transport.status === "available" ? "passed" : "failed",
    );
    conformance = increment(conformance, observation.conformance.status);
  }

  let deterministic = emptyCounts();
  let semantic = emptyCounts();
  let crossBatch = emptyCounts();
  let unchecked = emptyCounts();
  const summaries = input.comparisons.map((comparison) => {
    if (comparison.relation === "exact") {
      deterministic = increment(deterministic, comparison.deterministic);
    } else if (comparison.relation === "semantic-band") {
      semantic = increment(semantic, comparison.semantic);
    } else {
      crossBatch = increment(crossBatch, comparison.semantic);
    }
    if (comparison.semantic === "unchecked") {
      unchecked = increment(unchecked, "unchecked");
    } else if (comparison.semantic === "ambiguous") {
      unchecked = increment(unchecked, "ambiguous");
    }
    return summarizeComparison(comparison);
  });

  const observedScenarioKeys = new Set(
    input.observations.map(
      (observation) => `${observation.scenarioId}:${observation.fixtureId}:${observation.repetition}`,
    ),
  );
  const observedScenarioIds = new Set(
    input.observations.map((observation) => observation.scenarioId),
  );
  const plannedFixtures = input.scenarios.reduce(
    (total, scenario) => total + scenario.fixtures.length * input.run.repetitions,
    0,
  );
  const comparisonInputs = input.comparisonInputs ?? [];
  const expectationEntries: Array<readonly [string, Expectation]> = comparisonInputs.flatMap((comparison) => {
      const expectation = comparison.expectation;
      return expectation === undefined
        ? []
        : [[`${expectation.fixtureId}:${expectation.ruleId}`, expectation] as const];
    });
  const expectationByKey = new Map<string, Expectation>(expectationEntries);
  const observedExpectations = comparisonInputs.filter(
    (comparison) => comparison.expectation !== undefined,
  ).length;
  const uncheckedExpectations = [...expectationByKey.values()].filter(
    (expectation) => expectation.result.kind === "unchecked",
  ).length;
  const ambiguousExpectations = [...expectationByKey.values()].filter(
    (expectation) => expectation.result.kind === "ambiguous",
  ).length;
  const coverage = decode(EvaluationCoverage, {
    plannedScenarios: input.scenarios.length,
    observedScenarios: observedScenarioIds.size,
    plannedFixtures,
    observedFixtures: observedScenarioKeys.size,
    isolatedScenarios: input.scenarios.filter(
      (scenario) => scenario.interaction === "isolated",
    ).length,
    fullBatchScenarios: input.scenarios.filter(
      (scenario) => scenario.interaction === "full",
    ).length,
    namedInteractionScenarios: input.scenarios.filter(
      (scenario) => scenario.interaction === "named",
    ).length,
    plannedComparisons: input.comparisons.length,
    observedComparisons: input.comparisons.length,
    plannedExpectations: input.run.expectationDigests.length,
    observedExpectations,
    uncheckedExpectations,
    ambiguousExpectations,
  });

  const observedRequests = input.observations.reduce(
    (total, observation) => total + observation.transport.attempts,
    0,
  );
  const budgetDecision = enforceCallBudget(input.plan, observedRequests);
  const budget = {
    declaredMaximumRequests: input.plan.budgetMaximumRequests,
    plannedRequests: input.plan.plannedRequests,
    worstCaseRequests: input.plan.worstCaseRequests,
    observedRequests,
    withinBudget: !budgetDecision.exceeded &&
      input.plan.worstCaseRequests <= input.plan.budgetMaximumRequests,
    planPermitted: input.plan.permitted,
    ...(input.plan.rejectionReason === undefined
      ? {}
      : { rejectionReason: input.plan.rejectionReason }),
  };
  const acceptance = input.run.acceptance;
  const releaseAccepted =
    input.plan.permitted &&
    budget.withinBudget &&
    (!acceptance.requireTransportAvailable || transport.failed === 0) &&
    (!acceptance.requireConformance ||
      (conformance.failed === 0 && conformance.unchecked === 0)) &&
    (!acceptance.requireSemanticPass ||
      (semantic.failed === 0 && semantic.unchecked === 0 && semantic.ambiguous === 0 &&
        crossBatch.failed === 0 && crossBatch.unchecked === 0 && crossBatch.ambiguous === 0)) &&
    (!acceptance.requireNoUnchecked ||
      (unchecked.unchecked === 0 && unchecked.ambiguous === 0));
  const reportWithoutDigest = {
    runId: input.run.id,
    suiteId: input.run.suiteId,
    runDigest: input.run.runDigest,
    planDigest: input.plan.planDigest,
    budget,
    acceptance,
    releaseAccepted,
    deterministic,
    transport,
    conformance,
    semantic,
    crossBatch,
    unchecked,
    timing: aggregateTiming(input.observations),
    coverage,
    comparisons: summaries,
    fixtureDigests: input.run.fixtureDigests,
    ruleDefinitionDigests: input.run.ruleDefinitionDigests,
    expectationDigests: input.run.expectationDigests,
    configurationCaseIds: input.run.configurationCaseIds,
    configurationCaseDigests: input.run.configurationCaseDigests,
    inputContract: input.run.inputContract,
    rendererAdapter: input.run.rendererAdapter,
  };
  return decode(EvaluationReport, {
    ...reportWithoutDigest,
    reportDigest: digestValue(reportWithoutDigest),
  });
};

export const isReportDigestValid = (report: EvaluationReportType): boolean =>
  report.reportDigest ===
  digestValue({
    runId: report.runId,
    suiteId: report.suiteId,
    runDigest: report.runDigest,
    planDigest: report.planDigest,
    budget: report.budget,
    acceptance: report.acceptance,
    releaseAccepted: report.releaseAccepted,
    deterministic: report.deterministic,
    transport: report.transport,
    conformance: report.conformance,
    semantic: report.semantic,
    crossBatch: report.crossBatch,
    unchecked: report.unchecked,
    timing: report.timing,
    coverage: report.coverage,
    comparisons: report.comparisons,
    fixtureDigests: report.fixtureDigests,
    ruleDefinitionDigests: report.ruleDefinitionDigests,
    expectationDigests: report.expectationDigests,
    configurationCaseIds: report.configurationCaseIds,
    configurationCaseDigests: report.configurationCaseDigests,
    inputContract: report.inputContract,
    rendererAdapter: report.rendererAdapter,
  });

export const reportIsConformant = (report: EvaluationReportType): boolean =>
  report.conformance.failed === 0 && report.conformance.unchecked === 0;

export const reportHasTransportAvailability = (
  report: EvaluationReportType,
): boolean => report.transport.failed === 0 && report.transport.unchecked === 0;

export const reportHasSemanticFailures = (report: EvaluationReportType): boolean =>
  report.semantic.failed > 0;

export const reportHasCrossBatchFailures = (
  report: EvaluationReportType,
): boolean => report.crossBatch.failed > 0;
