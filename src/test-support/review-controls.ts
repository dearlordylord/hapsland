import { Layer } from "effect"
import { ResidentReviewControls, defaultReviewControls, type ReviewControls } from "../resident/review-controls.ts"

/** Native fixtures supply Effect coordination without adding production hooks. */
export const reviewControlsLayer = (controls: Partial<ReviewControls>) =>
  Layer.succeed(ResidentReviewControls, ResidentReviewControls.of({ ...defaultReviewControls, ...controls }))
