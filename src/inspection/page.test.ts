import { Script } from "node:vm"
import { describe, expect, it } from "vitest"
import { defaultInspectionFilters, inspectionPage } from "@hapsland/administration/inspection/page"

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
      { text: "Model calls · 2", tone: "decision" },
      { text: "Findings · 2", tone: "findings" }
    ])
  })

  it("shows green zero only after successful completion", () => {
    expect(badges([call, findings(2, 0), outcome(3, "clear")])).toMatchObject([
      { text: "Model calls · 1" },
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
    ).toMatchObject([{ text: "Model calls · 2" }, { text: "Findings · 1" }, { text: "Review failed", tone: "failed" }])
  })
})

describe("inspection filter defaults", () => {
  it("uses the same reset state on loading and clearing filters", () => {
    const filter = { value: "payment" }
    const hideUnreviewed = { checked: false }
    const outcomeFilter = { value: "failed" }
    const identityFilters = [{ element: { value: "project" } }, { element: { value: "runtime" } }]
    let renders = 0
    const context: {
      defaultFilters: typeof defaultInspectionFilters
      filter: { value: string }
      hideUnreviewed: { checked: boolean }
      outcomeFilter: { value: string }
      identityFilters: Array<{ element: { value: string } }>
      current: object | null
      render: () => void
    } = {
      defaultFilters: defaultInspectionFilters,
      filter,
      hideUnreviewed,
      outcomeFilter,
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
    expect(outcomeFilter.value).toBe("")
    expect(identityFilters.map((item) => item.element.value)).toEqual(["", ""])
    expect(renders).toBe(0)
    context.current = {}
    filter.value = "another search"
    hideUnreviewed.checked = false
    outcomeFilter.value = "findings"
    identityFilters[0]!.element.value = "other project"
    reset()
    expect(filter.value).toBe(defaultInspectionFilters.search)
    expect(hideUnreviewed.checked).toBe(defaultInspectionFilters.hideUnreviewed)
    expect(outcomeFilter.value).toBe(defaultInspectionFilters.outcome)
    expect(identityFilters.map((item) => item.element.value)).toEqual(["", ""])
    expect(renders).toBe(1)
    expect(script).toContain("addEventListener('click', resetFilters)")
    expect(script).toContain("resetFilters();\nconnect();")
  })
})

describe("inspection activity timestamps", () => {
  it("updates at a constant retained count and includes edits without classifier calls", () => {
    const elements = new Map(
      ["#last-event", "#last-edit"].map((id) => [
        id,
        {
          textContent: "",
          datetime: "",
          setAttribute(_name: string, value: string) {
            this.datetime = value
          },
          removeAttribute() {
            this.datetime = ""
          }
        }
      ])
    )
    const renderActivity = new Script(
      script.slice(script.indexOf("function renderActivity("), script.indexOf("function render(snapshot)")) +
        "\nrenderActivity"
    ).runInNewContext({ document: { querySelector: (id: string) => elements.get(id) } })
    const edit = { capturedAt: 1000, fact: { kind: "edit-received" } }
    const event = { capturedAt: 2000, fact: { kind: "evaluation-outcome" } }
    renderActivity([event, edit])
    expect(elements.get("#last-edit")!.datetime).toBe(new Date(1000).toISOString())
    expect(elements.get("#last-event")!.datetime).toBe(new Date(2000).toISOString())
    renderActivity([event, { ...edit, capturedAt: 3000 }])
    expect(elements.get("#last-edit")!.datetime).toBe(new Date(3000).toISOString())
    expect(elements.get("#last-event")!.datetime).toBe(new Date(3000).toISOString())
    renderActivity([])
    expect(elements.get("#last-edit")!.datetime).toBe("")
    expect(elements.get("#last-event")!.textContent).toBe("No retained events")
    expect(script).toContain("renderActivity(snapshot.records)")
  })
})

describe("inspection recorded outcome filtering", () => {
  const matches = new Script(
    script.slice(script.indexOf("function editReviewBadges("), script.indexOf("function renderFindings(")) +
      "\nmatchesOutcome"
  ).runInNewContext()

  it("includes mixed findings and failures in both views without claiming a clear result", () => {
    const records = [
      call,
      findings(2, 1),
      outcome(3, "findings"),
      record(4, { kind: "model-input" }),
      outcome(5, "timeout")
    ]
    expect(matches(records, "findings")).toBe(true)
    expect(matches(records, "failed")).toBe(true)
    expect(matches(records, "clear")).toBe(false)
    expect(matches(records, "pending")).toBe(false)
  })

  it("requires retained completion evidence for the no-findings view", () => {
    expect(matches([call, findings(2, 0), outcome(3, "clear")], "clear")).toBe(true)
    for (const records of [
      [],
      [call],
      [call, outcome(2, "findings")],
      [record(1, { kind: "evaluation-route", route: "cached" })]
    ]) {
      expect(matches(records, "clear")).toBe(false)
      expect(matches(records, "findings")).toBe(false)
    }
    expect(matches([call], "pending")).toBe(true)
    expect(matches([], "")).toBe(true)
  })
})
