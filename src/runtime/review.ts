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
import {
  DEFAULT_BACKEND,
  DEFAULT_DESTINATION,
  loadReviewSettings,
  type ReviewSettings,
} from "./review-config.ts";
import { ineligibleReason } from "../policy/eligibility.ts";
import { applicableRules, deriveAdvice } from "../policy/rules.ts";
import { ReviewBackend } from "../ports/review-backend.ts";
import { DedupeStore } from "../ports/dedupe-store.ts";
import { SnapshotReader } from "../ports/snapshot-reader.ts";
import { validateAssessment } from "./assessment.ts";

const MAX_FINDINGS = 5;
const BACKEND_TIMEOUT = "1 second";

const bounded = (value: string) => value.replaceAll(/\s+/g, " ").slice(0, 300);

const fingerprint = (eventId: string, snapshot: SnapshotRef) =>
  createHash("sha256")
    .update(`${eventId}\0${snapshot.path}\0${snapshot.contentHash}`)
    .digest("hex");

const reviewPath = Effect.fn("Review.reviewPath")(function* (
  request: ReviewRequest,
  path: string,
  context: {
    readonly root?: string;
    readonly consent?: Consent.Interface;
    readonly settings?: ReviewSettings;
  },
) {
  const relativePath =
    context.root === undefined
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
  const excluded = ineligibleReason(relativePath);
  if (excluded !== undefined) {
    return {
      status: "skipped" as const,
      path: relativePath,
      reason: excluded,
      code: "excluded" as const,
    };
  }

  const snapshots = yield* SnapshotReader.Service;
  const backend = yield* ReviewBackend.Service;
  const dedupe = yield* DedupeStore.Service;
  const readRoot = context.root ?? request.event.cwd;
  const initial = yield* snapshots.read(readRoot, relativePath).pipe(Effect.option);
  if (Option.isNone(initial)) {
    return {
      status: "skipped" as const,
      path: relativePath,
      reason: "file is missing, non-regular, outside the repository, or oversized",
      code: "excluded" as const,
    };
  }

  const rules = applicableRules(initial.value.content);
  if (rules.length === 0) {
    return {
      status: "skipped" as const,
      path: initial.value.path,
      reason: "no configured rule applies",
      code: "no_applicable_rule" as const,
    };
  }

  if (context.consent !== undefined && context.settings !== undefined) {
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
    .pipe(Effect.timeoutOption(BACKEND_TIMEOUT), Effect.result);

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
    .read(request.event.cwd, initial.value.path)
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
    MAX_FINDINGS,
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
) {
  const consent = yield* Effect.serviceOption(Consent.Service);
  let context: {
    readonly root?: string;
    readonly consent?: Consent.Interface;
    readonly settings?: ReviewSettings;
  } = {};
  if (Option.isSome(consent)) {
    const preflight = yield* Effect.gen(function* () {
      const discovered = yield* consent.value.discoverRoot(request.event.cwd).pipe(Effect.result);
      if (Result.isFailure(discovered)) {
        return {
          root: undefined,
          settings: {
            backend: DEFAULT_BACKEND,
            destination: DEFAULT_DESTINATION,
            credentialEnvVar: "TYPESAFE_API_KEY",
            projectRequestedConsent: false,
          } satisfies ReviewSettings,
          authorization: {
            status: "unsupported" as const,
            reason: "review is unsupported outside a discoverable Git working tree",
          },
        };
      }
      const root = discovered.success;
      const settings = yield* loadReviewSettings(root);
      const authorization = yield* consent.value.authorize(
        request.event.cwd,
        settings.backend,
        settings.destination,
      );
      return { root, settings, authorization };
    }).pipe(Effect.result);
    if (Result.isFailure(preflight)) {
      const results: ReadonlyArray<ReviewResult> = request.event.paths.map((path) => ({
        status: "unavailable" as const,
        path,
        reason: "review configuration or consent state is unavailable",
        retryable: false,
        code: "invalid_configuration" as const,
      }));
      return { version: 1 as const, eventId: request.event.id, results, advice: [] } satisfies ReviewResponse;
    }
    const { root, settings, authorization } = preflight.success;
    if (authorization.status !== "approved") {
      const results: ReadonlyArray<ReviewResult> = request.event.paths.map((path) => ({
        status: "skipped" as const,
        path,
        reason:
          authorization.status === "unsupported"
            ? authorization.reason
            : "repository review consent is required; run the explicit enable operation",
        code:
          authorization.status === "unsupported"
            ? ("unsupported_repository" as const)
            : ("missing_consent" as const),
      }));
      return { version: 1 as const, eventId: request.event.id, results, advice: [] } satisfies ReviewResponse;
    }
    if (root === undefined) {
      const results: ReadonlyArray<ReviewResult> = request.event.paths.map((path) => ({
        status: "unavailable" as const,
        path,
        reason: "review working-tree identity is unavailable",
        retryable: false,
        code: "invalid_configuration" as const,
      }));
      return { version: 1 as const, eventId: request.event.id, results, advice: [] } satisfies ReviewResponse;
    }
    context = { root, consent: consent.value, settings };
  }
  const paths = [...new Set(request.event.paths)].sort();
  const results: ReadonlyArray<ReviewResult> = yield* Effect.forEach(
    paths,
    (path) => reviewPath(request, path, context),
    { concurrency: 4 },
  );
  const advice = results
    .flatMap((result) => (result.status === "reviewed" ? result.advice : []))
    .sort(
      (left, right) =>
        right.probability - left.probability ||
        left.snapshot.path.localeCompare(right.snapshot.path) ||
        left.ruleId.localeCompare(right.ruleId),
    )
    .slice(0, MAX_FINDINGS);
  return { version: 1 as const, eventId: request.event.id, results, advice } satisfies ReviewResponse;
});
