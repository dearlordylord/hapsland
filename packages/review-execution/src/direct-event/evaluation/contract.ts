import type { PreparedUnit } from "@hapsland/review-definition/direct-event/model"
import type { Finding } from "@hapsland/delivery-output/direct-event/output"

// One completed evaluation; the evaluation workflow and freshness publication
// share this Review Execution record without introducing a reverse dependency.
export type EvaluatedUnit = { readonly prepared: PreparedUnit; readonly findings: ReadonlyArray<Finding> }
