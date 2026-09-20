import * as Schema from "effect/Schema";
import {
  BackendIdentity,
  type BackendIdentity as BackendIdentityType,
  CallBudget,
  ConfigurationCaseId,
  EvaluationPlan,
  type EvaluationPlan as EvaluationPlanType,
  EvaluationRun,
  type EvaluationRun as EvaluationRunType,
  EvaluationScenario,
  type EvaluationScenario as EvaluationScenarioType,
  InputContractIdentity,
  type InputContractIdentity as InputContractIdentityType,
  RendererAdapterIdentity,
  type RendererAdapterIdentity as RendererAdapterIdentityType,
  ScenarioId,
  strictParseOptions,
} from "./model.ts";
import {
  digestRun,
  digestScenario,
  digestPlan,
  digestValue,
  makeFixtureReference,
  makeRuleReference,
} from "./digest.ts";
import type { ConfigurationCase, Fixture, RuleDefinition } from "./model.ts";

const decode = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: unknown,
): S["Type"] =>
  Schema.decodeUnknownSync(schema, strictParseOptions)(value);

const scenarioRequestCount = (scenario: EvaluationScenarioType): number =>
  scenario.requestCount ?? scenario.fixtures.length;

/**
 * Estimate logical requests and worst-case attempts before any backend call.  A
 * scenario is one logical request per referenced fixture unless it explicitly
 * declares a bounded request count for a lifecycle sequence.
 */
export const estimatePlanRequests = (
  run: EvaluationRunType,
  scenarios: ReadonlyArray<EvaluationScenarioType>,
): { readonly plannedRequests: number; readonly worstCaseRequests: number } => {
  const selected = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const plannedPerRepetition = run.scenarioIds.reduce((total, scenarioId) => {
    const scenario = selected.get(scenarioId);
    return scenario === undefined ? total : total + scenarioRequestCount(scenario);
  }, 0);
  const plannedRequests = plannedPerRepetition * run.repetitions;
  return {
    plannedRequests,
    worstCaseRequests: plannedRequests * (run.budget.maximumRetriesPerRequest + 1),
  };
};

/**
 * Produce a deterministic, source-free execution plan.  Over-budget plans are
 * returned as rejected plans so callers can report the reason without dispatching.
 */
export const planEvaluation = (
  run: EvaluationRunType,
  scenarios: ReadonlyArray<EvaluationScenarioType>,
): EvaluationPlanType => {
  const estimates = estimatePlanRequests(run, scenarios);
  const hasLiveScenario = scenarios.some(
    (scenario) =>
      run.scenarioIds.includes(scenario.id) && scenario.backend.mode === "live",
  );
  const budgetExceeded =
    estimates.worstCaseRequests >
    Math.min(
      run.budget.maximumRequests,
      run.budget.authorizedRemainingCalls ?? run.budget.maximumRequests,
    );
  const rejectionReason = budgetExceeded
    ? "budget-exceeded"
    : hasLiveScenario && !run.liveOptIn
      ? "live-opt-in-required"
      : undefined;
  const planWithoutDigest = {
    runId: run.id,
    scenarioIds: run.scenarioIds,
    repetitions: run.repetitions,
    maximumAttemptsPerRequest: run.budget.maximumRetriesPerRequest + 1,
    plannedRequests: estimates.plannedRequests,
    worstCaseRequests: estimates.worstCaseRequests,
    budgetMaximumRequests: Math.min(
      run.budget.maximumRequests,
      run.budget.authorizedRemainingCalls ?? run.budget.maximumRequests,
    ),
    permitted: rejectionReason === undefined,
    ...(rejectionReason === undefined ? {} : { rejectionReason }),
  };
  return decode(EvaluationPlan, {
    ...planWithoutDigest,
    planDigest: digestValue(planWithoutDigest),
  });
};

export interface BudgetDecision {
  readonly permitted: boolean;
  readonly observedRequests: number;
  readonly remainingRequests: number;
  readonly exceeded: boolean;
}

/** Enforce the declared maximum against actual attempts without changing ordering. */
export const enforceCallBudget = (
  plan: EvaluationPlanType,
  observedRequests: number,
): BudgetDecision => {
  const boundedObserved = Number.isFinite(observedRequests)
    ? Math.max(0, Math.trunc(observedRequests))
    : Number.POSITIVE_INFINITY;
  const remainingRequests = Math.max(
    0,
    plan.budgetMaximumRequests - boundedObserved,
  );
  const exceeded = boundedObserved > plan.budgetMaximumRequests;
  return {
    permitted: plan.permitted && !exceeded,
    observedRequests: boundedObserved,
    remainingRequests,
    exceeded,
  };
};

export const makeBackendIdentity = (input: {
  readonly id: string;
  readonly version: string;
  readonly mode: BackendIdentityType["mode"];
}): BackendIdentityType => decode(BackendIdentity, input);

export const makeInputContractIdentity = (input: {
  readonly id: string;
  readonly version: string;
  readonly digest: string;
}): InputContractIdentityType => decode(InputContractIdentity, input);

export const makeRendererAdapterIdentity = (input: {
  readonly id: string;
  readonly version: string;
  readonly digest: string;
}): RendererAdapterIdentityType => decode(RendererAdapterIdentity, input);

export interface ScenarioInput {
  readonly id: string;
  readonly name: string;
  readonly interaction: EvaluationScenarioType["interaction"];
  readonly interactionName?: string;
  readonly fixtures: ReadonlyArray<Fixture>;
  readonly ruleDefinitions: ReadonlyArray<RuleDefinition>;
  readonly configurationCaseId: string;
  readonly effectiveConfigurationDigest: string;
  readonly backend: BackendIdentityType;
  readonly inputContract: InputContractIdentityType;
  readonly rendererAdapter: RendererAdapterIdentityType;
  readonly eventSequence?: EvaluationScenarioType["eventSequence"];
  readonly requestCount?: number;
}

export const makeEvaluationScenario = (
  input: ScenarioInput,
): EvaluationScenarioType => {
  const withoutDigest = {
    id: input.id,
    name: input.name,
    interaction: input.interaction,
    ...(input.interactionName === undefined
      ? {}
      : { interactionName: input.interactionName }),
    fixtures: input.fixtures.map(makeFixtureReference),
    ruleSet: input.ruleDefinitions.map(makeRuleReference),
    configurationCaseId: input.configurationCaseId,
    effectiveConfigurationDigest: input.effectiveConfigurationDigest,
    backend: input.backend,
    inputContract: input.inputContract,
    rendererAdapter: input.rendererAdapter,
    eventSequence: input.eventSequence ?? [],
    ...(input.requestCount === undefined ? {} : { requestCount: input.requestCount }),
  };
  return decode(EvaluationScenario, {
    ...withoutDigest,
    scenarioDigest: digestValue(withoutDigest),
  });
};

export interface RunInput {
  readonly id: string;
  readonly name: string;
  readonly suiteId: string;
  readonly scenarios: ReadonlyArray<EvaluationScenarioType>;
  readonly configurationCases?: ReadonlyArray<ConfigurationCase>;
  readonly fixtures?: ReadonlyArray<Fixture>;
  readonly ruleDefinitions?: ReadonlyArray<RuleDefinition>;
  readonly backend: BackendIdentityType;
  readonly inputContract: InputContractIdentityType;
  readonly rendererAdapter: RendererAdapterIdentityType;
  readonly repetitions: number;
  readonly budget: {
    readonly maximumRequests: number;
    readonly maximumRetriesPerRequest: number;
    readonly authorizedRemainingCalls?: number;
  };
  readonly liveOptIn: boolean;
}

export const makeEvaluationRun = (input: RunInput): EvaluationRunType => {
  const withoutDigest = {
    id: input.id,
    name: input.name,
    suiteId: input.suiteId,
    scenarioIds: input.scenarios.map((scenario) => scenario.id),
    scenarioDigests: input.scenarios.map((scenario) => scenario.scenarioDigest),
    configurationCaseIds: (input.configurationCases ?? []).map(
      (configuration) => configuration.id,
    ),
    fixtureDigests: (input.fixtures ?? []).map((fixture) => fixture.fixtureDigest),
    ruleDefinitionDigests: (input.ruleDefinitions ?? []).map(
      (definition) => definition.definitionDigest,
    ),
    backend: input.backend,
    inputContract: input.inputContract,
    rendererAdapter: input.rendererAdapter,
    repetitions: input.repetitions,
    budget: input.budget,
    liveOptIn: input.liveOptIn,
  };
  return decode(EvaluationRun, {
    ...withoutDigest,
    runDigest: digestValue(withoutDigest),
  });
};

export const isCallBudgetValid = (budget: {
  readonly maximumRequests: number;
  readonly maximumRetriesPerRequest: number;
}): boolean =>
  Number.isInteger(budget.maximumRequests) &&
  budget.maximumRequests > 0 &&
  Number.isInteger(budget.maximumRetriesPerRequest) &&
  budget.maximumRetriesPerRequest >= 0;
