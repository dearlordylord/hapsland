import { Context, Effect, Layer, Schema } from "effect"
import type { PreparedUnit } from "@hapsland/review-definition/direct-event/model"

const ReviewControlPhase = Schema.Literals([
  "beforeRevalidate",
  "beforeEvaluate",
  "workspaceReserved",
  "advicePending",
  "beforeFinalRevalidate",
  "beforeResponseHandoff"
])
export type ReviewControlPhase = typeof ReviewControlPhase.Type

export class ReviewControlError extends Schema.TaggedError<ReviewControlError>()("ReviewControlError", {
  phase: ReviewControlPhase
}) {}

export interface ReviewControls {
  readonly beforeRevalidate: (adviceId: string) => Effect.Effect<void, ReviewControlError>
  readonly beforeEvaluate: (prepared: PreparedUnit) => Effect.Effect<void, ReviewControlError>
  readonly afterRevalidationWorkspaceReserved: (adviceId: string) => Effect.Effect<void, ReviewControlError>
  readonly afterAdvicePending: (adviceId: string) => Effect.Effect<void, ReviewControlError>
  readonly beforeFinalRevalidate: (adviceId: string) => Effect.Effect<void, ReviewControlError>
  readonly beforeResponseHandoff: () => Effect.Effect<void, ReviewControlError>
}

/** Local coordination only; never supplied by IPC or used as review authority. */
export class ResidentReviewControls extends Context.Service<ResidentReviewControls, ReviewControls>()(
  "@hapsland/ResidentReviewControls"
) {}

export const defaultReviewControls = ResidentReviewControls.of({
  beforeRevalidate: Effect.fn("ResidentReviewControls.beforeRevalidate")((_adviceId: string) => Effect.void),
  beforeEvaluate: Effect.fn("ResidentReviewControls.beforeEvaluate")((_prepared: PreparedUnit) => Effect.void),
  afterRevalidationWorkspaceReserved: Effect.fn("ResidentReviewControls.workspaceReserved")(
    (_adviceId: string) => Effect.void
  ),
  afterAdvicePending: Effect.fn("ResidentReviewControls.advicePending")((_adviceId: string) => Effect.void),
  beforeFinalRevalidate: Effect.fn("ResidentReviewControls.beforeFinalRevalidate")((_adviceId: string) => Effect.void),
  beforeResponseHandoff: Effect.fn("ResidentReviewControls.beforeResponseHandoff")(() => Effect.void)
})

export const reviewControlsLayer = Layer.succeed(ResidentReviewControls, defaultReviewControls)
