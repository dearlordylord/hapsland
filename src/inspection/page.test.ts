import { Script } from "node:vm"
import { describe, expect, it } from "vitest"
import { defaultInspectionFilters, inspectionPage } from "./page.ts"

const script = inspectionPage.match(/<script>([\s\S]*?)<\/script>/u)![1]!
const badges = new Script(
  script.slice(script.indexOf("function editReviewBadges("), script.indexOf("function renderFindings(")) +
    "\neditReviewBadges"
).runInNewContext()
const record = (sequence: number, fact: object) => ({ source: { id: "resident" }, sequence, fact })
const call = record(1, { kind: "model-input" })
const outcome = (sequence: number, value: string) => record(sequence, { kind: "evaluation-outcome", outcome: value })
const findings = (sequence: number, count: number) =>
  record(sequence, {
    kind: "interpreted-findings",
    payload: { status: "available", findings: Array.from({ length: count }, () => ({})) }
  })

describe("inspection edit review badges", () => {
  it("counts captured Decision calls once and distinguishes returned findings", () => {
    const records = [
      call,
      call,
      record(2, { kind: "model-input" }),
      findings(3, 2),
      outcome(4, "findings"),
      outcome(5, "clear")
    ]
    expect(badges(records)).toMatchObject([
      { text: "Decision · 2", tone: "decision" },
      { text: "Findings · 2", tone: "findings" }
    ])
  })

  it("shows green zero only after successful completion", () => {
    expect(badges([call, findings(2, 0), outcome(3, "clear")])).toMatchObject([
      { text: "Decision · 1" },
      { text: "Findings · 0", tone: "clear" }
    ])
    for (const records of [
      [],
      [call],
      [call, outcome(2, "timeout")],
      [call, outcome(2, "findings")],
      [call, record(2, { kind: "model-input" }), outcome(3, "clear")]
    ]) {
      expect(badges(records).some((badge: { text: string }) => badge.text === "Findings · 0")).toBe(false)
    }
  })

  it("keeps failures and reused reviews distinct from unreviewed edits", () => {
    expect(badges([call, outcome(2, "backend")])).toContainEqual({ text: "Review failed", tone: "failed" })
    expect(badges([])).toContainEqual({ text: "Not reviewed", tone: "muted" })
    expect(badges([record(1, { kind: "evaluation-route", route: "cached" })])).toContainEqual({
      text: "Reused review",
      tone: "muted"
    })
    expect(
      badges([call, findings(2, 1), outcome(3, "findings"), record(4, { kind: "model-input" }), outcome(5, "timeout")])
    ).toMatchObject([{ text: "Decision · 2" }, { text: "Findings · 1" }, { text: "Review failed", tone: "failed" }])
  })
})

describe("inspection filter defaults", () => {
  it("uses the same reset state on loading and clearing filters", () => {
    const filter = { value: "payment" }
    const hideUnreviewed = { checked: false }
    const identityFilters = [{ element: { value: "project" } }, { element: { value: "runtime" } }]
    let renders = 0
    const context: {
      defaultFilters: typeof defaultInspectionFilters
      filter: { value: string }
      hideUnreviewed: { checked: boolean }
      identityFilters: Array<{ element: { value: string } }>
      current: object | null
      render: () => void
    } = {
      defaultFilters: defaultInspectionFilters,
      filter,
      hideUnreviewed,
      identityFilters,
      current: null,
      render: () => {
        renders += 1
      }
    }
    const reset = new Script(
      script.slice(script.indexOf("function resetFilters("), script.indexOf("function matchesIdentity(")) +
        "\nresetFilters"
    ).runInNewContext(context)
    reset()
    expect(filter.value).toBe("")
    expect(hideUnreviewed.checked).toBe(true)
    expect(identityFilters.map((item) => item.element.value)).toEqual(["", ""])
    expect(renders).toBe(0)
    context.current = {}
    filter.value = "another search"
    hideUnreviewed.checked = false
    identityFilters[0]!.element.value = "other project"
    reset()
    expect(filter.value).toBe(defaultInspectionFilters.search)
    expect(hideUnreviewed.checked).toBe(defaultInspectionFilters.hideUnreviewed)
    expect(identityFilters.map((item) => item.element.value)).toEqual(["", ""])
    expect(renders).toBe(1)
    expect(script).toContain("addEventListener('click', resetFilters)")
    expect(script).toContain("resetFilters();\nconnect();")
  })
})
