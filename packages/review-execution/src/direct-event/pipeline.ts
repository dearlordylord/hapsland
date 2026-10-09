import { DEFAULT_REVIEW_BACKEND } from "@hapsland/runtime-environment/runtime/backend"
import { isBundledArtifact, languageForPath } from "@hapsland/source-analysis/direct-event/languages/registry"
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
import type { CompiledRule } from "@hapsland/review-definition/rules/compiler"
import { applicableRules } from "../policy/rules.ts"
import { compareRuleRank, findingFromProbability } from "@hapsland/review-definition/rules/decision"
import { encodedProviderHttpBodyBytes } from "./provider-body-size.ts"
import { admitReview } from "@hapsland/runtime-inputs/configuration/decision"
import { providerIdentity } from "@hapsland/review-definition/review-providers/catalog"
import { probabilityRequest, requestLimitViolation } from "../review-providers/request.ts"
import { effectiveReviewBackend, effectiveGraphLimits } from "@hapsland/runtime-inputs/configuration/resolve"
import { GRAPH_LIMIT_CEILINGS, type GraphLimits } from "@hapsland/canonical-policy/canonical/graph-limits"
import { initialImportGraph, stepImportGraph } from "@hapsland/canonical-policy/canonical/graph-adapter"
import type { ReviewSettings } from "@hapsland/review-definition/runtime/review-config"
import { adaptCodexDirectEvent, verifyObservationRoot } from "@hapsland/native-observation/direct-event/adapter"
import { selectEditedRoots } from "@hapsland/native-observation/direct-event/edit-attribution"
import { verifyCodexPostEditHunks } from "@hapsland/native-observation/direct-event/codex-patch-hunks"
import { TYPE_INPUT_CONTRACT, FUNCTION_INPUT_CONTRACT } from "@hapsland/review-definition/rules/targets"
import { analyzeFunctionFile } from "@hapsland/source-analysis/direct-event/function-analyzer"
import {
  renderCandidateReviewInput,
  type CandidateReviewInput,
  type CandidateInputFailure,
  type ReportCandidateInputFailure
} from "./review-renderer.ts"
import {
  analyzeTypeFile,
  combinedAnalyzerMaterializationPreflight,
  type AnalyzerMaterializationPreflight,
  type TypeFileAnalysis,
  type UnitAnalysis,
  inspectGraphFile
} from "@hapsland/source-analysis/direct-event/analyzer"
import {
  observationCaptureBudgetRefusal,
  MAX_OBSERVATION_GRAPH_UNITS,
  resolveGraphUnit
} from "@hapsland/source-analysis/direct-event/graph-resolver"
import {
  captureStable,
  type CaptureHooks,
  type CaptureResult,
  type CaptureDiagnostic
} from "@hapsland/native-observation/direct-event/capture"
import {
  canonicalValue,
  freezeInput,
  freezeRules,
  semanticIdentity,
  type PreparedUnit,
  type ReviewInput,
  type ObservationResult,
  type MaterializationAdmission,
  type PreparationDiagnostic,
  type PathObservationOutcome
} from "@hapsland/review-definition/direct-event/model"
import { bundledArtifactDomain, type ReviewUnit } from "@hapsland/source-artifacts/direct-event/artifact-model"
import { type DirectObservation, type DirectAdvicee } from "@hapsland/native-observation/direct-event/observation"
import {
  DEFAULT_DIRECT_FILE_POLICY,
  type eligibleNamedPath,
  inspectNamedPath,
  resolvedDirectFilePolicy,
  selectedByDirectFilePolicy,
  type DirectFilePolicy
} from "@hapsland/native-observation/direct-event/selection"

export { checkHandoffSources, type HandoffSourceMember } from "./handoff-sources.ts"

assertReviewEngineBoundary("pipeline")

export const DIRECT_EVENT_DEADLINE_MS = 15_000 as const

export type DirectReviewContext = {
  /** Explicit operator/fixture authority. Never inferred from matching reads. */
  readonly controlledWriter: boolean
  /** The only advicee for whom this invocation may produce advice. */
  readonly advicee: DirectAdvicee
  readonly settings: Pick<ReviewSettings, "backend" | "destination"> &
    Partial<Pick<ReviewSettings, "configuration" | "rules" | "providerIdentity">>
  readonly policy?: DirectFilePolicy | (() => DirectFilePolicy)
  readonly rules?: ReadonlyArray<CompiledRule> | (() => ReadonlyArray<CompiledRule>)
  readonly inputContract?: string | (() => string)
  readonly captureHooks?: CaptureHooks
  /** Optional observation of the actual preparation refusal; never participates in review authority. */
  readonly observePreparationOmission?: (
    path: string,
    declaration: string,
    reason: "missing-evidence" | "no-applicable-rule"
  ) => void
  /** Supporting capture evidence; observing it never changes partial-graph authority. */
  readonly observeCaptureDiagnostic?: (candidatePath: string, sourcePath: string, diagnostic: CaptureDiagnostic) => void
  /** Fixture-only source effect; production uses the stable native capture. */
  readonly captureSource?: typeof captureStable
  /** Fixture-only graph clock for deterministic deadline checks. */
  readonly graphNow?: () => number
  readonly beforePrepare?: Effect.Effect<void>
  /** Reserve bounded analyzer/input materialization after capture, before parsing. */
  readonly beforeAnalyze?: (
    path: string,
    sourceBytes: number,
    preflight: AnalyzerMaterializationPreflight | undefined
  ) => Effect.Effect<MaterializationAdmission>
  readonly beforeDispatch?: Effect.Effect<void>
  readonly beforeHandoff?: Effect.Effect<void>
}

/** Source preparation has no authority to publish advice to an agent. */
export type PreparedSource = Omit<PreparedUnit, "advicee">
type SourcePrepareOutcome =
  | { readonly status: "ready"; readonly path: string; readonly prepared: PreparedSource }
  | { readonly status: "skipped"; readonly path: string }
type PreparedSourceObservation = {
  readonly observation: ObservationResult
  readonly outcomes: ReadonlyArray<SourcePrepareOutcome>
}
export type SourceLineRequest = Pick<DirectObservation, "root" | "rootIdentity"> & {
  readonly path: string
  readonly line: number
}
type PreparationObservation = Omit<DirectObservation, "advicee"> & {
  readonly advicee?: DirectAdvicee
  readonly lineSelection?: { readonly line: number; readonly roots: Set<string> }
}
export type SourcePreparationContext = Omit<DirectReviewContext, "controlledWriter" | "advicee">

export type PrepareOutcome =
  | { readonly status: "ready"; readonly path: string; readonly prepared: PreparedUnit }
  | { readonly status: "skipped"; readonly path: string }

export type PreparedObservation = {
  readonly observation: ObservationResult
  readonly outcomes: ReadonlyArray<PrepareOutcome>
}

/** Complete evaluated inputs retained until handoff; digests alone are not freshness. */
export type EvaluatedUnit = { readonly prepared: PreparedUnit; readonly findings: ReadonlyArray<Finding> }

export type RevalidationResult =
  | {
      readonly status: "current"
      readonly evaluations: ReadonlyArray<EvaluatedUnit>
      readonly findings: ReadonlyArray<Finding>
    }
  | { readonly status: "stale"; readonly findings: readonly [] }
  | { readonly status: "unavailable"; readonly findings: readonly [] }
  | { readonly status: "unattributed"; readonly findings: readonly [] }

/**
 * Publication authority is explicit because semantic equality cannot prove
 * that a later resident observation has not superseded completed work.
 */
export type ResidentPublicationAuthority = {
  readonly isCurrentWork: (prepared: PreparedUnit) => Effect.Effect<boolean>
}

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

const unitHasOmissions = (unit: ReviewUnit): boolean => {
  const pending = [unit.root]
  while (pending.length > 0) {
    const node = pending.pop()
    if (node === undefined) continue
    for (const reference of node.references) {
      if (reference.kind === "omitted") return true
      if (reference.kind === "expanded") pending.push(reference.node)
    }
  }
  return false
}

const addNodeDependency = (unit: ReviewUnit, node: ReviewUnit["root"], paths: Set<string>): boolean => {
  if (node.artifact.origin !== undefined) return node !== unit.root && isBundledArtifact(node.artifact)
  if (node.artifact.path === undefined) return false
  paths.add(node.artifact.path)
  return true
}
const unitDependencyPaths = (unit: ReviewUnit): ReadonlySet<string> | undefined => {
  const paths = new Set<string>(unit.sourceDependencies ?? [])
  const pending = [unit.root]
  while (pending.length > 0) {
    const node = pending.pop()
    if (node === undefined) return undefined
    if (!addNodeDependency(unit, node, paths)) return undefined
    for (const reference of node.references) if (reference.kind === "expanded") pending.push(reference.node)
  }
  return paths
}
const unitSourceFingerprints = (
  unit: ReviewUnit,
  captures: ReadonlyMap<string, import("@hapsland/native-observation/direct-event/capture").StableCapture>
): ReviewInput["sourceFingerprints"] | undefined => {
  const paths = unitDependencyPaths(unit)
  if (paths === undefined) return undefined
  const fingerprints = [...paths].sort().map((path) => {
    const capture = captures.get(path)
    return capture === undefined
      ? undefined
      : { path, contentHash: capture.contentHash, byteLength: capture.byteLength }
  })
  return fingerprints.every((item): item is NonNullable<typeof item> => item !== undefined) ? fingerprints : undefined
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

const currentRules = (context: SourcePreparationContext): ReadonlyArray<CompiledRule> =>
  context.rules === undefined ? (context.settings.rules ?? []) : current(context.rules)

const currentInputContract = (context: SourcePreparationContext): string =>
  context.inputContract === undefined ? TYPE_INPUT_CONTRACT : current(context.inputContract)

const analysisRoot = (analysis: UnitAnalysis) =>
  analysis.status === "ready" ? analysis.unit.root.artifact : analysis.root

type AnalysisFailure = Extract<
  Extract<PathObservationOutcome, { status: "observed" }>["analysis"],
  { status: "incomplete" }
>["failures"][number]

const extractionFailures = (analysis: TypeFileAnalysis): ReadonlyArray<AnalysisFailure> => {
  if (analysis.status === "unsupported") {
    return [{ root: undefined, reason: analysis.reason }]
  }
  return analysis.units.flatMap((outcome) =>
    outcome.status === "unsupported" ? [{ root: outcome.root.name, reason: outcome.reason }] : []
  )
}

/** Ask the checked graph policy about measured root bytes before native parsing. */
export const measuredRootSourceDecision = (sourceBytes: number, limits: GraphLimits) =>
  stepImportGraph(initialImportGraph(limits), { kind: "root", target: 1, sourceBytes, treeBytes: 0, edges: [] }).command

type PreparationFrame = {
  readonly observation: PreparationObservation
  readonly context: SourcePreparationContext
  readonly contract: string
  readonly graphLimits: GraphLimits
  readonly supportingCaptures: Map<string, import("@hapsland/native-observation/direct-event/capture").StableCapture>
  readonly selectedCount: { value: number }
}
type CandidateDeclaration = {
  readonly artifact: ReviewUnit["root"]["artifact"]
  readonly location: NonNullable<ReviewInput["rootLocation"]>
}
const graphResolutionOptions = (frame: PreparationFrame, candidatePath: string) => ({
  root: frame.observation.root,
  rootIdentity: frame.observation.rootIdentity,
  policy: currentPolicy(frame.context),
  limits: frame.graphLimits,
  ...(frame.contract === FUNCTION_INPUT_CONTRACT ? { branch: "function" as const } : {}),
  captureCache: frame.supportingCaptures,
  ...(frame.context.graphNow === undefined ? {} : { now: frame.context.graphNow }),
  ...(frame.context.captureHooks === undefined ? {} : { captureHooks: frame.context.captureHooks }),
  ...(frame.context.captureSource === undefined ? {} : { captureSource: frame.context.captureSource }),
  ...(frame.context.observeCaptureDiagnostic === undefined
    ? {}
    : {
        observeCaptureDiagnostic: (sourcePath: string, diagnostic: CaptureDiagnostic) =>
          frame.context.observeCaptureDiagnostic?.(candidatePath, sourcePath, diagnostic)
      })
})
const resolveSelectedUnits = Effect.fn("DirectEvent.resolveSelectedUnits")(function* (
  selected: readonly UnitAnalysis[],
  path: string,
  captured: import("@hapsland/native-observation/direct-event/capture").StableCapture,
  analysis: TypeFileAnalysis,
  frame: PreparationFrame
) {
  const units: ReviewUnit[] = []
  const graphFailures: AnalysisFailure[] = []
  for (const item of selected) {
    const root = analysisRoot(item)
    if (frame.selectedCount.value >= MAX_OBSERVATION_GRAPH_UNITS) {
      graphFailures.push({ root: root.name, reason: "reference-limit" })
      continue
    }
    frame.selectedCount.value += 1
    const unit = yield* resolveGraphUnit(path, captured, root.name, graphResolutionOptions(frame, path))
    if (unit === undefined) {
      graphFailures.push({ root: root.name, reason: missingGraphRootReason(analysis, root.name) })
    } else {
      units.push(unit)
      if (unitHasOmissions(unit)) graphFailures.push({ root: root.name, reason: "missing-evidence" })
    }
  }
  return { units, graphFailures }
})
const preparationCapabilities = (contract: string, partial: boolean) => {
  return contract === TYPE_INPUT_CONTRACT
    ? partial
      ? (["root-declaration"] as const)
      : (["root-declaration", "resolved-outbound-types", "selected-source-type-closure"] as const)
    : contract === FUNCTION_INPUT_CONTRACT
      ? partial
        ? (["signature", "body"] as const)
        : (["signature", "body", "resolved-local-calls", "resolved-outbound-types"] as const)
      : undefined
}
const freezePreparedUnitInput = (
  path: string,
  unit: ReviewUnit,
  rules: readonly CompiledRule[],
  rootLocation: ReviewInput["rootLocation"],
  sourceFingerprints: NonNullable<ReviewInput["sourceFingerprints"]>,
  frame: PreparationFrame,
  partial: boolean,
  language: "typescript" | "rust" | "bend"
): ReviewInput => {
  const declaration = unit.root.artifact
  const artifactKind = declaration.kind === "function" ? ("function" as const) : ("typeShape" as const)
  return freezeInput({
    contract: frame.contract,
    providerIdentity:
      frame.context.settings.configuration !== undefined
        ? providerIdentity(effectiveReviewBackend(frame.context.settings.configuration.policy))
        : (frame.context.settings.providerIdentity ?? providerIdentity(DEFAULT_REVIEW_BACKEND)),
    graphLimits: frame.graphLimits,
    candidateProjection: true,
    ...(rootLocation === undefined ? {} : { rootLocation }),
    sourceFingerprints,
    completeness: partial ? "incomplete-irrelevant" : "complete",
    path,
    declaration,
    unit,
    rules: freezeRules(rules, { language, artifactKind, inputContract: frame.contract }),
    interpretation: "probability-strictly-greater-than-threshold"
  } satisfies ReviewInput)
}
const supportedRuleLanguage = (language: string | undefined): language is "typescript" | "rust" | "bend" =>
  language === "typescript" || language === "rust" || language === "bend"
const missingRequiredRootLocation = (contract: string, location: ReviewInput["rootLocation"]): boolean =>
  isGraphInputContract(contract) && location === undefined
const prepareResolvedUnit = (
  unit: ReviewUnit,
  candidateDeclarations: readonly CandidateDeclaration[],
  path: string,
  frame: PreparationFrame
): SourcePrepareOutcome | undefined => {
  const declaration = unit.root.artifact
  const omitted = (reason: "missing-evidence" | "no-applicable-rule") => {
    try {
      frame.context.observePreparationOmission?.(path, declaration.name, reason)
    } catch {
      /* Optional evidence cannot refuse review. */
    }
    return undefined
  }
  const rootLocation = candidateRootLocation(frame.contract, declaration, candidateDeclarations)
  if (missingRequiredRootLocation(frame.contract, rootLocation)) return omitted("missing-evidence")
  const sourceFingerprints = unitSourceFingerprints(unit, frame.supportingCaptures)
  if (sourceFingerprints === undefined) return omitted("missing-evidence")
  const artifactKind = declaration.kind === "function" ? ("function" as const) : ("typeShape" as const)
  const partial = unitHasOmissions(unit)
  const capabilities = preparationCapabilities(frame.contract, partial)
  const language = languageForPath(path)?.id
  if (!supportedRuleLanguage(language)) return undefined
  const rules = applicableRules(declaration.source, path, currentRules(frame.context), {
    language,
    artifactKind,
    inputContract: frame.contract,
    complete: true,
    ...(capabilities === undefined ? {} : { capabilities })
  })
  if (rules.length === 0) return omitted("no-applicable-rule")
  const input = freezePreparedUnitInput(path, unit, rules, rootLocation, sourceFingerprints, frame, partial, language)
  return { status: "ready", path, prepared: { root: frame.observation.root, input, identity: semanticIdentity(input) } }
}
const prepareReadyUnits = (
  units: readonly ReviewUnit[],
  candidateDeclarations: readonly CandidateDeclaration[],
  path: string,
  frame: PreparationFrame
): SourcePrepareOutcome[] => {
  const outcomes: SourcePrepareOutcome[] = []
  for (const unit of units) {
    const ready = prepareResolvedUnit(unit, candidateDeclarations, path, frame)
    if (ready !== undefined) outcomes.push(ready)
  }
  return outcomes
}

type EligiblePreparationPath = NonNullable<Effect.Success<ReturnType<typeof eligibleNamedPath>>>
const captureCandidateRoot = Effect.fn("DirectEvent.captureCandidateRoot")(function* (
  eligible: EligiblePreparationPath,
  graphContract: boolean,
  frame: PreparationFrame
): Effect.fn.Return<CaptureResult> {
  let captured = frame.supportingCaptures.get(eligible.relativePath)
  if (captured === undefined) {
    const refusal = observationCaptureBudgetRefusal(frame.supportingCaptures, eligible.relativePath)
    if (refusal !== undefined) return { status: "unavailable", diagnostic: refusal }
    const result = yield* (frame.context.captureSource ?? captureStable)(
      frame.observation.root,
      eligible,
      frame.context.captureHooks,
      frame.observation.rootIdentity,
      graphContract ? frame.graphLimits.sourceBytes : undefined
    )
    if (result.status === "unavailable") return result
    captured = result.capture
    frame.supportingCaptures.set(eligible.relativePath, captured)
  }
  return { status: "captured", capture: captured }
})
const admitCandidateMaterialization = Effect.fn("DirectEvent.admitCandidateMaterialization")(function* (
  path: string,
  captured: import("@hapsland/native-observation/direct-event/capture").StableCapture,
  context: SourcePreparationContext,
  materializedPaths: Set<string>,
  rejectedPaths: Map<string, Extract<MaterializationAdmission, { status: "refused" }>>
): Effect.fn.Return<MaterializationAdmission> {
  const prior = rejectedPaths.get(path)
  if (prior !== undefined) return prior
  if (!materializedPaths.has(path) && context.beforeAnalyze !== undefined) {
    const admission = yield* context.beforeAnalyze(
      path,
      captured.byteLength,
      combinedAnalyzerMaterializationPreflight(path, captured.text)
    )
    if (admission.status === "refused") {
      rejectedPaths.set(path, admission)
      return admission
    }
  }
  materializedPaths.add(path)
  return { status: "admitted" }
})
const candidatePostEditHunks = (
  observation: PreparationObservation,
  candidate: Pick<PreparationObservation["candidates"][number], "operation">,
  path: string,
  captured: import("@hapsland/native-observation/direct-event/capture").StableCapture
) => {
  const claudeHunks = observation.verifiedPostEditHunks
  return candidate.operation === "update" &&
    claudeHunks?.path === path &&
    claudeHunks.contentHash === captured.contentHash
    ? claudeHunks.hunks
    : candidate.operation === "update" && observation.nativePatchCommand !== undefined
      ? verifyCodexPostEditHunks(observation.nativePatchCommand, path, captured.text)
      : candidate.operation === "add"
        ? []
        : undefined
}
const selectCandidateRoots = (
  observation: PreparationObservation,
  candidate: { readonly operation: "add" | "update" },
  path: string,
  captured: import("@hapsland/native-observation/direct-event/capture").StableCapture,
  candidateDeclarations: readonly CandidateDeclaration[],
  analyses: readonly UnitAnalysis[]
) => {
  const hunks = candidatePostEditHunks(observation, candidate, path, captured)
  if (hunks === undefined) return { selected: [] as UnitAnalysis[], ambiguous: true }
  const declarations = candidateDeclarations.map(({ artifact, location }) => ({
    path,
    kind: artifact.kind,
    name: artifact.name,
    location
  }))
  try {
    const attribution = selectEditedRoots(
      { path, operation: candidate.operation, source: captured.text },
      hunks,
      declarations
    )
    const roots = new Set(attribution.selected.map((root) => `${root.kind}:${root.name}`))
    return {
      selected: analyses.filter((item) => {
        const root = analysisRoot(item)
        return roots.has(`${root.kind}:${root.name}`)
      }),
      ambiguous: attribution.ambiguous.length > 0
    }
  } catch {
    return { selected: [] as UnitAnalysis[], ambiguous: true }
  }
}

const capturedCandidateFiles = (
  path: string,
  captured: import("@hapsland/native-observation/direct-event/capture").StableCapture,
  limits: GraphLimits
) => {
  if (captured.byteLength > limits.sourceBytes) return { functionFile: undefined, graphFile: undefined }
  return { functionFile: analyzeFunctionFile(path, captured.text), graphFile: inspectGraphFile(path, captured.text) }
}
const unresolvedUnitAnalyses = (declarations: readonly CandidateDeclaration[]): UnitAnalysis[] =>
  declarations.map(({ artifact }) => ({
    status: "unsupported",
    root: artifact,
    unit: { root: { artifact, references: [] } },
    reason: "missing-evidence"
  }))
const missingGraphRootReason = (analysis: TypeFileAnalysis, name: string): AnalysisFailure["reason"] => {
  const prior =
    analysis.status === "analyzed" ? analysis.units.find((entry) => analysisRoot(entry).name === name) : undefined
  return prior?.status === "unsupported" && prior.reason === "reference-limit" ? "reference-limit" : "missing-evidence"
}
const candidateRootLocation = (
  contract: string,
  declaration: ReviewUnit["root"]["artifact"],
  candidateDeclarations: readonly CandidateDeclaration[]
): ReviewInput["rootLocation"] => {
  return contract === TYPE_INPUT_CONTRACT || contract === FUNCTION_INPUT_CONTRACT
    ? candidateDeclarations.find(
        (candidate) => candidate.artifact.kind === declaration.kind && candidate.artifact.name === declaration.name
      )?.location
    : undefined
}
const isGraphInputContract = (contract: string): boolean =>
  contract === TYPE_INPUT_CONTRACT || contract === FUNCTION_INPUT_CONTRACT

const hasVerifiedClaudeSpan = (observation: PreparationObservation, path: string): boolean =>
  observation.advicee?.host === "claude-code" &&
  observation.verifiedPostEditHunks?.path === path &&
  observation.verifiedPostEditHunks.hunks.length > 0
const metadataOnlyCandidate = (
  candidate: PreparationObservation["candidates"][number],
  observation: PreparationObservation
): boolean =>
  candidate.operation === "update" &&
  !candidate.addedLines.some((line) => line.trim().length > 0) &&
  !hasVerifiedClaudeSpan(observation, candidate.path)
const selectCapturedCandidate = (
  frame: PreparationFrame,
  candidateOperation: "add" | "update",
  path: string,
  captured: import("@hapsland/native-observation/direct-event/capture").StableCapture,
  candidateDeclarations: readonly CandidateDeclaration[],
  analyses: readonly UnitAnalysis[],
  frozen: ReadonlySet<string> | undefined
) => {
  if (frame.observation.lineSelection !== undefined) {
    const { line, roots } = frame.observation.lineSelection
    const matching = candidateDeclarations.filter(
      ({ location }) =>
        line >= location.start.line &&
        (line < location.end.line || (line === location.end.line && location.end.column > 1))
    )
    for (const declaration of matching) roots.add(declaration.artifact.id)
    if (matching.length !== 1) return { selected: [] as UnitAnalysis[], ambiguous: matching.length > 1 }
    const selected = matching[0]!
    return { selected: analyses.filter((item) => analysisRoot(item).id === selected.artifact.id), ambiguous: false }
  }
  if (frozen !== undefined)
    return { selected: analyses.filter((item) => frozen.has(analysisRoot(item).name)), ambiguous: false }
  if (!isGraphInputContract(frame.contract) || candidateDeclarations.length === 0)
    return { selected: [] as UnitAnalysis[], ambiguous: false }
  return selectCandidateRoots(
    frame.observation,
    { operation: candidateOperation },
    path,
    captured,
    candidateDeclarations,
    analyses
  )
}
const positionBefore = (
  left: NonNullable<ReviewInput["rootLocation"]>["start"],
  right: NonNullable<ReviewInput["rootLocation"]>["start"]
): boolean => left.line < right.line || (left.line === right.line && left.column < right.column)
const locationsOverlap = (
  left: NonNullable<ReviewInput["rootLocation"]>,
  right: NonNullable<ReviewInput["rootLocation"]>
): boolean => positionBefore(left.start, right.end) && positionBefore(right.start, left.end)
const functionExclusionSelection = (
  file: NonNullable<ReturnType<typeof analyzeFunctionFile>>,
  frame: PreparationFrame,
  operation: "add" | "update",
  path: string,
  captured: import("@hapsland/native-observation/direct-event/capture").StableCapture,
  frozen: ReadonlySet<string> | undefined
) => {
  if (frozen !== undefined) return { names: frozen, ambiguous: false }
  const declarations = [...file.excludedFunctions].map(([name, value]) => ({
    path,
    kind: "function" as const,
    name,
    location: value.location
  }))
  const line = frame.observation.lineSelection?.line
  if (line !== undefined)
    return {
      names: new Set(
        declarations
          .filter(
            ({ location }) =>
              line >= location.start.line &&
              (line < location.end.line || (line === location.end.line && location.end.column > 1))
          )
          .map(({ name }) => name)
      ),
      ambiguous: false
    }
  const hunks = candidatePostEditHunks(frame.observation, { operation }, path, captured)
  if (hunks === undefined) return { names: new Set<string>(), ambiguous: false }
  const selection = selectEditedRoots({ path, operation, source: captured.text }, hunks, declarations)
  return {
    names: new Set(selection.selected.map(({ name }) => name)),
    ambiguous: selection.ambiguous.some(({ location }) =>
      declarations.some((declaration) => locationsOverlap(location, declaration.location))
    )
  }
}
const functionExtractionFailures = (
  file: ReturnType<typeof analyzeFunctionFile>,
  frame: PreparationFrame,
  operation: "add" | "update",
  path: string,
  captured: import("@hapsland/native-observation/direct-event/capture").StableCapture,
  frozen: ReadonlySet<string> | undefined
): readonly AnalysisFailure[] => {
  if (file === undefined) return [{ root: undefined, reason: "function-analysis-unavailable" }]
  if (file.failure !== undefined) return [{ root: undefined, reason: file.failure }]
  const { names, ambiguous } = functionExclusionSelection(file, frame, operation, path, captured, frozen)
  const failures: AnalysisFailure[] = [...file.excludedFunctions].flatMap(([name, value]) =>
    names.has(name) ? [{ root: name, reason: value.reason }] : []
  )
  if (ambiguous && failures.length === 0) failures.push({ root: undefined, reason: "unsupported-callable" })
  if (file.functions.size === 0 && failures.length === 0)
    failures.push({ root: undefined, reason: "no-supported-function-root" })
  return failures
}
const hasCapturedGraph = ({ functionFile, graphFile }: ReturnType<typeof capturedCandidateFiles>): boolean =>
  graphFile !== undefined ||
  (functionFile !== undefined && functionFile.functions.size > 0 && functionFile.types.size === 0)
const resolveCapturedCandidate = Effect.fn("DirectEvent.resolveCapturedCandidate")(function* (
  candidateOperation: "add" | "update",
  path: string,
  captured: import("@hapsland/native-observation/direct-event/capture").StableCapture,
  frame: PreparationFrame,
  frozen: ReadonlySet<string> | undefined
) {
  const files = capturedCandidateFiles(path, captured, frame.graphLimits)
  const { functionFile, graphFile } = files
  const analysis = analyzeTypeFile(path, captured.text, hasCapturedGraph(files))
  const candidateDeclarations = candidateDeclarationsForFiles(files, frame.contract)
  const analyses = unresolvedUnitAnalyses(candidateDeclarations)
  const selection = selectCapturedCandidate(
    frame,
    candidateOperation,
    path,
    captured,
    [...(graphFile?.declarations.values() ?? []), ...(functionFile?.functions.values() ?? [])],
    analyses,
    frozen
  )
  const selected = selection.selected
  const { units, graphFailures } = yield* resolveSelectedUnits(selected, path, captured, analysis, frame)
  const failures = [
    ...(frame.contract === FUNCTION_INPUT_CONTRACT
      ? functionExtractionFailures(functionFile, frame, candidateOperation, path, captured, frozen)
      : graphFile === undefined
        ? extractionFailures(analysis)
        : []),
    ...graphFailures,
    ...(selection.ambiguous ? [{ root: undefined, reason: "ambiguous-update" as const }] : [])
  ]
  return { units, failures, candidateDeclarations }
})
type PreparedCandidate = {
  readonly outcomes: readonly SourcePrepareOutcome[]
  readonly pathOutcomes: readonly PathObservationOutcome[]
  readonly units: readonly ReviewUnit[]
}
const skippedCandidate = (
  path: string,
  reason?: Extract<PathObservationOutcome, { readonly status: "incomplete"; readonly diagnostic?: never }>["reason"]
): PreparedCandidate => ({
  outcomes: [{ status: "skipped", path }],
  units: [],
  pathOutcomes: reason === undefined ? [] : [{ status: "incomplete", path, reason }]
})

const refusedCandidate = (path: string, diagnostic: CaptureDiagnostic | PreparationDiagnostic): PreparedCandidate => ({
  units: [],
  outcomes: [{ status: "skipped", path }],
  pathOutcomes: [{ status: "incomplete", path, diagnostic }]
})
const frozenCandidateNames = (frozenNames: ReadonlyMap<string, ReadonlySet<string>> | undefined, path: string) => {
  const frozen = frozenNames?.get(path)
  if (frozenNames !== undefined && frozen === undefined) {
    return { included: false as const }
  }
  return { included: true as const, frozen }
}
const eligibleCandidate = Effect.fn("DirectEvent.eligibleCandidate")(function* (
  candidate: PreparationObservation["candidates"][number],
  observation: PreparationObservation,
  context: SourcePreparationContext,
  frozenNames: ReadonlyMap<string, ReadonlySet<string>> | undefined
) {
  if (candidate.operation === "delete" || candidate.operation === "move") {
    return { status: "skipped" as const, result: skippedCandidate(candidate.path, "unsupported-operation") }
  }
  // Claude's verified post-edit span can prove a real edit even when the
  // same line already exists elsewhere; Codex still needs changed lines.
  if (metadataOnlyCandidate(candidate, observation))
    return { status: "skipped" as const, result: skippedCandidate(candidate.path, "metadata-only") }
  const admission = yield* inspectNamedPath(
    observation.root,
    candidate.path,
    currentPolicy(context),
    observation.rootIdentity
  )
  if (admission.status === "denied") {
    return { status: "skipped" as const, result: skippedCandidate(candidate.path, admission.reason) }
  }
  const eligible = admission.path
  const selection = frozenCandidateNames(frozenNames, eligible.relativePath)
  if (!selection.included) return { status: "skipped" as const, result: skippedCandidate(eligible.relativePath) }
  return { status: "eligible" as const, eligible, frozen: selection.frozen, operation: candidate.operation }
})
const completedCandidate = Effect.fn("DirectEvent.completedCandidate")(function* (
  operation: "add" | "update",
  path: string,
  captured: import("@hapsland/native-observation/direct-event/capture").StableCapture,
  frame: PreparationFrame,
  frozen: ReadonlySet<string> | undefined
): Effect.fn.Return<PreparedCandidate> {
  const { units, failures, candidateDeclarations } = yield* resolveCapturedCandidate(
    operation,
    path,
    captured,
    frame,
    frozen
  )
  const observed: PathObservationOutcome = {
    status: "observed",
    path,
    snapshot: { path, operation, sourceHash: captured.contentHash },
    units,
    analysis: failures.length === 0 ? { status: "complete" } : { status: "incomplete", failures }
  }
  return {
    pathOutcomes: [observed],
    units,
    outcomes:
      units.length === 0 ? [{ status: "skipped", path }] : prepareReadyUnits(units, candidateDeclarations, path, frame)
  }
})

const prepareCandidate = Effect.fn("DirectEvent.prepareCandidate")(function* (
  candidate: PreparationObservation["candidates"][number],
  observation: PreparationObservation,
  context: SourcePreparationContext,
  contract: string,
  supportingCaptures: PreparationFrame["supportingCaptures"],
  materializedPaths: Set<string>,
  rejectedPaths: Map<string, Extract<MaterializationAdmission, { status: "refused" }>>,
  selectedCount: PreparationFrame["selectedCount"],
  frozenNames: ReadonlyMap<string, ReadonlySet<string>> | undefined
): Effect.fn.Return<PreparedCandidate> {
  const eligibility = yield* eligibleCandidate(candidate, observation, context, frozenNames)
  if (eligibility.status === "skipped") return eligibility.result
  const { eligible, frozen, operation } = eligibility
  const graphLimits =
    context.settings.configuration === undefined
      ? GRAPH_LIMIT_CEILINGS
      : effectiveGraphLimits(context.settings.configuration.policy)
  const graphContract = isGraphInputContract(contract)
  const frame: PreparationFrame = { observation, context, contract, graphLimits, supportingCaptures, selectedCount }
  const captureResult = yield* captureCandidateRoot(eligible, graphContract, frame)
  if (captureResult.status === "unavailable") return refusedCandidate(eligible.relativePath, captureResult.diagnostic)
  const captured = captureResult.capture
  if (graphContract) {
    // Stable capture has measured the root. Bend owns the configured source
    // limit; a denied root never reaches parser/preflight materialization.
    const decision = measuredRootSourceDecision(captured.byteLength, graphLimits)
    if (decision.kind !== "none") {
      const denied: PathObservationOutcome = {
        status: "observed",
        path: eligible.relativePath,
        snapshot: { path: eligible.relativePath, operation, sourceHash: captured.contentHash },
        units: [],
        analysis: { status: "incomplete", failures: [{ root: undefined, reason: "missing-evidence" }] }
      }
      return { outcomes: [{ status: "skipped", path: eligible.relativePath }], pathOutcomes: [denied], units: [] }
    }
  }
  const admission = yield* admitCandidateMaterialization(
    eligible.relativePath,
    captured,
    context,
    materializedPaths,
    rejectedPaths
  )
  if (admission.status === "refused") return refusedCandidate(eligible.relativePath, admission.diagnostic)
  return yield* completedCandidate(operation, eligible.relativePath, captured, frame, frozen)
})

const candidateDeclarationsForFiles = (
  files: ReturnType<typeof capturedCandidateFiles>,
  contract: string
): readonly CandidateDeclaration[] => {
  return contract === FUNCTION_INPUT_CONTRACT
    ? [...(files.functionFile?.functions.values() ?? [])]
    : [...(files.graphFile?.declarations.values() ?? [])]
}
type ObservedPathOutcome = Extract<PathObservationOutcome, { readonly status: "observed" }>
const mergePathAnalysis = (
  prior: ObservedPathOutcome["analysis"],
  current: ObservedPathOutcome["analysis"]
): ObservedPathOutcome["analysis"] => {
  if (prior.status === "complete" && current.status === "complete") return { status: "complete" }
  return {
    status: "incomplete",
    failures: [
      ...(prior.status === "incomplete" ? prior.failures : []),
      ...(current.status === "incomplete" ? current.failures : [])
    ]
  }
}
const mergePathOutcome = (
  prior: PathObservationOutcome | undefined,
  current: PathObservationOutcome
): PathObservationOutcome => {
  if (prior === undefined) return current
  if (prior.status !== "observed" || current.status !== "observed")
    return prior.status === "incomplete" ? prior : current
  return {
    ...prior,
    units: [...prior.units, ...current.units],
    analysis: mergePathAnalysis(prior.analysis, current.analysis)
  }
}
const mergePreparedSourceObservations = (branches: readonly PreparedSourceObservation[]): PreparedSourceObservation => {
  const ready = branches.flatMap((branch) =>
    branch.outcomes.filter(
      (item): item is Extract<SourcePrepareOutcome, { status: "ready" }> => item.status === "ready"
    )
  )
  const byPath = new Map<string, PathObservationOutcome>()
  for (const branch of branches)
    for (const outcome of branch.observation.outcomes) {
      byPath.set(outcome.path, mergePathOutcome(byPath.get(outcome.path), outcome))
    }
  const pathOutcomes = [...byPath.values()]
  const readyPaths = new Set(ready.map((item) => item.path))
  const outcomes: SourcePrepareOutcome[] = [
    ...ready,
    ...pathOutcomes.flatMap((item) =>
      readyPaths.has(item.path) ? [] : [{ status: "skipped" as const, path: item.path }]
    )
  ]
  const units = branches.flatMap((branch) =>
    branch.observation.status === "complete" ? branch.observation.changeSet.units : branch.observation.units
  )
  const complete = pathOutcomes.every((item) => item.status === "observed" && item.analysis.status === "complete")
  return {
    observation: complete
      ? {
          status: "complete" as const,
          changeSet: {
            status: "complete" as const,
            changes: pathOutcomes.flatMap((item) => (item.status === "observed" ? [item.snapshot] : [])),
            units
          },
          outcomes: pathOutcomes
        }
      : { status: "incomplete" as const, outcomes: pathOutcomes, units },
    outcomes
  } satisfies PreparedSourceObservation
}

const prepareObservationForContract = Effect.fn("DirectEvent.prepareObservationForContract")(function* (
  observation: PreparationObservation,
  context: SourcePreparationContext,
  contract: string,
  supportingCaptures: Map<string, import("@hapsland/native-observation/direct-event/capture").StableCapture>,
  materializedPaths: Set<string>,
  rejectedPaths: Map<string, Extract<MaterializationAdmission, { status: "refused" }>>,
  selectedCount: { value: number },
  frozenNames: ReadonlyMap<string, ReadonlySet<string>> | undefined = undefined
) {
  const outcomes: Array<SourcePrepareOutcome> = []
  const pathOutcomes: Array<PathObservationOutcome> = []
  const observedUnits: Array<ReviewUnit> = []
  for (const candidate of observation.candidates) {
    const prepared = yield* prepareCandidate(
      candidate,
      observation,
      context,
      contract,
      supportingCaptures,
      materializedPaths,
      rejectedPaths,
      selectedCount,
      frozenNames
    )
    outcomes.push(...prepared.outcomes)
    pathOutcomes.push(...prepared.pathOutcomes)
    observedUnits.push(...prepared.units)
  }
  const complete = pathOutcomes.every(
    (outcome) => outcome.status === "observed" && outcome.analysis.status === "complete"
  )
  const result: ObservationResult = complete
    ? {
        status: "complete",
        changeSet: {
          status: "complete",
          changes: pathOutcomes.flatMap((outcome) => (outcome.status === "observed" ? [outcome.snapshot] : [])),
          units: observedUnits
        },
        outcomes: pathOutcomes
      }
    : { status: "incomplete", outcomes: pathOutcomes, units: observedUnits }
  return { observation: result, outcomes } satisfies PreparedSourceObservation
})

/** One observation can yield type and function review units under distinct input contracts. */
const prepareSourceObservation = Effect.fn("DirectEvent.prepareSourceObservation")(function* (
  observation: PreparationObservation,
  context: SourcePreparationContext,
  frozenNames: ReadonlyMap<string, ReadonlySet<string>> | undefined = undefined
) {
  const captures = new Map<string, import("@hapsland/native-observation/direct-event/capture").StableCapture>()
  const materializedPaths = new Set<string>()
  const rejectedPaths = new Map<string, Extract<MaterializationAdmission, { status: "refused" }>>()
  const selectedCount = { value: 0 }
  const requested =
    context.inputContract === undefined
      ? [TYPE_INPUT_CONTRACT, FUNCTION_INPUT_CONTRACT]
      : [currentInputContract(context)]
  const branches: PreparedSourceObservation[] = []
  for (const contract of requested) {
    branches.push(
      yield* prepareObservationForContract(
        observation,
        context,
        contract,
        captures,
        materializedPaths,
        rejectedPaths,
        selectedCount,
        frozenNames
      )
    )
  }
  if (branches.length === 1) return branches[0]!
  return mergePreparedSourceObservations(branches)
})

/** Hook preparation attaches the original advicee only after source preparation. */
export const prepareObservation = Effect.fn("DirectEvent.prepareObservation")(function* (
  observation: DirectObservation,
  context: DirectReviewContext,
  frozenNames: ReadonlyMap<string, ReadonlySet<string>> | undefined = undefined
): Effect.fn.Return<PreparedObservation> {
  const result = yield* prepareSourceObservation(observation, context, frozenNames)
  return {
    ...result,
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
  const roots = new Set<string>()
  const result = yield* prepareSourceObservation(
    {
      root: request.root,
      rootIdentity: request.rootIdentity,
      candidates: [{ operation: "add", path: request.path }],
      lineSelection: { line: request.line, roots }
    },
    context
  )
  const ambiguousLine = roots.size > 1
  return {
    ...result,
    ambiguousLine,
    outcomes: ambiguousLine ? [{ status: "skipped" as const, path: request.path }] : result.outcomes
  }
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
