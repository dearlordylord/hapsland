import assert from "node:assert/strict"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { executeNative } from "./native-process.mjs"
import { instrumentGoHooks } from "./native-go-hook-observation.mjs"
import { configuredRules } from "@hapsland/build-tooling/test-support/default-rules"

export const goConstantGroup = "const (\n Pending PaymentStatus = iota\n Succeeded\n Failed\n)"
const initial =
  "package payment\ntype PaymentState struct { Status PaymentStatus; Receipt *Receipt; FailureReason *string }\n"
const repaired = "package payment\ntype PaymentState interface { paymentState() }\n"
const finding = configuredRules.find((rule) => rule.id === "meaningless_combinations").message

/** Assert only the observed package-model seam; discard all source-bearing packets. */
export function verifyGoSnapshot(snapshot, setCheck = () => {}, nativeSubmission = false) {
  setCheck("prepared-native-roots")
  const records = snapshot.records
  const units = records.filter(
    (record) => record.fact.kind === "unit-prepared" && record.fact.declaration === "PaymentState"
  )
  assert.ok(units.length >= 2, "Both attributed PaymentState edits must prepare")
  assert.ok(units.every((unit) => unit.fact.completeness === "complete"))
  for (const unit of units) {
    assert.ok(
      records.some(
        (record) =>
          record.correlation.receiptId === unit.correlation.receiptId &&
          record.fact.kind === "edit-received" &&
          record.fact.candidates.some(
            (candidate) => candidate.path === "payment.go" && candidate.selection.status === "selected"
          )
      )
    )
    assert.ok(
      records.some(
        (record) =>
          record.correlation.evaluationId === unit.correlation.evaluationId &&
          record.fact.kind === "unit-policy" &&
          record.fact.activity === "controlled"
      ),
      "Each invocation must use the controlled reviewer"
    )
  }
  setCheck("correlated-outcomes")
  const initialUnit = units.find((unit) =>
    records.some(
      (record) =>
        record.correlation.evaluationId === unit.correlation.evaluationId &&
        record.fact.kind === "evaluation-outcome" &&
        record.fact.outcome === "findings"
    )
  )
  const followup = units.find((unit) =>
    records.some(
      (record) =>
        record.correlation.evaluationId === unit.correlation.evaluationId &&
        record.fact.kind === "evaluation-outcome" &&
        record.fact.outcome === "clear"
    )
  )
  assert.ok(
    initialUnit && followup && initialUnit.correlation.evaluationId !== followup.correlation.evaluationId,
    "An initial finding and independent clear follow-up are required"
  )
  setCheck("captured-provider-input")
  const input = records.find(
    (record) =>
      record.correlation.evaluationId === initialUnit.correlation.evaluationId && record.fact.kind === "model-input"
  )
  assert.equal(input?.fact.payload.status, "available")
  const value = JSON.parse(input.fact.payload.encoded)
  assert.equal(value.artifact.kind, "struct")
  setCheck("typed-package-evidence")
  const nodes = value.evidence.nodes
  assert.ok(
    nodes.some((node) => node.kind === "constant-group" && node.source === goConstantGroup),
    "The original typed iota group must reach the provider"
  )
  assert.ok(nodes.some((node) => node.kind === "defined-type" && node.name === "PaymentStatus"))
  assert.ok(nodes.some((node) => node.kind === "struct" && node.name === "Receipt"))
  setCheck("delivered-finding")
  assert.ok(
    nativeSubmission ||
      records.some(
        (record) =>
          record.correlation.evaluationId === initialUnit.correlation.evaluationId &&
          record.fact.kind === "finding-fate" &&
          record.fact.reason === "delivery-finalized"
      ),
    "The initial finding must be delivered"
  )
  return {
    nativeEdits: true,
    completePackageClosure: true,
    exactTypedIotaGroup: true,
    controlledReviewer: true,
    initialFinding: true,
    deliveredAdvice: true,
    clearFollowup: true
  }
}

export function createGoInspectionProfile() {
  let observations
  let acknowledged = false
  let quoted = false
  return {
    source: new URL(import.meta.url),
    scenario: "go-package-model-review",
    browser: false,
    prepareResident: true,
    prepareRuntime: true,
    seed(repo) {
      writeFileSync(join(repo, "go.mod"), "module synthetic/payment\n\ngo 1.27\n")
      writeFileSync(
        join(repo, "support.go"),
        `package payment\ntype PaymentStatus int\n${goConstantGroup}\ntype Receipt struct { ID string }\n`
      )
      writeFileSync(join(repo, "package.json"), JSON.stringify({ private: true, scripts: { test: "go test ./..." } }))
    },
    control: () => ({ findingOnSourceIncludes: "type PaymentState struct" }),
    instrumentHooks(inputs) {
      observations = instrumentGoHooks({ ...inputs, finding })
    },
    prompts: [
      `Use apply_patch to add payment.go with exactly this draft:\n${initial}\nRun npm test. If Hapsland review is pending, run npm test again to receive advice. Only if Hapsland delivers actionable advice, use apply_patch to replace PaymentState with this design:\n${repaired}\nRun npm test again; if review is pending run npm test again. Keep support.go unchanged. Use at most two source-edit calls. Stay inside the repository; do not inspect integration settings, credentials or environment variables. Finish with HAPSLAND_ADVICE_APPLIED only if you received and used Hapsland advice, otherwise HAPSLAND_ADVICE_NOT_APPLIED. Quote one actual delivered finding sentence.`
    ],
    observeNative(output) {
      const messages = output
        .split("\n")
        .flatMap((line) => {
          try {
            const value = JSON.parse(line)
            return value.type === "item.completed" && value.item?.type === "agent_message" ? [value.item.text] : []
          } catch {
            return []
          }
        })
        .join("\n")
      acknowledged = messages.includes("HAPSLAND_ADVICE_APPLIED") && !messages.includes("HAPSLAND_ADVICE_NOT_APPLIED")
      quoted = messages.includes(finding)
    },
    async verify({ url, repository, bounded, reportDiagnostic, setPhase }) {
      setPhase("go-package-model-outcomes")
      const snapshot = await bounded(
        async () => {
          const value = await (await fetch(`${url}snapshot`, { signal: AbortSignal.timeout(10000) })).json()
          reportDiagnostic({
            nativeAdmission: value.records
              .filter((record) => record.fact.kind === "edit-admission")
              .map((record) => record.fact.outcome),
            nativeSelections: value.records
              .filter((record) => record.fact.kind === "edit-received")
              .flatMap((record) => record.fact.candidates.map((candidate) => candidate.selection.status)),
            hookObservations: observations
              ? (() => {
                  try {
                    return readFileSync(observations, "utf8")
                      .trim()
                      .split("\n")
                      .map((line) => JSON.parse(line))
                  } catch {
                    return []
                  }
                })()
              : [],
            nativeAgentAcknowledged: acknowledged,
            nativeAgentQuotedAdvice: quoted,
            findingFates: value.records
              .filter((record) => record.fact.kind === "finding-fate")
              .map((record) => ({
                evaluationId: record.correlation.evaluationId ?? null,
                fate: record.fact.fate,
                reason: record.fact.reason
              })),
            facts: Object.fromEntries(
              ["edit-received", "unit-prepared", "model-input", "evaluation-outcome", "finding-fate"].map((kind) => [
                kind,
                value.records.filter((record) => record.fact.kind === kind).length
              ])
            )
          })
          return value.records.filter((record) => record.fact.kind === "evaluation-outcome").length >= 2
            ? value
            : undefined
        },
        "installed Go initial and follow-up outcomes",
        30000
      )
      const submitted =
        observations &&
        readFileSync(observations, "utf8")
          .trim()
          .split("\n")
          .some((line) => {
            const value = JSON.parse(line)
            return value.initialRoot === true && value.adviceSubmitted === true && value.exitCode === 0
          })
      const checks = verifyGoSnapshot(snapshot, (check) => setPhase(`go-${check}`), submitted)
      setPhase("go-agent-advice-acknowledgment")
      assert.ok(acknowledged && quoted, "The real agent must acknowledge advice and quote its delivered finding")
      setPhase("go-interface-repair")
      assert.match(
        readFileSync(join(repository, "payment.go"), "utf8"),
        /^package payment\s+type PaymentState interface\s*\{\s*paymentState\(\)\s*\}\s*$/u
      )
      setPhase("go-repair-compilation")
      const compiler = await executeNative("go", ["test", "./..."], { cwd: repository, timeout: 30000 })
      assert.equal(compiler.code, 0)
      return {
        checks: {
          ...checks,
          agentAcknowledgesAndQuotesAdvice: true,
          installedHookStdoutSubmittedAdvice: submitted,
          repairedOpenInterface: true,
          sourceCompiles: true
        },
        maximumJevRequests: 0,
        nativeColdStartupValidated: false,
        browserValidated: false,
        rawHostStreamRetained: false,
        sourceRetained: false,
        providerBodyRetained: false,
        verdict: "demonstrated"
      }
    }
  }
}
