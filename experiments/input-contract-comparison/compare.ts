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
  const notApplicable = observations.length > 0 && observations.every((observation) => observation.status === "not-applicable");
  if (notApplicable) {
    return { fixtureId: fixture.id, mode, expectation, observations, available: 0, inBand: 0, status: "not-applicable" };
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

const pairedWins = (
  byMode: ReadonlyMap<InputMode, readonly ScenarioResult[]>,
  fixtureIds: readonly string[],
  preferred: InputMode,
  baseline: InputMode,
) => fixtureIds.filter((fixtureId) => {
  const preferredScenario = candidate(byMode, [fixtureId], preferred)[0];
  const baselineScenario = candidate(byMode, [fixtureId], baseline)[0];
  return preferredScenario?.status === "passed" && baselineScenario?.status === "failed";
}).length;

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
  const contextWins = pairedWins(input.byMode, input.contextRequired, "declaration-context", "whole-file");
  const wholeContextWins = pairedWins(input.byMode, input.contextRequired, "whole-file", "declaration-context");
  const dilution = passedFor(input.byMode, input.wholeFileDilution, "declaration-context");
  const dilutionWins = pairedWins(input.byMode, input.wholeFileDilution, "declaration-context", "whole-file");
  const wholeDilutionWins = pairedWins(input.byMode, input.wholeFileDilution, "whole-file", "declaration-context");
  const controls = passedFor(input.byMode, input.diffSufficient, "diff");
  const controlBestBaseline = Math.max(
    passedFor(input.byMode, input.diffSufficient, "whole-file"),
    passedFor(input.byMode, input.diffSufficient, "declaration-only"),
    passedFor(input.byMode, input.diffSufficient, "declaration-context"),
  );
  const applicableNegativeScenarios = (["diff", "whole-file", "declaration-only", "declaration-context"] as const)
    .flatMap((mode) => candidate(input.byMode, input.negativeControls, mode))
    .filter((scenario): scenario is ScenarioResult => scenario !== undefined && scenario.status !== "not-applicable");
  const clearPasses = applicableNegativeScenarios.filter((scenario) => scenario.status === "passed").length;
  const clearRequired = Math.max(0, applicableNegativeScenarios.length - 2);
  const eachModeHasAtMostOneClearFailure = (["diff", "whole-file", "declaration-only", "declaration-context"] as const).every((mode) =>
    applicableNegativeScenarios.filter((scenario) => scenario.mode === mode && scenario.status !== "passed").length <= 1,
  );
  const checkedScenarios = [...input.byMode.values()].flat().filter((scenario) =>
    (scenario.expectation.kind === "clear" || scenario.expectation.kind === "violation") && scenario.status !== "not-applicable",
  );
  const available = checkedScenarios.every((scenario) => scenario.available === 3);
  return [
    { name: "context-required semantic", passed: context >= 10, numerator: context, denominator: input.contextRequired.length, required: 10 },
    { name: "context-required paired advantage", passed: contextWins >= 3 && wholeContextWins <= 1, numerator: contextWins, denominator: input.contextRequired.length, required: 3, ...(wholeContextWins <= 1 ? {} : { reason: `${wholeContextWins} whole-file-only wins exceed the one-case tolerance` }) },
    { name: "whole-file dilution paired advantage", passed: dilution >= 5 && dilutionWins >= 2 && wholeDilutionWins === 0, numerator: dilutionWins, denominator: input.wholeFileDilution.length, required: 2, ...(wholeDilutionWins === 0 ? {} : { reason: `${wholeDilutionWins} whole-file-only wins are not allowed` }) },
    { name: "focused-diff sufficient controls", passed: controls >= 6 && controlBestBaseline - controls <= 1, numerator: controls, denominator: input.diffSufficient.length, required: 6 },
    { name: "negative controls remain clear across applicable modes", passed: applicableNegativeScenarios.length > 0 && clearPasses >= clearRequired && eachModeHasAtMostOneClearFailure, numerator: clearPasses, denominator: applicableNegativeScenarios.length, required: clearRequired, ...(applicableNegativeScenarios.length === 0 ? { reason: "no applicable negative-control scenarios" } : eachModeHasAtMostOneClearFailure ? {} : { reason: "one or more input modes has over one negative-control failure" }) },
    { name: "three available repetitions", passed: available, numerator: available ? 1 : 0, denominator: 1, required: 1, ...(available ? {} : { reason: "one or more checked comparisons has fewer than three available repetitions" }) },
  ];
};
