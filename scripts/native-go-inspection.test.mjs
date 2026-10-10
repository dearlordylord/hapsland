import { test } from "node:test"
import assert from "node:assert/strict"
import { goConstantGroup, verifyGoSnapshot, createGoInspectionProfile } from "./native-go-inspection.mjs"
import * as Schema from "effect/Schema"
import { InspectionFact } from "@hapsland/inspection-records/inspection/contract"
import { createHash } from "node:crypto"

const packet = () => {
  const fact = (evaluationId, payload, receiptId = evaluationId) => ({
    correlation: { evaluationId, receiptId },
    fact: payload
  })
  const input = {
    artifact: { kind: "struct" },
    evidence: {
      nodes: [
        { kind: "defined-type", name: "PaymentStatus" },
        { kind: "constant-group", source: goConstantGroup },
        { kind: "struct", name: "Receipt" }
      ]
    }
  }
  return {
    records: [
      ...["initial", "followup"].flatMap((id) => [
        fact(id, { kind: "edit-received", candidates: [{ path: "payment.go", selection: { status: "selected" } }] }),
        fact(id, { kind: "unit-policy", activity: "controlled" }),
        fact(id, { kind: "unit-prepared", declaration: "PaymentState", completeness: "complete" })
      ]),
      fact("initial", { kind: "evaluation-outcome", outcome: "findings" }),
      fact("followup", { kind: "evaluation-outcome", outcome: "clear" }),
      fact("initial", {
        kind: "model-input",
        representation: "decision-model-json",
        payload: {
          status: "available",
          encoded: JSON.stringify(input),
          byteLength: Buffer.byteLength(JSON.stringify(input)),
          sha256: createHash("sha256").update(JSON.stringify(input)).digest("hex")
        }
      }),
      fact("initial", { kind: "finding-fate", reason: "delivery-finalized" })
    ]
  }
}
test("installed Go witness requires complete original typed group and correlated delivered follow-up", () => {
  Schema.decodeUnknownSync(InspectionFact)(packet().records.find((record) => record.fact.kind === "model-input").fact)
  assert.equal(verifyGoSnapshot(packet()).exactTypedIotaGroup, true)
  for (const missing of ["model-input", "finding-fate", "edit-received", "unit-policy"]) {
    const value = packet()
    value.records = value.records.filter((record) => record.fact.kind !== missing)
    assert.throws(() => verifyGoSnapshot(value))
  }
  const incomplete = packet()
  incomplete.records.find((record) => record.fact.kind === "unit-prepared").fact.completeness = "incomplete-irrelevant"
  assert.throws(() => verifyGoSnapshot(incomplete))
  const isolated = packet()
  const payload = isolated.records.find((record) => record.fact.kind === "model-input").fact.payload
  const input = JSON.parse(payload.encoded)
  input.evidence.nodes[1].source = "const Succeeded PaymentStatus = 1"
  payload.encoded = JSON.stringify(input)
  assert.throws(() => verifyGoSnapshot(isolated), /original typed iota group/)
})

test("stdout submission proof does not substitute for typed provider evidence", () => {
  const value = packet()
  value.records = value.records.filter((record) => record.fact.kind !== "finding-fate")
  assert.throws(() => verifyGoSnapshot(value))
  assert.equal(verifyGoSnapshot(value, () => {}, true).deliveredAdvice, true)
  value.records = value.records.filter((record) => record.fact.kind !== "model-input")
  assert.throws(() => verifyGoSnapshot(value, () => {}, true))
})

test("selection-only native diagnostic cannot qualify installed review", async () => {
  const profile = createGoInspectionProfile({ diagnosticOnly: true })
  let phase
  await assert.rejects(
    profile.verify({
      bounded: async () => packet(),
      setPhase: (value) => {
        phase = value
      }
    }),
    /does not qualify installed review/
  )
  assert.equal(phase, "go-selection-diagnostic")
})
