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
const availableFor = (byMode: ReadonlyMap<InputMode, readonly ScenarioResult[]>, fixtureIds: readonly string[], mode: InputMode) => candidate(byMode, fixtureIds, mode).filter((scenario) => scenario?.available === 3).length;

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
  const contextDiff = passedFor(input.byMode, input.contextRequired, "diff");
  const contextDeclaration = passedFor(input.byMode, input.contextRequired, "declaration-only");
  const dilution = passedFor(input.byMode, input.wholeFileDilution, "declaration-context");
  const whole = passedFor(input.byMode, input.wholeFileDilution, "whole-file");
  const controls = passedFor(input.byMode, input.diffSufficient, "declaration-context");
  const controlBestBaseline = Math.max(
    passedFor(input.byMode, input.diffSufficient, "diff"),
    passedFor(input.byMode, input.diffSufficient, "whole-file"),
    passedFor(input.byMode, input.diffSufficient, "declaration-only"),
  );
  const clearCrossings = input.negativeControls.filter((fixtureId) => {
    const scenario = candidate(input.byMode, input.negativeControls, "declaration-context").find((item) => item?.fixtureId === fixtureId);
    return scenario?.status === "failed";
  }).length;
  const clearBestBaseline = Math.min(
    input.negativeControls.length - passedFor(input.byMode, input.negativeControls, "diff"),
    input.negativeControls.length - passedFor(input.byMode, input.negativeControls, "whole-file"),
    input.negativeControls.length - passedFor(input.byMode, input.negativeControls, "declaration-only"),
  );
  const availabilityIds = input.checkedFixtureIds ?? [...input.contextRequired, ...input.diffSufficient, ...input.wholeFileDilution];
  const available = availabilityIds.every((fixtureId) =>
    (["diff", "whole-file", "declaration-only", "declaration-context"] as const).every((mode) => availableFor(input.byMode, [fixtureId], mode) === 1),
  );
  return [
    { name: "context-required semantic", passed: context >= 10, numerator: context, denominator: input.contextRequired.length, required: 10, ...(context - contextDiff >= 3 && context - contextDeclaration >= 3 ? {} : { reason: "candidate does not exceed both baselines by three cases" }) },
    { name: "context-required exceeds diff", passed: context - contextDiff >= 3, numerator: context - contextDiff, denominator: input.contextRequired.length, required: 3 },
    { name: "context-required exceeds declaration-only", passed: context - contextDeclaration >= 3, numerator: context - contextDeclaration, denominator: input.contextRequired.length, required: 3 },
    { name: "whole-file dilution semantic", passed: dilution >= 5 && dilution - whole >= 2, numerator: dilution, denominator: input.wholeFileDilution.length, required: 5 },
    { name: "diff-sufficient controls", passed: controls >= 5 && controlBestBaseline - controls <= 1, numerator: controls, denominator: input.diffSufficient.length, required: 5 },
    { name: "negative controls remain clear", passed: clearCrossings <= 1 && clearCrossings <= clearBestBaseline + 1, numerator: input.negativeControls.length - clearCrossings, denominator: input.negativeControls.length, required: Math.max(0, input.negativeControls.length - 1) },
    { name: "three available repetitions", passed: available, numerator: available ? 1 : 0, denominator: 1, required: 1, ...(available ? {} : { reason: "one or more checked comparisons has fewer than three available repetitions" }) },
  ];
};
