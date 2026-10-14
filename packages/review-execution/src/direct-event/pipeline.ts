import type { EvaluatedUnit } from "./evaluation/contract.ts"
import type { RevalidationResult, ResidentPublicationAuthority } from "./freshness/contract.ts"
import { prepareSource } from "./preparation/public-preparation.ts"
import type {
  SourceLineRequest,
  DirectReviewContext,
  PreparedSource,
  SourcePreparationContext,
  PrepareOutcome,
  PreparedObservation
} from "./preparation/contract.ts"

import { isBundledArtifact } from "@hapsland/source-analysis/direct-event/languages/registry"
import { assertReviewEngineBoundary } from "@hapsland/runtime-environment/runtime/review-engine-boundary"
import {
  toCodexDirectEventOutput,
  type Finding,
  type CodexDirectEventOutput
} from "@hapsland/delivery-output/direct-event/output"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import { AiError, Decision, DecisionModel } from "effect/ai"

import { compareRuleRank, findingFromProbability } from "@hapsland/review-definition/rules/decision"
import { encodedProviderHttpBodyBytes } from "./provider-body-size.ts"
import { admitReview } from "@hapsland/runtime-inputs/configuration/decision"

import { probabilityRequest, requestLimitViolation } from "../review-providers/request.ts"

import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-limits"

import { adaptCodexDirectEvent, verifyObservationRoot } from "@hapsland/native-observation/direct-event/adapter"

import { TYPE_INPUT_CONTRACT, FUNCTION_INPUT_CONTRACT } from "@hapsland/review-definition/rules/targets"

import {
  renderCandidateReviewInput,
  type CandidateReviewInput,
  type CandidateInputFailure,
  type ReportCandidateInputFailure
} from "./review-renderer.ts"

import {
  canonicalValue,
  semanticIdentity,
  type PreparedUnit,
  type ReviewInput
} from "@hapsland/review-definition/direct-event/model"
import { bundledArtifactDomain } from "@hapsland/source-artifacts/direct-event/artifact-model"
import { type DirectObservation, type DirectAdvicee } from "@hapsland/native-observation/direct-event/observation"
import {
  DEFAULT_DIRECT_FILE_POLICY,
  resolvedDirectFilePolicy,
  selectedByDirectFilePolicy,
  type DirectFilePolicy
} from "@hapsland/native-observation/direct-event/selection"

export type {
  DirectReviewContext,
  PreparedSource,
  SourcePreparationContext,
  PrepareOutcome,
  PreparedObservation
} from "./preparation/contract.ts"

export { checkHandoffSources, type HandoffSourceMember } from "./handoff-sources.ts"

assertReviewEngineBoundary("pipeline")

export const DIRECT_EVENT_DEADLINE_MS = 15_000 as const

export type { SourceLineRequest } from "./preparation/contract.ts"
export type { EvaluatedUnit } from "./evaluation/contract.ts"
export type { RevalidationResult, ResidentPublicationAuthority } from "./freshness/contract.ts"

export type DirectReviewResult =
  | { readonly status: "unsupported"; readonly output: undefined }
  | { readonly status: "unattributed"; readonly output: undefined }
  | { readonly status: "no-advice"; readonly output: undefined }
  | { readonly status: "unavailable"; readonly reason: "backend" | "timeout" | "stale"; readonly output: undefined }
  | {
      readonly status: "ready"
      readonly findings: ReadonlyArray<Finding>
      readonly evaluations: ReadonlyArray<EvaluatedUnit>
      readonly output: CodexDirectEventOutput
    }

const sameAdvicee = (left: DirectAdvicee, right: DirectAdvicee): boolean =>
  canonicalValue(left) === canonicalValue(right)

const sameInput = (left: ReviewInput, right: ReviewInput): boolean => {
  const { sourceFingerprints: _leftCapture, rootLocation: _leftLocation, ...leftReview } = left
  const { sourceFingerprints: _rightCapture, rootLocation: _rightLocation, ...rightReview } = right
  return canonicalValue(leftReview) === canonicalValue(rightReview)
}

const preparedBelongsTo = (prepared: PreparedUnit, observation: DirectObservation): boolean =>
  prepared.root === observation.root && sameAdvicee(prepared.advicee, observation.advicee)

const validEvaluation = (evaluation: EvaluatedUnit): boolean =>
  evaluation.prepared.identity === semanticIdentity(evaluation.prepared.input) &&
  evaluation.findings.every(
    (finding) =>
      finding.semanticIdentity === evaluation.prepared.identity &&
      finding.path === evaluation.prepared.input.path &&
      finding.declaration === evaluation.prepared.input.declaration.name
  )

const current = <A>(value: A | (() => A)): A => (typeof value === "function" ? (value as () => A)() : value)

const currentPolicy = (context: SourcePreparationContext): DirectFilePolicy =>
  context.policy === undefined
    ? context.settings.configuration === undefined
      ? DEFAULT_DIRECT_FILE_POLICY
      : resolvedDirectFilePolicy(context.settings.configuration.policy)
    : current(context.policy)

/** Hook preparation attaches the original advicee only after source preparation. */
export const prepareObservation = Effect.fn("DirectEvent.prepareObservation")(function* (
  observation: DirectObservation,
  context: DirectReviewContext,
  frozenNames: ReadonlyMap<string, ReadonlySet<string>> | undefined = undefined
): Effect.fn.Return<PreparedObservation> {
  const result = yield* prepareSource(observation, context, frozenNames === undefined ? {} : { frozenNames })
  return {
    observation: result.observation,
    outcomes: result.outcomes.map((outcome) =>
      outcome.status === "ready"
        ? { ...outcome, prepared: { ...outcome.prepared, advicee: observation.advicee } }
        : outcome
    )
  }
})

/** Explicit operator selection; no fabricated edit, agent identity or resident. */
export const prepareSourceLine = Effect.fn("DirectEvent.prepareSourceLine")(function* (
  request: SourceLineRequest,
  context: SourcePreparationContext
) {
  return yield* prepareSource(
    { root: request.root, rootIdentity: request.rootIdentity, candidates: [{ operation: "add", path: request.path }] },
    context,
    { line: request.line }
  )
})

export const preparedSourceLineStillCurrent = Effect.fn("DirectEvent.preparedSourceLineStillCurrent")(function* (
  request: SourceLineRequest,
  prepared: PreparedSource,
  context: SourcePreparationContext
) {
  if (!(yield* verifyObservationRoot(request))) return false
  const latest = yield* prepareSourceLine(request, context)
  const ready = latest.outcomes.filter((outcome) => outcome.status === "ready")
  return (
    ready.length === 1 &&
    ready.some(
      (outcome) =>
        outcome.status === "ready" &&
        outcome.prepared.identity === prepared.identity &&
        sameInput(outcome.prepared.input, prepared.input) &&
        canonicalValue(outcome.prepared.input.sourceFingerprints) === canonicalValue(prepared.input.sourceFingerprints)
    )
  )
})

/** Explicit snapshot comparison for analysis callers; the review loop checks at publication. */
export const preparedUnitStillCurrent = Effect.fn("DirectEvent.preparedUnitStillCurrent")(function* (
  observation: DirectObservation,
  prepared: PreparedUnit,
  context: DirectReviewContext
) {
  if (!(yield* verifyObservationRoot(observation))) return false
  const names = new Map([[prepared.input.path, new Set([prepared.input.declaration.name])]])
  const latest = yield* prepareObservation(observation, context, names)
  return latest.outcomes.some(
    (outcome) =>
      outcome.status === "ready" &&
      outcome.prepared.input.path === prepared.input.path &&
      outcome.prepared.identity === prepared.identity &&
      sameInput(outcome.prepared.input, prepared.input) &&
      canonicalValue(outcome.prepared.input.sourceFingerprints) === canonicalValue(prepared.input.sourceFingerprints)
  )
})

type Evaluation =
  | { readonly status: "evaluated"; readonly findings: ReadonlyArray<Finding> }
  | { readonly status: "input-limit" }
  | { readonly status: "input-invalid" }
  | { readonly status: "backend" }
  | { readonly status: "timeout" }

/** Flatten the bounded graph and its omission reasons in traversal order. */
const candidateRootArtifact = (
  input: ReviewInput
):
  | { readonly artifact: CandidateReviewInput["artifact"]; readonly contract: CandidateReviewInput["contract"] }
  | undefined => {
  if (
    input.candidateProjection !== true ||
    (input.contract !== TYPE_INPUT_CONTRACT && input.contract !== FUNCTION_INPUT_CONTRACT)
  )
    return undefined
  const root = input.unit.root
  const path = root.artifact.path
  if (
    root.artifact.origin !== undefined ||
    root.artifact.kind === "constant-group" ||
    path === undefined ||
    path !== input.path ||
    root.artifact.id !== input.declaration.id
  )
    return undefined
  return {
    contract: input.contract,
    artifact: {
      id: root.artifact.id,
      kind: root.artifact.kind,
      name: root.artifact.name,
      domain: path,
      source: root.artifact.source
    }
  }
}

export const candidateReviewInput = (
  input: ReviewInput,
  report?: ReportCandidateInputFailure
): CandidateReviewInput | undefined => {
  const invalid = (reason: Extract<CandidateInputFailure, { code: "review-input-invalid" }>["args"]["reason"]) => {
    report?.({ code: "review-input-invalid", args: { reason } })
    return undefined
  }
  const candidate = candidateRootArtifact(input)
  if (candidate === undefined) return invalid("root-invalid")
  const artifact = candidate.artifact
  const root = input.unit.root
  const nodes: CandidateReviewInput["nodes"][number][] = []
  const edges: CandidateReviewInput["edges"][number][] = []
  const seen = new Set([artifact.id])
  const expandReference = (
    owner: typeof root,
    reference: Extract<(typeof root.references)[number], { readonly kind: "expanded" }>
  ): typeof root | undefined => {
    const child = reference.node
    const origin = child.artifact.origin
    if (origin !== undefined && !isBundledArtifact(child.artifact)) return invalid("supporting-artifact-invalid")
    const domain = origin === undefined ? child.artifact.path : bundledArtifactDomain(origin)
    if (domain === undefined) return invalid("supporting-artifact-invalid")
    if (seen.has(child.artifact.id)) return invalid("duplicate-expanded-target")
    seen.add(child.artifact.id)
    nodes.push({
      id: child.artifact.id,
      kind: child.artifact.kind,
      name: child.artifact.name,
      domain,
      source: child.artifact.source,
      ...(origin === undefined ? {} : { origin }),
      order: nodes.length
    })
    edges.push({
      from: owner.artifact.id,
      to: child.artifact.id,
      kind: "expanded",
      symbol: reference.site.symbol,
      order: edges.length
    })
    return child
  }
  const visit = (owner: typeof root): boolean => {
    for (const reference of owner.references) {
      if (reference.kind === "omitted") {
        edges.push({
          from: owner.artifact.id,
          kind: "omitted",
          symbol: reference.site.symbol,
          reason: reference.reason,
          order: edges.length
        })
        continue
      }
      if (reference.kind === "included") {
        if (!seen.has(reference.target)) {
          invalid("included-target-unavailable")
          return false
        }
        edges.push({
          from: owner.artifact.id,
          to: reference.target,
          kind: "included",
          symbol: reference.site.symbol,
          order: edges.length
        })
        continue
      }
      const child = expandReference(owner, reference)
      if (child === undefined) return false
      if (!visit(child)) return false
    }
    return true
  }
  if (!visit(root)) return undefined
  return {
    contract: candidate.contract,
    completeness: input.completeness,
    treeBytesLimit: input.graphLimits?.treeBytes ?? GRAPH_LIMIT_CEILINGS.treeBytes,
    artifact,
    nodes,
    edges
  }
}

/** Exact source-bearing `DecisionModel` input before provider serialization. */
export const preparedProviderInput = (prepared: PreparedSource, report?: ReportCandidateInputFailure) => {
  if (prepared.input.contract === TYPE_INPUT_CONTRACT || prepared.input.contract === FUNCTION_INPUT_CONTRACT) {
    const candidate = candidateReviewInput(prepared.input, report)
    return candidate === undefined ? undefined : renderCandidateReviewInput(candidate, report)
  }
  return undefined
}

/** UTF-8 bytes in the exact JSON representation supplied as the provider input value. */
export const encodedPreparedProviderInputBytes = (prepared: PreparedSource): number =>
  preparedProviderInput(prepared) === undefined
    ? Number.POSITIVE_INFINITY
    : Buffer.byteLength(JSON.stringify(preparedProviderInput(prepared)), "utf8")

export const encodedFullJevRequestBytes = (prepared: PreparedSource): number => {
  const input = preparedProviderInput(prepared)
  if (input === undefined) return Number.POSITIVE_INFINITY
  return Buffer.byteLength(
    JSON.stringify({
      input,
      decisions: Object.fromEntries(prepared.input.rules.map(({ id, decision }) => [id, decision]))
    }),
    "utf8"
  )
}

/** Pinned provider's encoded JSON HTTP body, distinct from the local proposal shape. */
export const encodedPreparedProviderHttpBodyBytes = (prepared: PreparedSource): number => {
  const input = preparedProviderInput(prepared)
  return input === undefined
    ? Number.POSITIVE_INFINITY
    : encodedProviderHttpBodyBytes(input, prepared.input.rules, prepared.input.providerIdentity.model)
}

type ProbabilityAnswers = Readonly<Record<string, { readonly probability: number }>>
const validProbabilityAnswer = (answer: ProbabilityAnswers[string] | undefined): answer is ProbabilityAnswers[string] =>
  answer !== undefined && Number.isFinite(answer.probability) && answer.probability >= 0 && answer.probability <= 1
const expectedProbabilityAnswers = (prepared: PreparedSource, answers: ProbabilityAnswers): boolean => {
  const expected = prepared.input.rules.map(({ id }) => id).sort()
  const actual = Object.keys(answers).sort()
  return expected.length === actual.length && expected.every((key, index) => key === actual[index])
}
const evaluateProbabilityAnswers = (prepared: PreparedSource, answers: ProbabilityAnswers): Evaluation => {
  const ranked: Array<{ readonly finding: Finding; readonly rank: number }> = []
  for (const rule of prepared.input.rules) {
    const answer = answers[rule.id]
    if (!validProbabilityAnswer(answer)) return { status: "backend" } as const
    if (findingFromProbability(answer.probability, rule.threshold)) {
      ranked.push({
        rank: rule.rank,
        finding: {
          path: prepared.input.path,
          declaration: prepared.input.declaration.name,
          ruleId: rule.id,
          probability: answer.probability,
          message: rule.message,
          semanticIdentity: prepared.identity
        }
      })
    }
  }
  const findings = ranked
    .sort((left, right) =>
      compareRuleRank(
        { probability: left.finding.probability, rank: left.rank },
        { probability: right.finding.probability, rank: right.rank }
      )
    )
    .map(({ finding }) => finding)
  return { status: "evaluated", findings } satisfies Evaluation
}

export type EvaluationEvidence =
  | {
      readonly kind: "diagnostic"
      readonly path: string
      readonly declaration: string
      readonly diagnostic: CandidateInputFailure & { readonly stage: "provider-input" }
    }
  | { readonly kind: "model-input"; readonly input: typeof Schema.Json.Type }
  | { readonly kind: "interpreted-findings"; readonly findings: ReadonlyArray<Finding> }
  | {
      readonly kind: "validated-answers"
      readonly answers: ReadonlyArray<{ readonly ruleId: string; readonly probability: number }>
    }
  | {
      readonly kind: "evaluation-outcome"
      readonly outcome:
        | "clear"
        | "findings"
        | "input-limit"
        | "input-invalid"
        | "backend"
        | "invalid-response"
        | "timeout"
        | "interrupted"
    }

const invalidModelOutput = (failure: unknown): boolean =>
  AiError.isAiError(failure) &&
  (failure.reason._tag === "InvalidOutputError" || failure.reason._tag === "StructuredOutputError")

const interpretEvaluationAnswers = (
  prepared: PreparedSource,
  answers: ProbabilityAnswers,
  emit: (evidence: EvaluationEvidence) => void
): Evaluation => {
  if (!expectedProbabilityAnswers(prepared, answers) || !Object.values(answers).every(validProbabilityAnswer)) {
    emit({ kind: "evaluation-outcome", outcome: "invalid-response" })
    return { status: "backend" } as const
  }
  emit({
    kind: "validated-answers",
    answers: Object.entries(answers).map(([ruleId, answer]) => ({ ruleId, probability: answer.probability }))
  })
  const result = evaluateProbabilityAnswers(prepared, answers)
  if (result.status === "evaluated") emit({ kind: "interpreted-findings", findings: result.findings })
  emit({
    kind: "evaluation-outcome",
    outcome: result.status === "evaluated" ? (result.findings.length ? "findings" : "clear") : "invalid-response"
  })
  return result
}

const reportInputFailure = Effect.fn("DirectEvent.reportInputFailure")(function* (
  prepared: PreparedSource,
  failure: CandidateInputFailure,
  emit: (evidence: EvaluationEvidence) => void
) {
  const diagnostic = { stage: "provider-input" as const, ...failure }
  emit({ kind: "diagnostic", path: prepared.input.path, declaration: prepared.input.declaration.name, diagnostic })
  if (failure.code === "review-input-limit") {
    emit({ kind: "evaluation-outcome", outcome: "input-limit" })
    return { status: "input-limit" } as const
  }
  yield* Effect.logError("Hapsland review input assembly failed", {
    path: prepared.input.path,
    declaration: prepared.input.declaration.name,
    ...diagnostic
  })
  emit({ kind: "evaluation-outcome", outcome: "input-invalid" })
  return { status: "input-invalid" } as const
})

const evaluationEvidenceEmitter =
  (observe: ((evidence: EvaluationEvidence) => void) | undefined) =>
  (evidence: EvaluationEvidence): void => {
    try {
      observe?.(evidence)
    } catch {
      /* Optional evidence cannot change evaluation. */
    }
  }

const reportBackendFailure = (failure: unknown, emit: (evidence: EvaluationEvidence) => void) => {
  emit({ kind: "evaluation-outcome", outcome: invalidModelOutput(failure) ? "invalid-response" : "backend" })
  return { status: "backend" } as const
}

/** One DecisionModel call, no retry wrapper, with a fixed total call deadline. */
export const evaluatePrepared = Effect.fn("DirectEvent.evaluatePrepared")(function* (
  prepared: PreparedSource,
  beforeDispatch: Effect.Effect<void, unknown> = Effect.void,
  observe?: (evidence: EvaluationEvidence) => void
) {
  const emit = evaluationEvidenceEmitter(observe)

  let inputFailure: CandidateInputFailure | undefined
  const providerInput = preparedProviderInput(prepared, (failure) => {
    inputFailure = failure
  })
  const modelId = prepared.input.providerIdentity.model
  if (providerInput === undefined)
    return yield* reportInputFailure(
      prepared,
      inputFailure ?? { code: "review-input-invalid", args: { reason: "projection-invalid" } },
      emit
    )
  const violation = requestLimitViolation(modelId, probabilityRequest(modelId, providerInput, prepared.input.rules))
  if (violation === "invalid-input")
    return yield* reportInputFailure(
      prepared,
      { code: "review-input-invalid", args: { reason: "request-invalid" } },
      emit
    )
  if (violation !== undefined) {
    emit({ kind: "evaluation-outcome", outcome: "input-limit" })
    return { status: "input-limit" } as const
  }
  const decisions: Record<string, Decision.Probability> = {}
  for (const rule of prepared.input.rules) decisions[rule.id] = rule.decision
  const definition = Decision.make({ input: Schema.Json, decisions })
  const input = yield* Schema.decodeUnknownEffect(Schema.Json)(providerInput).pipe(Effect.orDie)
  const model = yield* DecisionModel.DecisionModel
  const evaluated = yield* beforeDispatch.pipe(
    Effect.andThen(
      Effect.suspend(() => {
        emit({ kind: "model-input", input })
        return model.decide(definition, { input })
      })
    ),
    Effect.timeoutOption(`${DIRECT_EVENT_DEADLINE_MS} millis`),
    Effect.result,
    Effect.onInterrupt(() => Effect.sync(() => emit({ kind: "evaluation-outcome", outcome: "interrupted" })))
  )
  if (Result.isFailure(evaluated)) return reportBackendFailure(evaluated.failure, emit)
  if (Option.isNone(evaluated.success)) {
    emit({ kind: "evaluation-outcome", outcome: "timeout" })
    return { status: "timeout" } as const
  }
  return interpretEvaluationAnswers(prepared, evaluated.success.value.answers, emit)
})

/** Core path consumes the one immutable observation produced at the host boundary. */
const beginObservationReview = Effect.fn("DirectEvent.beginObservationReview")(function* (
  observation: DirectObservation,
  context: DirectReviewContext
) {
  if (
    admitReview({
      rootValid: yield* verifyObservationRoot(observation),
      configurationValid: true,
      credentialReady: true,
      selected: true
    }) !== "admitReview"
  ) {
    return { status: "unsupported", output: undefined } satisfies DirectReviewResult
  }
  if (!context.controlledWriter || !sameAdvicee(observation.advicee, context.advicee)) {
    return { status: "unattributed", output: undefined } satisfies DirectReviewResult
  }
  yield* context.beforePrepare ?? Effect.void
  const prepared = yield* prepareObservation(observation, context)
  const ready = prepared.outcomes.filter(
    (outcome): outcome is Extract<PrepareOutcome, { status: "ready" }> => outcome.status === "ready"
  )
  if (ready.length === 0) {
    return { status: "no-advice", output: undefined } satisfies DirectReviewResult
  }
  return { status: "prepared" as const, ready }
})
const evaluateObservedUnit = Effect.fn("DirectEvent.evaluateObservedUnit")(function* (
  observation: DirectObservation,
  prepared: PreparedUnit,
  context: DirectReviewContext
) {
  yield* context.beforeDispatch ?? Effect.void
  const admission = admitReview({
    rootValid: yield* verifyObservationRoot(observation),
    configurationValid: true,
    credentialReady: true,
    selected: selectedByDirectFilePolicy(prepared.input.path, currentPolicy(context))
  })
  if (admission === "refuseRoot") {
    return { status: "root-stale" } as const
  }
  if (admission !== "admitReview") return { status: "skipped" } as const
  return yield* evaluatePrepared(prepared)
})
const evaluateObservationUnits = Effect.fn("DirectEvent.evaluateObservationUnits")(function* (
  observation: DirectObservation,
  ready: readonly Extract<PrepareOutcome, { readonly status: "ready" }>[],
  context: DirectReviewContext
) {
  const findings: Array<Finding> = []
  const evaluations: Array<EvaluatedUnit> = []
  let unavailable: "backend" | "timeout" | undefined
  for (const outcome of ready) {
    const evaluation = yield* evaluateObservedUnit(observation, outcome.prepared, context)
    if (evaluation.status === "root-stale") return { status: "root-stale" as const }
    if (evaluation.status !== "evaluated") {
      if (evaluation.status === "backend" || evaluation.status === "timeout") unavailable ??= evaluation.status
      continue
    }
    evaluations.push({ prepared: outcome.prepared, findings: evaluation.findings })
    findings.push(...evaluation.findings)
  }
  return { status: "evaluated" as const, findings, evaluations, unavailable }
})
const noObservationAdvice = (unavailable: "backend" | "timeout" | undefined): DirectReviewResult => {
  if (unavailable !== undefined) {
    return { status: "unavailable", reason: unavailable, output: undefined } satisfies DirectReviewResult
  }
  return { status: "no-advice", output: undefined } satisfies DirectReviewResult
}
const finishObservationPublication = Effect.fn("DirectEvent.finishObservationPublication")(function* (
  observation: DirectObservation,
  evaluations: readonly EvaluatedUnit[],
  context: DirectReviewContext
) {
  yield* context.beforeHandoff ?? Effect.void
  if (!context.controlledWriter || !sameAdvicee(observation.advicee, context.advicee)) {
    return { status: "unattributed", output: undefined } satisfies DirectReviewResult
  }
  const revalidated = yield* revalidateForPublication(observation, evaluations, context, undefined)
  if (revalidated.status !== "current" || revalidated.findings.length === 0) {
    return { status: "unavailable", reason: "stale", output: undefined } satisfies DirectReviewResult
  }
  return {
    status: "ready",
    findings: revalidated.findings,
    evaluations: revalidated.evaluations,
    output: toCodexDirectEventOutput(revalidated.findings)
  } satisfies DirectReviewResult
})

export const reviewObservation = Effect.fn("DirectEvent.reviewObservation")(function* (
  observation: DirectObservation,
  context: DirectReviewContext
) {
  const beginning = yield* beginObservationReview(observation, context)
  if (beginning.status !== "prepared") return beginning
  const evaluated = yield* evaluateObservationUnits(observation, beginning.ready, context)
  if (evaluated.status === "root-stale")
    return { status: "unavailable", reason: "stale", output: undefined } satisfies DirectReviewResult
  if (evaluated.findings.length === 0) return noObservationAdvice(evaluated.unavailable)
  return yield* finishObservationPublication(observation, evaluated.evaluations, context)
})

const evaluatedNames = (evaluations: readonly EvaluatedUnit[]): ReadonlyMap<string, ReadonlySet<string>> => {
  const frozenNames = new Map<string, Set<string>>()
  for (const evaluation of evaluations) {
    const input = evaluation.prepared.input
    const names = frozenNames.get(input.path) ?? new Set<string>()
    names.add(input.declaration.name)
    frozenNames.set(input.path, names)
  }
  return frozenNames
}
const retainMatchingEvaluations = (evaluations: readonly EvaluatedUnit[], current: readonly PreparedUnit[]) => {
  const retained: Array<EvaluatedUnit> = []
  let foundChangedInput = false
  for (const evaluation of evaluations) {
    const expected = evaluation.prepared.input
    const sameSubject = current.filter(
      (prepared) =>
        prepared.input.path === expected.path && prepared.input.declaration.name === expected.declaration.name
    )
    const matching = sameSubject.find(
      (prepared) => prepared.identity === evaluation.prepared.identity && sameInput(prepared.input, expected)
    )
    if (matching !== undefined) retained.push(evaluation)
    else if (sameSubject.length > 0) foundChangedInput = true
  }
  return { retained, foundChangedInput }
}
const publishRetainedEvaluations = Effect.fn("DirectEvent.publishRetainedEvaluations")(function* (
  retained: readonly EvaluatedUnit[],
  authority: ResidentPublicationAuthority | undefined
): Effect.fn.Return<RevalidationResult> {
  // Keep the scheduler-owned supersession check last: semantic capture does
  // not prove that a later accepted observation has not replaced this work.
  const publishable: Array<EvaluatedUnit> = []
  for (const evaluation of retained) {
    if (authority === undefined || (yield* authority.isCurrentWork(evaluation.prepared))) {
      publishable.push(evaluation)
    }
  }
  if (publishable.length === 0) return { status: "stale", findings: [] }
  return { status: "current", evaluations: publishable, findings: publishable.flatMap(({ findings }) => findings) }
})
const publicationAttributed = (
  observation: DirectObservation,
  evaluations: readonly EvaluatedUnit[],
  context: DirectReviewContext
): boolean =>
  context.controlledWriter &&
  sameAdvicee(observation.advicee, context.advicee) &&
  evaluations.every((evaluation) => preparedBelongsTo(evaluation.prepared, observation))
const validPublicationEvaluations = (evaluations: readonly EvaluatedUnit[]): boolean =>
  evaluations.length > 0 && evaluations.every(validEvaluation)

/**
 * Recheck delayed evaluations against current authority and complete canonical
 * inputs. A whole-file match is intentionally neither accepted nor consulted.
 */
const revalidateForPublication = Effect.fn("DirectEvent.revalidateForPublication")(function* (
  observation: DirectObservation,
  evaluations: ReadonlyArray<EvaluatedUnit>,
  context: DirectReviewContext,
  authority: ResidentPublicationAuthority | undefined
): Effect.fn.Return<RevalidationResult> {
  if (!publicationAttributed(observation, evaluations, context)) return { status: "unattributed", findings: [] }
  if (!validPublicationEvaluations(evaluations)) return { status: "unavailable", findings: [] }
  if (!(yield* verifyObservationRoot(observation))) {
    return { status: "unavailable", findings: [] }
  }
  const frozenNames = evaluatedNames(evaluations)
  const currentPrepared = yield* prepareObservation(observation, context, frozenNames)
  const current = currentPrepared.outcomes.flatMap((outcome) => (outcome.status === "ready" ? [outcome.prepared] : []))
  const { retained, foundChangedInput } = retainMatchingEvaluations(evaluations, current)
  if (retained.length > 0) {
    return yield* publishRetainedEvaluations(retained, authority)
  }
  return foundChangedInput ? { status: "stale", findings: [] } : { status: "unavailable", findings: [] }
})

/**
 * Resident publication always requires scheduler-owned supersession authority.
 * Immediate in-invocation review uses the private path above and cannot be
 * mistaken for authorization to publish delayed work.
 */
export const revalidateEvaluations = Effect.fn("DirectEvent.revalidateEvaluations")(function* (
  observation: DirectObservation,
  evaluations: ReadonlyArray<EvaluatedUnit>,
  context: DirectReviewContext,
  authority: ResidentPublicationAuthority
) {
  return yield* revalidateForPublication(observation, evaluations, context, authority)
})

/** Convenience boundary for non-CLI callers; adaptation still occurs exactly once. */
export const reviewCodexDirectEvent = Effect.fn("DirectEvent.reviewCodexDirectEvent")(function* (
  nativeEvent: unknown,
  context: DirectReviewContext
) {
  const observation = yield* adaptCodexDirectEvent(nativeEvent)
  if (observation === undefined) {
    return { status: "unsupported", output: undefined } satisfies DirectReviewResult
  }
  return yield* reviewObservation(observation, context)
})
