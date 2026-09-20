import * as Effect from "effect/Effect";
import { inputComparisonFixtures, fixtureSummary } from "./fixtures.ts";
import { modes, type ExtractionCaps } from "./render.ts";
import { observe } from "./evaluate.ts";
import { compareScenario, evaluateGates, summarize } from "./compare.ts";
import { CallBudget, planRun, type PlanOptions } from "./plan.ts";
import { sharedExpectationRecord, sharedFixtureRecord } from "./shared-model.ts";
import type {
  EvaluationPlan,
  EvaluationReport,
  InputMode,
  Observation,
  ScenarioResult,
} from "./protocol.ts";

const p95 = (values: readonly number[]) => {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
};

const median = (values: readonly number[]) => {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)];
};

const scenariosFor = (observations: readonly Observation[]) => {
  const groups = new Map<string, Observation[]>();
  for (const observation of observations) {
    const key = `${observation.fixtureId}\0${observation.mode}`;
    const group = groups.get(key) ?? [];
    group.push(observation);
    groups.set(key, group);
  }
  const scenarios: ScenarioResult[] = [];
  for (const fixture of inputComparisonFixtures) {
    for (const mode of modes) {
      scenarios.push(compareScenario(fixture, mode, groups.get(`${fixture.id}\0${mode}`) ?? []));
    }
  }
  return scenarios;
};

const buildReport = (plan: EvaluationPlan, observations: readonly Observation[]): EvaluationReport => {
  const scenarios = scenariosFor(observations);
  const byMode = new Map<InputMode, readonly ScenarioResult[]>();
  for (const mode of modes) byMode.set(mode, scenarios.filter((scenario) => scenario.mode === mode));
  const checked = (fixture: (typeof inputComparisonFixtures)[number]) => fixture.expectations.some((expectation) => expectation.kind === "clear" || expectation.kind === "violation");
  const gates = [...evaluateGates({
    byMode,
    contextRequired: inputComparisonFixtures.filter((fixture) => fixture.contextRequired && checked(fixture)).map((fixture) => fixture.id),
    diffSufficient: inputComparisonFixtures.filter((fixture) => fixture.diffSufficient && checked(fixture)).map((fixture) => fixture.id),
    wholeFileDilution: inputComparisonFixtures.filter((fixture) => fixture.wholeFileDilution && checked(fixture)).map((fixture) => fixture.id),
    negativeControls: inputComparisonFixtures.filter((fixture) => fixture.negativeControl && fixture.expectations.some((expectation) => expectation.kind === "clear")).map((fixture) => fixture.id),
    checkedFixtureIds: inputComparisonFixtures.filter(checked).map((fixture) => fixture.id),
  })];
  const availableObservations = observations.filter((observation) => observation.status === "reviewed");
  const unavailable = observations.filter((observation) => observation.status === "unavailable").length;
  const semantic = summarize(scenarios);
  const allCheckedAvailable = scenarios.filter((scenario) => scenario.expectation.kind === "clear" || scenario.expectation.kind === "violation")
    .every((scenario) => scenario.available === 3);
  const warmExtraction = observations.filter((observation) => observation.repetition > 1).map((observation) => observation.extractionMs);
  const coldExtraction = observations.filter((observation) => observation.repetition === 1).map((observation) => observation.extractionMs);
  const endToEnd = observations.map((observation) => observation.durationMs);
  const wholeBytes = observations.filter((observation) => observation.mode === "whole-file").map((observation) => observation.rendered.requestBytes);
  const declarationContextBytes = observations.filter((observation) => observation.mode === "declaration-context").map((observation) => observation.rendered.requestBytes);
  const warmP95Ms = p95(warmExtraction);
  const coldP95Ms = p95(coldExtraction);
  const endToEndP95Ms = p95(endToEnd);
  const wholeFileMedian = median(wholeBytes);
  const declarationContextMedian = median(declarationContextBytes);
  gates.push({ name: "warm extraction p95 <= 250ms", passed: warmP95Ms !== undefined && warmP95Ms <= 250, numerator: warmP95Ms === undefined ? 0 : 1, denominator: 1, required: 1, ...(warmP95Ms === undefined ? { reason: "no warm observations" } : {}) });
  gates.push({ name: "end-to-end p95 <= 1000ms", passed: endToEndP95Ms !== undefined && endToEndP95Ms <= 1_000, numerator: endToEndP95Ms === undefined ? 0 : 1, denominator: 1, required: 1, ...(endToEndP95Ms === undefined ? { reason: "no observations" } : {}) });
  gates.push({ name: "declaration-context median request <= whole-file", passed: declarationContextMedian !== undefined && wholeFileMedian !== undefined && declarationContextMedian <= wholeFileMedian, numerator: declarationContextMedian !== undefined && wholeFileMedian !== undefined && declarationContextMedian <= wholeFileMedian ? 1 : 0, denominator: 1, required: 1, ...(declarationContextMedian === undefined || wholeFileMedian === undefined ? { reason: "no request-size observations" } : {}) });
  const anyInconclusive = !plan.permitted || unavailable > 0 || !allCheckedAvailable || semantic.inconclusive > 0;
  const allPassed = !anyInconclusive && gates.every((gate) => gate.passed);
  return {
    outcome: allPassed ? "advance-to-production-architecture" : anyInconclusive ? "inconclusive" : "reject-or-narrow",
    plan,
    ruleDefinitionDigest: plan.ruleDefinitionDigest,
    inputContracts: plan.inputContracts,
    extractionProfile: plan.extractionProfile,
    counts: {
      observations: semantic,
      semantic,
      transport: { available: availableObservations.length, unavailable },
    },
    gates,
    coverage: {
      fixtures: fixtureSummary.total,
      contextRequired: fixtureSummary.contextRequired,
      diffSufficient: fixtureSummary.diffSufficient,
      wholeFileDilution: fixtureSummary.wholeFileDilution,
      negativeControls: fixtureSummary.negativeControls,
    },
    timing: {
      extraction: {
        ...(coldP95Ms === undefined ? {} : { coldP95Ms }),
        ...(warmP95Ms === undefined ? {} : { warmP95Ms }),
      },
      ...(endToEndP95Ms === undefined ? {} : { endToEndP95Ms }),
    },
    requestBytes: {
      ...(wholeFileMedian === undefined ? {} : { wholeFileMedian }),
      ...(declarationContextMedian === undefined ? {} : { declarationContextMedian }),
    },
  };
};

export type RunOptions = PlanOptions & {
  readonly caps?: ExtractionCaps;
};

export const runPlanned = Effect.fn("InputComparison.runPlanned")(function* (options: RunOptions) {
  // Validate the authored identity/expectation subset through the shared #15 model
  // before any renderer or backend work is allowed.
  for (const fixture of inputComparisonFixtures) {
    sharedFixtureRecord(fixture);
    sharedExpectationRecord(fixture);
  }
  const extractionProfile = options.caps ?? options.extractionProfile;
  const plan = planRun(extractionProfile === undefined ? options : { ...options, extractionProfile });
  if (!plan.permitted) return { plan, observations: [] as readonly Observation[], report: buildReport(plan, []) };
  const ledger = new CallBudget(plan.maximumTransportAttempts);
  const observations: Observation[] = [];
  for (const fixture of inputComparisonFixtures) {
    for (const mode of modes) {
      for (let repetition = 1; repetition <= plan.repetitions; repetition += 1) {
        ledger.reserve(plan.maximumRetriesPerCall + 1);
        const observation = yield* observe(fixture, mode, repetition, options.caps === undefined ? {} : { caps: options.caps });
        observations.push(observation);
        if (observation.status !== "incomplete") ledger.observe(Math.max(1, observation.attempts));
      }
    }
  }
  return { plan, observations, report: buildReport(plan, observations) };
});

export { buildReport, scenariosFor };
