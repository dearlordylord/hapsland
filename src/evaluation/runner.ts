import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { AssessmentError } from "../domain/errors.ts";
import { deriveAdvice } from "../policy/rules.ts";
import { ReviewBackend } from "../ports/review-backend.ts";
import { validateAssessment } from "../runtime/assessment.ts";
import type { CompiledRule } from "../rules/compiler.ts";
import {
  makeObservation,
  makeComparison,
  makeRuleDefinition,
} from "./digest.ts";
import { compareObservations } from "./comparison.ts";
import { buildEvaluationReport } from "./report.ts";
import {
  type Comparison,
  type ComparisonResult,
  type EvaluationPlan,
  type EvaluationReport,
  type EvaluationRun,
  type EvaluationScenario,
  type Fixture,
  type Observation,
  QualifiedRuleId,
  type RuleDefinition,
  type Expectation,
  strictParseOptions,
} from "./model.ts";

const decode = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: unknown,
): S["Type"] => Schema.decodeUnknownSync(schema, strictParseOptions)(value);

/** A bounded, source-free failure for a malformed evaluation suite. */
export class EvaluationExecutionError extends Schema.TaggedError<EvaluationExecutionError>()(
  "EvaluationExecutionError",
  {
    reason: Schema.NonEmptyString,
  },
) {}

export interface EvaluationExecutionInput {
  readonly run: EvaluationRun;
  readonly plan: EvaluationPlan;
  readonly scenarios: ReadonlyArray<EvaluationScenario>;
  readonly fixtures: ReadonlyArray<Fixture>;
  readonly ruleDefinitions: ReadonlyArray<RuleDefinition>;
  readonly expectations: ReadonlyArray<Expectation>;
  readonly compiledRules: ReadonlyArray<CompiledRule>;
  readonly comparisons?: ReadonlyArray<Comparison>;
}

export interface EvaluationExecutionResult {
  readonly observations: ReadonlyArray<Observation>;
  readonly comparisonResults: ReadonlyArray<ComparisonResult>;
  readonly report: EvaluationReport;
}

const fixtureLookup = (fixtures: ReadonlyArray<Fixture>) =>
  new Map(fixtures.map((fixture) => [fixture.id, fixture]));

const ruleLookup = (rules: ReadonlyArray<CompiledRule>) =>
  new Map(rules.map((rule) => [rule.qualifiedId, rule]));

const fixtureRef = (
  fixtures: ReadonlyMap<string, Fixture>,
  scenario: EvaluationScenario,
  fixtureId: string,
): Effect.Effect<Fixture, EvaluationExecutionError> => {
  const fixture = fixtures.get(fixtureId);
  if (fixture === undefined) {
    return Effect.fail(new EvaluationExecutionError({
      reason: `scenario ${scenario.id} references an unknown fixture`,
    }));
  }
  if (fixture.domain !== scenario.fixtures.find((ref) => ref.id === fixtureId)?.domain ||
      fixture.path !== scenario.fixtures.find((ref) => ref.id === fixtureId)?.path ||
      fixture.contentHash !== scenario.fixtures.find((ref) => ref.id === fixtureId)?.contentHash) {
    return Effect.fail(new EvaluationExecutionError({
      reason: `scenario ${scenario.id} fixture reference does not match its content identity`,
    }));
  }
  return Effect.succeed(fixture);
};

const selectedRules = (
  rules: ReadonlyMap<string, CompiledRule>,
  definitions: ReadonlyMap<string, RuleDefinition>,
  scenario: EvaluationScenario,
): Effect.Effect<ReadonlyArray<CompiledRule>, EvaluationExecutionError> =>
  Effect.forEach(scenario.ruleSet, (reference) => {
    const rule = rules.get(reference.qualifiedId);
    const definition = definitions.get(reference.qualifiedId);
    if (rule === undefined || definition === undefined ||
        definition.definitionDigest !== reference.definitionDigest) {
      return Effect.fail(new EvaluationExecutionError({
        reason: `scenario ${scenario.id} references an unknown or changed rule definition`,
      }));
    }
    return Effect.succeed(rule);
  });

const requestRuleIds = (rules: ReadonlyArray<CompiledRule>) =>
  rules.map((rule) => decode(QualifiedRuleId, rule.qualifiedId));

const unavailableObservation = (input: {
  readonly id: string;
  readonly scenario: EvaluationScenario;
  readonly fixture: Fixture;
  readonly rules: ReadonlyArray<CompiledRule>;
  readonly reason: string;
  readonly attempts: number;
}) =>
  makeObservation({
    id: input.id,
    scenarioId: input.scenario.id,
    fixtureId: input.fixture.id,
    repetition: Number(input.id.split(":").at(-1) ?? 1),
    request: {
      fixtureId: input.fixture.id,
      domain: input.fixture.domain,
      path: input.fixture.path,
      contentHash: input.fixture.contentHash,
      ruleIds: requestRuleIds(input.rules),
      inputContract: input.scenario.inputContract,
      rendererAdapter: input.scenario.rendererAdapter,
    },
    transport: {
      status: "unavailable",
      attempts: Math.max(1, input.attempts),
      retries: Math.max(0, input.attempts - 1),
      durationMs: 0,
      errorCategory: input.reason,
    },
    conformance: {
      status: "unchecked",
      reasons: ["transport-unavailable"],
    },
    findings: [],
    reviewStatus: "unavailable",
  });

const observed = Effect.fn("Evaluation.observeFixture")(function* (input: {
  readonly backend: ReviewBackend.Interface;
  readonly scenario: EvaluationScenario;
  readonly fixture: Fixture;
  readonly rules: ReadonlyArray<CompiledRule>;
  readonly repetition: number;
}) {
  const id = `${input.scenario.id}:${input.fixture.id}:${input.repetition}`;
  const result = yield* input.backend
    .evaluate({
      path: input.fixture.path,
      source: input.fixture.source,
      rules: input.rules,
    })
    .pipe(Effect.result);
  if (Result.isFailure(result)) {
    return unavailableObservation({
      id,
      scenario: input.scenario,
      fixture: input.fixture,
      rules: input.rules,
      reason: "backend-unavailable",
      attempts: 1,
    });
  }

  const response = result.success;
  const assessment = yield* validateAssessment(input.rules, response.answers).pipe(
    Effect.result,
  );
  const request = {
    fixtureId: input.fixture.id,
    domain: input.fixture.domain,
    path: input.fixture.path,
    contentHash: input.fixture.contentHash,
    ruleIds: requestRuleIds(input.rules),
    inputContract: input.scenario.inputContract,
    rendererAdapter: input.scenario.rendererAdapter,
  };
  if (Result.isFailure(assessment)) {
    const reason = assessment.failure instanceof AssessmentError
      ? "assessment-contract"
      : "assessment-invalid";
    return makeObservation({
      id,
      scenarioId: input.scenario.id,
      fixtureId: input.fixture.id,
      repetition: input.repetition,
      request,
      transport: {
        status: "available",
        attempts: response.backend.retries + 1,
        retries: response.backend.retries,
        durationMs: response.backend.durationMs,
      },
      conformance: { status: "failed", reasons: [reason] },
      findings: [],
      reviewStatus: "incomplete",
    });
  }

  const findings = deriveAdvice(
    input.rules,
    assessment.success,
    { path: input.fixture.path, contentHash: input.fixture.contentHash },
    input.rules.length,
  ).map((finding) => ({
    ruleId: decode(QualifiedRuleId, finding.ruleId),
    probability: finding.probability,
    message: finding.message,
  }));
  const assessmentEntries = input.rules.flatMap((rule) => {
    const probability = assessment.success[rule.id];
    return probability === undefined
      ? []
      : [{
          ruleId: decode(QualifiedRuleId, rule.qualifiedId),
          probability,
        }];
  });
  if (assessmentEntries.length !== input.rules.length) {
    return makeObservation({
      id,
      scenarioId: input.scenario.id,
      fixtureId: input.fixture.id,
      repetition: input.repetition,
      request,
      transport: {
        status: "available",
        attempts: response.backend.retries + 1,
        retries: response.backend.retries,
        durationMs: response.backend.durationMs,
      },
      conformance: { status: "failed", reasons: ["missing-assessment"] },
      findings: [],
      reviewStatus: "incomplete",
    });
  }
  return makeObservation({
    id,
    scenarioId: input.scenario.id,
    fixtureId: input.fixture.id,
    repetition: input.repetition,
    request,
    transport: {
      status: "available",
      attempts: response.backend.retries + 1,
      retries: response.backend.retries,
      durationMs: response.backend.durationMs,
    },
    conformance: { status: "passed", reasons: [] },
    assessment: assessmentEntries,
    findings,
    reviewStatus: "reviewed",
  });
});

const defaultComparisons = (input: EvaluationExecutionInput, observations: ReadonlyArray<Observation>) => {
  const byScenarioFixture = new Map(
    observations.map((observation) => [
      `${observation.scenarioId}:${observation.fixtureId}:${observation.repetition}`,
      observation,
    ]),
  );
  const expectations = new Map(
    input.expectations.map((expectation) => [
      `${expectation.fixtureId}:${expectation.ruleId}`,
      expectation,
    ]),
  );
  const isolated = input.scenarios.filter((scenario) => scenario.interaction === "isolated");
  const full = input.scenarios.find((scenario) => scenario.interaction === "full");
  const named = input.scenarios.find((scenario) => scenario.interaction === "named");
  const comparisons: Array<Comparison> = [];
  for (let repetition = 1; repetition <= input.run.repetitions; repetition += 1) {
    for (const scenario of isolated) {
      for (const fixtureRef of scenario.fixtures) {
        const observation = byScenarioFixture.get(
          `${scenario.id}:${fixtureRef.id}:${repetition}`,
        );
        if (observation === undefined) continue;
        for (const ruleRef of scenario.ruleSet) {
          const expectation = expectations.get(`${fixtureRef.id}:${ruleRef.qualifiedId}`);
          comparisons.push(makeComparison({
            id: `expectation:${scenario.id}:${fixtureRef.id}:${ruleRef.qualifiedId}:${repetition}`,
            name: `expectation ${scenario.name} ${fixtureRef.id} repetition ${repetition}`,
            relation: "semantic-band",
            observationId: observation.id,
            ruleId: ruleRef.qualifiedId,
            ...(expectation === undefined ? {} : { expectation }),
            tolerance: 0,
          }));

          const paired = [
            ["full", full],
            ["named", named],
          ] as const;
          for (const [label, targetScenario] of paired) {
            if (targetScenario === undefined) continue;
            const target = byScenarioFixture.get(
              `${targetScenario.id}:${fixtureRef.id}:${repetition}`,
            );
            if (target === undefined) continue;
            comparisons.push(makeComparison({
              id: `cross-batch:${label}:${scenario.id}:${fixtureRef.id}:${ruleRef.qualifiedId}:${repetition}`,
              name: `${label} interaction for ${fixtureRef.id} repetition ${repetition}`,
              relation: "measured-change",
              leftObservationId: observation.id,
              rightObservationId: target.id,
              ruleId: ruleRef.qualifiedId,
              direction: "no-change",
              tolerance: 0.25,
            }));
          }
        }
      }
    }
  }
  if (input.run.repetitions > 1) {
    for (const scenario of isolated) {
      for (const fixtureRef of scenario.fixtures) {
        const left = byScenarioFixture.get(`${scenario.id}:${fixtureRef.id}:1`);
        if (left === undefined) continue;
        for (let repetition = 2; repetition <= input.run.repetitions; repetition += 1) {
          const right = byScenarioFixture.get(
            `${scenario.id}:${fixtureRef.id}:${repetition}`,
          );
          if (right === undefined) continue;
          comparisons.push(makeComparison({
            id: `deterministic:${scenario.id}:${fixtureRef.id}:${repetition}`,
            name: `repeatability for ${fixtureRef.id} repetition ${repetition}`,
            relation: "exact",
            leftObservationId: left.id,
            rightObservationId: right.id,
            tolerance: 0,
          }));
        }
      }
    }
  }
  return comparisons;
};

/** Execute scenarios through the production ReviewBackend/DecisionModel path. */
export const executeEvaluation = (
  input: EvaluationExecutionInput,
  backendLayer: Layer.Layer<ReviewBackend.Service, never, never>,
): Effect.Effect<EvaluationExecutionResult, EvaluationExecutionError> =>
  Effect.gen(function* () {
    if (!input.plan.permitted) {
      return yield* new EvaluationExecutionError({
        reason: input.plan.rejectionReason ?? "evaluation-plan-rejected",
      });
    }
    const backend = yield* ReviewBackend.Service;
    const fixtures = fixtureLookup(input.fixtures);
    const rules = ruleLookup(input.compiledRules);
    const definitions = new Map(
      input.ruleDefinitions.map((definition) => [definition.identity.qualifiedId, definition]),
    );
    const selectedScenarios = new Map(input.scenarios.map((scenario) => [scenario.id, scenario]));
    const observations: Array<Observation> = [];
    for (const scenarioId of input.run.scenarioIds) {
      const scenario = selectedScenarios.get(scenarioId);
      if (scenario === undefined) {
        return yield* new EvaluationExecutionError({ reason: `run references unknown scenario ${scenarioId}` });
      }
      const scenarioRules = yield* selectedRules(rules, definitions, scenario);
      for (let repetition = 1; repetition <= input.run.repetitions; repetition += 1) {
        for (const reference of scenario.fixtures) {
          const fixture = yield* fixtureRef(fixtures, scenario, reference.id);
          observations.push(yield* observed({
            backend,
            scenario,
            fixture,
            rules: scenarioRules,
            repetition,
          }));
        }
      }
    }
    const comparisons = input.comparisons ?? defaultComparisons(input, observations);
    const comparisonResults = comparisons.map((comparison) => compareObservations(comparison, observations));
    return {
      observations,
      comparisonResults,
      report: buildEvaluationReport({
        run: input.run,
        plan: input.plan,
        scenarios: input.scenarios,
        observations,
        comparisons: comparisonResults,
        comparisonInputs: comparisons,
      }),
    };
  }).pipe(Effect.provide(backendLayer));

/**
 * Construct evaluation definitions from a compiled production rule set when a
 * caller needs a run identity without re-reading pack files.
 */
export const definitionsFromCompiledRules = (
  rules: ReadonlyArray<CompiledRule>,
): ReadonlyArray<RuleDefinition> =>
  rules.map((rule) => makeRuleDefinition({
    packId: rule.packId,
    ruleId: rule.ruleId,
    packVersion: rule.packVersion,
    question: rule.decision.instructions,
    criteria: rule.decision.criteria,
    defaultMessage: rule.message,
    threshold: rule.threshold,
    applicability: {
      includePatterns: rule.applicability?.includes ?? [],
      excludePatterns: rule.applicability?.excludes ?? [],
    },
  }));
