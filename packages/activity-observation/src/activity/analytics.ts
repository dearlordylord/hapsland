import { createHash, randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import * as Schema from "effect/Schema"
import type { DirectAdvicee } from "@hapsland/native-observation/direct-event/observation"
import { activityRepositoryKey, activitySessionKey, pruneActivityStore } from "./storage.ts"

export const MAX_ANALYTICS_DETAILS = 256
const Count = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }))
const Timestamp = Count.check(Schema.isBetween({ minimum: 0, maximum: 8_640_000_000_000_000 }))
const Hash = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
export const AnalyticsKind = Schema.Literals([
  "request-started",
  "request-clear",
  "request-findings",
  "request-failed",
  "request-timeout",
  "request-interrupted",
  "request-never-sent",
  "cache-hit",
  "joined-review",
  "skipped-candidate",
  "incomplete-candidate",
  "submitted",
  "work-discarded",
  "preparation-failed",
  "capacity-rejected",
  "review-unavailable"
])
export type AnalyticsKind = typeof AnalyticsKind.Type
const RuleId = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(128),
  Schema.isPattern(/^[a-zA-Z0-9_./-]+$/)
)
const Detail = Schema.Struct({
  at: Timestamp,
  kind: AnalyticsKind,
  eventKey: Hash,
  childKey: Hash,
  backend: Schema.Literals(["jev", "controlled"]),
  findings: Count,
  ruleIds: Schema.Array(RuleId).check(Schema.isMaxLength(64)),
  ruleIdsTruncated: Schema.Boolean
})
export interface AnalyticsDetail extends Schema.Schema.Type<typeof Detail> {}
export const AnalyticsTotals = Schema.Struct({
  requestsStarted: Count,
  requestsSucceeded: Count,
  requestsFailed: Count,
  requestsTimedOut: Count,
  requestsInterrupted: Count,
  requestsNeverSent: Count,
  clearReviews: Count,
  reviewsWithFindings: Count,
  findings: Count,
  cacheHits: Count,
  joinedReviews: Count,
  skippedCandidates: Count,
  incompleteCandidates: Count,
  submissions: Count,
  submittedFindings: Count,
  discardedWork: Count,
  preparationFailures: Count,
  capacityRejections: Count,
  unavailableReviews: Count
})
export interface AnalyticsTotals extends Schema.Schema.Type<typeof AnalyticsTotals> {}
const Summary = Schema.Struct({
  version: Schema.Literal(1),
  repositoryKey: Hash,
  lifetimeKey: Hash,
  firstObservedAt: Timestamp,
  lastObservedAt: Timestamp,
  detailsDropped: Count,
  totals: AnalyticsTotals,
  controlledTotals: AnalyticsTotals,
  details: Schema.Array(Detail).check(Schema.isMaxLength(MAX_ANALYTICS_DETAILS))
})
interface Summary extends Schema.Schema.Type<typeof Summary> {}
export type SessionAnalytics = {
  readonly enabled: boolean
  readonly coverage: "observed-while-enabled"
  readonly unsettledRequests: number
  readonly status: "disabled" | "no-observation" | "recorded" | "unavailable"
  readonly totals: AnalyticsTotals
  readonly controlledTotals: AnalyticsTotals
  readonly details: ReadonlyArray<AnalyticsDetail>
  readonly detailsDropped: number
  readonly firstObservedAt?: number
  readonly lastObservedAt?: number
  readonly limitation?: "session-id-required" | "analytics-state-unreadable"
}
const hash = (value: string): string => createHash("sha256").update(value).digest("hex")
type MutableTotals = { -readonly [K in keyof AnalyticsTotals]: number }
const emptyTotals = (): MutableTotals => ({
  requestsStarted: 0,
  requestsSucceeded: 0,
  requestsFailed: 0,
  requestsTimedOut: 0,
  requestsInterrupted: 0,
  requestsNeverSent: 0,
  clearReviews: 0,
  reviewsWithFindings: 0,
  findings: 0,
  cacheHits: 0,
  joinedReviews: 0,
  skippedCandidates: 0,
  incompleteCandidates: 0,
  submissions: 0,
  submittedFindings: 0,
  discardedWork: 0,
  preparationFailures: 0,
  capacityRejections: 0,
  unavailableReviews: 0
})
const add = (a: number, b: number): number => Math.min(Number.MAX_SAFE_INTEGER, a + b)
const analyticsCounters: Readonly<Record<AnalyticsKind, ReadonlyArray<keyof AnalyticsTotals>>> = {
  "request-started": ["requestsStarted"],
  "request-clear": ["requestsSucceeded", "clearReviews"],
  "request-findings": ["requestsSucceeded", "reviewsWithFindings", "findings"],
  "request-failed": ["requestsFailed"],
  "request-timeout": ["requestsTimedOut"],
  "request-interrupted": ["requestsInterrupted"],
  "request-never-sent": ["requestsNeverSent"],
  "cache-hit": ["cacheHits"],
  "joined-review": ["joinedReviews"],
  "skipped-candidate": ["skippedCandidates"],
  "incomplete-candidate": ["incompleteCandidates"],
  "work-discarded": ["discardedWork"],
  "preparation-failed": ["preparationFailures"],
  "capacity-rejected": ["capacityRejections"],
  "review-unavailable": ["unavailableReviews"],
  submitted: ["submissions", "submittedFindings"]
}
const findingCounters = new Set<keyof AnalyticsTotals>(["findings", "submittedFindings"])
const increment = (totals: AnalyticsTotals, detail: AnalyticsDetail): AnalyticsTotals => {
  const result = { ...totals }
  for (const key of analyticsCounters[detail.kind]) {
    result[key] = add(result[key], findingCounters.has(key) ? detail.findings : 1)
  }
  return result
}
const missingAnalyticsFile = (cause: unknown): boolean =>
  typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT"
const readAnalyticsSummary = (path: string): Summary =>
  Schema.decodeUnknownSync(Summary, { onExcessProperty: "error" })(JSON.parse(readFileSync(path, "utf8")))
const previousAnalyticsSummary = (
  path: string,
  repositoryKey: string,
  lifetimeKey: string,
  now: number
): Summary | undefined => {
  try {
    const previous = readAnalyticsSummary(path)
    if (previous.repositoryKey !== repositoryKey || previous.lifetimeKey !== lifetimeKey) return undefined
    return previous
  } catch (cause) {
    // Do not silently replace unreadable evidence with healthy-looking zero totals.
    if (!missingAnalyticsFile(cause)) return undefined
    return {
      version: 1,
      repositoryKey,
      lifetimeKey,
      firstObservedAt: now,
      lastObservedAt: now,
      totals: emptyTotals(),
      controlledTotals: emptyTotals(),
      details: [],
      detailsDropped: 0
    }
  }
}
type AnalyticsRecordOptions = {
  readonly enabled: boolean
  readonly statePath: string | undefined
  readonly root: string
  readonly advicee: DirectAdvicee
  readonly lifetime: string
  readonly kind: AnalyticsKind
  readonly controlled: boolean
  readonly findings?: number
  readonly ruleIds?: ReadonlyArray<string>
  readonly now?: number
}
const analyticsRuleIds = (input: ReadonlyArray<string> | undefined) => {
  const supplied = [...new Set(input ?? [])]
  const ruleIds = supplied.filter((id) => id.length <= 128 && /^[a-zA-Z0-9_./-]+$/.test(id)).slice(0, 64)
  return { ruleIds, ruleIdsTruncated: supplied.length !== ruleIds.length }
}
const analyticsDetail = (options: AnalyticsRecordOptions, now: number): AnalyticsDetail => ({
  at: now,
  kind: options.kind,
  eventKey: hash(`${options.advicee.sessionId}\0${options.advicee.turnId}\0${options.advicee.toolUseId}`),
  childKey: hash(options.advicee.subagentId ?? "root"),
  backend: options.controlled ? "controlled" : "jev",
  findings: Math.min(65_536, Math.max(0, options.findings ?? 0)),
  ...analyticsRuleIds(options.ruleIds)
})
const nextAnalyticsSummary = (previous: Summary, detail: AnalyticsDetail, controlled: boolean): Summary => {
  const details = [...previous.details, detail]
  return {
    ...previous,
    lastObservedAt: detail.at,
    totals: controlled ? previous.totals : increment(previous.totals, detail),
    controlledTotals: controlled ? increment(previous.controlledTotals, detail) : previous.controlledTotals,
    details: details.slice(-MAX_ANALYTICS_DETAILS),
    detailsDropped: add(previous.detailsDropped, Math.max(0, details.length - MAX_ANALYTICS_DETAILS))
  }
}
const removeAnalyticsTemporary = (temporary: string | undefined): void => {
  if (temporary === undefined) return
  try {
    rmSync(temporary, { force: true })
  } catch {
    /* best effort */
  }
}

/** One compact shard per resident lifetime/repository; the resident is its sole writer. */
export const recordAnalytics = (options: AnalyticsRecordOptions): void => {
  if (!options.enabled || options.statePath === undefined) return
  let temporary: string | undefined
  try {
    const now = options.now ?? Date.now()
    pruneActivityStore(options.statePath, { now })
    const directory = join(options.statePath, activitySessionKey(options.advicee.sessionId))
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const repositoryKey = activityRepositoryKey(options.root)
    const lifetimeKey = hash(options.lifetime)
    const path = join(directory, `${repositoryKey}.${lifetimeKey}.summary`)
    const previous = previousAnalyticsSummary(path, repositoryKey, lifetimeKey, now)
    if (previous === undefined) return
    const summary = nextAnalyticsSummary(previous, analyticsDetail(options, now), options.controlled)
    temporary = `${path}.${randomUUID()}.tmp`
    writeFileSync(temporary, `${JSON.stringify(summary)}\n`, { mode: 0o600, flag: "wx" })
    renameSync(temporary, path)
    pruneActivityStore(options.statePath, { now })
  } catch {
    // Analytics cannot change review outcomes or fail a completed host edit.
  } finally {
    removeAnalyticsTemporary(temporary)
  }
}

const analyticsSummaryNames = (directory: string, repositoryKey: string): ReadonlyArray<string> =>
  readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(`${repositoryKey}.`) && entry.name.endsWith(".summary"))
    .map(({ name }) => name)
const sessionAnalyticsSummaries = (directory: string, repositoryKey: string): ReadonlyArray<Summary> =>
  analyticsSummaryNames(directory, repositoryKey).map((name) => {
    const summary = readAnalyticsSummary(join(directory, name))
    if (summary.repositoryKey !== repositoryKey || name !== `${repositoryKey}.${summary.lifetimeKey}.summary`)
      throw new Error("analytics summary identity mismatch")
    return summary
  })
const combinedAnalyticsTotals = (summaries: ReadonlyArray<Summary>) => {
  const totals = emptyTotals()
  const controlledTotals = emptyTotals()
  for (const summary of summaries)
    for (const key of Object.keys(totals) as Array<keyof AnalyticsTotals>) {
      totals[key] = add(totals[key], summary.totals[key])
      controlledTotals[key] = add(controlledTotals[key], summary.controlledTotals[key])
    }
  return { totals, controlledTotals }
}
const recordedSessionAnalytics = (enabled: boolean, summaries: ReadonlyArray<Summary>): SessionAnalytics => {
  const { totals, controlledTotals } = combinedAnalyticsTotals(summaries)
  const details = summaries.flatMap((summary) => summary.details).sort((a, b) => a.at - b.at)
  return {
    enabled,
    status: "recorded",
    coverage: "observed-while-enabled",
    unsettledRequests: Math.max(
      0,
      totals.requestsStarted -
        totals.requestsSucceeded -
        totals.requestsFailed -
        totals.requestsTimedOut -
        totals.requestsInterrupted
    ),
    totals,
    controlledTotals,
    details: details.slice(-MAX_ANALYTICS_DETAILS),
    detailsDropped: summaries.reduce(
      (sum, summary) => add(sum, summary.detailsDropped),
      Math.max(0, details.length - MAX_ANALYTICS_DETAILS)
    ),
    firstObservedAt: Math.min(...summaries.map((summary) => summary.firstObservedAt)),
    lastObservedAt: Math.max(...summaries.map((summary) => summary.lastObservedAt))
  }
}
export const readAnalytics = (options: {
  readonly enabled: boolean
  readonly statePath: string
  readonly root: string
  readonly sessionId: string
}): SessionAnalytics => {
  const empty: SessionAnalytics = {
    coverage: "observed-while-enabled",
    unsettledRequests: 0,
    enabled: options.enabled,
    status: options.enabled ? "no-observation" : "disabled",
    totals: emptyTotals(),
    controlledTotals: emptyTotals(),
    details: [],
    detailsDropped: 0
  }
  // Historical opt-in evidence remains readable after recording is disabled.
  if (!options.sessionId) return { ...empty, limitation: "session-id-required" }
  pruneActivityStore(options.statePath)
  const repositoryKey = activityRepositoryKey(options.root)
  try {
    const directory = join(options.statePath, activitySessionKey(options.sessionId))
    const summaries = sessionAnalyticsSummaries(directory, repositoryKey)
    if (summaries.length === 0) return empty
    return recordedSessionAnalytics(options.enabled, summaries)
  } catch (cause) {
    if (missingAnalyticsFile(cause)) return empty
    return { ...empty, status: "unavailable", limitation: "analytics-state-unreadable" }
  }
}

export const formatAnalyticsHuman = (analytics: SessionAnalytics): string => {
  const totals = analytics.totals
  const lines = [`analytics: ${analytics.status} (recording=${analytics.enabled ? "enabled" : "disabled"})`]
  if (analytics.status === "recorded") {
    lines.push(
      `Jev requests: started=${totals.requestsStarted}, succeeded=${totals.requestsSucceeded}, failed=${totals.requestsFailed}, timed-out=${totals.requestsTimedOut}, interrupted=${totals.requestsInterrupted}, unsettled-or-lost=${analytics.unsettledRequests}, never-sent=${totals.requestsNeverSent}`,
      `Jev reviews: clear=${totals.clearReviews}, with-findings=${totals.reviewsWithFindings}, findings=${totals.findings}`,
      `reuse: cache-hits=${totals.cacheHits}, joined=${totals.joinedReviews}`,
      `candidates: skipped=${totals.skippedCandidates}, incomplete=${totals.incompleteCandidates}`,
      `work: discarded=${totals.discardedWork}, preparation-failed=${totals.preparationFailures}, capacity-rejected=${totals.capacityRejections}, review-unavailable=${totals.unavailableReviews}`,
      `submissions: ${totals.submissions} (findings=${totals.submittedFindings})`,
      `details: retained=${analytics.details.length}, dropped=${analytics.detailsDropped}`
    )
    for (const detail of analytics.details)
      lines.push(
        `${new Date(detail.at).toISOString()} ${detail.backend} ${detail.kind} findings=${detail.findings}${detail.ruleIds.length === 0 ? "" : ` rules=${detail.ruleIds.join(",")}`}${detail.ruleIdsTruncated ? " (rule IDs truncated)" : ""}`
      )
  }
  if (analytics.limitation !== undefined) lines.push(`analytics limitation: ${analytics.limitation}`)
  return lines.join("\n")
}
