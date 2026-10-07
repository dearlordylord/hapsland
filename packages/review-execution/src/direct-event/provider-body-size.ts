import { JEV_PROVIDER } from "@hapsland/runtime-environment/runtime/backend"
import type { Decision } from "effect/ai"
import type { ReviewModel } from "@hapsland/review-definition/review-providers/catalog"
import { probabilityRequest } from "../review-providers/request.ts"

/** Actual model-specific encoded HTTP body, shared with the Cloudflare transport. */
export const encodedProviderHttpBodyBytes = (
  state: unknown,
  rules: ReadonlyArray<{ readonly id: string; readonly decision: Decision.Probability }>,
  model: ReviewModel = JEV_PROVIDER.defaultModel
): number => probabilityRequest(model, state, rules)?.bytes ?? Number.POSITIVE_INFINITY
