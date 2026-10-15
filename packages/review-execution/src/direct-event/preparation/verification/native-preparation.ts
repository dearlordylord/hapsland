import type {
  DirectReviewContext,
  PreparedSource,
  SourcePreparationContext,
  PreparedObservation,
  SourceLineRequest
} from "../contract.ts"
import { DEFAULT_REVIEW_BACKEND } from "@hapsland/runtime-environment/runtime/backend"
import { isBundledArtifact, languageForPath } from "@hapsland/source-analysis/direct-event/languages/registry"
import * as Effect from "effect/Effect"
import type { CompiledRule } from "@hapsland/review-definition/rules/compiler"
import { applicableRules } from "../../../policy/rules.ts"
import { nativeProviderIdentity as providerIdentity } from "@hapsland/review-definition/testing/native-provider-identity"
import { effectiveReviewBackend, effectiveGraphLimits } from "@hapsland/runtime-inputs/configuration/resolve"
import { GRAPH_LIMIT_CEILINGS, type GraphLimits } from "@hapsland/canonical-policy/canonical/graph-limits"
import { initialImportGraph, stepImportGraph } from "@hapsland/canonical-policy/canonical/graph-adapter"
import { selectEditedRoots } from "@hapsland/native-observation/direct-event/edit-attribution"
import { verifyCodexPostEditHunks } from "@hapsland/native-observation/direct-event/codex-patch-hunks"
import { TYPE_INPUT_CONTRACT, FUNCTION_INPUT_CONTRACT } from "@hapsland/review-definition/rules/targets"
import { analyzeFunctionFile } from "@hapsland/source-analysis/direct-event/function-analyzer"
import {
  analyzeTypeFile,
  combinedAnalyzerMaterializationPreflight,
  type TypeFileAnalysis,
  type UnitAnalysis,
  inspectGraphFile
} from "@hapsland/source-analysis/testing/native-analyzer"
import {
  observationCaptureBudgetRefusal,
  MAX_OBSERVATION_GRAPH_UNITS,
  resolveGraphUnit
} from "@hapsland/source-analysis/testing/native-graph"
import {
  captureStable,
  type CaptureResult,
  type CaptureDiagnostic
} from "@hapsland/native-observation/direct-event/capture"
import {
  freezeInput,
  freezeRules,
  semanticIdentity,
  type ReviewInput,
  type ObservationResult,
  type MaterializationAdmission,
  type PreparationDiagnostic,
  type PathObservationOutcome
} from "@hapsland/review-definition/direct-event/model"
import { type ReviewUnit } from "@hapsland/source-artifacts/direct-event/artifact-model"
import { type DirectObservation, type DirectAdvicee } from "@hapsland/native-observation/direct-event/observation"
import {
  DEFAULT_DIRECT_FILE_POLICY,
  type eligibleNamedPath,
  inspectNamedPath,
  resolvedDirectFilePolicy,
  type DirectFilePolicy
} from "@hapsland/native-observation/direct-event/selection"

// Independent verification oracle, moved from the former production owner.
// Never imported by production. Delete on whole Preparation acceptance; no
// source capture, snapshot restoration, runtime slicing or generated function.
type SourcePrepareOutcome =
  | { readonly status: "ready"; readonly path: string; readonly prepared: PreparedSource }
  | { readonly status: "skipped"; readonly path: string }
type PreparedSourceObservation = {
  readonly observation: ObservationResult
  readonly outcomes: ReadonlyArray<SourcePrepareOutcome>
}
type PreparationObservation = Omit<DirectObservation, "advicee"> & {
  readonly advicee?: DirectAdvicee
  readonly lineSelection?: { readonly line: number; readonly roots: Set<string> }
}

/** Complete evaluated inputs retained until handoff; digests alone are not freshness. */
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
  readonly selectionLocations?: ReadonlyArray<NonNullable<ReviewInput["rootLocation"]>>
  readonly location: NonNullable<ReviewInput["rootLocation"]>
}
const graphResolutionOptions = (frame: PreparationFrame, candidatePath: string) => ({
  analysisConfiguration:
    frame.context.settings.configuration?.policy.layers.reduce<
      NonNullable<
        import("@hapsland/source-analysis/direct-event/languages/contracts").LanguageGraphHost["analysisConfiguration"]
      >
    >((current, layer) => ({ ...current, ...layer.document.analysis }), {}) ?? {},
  analysisConfigurationIdentity: frame.context.settings.configuration?.policy.digest ?? "unconfigured",
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
  language: "typescript" | "rust" | "bend" | "python" | "go"
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
const supportedRuleLanguage = (
  language: string | undefined
): language is "typescript" | "rust" | "bend" | "python" | "go" =>
  language === "typescript" || language === "rust" || language === "bend" || language === "python" || language === "go"
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
  const declarations = candidateDeclarations.flatMap(({ artifact, location, selectionLocations }) =>
    artifact.kind === "constant-group"
      ? []
      : [
          {
            path,
            kind: artifact.kind,
            name: artifact.name,
            ...(selectionLocations === undefined ? {} : { selectionLocations }),
            location
          }
        ]
  )
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
      ambiguous: attribution.ambiguous.length > 0,
      ambiguousReason:
        languageForPath(path)?.unselectedTypeEditReason?.(
          captured.text,
          attribution.ambiguous.map((span) => span.location)
        ) ?? ("ambiguous-update" as const)
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
    ...(selection.ambiguous
      ? [
          {
            root: undefined,
            reason: "ambiguousReason" in selection ? selection.ambiguousReason : ("ambiguous-update" as const)
          }
        ]
      : [])
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

export const prepareNativeObservation = Effect.fn("DirectEvent.prepareObservation")(function* (
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

export const prepareNativeSourceLine = Effect.fn("DirectEvent.prepareSourceLine")(function* (
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

export { prepareReadyUnits as nativePrepareReadyUnits, selectCapturedCandidate as nativeSelectCapturedCandidate }
