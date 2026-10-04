/** Runtime-neutral text. Native adapters choose envelopes and delivery authority. */
export const REVIEW_FEEDBACK_HEADING = "Hapsland"
export const REVIEW_FEEDBACK_INSTRUCTIONS = "Check these findings. Fix valid issues and verify; otherwise explain why."

export interface FeedbackFinding {
  readonly path: string
  readonly declaration: string
  readonly message: string
}

/** Notice-only responses describe operational limits without requesting a code repair. */
export const formatReviewFeedback = (
  findings: ReadonlyArray<FeedbackFinding>,
  notices: ReadonlyArray<string> = []
): string =>
  [
    REVIEW_FEEDBACK_HEADING,
    ...(findings.length === 0 ? [] : [REVIEW_FEEDBACK_INSTRUCTIONS]),
    ...findings.map((finding) => `${finding.path} :: ${finding.declaration}: ${finding.message}`),
    ...notices
  ].join("\n")
