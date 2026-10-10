import { test } from "node:test"
import assert from "node:assert/strict"
import { goConstantGroup, verifyGoSnapshot, createGoInspectionProfile } from "./native-go-inspection.mjs"
import * as Schema from "effect/Schema"
import { InspectionFact } from "@hapsland/inspection-records/inspection/contract"
import { createHash } from "node:crypto"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { configuredRules } from "@hapsland/build-tooling/test-support/default-rules"

const receipt = { acknowledged: true, quoted: true }
const verify = (value) => verifyGoSnapshot(value, () => {}, receipt)
const packet = (localModule = false) => {
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
  if (localModule) {
    input.artifact.source =
      "type PaymentState struct { Status state.PaymentStatus; Receipt *domain.Receipt; FailureReason *string }"
    input.evidence.nodes[0].domain = "internal/state/status.go"
    input.evidence.nodes[0].source = "type PaymentStatus int"
    input.evidence.nodes[1].domain = "internal/state/status.go"
    input.evidence.nodes[1].name = "GoConstants_fixture"
    input.evidence.nodes[2].domain = "models-v2/receipt.go"
    input.evidence.nodes[2].source = "type Receipt struct { ID string; Status state.PaymentStatus }"
    input.evidence.edges = []
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
  assert.deepEqual(receipt.acknowledgment, {
    final: "affirmed",
    aggregate: "ambiguous",
    count: 2,
    order: ["negative", "affirmed"]
  })
  assert.equal(profile.observeNative(message("HAPSLAND_ADVICE_NOT_APPLIED")).acknowledgment.final, "negative")
  assert.equal(
    profile.observeNative([message("HAPSLAND_ADVICE_APPLIED"), message("HAPSLAND_ADVICE_NOT_APPLIED")].join("\n"))
      .acknowledgment.final,
    "negative"
  )
  assert.equal(
    profile.observeNative(message("HAPSLAND_ADVICE_APPLIED HAPSLAND_ADVICE_NOT_APPLIED")).acknowledgment.final,
    "ambiguous"
  )
  assert.equal(profile.observeNative(message("finished")).acknowledgment.final, "absent")
})

for (const localModule of [false, true])
  test(
    `Go ${localModule ? "module" : "package"} witness completes its success return after actual synthetic compilation`,
    { skip: process.env.HAPSLAND_GO_COMPILER_TEST !== "1" },
    async () => {
      const repository = mkdtempSync(join(tmpdir(), "hapsland-go-return-regression-"))
      try {
        const profile = createGoInspectionProfile({ diagnosticOnly: false, localModule })
        profile.seed(repository)
        writeFileSync(
          join(repository, "payment.go"),
          "package payment\ntype PaymentState interface { paymentState() }\n"
        )
        const rule = configuredRules.find((rule) => rule.id === "meaningless_combinations")
        profile.observeNative(
          JSON.stringify({
            type: "item.completed",
            item: { type: "agent_message", text: `HAPSLAND_ADVICE_APPLIED\n${rule.message}` }
          })
        )
        const snapshot = packet(localModule)
        snapshot.records.push({
          correlation: { evaluationId: "initial" },
          fact: {
            kind: "interpreted-findings",
            payload: { status: "available", findings: [{ ruleId: rule.id, message: rule.message }] }
          }
        })
        const result = await profile.verify({
          repository,
          bounded: async () => snapshot,
          setPhase: () => {},
          reportDiagnostic: () => {}
        })
        assert.equal(result.verdict, "demonstrated")
        assert.equal(result.checks.agentAcknowledgesAndQuotesAdvice, true)
        assert.equal(result.checks.sourceCompiles, true)
        assert.equal(result.checks.exactTypedIotaGroup, true)
      } finally {
        rmSync(repository, { recursive: true, force: true })
      }
    }
  )

test("module witness retains exact cross-package source and rejects a wrong identity", () => {
  assert.equal(verifyGoSnapshot(packet(true), () => {}, receipt, true).exactLocalModuleClosure, true)
  const value = packet(true)
  const input = value.records.find((record) => record.fact.kind === "model-input").fact.payload
  const changed = JSON.parse(input.encoded)
  changed.evidence.nodes[2].domain = "other/receipt.go"
  input.encoded = JSON.stringify(changed)
  assert.throws(() => verifyGoSnapshot(value, () => {}, receipt, true))
})
test("module fixture uses standard installed hooks and actual-name imports", () => {
  const profile = createGoInspectionProfile({ localModule: true })
  assert.equal(profile.scenario, "go-module-model-review")
  assert.equal(profile.instrumentHooks, undefined)
  assert.ok(profile.prompts[0].includes('"synthetic/payment/models-v2"'))
  assert.ok(profile.prompts[0].includes("domain.Receipt"))
  assert.ok(profile.prompts[0].includes('state "synthetic/payment/internal/state"'))
})
test("an earlier quote cannot qualify a final response that contains no advice", () => {
  const message = (text) => JSON.stringify({ type: "item.completed", item: { type: "agent_message", text } })
  const finding = configuredRules.find((rule) => rule.id === "meaningless_combinations").message
  const profile = createGoInspectionProfile({ localModule: true })
  assert.equal(profile.observeNative([message(finding), message("HAPSLAND_ADVICE_APPLIED")].join("\n")).quoted, false)
})
