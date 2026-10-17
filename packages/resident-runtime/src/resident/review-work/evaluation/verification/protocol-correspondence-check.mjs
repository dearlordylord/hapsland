import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const tag = (owner, $, fields = {}) => ({ $: owner + "." + $, ...fields })
const a = ($, fields) => tag("Authorization", $, fields)
const d = ($, fields) => tag("Dispatch", $, fields)
const bits = [false, true]
const aPhases = [
  ...["Analytics", "Controlled", "Required", "Name", "RootRefusal", "Requested"].map(($) => a($)),
  ...[
    "Shape",
    "InitialRoot",
    "Authorized",
    "Resolve",
    "GenerationBefore",
    "CredentialBoundary",
    "GenerationAfter"
  ].flatMap(($) => bits.map((required) => a($, { required }))),
  ...["Provider", "DispatchRoot", "Admission"].flatMap(($) => bits.map((ready) => a($, { ready }))),
  ...["AdmissionObserved", "Current"].flatMap(($) =>
    bits.flatMap((ready) => bits.map((selected) => a($, { ready, selected })))
  ),
  ...bits.flatMap((ready) =>
    bits.flatMap((selected) => bits.map((current) => a("Physical", { ready, selected, current })))
  ),
  ...["Denied", "UnavailableObserved"].flatMap(($) =>
    ["Lost", "Credential"].map((reason) => a($, { reason: a(reason) }))
  ),
  ...["IssuedObserved", "Armed"].flatMap(($) => [0, 73].map((request) => a($, { request })))
]
const aResponses = [
  a("Ack"),
  ...bits.map((value) => a("Flag", { value })),
  ...bits.map((present) => a("Resolved", { present })),
  ...bits.flatMap((selected) => bits.map((admitted) => a("FileAdmission", { selected, admitted }))),
  ...[a("Unavailable"), a("Stale"), ...[0, 73].map((request) => a("Issued", { request }))].map((decision) =>
    a("RequestDecision", { decision })
  ),
  ...[0, 97].map((token) => a("Failed", { token }))
]
const plans = [
  {
    owner: "Authorization",
    alias: "A",
    phases: aPhases,
    responses: aResponses,
    command: a("ReadEffectiveAnalytics"),
    terminals: [
      a("Rejected"),
      a("Aborted", { token: 97 }),
      a("AuthorizedRequest", { request: 73 }),
      ...["Lost", "Credential"].map((reason) => a("NotAuthorized", { reason: a(reason) }))
    ],
    initials: ["initial"]
  },
  {
    owner: "Dispatch",
    alias: "D",
    phases: ["Credential", "Budget", "Start", "Started", "AbortedRead", "Interrupt", "Interrupted"].map(($) => d($)),
    responses: [
      d("Ack"),
      ...bits.map((value) => d("Flag", { value })),
      ...[0, 97].map((token) => d("Failed", { token }))
    ],
    command: d("CheckCredentialGeneration"),
    terminals: ["Dispatched", "CredentialChanged", "StartRefused", "Rejected"]
      .map(($) => d($))
      .concat(d("Aborted", { token: 97 })),
    initials: ["initial", "interruption_initial"]
  }
]

function requireIndependent(source, alias) {
  const code = source.replace(/#[^\n]*/gu, "")
  assert.doesNotMatch(
    code,
    new RegExp("\\b" + alias + "\\.[a-z_][A-Za-z0-9_]*", "u"),
    "Independent public-step specification must determine its own transition; remove the production helper call"
  )
}
// This exact production delegation made the withdrawn seven-law package miss
// skipped provider/cache stages. Keep the structural gate's negative witness.
assert.throws(() => requireIndependent("E.advance(context, phase, response, invocation, next)", "E"), {
  code: "ERR_ASSERTION"
})

function constructors(source, type) {
  const block = source.match(new RegExp("type " + type + " is Data:([\\s\\S]*?)(?=\\ntype |\\ndef |$)", "u"))
  assert.ok(block, "missing production type " + type)
  return new Set([...block[1].matchAll(/^\s+([A-Za-z][A-Za-z0-9_]*)\{/gmu)].map((match) => match[1]))
}
const names = (values) => new Set(values.map((value) => value.$.split(".").at(-1)))
const temporary = mkdtempSync(join(tmpdir(), "haps-evaluation-protocol-"))
try {
  const counts = {}
  for (const plan of plans) {
    const spec = join(import.meta.dirname, "..", plan.owner + "Specification.bend")
    requireIndependent(readFileSync(spec, "utf8"), plan.alias)
    const source = readFileSync(join(import.meta.dirname, "..", plan.owner + ".bend"), "utf8")
    assert.deepEqual(names(plan.phases), constructors(source, "Phase"), "cover every production phase")
    assert.deepEqual(names(plan.responses), constructors(source, "Response"), "cover every production reply")
    assert.deepEqual(
      names(plan.terminals),
      new Set([...constructors(source, "Step")].filter((name) => name !== "Await")),
      "cover every non-resumable terminal"
    )
    const output = join(temporary, plan.owner + ".mjs")
    execFileSync("taskset", ["-c", "10", "bend", spec, "-o", output], { timeout: 10000 })
    const model = (await import(pathToFileURL(output))).default
    let initials = 0,
      resumes = 0
    const equal = (step, reply) => {
      assert.deepEqual(
        model[plan.owner + ".resume"](step, reply),
        model.resume(step, reply),
        plan.owner + " complete public reply correspondence"
      )
      resumes++
    }
    for (const invocation of [0, 41, 4294967297]) {
      for (const entry of plan.initials) {
        assert.deepEqual(
          model[plan.owner + "." + entry](invocation),
          model[entry](invocation),
          plan.owner + " " + entry
        )
        initials++
      }
      for (const id of [0, 11])
        for (const phase of plan.phases)
          for (const response of plan.responses) {
            const step = tag(plan.owner, "Await", {
              invocation,
              id,
              phase,
              request: tag(plan.owner, "Request", { invocation, id, command: plan.command })
            })
            const reply = tag(plan.owner, "Reply", { invocation, id, response })
            equal(step, reply)
            equal({ ...step, invocation: invocation + 1 }, reply)
            equal({ ...step, id: id + 1 }, reply)
            equal({ ...step, request: { ...step.request, invocation: invocation + 1 } }, reply)
            equal({ ...step, request: { ...step.request, id: id + 1 } }, reply)
            equal(step, { ...reply, invocation: invocation + 1 })
            equal(step, { ...reply, id: id + 1 })
          }
      for (const step of plan.terminals)
        for (const response of plan.responses) equal(step, tag(plan.owner, "Reply", { invocation, id: 11, response }))
    }
    counts[plan.owner] = { phases: names(plan.phases).size, responses: names(plan.responses).size, initials, resumes }
  }
  console.log(
    JSON.stringify({
      passed: true,
      counts,
      productionHelperDelegationRejected: true,
      scope:
        "finite complete public-step correspondence for Authorization and Dispatch using actual emitted implementation/specification; all phase/reply/terminal variants, Boolean fields and identity mismatches; not universal proof, whole parent Evaluation, Canonical ownership or physical IO"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
