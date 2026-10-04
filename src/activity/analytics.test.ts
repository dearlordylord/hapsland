import { afterEach, describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { advicee } from "../direct-event/test-fixtures.ts"
import { recordAnalytics, readAnalytics, MAX_ANALYTICS_DETAILS, formatAnalyticsHuman } from "./analytics.ts"
import { activitySessionKey } from "./storage.ts"

const directories: string[] = []
const fixture = () => {
  const statePath = mkdtempSync(join(tmpdir(), "analytics-"))
  directories.push(statePath)
  return { statePath, root: "/private/repository", sessionId: "private-session", enabled: true }
}
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe("opt-in session analytics", () => {
  it("makes no files when disabled", () => {
    const input = fixture()
    recordAnalytics({
      ...input,
      enabled: false,
      advicee: advicee({ sessionId: input.sessionId }),
      lifetime: "one",
      controlled: false,
      kind: "request-started"
    })
    expect(readdirSync(input.statePath)).toEqual([])
    expect(readAnalytics({ ...input, enabled: false })).toMatchObject({
      status: "disabled",
      totals: { requestsStarted: 0 }
    })
  })

  it("keeps whole-session totals when details roll over and combines resident lifetimes", () => {
    const input = fixture()
    const record = { ...input, advicee: advicee({ sessionId: input.sessionId }), lifetime: "one", controlled: false }
    recordAnalytics({ ...record, kind: "request-started" })
    const directory = join(input.statePath, activitySessionKey(input.sessionId))
    const name = readdirSync(directory)[0]
    if (name === undefined) throw new Error("summary missing")
    const path = join(directory, name)
    const summary = JSON.parse(readFileSync(path, "utf8"))
    const repetitions = MAX_ANALYTICS_DETAILS + 19
    summary.totals.requestsStarted = repetitions
    summary.totals.requestsSucceeded = repetitions
    summary.totals.clearReviews = repetitions
    summary.details = Array.from({ length: MAX_ANALYTICS_DETAILS }, (_, index) => ({
      ...summary.details[0],
      kind: index % 2 === 0 ? "request-started" : "request-clear"
    }))
    summary.detailsDropped = 2 * repetitions - MAX_ANALYTICS_DETAILS
    writeFileSync(path, JSON.stringify(summary))
    recordAnalytics({ ...record, kind: "request-started" })
    recordAnalytics({ ...record, kind: "request-clear" })
    recordAnalytics({ ...record, lifetime: "two", kind: "request-started" })
    recordAnalytics({
      ...record,
      lifetime: "two",
      kind: "request-findings",
      findings: 2,
      ruleIds: ["r1", "team/check"]
    })
    recordAnalytics({ ...record, lifetime: "two", kind: "cache-hit", findings: 2, ruleIds: ["r1", "team/check"] })
    const result = readAnalytics(input)
    expect(result).toMatchObject({
      status: "recorded",
      unsettledRequests: 0,
      totals: {
        requestsStarted: MAX_ANALYTICS_DETAILS + 21,
        requestsSucceeded: MAX_ANALYTICS_DETAILS + 21,
        clearReviews: MAX_ANALYTICS_DETAILS + 20,
        reviewsWithFindings: 1,
        findings: 2,
        cacheHits: 1
      }
    })
    expect(result.details).toHaveLength(MAX_ANALYTICS_DETAILS)
    expect(result.detailsDropped).toBe(2 * (MAX_ANALYTICS_DETAILS + 20) + 3 - MAX_ANALYTICS_DETAILS)
    expect(formatAnalyticsHuman(result)).toContain("rules=r1,team/check")
    expect(readAnalytics({ ...input, enabled: false })).toMatchObject({
      enabled: false,
      status: "recorded",
      totals: result.totals
    })
  })

  it("distinguishes failures, missing settlements, reused work and controlled fixtures", () => {
    const input = fixture()
    const record = { ...input, advicee: advicee({ sessionId: input.sessionId }), lifetime: "one", controlled: false }
    for (const kind of ["request-failed", "request-timeout", "request-interrupted"] as const) {
      recordAnalytics({ ...record, kind: "request-started" })
      recordAnalytics({ ...record, kind })
    }
    recordAnalytics({ ...record, kind: "request-started" })
    recordAnalytics({ ...record, kind: "request-never-sent" })
    recordAnalytics({ ...record, kind: "joined-review" })
    recordAnalytics({ ...record, controlled: true, kind: "request-started" })
    recordAnalytics({ ...record, controlled: true, kind: "request-clear" })
    expect(readAnalytics(input)).toMatchObject({
      unsettledRequests: 1,
      totals: {
        requestsStarted: 4,
        requestsFailed: 1,
        requestsTimedOut: 1,
        requestsInterrupted: 1,
        requestsNeverSent: 1,
        joinedReviews: 1,
        requestsSucceeded: 0
      },
      controlledTotals: { requestsStarted: 1, requestsSucceeded: 1 }
    })
    expect(readAnalytics({ ...input, root: "/another/repository" }).status).toBe("no-observation")
  })

  it("persists only sanitized counts, IDs and hashed identities", () => {
    const input = fixture()
    recordAnalytics({
      ...input,
      advicee: advicee({ sessionId: input.sessionId, toolUseId: "private-tool", subagentId: "private-child" }),
      lifetime: "private-lifetime",
      controlled: false,
      kind: "request-findings",
      findings: 70,
      ruleIds: [...Array.from({ length: 70 }, (_, i) => `team/rule-${i}`), "\u001b[31m"]
    })
    const directory = join(input.statePath, activitySessionKey(input.sessionId))
    const raw = readdirSync(directory)
      .map((name) => readFileSync(join(directory, name), "utf8"))
      .join()
    for (const sensitive of [
      input.root,
      input.sessionId,
      "private-tool",
      "private-child",
      "private-lifetime",
      "probability",
      "source",
      "message"
    ])
      expect(raw).not.toContain(sensitive)
    expect(readAnalytics(input).details[0]).toMatchObject({ findings: 70, ruleIdsTruncated: true })
    expect(readAnalytics(input).details[0]?.ruleIds).toHaveLength(64)
    expect(raw).not.toContain("31m")
  })

  it("reports corrupt evidence without overwriting it with fresh totals", () => {
    const input = fixture()
    const record = {
      ...input,
      advicee: advicee({ sessionId: input.sessionId }),
      lifetime: "one",
      controlled: false,
      kind: "request-started" as const
    }
    recordAnalytics(record)
    const directory = join(input.statePath, activitySessionKey(input.sessionId))
    const name = readdirSync(directory)[0]
    if (name === undefined) throw new Error("summary missing")
    const path = join(directory, name)
    writeFileSync(path, "corrupt")
    recordAnalytics(record)
    expect(readFileSync(path, "utf8")).toBe("corrupt")
    expect(readAnalytics(input)).toMatchObject({ status: "unavailable", limitation: "analytics-state-unreadable" })
    expect(existsSync(path)).toBe(true)
  })
})
