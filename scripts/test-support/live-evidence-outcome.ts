import { REVIEW_FEEDBACK_HEADING, REVIEW_FEEDBACK_INSTRUCTIONS } from "@hapsland/delivery-output/feedback/message"
type Stats = {
  readonly status: "stats"
  readonly queued: number
  readonly running: number
  readonly pendingAdvice: number
  readonly pendingFindingBatches: number
  readonly pendingOperationalNotices: number
  readonly pendingEvaluations: number
  readonly successfulCacheEntries: number
}
export type HostOutputKind = "none" | "invalid" | "findings" | "operational-notice" | "findings-and-operational-notice"
const record = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined
const outputBodyKind = (findings: number, notices: number): HostOutputKind => {
  if (findings > 0 && notices > 0) return "findings-and-operational-notice"
  if (findings > 0) return "findings"
  if (notices > 0) return "operational-notice"
  return "invalid"
}
export const classifyHookOutput = (value: unknown): HostOutputKind => {
  const output = record(value)
  const hook = record(output?.hookSpecificOutput)
  if (hook === undefined) return Object.keys(output ?? {}).length === 0 ? "none" : "invalid"
  if (hook.hookEventName !== "PostToolUse" || typeof hook.additionalContext !== "string") return "invalid"
  const lines = hook.additionalContext.split("\n").filter((line) => line.length > 0)
  if (lines[0] !== REVIEW_FEEDBACK_HEADING) return "invalid"
  const body = lines.slice(1).filter((line) => line !== REVIEW_FEEDBACK_INSTRUCTIONS)
  const notices = body.filter((line) => line.startsWith("Operational notice:"))
  const findings = body.length - notices.length
  return outputBodyKind(findings, notices.length)
}
const attemptedOutcomes = {
  findings: "completed-findings-output-attempted-unacknowledged",
  "findings-and-operational-notice": "completed-findings-and-operational-notice-attempted-unacknowledged",
  "operational-notice": "completed-clear-with-operational-notice-attempted-unacknowledged",
  none: undefined,
  invalid: undefined
} as const

const failedEvaluationOutcome = (kind: HostOutputKind, terminal: Stats) => {
  if (kind === "operational-notice") return "operational-failure-notice-attempted-unacknowledged" as const
  return terminal.pendingOperationalNotices > 0
    ? ("operational-failure-notice-pending" as const)
    : ("evaluation-failed-or-unobserved" as const)
}

const pendingOutcome = (terminal: Stats) => {
  if (terminal.pendingFindingBatches > 0 && terminal.pendingOperationalNotices > 0)
    return "completed-findings-and-operational-notice-pending" as const
  if (terminal.pendingFindingBatches > 0) return "completed-findings-pending" as const
  if (terminal.pendingOperationalNotices > 0) return "completed-clear-operational-notice-pending" as const
  return terminal.pendingAdvice === 0
    ? ("completed-clear-no-advice" as const)
    : ("successful-evaluation-output-unclassified" as const)
}

const evaluationPending = (terminal: Stats): boolean =>
  terminal.queued > 0 || terminal.running > 0 || terminal.pendingEvaluations > 0

export const classifyLiveOutcome = (input: {
  readonly admissionExitCode: number | null
  readonly hostOutputKind: HostOutputKind
  readonly stats: Stats | undefined
}) => {
  if (input.admissionExitCode !== 0)
    return { contractOutcome: "admission-failed", successfulEvaluation: false } as const
  const terminal = input.stats
  if (terminal === undefined) return { contractOutcome: "completion-unobserved", successfulEvaluation: false } as const
  if (evaluationPending(terminal))
    return { contractOutcome: "delayed-completion-unobserved", successfulEvaluation: false } as const
  if (terminal.successfulCacheEntries !== 1)
    return {
      contractOutcome: failedEvaluationOutcome(input.hostOutputKind, terminal),
      successfulEvaluation: false
    } as const
  const attempted = attemptedOutcomes[input.hostOutputKind]
  if (attempted !== undefined) return { contractOutcome: attempted, successfulEvaluation: true } as const
  return {
    contractOutcome:
      input.hostOutputKind === "none" ? pendingOutcome(terminal) : "successful-evaluation-output-unclassified",
    successfulEvaluation: true
  } as const
}
