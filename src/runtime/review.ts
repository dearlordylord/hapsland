import { createHash } from "node:crypto";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type {
  ReviewRequest,
  ReviewResponse,
  ReviewResult,
  SnapshotRef,
} from "../domain/contracts.ts";
import { rootRelativePath } from "../repository/root.ts";
import type { Consent } from "./consent.ts";
import type { ReviewSettings } from "./review-config.ts";
import { resolveConfiguration } from "../configuration/resolve.ts";
import { DEFAULT_RUNTIME_SETTINGS } from "../configuration/types.ts";
import type { ResolvedPolicy } from "../configuration/types.ts";
import { selectGlobalPath } from "../policy/file-policy.ts";
import { applicableRules, deriveAdvice } from "../policy/rules.ts";
import { ReviewBackend } from "../ports/review-backend.ts";
import { DedupeStore } from "../ports/dedupe-store.ts";
import { SnapshotReader } from "../ports/snapshot-reader.ts";
import { validateAssessment } from "./assessment.ts";

export type ReviewContext =
  | { readonly _tag: "unscoped" }
  | {
      readonly _tag: "authorized";
      readonly root: string;
      /** Retained only for callers that still supply the retired grant service. */
      readonly consent?: Consent.Interface;
      readonly settings: ReviewSettings;
      /** Reload file settings at egress and advice boundaries in installed entry points. */
      readonly reloadPolicy?: () => Effect.Effect<ResolvedPolicy, unknown>;
    };

type CapturedRuntimeSettings = {
  readonly policy: ResolvedPolicy;
  readonly deadlineMs: number;
  readonly concurrency: number;
  readonly adviceBudget: number;
  readonly invalid: string | undefined;
};

const runtimeSettingError = (
  field: string,
  value: number,
  minimum: number,
  maximum: number,
): string | undefined =>
  Number.isFinite(value) &&
  Number.isInteger(value) &&
  value >= minimum &&
  value <= maximum
    ? undefined
    : `settings.${field} must be a finite integer between ${minimum} and ${maximum}`;

/** Capture all event-wide execution controls before starting any file work. */
const captureRuntimeSettings = (
  context: ReviewContext,
  cwd: string,
): CapturedRuntimeSettings => {
  if (context._tag === "unscoped") {
    return {
      policy: resolveConfiguration([], cwd),
      deadlineMs: DEFAULT_RUNTIME_SETTINGS.deadlineMs,
      concurrency: DEFAULT_RUNTIME_SETTINGS.concurrency,
      adviceBudget: DEFAULT_RUNTIME_SETTINGS.adviceBudget,
      invalid: undefined,
    };
  }

  const policy = context.settings.configuration.policy;
  const deadlineMs = policy.settings.deadlineMs.value;
  const concurrency = policy.settings.concurrency.value;
  const adviceBudget = policy.settings.adviceBudget.value;
  const transientRetries = policy.settings.transientRetries.value;
  const invalid =
    runtimeSettingError("deadlineMs", deadlineMs, 1, 60_000) ??
    runtimeSettingError("concurrency", concurrency, 1, 32) ??
    runtimeSettingError("adviceBudget", adviceBudget, 0, 100) ??
    runtimeSettingError("transientRetries", transientRetries, 0, 5);
  return {
    policy,
    deadlineMs,
    concurrency,
    adviceBudget,
    invalid,
  };
};

const bounded = (value: string) => value.replaceAll(/\s+/g, " ").slice(0, 300);

const fingerprint = (eventId: string, repositoryRoot: string, snapshot: SnapshotRef) =>
  createHash("sha256")
    .update(`${repositoryRoot}\0${eventId}\0${snapshot.path}\0${snapshot.contentHash}`)
    .digest("hex");

const reviewPath = Effect.fn("Review.reviewPath")(function* (
  request: ReviewRequest,
  path: string,
  context: ReviewContext,
  runtime: CapturedRuntimeSettings,
) {
  const relativePath =
    context._tag === "unscoped"
      ? path
      : rootRelativePath(context.root, request.event.cwd, path);
  if (relativePath === undefined) {
    return {
      status: "skipped" as const,
      path,
      reason: "path is outside the repository working tree",
      code: "excluded" as const,
    };
  }
  const selection = selectGlobalPath(runtime.policy, relativePath);
  if (!selection.selected) {
    return {
      status: "skipped" as const,
      path: relativePath,
      reason:
        selection.reason === "protected"
          ? selection.gate === "sensitive"
            ? "sensitive path excluded"
            : selection.gate === "generated-or-vendor"
              ? "generated, build, or vendored path excluded"
              : selection.gate === "file-extension"
                ? "file extension is not configured for review"
                : "path is outside the repository working tree"
          : selection.reason === "empty-includes"
            ? "no files are selected by the effective include list"
            : selection.reason === "not-included"
              ? "path does not match the effective include list"
              : "path matches an effective exclusion",
      code: "excluded" as const,
    };
  }

  const currentSelection = () => Effect.gen(function* () {
    const policy = context._tag === "authorized" && context.reloadPolicy !== undefined
      ? yield* context.reloadPolicy().pipe(Effect.result)
      : Result.succeed(runtime.policy);
    if (Result.isFailure(policy)) return "unavailable" as const;
    return selectGlobalPath(policy.success, relativePath).selected ? "selected" as const : "excluded" as const;
  });
  const beforeRead = yield* currentSelection();
  if (beforeRead === "excluded") return {
    status: "skipped" as const,
    path: relativePath,
    reason: "file is no longer selected by current settings",
    code: "excluded" as const,
  };
  if (beforeRead === "unavailable") return {
    status: "unavailable" as const,
    path: relativePath,
    reason: "review configuration is unavailable before source read",
    retryable: true,
    code: "invalid_configuration" as const,
  };

  const snapshots = yield* SnapshotReader.Service;
  const backend = yield* ReviewBackend.Service;
  const dedupe = yield* DedupeStore.Service;
  const readRoot = context._tag === "authorized" ? context.root : request.event.cwd;
  const initial = yield* snapshots.read(readRoot, relativePath).pipe(Effect.option);
  if (Option.isNone(initial)) {
    return {
      status: "skipped" as const,
      path: relativePath,
      reason: "file is missing, non-regular, outside the repository, or oversized",
      code: "excluded" as const,
    };
  }

  const rules = applicableRules(
    initial.value.content,
    initial.value.path,
    context._tag === "authorized" && context.settings.rules !== undefined
      ? context.settings.rules
      : undefined,
  );
  if (rules.length === 0) {
    return {
      status: "skipped" as const,
      path: initial.value.path,
      reason: "no configured rule applies",
      code: "no_applicable_rule" as const,
    };
  }

  const beforeDispatch = yield* currentSelection();
  if (beforeDispatch === "excluded") return {
    status: "skipped" as const,
    path: relativePath,
    reason: "file is no longer selected by current settings",
    code: "excluded" as const,
  };
  if (beforeDispatch === "unavailable") return {
    status: "unavailable" as const,
    path: relativePath,
    reason: "review configuration is unavailable before dispatch",
    retryable: true,
    code: "invalid_configuration" as const,
  };

  const evaluated = yield* backend
    .evaluate({
      path: initial.value.path,
      source: initial.value.content,
      rules,
    })
    .pipe(
      Effect.timeoutOption(
        `${runtime.deadlineMs} millis`,
      ),
      Effect.result,
    );

  if (Result.isFailure(evaluated)) {
    return {
      status: "unavailable" as const,
      path: initial.value.path,
      reason: bounded(evaluated.failure.reason),
      retryable: evaluated.failure.retryable,
      code: "backend_unavailable" as const,
    };
  }
  if (Option.isNone(evaluated.success)) {
    return {
      status: "unavailable" as const,
      path: initial.value.path,
      reason: `review backend timed out after ${runtime.deadlineMs} ms`,
      retryable: true,
      code: "review_timeout" as const,
    };
  }

  const response = evaluated.success.value;
  const assessment = yield* validateAssessment(rules, response.answers).pipe(
    Effect.result,
  );
  if (Result.isFailure(assessment)) {
    return {
      status: "unavailable" as const,
      path: initial.value.path,
      reason: bounded(assessment.failure.reason),
      retryable: false,
      code: "backend_unavailable" as const,
    };
  }

  const current = yield* snapshots
    .read(readRoot, initial.value.path)
    .pipe(Effect.option);
  if (
    Option.isNone(current) ||
    current.value.contentHash !== initial.value.contentHash
  ) {
    return {
      status: "unavailable" as const,
      path: initial.value.path,
      reason: "file changed while review was in progress; advice is stale",
      retryable: true,
      code: "stale_snapshot" as const,
    };
  }

  const beforeAdvice = yield* currentSelection();
  if (beforeAdvice !== "selected") return {
    status: "unavailable" as const,
    path: initial.value.path,
    reason: beforeAdvice === "excluded"
      ? "file is no longer selected by current settings; advice is stale"
      : "review configuration is unavailable before advice",
    retryable: true,
    code: beforeAdvice === "excluded" ? "stale_snapshot" as const : "invalid_configuration" as const,
  };

  const snapshot = {
    path: initial.value.path,
    contentHash: initial.value.contentHash,
  };
  const reviewFingerprint = fingerprint(
    request.event.id,
    context._tag === "authorized" ? context.root : request.event.cwd,
    snapshot,
  );
  const candidateAdvice = deriveAdvice(
    rules,
    assessment.success,
    snapshot,
    // Keep every per-file candidate. The edit-wide budget is applied once,
    // after all file results have been combined and deterministically sorted.
    rules.length,
  );
  const firstDelivery =
    candidateAdvice.length === 0
      ? true
      : yield* dedupe.claim(reviewFingerprint);
  return {
    status: "reviewed" as const,
    snapshot,
    assessment: assessment.success,
    advice: firstDelivery ? candidateAdvice : [],
    backend: response.backend,
    fingerprint: reviewFingerprint,
  };
});

export const review = Effect.fn("Review.run")(function* (
  request: ReviewRequest,
  context: ReviewContext = { _tag: "unscoped" },
) {
  const runtime = captureRuntimeSettings(context, request.event.cwd);
  const seenPaths = new Set<string>();
  const paths = request.event.paths
    .filter((path) => {
      // Host adapters normally provide repository-relative paths, but resolving
      // aliases here also prevents `./src/a.ts` and `src/../src/a.ts` from
      // becoming two reviews of one snapshot.
      const normalized = rootRelativePath(
        context._tag === "authorized" ? context.root : request.event.cwd,
        request.event.cwd,
        path,
      );
      const key = normalized === undefined ? `outside:${path}` : normalized;
      if (seenPaths.has(key)) return false;
      seenPaths.add(key);
      return true;
    })
    .sort();
  if (runtime.invalid !== undefined) {
    const results: ReadonlyArray<ReviewResult> = paths.map((path) => ({
      status: "unavailable" as const,
      path,
      reason: `review configuration is invalid (${runtime.invalid})`,
      retryable: false,
      code: "invalid_configuration" as const,
    }));
    return {
      version: 1 as const,
      eventId: request.event.id,
      results,
      advice: [],
    } satisfies ReviewResponse;
  }
  const results: ReadonlyArray<ReviewResult> = yield* Effect.forEach(
    paths,
    (path) => reviewPath(request, path, context, runtime),
    { concurrency: runtime.concurrency },
  );
  const advice = results
    .flatMap((result) => (result.status === "reviewed" ? result.advice : []))
    .sort(
      (left, right) =>
        right.probability - left.probability ||
        left.snapshot.path.localeCompare(right.snapshot.path) ||
        left.ruleId.localeCompare(right.ruleId),
    )
    .slice(
      0,
      runtime.adviceBudget,
    );
  return { version: 1 as const, eventId: request.event.id, results, advice } satisfies ReviewResponse;
});
