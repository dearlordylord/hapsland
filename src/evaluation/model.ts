import * as Schema from "effect/Schema";
import type { Probability } from "../domain/contracts.ts";

/**
 * The evaluation model deliberately uses opaque identities.  A name or a version
 * is useful for a report, but neither is enough to prove that the evaluated input
 * was unchanged.  Every content-bearing entity therefore carries a SHA-256 digest.
 */

const Identifier = Schema.NonEmptyString;
const NonNegativeInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const PositiveInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));
const NonNegativeFinite = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));
const HexDigest = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[0-9a-f]{64}$/i)),
  Schema.brand("EvaluationDigest"),
);

export const EvaluationDigest = HexDigest;
export type EvaluationDigest = typeof EvaluationDigest.Type;

export const EvaluationId = Identifier.pipe(Schema.brand("EvaluationId"));
export type EvaluationId = typeof EvaluationId.Type;

export const FixtureId = Identifier.pipe(Schema.brand("EvaluationFixtureId"));
export type FixtureId = typeof FixtureId.Type;

export const RulePackId = Identifier.pipe(Schema.brand("EvaluationRulePackId"));
export type RulePackId = typeof RulePackId.Type;

export const LocalRuleId = Identifier.pipe(Schema.brand("EvaluationLocalRuleId"));
export type LocalRuleId = typeof LocalRuleId.Type;

export const QualifiedRuleId = Identifier.pipe(
  Schema.brand("EvaluationQualifiedRuleId"),
);
export type QualifiedRuleId = typeof QualifiedRuleId.Type;

export const ConfigurationCaseId = Identifier.pipe(
  Schema.brand("EvaluationConfigurationCaseId"),
);
export type ConfigurationCaseId = typeof ConfigurationCaseId.Type;

export const ScenarioId = Identifier.pipe(Schema.brand("EvaluationScenarioId"));
export type ScenarioId = typeof ScenarioId.Type;

export const ObservationId = Identifier.pipe(
  Schema.brand("EvaluationObservationId"),
);
export type ObservationId = typeof ObservationId.Type;

export const ComparisonId = Identifier.pipe(
  Schema.brand("EvaluationComparisonId"),
);
export type ComparisonId = typeof ComparisonId.Type;

export const RunId = Identifier.pipe(Schema.brand("EvaluationRunId"));
export type RunId = typeof RunId.Type;

export const BackendId = Identifier.pipe(Schema.brand("EvaluationBackendId"));
export type BackendId = typeof BackendId.Type;

export const InputContractId = Identifier.pipe(
  Schema.brand("EvaluationInputContractId"),
);
export type InputContractId = typeof InputContractId.Type;

export const RendererAdapterId = Identifier.pipe(
  Schema.brand("EvaluationRendererAdapterId"),
);
export type RendererAdapterId = typeof RendererAdapterId.Type;

export const Version = Identifier.pipe(Schema.brand("EvaluationVersion"));
export type Version = typeof Version.Type;

export const DigestRef = Schema.Struct({
  id: Identifier,
  version: Version,
  digest: EvaluationDigest,
});
export interface DigestRef extends Schema.Schema.Type<typeof DigestRef> {}

export const RuleIdentity = Schema.Struct({
  packId: RulePackId,
  ruleId: LocalRuleId,
  qualifiedId: QualifiedRuleId,
  packVersion: Version,
});
export interface RuleIdentity extends Schema.Schema.Type<typeof RuleIdentity> {}

export const RuleApplicability = Schema.Struct({
  includePatterns: Schema.Array(Schema.String),
  excludePatterns: Schema.Array(Schema.String),
});
export interface RuleApplicability
  extends Schema.Schema.Type<typeof RuleApplicability> {}

export const RuleDefinition = Schema.Struct({
  identity: RuleIdentity,
  question: Schema.NonEmptyString,
  criteria: Schema.NonEmptyString,
  defaultMessage: Schema.NonEmptyString,
  threshold: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  applicability: RuleApplicability,
  definitionDigest: EvaluationDigest,
});
export interface RuleDefinition extends Schema.Schema.Type<typeof RuleDefinition> {}

export const Fixture = Schema.Struct({
  id: FixtureId,
  name: Schema.NonEmptyString,
  role: Schema.Literals(["positive", "negative", "negative-control", "ambiguous"] as const),
  domain: Schema.NonEmptyString,
  path: Schema.NonEmptyString,
  source: Schema.String,
  contentHash: EvaluationDigest,
  fixtureDigest: EvaluationDigest,
});
export interface Fixture extends Schema.Schema.Type<typeof Fixture> {}

export const FixtureReference = Schema.Struct({
  id: FixtureId,
  domain: Schema.NonEmptyString,
  path: Schema.NonEmptyString,
  contentHash: EvaluationDigest,
  fixtureDigest: EvaluationDigest,
});
export interface FixtureReference
  extends Schema.Schema.Type<typeof FixtureReference> {}

export const RuleReference = Schema.Struct({
  qualifiedId: QualifiedRuleId,
  definitionDigest: EvaluationDigest,
});
export interface RuleReference extends Schema.Schema.Type<typeof RuleReference> {}

export const ExpectedBand = Schema.Struct({
  minimum: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  maximum: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  minimumInclusive: Schema.Boolean,
  maximumInclusive: Schema.Boolean,
});
export interface ExpectedBand extends Schema.Schema.Type<typeof ExpectedBand> {}

export const ExpectedResult = Schema.Union([
  Schema.Struct({
    kind: Schema.Literals(["clear", "violation"] as const),
    band: ExpectedBand,
  }),
  Schema.Struct({
    kind: Schema.Literal("ambiguous"),
    reason: Schema.NonEmptyString,
  }),
  Schema.Struct({
    kind: Schema.Literal("unchecked"),
    reason: Schema.NonEmptyString,
  }),
]);
export type ExpectedResult = typeof ExpectedResult.Type;

export const Expectation = Schema.Struct({
  fixtureId: FixtureId,
  ruleId: QualifiedRuleId,
  result: ExpectedResult,
  rationale: Schema.NonEmptyString,
});
export interface Expectation extends Schema.Schema.Type<typeof Expectation> {}

export const ConfigurationRuleOverride = Schema.Struct({
  ruleId: QualifiedRuleId,
  enabled: Schema.optionalKey(Schema.Boolean),
  threshold: Schema.optionalKey(
    Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  ),
  message: Schema.optionalKey(Schema.NonEmptyString),
});
export interface ConfigurationRuleOverride
  extends Schema.Schema.Type<typeof ConfigurationRuleOverride> {}

export const ConfigurationLayer = Schema.Struct({
  name: Schema.Literals(["built-in", "user", "project"] as const),
  includePatterns: Schema.Array(Schema.String),
  excludePatterns: Schema.Array(Schema.String),
  ruleOverrides: Schema.Array(ConfigurationRuleOverride),
});
export interface ConfigurationLayer
  extends Schema.Schema.Type<typeof ConfigurationLayer> {}

export const ConsentState = Schema.Struct({
  repositoryId: Schema.NonEmptyString,
  backendId: BackendId,
  destinationId: Schema.NonEmptyString,
  granted: Schema.Boolean,
});
export interface ConsentState extends Schema.Schema.Type<typeof ConsentState> {}

export const ConfigurationProvenance = Schema.Struct({
  field: Schema.NonEmptyString,
  origin: Schema.Literals(["built-in", "user", "project"] as const),
  valueDigest: EvaluationDigest,
});
export interface ConfigurationProvenance
  extends Schema.Schema.Type<typeof ConfigurationProvenance> {}

export const EffectiveConfiguration = Schema.Struct({
  includePatterns: Schema.Array(Schema.String),
  excludePatterns: Schema.Array(Schema.String),
  selectedRuleIds: Schema.Array(QualifiedRuleId),
  ruleOverrides: Schema.Array(ConfigurationRuleOverride),
  provenance: Schema.Array(ConfigurationProvenance),
  configurationDigest: EvaluationDigest,
});
export interface EffectiveConfiguration
  extends Schema.Schema.Type<typeof EffectiveConfiguration> {}

export const ConfigurationCase = Schema.Struct({
  id: ConfigurationCaseId,
  builtIn: ConfigurationLayer,
  user: ConfigurationLayer,
  project: ConfigurationLayer,
  consent: ConsentState,
  expectedEffective: EffectiveConfiguration,
  caseDigest: EvaluationDigest,
});
export interface ConfigurationCase
  extends Schema.Schema.Type<typeof ConfigurationCase> {}

export const BackendIdentity = Schema.Struct({
  id: BackendId,
  version: Version,
  mode: Schema.Literals(["controlled", "fake-http", "live"] as const),
});
export interface BackendIdentity extends Schema.Schema.Type<typeof BackendIdentity> {}

export const InputContractIdentity = Schema.Struct({
  id: InputContractId,
  version: Version,
  digest: EvaluationDigest,
});
export interface InputContractIdentity
  extends Schema.Schema.Type<typeof InputContractIdentity> {}

export const RendererAdapterIdentity = Schema.Struct({
  id: RendererAdapterId,
  version: Version,
  digest: EvaluationDigest,
});
export interface RendererAdapterIdentity
  extends Schema.Schema.Type<typeof RendererAdapterIdentity> {}

export const ScenarioAction = Schema.Struct({
  kind: Schema.Literals([
    "observe-edit",
    "retry",
    "duplicate-event",
    "changed-snapshot",
    "backend-failure",
    "advance-time",
  ] as const),
  identity: Schema.NonEmptyString,
});
export interface ScenarioAction extends Schema.Schema.Type<typeof ScenarioAction> {}

export const EvaluationScenario = Schema.Struct({
  id: ScenarioId,
  name: Schema.NonEmptyString,
  interaction: Schema.Literals(["isolated", "full", "named"] as const),
  interactionName: Schema.optionalKey(Schema.NonEmptyString),
  fixtures: Schema.Array(FixtureReference),
  ruleSet: Schema.Array(RuleReference),
  configurationCaseId: ConfigurationCaseId,
  effectiveConfigurationDigest: EvaluationDigest,
  backend: BackendIdentity,
  inputContract: InputContractIdentity,
  rendererAdapter: RendererAdapterIdentity,
  eventSequence: Schema.Array(ScenarioAction),
  requestCount: Schema.optionalKey(NonNegativeInteger),
  scenarioDigest: EvaluationDigest,
});
export interface EvaluationScenario
  extends Schema.Schema.Type<typeof EvaluationScenario> {}

export const AssessmentEntry = Schema.Struct({
  ruleId: QualifiedRuleId,
  probability: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
});
export interface AssessmentEntry extends Schema.Schema.Type<typeof AssessmentEntry> {}

export const RequestShape = Schema.Struct({
  fixtureId: FixtureId,
  domain: Schema.NonEmptyString,
  path: Schema.NonEmptyString,
  contentHash: EvaluationDigest,
  ruleIds: Schema.Array(QualifiedRuleId),
  inputContract: InputContractIdentity,
  rendererAdapter: RendererAdapterIdentity,
});
export interface RequestShape extends Schema.Schema.Type<typeof RequestShape> {}

export const TransportObservation = Schema.Struct({
  status: Schema.Literals(["available", "unavailable"] as const),
  attempts: PositiveInteger,
  retries: NonNegativeInteger,
  durationMs: NonNegativeFinite,
  errorCategory: Schema.optionalKey(Schema.NonEmptyString),
});
export interface TransportObservation
  extends Schema.Schema.Type<typeof TransportObservation> {}

export const ConformanceObservation = Schema.Struct({
  status: Schema.Literals(["passed", "failed", "unchecked"] as const),
  reasons: Schema.Array(Schema.NonEmptyString),
});
export interface ConformanceObservation
  extends Schema.Schema.Type<typeof ConformanceObservation> {}

export const FindingObservation = Schema.Struct({
  ruleId: QualifiedRuleId,
  probability: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  message: Schema.NonEmptyString,
});
export interface FindingObservation
  extends Schema.Schema.Type<typeof FindingObservation> {}

export const Observation = Schema.Struct({
  id: ObservationId,
  scenarioId: ScenarioId,
  fixtureId: FixtureId,
  repetition: PositiveInteger,
  request: RequestShape,
  transport: TransportObservation,
  conformance: ConformanceObservation,
  assessment: Schema.optionalKey(Schema.Array(AssessmentEntry)),
  findings: Schema.Array(FindingObservation),
  reviewStatus: Schema.Literals(["reviewed", "skipped", "unavailable", "incomplete"] as const),
});
export interface Observation extends Schema.Schema.Type<typeof Observation> {}

export const Comparison = Schema.Struct({
  id: ComparisonId,
  name: Schema.NonEmptyString,
  relation: Schema.Literals(["exact", "semantic-band", "measured-change"] as const),
  leftObservationId: Schema.optionalKey(ObservationId),
  rightObservationId: Schema.optionalKey(ObservationId),
  observationId: Schema.optionalKey(ObservationId),
  ruleId: Schema.optionalKey(QualifiedRuleId),
  expectation: Schema.optionalKey(Expectation),
  direction: Schema.optionalKey(
    Schema.Literals(["increase", "decrease", "change", "no-change"] as const),
  ),
  minimumDelta: Schema.optionalKey(NonNegativeFinite),
  tolerance: NonNegativeFinite,
});
export interface Comparison extends Schema.Schema.Type<typeof Comparison> {}

export const CallBudget = Schema.Struct({
  maximumRequests: PositiveInteger,
  maximumRetriesPerRequest: NonNegativeInteger,
  authorizedRemainingCalls: Schema.optionalKey(PositiveInteger),
});
export interface CallBudget extends Schema.Schema.Type<typeof CallBudget> {}

export const EvaluationRun = Schema.Struct({
  id: RunId,
  name: Schema.NonEmptyString,
  suiteId: EvaluationId,
  scenarioIds: Schema.Array(ScenarioId),
  scenarioDigests: Schema.Array(EvaluationDigest),
  configurationCaseIds: Schema.Array(ConfigurationCaseId),
  fixtureDigests: Schema.Array(EvaluationDigest),
  ruleDefinitionDigests: Schema.Array(EvaluationDigest),
  backend: BackendIdentity,
  inputContract: InputContractIdentity,
  rendererAdapter: RendererAdapterIdentity,
  repetitions: PositiveInteger,
  budget: CallBudget,
  liveOptIn: Schema.Boolean,
  runDigest: EvaluationDigest,
});
export interface EvaluationRun extends Schema.Schema.Type<typeof EvaluationRun> {}

export const EvaluationPlan = Schema.Struct({
  runId: RunId,
  scenarioIds: Schema.Array(ScenarioId),
  repetitions: PositiveInteger,
  maximumAttemptsPerRequest: PositiveInteger,
  plannedRequests: NonNegativeInteger,
  worstCaseRequests: NonNegativeInteger,
  budgetMaximumRequests: PositiveInteger,
  permitted: Schema.Boolean,
  rejectionReason: Schema.optionalKey(Schema.Literals(["budget-exceeded", "live-opt-in-required"] as const)),
  planDigest: EvaluationDigest,
});
export interface EvaluationPlan extends Schema.Schema.Type<typeof EvaluationPlan> {}

export const ComparisonResult = Schema.Struct({
  comparisonId: ComparisonId,
  relation: Schema.Literals(["exact", "semantic-band", "measured-change"] as const),
  deterministic: Schema.Literals(["passed", "failed", "unchecked"] as const),
  transport: Schema.Literals(["available", "unavailable", "unchecked"] as const),
  conformance: Schema.Literals(["passed", "failed", "unchecked"] as const),
  semantic: Schema.Literals(["passed", "failed", "ambiguous", "unchecked"] as const),
  passed: Schema.Boolean,
  reason: Schema.optionalKey(Schema.NonEmptyString),
  delta: Schema.optionalKey(Schema.Finite),
});
export interface ComparisonResult extends Schema.Schema.Type<typeof ComparisonResult> {}

export const AggregateCounts = Schema.Struct({
  total: NonNegativeInteger,
  passed: NonNegativeInteger,
  failed: NonNegativeInteger,
  unchecked: NonNegativeInteger,
  ambiguous: NonNegativeInteger,
});
export interface AggregateCounts extends Schema.Schema.Type<typeof AggregateCounts> {}

export const ComparisonSummary = Schema.Struct({
  id: ComparisonId,
  relation: Schema.Literals(["exact", "semantic-band", "measured-change"] as const),
  passed: Schema.Boolean,
  deterministic: Schema.Literals(["passed", "failed", "unchecked"] as const),
  transport: Schema.Literals(["available", "unavailable", "unchecked"] as const),
  conformance: Schema.Literals(["passed", "failed", "unchecked"] as const),
  semantic: Schema.Literals(["passed", "failed", "ambiguous", "unchecked"] as const),
  reason: Schema.optionalKey(Schema.NonEmptyString),
  delta: Schema.optionalKey(Schema.Finite),
});
export interface ComparisonSummary extends Schema.Schema.Type<typeof ComparisonSummary> {}

export const EvaluationCoverage = Schema.Struct({
  plannedScenarios: NonNegativeInteger,
  observedScenarios: NonNegativeInteger,
  plannedFixtures: NonNegativeInteger,
  observedFixtures: NonNegativeInteger,
  isolatedScenarios: NonNegativeInteger,
  fullBatchScenarios: NonNegativeInteger,
  namedInteractionScenarios: NonNegativeInteger,
  plannedComparisons: NonNegativeInteger,
  observedComparisons: NonNegativeInteger,
});
export interface EvaluationCoverage extends Schema.Schema.Type<typeof EvaluationCoverage> {}

export const EvaluationReport = Schema.Struct({
  runId: RunId,
  suiteId: EvaluationId,
  runDigest: EvaluationDigest,
  planDigest: EvaluationDigest,
  budget: Schema.Struct({
    declaredMaximumRequests: PositiveInteger,
    plannedRequests: NonNegativeInteger,
    worstCaseRequests: NonNegativeInteger,
    observedRequests: NonNegativeInteger,
    withinBudget: Schema.Boolean,
  }),
  transport: AggregateCounts,
  conformance: AggregateCounts,
  semantic: AggregateCounts,
  coverage: EvaluationCoverage,
  comparisons: Schema.Array(ComparisonSummary),
  fixtureDigests: Schema.Array(EvaluationDigest),
  ruleDefinitionDigests: Schema.Array(EvaluationDigest),
  configurationCaseIds: Schema.Array(ConfigurationCaseId),
  inputContract: InputContractIdentity,
  rendererAdapter: RendererAdapterIdentity,
  reportDigest: EvaluationDigest,
});
export interface EvaluationReport extends Schema.Schema.Type<typeof EvaluationReport> {}

/** Strict parsing options are exported so every boundary can reject unknown fields. */
export const strictParseOptions = {
  onExcessProperty: "error",
  errors: "all",
} as const;

export const decodeRuleDefinition = Schema.decodeUnknownEffect(
  RuleDefinition,
  strictParseOptions,
);
export const decodeFixture = Schema.decodeUnknownEffect(Fixture, strictParseOptions);
export const decodeExpectation = Schema.decodeUnknownEffect(
  Expectation,
  strictParseOptions,
);
export const decodeConfigurationCase = Schema.decodeUnknownEffect(
  ConfigurationCase,
  strictParseOptions,
);
export const decodeEvaluationScenario = Schema.decodeUnknownEffect(
  EvaluationScenario,
  strictParseOptions,
);
export const decodeObservation = Schema.decodeUnknownEffect(
  Observation,
  strictParseOptions,
);
export const decodeComparison = Schema.decodeUnknownEffect(
  Comparison,
  strictParseOptions,
);
export const decodeEvaluationRun = Schema.decodeUnknownEffect(
  EvaluationRun,
  strictParseOptions,
);
export const decodeEvaluationReport = Schema.decodeUnknownEffect(
  EvaluationReport,
  strictParseOptions,
);

/** A conservative check used by the pure digest functions. */
export const isFiniteProbability = (value: number): value is Probability =>
  Number.isFinite(value) && value >= 0 && value <= 1;
