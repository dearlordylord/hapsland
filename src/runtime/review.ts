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
import { Consent, rootRelativePath } from "./consent.ts";
import type { ReviewSettings } from "./review-config.ts";
import { resolveConfiguration } from "../configuration/resolve.ts";
import { selectGlobalPath } from "../policy/file-policy.ts";
import { applicableRules, deriveAdvice } from "../policy/rules.ts";
import { ReviewBackend } from "../ports/review-backend.ts";
import { DedupeStore } from "../ports/dedupe-store.ts";
import { SnapshotReader } from "../ports/snapshot-reader.ts";
import { validateAssessment } from "./assessment.ts";

const MAX_FINDINGS = 5;
const BACKEND_TIMEOUT = 1_000;

export type ReviewContext =
  | { readonly _tag: "unscoped" }
  | {
      readonly _tag: "authorized";
      readonly root: string;
      readonly consent: Consent.Interface;
      readonly settings: ReviewSettings;
    };

const bounded = (value: string) => value.replaceAll(/\s+/g, " ").slice(0, 300);

const fingerprint = (eventId: string, snapshot: SnapshotRef) =>
  createHash("sha256")
    .update(`${eventId}\0${snapshot.path}\0${snapshot.contentHash}`)
    .digest("hex");

const reviewPath = Effect.fn("Review.reviewPath")(function* (
  request: ReviewRequest,
  path: string,
  context: ReviewContext,
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
  const policy =
    context._tag === "authorized" && context.settings.policy !== undefined
      ? context.settings.policy
      : resolveConfiguration([], context._tag === "authorized" ? context.root : request.event.cwd);
  const selection = selectGlobalPath(policy, relativePath);
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

  const rules = applicableRules(initial.value.content, policy, initial.value.path);
  if (rules.length === 0) {
    return {
      status: "skipped" as const,
      path: initial.value.path,
      reason: "no configured rule applies",
      code: "no_applicable_rule" as const,
    };
  }

  if (context._tag === "authorized") {
    const authorization = yield* context.consent.authorize(
      readRoot,
      context.settings.backend,
      context.settings.destination,
    );
    if (authorization.status !== "approved") {
      return {
        status: "skipped" as const,
        path: initial.value.path,
        reason:
          authorization.status === "unsupported"
            ? authorization.reason
            : "repository review consent is required; run the explicit enable operation",
        code:
          authorization.status === "unsupported"
            ? ("unsupported_repository" as const)
            : ("missing_consent" as const),
      };
    }
  }

  const evaluated = yield* backend
    .evaluate({
      path: initial.value.path,
      source: initial.value.content,
      rules,
    })
    .pipe(
      Effect.timeoutOption(
        `${context._tag === "authorized" ? context.settings.policy?.settings.deadlineMs.value ?? BACKEND_TIMEOUT : BACKEND_TIMEOUT} millis`,
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
      reason: "review backend timed out after 1000 ms",
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

  const snapshot = {
    path: initial.value.path,
    contentHash: initial.value.contentHash,
  };
  const reviewFingerprint = fingerprint(request.event.id, snapshot);
  const candidateAdvice = deriveAdvice(
    rules,
    assessment.success,
    snapshot,
    context._tag === "authorized"
      ? context.settings.policy?.settings.adviceBudget.value ?? MAX_FINDINGS
      : MAX_FINDINGS,
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
  const paths = [...new Set(request.event.paths)].sort();
  const concurrency =
    context._tag === "authorized"
      ? context.settings.policy?.settings.concurrency.value ?? 4
      : 4;
  const results: ReadonlyArray<ReviewResult> = yield* Effect.forEach(
    paths,
    (path) => reviewPath(request, path, context),
    { concurrency },
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
      context._tag === "authorized"
        ? context.settings.policy?.settings.adviceBudget.value ?? MAX_FINDINGS
        : MAX_FINDINGS,
    );
  return { version: 1 as const, eventId: request.event.id, results, advice } satisfies ReviewResponse;
});
