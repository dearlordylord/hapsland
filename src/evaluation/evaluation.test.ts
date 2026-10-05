import { describe, expect, it } from "vitest"
import * as fc from "fast-check"
import * as Schema from "effect/Schema"
import { DEFAULT_RULE_THRESHOLD } from "../rules/schema.ts"
import {
  Comparison,
  ComparisonResult,
  ComparisonSummary,
  EvaluationTimingEvidence,
  EvaluationPlan,
  EvaluationReport,
  EvaluationScenario,
  Observation,
  TransportObservation,
  strictParseOptions
} from "./model.ts"
import {
  digestValue,
  isScenarioDigestValid,
  makeConfigurationCase,
  makeConfigurationLayer,
  makeEffectiveConfiguration,
  makeExpectation,
  makeFixture,
  makeComparison,
  makeObservation,
  makeRuleDefinition,
  stableStringify
} from "./digest.ts"
import {
  makeBackendIdentity,
  makeEvaluationRun,
  makeEvaluationScenario,
  makeInputContractIdentity,
  makeRendererAdapterIdentity,
  planEvaluation,
  enforceCallBudget
} from "./plan.ts"
import { compareObservation, compareObservationPair, compareObservations } from "./comparison.ts"
import {
  buildEvaluationReport,
  isReportDigestValid,
  reportHasSemanticFailures,
  reportHasTransportAvailability,
  reportIsConformant
} from "./report.ts"

const backend = makeBackendIdentity({ id: "controlled", version: "1", mode: "controlled" })
const inputContract = makeInputContractIdentity({
  id: "full-file-plus-path",
  version: "1",
  digest: digestValue("full-file-plus-path-v1")
})
const renderer = makeRendererAdapterIdentity({
  id: "evaluation-renderer",
  version: "1",
  digest: digestValue("renderer-v1")
})

const ruleA = makeRuleDefinition({
  ruleId: "inferred-case",
  question: "Does the declaration encode alternatives without naming the case?",
  criteria: "Report implicit alternatives.",
  defaultMessage: "Name the case explicitly.",
  threshold: DEFAULT_RULE_THRESHOLD
})
const ruleB = makeRuleDefinition({
  ruleId: "meaningless-combinations",
  question: "Does the declaration admit meaningless combinations?",
  criteria: "Report impossible combinations.",
  defaultMessage: "Constrain the state space.",
  threshold: DEFAULT_RULE_THRESHOLD
})
const fixture = makeFixture({
  id: "delivery-record",
  name: "implicit delivery alternatives",
  role: "positive",
  domain: "delivery",
  path: "fixtures/delivery.ts",
  source: "type Delivery = { email?: string; phone?: string }"
})
const controlFixture = makeFixture({
  id: "explicit-delivery",
  name: "explicit delivery union control",
  role: "negative-control",
  domain: "delivery",
  path: "fixtures/explicit-delivery.ts",
  source: "type Delivery = { kind: 'email'; address: string } | { kind: 'phone'; number: string }"
})
const configuration = makeConfigurationCase({
  id: "defaults",
  builtIn: makeConfigurationLayer({ name: "built-in" }),
  user: makeConfigurationLayer({ name: "user" }),
  project: makeConfigurationLayer({ name: "project" }),
  consent: { repositoryId: "repo", backendId: backend.id, destinationId: "synthetic-destination", granted: true },
  expectedEffective: makeEffectiveConfiguration({ selectedRuleIds: [ruleA.identity.ruleId, ruleB.identity.ruleId] })
})

const scenarioFor = (input: {
  readonly id: string
  readonly name: string
  readonly interaction: "isolated" | "full" | "named"
  readonly fixtures: ReadonlyArray<typeof fixture>
  readonly rules: ReadonlyArray<typeof ruleA>
}) =>
  makeEvaluationScenario({
    id: input.id,
    name: input.name,
    interaction: input.interaction,
    ...(input.interaction === "named" ? { interactionName: "delivery-pair" } : {}),
    fixtures: input.fixtures,
    ruleDefinitions: input.rules,
    configurationCaseId: configuration.id,
    effectiveConfigurationDigest: configuration.expectedEffective.configurationDigest,
    backend,
    inputContract,
    rendererAdapter: renderer
  })

const isolated = scenarioFor({
  id: "isolated-a",
  name: "isolated inferred-case",
  interaction: "isolated",
  fixtures: [fixture],
  rules: [ruleA]
})
const full = scenarioFor({
  id: "full-batch",
  name: "full enabled batch",
  interaction: "full",
  fixtures: [fixture],
  rules: [ruleA, ruleB]
})
const named = scenarioFor({
  id: "named-pair",
  name: "named delivery pair",
  interaction: "named",
  fixtures: [controlFixture],
  rules: [ruleA, ruleB]
})

const run = makeEvaluationRun({
  id: "run-1",
  name: "offline synthetic run",
  suiteId: "suite-1",
  scenarios: [isolated, full, named],
  configurationCases: [configuration],
  fixtures: [fixture, controlFixture],
  ruleDefinitions: [ruleA, ruleB],
  backend,
  inputContract,
  rendererAdapter: renderer,
  repetitions: 2,
  budget: { maximumRequests: 10, maximumRetriesPerRequest: 1 },
  liveOptIn: false
})

const observation = (input: {
  readonly id: string
  readonly scenarioId: typeof isolated.id
  readonly fixtureId: typeof fixture.id
  readonly observationRuleId?: typeof ruleA.identity.ruleId
  readonly probability?: number
  readonly transport?: "available" | "unavailable"
  readonly conformance?: "passed" | "failed" | "unchecked"
  readonly reviewStatus?: "reviewed" | "skipped" | "unavailable" | "incomplete"
}) =>
  makeObservation({
    id: input.id,
    scenarioId: input.scenarioId,
    fixtureId: input.fixtureId,
    repetition: 1,
    request: {
      fixtureId: input.fixtureId,
      domain: fixture.domain,
      path: fixture.path,
      contentHash: fixture.contentHash,
      ruleIds: [ruleA.identity.ruleId],
      inputContract,
      rendererAdapter: renderer
    },
    transport: {
      status: input.transport ?? "available",
      attempts: input.transport === "unavailable" ? 2 : 1,
      retries: input.transport === "unavailable" ? 1 : 0,
      durationMs: 3,
      ...(input.transport === "unavailable" ? { errorCategory: "timeout" } : {})
    },
    conformance: { status: input.conformance ?? "passed", reasons: [] },
    ...(input.probability === undefined
      ? {}
      : { assessment: [{ ruleId: input.observationRuleId ?? ruleA.identity.ruleId, probability: input.probability }] }),
    findings: [],
    reviewStatus: input.reviewStatus ?? "reviewed"
  })

describe("evaluation model", () => {
  it("rejects unknown model fields at the strict boundary", () => {
    expect(() =>
      Schema.decodeUnknownSync(
        EvaluationReport,
        strictParseOptions
      )({
        runId: run.id,
        suiteId: run.suiteId,
        runDigest: run.runDigest,
        planDigest: digestValue("plan"),
        extra: "must be rejected"
      })
    ).toThrow()
  })

  it("makes content-sensitive fixture, definition, and scenario identities", () => {
    const changedFixture = makeFixture({
      id: fixture.id,
      name: fixture.name,
      role: fixture.role,
      domain: fixture.domain,
      path: fixture.path,
      source: `${fixture.source}\n`
    })
    const changedRule = makeRuleDefinition({
      ruleId: "inferred-case",
      question: `${ruleA.question} (changed)`,
      criteria: ruleA.criteria,
      defaultMessage: ruleA.defaultMessage,
      threshold: ruleA.threshold
    })
    expect(changedFixture.contentHash).not.toBe(fixture.contentHash)
    expect(changedFixture.fixtureDigest).not.toBe(fixture.fixtureDigest)
    expect(changedRule.definitionDigest).not.toBe(ruleA.definitionDigest)
    const changedContract = makeInputContractIdentity({
      id: inputContract.id,
      version: inputContract.version,
      digest: digestValue("changed-contract")
    })
    const changedScenario = makeEvaluationScenario({
      id: isolated.id,
      name: isolated.name,
      interaction: isolated.interaction,
      fixtures: [changedFixture],
      ruleDefinitions: [ruleA],
      configurationCaseId: configuration.id,
      effectiveConfigurationDigest: configuration.expectedEffective.configurationDigest,
      backend,
      inputContract: changedContract,
      rendererAdapter: renderer
    })
    expect(changedScenario.scenarioDigest).not.toBe(isolated.scenarioDigest)
  })

  it("rejects invalid interaction, transport, review, comparison, and plan variants", () => {
    expect(() =>
      Schema.decodeUnknownSync(EvaluationScenario, strictParseOptions)({ ...isolated, interaction: "named" })
    ).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(EvaluationScenario, strictParseOptions)({ ...named, interaction: "full" })
    ).toThrow()

    expect(() =>
      Schema.decodeUnknownSync(
        TransportObservation,
        strictParseOptions
      )({
        ...observation({ id: "transport-invalid", scenarioId: isolated.id, fixtureId: fixture.id }).transport,
        status: "available",
        errorCategory: "unexpected-error"
      })
    ).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(
        TransportObservation,
        strictParseOptions
      )({
        ...observation({
          id: "transport-invalid-unavailable",
          scenarioId: isolated.id,
          fixtureId: fixture.id,
          transport: "unavailable"
        }).transport,
        errorCategory: undefined
      })
    ).toThrow()

    const reviewedWithoutAssessment = observation({
      id: "reviewed-without-assessment",
      scenarioId: isolated.id,
      fixtureId: fixture.id,
      probability: 0.1
    })
    const { assessment: _assessment, ...reviewedWithoutAssessmentFields } = reviewedWithoutAssessment
    expect(() =>
      Schema.decodeUnknownSync(Observation, strictParseOptions)({ ...reviewedWithoutAssessmentFields })
    ).toThrow()

    const exact = makeComparison({
      id: "invalid-exact",
      name: "invalid exact",
      relation: "exact",
      leftObservationId: "left",
      rightObservationId: "right",
      tolerance: 0
    })
    expect(() =>
      Schema.decodeUnknownSync(Comparison, strictParseOptions)({ ...exact, observationId: "also-observation" })
    ).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(Comparison, strictParseOptions)({ ...exact, relation: "measured-change" })
    ).toThrow()
    const semantic = makeComparison({
      id: "semantic-without-rule",
      name: "semantic without rule",
      relation: "semantic-band",
      observationId: "observation",
      ruleId: ruleA.identity.ruleId,
      tolerance: 0
    })
    const { ruleId: _ruleId, ...semanticWithoutRule } = semantic
    expect(() => Schema.decodeUnknownSync(Comparison, strictParseOptions)({ ...semanticWithoutRule })).toThrow()

    const plan = planEvaluation(run, [isolated, full, named])
    expect(() => Schema.decodeUnknownSync(EvaluationPlan, strictParseOptions)({ ...plan, permitted: true })).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(
        EvaluationPlan,
        strictParseOptions
      )({ ...plan, permitted: false, rejectionReason: undefined })
    ).toThrow()
  })

  it("preserves canonical roundtrips under generated object-key permutations", () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.constantFrom("alpha", "beta", "gamma"), { minLength: 1 }), (keys) => {
        const value = Object.fromEntries(keys.map((key, index) => [key, { index, nested: [index, key.length] }]))
        const reordered = Object.fromEntries([...keys].reverse().map((key) => [key, value[key]]))
        expect(stableStringify(reordered)).toBe(stableStringify(value))
      })
    )

    const report = buildEvaluationReport({
      run,
      plan: planEvaluation({ ...run, budget: { maximumRequests: 100, maximumRetriesPerRequest: 1 } }, [
        isolated,
        full,
        named
      ]),
      scenarios: [isolated, full, named],
      observations: [],
      comparisons: []
    })
    const roundtripped = Schema.decodeUnknownSync(
      EvaluationReport,
      strictParseOptions
    )(JSON.parse(JSON.stringify(report)))
    expect(stableStringify(roundtripped)).toBe(stableStringify(report))
  })

  it("marks missing and ambiguous expectations unchecked or ambiguous", () => {
    const missingComparison = makeComparison({
      id: "missing-expectation",
      name: "missing expectation",
      relation: "semantic-band",
      observationId: "obs-missing",
      ruleId: ruleA.identity.ruleId,
      tolerance: 0
    })
    const missing = compareObservation(
      missingComparison,
      observation({ id: "obs-missing", scenarioId: isolated.id, fixtureId: fixture.id, probability: 0.9 })
    )
    expect(missing.semantic).toBe("unchecked")
    expect(missing.reason).toBe("missing-expectation")

    const ambiguousComparison = makeComparison({
      id: "ambiguous-expectation",
      name: "ambiguous fixture",
      relation: "semantic-band",
      observationId: "obs-ambiguous",
      ruleId: ruleA.identity.ruleId,
      expectation: makeExpectation({
        fixtureId: fixture.id,
        ruleId: ruleA.identity.ruleId,
        result: { kind: "ambiguous", reason: "boundary concept is unsettled" },
        rationale: "The fixture is retained for observation only."
      }),
      tolerance: 0
    })
    const ambiguous = compareObservation(
      ambiguousComparison,
      observation({ id: "obs-ambiguous", scenarioId: isolated.id, fixtureId: fixture.id, probability: 0.5 })
    )
    expect(ambiguous.semantic).toBe("ambiguous")
    expect(ambiguous.passed).toBe(false)
  })

  it("plans isolated, full, and named scenarios before enforcing the retry budget", () => {
    const plan = planEvaluation(run, [isolated, full, named])
    expect(plan.plannedRequests).toBe(6)
    expect(plan.worstCaseRequests).toBe(12)
    expect(plan.permitted).toBe(false)
    expect(plan.rejectionReason).toBe("budget-exceeded")
    expect(enforceCallBudget(plan, 10)).toEqual({
      permitted: false,
      observedRequests: 10,
      remainingRequests: 0,
      exceeded: false
    })
  })

  it("keeps exact, semantic, and measured-change relations separate", () => {
    const left = observation({ id: "obs-left", scenarioId: isolated.id, fixtureId: fixture.id, probability: 0.3 })
    const right = observation({ id: "obs-right", scenarioId: isolated.id, fixtureId: fixture.id, probability: 0.3 })
    const exact = makeComparison({
      id: "exact",
      name: "same controlled answer",
      relation: "exact",
      leftObservationId: left.id,
      rightObservationId: right.id,
      tolerance: 0
    })
    const exactResult = compareObservationPair(exact, left, right)
    expect(exactResult.deterministic).toBe("passed")
    expect(exactResult.semantic).toBe("unchecked")

    const band = makeComparison({
      id: "band",
      name: "positive band",
      relation: "semantic-band",
      observationId: right.id,
      ruleId: ruleA.identity.ruleId,
      expectation: makeExpectation({
        fixtureId: fixture.id,
        ruleId: ruleA.identity.ruleId,
        result: {
          kind: "violation",
          band: { minimum: DEFAULT_RULE_THRESHOLD, maximum: 1, minimumInclusive: false, maximumInclusive: true }
        },
        rationale: "Positive example should exceed the empirical band."
      }),
      tolerance: 0
    })
    const bandResult = compareObservation(band, right)
    expect(bandResult.semantic).toBe("failed")
    expect(bandResult.deterministic).toBe("unchecked")

    const change = makeComparison({
      id: "change",
      name: "isolated to full change",
      relation: "measured-change",
      leftObservationId: left.id,
      rightObservationId: observation({ id: "obs-full", scenarioId: full.id, fixtureId: fixture.id, probability: 0.9 })
        .id,
      ruleId: ruleA.identity.ruleId,
      direction: "increase",
      minimumDelta: 0.5,
      tolerance: 0
    })
    const changed = compareObservations(change, [
      left,
      observation({ id: "obs-full", scenarioId: full.id, fixtureId: fixture.id, probability: 0.9 })
    ])
    expect(changed.semantic).toBe("passed")
    expect(changed.delta).toBeCloseTo(0.6)
  })

  it("reports transport, conformance, semantic, coverage, and budget independently", () => {
    const plan = planEvaluation(run, [isolated, full, named])
    const unavailable = observation({
      id: "obs-unavailable",
      scenarioId: named.id,
      fixtureId: controlFixture.id,
      transport: "unavailable",
      conformance: "unchecked",
      reviewStatus: "unavailable"
    })
    const failed = observation({
      id: "obs-conformance-failed",
      scenarioId: full.id,
      fixtureId: fixture.id,
      conformance: "failed",
      reviewStatus: "incomplete"
    })
    const comparison = makeComparison({
      id: "report-semantic",
      name: "missing label",
      relation: "semantic-band",
      observationId: failed.id,
      ruleId: ruleA.identity.ruleId,
      tolerance: 0
    })
    const report = buildEvaluationReport({
      run,
      plan,
      scenarios: [isolated, full, named],
      observations: [unavailable, failed],
      comparisons: [compareObservation(comparison, failed)]
    })
    expect(report.transport.failed).toBe(1)
    expect(report.conformance.failed).toBe(1)
    expect(report.semantic.unchecked).toBe(1)
    expect(report.coverage.isolatedScenarios).toBe(1)
    expect(report.coverage.fullBatchScenarios).toBe(1)
    expect(report.coverage.namedInteractionScenarios).toBe(1)
    expect(report.budget.withinBudget).toBe(false)
    expect(report.timing).toMatchObject({
      sampleCount: 2,
      totalDurationMs: 6,
      minimumDurationMs: 3,
      maximumDurationMs: 3,
      meanDurationMs: 3,
      p50DurationMs: 3,
      p95DurationMs: 3
    })
    expect(report.releaseAccepted).toBe(false)
    expect(reportHasTransportAvailability(report)).toBe(false)
    expect(reportIsConformant(report)).toBe(false)
    expect(reportHasSemanticFailures(report)).toBe(false)
    expect(isReportDigestValid(report)).toBe(true)
    expect(() => Schema.decodeUnknownSync(EvaluationReport, strictParseOptions)(report)).not.toThrow()
  })
})

it("validates retry accounting independently of transport availability", () => {
  const transport = { status: "available", attempts: 2, retries: 1, durationMs: 12 }
  const decode = Schema.decodeUnknownSync(TransportObservation, strictParseOptions)
  expect(decode(transport)).toEqual(transport)
  expect(() => decode({ ...transport, attempts: 1 })).toThrow("attempts must equal retries plus one")
  expect(() => decode({ ...transport, errorCategory: "timeout" })).toThrow(
    "available transport cannot carry an error category"
  )
  expect(() => decode({ ...transport, status: "unavailable" })).toThrow(
    "unavailable transport requires an error category"
  )
  expect(decode({ ...transport, status: "unavailable", errorCategory: "timeout" })).toMatchObject({
    status: "unavailable"
  })
})

it("rejects invalid timing ranges, inconsistent means, and nonzero empty aggregates", () => {
  const decode = Schema.decodeUnknownSync(EvaluationTimingEvidence, strictParseOptions)
  const timing = {
    sampleCount: 2,
    totalDurationMs: 20,
    minimumDurationMs: 5,
    maximumDurationMs: 15,
    meanDurationMs: 10,
    p50DurationMs: 10,
    p95DurationMs: 14
  }
  expect(decode(timing)).toEqual(timing)
  for (const patch of [
    { minimumDurationMs: 16 },
    { p50DurationMs: 4 },
    { p50DurationMs: 16 },
    { p95DurationMs: 9 },
    { p95DurationMs: 16 }
  ]) {
    expect(() => decode({ ...timing, ...patch })).toThrow("timing percentiles must be ordered")
  }
  expect(() => decode({ ...timing, meanDurationMs: 11 })).toThrow("timing mean must agree")
  const empty = {
    sampleCount: 0,
    totalDurationMs: 0,
    minimumDurationMs: 0,
    maximumDurationMs: 0,
    meanDurationMs: 0,
    p50DurationMs: 0,
    p95DurationMs: 0
  }
  expect(decode(empty)).toEqual(empty)
  for (const field of [
    "totalDurationMs",
    "minimumDurationMs",
    "maximumDurationMs",
    "meanDurationMs",
    "p50DurationMs",
    "p95DurationMs"
  ]) {
    expect(() => decode({ ...empty, [field]: 1 })).toThrow("empty timing evidence must contain zero aggregates")
  }
})

it("keeps comparison results and report summaries subject to the same outcome constraints", () => {
  const base = {
    relation: "exact",
    deterministic: "passed",
    transport: "available",
    conformance: "passed",
    semantic: "unchecked",
    passed: true
  }
  const result = Schema.decodeUnknownSync(ComparisonResult, strictParseOptions)
  const summary = Schema.decodeUnknownSync(ComparisonSummary, strictParseOptions)
  const valid = [
    base,
    { ...base, transport: "unavailable", passed: false },
    { ...base, conformance: "failed", passed: false },
    { ...base, deterministic: "failed", passed: false },
    { ...base, relation: "semantic-band", deterministic: "unchecked", semantic: "passed" },
    { ...base, relation: "semantic-band", deterministic: "unchecked", semantic: "failed", passed: false },
    { ...base, relation: "measured-change", deterministic: "unchecked", semantic: "passed", delta: 0.3 }
  ]
  for (const fields of valid) {
    expect(result({ ...fields, comparisonId: "comparison" })).toMatchObject(fields)
    expect(summary({ ...fields, id: "comparison" })).toMatchObject(fields)
  }
  const invalid = [
    { ...base, semantic: "passed" },
    { ...base, relation: "semantic-band" },
    { ...base, passed: false },
    { ...base, transport: "unavailable" },
    { ...base, delta: 0.1 }
  ]
  for (const fields of invalid) {
    expect(() => result({ ...fields, comparisonId: "comparison" })).toThrow()
    expect(() => summary({ ...fields, id: "comparison" })).toThrow()
  }
})

it.each([isolated, full, named])("verifies scenario digest and rejects changed identity: $interaction", (scenario) => {
  expect(isScenarioDigestValid(scenario)).toBe(true)
  expect(isScenarioDigestValid({ ...scenario, name: `${scenario.name} changed` })).toBe(false)
  expect(
    isScenarioDigestValid({ ...scenario, eventSequence: [{ kind: "duplicate-event", identity: "changed" }] })
  ).toBe(false)
})

it("evaluates measured changes in both directions and enforces no-change tolerance", () => {
  const left = observation({ id: "direction-left", scenarioId: isolated.id, fixtureId: fixture.id, probability: 0.5 })
  const cases = [
    { direction: "increase", probability: 0.8, expected: "passed" },
    { direction: "increase", probability: 0.2, expected: "failed" },
    { direction: "decrease", probability: 0.2, expected: "passed" },
    { direction: "decrease", probability: 0.8, expected: "failed" },
    { direction: "change", probability: 0.2, expected: "passed" },
    { direction: "change", probability: 0.6, expected: "failed" },
    { direction: "no-change", probability: 0.505, expected: "passed" },
    { direction: "no-change", probability: 0.53, expected: "failed" }
  ] as const
  for (const entry of cases) {
    const right = observation({
      id: "direction-right",
      scenarioId: isolated.id,
      fixtureId: fixture.id,
      probability: entry.probability
    })
    const comparison = makeComparison({
      id: "direction",
      name: "measured direction",
      relation: "measured-change",
      leftObservationId: left.id,
      rightObservationId: right.id,
      ruleId: ruleA.identity.ruleId,
      direction: entry.direction,
      minimumDelta: 0.25,
      tolerance: 0.01
    })
    expect(compareObservations(comparison, [left, right])).toMatchObject({
      semantic: entry.expected,
      passed: entry.expected === "passed",
      delta: entry.probability - 0.5
    })
  }
})

it("keeps absent observations and absent semantic evidence unchecked", () => {
  const target = observation({
    id: "semantic-target",
    scenarioId: isolated.id,
    fixtureId: fixture.id,
    reviewStatus: "incomplete",
    conformance: "failed"
  })
  const comparison = makeComparison({
    id: "semantic-evidence",
    name: "semantic evidence",
    relation: "semantic-band",
    observationId: target.id,
    ruleId: ruleA.identity.ruleId,
    tolerance: 0,
    expectation: makeExpectation({
      fixtureId: fixture.id,
      ruleId: ruleA.identity.ruleId,
      result: { kind: "clear", band: { minimum: 0, maximum: 0.5, minimumInclusive: true, maximumInclusive: true } },
      rationale: "A labeled control must have a measured probability."
    })
  })
  expect(compareObservations(comparison, [])).toMatchObject({
    semantic: "unchecked",
    reason: "missing-observation",
    passed: false
  })
  expect(compareObservations(comparison, [target])).toMatchObject({
    semantic: "unchecked",
    reason: "missing-assessment",
    passed: false
  })
  const mismatched = observation({
    id: target.id,
    scenarioId: isolated.id,
    fixtureId: controlFixture.id,
    probability: 0.2
  })
  expect(compareObservations(comparison, [mismatched])).toMatchObject({
    semantic: "unchecked",
    reason: "fixture-context-mismatch",
    passed: false
  })
  const unlabeled = makeComparison({
    ...comparison,
    expectation: makeExpectation({
      fixtureId: fixture.id,
      ruleId: ruleA.identity.ruleId,
      result: { kind: "unchecked", reason: "label pending" },
      rationale: "Owner has not labeled this fixture."
    })
  })
  expect(compareObservations(unlabeled, [target])).toMatchObject({
    semantic: "unchecked",
    reason: "label pending",
    passed: false
  })
  const pair = makeComparison({
    id: "missing-pair",
    name: "missing comparison peer",
    relation: "exact",
    leftObservationId: target.id,
    rightObservationId: "absent-peer",
    tolerance: 0
  })
  expect(compareObservations(pair, [target])).toMatchObject({
    deterministic: "unchecked",
    reason: "missing-observation",
    passed: false
  })
})

it.each(["semantic-band", "measured-change"] as const)(
  "enforces release acceptance separately for %s results",
  (relation) => {
    const releaseRun = (requireSemanticPass: boolean, requireNoUnchecked: boolean) =>
      makeEvaluationRun({
        id: "release-policy-run",
        name: "release policy",
        suiteId: "release-policy",
        scenarios: [isolated],
        backend,
        inputContract,
        rendererAdapter: renderer,
        repetitions: 1,
        budget: { maximumRequests: 100, maximumRetriesPerRequest: 0 },
        liveOptIn: false,
        acceptance: {
          requireTransportAvailable: true,
          requireConformance: true,
          requireSemanticPass,
          requireNoUnchecked
        }
      })
    for (const semantic of ["passed", "failed", "unchecked", "ambiguous"] as const) {
      const comparison = Schema.decodeUnknownSync(
        ComparisonResult,
        strictParseOptions
      )({
        comparisonId: `release-${relation}-${semantic}`,
        relation,
        deterministic: "unchecked",
        transport: "available",
        conformance: "passed",
        semantic,
        passed: semantic === "passed"
      })
      for (const [requireSemanticPass, requireNoUnchecked, expected] of [
        [true, false, semantic === "passed"],
        [false, false, true],
        [false, true, semantic === "passed" || semantic === "failed"]
      ] as const) {
        const release = releaseRun(requireSemanticPass, requireNoUnchecked)
        const report = buildEvaluationReport({
          run: release,
          plan: planEvaluation(release, [isolated]),
          scenarios: [isolated],
          observations: [],
          comparisons: [comparison]
        })
        expect(
          report.releaseAccepted,
          `${semantic}: semantic=${requireSemanticPass}, unchecked=${requireNoUnchecked}`
        ).toBe(expected)
        expect(isReportDigestValid(report)).toBe(true)
      }
    }
  }
)
