import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { Decision, DecisionModel } from "effect/unstable/ai";
import type { CompiledRule } from "../rules/compiler.ts";
import { applicableRules, configuredRules } from "../policy/rules.ts";
import type { Consent } from "../runtime/consent.ts";
import type { ReviewSettings } from "../runtime/review-config.ts";
import { adaptCodexDirectEvent, verifyObservationRoot } from "./adapter.ts";
import {
  analyzeTypeFile,
  type TypeFileAnalysis,
  type UnitAnalysis,
} from "./analyzer.ts";
import { captureStable, type CaptureHooks } from "./capture.ts";
import {
  DIRECT_EVENT_INPUT_CONTRACT,
  canonicalValue,
  freezeInput,
  freezeRules,
  semanticIdentity,
  type DirectObservation,
  type DirectRecipient,
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
  type DirectFilePolicy,
} from "./selection.ts";

export const DIRECT_EVENT_DEADLINE_MS = 15_000 as const;

export type DirectReviewContext = {
  /** Explicit operator/fixture authority. Never inferred from matching reads. */
  readonly controlledWriter: boolean;
  /** The only recipient for whom this invocation may produce advice. */
  readonly recipient: DirectRecipient;
  readonly consent: Consent.Interface;
  readonly settings: Pick<ReviewSettings, "backend" | "destination"> &
    Partial<Pick<ReviewSettings, "configuration" | "rules">>;
  readonly policy?: DirectFilePolicy | (() => DirectFilePolicy);
  readonly rules?: ReadonlyArray<CompiledRule> | (() => ReadonlyArray<CompiledRule>);
  readonly inputContract?: string | (() => string);
  readonly captureHooks?: CaptureHooks;
  readonly beforePrepare?: Effect.Effect<void>;
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
  | { readonly status: "unavailable"; readonly reason: "consent" | "backend" | "timeout" | "stale"; readonly output: undefined }
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

const sameRecipient = (left: DirectRecipient, right: DirectRecipient): boolean =>
  canonicalValue(left) === canonicalValue(right);

const sameInput = (left: ReviewInput, right: ReviewInput): boolean =>
  canonicalValue(left) === canonicalValue(right);

const preparedBelongsTo = (
  prepared: PreparedUnit,
  observation: DirectObservation,
): boolean =>
  prepared.root === observation.root && sameRecipient(prepared.recipient, observation.recipient);

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
    ? DIRECT_EVENT_INPUT_CONTRACT
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

export const prepareObservation = Effect.fn("DirectEvent.prepareObservation")(function* (
  observation: DirectObservation,
  context: DirectReviewContext,
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
    if (
      candidate.operation === "update" &&
      !candidate.addedLines.some((line) => line.trim().length > 0)
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
    const captured = yield* captureStable(
      observation.root,
      eligible,
      context.captureHooks,
      observation.rootIdentity,
    );
    if (captured === undefined) {
      pathOutcomes.push({ status: "incomplete", path: eligible.relativePath, reason: "capture-unavailable" });
      outcomes.push({ status: "skipped", path: eligible.relativePath });
      continue;
    }
    const analysis = analyzeTypeFile(eligible.relativePath, captured.text);
    const analyses = analysis.status === "analyzed" ? analysis.units : [];
    const selection = frozen === undefined
      ? selectedAnalyses(analyses, candidate.operation, candidate.addedLines ?? [])
      : {
          selected: analyses.filter((item) => frozen.has(analysisRoot(item).name)),
          ambiguous: false,
        };
    const selected = selection.selected;
    const units = selected.flatMap((item) => item.status === "ready" ? [item.unit] : []);
    const failures = [
      ...extractionFailures(analysis),
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
      const rules = applicableRules(declaration.source, eligible.relativePath, currentRules(context));
      if (rules.length === 0) continue;
      const input = freezeInput({
        contract: currentInputContract(context),
        path: eligible.relativePath,
        declaration,
        unit,
        rules: freezeRules(rules),
        interpretation: "probability-strictly-greater-than-threshold",
      } satisfies ReviewInput);
      outcomes.push({
        status: "ready",
        path: eligible.relativePath,
        prepared: {
          root: observation.root,
          recipient: observation.recipient,
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

type Evaluation =
  | { readonly status: "evaluated"; readonly findings: ReadonlyArray<Finding> }
  | { readonly status: "backend" }
  | { readonly status: "timeout" };

/** One DecisionModel call, no retry wrapper, with a fixed total call deadline. */
export const evaluatePrepared = Effect.fn("DirectEvent.evaluatePrepared")(function* (
  prepared: PreparedUnit,
) {
  const decisions: Record<string, Decision.Probability> = {};
  for (const rule of prepared.input.rules) decisions[rule.id] = rule.decision;
  const definition = Decision.make({ input: Schema.Json, decisions });
  const input = yield* Schema.decodeUnknownEffect(Schema.Json)({
    artifact: {
      domain: prepared.input.path,
      source: prepared.input.declaration.source,
    },
    evidence: prepared.input.unit.root.references,
    inputContract: {
      id: prepared.input.contract,
      evidence: "complete named direct-event unit",
    },
  }).pipe(Effect.orDie);
  const model = yield* DecisionModel.DecisionModel;
  const evaluated = yield* model.decide(definition, { input }).pipe(
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
  const findings: Array<Finding> = [];
  for (const rule of prepared.input.rules) {
    const answer = answers[rule.id];
    if (
      answer === undefined ||
      !Number.isFinite(answer.probability) ||
      answer.probability < 0 ||
      answer.probability > 1
    ) return { status: "backend" } as const;
    if (answer.probability > rule.threshold) {
      findings.push({
        path: prepared.input.path,
        declaration: prepared.input.declaration.name,
        ruleId: rule.id,
        probability: answer.probability,
        message: rule.message,
        semanticIdentity: prepared.identity,
      });
    }
  }
  return { status: "evaluated", findings } satisfies Evaluation;
});

const authorize = (
  root: string,
  context: DirectReviewContext,
) => context.consent.authorize(
  root,
  context.settings.backend,
  context.settings.destination,
).pipe(
  Effect.map((authorization) => authorization.status === "approved"),
  Effect.catch(() => Effect.succeed(false)),
);

export const toCodexDirectEventOutput = (
  findings: ReadonlyArray<Finding>,
): CodexDirectEventOutput => ({
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: [
      "Advisory direct-event review (the edit already succeeded):",
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
  if (!(yield* verifyObservationRoot(observation))) {
    return { status: "unsupported", output: undefined } satisfies DirectReviewResult;
  }
  if (!context.controlledWriter || !sameRecipient(observation.recipient, context.recipient)) {
    return { status: "unattributed", output: undefined } satisfies DirectReviewResult;
  }
  if (!(yield* authorize(observation.root, context))) {
    return { status: "unavailable", reason: "consent", output: undefined } satisfies DirectReviewResult;
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
    // Consent is mutable user authority and is checked at the actual egress edge.
    if (!(yield* authorize(observation.root, context))) {
      return { status: "unavailable", reason: "consent", output: undefined } satisfies DirectReviewResult;
    }
    if (!(yield* verifyObservationRoot(observation))) {
      return { status: "unavailable", reason: "stale", output: undefined } satisfies DirectReviewResult;
    }
    const evaluation = yield* evaluatePrepared(outcome.prepared);
    if (evaluation.status !== "evaluated") {
      unavailable ??= evaluation.status;
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
  if (!context.controlledWriter || !sameRecipient(observation.recipient, context.recipient)) {
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
    !sameRecipient(observation.recipient, context.recipient) ||
    evaluations.some((evaluation) => !preparedBelongsTo(evaluation.prepared, observation))
  ) return { status: "unattributed", findings: [] };
  if (
    evaluations.length === 0 ||
    evaluations.some((evaluation) => !validEvaluation(evaluation))
  ) return { status: "unavailable", findings: [] };
  if (!(yield* verifyObservationRoot(observation)) || !(yield* authorize(observation.root, context))) {
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
    if (authority !== undefined) {
      for (const evaluation of retained) {
        if (!(yield* authority.isCurrentWork(evaluation.prepared))) {
          return { status: "stale", findings: [] };
        }
      }
    }
    return {
      status: "current",
      evaluations: retained,
      findings: retained.flatMap(({ findings }) => findings),
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
    !sameRecipient(observation.recipient, context.recipient) ||
    !(yield* verifyObservationRoot(observation)) ||
    !(yield* authorize(observation.root, context))
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
