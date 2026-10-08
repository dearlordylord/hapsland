import { createHash } from "node:crypto"
import { expect, it } from "vitest"
import { decodeInspectionRecord, inspectionSourceId } from "@hapsland/inspection-records/inspection/contract"

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

it("retains native candidate selection facts together and rejects mismatched diagnostic stages", () => {
  const record = {
    version: 1,
    source: { id: inspectionSourceId("/private/socket", "life"), endpoint: "/private/socket", lifetime: "life" },
    sequence: 1,
    consentEpoch: 1,
    capturedAt: 1,
    correlation: { receiptId: "receipt" },
    scope: {
      root: "/project",
      runtime: "codex-cli",
      runtimeVersion: "0.160.1",
      sessionId: "session",
      subagentId: null
    },
    fact: {
      kind: "edit-received",
      candidates: [
        { position: 0, operation: "update", path: "value.ts", selection: { status: "selected" } },
        {
          position: 1,
          operation: "update",
          path: "script.mjs",
          selection: {
            status: "excluded",
            diagnostic: { stage: "selection", code: "file-extension", args: { extension: ".mjs" } }
          }
        }
      ]
    }
  }
  expect(decodeInspectionRecord(record).fact).toEqual(record.fact)
  for (const diagnostic of [
    { stage: "capture", code: "file-extension", args: { extension: ".mjs" } },
    { stage: "selection", code: "file-extension", args: { extension: ".mjs", source: "secret" } },
    { stage: "selection", code: "future-code", args: {} },
    { stage: "selection", code: "file-extension", args: { extension: ".mjs" }, message: "rendered text" }
  ]) {
    expect(() =>
      decodeInspectionRecord({
        ...record,
        fact: {
          ...record.fact,
          candidates: [{ ...record.fact.candidates[1], selection: { status: "excluded", diagnostic } }]
        }
      })
    ).toThrow()
  }
})

it("enforces the accepted capture/preparation vocabulary and finite numeric arguments", () => {
  const record = {
    version: 1,
    source: { id: inspectionSourceId("/private/socket", "life"), endpoint: "/private/socket", lifetime: "life" },
    sequence: 1,
    consentEpoch: 1,
    capturedAt: 1,
    correlation: { receiptId: "receipt" },
    scope: { root: "/project", runtime: null, runtimeVersion: null, sessionId: null, subagentId: null }
  }
  const diagnostics = [
    { stage: "capture", code: "capture-size-limit", args: { observedBytes: 2097153, limitBytes: 2097152 } },
    { stage: "capture", code: "capture-budget-limit", args: { resource: "files", used: 64, requested: 1, limit: 64 } },
    { stage: "capture", code: "capture-unavailable", args: { reason: "unknown" } },
    { stage: "capture", code: "capture-unstable", args: { checkpoint: "double-read" } },
    { stage: "capture", code: "capture-validation-failed", args: { reason: "root-identity" } },
    {
      stage: "preparation",
      code: "preparation-resource-refused",
      args: { phase: "materialization", requestedBytes: 100, constraint: "globalBytes" }
    },
    { stage: "preparation", code: "preparation-unavailable", args: { reason: "stale-round" } },
    { stage: "capture", code: "panic", args: { boundary: "stable-capture" } }
  ]
  for (const diagnostic of diagnostics) {
    expect(decodeInspectionRecord({ ...record, fact: { kind: "diagnostic", diagnostic } }).fact).toEqual({
      kind: "diagnostic",
      diagnostic
    })
    expect(() =>
      decodeInspectionRecord({
        ...record,
        fact: { kind: "diagnostic", diagnostic: { ...diagnostic, args: { ...diagnostic.args, error: "PRIVATE" } } }
      })
    ).toThrow()
  }
  for (const observedBytes of [-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])
    expect(() =>
      decodeInspectionRecord({
        ...record,
        fact: { kind: "diagnostic", diagnostic: { ...diagnostics[0], args: { observedBytes, limitBytes: 2097152 } } }
      })
    ).toThrow()
  expect(() =>
    decodeInspectionRecord({
      ...record,
      fact: { kind: "diagnostic", diagnostic: { stage: "capture", code: "capture-unavailable", args: {} } }
    })
  ).toThrow()
})
