import { createHash } from "node:crypto";
import * as Schema from "effect/Schema";
import {
  ConfigurationCase,
  type ConfigurationCase as ConfigurationCaseType,
  ConfigurationLayer,
  type ConfigurationLayer as ConfigurationLayerType,
  EffectiveConfiguration,
  type EffectiveConfiguration as EffectiveConfigurationType,
  EvaluationDigest,
  EvaluationScenario,
  type EvaluationScenario as EvaluationScenarioType,
  EvaluationPlan,
  type EvaluationPlan as EvaluationPlanType,
  EvaluationRun,
  type EvaluationRun as EvaluationRunType,
  Expectation,
  type Expectation as ExpectationType,
  Observation,
  type Observation as ObservationType,
  Comparison,
  type Comparison as ComparisonType,
  Fixture,
  type Fixture as FixtureType,
  FixtureReference,
  type FixtureReference as FixtureReferenceType,
  RuleDefinition,
  type RuleDefinition as RuleDefinitionType,
  RuleReference,
  type RuleReference as RuleReferenceType,
  strictParseOptions,
} from "./model.ts";

/** JSON values accepted by the canonical digest representation. */
export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<CanonicalValue>
  | { readonly [key: string]: CanonicalValue };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Convert a JSON-shaped value to a deterministic, recursively key-sorted value.
 * Arrays intentionally retain their order: scenario and rule order are semantic.
 */
export const canonicalize = (value: unknown): CanonicalValue => {
  if (value === null) return null;
  if (value === undefined) return { $undefined: true };
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    return String(value);
  }
  if (typeof value === "bigint") return `${value}n`;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value instanceof Date) return value.toISOString();
  if (isRecord(value)) {
    const result: Record<string, CanonicalValue> = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = canonicalize(value[key]);
    }
    return result;
  }
  return String(value);
};

export const stableStringify = (value: unknown): string =>
  JSON.stringify(canonicalize(value));

export const digestValue = (value: unknown): EvaluationDigest => {
  const hash = createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
  return Schema.decodeUnknownSync(EvaluationDigest, strictParseOptions)(hash);
};

export const digestRuleDefinition = (
  definition: RuleDefinitionType,
): EvaluationDigest =>
  digestValue({
    identity: definition.identity,
    question: definition.question,
    criteria: definition.criteria,
    defaultMessage: definition.defaultMessage,
    threshold: definition.threshold,
    applicability: definition.applicability,
  });

export const digestFixture = (fixture: FixtureType): EvaluationDigest =>
  digestValue({
    id: fixture.id,
    name: fixture.name,
    role: fixture.role,
    domain: fixture.domain,
    path: fixture.path,
    source: fixture.source,
    contentHash: fixture.contentHash,
  });

export const digestFixtureReference = (
  fixture: FixtureReferenceType,
): EvaluationDigest => digestValue(fixture);

export const digestRuleReference = (
  rule: RuleReferenceType,
): EvaluationDigest => digestValue(rule);

export const digestConfigurationCase = (
  configuration: ConfigurationCaseType,
): EvaluationDigest =>
  digestValue({
    id: configuration.id,
    builtIn: configuration.builtIn,
    user: configuration.user,
    project: configuration.project,
    consent: configuration.consent,
    expectedEffective: configuration.expectedEffective,
  });

export const digestScenario = (
  scenario: EvaluationScenarioType,
): EvaluationDigest =>
  digestValue({
    id: scenario.id,
    name: scenario.name,
    interaction: scenario.interaction,
    ...(scenario.interactionName === undefined
      ? {}
      : { interactionName: scenario.interactionName }),
    fixtures: scenario.fixtures,
    ruleSet: scenario.ruleSet,
    configurationCaseId: scenario.configurationCaseId,
    effectiveConfigurationDigest: scenario.effectiveConfigurationDigest,
    backend: scenario.backend,
    inputContract: scenario.inputContract,
    rendererAdapter: scenario.rendererAdapter,
    eventSequence: scenario.eventSequence,
    ...(scenario.requestCount === undefined
      ? {}
      : { requestCount: scenario.requestCount }),
  });

export const digestRun = (run: EvaluationRunType): EvaluationDigest =>
  digestValue({
    id: run.id,
    name: run.name,
    suiteId: run.suiteId,
    scenarioIds: run.scenarioIds,
    scenarioDigests: run.scenarioDigests,
    configurationCaseIds: run.configurationCaseIds,
    fixtureDigests: run.fixtureDigests,
    ruleDefinitionDigests: run.ruleDefinitionDigests,
    backend: run.backend,
    inputContract: run.inputContract,
    rendererAdapter: run.rendererAdapter,
    repetitions: run.repetitions,
    budget: run.budget,
    liveOptIn: run.liveOptIn,
  });

export const digestPlan = (plan: EvaluationPlanType): EvaluationDigest =>
  digestValue({
    runId: plan.runId,
    scenarioIds: plan.scenarioIds,
    repetitions: plan.repetitions,
    maximumAttemptsPerRequest: plan.maximumAttemptsPerRequest,
    plannedRequests: plan.plannedRequests,
    worstCaseRequests: plan.worstCaseRequests,
    budgetMaximumRequests: plan.budgetMaximumRequests,
    permitted: plan.permitted,
    ...(plan.rejectionReason === undefined
      ? {}
      : { rejectionReason: plan.rejectionReason }),
  });

export const digestExpectation = (
  expectation: ExpectationType,
): EvaluationDigest =>
  digestValue({
    fixtureId: expectation.fixtureId,
    ruleId: expectation.ruleId,
    result: expectation.result,
    rationale: expectation.rationale,
  });

export const digestObservation = (
  observation: ObservationType,
): EvaluationDigest =>
  digestValue({
    id: observation.id,
    scenarioId: observation.scenarioId,
    fixtureId: observation.fixtureId,
    repetition: observation.repetition,
    request: observation.request,
    transport: observation.transport,
    conformance: observation.conformance,
    ...(observation.assessment === undefined
      ? {}
      : { assessment: observation.assessment }),
    findings: observation.findings,
    reviewStatus: observation.reviewStatus,
  });

export const digestComparison = (
  comparison: ComparisonType,
): EvaluationDigest =>
  digestValue({
    id: comparison.id,
    name: comparison.name,
    relation: comparison.relation,
    ...(comparison.leftObservationId === undefined
      ? {}
      : { leftObservationId: comparison.leftObservationId }),
    ...(comparison.rightObservationId === undefined
      ? {}
      : { rightObservationId: comparison.rightObservationId }),
    ...(comparison.observationId === undefined
      ? {}
      : { observationId: comparison.observationId }),
    ...(comparison.ruleId === undefined ? {} : { ruleId: comparison.ruleId }),
    ...(comparison.expectation === undefined
      ? {}
      : { expectation: comparison.expectation }),
    ...(comparison.fixtureRelation === undefined
      ? {}
      : { fixtureRelation: comparison.fixtureRelation }),
    ...(comparison.direction === undefined
      ? {}
      : { direction: comparison.direction }),
    ...(comparison.minimumDelta === undefined
      ? {}
      : { minimumDelta: comparison.minimumDelta }),
    tolerance: comparison.tolerance,
  });

export const isRuleDefinitionDigestValid = (
  definition: RuleDefinitionType,
): boolean => definition.definitionDigest === digestRuleDefinition(definition);

export const isFixtureDigestValid = (fixture: FixtureType): boolean =>
  fixture.contentHash === digestValue(fixture.source) &&
  fixture.fixtureDigest === digestFixture(fixture);

export const isConfigurationCaseDigestValid = (
  configuration: ConfigurationCaseType,
): boolean => configuration.caseDigest === digestConfigurationCase(configuration);

export const isScenarioDigestValid = (scenario: EvaluationScenarioType): boolean =>
  scenario.scenarioDigest === digestScenario(scenario);

export const isRunDigestValid = (run: EvaluationRunType): boolean =>
  run.runDigest === digestRun(run);

export const isPlanDigestValid = (plan: EvaluationPlanType): boolean =>
  plan.planDigest === digestPlan(plan);

export const isExpectationDigestValid = (
  expectation: ExpectationType,
): boolean => expectation.expectationDigest === digestExpectation(expectation);

export const isObservationDigestValid = (
  observation: ObservationType,
): boolean => observation.observationDigest === digestObservation(observation);

export const isComparisonDigestValid = (
  comparison: ComparisonType,
): boolean => comparison.comparisonDigest === digestComparison(comparison);

export interface RuleDefinitionInput {
  readonly packId: string;
  readonly ruleId: string;
  readonly packVersion: string;
  readonly question: string;
  readonly criteria: string;
  readonly defaultMessage: string;
  readonly threshold: number;
  readonly applicability?: {
    readonly includePatterns?: ReadonlyArray<string>;
    readonly excludePatterns?: ReadonlyArray<string>;
  };
}

export const makeRuleDefinition = (
  input: RuleDefinitionInput,
): RuleDefinitionType => {
  const identity = {
    packId: input.packId,
    ruleId: input.ruleId,
    qualifiedId: `${input.packId}:${input.ruleId}`,
    packVersion: input.packVersion,
  };
  const definitionWithoutDigest = {
    identity,
    question: input.question,
    criteria: input.criteria,
    defaultMessage: input.defaultMessage,
    threshold: input.threshold,
    applicability: {
      includePatterns: input.applicability?.includePatterns ?? [],
      excludePatterns: input.applicability?.excludePatterns ?? [],
    },
  };
  const digest = digestValue(definitionWithoutDigest);
  return Schema.decodeUnknownSync(RuleDefinition, strictParseOptions)({
    ...definitionWithoutDigest,
    definitionDigest: digest,
  });
};

export interface FixtureInput {
  readonly id: string;
  readonly name: string;
  readonly role: FixtureType["role"];
  readonly domain: string;
  readonly path: string;
  readonly source: string;
}

export const makeFixture = (input: FixtureInput): FixtureType => {
  const contentHash = digestValue(input.source);
  const withoutDigest = {
    ...input,
    contentHash,
  };
  return Schema.decodeUnknownSync(Fixture, strictParseOptions)({
    ...withoutDigest,
    fixtureDigest: digestValue(withoutDigest),
  });
};

export const makeFixtureReference = (
  fixture: FixtureType,
): FixtureReferenceType =>
  Schema.decodeUnknownSync(FixtureReference, strictParseOptions)({
    id: fixture.id,
    domain: fixture.domain,
    path: fixture.path,
    contentHash: fixture.contentHash,
    fixtureDigest: fixture.fixtureDigest,
  });

export const makeConfigurationLayer = (input: {
  readonly name: ConfigurationLayerType["name"];
  readonly includePatterns?: ReadonlyArray<string>;
  readonly excludePatterns?: ReadonlyArray<string>;
  readonly ruleOverrides?: ReadonlyArray<ConfigurationLayerType["ruleOverrides"][number]>;
}): ConfigurationLayerType =>
  Schema.decodeUnknownSync(ConfigurationLayer, strictParseOptions)({
    name: input.name,
    includePatterns: input.includePatterns ?? [],
    excludePatterns: input.excludePatterns ?? [],
    ruleOverrides: input.ruleOverrides ?? [],
  });

export const makeEffectiveConfiguration = (input: {
  readonly includePatterns?: ReadonlyArray<string>;
  readonly excludePatterns?: ReadonlyArray<string>;
  readonly selectedRuleIds?: ReadonlyArray<string>;
  readonly ruleOverrides?: ReadonlyArray<ConfigurationLayerType["ruleOverrides"][number]>;
  readonly provenance?: ReadonlyArray<ConfigurationCaseType["expectedEffective"]["provenance"][number]>;
}): EffectiveConfigurationType => {
  const withoutDigest = {
    includePatterns: input.includePatterns ?? [],
    excludePatterns: input.excludePatterns ?? [],
    selectedRuleIds: input.selectedRuleIds ?? [],
    ruleOverrides: input.ruleOverrides ?? [],
    provenance: input.provenance ?? [],
  };
  return Schema.decodeUnknownSync(EffectiveConfiguration, strictParseOptions)({
    ...withoutDigest,
    configurationDigest: digestValue(withoutDigest),
  });
};

export const makeConfigurationCase = (input: {
  readonly id: string;
  readonly builtIn: ConfigurationLayerType;
  readonly user: ConfigurationLayerType;
  readonly project: ConfigurationLayerType;
  readonly consent: ConfigurationCaseType["consent"];
  readonly expectedEffective: EffectiveConfigurationType;
}): ConfigurationCaseType => {
  const withoutDigest = {
    id: input.id,
    builtIn: input.builtIn,
    user: input.user,
    project: input.project,
    consent: input.consent,
    expectedEffective: input.expectedEffective,
  };
  return Schema.decodeUnknownSync(ConfigurationCase, strictParseOptions)({
    ...withoutDigest,
    caseDigest: digestValue(withoutDigest),
  });
};

export const makeRuleReference = (
  definition: RuleDefinitionType,
): RuleReferenceType =>
  Schema.decodeUnknownSync(RuleReference, strictParseOptions)({
    qualifiedId: definition.identity.qualifiedId,
    definitionDigest: definition.definitionDigest,
  });

export interface ExpectationInput {
  readonly fixtureId: string;
  readonly ruleId: string;
  readonly result: ExpectationType["result"];
  readonly rationale: string;
}

export const makeExpectation = (
  input: ExpectationInput,
): ExpectationType =>
  Schema.decodeUnknownSync(Expectation, strictParseOptions)({
    ...input,
    expectationDigest: digestValue(input),
  });

export const makeUncheckedExpectation = (input: {
  readonly fixtureId: string;
  readonly ruleId: string;
  readonly reason: string;
  readonly rationale?: string;
}): ExpectationType =>
  makeExpectation({
    fixtureId: input.fixtureId,
    ruleId: input.ruleId,
    result: { kind: "unchecked", reason: input.reason },
    rationale: input.rationale ?? input.reason,
  });

export const makeAmbiguousExpectation = (input: {
  readonly fixtureId: string;
  readonly ruleId: string;
  readonly reason: string;
  readonly rationale: string;
}): ExpectationType =>
  makeExpectation({
    fixtureId: input.fixtureId,
    ruleId: input.ruleId,
    result: { kind: "ambiguous", reason: input.reason },
    rationale: input.rationale,
  });

export interface ObservationInput {
  readonly id: string;
  readonly scenarioId: string;
  readonly fixtureId: string;
  readonly repetition: number;
  readonly request: ObservationType["request"];
  readonly transport: ObservationType["transport"];
  readonly conformance: ObservationType["conformance"];
  readonly assessment?: ObservationType["assessment"];
  readonly findings: ObservationType["findings"];
  readonly reviewStatus: ObservationType["reviewStatus"];
}

export const makeObservation = (input: ObservationInput): ObservationType => {
  const withoutDigest = {
    id: input.id,
    scenarioId: input.scenarioId,
    fixtureId: input.fixtureId,
    repetition: input.repetition,
    request: input.request,
    transport: input.transport,
    conformance: input.conformance,
    ...(input.assessment === undefined ? {} : { assessment: input.assessment }),
    findings: input.findings,
    reviewStatus: input.reviewStatus,
  };
  return Schema.decodeUnknownSync(Observation, strictParseOptions)({
    ...withoutDigest,
    observationDigest: digestValue(withoutDigest),
  });
};

export interface ComparisonInput {
  readonly id: string;
  readonly name: string;
  readonly relation: ComparisonType["relation"];
  readonly leftObservationId?: string;
  readonly rightObservationId?: string;
  readonly observationId?: string;
  readonly ruleId?: string;
  readonly expectation?: ExpectationType;
  readonly fixtureRelation?: ComparisonType["fixtureRelation"];
  readonly direction?: ComparisonType["direction"];
  readonly minimumDelta?: number;
  readonly tolerance: number;
}

export const makeComparison = (input: ComparisonInput): ComparisonType =>
  Schema.decodeUnknownSync(Comparison, strictParseOptions)({
    ...input,
    comparisonDigest: digestValue(input),
  });
