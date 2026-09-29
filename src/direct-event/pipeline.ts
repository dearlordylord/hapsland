import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { Decision, DecisionModel } from "effect/unstable/ai";
import type { CompiledRule } from "../rules/compiler.ts";
import { applicableRules, configuredRules } from "../policy/rules.ts";
import { compareRuleRank, findingFromProbability } from "../rules/decision.ts";
import { encodedProviderHttpBodyBytes } from "./provider-body-size.ts";
import type { Consent } from "../runtime/consent.ts";
import { admitReview } from "../configuration/decision.ts";
import { effectiveGraphLimits } from "../configuration/resolve.ts";
import { GRAPH_LIMIT_CEILINGS, type GraphLimits } from "../configuration/graph-limits.ts";
import { initialImportGraph, stepImportGraph } from "../canonical/graph-adapter.ts";
import type { ReviewSettings } from "../runtime/review-config.ts";
import { adaptCodexDirectEvent, verifyObservationRoot } from "./adapter.ts";
import { selectEditedRootsV2 } from "./attribution-v2.ts";
import { verifyCodexPostEditHunks } from "./codex-v2-hunks.ts";
import { V2_TYPE_CONTRACT } from "../rules/v2-targets.ts";
import { V2_FUNCTION_CONTRACT } from "../rules/v2-targets.ts";
import { analyzeFunctionFile } from "./function-analyzer.ts";
import { renderCandidateReviewInput, type CandidateReviewInput } from "./v2-renderer.ts";
import {
  analyzeTypeFile,
  combinedAnalyzerMaterializationPreflight,
  type AnalyzerMaterializationPreflight,
  type TypeFileAnalysis,
  type UnitAnalysis,
  inspectGraphFile,
} from "./analyzer.ts";
import { MAX_OBSERVATION_GRAPH_FILES, MAX_OBSERVATION_GRAPH_READ_BYTES,
  MAX_OBSERVATION_GRAPH_UNITS, resolveGraphUnit } from "./graph-resolver.ts";
import { captureStable, type CaptureHooks } from "./capture.ts";
import {
  canonicalValue,
  freezeInput,
  freezeRules,
  semanticIdentity,
  type DirectObservation,
  type DirectAdvicee,
  type PreparedUnit,
  type ReviewInput,
  type ReviewUnit,
  type ObservationResult,
  type PathObservationOutcome,
} from "./model.ts";
import {
  DEFAULT_DIRECT_FILE_POLICY,
  eligibleNamedPath,
  resolvedDirectFilePolicy,
  selectedByDirectFilePolicy,
  type DirectFilePolicy,
} from "./selection.ts";

export const DIRECT_EVENT_DEADLINE_MS = 15_000 as const;
/** Finite pinned System One HTTP body gate; #140 owns broader transport sizing. */
export const MAX_FULL_JEV_REQUEST_BYTES = 131_072;

export type DirectReviewContext = {
  /** Explicit operator/fixture authority. Never inferred from matching reads. */
  readonly controlledWriter: boolean;
  /** The only advicee for whom this invocation may produce advice. */
  readonly advicee: DirectAdvicee;
  /** Retained only for callers that still supply the retired grant service. */
  readonly consent?: Consent.Interface;
  readonly settings: Pick<ReviewSettings, "backend" | "destination"> &
    Partial<Pick<ReviewSettings, "configuration" | "rules">>;
  readonly policy?: DirectFilePolicy | (() => DirectFilePolicy);
  readonly rules?: ReadonlyArray<CompiledRule> | (() => ReadonlyArray<CompiledRule>);
  readonly inputContract?: string | (() => string);
  readonly captureHooks?: CaptureHooks;
  /** Fixture-only source effect; production uses the stable native capture. */
  readonly captureSource?: typeof captureStable;
  /** Fixture-only graph clock for deterministic deadline checks. */
  readonly graphNow?: () => number;
  readonly beforePrepare?: Effect.Effect<void>;
  /** Reserve bounded analyzer/input materialization after capture, before parsing. */
  readonly beforeAnalyze?: (
    path: string,
    sourceBytes: number,
    preflight: AnalyzerMaterializationPreflight | undefined,
  ) => Effect.Effect<boolean>;
  readonly beforeDispatch?: Effect.Effect<void>;
  readonly beforeHandoff?: Effect.Effect<void>;
};

export type PrepareOutcome =
  | { readonly status: "ready"; readonly path: string; readonly prepared: PreparedUnit }
  | { readonly status: "skipped"; readonly path: string };

export type PreparedObservation = {
  readonly observation: ObservationResult;
  readonly outcomes: ReadonlyArray<PrepareOutcome>;
};

export type Finding = {
  readonly path: string;
  readonly declaration: string;
  readonly ruleId: string;
  readonly probability: number;
  readonly message: string;
  readonly semanticIdentity: string;
};

/** Complete evaluated inputs retained until handoff; digests alone are not freshness. */
export type EvaluatedUnit = {
  readonly prepared: PreparedUnit;
  readonly findings: ReadonlyArray<Finding>;
};

export type RevalidationResult =
  | { readonly status: "current"; readonly evaluations: ReadonlyArray<EvaluatedUnit>; readonly findings: ReadonlyArray<Finding> }
  | { readonly status: "stale"; readonly findings: readonly [] }
  | { readonly status: "unavailable"; readonly findings: readonly [] }
  | { readonly status: "unattributed"; readonly findings: readonly [] };

/**
 * Publication authority is explicit because semantic equality cannot prove
 * that a later resident observation has not superseded completed work.
 */
export type ResidentPublicationAuthority = {
  readonly isCurrentWork: (prepared: PreparedUnit) => Effect.Effect<boolean>;
};

export type DirectReviewResult =
  | { readonly status: "unsupported"; readonly output: undefined }
  | { readonly status: "unattributed"; readonly output: undefined }
  | { readonly status: "no-advice"; readonly output: undefined }
  | { readonly status: "unavailable"; readonly reason: "backend" | "timeout" | "stale"; readonly output: undefined }
  | {
      readonly status: "ready";
      readonly findings: ReadonlyArray<Finding>;
      readonly evaluations: ReadonlyArray<EvaluatedUnit>;
      readonly output: CodexDirectEventOutput;
    };

export type CodexDirectEventOutput = {
  readonly hookSpecificOutput: {
    readonly hookEventName: "PostToolUse";
    readonly additionalContext: string;
  };
};

const sameAdvicee = (left: DirectAdvicee, right: DirectAdvicee): boolean =>
  canonicalValue(left) === canonicalValue(right);

const sameInput = (left: ReviewInput, right: ReviewInput): boolean => {
  const { sourceFingerprints: _leftCapture, rootLocation: _leftLocation, ...leftReview } = left;
  const { sourceFingerprints: _rightCapture, rootLocation: _rightLocation, ...rightReview } = right;
  return canonicalValue(leftReview) === canonicalValue(rightReview);
};

export const hasCrossFileEvidence = (prepared: PreparedUnit): boolean => {
  const pending = [prepared.input.unit.root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) continue;
    if (!node.artifact.id.startsWith(`${prepared.input.path}:`)) return true;
    for (const reference of node.references) if (reference.kind === "expanded") pending.push(reference.node);
  }
  return false;
};

const unitSourceFingerprints = (
  unit: ReviewUnit,
  captures: ReadonlyMap<string, import("./capture.ts").StableCapture>,
): ReviewInput["sourceFingerprints"] | undefined => {
  const paths = new Set<string>();
  const pending = [unit.root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined || node.artifact.path === undefined) return undefined;
    paths.add(node.artifact.path);
    for (const reference of node.references) if (reference.kind === "expanded") pending.push(reference.node);
  }
  const fingerprints = [...paths].sort().map((path) => {
    const capture = captures.get(path);
    return capture === undefined ? undefined : { path, contentHash: capture.contentHash, byteLength: capture.byteLength };
  });
  return fingerprints.some((item) => item === undefined) ? undefined :
    fingerprints as NonNullable<ReviewInput["sourceFingerprints"]>;
};

const preparedBelongsTo = (
  prepared: PreparedUnit,
  observation: DirectObservation,
): boolean =>
  prepared.root === observation.root && sameAdvicee(prepared.advicee, observation.advicee);

const validEvaluation = (evaluation: EvaluatedUnit): boolean =>
  evaluation.prepared.identity === semanticIdentity(evaluation.prepared.input) &&
  evaluation.findings.every((finding) =>
    finding.semanticIdentity === evaluation.prepared.identity &&
    finding.path === evaluation.prepared.input.path &&
    finding.declaration === evaluation.prepared.input.declaration.name);

const current = <A>(value: A | (() => A)): A =>
  typeof value === "function" ? (value as () => A)() : value;

const currentPolicy = (context: DirectReviewContext): DirectFilePolicy =>
  context.policy === undefined
    ? context.settings.configuration === undefined
      ? DEFAULT_DIRECT_FILE_POLICY
      : resolvedDirectFilePolicy(context.settings.configuration.policy)
    : current(context.policy);

const currentRules = (context: DirectReviewContext): ReadonlyArray<CompiledRule> =>
  context.rules === undefined
    ? context.settings.rules ?? configuredRules
    : current(context.rules);

const currentInputContract = (context: DirectReviewContext): string =>
  context.inputContract === undefined
    ? V2_TYPE_CONTRACT
    : current(context.inputContract);

const linesOf = (source: string): ReadonlySet<string> =>
  new Set(source.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0));

const analysisRoot = (analysis: UnitAnalysis) =>
  analysis.status === "ready" ? analysis.unit.root.artifact : analysis.root;

const selectedAnalyses = (
  analyses: ReadonlyArray<UnitAnalysis>,
  operation: "add" | "update",
  addedLines: ReadonlyArray<string>,
): { readonly selected: ReadonlyArray<UnitAnalysis>; readonly ambiguous: boolean } => {
  if (operation === "add") return { selected: analyses, ambiguous: false };
  const selected = new Set<UnitAnalysis>();
  let ambiguous = false;
  for (const line of addedLines.map((value) => value.trim()).filter((value) => value.length > 0)) {
    const matching = analyses.filter((analysis) => linesOf(analysisRoot(analysis).source).has(line));
    if (matching.length === 1 && matching[0] !== undefined) selected.add(matching[0]);
    if (matching.length > 1) ambiguous = true;
  }
  return { selected: [...selected], ambiguous };
};

type AnalysisFailure = Extract<
  Extract<PathObservationOutcome, { status: "observed" }>["analysis"],
  { status: "incomplete" }
>["failures"][number];

const extractionFailures = (analysis: TypeFileAnalysis): ReadonlyArray<AnalysisFailure> => {
  if (analysis.status === "unsupported") {
    return [{ root: undefined, reason: analysis.reason }];
  }
  return analysis.units.flatMap((outcome) => outcome.status === "unsupported"
    ? [{ root: outcome.root.name, reason: outcome.reason }]
    : []);
};

/** Ask the checked graph policy about measured root bytes before native parsing. */
export const measuredRootSourceDecision = (sourceBytes: number, limits: GraphLimits) =>
  stepImportGraph(initialImportGraph(limits), {
    kind: "root", target: 1, sourceBytes, treeBytes: 0, edges: [],
  }).command;

const prepareObservationForContract = Effect.fn("DirectEvent.prepareObservationForContract")(function* (
  observation: DirectObservation,
  context: DirectReviewContext,
  contract: string,
  supportingCaptures: Map<string, import("./capture.ts").StableCapture>,
  materializedPaths: Set<string>,
  rejectedPaths: Set<string>,
  selectedCount: { value: number },
  frozenNames: ReadonlyMap<string, ReadonlySet<string>> | undefined = undefined,
) {
  const outcomes: Array<PrepareOutcome> = [];
  const pathOutcomes: Array<PathObservationOutcome> = [];
  const observedUnits: Array<ReviewUnit> = [];
  for (const candidate of observation.candidates) {
    if (candidate.operation === "delete" || candidate.operation === "move") {
      pathOutcomes.push({ status: "incomplete", path: candidate.path, reason: "unsupported-operation" });
      outcomes.push({ status: "skipped", path: candidate.path });
      continue;
    }
    // Claude's verified post-edit span is the source of root attribution. A
    // replacement can reuse a line already present elsewhere in the file, so
    // the whole-file line difference can be empty for a real edit. Codex still
    // needs changed-line evidence before its patch is inspected below.
    const hasClaudeEditSpan = observation.advicee.host === "claude-code" &&
      observation.verifiedPostEditHunks?.path === candidate.path &&
      observation.verifiedPostEditHunks.hunks.length > 0;
    if (
      candidate.operation === "update" &&
      !candidate.addedLines.some((line) => line.trim().length > 0) &&
      !hasClaudeEditSpan
    ) {
      pathOutcomes.push({ status: "incomplete", path: candidate.path, reason: "metadata-only" });
      outcomes.push({ status: "skipped", path: candidate.path });
      continue;
    }
    const eligible = yield* eligibleNamedPath(
      observation.root,
      candidate.path,
      currentPolicy(context),
      observation.rootIdentity,
    );
    if (eligible === undefined) {
      pathOutcomes.push({ status: "incomplete", path: candidate.path, reason: "ineligible" });
      outcomes.push({ status: "skipped", path: candidate.path });
      continue;
    }
    const frozen = frozenNames?.get(eligible.relativePath);
    if (frozenNames !== undefined && frozen === undefined) {
      outcomes.push({ status: "skipped", path: eligible.relativePath });
      continue;
    }
    const graphLimits = context.settings.configuration === undefined
      ? GRAPH_LIMIT_CEILINGS
      : effectiveGraphLimits(context.settings.configuration.policy);
    const graphContract = contract === V2_TYPE_CONTRACT || contract === V2_FUNCTION_CONTRACT;
    let captured = supportingCaptures.get(eligible.relativePath);
    if (captured === undefined) {
      const admittedBytes = [...supportingCaptures.values()].reduce((sum, source) => sum + source.byteLength, 0);
      if (supportingCaptures.size >= MAX_OBSERVATION_GRAPH_FILES ||
        admittedBytes + GRAPH_LIMIT_CEILINGS.sourceBytes > MAX_OBSERVATION_GRAPH_READ_BYTES) {
        pathOutcomes.push({ status: "incomplete", path: eligible.relativePath, reason: "capture-unavailable" });
        outcomes.push({ status: "skipped", path: eligible.relativePath });
        continue;
      }
      captured = yield* (context.captureSource ?? captureStable)(
        observation.root,
        eligible,
        context.captureHooks,
        observation.rootIdentity,
        graphContract ? graphLimits.sourceBytes : undefined,
      );
      if (captured !== undefined) supportingCaptures.set(eligible.relativePath, captured);
    }
    if (captured === undefined) {
      pathOutcomes.push({ status: "incomplete", path: eligible.relativePath, reason: "capture-unavailable" });
      outcomes.push({ status: "skipped", path: eligible.relativePath });
      continue;
    }
    if (graphContract) {
      // Stable capture has measured the root. Bend owns the configured source
      // limit; a denied root never reaches parser/preflight materialization.
      const decision = measuredRootSourceDecision(captured.byteLength, graphLimits);
      if (decision.kind !== "none") {
        pathOutcomes.push({
          status: "observed", path: eligible.relativePath,
          snapshot: { path: eligible.relativePath, operation: candidate.operation, sourceHash: captured.contentHash },
          units: [], analysis: { status: "incomplete", failures: [{ root: undefined, reason: "missing-evidence" }] },
        });
        outcomes.push({ status: "skipped", path: eligible.relativePath });
        continue;
      }
    }
    if (rejectedPaths.has(eligible.relativePath)) {
      pathOutcomes.push({ status: "incomplete", path: eligible.relativePath, reason: "capture-unavailable" });
      outcomes.push({ status: "skipped", path: eligible.relativePath });
      continue;
    }
    if (!materializedPaths.has(eligible.relativePath) && context.beforeAnalyze !== undefined && !(yield* context.beforeAnalyze(
      eligible.relativePath,
      captured.byteLength,
      combinedAnalyzerMaterializationPreflight(eligible.relativePath, captured.text),
    ))) {
      rejectedPaths.add(eligible.relativePath);
      pathOutcomes.push({ status: "incomplete", path: eligible.relativePath, reason: "capture-unavailable" });
      outcomes.push({ status: "skipped", path: eligible.relativePath });
      continue;
    }
    materializedPaths.add(eligible.relativePath);
    const functionFile = contract === V2_FUNCTION_CONTRACT && captured.byteLength <= graphLimits.sourceBytes
      ? analyzeFunctionFile(eligible.relativePath, captured.text) : undefined;
    const graphFile = contract !== V2_FUNCTION_CONTRACT && captured.byteLength <= graphLimits.sourceBytes
      ? inspectGraphFile(eligible.relativePath, captured.text)
      : undefined;
    const analysis = analyzeTypeFile(eligible.relativePath, captured.text);
    const analyses: ReadonlyArray<UnitAnalysis> = functionFile !== undefined
      ? [...functionFile.functions.values()].map(({ artifact }) => ({
          status: "unsupported" as const, root: artifact,
          unit: { root: { artifact, references: [] } }, reason: "missing-evidence" as const,
        }))
      : contract === V2_FUNCTION_CONTRACT ? []
      : graphFile === undefined
      ? []
      : [...graphFile.declarations.values()].map(({ artifact }) => ({
          status: "unsupported" as const,
          root: artifact,
          unit: { root: { artifact, references: [] } },
          reason: "missing-evidence" as const,
        }));
    const candidateDeclarations = contract === V2_FUNCTION_CONTRACT
      ? [...functionFile?.functions.values() ?? []]
      : [...graphFile?.declarations.values() ?? []];
    const v2Selection = frozen === undefined && (contract === V2_TYPE_CONTRACT || contract === V2_FUNCTION_CONTRACT) &&
      candidateDeclarations.length > 0
      ? (() => {
          // Tree-sitter positions are byte-based; this narrow candidate does not
          // convert Unicode columns yet, so attribution fails closed on non-ASCII.
          if (Buffer.byteLength(captured.text, "utf8") !== captured.text.length) {
            return { selected: [] as UnitAnalysis[], ambiguous: true };
          }
          const claudeHunks = observation.verifiedPostEditHunks;
          const hunks = candidate.operation === "update" &&
            claudeHunks?.path === eligible.relativePath &&
            claudeHunks.contentHash === captured.contentHash
            ? claudeHunks.hunks
            : candidate.operation === "update" && observation.nativePatchCommand !== undefined
              ? verifyCodexPostEditHunks(observation.nativePatchCommand, eligible.relativePath, captured.text)
              : candidate.operation === "add" ? [] : undefined;
          if (hunks === undefined) return { selected: [] as UnitAnalysis[], ambiguous: true };
          const declarations = candidateDeclarations.map(({ artifact, location }) => ({
            path: eligible.relativePath, kind: artifact.kind, name: artifact.name, location,
          }));
          try {
            const attribution = selectEditedRootsV2({ path: eligible.relativePath,
              operation: candidate.operation, source: captured.text }, hunks, declarations);
            const names = new Set(attribution.selected.map((root) => root.name));
            return { selected: analyses.filter((item) => names.has(analysisRoot(item).name)),
              ambiguous: attribution.ambiguous.length > 0 };
          } catch {
            return { selected: [] as UnitAnalysis[], ambiguous: true };
          }
        })()
      : undefined;
    const selection = frozen === undefined
      ? v2Selection ?? selectedAnalyses(analyses, candidate.operation, candidate.addedLines ?? [])
      : {
          selected: analyses.filter((item) => frozen.has(analysisRoot(item).name)),
          ambiguous: false,
        };
    const selected = selection.selected;
    const units: ReviewUnit[] = [];
    const graphFailures: AnalysisFailure[] = [];
    for (const item of selected) {
      const root = analysisRoot(item);
      if (selectedCount.value >= MAX_OBSERVATION_GRAPH_UNITS) {
        graphFailures.push({ root: root.name, reason: "reference-limit" });
        continue;
      }
      selectedCount.value += 1;
      const unit = yield* resolveGraphUnit(eligible.relativePath, captured, root.name, {
        root: observation.root,
        rootIdentity: observation.rootIdentity,
        policy: currentPolicy(context),
        limits: graphLimits,
        ...(contract === V2_FUNCTION_CONTRACT ? { branch: "function" as const } : {}),
        captureCache: supportingCaptures,
        ...(context.graphNow === undefined ? {} : { now: context.graphNow }),
        ...(context.captureHooks === undefined ? {} : { captureHooks: context.captureHooks }),
        ...(context.captureSource === undefined ? {} : { captureSource: context.captureSource }),
      });
      if (unit === undefined) {
        const prior = analysis.status === "analyzed" ? analysis.units.find((entry) =>
          analysisRoot(entry).name === root.name) : undefined;
        graphFailures.push({ root: root.name, reason: prior?.status === "unsupported" &&
          prior.reason === "reference-limit" ? "reference-limit" : "missing-evidence" });
      }
      else units.push(unit);
    }
    const failures = [
      ...(graphFile === undefined && functionFile === undefined ? extractionFailures(analysis) : []),
      ...graphFailures,
      ...(selection.ambiguous
        ? [{ root: undefined, reason: "ambiguous-update" as const }]
        : []),
    ];
    pathOutcomes.push({
      status: "observed",
      path: eligible.relativePath,
      snapshot: {
        path: eligible.relativePath,
        operation: candidate.operation,
        sourceHash: captured.contentHash,
      },
      units,
      analysis: failures.length === 0
        ? { status: "complete" }
        : { status: "incomplete", failures },
    });
    observedUnits.push(...units);
    if (units.length === 0) {
      outcomes.push({ status: "skipped", path: eligible.relativePath });
      continue;
    }
    for (const unit of units) {
      const declaration = unit.root.artifact;
      const rootLocation = contract === V2_TYPE_CONTRACT || contract === V2_FUNCTION_CONTRACT
        ? candidateDeclarations.find((candidate) => candidate.artifact.kind === declaration.kind &&
          candidate.artifact.name === declaration.name)?.location
        : undefined;
      if ((contract === V2_TYPE_CONTRACT || contract === V2_FUNCTION_CONTRACT) && rootLocation === undefined) continue;
      const sourceFingerprints = unitSourceFingerprints(unit, supportingCaptures);
      if (sourceFingerprints === undefined) continue;
      const artifactKind = declaration.kind === "function" ? "function" as const : "typeShape" as const;
      const capabilities = contract === V2_TYPE_CONTRACT
        ? ["root-declaration", "resolved-outbound-types", "selected-source-type-closure"] as const
        : contract === V2_FUNCTION_CONTRACT
          ? ["signature", "body", "resolved-local-calls", "resolved-outbound-types"] as const
          : undefined;
      const rules = applicableRules(declaration.source, eligible.relativePath, currentRules(context), {
        artifactKind,
        inputContract: contract,
        complete: true,
        ...(capabilities === undefined ? {} : { capabilities }),
      });
      if (rules.length === 0) continue;
      const input = freezeInput({
        contract,
        graphLimits,
        candidateProjection: true,
        ...(rootLocation === undefined ? {} : { rootLocation }),
        ...(sourceFingerprints === undefined ? {} : { sourceFingerprints }),
        completeness: "complete",
        path: eligible.relativePath,
        declaration,
        unit,
        rules: freezeRules(rules, { artifactKind, inputContract: contract }),
        interpretation: "probability-strictly-greater-than-threshold",
      } satisfies ReviewInput);
      outcomes.push({
        status: "ready",
        path: eligible.relativePath,
        prepared: {
          root: observation.root,
          advicee: observation.advicee,
          input,
          identity: semanticIdentity(input),
        },
      });
    }
  }
  const complete = pathOutcomes.every((outcome) =>
    outcome.status === "observed" && outcome.analysis.status === "complete");
  const result: ObservationResult = complete
    ? {
        status: "complete",
        changeSet: {
          status: "complete",
          changes: pathOutcomes.flatMap((outcome) => outcome.status === "observed" ? [outcome.snapshot] : []),
          units: observedUnits,
        },
        outcomes: pathOutcomes,
      }
    : { status: "incomplete", outcomes: pathOutcomes, units: observedUnits };
  return { observation: result, outcomes } satisfies PreparedObservation;
});

/** One observation can yield type and function review units under distinct input contracts. */
export const prepareObservation = Effect.fn("DirectEvent.prepareObservation")(function* (
  observation: DirectObservation,
  context: DirectReviewContext,
  frozenNames: ReadonlyMap<string, ReadonlySet<string>> | undefined = undefined,
) {
  const captures = new Map<string, import("./capture.ts").StableCapture>();
  const materializedPaths = new Set<string>();
  const rejectedPaths = new Set<string>();
  const selectedCount = { value: 0 };
  const requested = context.inputContract === undefined
    ? [V2_TYPE_CONTRACT, V2_FUNCTION_CONTRACT]
    : [currentInputContract(context)];
  const branches: PreparedObservation[] = [];
  for (const contract of requested) {
    branches.push(yield* prepareObservationForContract(observation, context, contract,
      captures, materializedPaths, rejectedPaths, selectedCount, frozenNames));
  }
  if (branches.length === 1) return branches[0]!;
  const ready = branches.flatMap((branch) => branch.outcomes.filter(
    (item): item is Extract<PrepareOutcome, { status: "ready" }> => item.status === "ready"));
  const byPath = new Map<string, PathObservationOutcome>();
  for (const branch of branches) for (const outcome of branch.observation.outcomes) {
    const prior = byPath.get(outcome.path);
    if (prior === undefined) { byPath.set(outcome.path, outcome); continue; }
    if (prior.status !== "observed" || outcome.status !== "observed") {
      byPath.set(outcome.path, prior.status === "incomplete" ? prior : outcome);
      continue;
    }
    byPath.set(outcome.path, {
      ...prior,
      units: [...prior.units, ...outcome.units],
      analysis: prior.analysis.status === "complete" && outcome.analysis.status === "complete"
        ? { status: "complete" }
        : { status: "incomplete", failures: [
            ...(prior.analysis.status === "incomplete" ? prior.analysis.failures : []),
            ...(outcome.analysis.status === "incomplete" ? outcome.analysis.failures : []),
          ] },
    });
  }
  const pathOutcomes = [...byPath.values()];
  const readyPaths = new Set(ready.map((item) => item.path));
  const outcomes: PrepareOutcome[] = [...ready, ...pathOutcomes.flatMap((item) =>
    readyPaths.has(item.path) ? [] : [{ status: "skipped" as const, path: item.path }])];
  const units = branches.flatMap((branch) => branch.observation.status === "complete"
    ? branch.observation.changeSet.units : branch.observation.units);
  const complete = pathOutcomes.every((item) => item.status === "observed" && item.analysis.status === "complete");
  return {
    observation: complete ? {
      status: "complete" as const,
      changeSet: { status: "complete" as const,
        changes: pathOutcomes.flatMap((item) => item.status === "observed" ? [item.snapshot] : []), units },
      outcomes: pathOutcomes,
    } : { status: "incomplete" as const, outcomes: pathOutcomes, units },
    outcomes,
  } satisfies PreparedObservation;
});

/** Rebuild only the named complete unit under current file policy before a Jev request. */
export const preparedUnitStillCurrent = Effect.fn("DirectEvent.preparedUnitStillCurrent")(function* (
  observation: DirectObservation,
  prepared: PreparedUnit,
  context: DirectReviewContext,
) {
  if (!(yield* verifyObservationRoot(observation))) return false;
  const names = new Map([[prepared.input.path, new Set([prepared.input.declaration.name])]]);
  const latest = yield* prepareObservation(observation, context, names);
  return latest.outcomes.some((outcome) => outcome.status === "ready" &&
    outcome.prepared.input.path === prepared.input.path &&
    outcome.prepared.identity === prepared.identity &&
    sameInput(outcome.prepared.input, prepared.input) &&
    canonicalValue(outcome.prepared.input.sourceFingerprints) ===
      canonicalValue(prepared.input.sourceFingerprints));
});

type Evaluation =
  | { readonly status: "evaluated"; readonly findings: ReadonlyArray<Finding> }
  | { readonly status: "input-limit" }
  | { readonly status: "backend" }
  | { readonly status: "timeout" };

/** Flatten only Bend-authorized, fully represented graph edges in traversal order. */
export const candidateReviewInput = (input: ReviewInput): CandidateReviewInput | undefined => {
  if (input.completeness !== "complete" || input.candidateProjection !== true ||
    (input.contract !== V2_TYPE_CONTRACT && input.contract !== V2_FUNCTION_CONTRACT)) return undefined;
  const root = input.unit.root;
  const path = root.artifact.path;
  if (path === undefined || path !== input.path || root.artifact.id !== input.declaration.id) return undefined;
  const artifact = { id: root.artifact.id, kind: root.artifact.kind, name: root.artifact.name,
    domain: path, source: root.artifact.source };
  const nodes: CandidateReviewInput["nodes"][number][] = [];
  const edges: CandidateReviewInput["edges"][number][] = [];
  const seen = new Set([artifact.id]);
  const visit = (owner: typeof root): boolean => {
    for (const reference of owner.references) {
      if (reference.kind === "omitted") return false;
      if (reference.kind === "included") {
        if (!seen.has(reference.target)) return false;
        edges.push({ from: owner.artifact.id, to: reference.target, kind: "included",
          symbol: reference.site.symbol, order: edges.length });
        continue;
      }
      const child = reference.node;
      const domain = child.artifact.path;
      if (domain === undefined || seen.has(child.artifact.id)) return false;
      seen.add(child.artifact.id);
      nodes.push({ id: child.artifact.id, kind: child.artifact.kind, name: child.artifact.name,
        domain, source: child.artifact.source, order: nodes.length });
      edges.push({ from: owner.artifact.id, to: child.artifact.id, kind: "expanded",
        symbol: reference.site.symbol, order: edges.length });
      if (!visit(child)) return false;
    }
    return true;
  };
  if (!visit(root)) return undefined;
  return { contract: input.contract, completeness: "complete",
    treeBytesLimit: input.graphLimits?.treeBytes ?? GRAPH_LIMIT_CEILINGS.treeBytes,
    artifact, nodes, edges };
};

/** Exact source-bearing `DecisionModel` input before provider serialization. */
export const preparedProviderInput = (prepared: PreparedUnit) => {
  if (prepared.input.contract === V2_TYPE_CONTRACT || prepared.input.contract === V2_FUNCTION_CONTRACT) {
    const candidate = candidateReviewInput(prepared.input);
    return candidate === undefined ? undefined : renderCandidateReviewInput(candidate);
  }
  return undefined;
};

/** UTF-8 bytes in the exact JSON representation supplied as the provider input value. */
export const encodedPreparedProviderInputBytes = (prepared: PreparedUnit): number =>
  preparedProviderInput(prepared) === undefined ? Number.POSITIVE_INFINITY :
    Buffer.byteLength(JSON.stringify(preparedProviderInput(prepared)), "utf8");

export const encodedFullJevRequestBytes = (prepared: PreparedUnit): number => {
  const input = preparedProviderInput(prepared);
  if (input === undefined) return Number.POSITIVE_INFINITY;
  return Buffer.byteLength(JSON.stringify({
    input,
    decisions: Object.fromEntries(prepared.input.rules.map(({ id, decision }) => [id, decision])),
  }), "utf8");
};

/** Pinned provider's encoded JSON HTTP body, distinct from the local proposal shape. */
export const encodedPreparedProviderHttpBodyBytes = (prepared: PreparedUnit): number => {
  const input = preparedProviderInput(prepared);
  return input === undefined ? Number.POSITIVE_INFINITY :
    encodedProviderHttpBodyBytes(input, prepared.input.rules);
};

/** One DecisionModel call, no retry wrapper, with a fixed total call deadline. */
export const evaluatePrepared = Effect.fn("DirectEvent.evaluatePrepared")(function* (
  prepared: PreparedUnit,
  beforeDispatch: Effect.Effect<void, unknown> = Effect.void,
) {
  if (encodedPreparedProviderHttpBodyBytes(prepared) > MAX_FULL_JEV_REQUEST_BYTES) {
    return { status: "input-limit" } as const;
  }
  const providerInput = preparedProviderInput(prepared);
  if (providerInput === undefined) return { status: "input-limit" } as const;
  const decisions: Record<string, Decision.Probability> = {};
  for (const rule of prepared.input.rules) decisions[rule.id] = rule.decision;
  const definition = Decision.make({ input: Schema.Json, decisions });
  const input = yield* Schema.decodeUnknownEffect(Schema.Json)(
    providerInput,
  ).pipe(Effect.orDie);
  const model = yield* DecisionModel.DecisionModel;
  const evaluated = yield* beforeDispatch.pipe(
    Effect.andThen(model.decide(definition, { input })),
    Effect.timeoutOption(`${DIRECT_EVENT_DEADLINE_MS} millis`),
    Effect.result,
  );
  if (Result.isFailure(evaluated)) return { status: "backend" } as const;
  if (Option.isNone(evaluated.success)) return { status: "timeout" } as const;
  const answers = evaluated.success.value.answers;
  const expected = prepared.input.rules.map(({ id }) => id).sort();
  const actual = Object.keys(answers).sort();
  if (
    expected.length !== actual.length ||
    expected.some((key, index) => key !== actual[index])
  ) return { status: "backend" } as const;
  const ranked: Array<{ readonly finding: Finding; readonly rank: number }> = [];
  for (const rule of prepared.input.rules) {
    const answer = answers[rule.id];
    if (
      answer === undefined ||
      !Number.isFinite(answer.probability) ||
      answer.probability < 0 ||
      answer.probability > 1
    ) return { status: "backend" } as const;
    if (findingFromProbability(answer.probability, rule.threshold)) {
      ranked.push({ rank: rule.rank, finding: {
        path: prepared.input.path,
        declaration: prepared.input.declaration.name,
        ruleId: rule.id,
        probability: answer.probability,
        message: rule.message,
        semanticIdentity: prepared.identity,
      } });
    }
  }
  const findings = ranked.sort((left, right) => compareRuleRank(
    { probability: left.finding.probability, rank: left.rank },
    { probability: right.finding.probability, rank: right.rank },
  )).map(({ finding }) => finding);
  return { status: "evaluated", findings } satisfies Evaluation;
});

export const DIRECT_EVENT_ADVISORY_HEADING =
  "Advisory direct-event review (the edit already succeeded):";

export const toCodexDirectEventOutput = (
  findings: ReadonlyArray<Finding>,
): CodexDirectEventOutput => ({
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: [
      DIRECT_EVENT_ADVISORY_HEADING,
      ...findings.map((finding) =>
        `${finding.path} :: ${finding.declaration} [${finding.ruleId}, p=${finding.probability.toFixed(2)}]: ${finding.message}`),
    ].join("\n"),
  },
});

/** Core path consumes the one immutable observation produced at the host boundary. */
export const reviewObservation = Effect.fn("DirectEvent.reviewObservation")(function* (
  observation: DirectObservation,
  context: DirectReviewContext,
) {
  if (admitReview({ rootValid: yield* verifyObservationRoot(observation),
    configurationValid: true, credentialReady: true, selected: true }) !== "admitReview") {
    return { status: "unsupported", output: undefined } satisfies DirectReviewResult;
  }
  if (!context.controlledWriter || !sameAdvicee(observation.advicee, context.advicee)) {
    return { status: "unattributed", output: undefined } satisfies DirectReviewResult;
  }
  yield* context.beforePrepare ?? Effect.void;
  const prepared = yield* prepareObservation(observation, context);
  const ready = prepared.outcomes.filter(
    (outcome): outcome is Extract<PrepareOutcome, { status: "ready" }> =>
      outcome.status === "ready",
  );
  if (ready.length === 0) {
    return { status: "no-advice", output: undefined } satisfies DirectReviewResult;
  }
  const findings: Array<Finding> = [];
  const evaluations: Array<EvaluatedUnit> = [];
  let unavailable: "backend" | "timeout" | undefined;
  for (const outcome of ready) {
    yield* context.beforeDispatch ?? Effect.void;
    const admission = admitReview({ rootValid: yield* verifyObservationRoot(observation),
      configurationValid: true, credentialReady: true,
      selected: selectedByDirectFilePolicy(outcome.prepared.input.path, currentPolicy(context)) });
    if (admission === "refuseRoot") {
      return { status: "unavailable", reason: "stale", output: undefined } satisfies DirectReviewResult;
    }
    if (admission !== "admitReview") continue;
    if (!(yield* preparedUnitStillCurrent(observation, outcome.prepared, context))) continue;
    const evaluation = yield* evaluatePrepared(outcome.prepared);
    if (evaluation.status !== "evaluated") {
      if (evaluation.status !== "input-limit") unavailable ??= evaluation.status;
      continue;
    }
    evaluations.push({
      prepared: outcome.prepared,
      findings: evaluation.findings,
    });
    findings.push(...evaluation.findings);
  }
  if (findings.length === 0) {
    if (unavailable !== undefined) {
      return { status: "unavailable", reason: unavailable, output: undefined } satisfies DirectReviewResult;
    }
    return { status: "no-advice", output: undefined } satisfies DirectReviewResult;
  }
  yield* context.beforeHandoff ?? Effect.void;
  if (!context.controlledWriter || !sameAdvicee(observation.advicee, context.advicee)) {
    return { status: "unattributed", output: undefined } satisfies DirectReviewResult;
  }
  const revalidated = yield* revalidateForPublication(
    observation,
    evaluations,
    context,
    undefined,
  );
  if (revalidated.status !== "current" || revalidated.findings.length === 0) {
    return { status: "unavailable", reason: "stale", output: undefined } satisfies DirectReviewResult;
  }
  return {
    status: "ready",
    findings: revalidated.findings,
    evaluations: revalidated.evaluations,
    output: toCodexDirectEventOutput(revalidated.findings),
  } satisfies DirectReviewResult;
});

/**
 * Recheck delayed evaluations against current authority and complete canonical
 * inputs. A whole-file match is intentionally neither accepted nor consulted.
 */
const revalidateForPublication = Effect.fn("DirectEvent.revalidateForPublication")(function* (
  observation: DirectObservation,
  evaluations: ReadonlyArray<EvaluatedUnit>,
  context: DirectReviewContext,
  authority: ResidentPublicationAuthority | undefined,
): Effect.fn.Return<RevalidationResult> {
  if (
    !context.controlledWriter ||
    !sameAdvicee(observation.advicee, context.advicee) ||
    evaluations.some((evaluation) => !preparedBelongsTo(evaluation.prepared, observation))
  ) return { status: "unattributed", findings: [] };
  if (
    evaluations.length === 0 ||
    evaluations.some((evaluation) => !validEvaluation(evaluation))
  ) return { status: "unavailable", findings: [] };
  if (!(yield* verifyObservationRoot(observation))) {
    return { status: "unavailable", findings: [] };
  }
  const frozenNames = new Map<string, Set<string>>();
  for (const evaluation of evaluations) {
    const input = evaluation.prepared.input;
    const names = frozenNames.get(input.path) ?? new Set<string>();
    names.add(input.declaration.name);
    frozenNames.set(input.path, names);
  }
  const currentPrepared = yield* prepareObservation(observation, context, frozenNames);
  const current = currentPrepared.outcomes.flatMap((outcome) =>
    outcome.status === "ready" ? [outcome.prepared] : []);
  const retained: Array<EvaluatedUnit> = [];
  let foundChangedInput = false;
  for (const evaluation of evaluations) {
    const expected = evaluation.prepared.input;
    const sameSubject = current.filter((prepared) =>
      prepared.input.path === expected.path &&
      prepared.input.declaration.name === expected.declaration.name);
    const matching = sameSubject.find((prepared) =>
      prepared.identity === evaluation.prepared.identity &&
      sameInput(prepared.input, expected));
    if (matching !== undefined) retained.push(evaluation);
    else if (sameSubject.length > 0) foundChangedInput = true;
  }
  if (retained.length > 0) {
    // Keep the scheduler-owned supersession check last: semantic capture does
    // not prove that a later accepted observation has not replaced this work.
    const publishable: Array<EvaluatedUnit> = [];
    for (const evaluation of retained) {
      if (authority === undefined || (yield* authority.isCurrentWork(evaluation.prepared))) {
        publishable.push(evaluation);
      }
    }
    if (publishable.length === 0) return { status: "stale", findings: [] };
    return {
      status: "current",
      evaluations: publishable,
      findings: publishable.flatMap(({ findings }) => findings),
    };
  }
  return foundChangedInput
    ? { status: "stale", findings: [] }
    : { status: "unavailable", findings: [] };
});

/**
 * Resident publication always requires scheduler-owned supersession authority.
 * Immediate in-invocation review uses the private path above and cannot be
 * mistaken for authorization to publish delayed work.
 */
export const revalidateEvaluations = Effect.fn("DirectEvent.revalidateEvaluations")(function* (
  observation: DirectObservation,
  evaluations: ReadonlyArray<EvaluatedUnit>,
  context: DirectReviewContext,
  authority: ResidentPublicationAuthority,
) {
  return yield* revalidateForPublication(observation, evaluations, context, authority);
});

/**
 * @deprecated Findings do not retain the prior complete canonical input. This
 * digest-only compatibility check must not authorize resident publication;
 * retain `EvaluatedUnit` and use `revalidateEvaluations` instead.
 */
export const revalidateFindings = Effect.fn("DirectEvent.revalidateFindings")(function* (
  observation: DirectObservation,
  findings: ReadonlyArray<Finding>,
  context: DirectReviewContext,
) {
  if (findings.length === 0) return false;
  const grouped = new Map<string, Array<Finding>>();
  for (const finding of findings) {
    const key = `${finding.path}\0${finding.declaration}\0${finding.semanticIdentity}`;
    const values = grouped.get(key) ?? [];
    values.push(finding);
    grouped.set(key, values);
  }
  const names = new Map<string, Set<string>>();
  for (const finding of findings) {
    const values = names.get(finding.path) ?? new Set<string>();
    values.add(finding.declaration);
    names.set(finding.path, values);
  }
  if (
    !context.controlledWriter ||
    !sameAdvicee(observation.advicee, context.advicee) ||
    !(yield* verifyObservationRoot(observation))
  ) return false;
  const prepared = yield* prepareObservation(observation, context, names);
  for (const [key] of grouped.entries()) {
    const found = prepared.outcomes.find((outcome) => {
      if (outcome.status !== "ready") return false;
      const input = outcome.prepared.input;
      return key === `${input.path}\0${input.declaration.name}\0${outcome.prepared.identity}`;
    });
    if (found?.status !== "ready") return false;
  }
  return true;
});

/** Convenience boundary for non-CLI callers; adaptation still occurs exactly once. */
export const reviewCodexDirectEvent = Effect.fn("DirectEvent.reviewCodexDirectEvent")(function* (
  nativeEvent: unknown,
  context: DirectReviewContext,
) {
  const observation = yield* adaptCodexDirectEvent(nativeEvent);
  if (observation === undefined) {
    return { status: "unsupported", output: undefined } satisfies DirectReviewResult;
  }
  return yield* reviewObservation(observation, context);
});

/** Compatibility name retained for the original Add-only CLI integration. */
export const reviewCodexAdd = reviewCodexDirectEvent;
