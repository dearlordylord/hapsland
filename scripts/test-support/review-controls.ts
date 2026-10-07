import { Layer } from "effect"
import {
  ResidentReviewControls,
  defaultReviewControls,
  type ReviewControls
} from "@hapsland/resident-runtime/resident/review-controls"

/** Native fixtures supply Effect coordination without adding production hooks. */
export const reviewControlsLayer = (controls: Partial<ReviewControls>) =>
  Layer.succeed(ResidentReviewControls, ResidentReviewControls.of({ ...defaultReviewControls, ...controls }))
