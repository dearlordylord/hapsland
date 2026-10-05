import { createHash } from "node:crypto"
import { expect, it } from "vitest"
import { decodeInspectionRecord, inspectionSourceId } from "./contract.ts"

it("bounds general agent messages by UTF-8 bytes and rejects native output envelopes", () => {
  const record = {
    version: 1,
    source: { id: inspectionSourceId("/private/socket", "life"), endpoint: "/private/socket", lifetime: "life" },
    sequence: 1,
    consentEpoch: 1,
    capturedAt: 1,
    correlation: { batchId: "batch" },
    scope: { root: "/project", runtime: "codex-cli", runtimeVersion: null, sessionId: "session", subagentId: null },
    fact: {
      kind: "agent-message",
      findingIds: ["a".repeat(64)],
      recipient: { turnId: "turn", toolUseId: "tool" },
      evaluations: [{ semanticIdentity: "b".repeat(64), evaluationId: "evaluation" }],
      message: { status: "available", text: "日本語\nInspect this finding." }
    }
  }
  expect(decodeInspectionRecord(record).fact).toEqual(record.fact)
  expect(() =>
    decodeInspectionRecord({
      ...record,
      fact: { ...record.fact, message: { status: "available", text: "日".repeat(5462) } }
    })
  ).toThrow()
  expect(() =>
    decodeInspectionRecord({
      ...record,
      fact: { ...record.fact, output: { decision: "block", reason: "native output" } }
    })
  ).toThrow()
  expect(
    decodeInspectionRecord({ ...record, fact: { ...record.fact, message: { status: "missing", reason: "oversized" } } })
      .fact
  ).toMatchObject({ message: { status: "missing", reason: "oversized" } })
})

it("preserves captured model JSON bytes and refuses inconsistent payload identity", () => {
  const encoded = JSON.stringify({ source: "日本語\r\n\t'quoted'\n" })
  const payload = {
    status: "available",
    encoded,
    byteLength: Buffer.byteLength(encoded),
    sha256: createHash("sha256").update(encoded).digest("hex")
  }
  const record = {
    version: 1,
    source: { id: inspectionSourceId("/private/socket", "life"), endpoint: "/private/socket", lifetime: "life" },
    sequence: 1,
    consentEpoch: 1,
    capturedAt: 1,
    correlation: {},
    scope: { root: "/project", runtime: null, runtimeVersion: null, sessionId: null, subagentId: null },
    fact: { kind: "model-input", representation: "decision-model-json", payload }
  }
  expect(decodeInspectionRecord(record).fact).toEqual(record.fact)
  expect(() =>
    decodeInspectionRecord({ ...record, fact: { ...record.fact, payload: { ...payload, encoded: `${encoded} ` } } })
  ).toThrow("payload identity mismatch")
  expect(() =>
    decodeInspectionRecord({ ...record, fact: { ...record.fact, payload: { ...payload, sha256: "0".repeat(64) } } })
  ).toThrow("payload identity mismatch")
})
