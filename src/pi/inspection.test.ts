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

  it("retains uncertainty without invoking output accessors or custom serialization", () => {
    let reads = 0
    const output = {
      get content() {
        reads += 1
        throw new Error("native accessor")
      }
    }
    const reports = piOfferReports({ inspection, findingCount: 1 }, output)!
    expect(reads).toBe(0)
    expect(decodeResidentWriterReports(reports)).toEqual(reports)
    expect(reports.map((r) => r.state)).toEqual(["ready", "authorized", "write-started", "uncertain"])
    expect(reports.every((r) => r.outputMissing === "unavailable" && r.encoded === undefined)).toBe(true)
    expect(piOfferReports({ inspection, findingCount: 129 }, {})).toBeUndefined()
  })

  it("stops capture before reading later members of oversized native output", () => {
    let reads = 0
    const output = {
      content: "λ".repeat(1_000_000),
      get structuredContent() {
        reads += 1
        throw new Error("must not read after bound")
      }
    }
    const reports = piOfferReports({ inspection, findingCount: 1 }, output)!
    expect(reads).toBe(0)
    expect(reports.every((r) => r.outputMissing === "oversized" && r.encoded === undefined)).toBe(true)
  })
  it("matches JSON bytes for plain native data, including omitted members and escaped Unicode", () => {
    const entries = [undefined, Number.NaN, -0, "\u0000\ud800λ", { absent: undefined, value: 1 }]
    const output = { entries, continue: false, 2: "second", 1: "first" }
    const reports = piOfferReports({ inspection, findingCount: 1 }, output)!
    expect(reports.every((r) => r.encoded === JSON.stringify(output))).toBe(true)
    expect(piOfferReports({ inspection, findingCount: 1 }, { content: "\u0000".repeat(3000) })![0]).toMatchObject({
      outputMissing: "oversized"
    })
  })

  it("does not invoke opaque objects, cyclic references, or custom serializers", () => {
    let reads = 0
    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          reads++
          throw new Error("opaque")
        }
      }
    )
    const custom = {
      toJSON() {
        reads++
        throw new Error("custom")
      }
    }
    const cyclic: { child?: unknown } = {}
    cyclic.child = cyclic
    for (const output of [proxy, custom, cyclic, { child: 1n }]) {
      const reports = piOfferReports({ inspection, findingCount: 1 }, output)!
      expect(reports.every((r) => r.outputMissing === "unavailable" && r.encoded === undefined)).toBe(true)
    }
    expect(reads).toBe(0)
  })
})
