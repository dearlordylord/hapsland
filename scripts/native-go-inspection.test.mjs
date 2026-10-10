import { test } from "node:test"
import assert from "node:assert/strict"
import { goConstantGroup, verifyGoSnapshot } from "./native-go-inspection.mjs"

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
        payload: { status: "available", encoded: Buffer.from(JSON.stringify(input)).toString("base64") }
      }),
      fact("initial", { kind: "finding-fate", reason: "delivery-finalized" })
    ]
  }
}
test("installed Go witness requires complete original typed group and correlated delivered follow-up", () => {
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
  const input = JSON.parse(Buffer.from(payload.encoded, "base64"))
  input.evidence.nodes[1].source = "const Succeeded PaymentStatus = 1"
  payload.encoded = Buffer.from(JSON.stringify(input)).toString("base64")
  assert.throws(() => verifyGoSnapshot(isolated), /original typed iota group/)
})
