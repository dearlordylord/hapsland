import { test } from "node:test"
import assert from "node:assert/strict"
import { goConstantGroup, verifyGoSnapshot, createGoInspectionProfile } from "./native-go-inspection.mjs"
import * as Schema from "effect/Schema"
import { InspectionFact } from "@hapsland/inspection-records/inspection/contract"
import { createHash } from "node:crypto"
import { configuredRules } from "@hapsland/build-tooling/test-support/default-rules"

const receipt = { acknowledged: true, quoted: true }
const verify = (value) => verifyGoSnapshot(value, () => {}, receipt)
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
  assert.equal(verify(packet()).exactTypedIotaGroup, true)
  for (const missing of ["model-input", "edit-received", "unit-policy", "evaluation-outcome"]) {
    const value = packet()
    value.records = value.records.filter((record) => record.fact.kind !== missing)
    assert.throws(() => verify(value))
  }
  const incomplete = packet()
  incomplete.records.find((record) => record.fact.kind === "unit-prepared").fact.completeness = "incomplete-irrelevant"
  assert.throws(() => verify(incomplete))
  const isolated = packet()
  const payload = isolated.records.find((record) => record.fact.kind === "model-input").fact.payload
  const input = JSON.parse(payload.encoded)
  input.evidence.nodes[1].source = "const Succeeded PaymentStatus = 1"
  payload.encoded = JSON.stringify(input)
  assert.throws(() => verify(isolated), /original typed iota group/)
})

test("agent acknowledgment and unseen quotation are both required independently of private finding fate", () => {
  const value = packet()
  value.records = value.records.filter((record) => record.fact.kind !== "finding-fate")
  assert.equal(verify(value).deliveredAdvice, true)
  for (const missing of [
    { acknowledged: false, quoted: true },
    { acknowledged: true, quoted: false }
  ])
    assert.throws(() => verifyGoSnapshot(value, () => {}, missing), /real agent/)
  assert.throws(() => verifyGoSnapshot(packet()), /real agent/)
  value.records = value.records.filter((record) => record.fact.kind !== "model-input")
  assert.throws(() => verify(value))
})

test("standard installed hooks carry no stdout interposition and task prompt excludes expected finding", () => {
  const profile = createGoInspectionProfile()
  assert.equal(profile.instrumentHooks, undefined)
  assert.equal(profile.hookInterposition, "standard-installed-hooks")
  assert.ok(
    profile.prompts.every(
      (prompt) => !prompt.includes(configuredRules.find((rule) => rule.id === "meaningless_combinations").message)
    )
  )
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

test("final native acknowledgment is independent of an earlier pending marker", () => {
  const message = (text) => JSON.stringify({ type: "item.completed", item: { type: "agent_message", text } })
  const profile = createGoInspectionProfile()
  const receipt = profile.observeNative(
    [message("HAPSLAND_ADVICE_NOT_APPLIED"), message("HAPSLAND_ADVICE_APPLIED")].join("\n")
  )
  assert.deepEqual(receipt.acknowledgment, { final: "affirmed", aggregate: "ambiguous" })
  assert.equal(profile.observeNative(message("HAPSLAND_ADVICE_NOT_APPLIED")).acknowledgment.final, "negative")
  assert.equal(
    profile.observeNative(message("HAPSLAND_ADVICE_APPLIED HAPSLAND_ADVICE_NOT_APPLIED")).acknowledgment.final,
    "ambiguous"
  )
  assert.equal(profile.observeNative(message("finished")).acknowledgment.final, "absent")
})
