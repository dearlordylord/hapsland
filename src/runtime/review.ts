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
) {
  const excluded = ineligibleReason(path);
  if (excluded !== undefined) {
    return {
      status: "skipped" as const,
      path,
      reason: excluded,
    };
  }

  const snapshots = yield* SnapshotReader.Service;
  const backend = yield* ReviewBackend.Service;
  const dedupe = yield* DedupeStore.Service;
  const initial = yield* snapshots.read(request.event.cwd, path).pipe(Effect.option);
  if (Option.isNone(initial)) {
    return {
      status: "skipped" as const,
      path,
      reason: "file is missing, non-regular, outside the repository, or oversized",
    };
  }

  const rules = applicableRules(initial.value.content);
  if (rules.length === 0) {
    return {
      status: "skipped" as const,
      path: initial.value.path,
      reason: "no configured rule applies",
    };
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
    };
  }
  if (Option.isNone(evaluated.success)) {
    return {
      status: "unavailable" as const,
      path: initial.value.path,
      reason: "review backend timed out after 1000 ms",
      retryable: true,
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
  const paths = [...new Set(request.event.paths)].sort();
  const results: ReadonlyArray<ReviewResult> = yield* Effect.forEach(
    paths,
    (path) => reviewPath(request, path),
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
