import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { Decision, DecisionModel } from "effect/unstable/ai";
import type { CompiledRule } from "../rules/compiler.ts";
import { applicableRules, configuredRules } from "../policy/rules.ts";
import type { Consent } from "../runtime/consent.ts";
import type { ReviewSettings } from "../runtime/review-config.ts";
import { adaptCodexAdd } from "./adapter.ts";
import { analyzeSingleType } from "./analyzer.ts";
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
  readonly captureHooks?: CaptureHooks;
  readonly beforeDispatch?: Effect.Effect<void>;
  readonly beforeHandoff?: Effect.Effect<void>;
};

export type PrepareOutcome =
  | { readonly status: "ready"; readonly path: string; readonly prepared: PreparedUnit }
  | { readonly status: "skipped"; readonly path: string };

export type Finding = {
  readonly path: string;
  readonly declaration: string;
  readonly ruleId: string;
  readonly probability: number;
  readonly message: string;
  readonly semanticIdentity: string;
};

export type DirectReviewResult =
  | { readonly status: "unsupported"; readonly output: undefined }
  | { readonly status: "unattributed"; readonly output: undefined }
  | { readonly status: "no-advice"; readonly output: undefined }
  | { readonly status: "unavailable"; readonly reason: "consent" | "backend" | "timeout" | "stale"; readonly output: undefined }
  | {
      readonly status: "submitted";
      readonly submission: "attempted-unacknowledged";
      readonly findings: ReadonlyArray<Finding>;
      readonly output: unknown;
    };

const sameRecipient = (left: DirectRecipient, right: DirectRecipient): boolean =>
  canonicalValue(left) === canonicalValue(right);

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

export const prepareObservation = Effect.fn("DirectEvent.prepareObservation")(function* (
  observation: DirectObservation,
  context: DirectReviewContext,
) {
  const outcomes: Array<PrepareOutcome> = [];
  for (const candidate of observation.candidates) {
    const eligible = yield* eligibleNamedPath(
      observation.root,
      candidate.path,
      currentPolicy(context),
    );
    if (eligible === undefined) {
      outcomes.push({ status: "skipped", path: candidate.path });
      continue;
    }
    const captured = yield* captureStable(
      observation.root,
      eligible,
      context.captureHooks,
    );
    if (captured === undefined) {
      outcomes.push({ status: "skipped", path: eligible.relativePath });
      continue;
    }
    const declaration = analyzeSingleType(eligible.relativePath, captured.text);
    if (declaration === undefined) {
      outcomes.push({ status: "skipped", path: eligible.relativePath });
      continue;
    }
    const rules = applicableRules(
      declaration.source,
      eligible.relativePath,
      currentRules(context),
    );
    if (rules.length === 0) {
      outcomes.push({ status: "skipped", path: eligible.relativePath });
      continue;
    }
    const input = freezeInput({
      contract: DIRECT_EVENT_INPUT_CONTRACT,
      path: eligible.relativePath,
      declaration,
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
  return outcomes as ReadonlyArray<PrepareOutcome>;
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
): unknown => ({
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: [
      "Advisory direct-event review (submission attempted; model visibility is unacknowledged):",
      ...findings.map((finding) =>
        `${finding.path} [${finding.ruleId}, p=${finding.probability.toFixed(2)}]: ${finding.message}`),
    ].join("\n"),
  },
});

/** Complete narrow adapter → capture → DecisionModel → semantic handoff slice. */
export const reviewCodexAdd = Effect.fn("DirectEvent.reviewCodexAdd")(function* (
  nativeEvent: unknown,
  context: DirectReviewContext,
) {
  const observation = yield* adaptCodexAdd(nativeEvent);
  if (observation === undefined) {
    return { status: "unsupported", output: undefined } satisfies DirectReviewResult;
  }
  if (!context.controlledWriter || !sameRecipient(observation.recipient, context.recipient)) {
    return { status: "unattributed", output: undefined } satisfies DirectReviewResult;
  }
  if (!(yield* authorize(observation.root, context))) {
    return { status: "unavailable", reason: "consent", output: undefined } satisfies DirectReviewResult;
  }
  const prepared = yield* prepareObservation(observation, context);
  const ready = prepared.filter(
    (outcome): outcome is Extract<PrepareOutcome, { status: "ready" }> =>
      outcome.status === "ready",
  );
  if (ready.length === 0) {
    return { status: "no-advice", output: undefined } satisfies DirectReviewResult;
  }
  const findings: Array<Finding> = [];
  for (const outcome of ready) {
    yield* context.beforeDispatch ?? Effect.void;
    // Consent is mutable user authority and is checked at the actual egress edge.
    if (!(yield* authorize(observation.root, context))) {
      return { status: "unavailable", reason: "consent", output: undefined } satisfies DirectReviewResult;
    }
    const evaluation = yield* evaluatePrepared(outcome.prepared);
    if (evaluation.status !== "evaluated") {
      return {
        status: "unavailable",
        reason: evaluation.status,
        output: undefined,
      } satisfies DirectReviewResult;
    }
    findings.push(...evaluation.findings);
  }
  if (findings.length === 0) {
    return { status: "no-advice", output: undefined } satisfies DirectReviewResult;
  }
  yield* context.beforeHandoff ?? Effect.void;
  if (!context.controlledWriter || !sameRecipient(observation.recipient, context.recipient)) {
    return { status: "unattributed", output: undefined } satisfies DirectReviewResult;
  }
  // Repeat the complete preparation contract. Whole-file hashes never decide
  // freshness: only the complete re-extracted semantic ReviewInput does.
  const revalidated = yield* prepareObservation(observation, context);
  const currentByPath = new Map(
    revalidated.flatMap((outcome) =>
      outcome.status === "ready" ? [[outcome.path, outcome.prepared.identity] as const] : []),
  );
  if (ready.some((outcome) => currentByPath.get(outcome.path) !== outcome.prepared.identity)) {
    return { status: "unavailable", reason: "stale", output: undefined } satisfies DirectReviewResult;
  }
  return {
    status: "submitted",
    submission: "attempted-unacknowledged",
    findings,
    output: toCodexDirectEventOutput(findings),
  } satisfies DirectReviewResult;
});

export const currentTime = Clock.currentTimeMillis;
