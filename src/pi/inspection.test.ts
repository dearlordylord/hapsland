import { describe, expect, it } from "vitest"
import type { DirectAdvicee } from "../direct-event/model.ts"
import { piOfferReports } from "./inspection.ts"
import { decodeResidentWriterReports } from "../resident/protocol.ts"

const inspection = {
  root: "/project",
  advicee: {
    host: "pi",
    hostVersion: "1.0.0",
    sessionId: "session",
    subagentId: null,
    turnId: null,
    toolUseId: "edit"
  } satisfies DirectAdvicee
}

describe("Pi native offer observation", () => {
  it("requires the resident's opt-in binding before reading output", () => {
    const output = {
      toJSON: () => {
        throw new Error("must not read")
      }
    }
    expect(piOfferReports({ findingCount: 1 }, output)).toBeUndefined()
  })

  it("captures the exact offered return value without claiming native acceptance", () => {
    const output = {
      content: [
        { type: "text", text: "original\r\nλ" },
        { type: "text", text: "advice" }
      ],
      structuredContent: { preserved: true }
    }
    const reports = piOfferReports({ inspection, findingCount: 2 }, output)!
    expect(decodeResidentWriterReports(reports)).toEqual(reports)
    expect(reports.map((r) => r.state)).toEqual(["ready", "authorized", "write-started", "uncertain"])
    expect(new Set(reports.map((r) => r.attemptId)).size).toBe(1)
    expect(reports.every((r) => r.encoded === JSON.stringify(output) && r.findingCount === 2 && !r.noticeOnly)).toBe(
      true
    )
    expect(reports[0]!.advicee).toEqual(inspection.advicee)
  })

  it("marks oversized native output without transporting its source", () => {
    const reports = piOfferReports(
      { inspection, findingCount: 0 },
      { entries: [{ content: "λ".repeat(9000) }], continue: false }
    )!
    expect(decodeResidentWriterReports(reports)).toEqual(reports)
    expect(reports.every((r) => r.encoded === undefined && r.outputMissing === "oversized" && r.noticeOnly)).toBe(true)
  })

  it("cannot turn an inspection serialization failure into a failed native offer", () => {
    expect(
      piOfferReports(
        { inspection, findingCount: 1 },
        {
          toJSON: () => {
            throw new Error("unserializable")
          }
        }
      )
    ).toBeUndefined()
    expect(piOfferReports({ inspection, findingCount: 129 }, {})).toBeUndefined()
  })
})
