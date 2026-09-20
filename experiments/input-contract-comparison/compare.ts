import {
  bandContains,
  emptyCounts,
  type ComparisonCounts,
  type ComparisonGate,
  type Fixture,
  type InputMode,
  type Observation,
  type ScenarioResult,
} from "./protocol.ts";

const checkedExpectation = (fixture: Fixture) => fixture.expectations.find((expectation) => expectation.ruleId === "r2_meaningless_combinations");

export const compareScenario = (
  fixture: Fixture,
  mode: InputMode,
  observations: readonly Observation[],
): ScenarioResult => {
  const expectation = checkedExpectation(fixture) ?? {
    ruleId: "r2_meaningless_combinations",
    kind: "unchecked" as const,
    rationale: "No human-authored expectation was supplied.",
  };
  const available = observations.filter((observation) => observation.status === "reviewed" && observation.probability !== undefined);
  const notApplicable = observations.length > 0 && observations.every((observation) => observation.status === "not-applicable");
  if (notApplicable) {
    return { fixtureId: fixture.id, mode, expectation, observations, available: 0, inBand: 0, status: "not-applicable" };
  }
  if (expectation.kind === "unchecked") {
    return { fixtureId: fixture.id, mode, expectation, observations, available: available.length, inBand: 0, status: "unchecked" };
  }
  if (expectation.kind === "ambiguous") {
    return { fixtureId: fixture.id, mode, expectation, observations, available: available.length, inBand: 0, status: "ambiguous" };
  }
  const inBand = available.filter((observation) => {
    const probability = observation.probability;
    return expectation.band !== undefined && probability !== undefined && bandContains(expectation.band, probability);
  }).length;
  if (available.length < 3) {
    return { fixtureId: fixture.id, mode, expectation, observations, available: available.length, inBand, status: "inconclusive" };
  }
  return {
    fixtureId: fixture.id,
    mode,
    expectation,
    observations,
    available: available.length,
    inBand,
    status: inBand >= 2 ? "passed" : "failed",
  };
};

export const summarize = (scenarios: readonly ScenarioResult[]): ComparisonCounts => {
  const counts = { ...emptyCounts() };
  for (const scenario of scenarios) {
    counts.total += 1;
    if (scenario.status === "passed") counts.passed += 1;
    else if (scenario.status === "failed") counts.failed += 1;
    else if (scenario.status === "inconclusive") counts.inconclusive += 1;
    else if (scenario.status === "not-applicable") counts.notApplicable += 1;
    else if (scenario.status === "ambiguous") counts.ambiguous += 1;
    else counts.unchecked += 1;
  }
  return counts;
};

export const countStatus = (scenarios: readonly ScenarioResult[], status: ScenarioResult["status"]) => scenarios.filter((scenario) => scenario.status === status).length;

const candidate = (byMode: ReadonlyMap<InputMode, readonly ScenarioResult[]>, fixtureIds: readonly string[], mode: InputMode) => {
  const scenarios = byMode.get(mode) ?? [];
  return fixtureIds.map((fixtureId) => scenarios.find((scenario) => scenario.fixtureId === fixtureId));
};

const passedFor = (byMode: ReadonlyMap<InputMode, readonly ScenarioResult[]>, fixtureIds: readonly string[], mode: InputMode) => candidate(byMode, fixtureIds, mode).filter((scenario) => scenario?.status === "passed").length;

export type GateInput = {
  readonly byMode: ReadonlyMap<InputMode, readonly ScenarioResult[]>;
  readonly contextRequired: readonly string[];
  readonly diffSufficient: readonly string[];
  readonly wholeFileDilution: readonly string[];
  readonly negativeControls: readonly string[];
  readonly checkedFixtureIds?: readonly string[];
};

export const evaluateGates = (input: GateInput): readonly ComparisonGate[] => {
  const context = passedFor(input.byMode, input.contextRequired, "declaration-context");
  const contextWhole = passedFor(input.byMode, input.contextRequired, "whole-file");
  const dilution = passedFor(input.byMode, input.wholeFileDilution, "declaration-context");
  const whole = passedFor(input.byMode, input.wholeFileDilution, "whole-file");
  const controls = passedFor(input.byMode, input.diffSufficient, "declaration-context");
  const controlBestBaseline = Math.max(
    passedFor(input.byMode, input.diffSufficient, "diff"),
    passedFor(input.byMode, input.diffSufficient, "whole-file"),
    passedFor(input.byMode, input.diffSufficient, "declaration-only"),
  );
  const applicableNegativeControls = input.negativeControls.filter((fixtureId) =>
    (["diff", "whole-file", "declaration-only", "declaration-context"] as const).every((mode) => {
      const scenario = candidate(input.byMode, [fixtureId], mode)[0];
      return scenario?.status !== "not-applicable";
    }),
  );
  const applicableClearCrossings = applicableNegativeControls.filter((fixtureId) => {
    const scenario = candidate(input.byMode, [fixtureId], "declaration-context")[0];
    return scenario?.status === "failed";
  }).length;
  const clearBestBaseline = Math.min(
    applicableNegativeControls.length - passedFor(input.byMode, applicableNegativeControls, "diff"),
    applicableNegativeControls.length - passedFor(input.byMode, applicableNegativeControls, "whole-file"),
    applicableNegativeControls.length - passedFor(input.byMode, applicableNegativeControls, "declaration-only"),
  );
  const checkedScenarios = [...input.byMode.values()].flat().filter((scenario) =>
    (scenario.expectation.kind === "clear" || scenario.expectation.kind === "violation") && scenario.status !== "not-applicable",
  );
  const available = checkedScenarios.every((scenario) => scenario.available === 3);
  return [
    { name: "context-required semantic", passed: context >= 10, numerator: context, denominator: input.contextRequired.length, required: 10 },
    { name: "context-required exceeds whole-file", passed: context - contextWhole >= 3, numerator: context - contextWhole, denominator: input.contextRequired.length, required: 3 },
    { name: "whole-file dilution semantic", passed: dilution >= 5 && dilution - whole >= 2, numerator: dilution, denominator: input.wholeFileDilution.length, required: 5 },
    { name: "diff-sufficient controls", passed: controls >= 5 && controlBestBaseline - controls <= 1, numerator: controls, denominator: input.diffSufficient.length, required: 5 },
    { name: "negative controls remain clear", passed: applicableClearCrossings <= 1 && applicableClearCrossings <= clearBestBaseline + 1, numerator: applicableNegativeControls.length - applicableClearCrossings, denominator: applicableNegativeControls.length, required: Math.max(0, applicableNegativeControls.length - 1), ...(applicableNegativeControls.length === 0 ? { reason: "no fully applicable negative controls" } : {}) },
    { name: "three available repetitions", passed: available, numerator: available ? 1 : 0, denominator: 1, required: 1, ...(available ? {} : { reason: "one or more checked comparisons has fewer than three available repetitions" }) },
  ];
};
