import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

// Falsify proposed equations on concrete inputs; this is not their proof.
// Compile the specification and its real imported core in one constructor owner.
const temporary = mkdtempSync(join(tmpdir(), "haps-evaluation-laws-"))
const e = ($, fields = {}) => ({ $: "Evaluation." + $, ...fields })
const list = (items) => items.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
try {
  const output = join(temporary, "specification.mjs")
  execFileSync(
    "taskset",
    ["-c", "10", "bend", join(import.meta.dirname, "../EvaluationSpecification.bend"), "-o", output],
    { timeout: 10000 }
  )
  const core = (await import(pathToFileURL(output))).default
  const checks = Object.fromEntries(
    [
      "reply_correlation",
      "command_signal_scope",
      "evaluated_settlement_authority",
      "retained_advice_observation",
      "recovery_accounting",
      "fault_progression",
      "completion_fault_chronology"
    ].map((name) => [name, 0])
  )
  const equal = (law, actual, expected) => {
    assert.deepEqual(actual, expected, law)
    checks[law]++
  }
  const receipts = [e("Unissued"), ...["Issued", "Started", "Interrupted", "Settled"].map(($) => e($, { request: 73 }))]
  const reviews = [
    { $: "None" },
    ...[0, 1, 4294967297].map((count) => ({ $: "Some", value: e("Review", { count, bytes: 99 }) }))
  ]
  const phases = [
    e("BeforeEvaluate"),
    e("Provider"),
    ...["ForProvider", "RefuseStale"].map((use) =>
      e("Authorizing", { use: e(use), step: core["Authorization.initial"](41) })
    ),
    ...["BackendGate", "RecoveryStatus", "FinallyCompleted", "FinallyUnit"].map(($) => e($)),
    e("AdviceObserved", { tail: 81 })
  ]
  const responses = [e("Ack"), e("Failed", { token: 13 }), e("Flag", { value: true })]
  for (const mode of ["Normal", "Recovering", "Finalizing"])
    for (const receipt of receipts)
      for (const review of reviews)
        for (const tasks of [[], [7, 2]])
          for (const finals of [[], [19, 3]]) {
            const context = e("Context", {
              input: e("Input", { policy_unit: true }),
              receipt,
              review,
              mode: e(mode),
              task_faults: list(tasks),
              final_faults: list(finals)
            })
            equal("completion_fault_chronology", core["Evaluation.finished"](context), core.complete(context))
            for (const invocation of [0, 41, 4294967297]) {
              equal(
                "fault_progression",
                core["Evaluation.fault"](context, 97, invocation, 11),
                core.fault(context, 97, invocation, 11)
              )
              for (const current of [false, true]) {
                equal(
                  "evaluated_settlement_authority",
                  core["Evaluation.evaluated_status"](context, receipt, current, invocation, 11),
                  core.evaluated_status(context, receipt, current, invocation, 11)
                )
                equal(
                  "recovery_accounting",
                  core["Evaluation.recovery_settle"](context, receipt, current, invocation, 11),
                  core.recovery_settle(context, receipt, current, invocation, 11)
                )
              }
              for (const response of responses)
                equal(
                  "retained_advice_observation",
                  core["Evaluation.advance"](context, e("AdviceObserved", { tail: 81 }), response, invocation, 11),
                  core.retained_observation(context, 81, response, invocation, 11)
                )
              for (const phase of phases) {
                const command = e("ReadCompleted")
                const actual = core["Evaluation.issue"](context, phase, command, invocation, 11)
                equal("command_signal_scope", actual, core.issue(context, phase, command, invocation, 11))
                const reply = e("Reply", { invocation, id: 11, response: e("Ack") })
                for (const step of [
                  actual,
                  { ...actual, invocation: invocation + 1 },
                  { ...actual, id: 12 },
                  { ...actual, request: { ...actual.request, invocation: invocation + 1 } },
                  { ...actual, request: { ...actual.request, id: 12 } },
                  e("Rejected"),
                  core.complete(context)
                ])
                  equal("reply_correlation", core["Evaluation.resume"](step, reply), core.resume(step, reply))
                for (const foreign of [
                  { ...reply, invocation: invocation + 1 },
                  { ...reply, id: 12 }
                ])
                  equal("reply_correlation", core["Evaluation.resume"](actual, foreign), core.resume(actual, foreign))
              }
            }
          }
  for (const count of Object.values(checks)) assert.ok(count > 0)
  console.log(
    JSON.stringify({
      passed: true,
      checks,
      scope:
        "finite falsification of seven proposed pure equations using actual emitted Bend core and specification; all modes/receipt variants, absent/zero/positive/large reviews, separate fault lists, signal classes and four identity mismatches; not owner approval, universal proof or physical IO evidence"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
