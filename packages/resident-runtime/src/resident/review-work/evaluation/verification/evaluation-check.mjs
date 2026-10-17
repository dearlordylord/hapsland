import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { requireIndependent } from "./specification-independence.mjs"

const tag = ($, fields = {}) => ({ $, ...fields })
const nil = tag("Nil")
const list = (items) => items.reduceRight((tail, head) => tag("Con", { head, tail }), nil)
const values = (items) => (items.$ === "Nil" ? [] : [items.head, ...values(items.tail)])
function* call($, fields = {}, signal = "NativeSignal") {
  const reply = yield { command: tag($, fields), signal }
  if (reply.$ === "Failed") throw { token: reply.token }
  return reply
}
function* flag($) {
  return (yield* call($)).value
}
function* authCall($, fields = {}, work = true) {
  const reply = yield* call("Authorization", { command: tag($, fields) }, work ? "WorkSignal" : "NativeSignal")
  if (reply.response.$ === "Failed") throw { token: reply.response.token }
  return reply.response
}
function* deny(work = false) {
  const decision = (yield* authCall("DenyRequest", {}, work)).decision
  if (decision.$ === "Unavailable") yield* authCall("ObserveUnavailable", {}, work)
}
function* authorize() {
  yield* authCall("ReadEffectiveAnalytics")
  if (!(yield* authCall("ValidateControlled")).value) {
    yield* deny(true)
    return "LostReason"
  }
  const required = (yield* authCall("ReadCredentialRequired")).value
  if (!(yield* authCall("CheckCredentialShape", { required })).value) {
    yield* deny(true)
    return "CredentialReason"
  }
  assert.equal((yield* authCall("VerifyInitialRoot")).value, true)
  yield* authCall("AuthorizationBarrier")
  const present = (yield* authCall("ResolveCredential", { required })).present
  assert.ok(!required || present)
  assert.equal((yield* authCall("CheckCredentialGeneration")).value, true)
  yield* authCall("CredentialBarrier")
  assert.equal((yield* authCall("CheckCredentialGeneration")).value, true)
  assert.equal((yield* authCall("CheckCredentialName", { required })).value, true)
  assert.equal((yield* authCall("CheckProviderIdentity")).value, true)
  assert.equal((yield* authCall("VerifyDispatchRoot")).value, true)
  yield* authCall("ReadFileAdmission", { credential_ready: true })
  yield* authCall("ObserveFileAdmission", { selected: true, admitted: true })
  const current_work = (yield* authCall("ReadCurrentWork")).value
  const physical_available = (yield* authCall("ReadPhysicalAvailable")).value
  const ready = (yield* authCall("ReadyRequest", {
    facts: tag("Facts", { credential_ready: true, selected: true, current_work, physical_available })
  })).decision
  assert.equal(ready.$, "Issued")
  yield* authCall("ObserveIssued", { request: ready.request })
  yield* authCall("ArmInterruption")
  return undefined
}
function* release() {
  yield* call("ReleaseReuseClaim")
  yield* call("ReleaseUnit")
}
function* joined(reason, clear = false) {
  yield* call("SettleJoined", { reason: tag(reason), clear })
}
function* activity(name) {
  yield* call("RecordActivity", { activity: tag(name) })
}
function* denied(reason) {
  yield* call("RecordUnavailableAnalytics")
  yield* joined(reason)
  if (reason === "CredentialReason") yield* call("RecordOperationalFailure", { reason: tag(reason) })
  yield* activity(reason === "StaleReason" ? "IncompleteActivity" : "UnavailableActivity")
  yield* release()
}
function* settle(outcome, current = false) {
  const result = yield* call("SettleRequest", { outcome: tag(outcome), current })
  yield* call("ObserveSettled", { outcome: tag(outcome) })
  return result.disposition.$
}
function* retain() {
  if (!(yield* flag("ReadJobActive"))) {
    yield* call("RetireUnitWork")
    yield* call("ReleaseUnit")
    return
  }
  const candidates = values((yield* call("ReadAdviceCandidates")).values)
  const existing = candidates.find((candidate) => candidate.matching)
  if (existing) {
    const { publication } = yield* call("PublishExisting", { advice: existing.handle })
    yield* call("RecordJoined", { publication })
    yield* call("RetireUnitWork")
    yield* call("ReleaseUnit")
    return
  }
  const { tail } = yield* call("InsertAdvice")
  try {
    yield* call("ObserveRetained", { tail })
  } catch (error) {
    try {
      yield* call("PreserveAdviceTail", { tail })
    } catch (preserve) {
      throw { token: error.token, secondary: preserve.token }
    }
    throw error
  }
  yield* call("DriveAdviceTail", { tail })
}
function* evaluated(input, review) {
  if ((yield* flag("ReadJobActive")) && (yield* flag("ReadRuntimeActive")) && input.policy_unit) {
    if (!(yield* call("ReportRoundOutcome", { review })).value)
      yield* call("RaiseInvariant", { invariant: tag("RoundOutcomeRefused") })
  }
  const current =
    (yield* flag("ReadRuntimeActive")) && (yield* flag("ReadJobActive")) && (yield* flag("ReadCurrentWork"))
  const receipt = (yield* call("ReadRequestState")).receipt
  if (receipt.$ !== "Started" && receipt.$ !== "Interrupted")
    yield* call("RaiseInvariant", { invariant: tag("ResultWithoutStart") })
  const clear = review.count === 0
  const disposition = yield* settle(clear ? "Clear" : "Finding", current)
  if (disposition === "Ignored" || disposition === "Stale") {
    yield* call("ObserveFate", { fate: tag(disposition === "Stale" ? "StaleFate" : "DiscardedFate") })
    yield* release()
    return
  }
  yield* call("RecordDemoTerminal", { clear })
  yield* call("StoreEvaluation")
  yield* call("ReleaseReuseClaim")
  yield* activity(clear ? "ClearActivity" : "FindingsActivity")
  if (disposition !== "FindingRetained") {
    yield* call("ObserveFate", { fate: tag(disposition === "StaleFindingRetired" ? "StaleFate" : "DiscardedFate") })
    if (disposition === "StaleFindingRetired") yield* call("RetireUnitWork")
    yield* joined("StaleReason", disposition === "ClearSettled")
    yield* call("MarkCompleted")
    yield* call("ReleaseUnit")
  } else yield* retain()
  yield* call("RecordControlledOutcome", { clear })
}
function observed(receipt, aborted, result) {
  if (receipt.$ === "Issued") return "NeverSent"
  if (receipt.$ === "Interrupted" && aborted) return "RequestInterrupted"
  return result.$ === "Timeout" ? "RequestTimeout" : "BackendFailure"
}
function* failed(result) {
  let receipt = (yield* call("ReadRequestState")).receipt
  const aborted = yield* flag("ReadAborted")
  if (aborted && receipt.$ === "Started") {
    if (yield* flag("InterruptRequest")) yield* call("ObserveInterrupted")
    receipt = (yield* call("ReadRequestState")).receipt
  }
  if (receipt.$ === "Settled") return
  let observation
  if (receipt.$ === "Unissued") {
    if (!(yield* flag("CompleteUnavailable"))) return
    if (result.$ !== "Backend" && result.$ !== "Timeout" && result.$ !== "Missing") return
    observation = result.$ === "Missing" ? "NeverSent" : "BackendFailure"
  } else {
    observation = observed(receipt, aborted, result)
    yield* settle(observation)
  }
  const reason = observation === "BackendFailure" || observation === "RequestTimeout" ? "BackendReason" : "LostReason"
  yield* joined(reason)
  if (reason !== "LostReason") yield* call("RecordOperationalFailure", { reason: tag(reason) })
  yield* activity("UnavailableActivity")
}
function* recover() {
  let receipt = (yield* call("ReadRequestState")).receipt
  const escapedAborted = yield* flag("ReadAborted")
  yield* call("ObserveEscaped", { outcome: tag(escapedAborted ? "RequestInterrupted" : "BackendFailure") })
  const aborted = yield* flag("ReadAborted")
  if (receipt.$ === "Unissued") {
    if (yield* flag("ReadReviewing")) yield* deny()
  } else if (receipt.$ !== "Settled") {
    if (aborted && receipt.$ === "Started") {
      if (yield* flag("InterruptRequest")) yield* call("ObserveInterrupted")
      receipt = (yield* call("ReadRequestState")).receipt
    }
    yield* settle(observed(receipt, aborted, tag("Backend")))
  }
  yield* joined("BackendReason")
  yield* call("RecordDebugFailure")
  if (yield* flag("ReadRuntimeActive")) yield* activity("UnavailableActivity")
}
function* cleanupSpecification() {
  const task_faults = [],
    final_faults = []
  try {
    yield* recover()
  } catch (error) {
    task_faults.push(error.token)
  }
  try {
    if (!(yield* flag("ReadCompleted"))) yield* release()
  } catch (error) {
    final_faults.push(error.token)
  }
  return tag("Completion", { task_faults, final_faults })
}
function* specification(input) {
  const task_faults = [],
    final_faults = []
  try {
    try {
      if (input.policy_unit && !(yield* flag("StartPolicyUnit"))) {
        yield* release()
        return tag("Completion", { task_faults, final_faults })
      }
      if (!(yield* flag("StartReview"))) {
        yield* release()
        return tag("Completion", { task_faults, final_faults })
      }
      yield* call("AwaitBackendGate")
      if (!(yield* flag("ReadJobActive")) || !(yield* flag("ReadCurrentWork"))) {
        yield* deny()
        yield* denied("StaleReason")
        return tag("Completion", { task_faults, final_faults })
      }
      yield* call("EvaluationBarrier", {}, "WorkSignal")
      yield* call("DecodeControlled")
      const reason = yield* authorize()
      if (reason) {
        yield* denied(reason)
        return tag("Completion", { task_faults, final_faults })
      }
      const result = (yield* call("RunProvider", {}, "WorkSignal")).result
      if (result.$ === "Evaluated") yield* evaluated(input, result.review)
      else yield* failed(result)
    } catch (error) {
      task_faults.push(error.token)
      if (error.secondary !== undefined) task_faults.push(error.secondary)
      else
        try {
          yield* recover()
        } catch (recovery) {
          task_faults.push(recovery.token)
        }
    }
  } finally {
    try {
      if (!(yield* flag("ReadCompleted"))) yield* release()
    } catch (error) {
      final_faults.push(error.token)
    }
  }
  return tag("Completion", { task_faults, final_faults })
}

// Deterministic IO facts. This runner validates the composed pure cursor,
// not the provider/custody boundary or native physical cleanup.
function ports(facts) {
  let receipt = facts.cleanupReceipt ?? tag("Unissued"),
    completed = facts.completed === true,
    reviewing = facts.noReviewing !== true
  return (command) => {
    switch (command.$) {
      case "Authorization": {
        const value = command.command
        switch (value.$) {
          case "ReadCredentialRequired":
            return tag("Authorized", { response: tag("Flag", { value: true }) })
          case "ValidateControlled":
            return tag("Authorized", { response: tag("Flag", { value: !facts.denyLost }) })
          case "CheckCredentialShape":
            return tag("Authorized", { response: tag("Flag", { value: !facts.denyCredential }) })
          case "ResolveCredential":
            return tag("Authorized", { response: tag("Resolved", { present: true }) })
          case "ReadFileAdmission":
            return tag("Authorized", { response: tag("FileAdmission", { selected: true, admitted: true }) })
          case "ReadyRequest":
            receipt = tag("Issued", { request: 73 })
            reviewing = false
            return tag("Authorized", { response: tag("RequestDecision", { decision: tag("Issued", { request: 73 }) }) })
          case "DenyRequest":
            reviewing = false
            return tag("Authorized", { response: tag("RequestDecision", { decision: tag("Unavailable") }) })
          case "CheckCredentialGeneration":
          case "CheckCredentialName":
          case "CheckProviderIdentity":
          case "VerifyInitialRoot":
          case "VerifyDispatchRoot":
          case "ReadCurrentWork":
          case "ReadPhysicalAvailable":
            return tag("Authorized", { response: tag("Flag", { value: true }) })
          default:
            return tag("Authorized", { response: tag("Ack") })
        }
      }
      case "StartPolicyUnit":
        return tag("Flag", { value: !facts.refuseStart })
      case "StartReview":
        return tag("Flag", { value: !facts.refuseReview })
      case "ReadJobActive":
        return tag("Flag", { value: !facts.inactive })
      case "ReadCurrentWork":
        return tag("Flag", { value: !facts.stale })
      case "ReadRuntimeActive":
        return tag("Flag", { value: !facts.closed })
      case "ReportRoundOutcome":
        return tag("Flag", { value: !facts.denyOutcome })
      case "ReadAborted":
        return tag("Flag", { value: Boolean(facts.aborted) })
      case "ReadCompleted":
        return tag("Flag", { value: completed })
      case "ReadReviewing":
        return tag("Flag", { value: reviewing })
      case "RunProvider": {
        if (facts.started !== false) receipt = tag(facts.interrupted ? "Interrupted" : "Started", { request: 73 })
        return tag("ProviderReturned", {
          result: facts.result ?? tag("Evaluated", { review: tag("Review", { count: facts.count ?? 1, bytes: 100 }) })
        })
      }
      case "ReadRequestState":
        return tag("RequestState", { receipt })
      case "InterruptRequest": {
        const accepted = receipt.$ === "Started"
        if (accepted) receipt = tag("Interrupted", { request: 73 })
        return tag("Flag", { value: accepted })
      }
      case "SettleRequest":
        receipt = tag("Settled", { request: 73 })
        return tag("RequestSettled", {
          disposition: tag(
            facts.disposition ??
              (command.outcome.$ === "Finding"
                ? "FindingRetained"
                : command.outcome.$ === "Clear"
                  ? "ClearSettled"
                  : "Unavailable")
          )
        })
      case "CompleteUnavailable":
        return tag("Flag", { value: true })
      case "ReadAdviceCandidates":
        return tag("AdviceCandidates", {
          values: list(
            facts.existing
              ? [
                  tag("Candidate", { handle: 1, matching: false }),
                  tag("Candidate", { handle: 2, matching: true }),
                  tag("Candidate", { handle: 3, matching: true })
                ]
              : []
          )
        })
      case "PublishExisting":
        return tag("Published", { publication: 7 })
      case "InsertAdvice":
        completed = true
        return tag("AdviceInserted", { tail: 11 })
      case "MarkCompleted":
        completed = true
        return tag("Ack")
      case "RaiseInvariant":
        return tag("Failed", { token: 99 })
      default:
        return tag("Ack")
    }
  }
}

const temporary = mkdtempSync(join(tmpdir(), "hapsland-evaluation-flow-"))
try {
  const packaged = process.argv.includes("--packaged")
  const output = packaged
    ? join(import.meta.dirname, "../../../../../dist/resident/review-work/evaluation/evaluation-core.js")
    : join(temporary, "evaluation.mjs")
  if (!packaged)
    execFileSync("taskset", ["-c", "10", "bend", join(import.meta.dirname, "../Evaluation.bend"), "-o", output], {
      timeout: 10000
    })
  let core = (await import(pathToFileURL(output))).default
  const specSource = join(import.meta.dirname, "../EvaluationSpecification.bend")
  for (const alias of ["E", "A"]) requireIndependent(readFileSync(specSource, "utf8"), alias)
  requireIndependent(readFileSync(join(import.meta.dirname, "../AuthorizationSpecification.bend"), "utf8"), "A")
  const specOutput = join(temporary, "specification.mjs")
  execFileSync("taskset", ["-c", "10", "bend", specSource, "-o", specOutput], { timeout: 10000 })
  const model = (await import(pathToFileURL(specOutput))).default
  // Only Evaluation-owned constructors change owner when imported by the spec.
  // Auth and Work constructors already retain their domain owner; Base is shared.
  const evaluationNames = new Set(
    [
      ...readFileSync(join(import.meta.dirname, "../Evaluation.bend"), "utf8").matchAll(/^  ([A-Z][A-Za-z0-9_]*)\{/gmu)
    ].map((match) => match[1])
  )
  function owner(value, encode) {
    return value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value).map(([key, item]) => [
            key,
            key === "$" && typeof item === "string"
              ? encode
                ? evaluationNames.has(item)
                  ? "Evaluation." + item
                  : item
                : item.startsWith("Evaluation.")
                  ? item.slice("Evaluation.".length)
                  : item
              : owner(item, encode)
          ])
        )
      : value
  }
  const specified = {
    initial: (input, invocation) => owner(model.initial(owner(input, true), invocation), false),
    cleanup_initial: (invocation) => owner(model.cleanup_initial(invocation), false),
    resume: (step, reply) => owner(model.resume(owner(step, true), owner(reply, true)), false)
  }
  if (packaged) assert.deepEqual(Object.keys(core).sort(), ["cleanup_initial", "initial", "resume"])
  // Constructor owner from the checked private ABI; packaged exports hide helpers.
  const prefix = "Authorization."
  const map = (value, encode) =>
    Array.isArray(value)
      ? value.map((item) => map(item, encode))
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value).map(([key, item]) => [
              key,
              key === "$" && typeof item === "string"
                ? encode
                  ? ["Nil", "Con", "None", "Some"].includes(item)
                    ? item
                    : prefix + item
                  : item.startsWith(prefix)
                    ? item.slice(prefix.length)
                    : item
                : map(item, encode)
            ])
          )
        : value
  let cases = 0,
    prefixes = 0
  const coverage = new Set()
  function run(facts, injection) {
    const input = tag("Input", { policy_unit: facts.policy !== false })
    const native = ports(facts),
      reference = facts.cleanupReceipt ? cleanupSpecification() : specification(input)
    let expected = reference.next(),
      step = facts.cleanupReceipt ? core.cleanup_initial(41) : core.initial(input, 41),
      at = 0
    let specifiedStep = facts.cleanupReceipt ? specified.cleanup_initial(41) : specified.initial(input, 41)
    assert.deepEqual(step, specifiedStep, "complete public initial correspondence")
    const trace = []
    while (!expected.done) {
      assert.ok(at < 180, "finite evaluation fixture exceeded its command budget")
      assert.equal(step.$, "Await")
      const command = map(step.request.command, false)
      assert.deepEqual(command, expected.value.command, `command ${at}: ${JSON.stringify(facts)}`)
      assert.equal(step.invocation, 41)
      assert.equal(step.id, at)
      assert.equal(step.request.invocation, 41)
      assert.equal(step.request.id, at)
      assert.equal(step.request.signal.$, expected.value.signal)
      coverage.add(command.$)
      trace.push(command)
      const response = injection?.has(at) ? tag("Failed", { token: injection.get(at) }) : native(command)
      const encoded = response.$ === "Authorized" ? { ...response, response: map(response.response, true) } : response
      const reply = tag("Reply", { invocation: 41, id: at, response: encoded })
      for (const malformed of [
        { ...reply, invocation: 42 },
        { ...reply, id: at + 1 }
      ])
        assert.equal(core.resume(step, malformed).$, "Rejected")
      assert.equal(core.resume({ ...step, request: { ...step.request, invocation: 42 } }, reply).$, "Rejected")
      assert.equal(core.resume({ ...step, request: { ...step.request, id: at + 1 } }, reply).$, "Rejected")
      step = core.resume(step, reply)
      specifiedStep = specified.resume(specifiedStep, reply)
      assert.deepEqual(step, specifiedStep, "complete public reply correspondence at " + at)
      expected = reference.next(response)
      at++
    }
    assert.equal(step.$, "FinishedEvaluation")
    assert.deepEqual(
      { task_faults: values(step.result.task_faults), final_faults: values(step.result.final_faults) },
      { task_faults: expected.value.task_faults, final_faults: expected.value.final_faults }
    )
    assert.equal(core.resume(step, tag("Reply", { invocation: 41, id: at, response: tag("Ack") })).$, "Rejected")
    cases++
    prefixes += at
    return trace
  }
  const fixtures = [
    {},
    { policy: false },
    { count: 0 },
    { existing: true },
    { refuseStart: true },
    { refuseReview: true },
    { inactive: true },
    { stale: true },
    { denyLost: true },
    { denyCredential: true },
    { closed: true },
    { disposition: "Ignored" },
    { disposition: "Stale" },
    { disposition: "StaleClearSettled" },
    { disposition: "StaleFindingRetired" },
    { denyOutcome: true },
    { started: false },
    ...["Backend", "Timeout", "Missing", "InputRefused"].flatMap(($) => [
      { result: tag($) },
      { result: tag($), started: false },
      { result: tag($), aborted: true },
      { result: tag($), aborted: true, interrupted: true }
    ])
  ]
  for (const facts of fixtures) {
    const trace = run(facts)
    for (let at = 0; at < trace.length; at++) run(facts, new Map([[at, 11]]))
  }
  for (const facts of [{}, { count: 0 }, { existing: true }, { result: tag("Backend"), aborted: true }]) {
    const baseline = run(facts)
    const providerAt = baseline.findIndex((command) => command.$ === "RunProvider")
    for (const first of [0, providerAt, providerAt + 1]) {
      const oneFault = run(facts, new Map([[first, 11]]))
      for (let second = first + 1; second < oneFault.length; second++)
        run(
          facts,
          new Map([
            [first, 11],
            [second, 22]
          ])
        )
    }
  }
  for (const receipt of ["Unissued", "Issued", "Started", "Interrupted", "Settled"])
    for (const aborted of [false, true])
      for (const noReviewing of [false, true]) {
        const facts = {
          cleanupReceipt: tag(receipt, receipt === "Unissued" ? {} : { request: 73 }),
          aborted,
          noReviewing
        }
        const trace = run(facts)
        for (let at = 0; at < trace.length; at++) run(facts, new Map([[at, 11]]))
        run({ ...facts, completed: true })
      }
  // Public cursors also accept typed states not reached by the ordered fixtures.
  // Vary those states independently: do not derive expected transitions from
  // implementation helpers or constrain correspondence to reachable happy paths.
  const enumerate = (names) => names.map(($) => tag($))
  const receipts = [
    tag("Unissued"),
    ...["Issued", "Started", "Interrupted", "Settled"].map(($) => tag($, { request: 73 }))
  ]
  const reviews = [tag("None"), ...[0, 2].map((count) => tag("Some", { value: tag("Review", { count, bytes: 19 }) }))]
  const dispositions = enumerate([
    "FindingRetained",
    "ClearSettled",
    "StaleClearSettled",
    "StaleFindingRetired",
    "Unavailable",
    "Ignored",
    "Stale"
  ])
  const outcomes = enumerate([
    "Clear",
    "Finding",
    "NeverSent",
    "RequestInterrupted",
    "RequestTimeout",
    "BackendFailure"
  ])
  const reasons = enumerate(["LostReason", "CredentialReason", "BackendReason", "StaleReason"])
  const classifications = ["NoFailure", "BackendUnavailable", "CredentialUnavailable", "LostUnavailable"].map(($) =>
    tag("Work." + $)
  )
  const results = [
    ...enumerate(["Backend", "Timeout", "InputRefused", "Missing"]),
    ...[0, 2].map((count) => tag("Evaluated", { review: tag("Review", { count, bytes: 19 }) }))
  ]
  const authSteps = [
    ...["Lost", "Credential"].map((reason) =>
      tag("Authorization.NotAuthorized", { reason: tag("Authorization." + reason) })
    ),
    tag("Authorization.AuthorizedRequest", { request: 73 }),
    tag("Authorization.Aborted", { token: 97 }),
    tag("Authorization.Rejected"),
    ...[0, 41, 42].map((invocation) =>
      tag("Authorization.Await", {
        invocation,
        id: 11,
        phase: tag("Authorization.Analytics"),
        request: tag("Authorization.Request", {
          invocation,
          id: 11,
          command: tag("Authorization.ReadEffectiveAnalytics")
        })
      })
    )
  ]
  const phases = [
    ...enumerate([
      "PolicyStart",
      "ReviewStart",
      "BackendGate",
      "AdmissionActive",
      "AdmissionCurrent",
      "BeforeEvaluate",
      "Controlled",
      "Provider",
      "DeniedNotice",
      "DeniedActivity",
      "RoundActive",
      "RoundRuntime",
      "RoundReported",
      "CurrentRuntime",
      "CurrentActive",
      "CurrentSource",
      "DiscardObserved",
      "NonRetainedJoined",
      "NonRetainedCompleted",
      "OutcomeRecorded",
      "RetentionActive",
      "RetentionInactiveRetired",
      "RetentionCandidates",
      "ExistingPublished",
      "ExistingRecorded",
      "ExistingRetired",
      "ExistingReleased",
      "AdviceInsertedPhase",
      "AdviceDriven",
      "FailureNotice",
      "FailureActivity",
      "RecoveryStatus",
      "RecoveryAborted",
      "RecoveryEscaped",
      "RecoveryAfterEscapedAborted",
      "RecoveryReviewing",
      "RecoveryInterrupt",
      "RecoveryInterrupted",
      "RecoveryInterruptStatus",
      "RecoveryObserved",
      "RecoveryJoined",
      "RecoveryDebug",
      "RecoveryRuntime",
      "RecoveryActivity",
      "FinallyCompleted",
      "FinallyReuse",
      "FinallyUnit",
      "Raising"
    ]),
    ...[false, true].map((current) => tag("EvaluatedStatus", { current })),
    ...["ForProvider", "RefuseStale"].flatMap((use) =>
      authSteps.map((step) => tag("Authorizing", { use: tag(use), step }))
    ),
    ...authSteps.map((step) => tag("RecoveryDeny", { step })),
    ...["DeniedAnalytics", "DeniedJoined", "FailureJoined"].flatMap(($) => reasons.map((reason) => tag($, { reason }))),
    ...["EvaluatedSettlement", "RecoverySettling"].flatMap(($) => outcomes.map((outcome) => tag($, { outcome }))),
    ...[
      "EvaluatedObservation",
      "DemoRecorded",
      "CacheStored",
      "CacheClaimReleased",
      "EvaluatedActivity",
      "NonRetainedFate",
      "NonRetainedRetired"
    ].flatMap(($) => dispositions.map((disposition) => tag($, { disposition }))),
    ...["ReleaseReuse", "ReleaseNativeUnit"].flatMap(($) =>
      ["FinishRelease", "RecordOutcomeRelease"].map((target) => tag($, { target: tag(target) }))
    ),
    ...["AdviceObserved", "AdvicePreserved"].flatMap(($) => [0, 11].map((tail) => tag($, { tail }))),
    ...[
      "FailureStatus",
      "FailureAborted",
      "FailureInterrupted",
      "FailureInterruptObserved",
      "FailureStatusAfterInterrupt"
    ].flatMap(($) => results.map((result) => tag($, { result }))),
    ...outcomes.flatMap((outcome) =>
      classifications.map((classification) => tag("FailureSettling", { outcome, classification }))
    ),
    ...["FailureCompleting", "FailureObserved"].flatMap(($) =>
      classifications.map((classification) => tag($, { classification }))
    )
  ]
  const responses = [
    tag("Ack"),
    ...[false, true].map((value) => tag("Flag", { value })),
    ...["Ack", "Flag", "Failed"].map(($) =>
      tag("Authorized", {
        response: tag("Authorization." + $, $ === "Flag" ? { value: true } : $ === "Failed" ? { token: 97 } : {})
      })
    ),
    ...results.map((result) => tag("ProviderReturned", { result })),
    ...receipts.map((receipt) => tag("RequestState", { receipt })),
    ...dispositions.map((disposition) => tag("RequestSettled", { disposition })),
    ...[
      [],
      [tag("Candidate", { handle: 1, matching: false })],
      [
        tag("Candidate", { handle: 1, matching: false }),
        tag("Candidate", { handle: 2, matching: true }),
        tag("Candidate", { handle: 3, matching: true })
      ]
    ].map((items) => tag("AdviceCandidates", { values: list(items) })),
    tag("Published", { publication: 7 }),
    tag("AdviceInserted", { tail: 11 }),
    tag("Failed", { token: 97 })
  ]
  const source = readFileSync(join(import.meta.dirname, "../Evaluation.bend"), "utf8")
  for (const [type, fixtures] of [
    ["Phase", phases],
    ["Response", responses]
  ]) {
    const block = source.match(new RegExp("type " + type + " is Data:([\\s\\S]*?)(?=\\ntype |\\ndef |$)", "u"))[1]
    assert.deepEqual(
      new Set(fixtures.map((value) => value.$)),
      new Set([...block.matchAll(/^  ([A-Z][A-Za-z0-9_]*)\{/gmu)].map((match) => match[1])),
      "cover every public " + type
    )
  }
  let stateComparisons = 0
  for (const policy_unit of [false, true])
    for (const receipt of receipts)
      for (const review of reviews)
        for (const mode of enumerate(["Normal", "Recovering", "Finalizing"])) {
          const context = tag("Context", {
            input: tag("Input", { policy_unit }),
            receipt,
            review,
            mode,
            task_faults: list([13, 17]),
            final_faults: list([23, 29])
          })
          for (const phase of phases) {
            const invocation = stateComparisons % 2 === 0 ? 0 : 41
            const id = stateComparisons % 3 === 0 ? 0 : 4294967297
            const step = tag("Await", {
              invocation,
              id,
              context,
              phase,
              request: tag("Request", { invocation, id, signal: tag("NativeSignal"), command: tag("ReadCompleted") })
            })
            for (const response of responses) {
              const reply = tag("Reply", { invocation, id, response })
              assert.deepEqual(core.resume(step, reply), specified.resume(step, reply), "typed public state " + phase.$)
              stateComparisons++
            }
          }
        }
  const mutantOutput = join(temporary, "mutants.mjs")
  execFileSync(
    "taskset",
    ["-c", "10", "bend", join(import.meta.dirname, "EvaluationMutants.bend"), "-o", mutantOutput],
    { timeout: 10000 }
  )
  const mutants = (await import(pathToFileURL(mutantOutput))).default
  const importedRoot = Object.keys(mutants).find((key) => key.endsWith("Evaluation.initial"))
  assert.ok(importedRoot)
  const rootPrefix = importedRoot.slice(0, -"initial".length)
  const relocate = function relocate(value, owner) {
    return value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value).map(([key, item]) => [
            key,
            key === "$" && typeof item === "string" && item.startsWith(owner)
              ? item.slice(owner.length)
              : relocate(item, owner)
          ])
        )
      : value
  }
  const rejectedMutants = []
  for (const [method, mutant, facts, branch] of [
    ["first_matching", "discard_existing", { existing: true }],
    ["signal_scope", "suppress_work_signal", {}],
    ["observed_failure", "never_sent", { result: tag("Timeout") }],
    ["advance", "skip_provider_result", {}, 'arguments[1].$ === "Provider" && arguments[2].$ === "ProviderReturned"'],
    ["advance", "skip_cache_store", {}, 'arguments[1].$ === "DemoRecorded" && arguments[2].$ === "Ack"']
  ]) {
    const original = core
    // Calls within emitted Bend use lexical bindings, not the export facade.
    // Substitute exactly that definition in a temporary compiled artifact.
    // The replacement body is a separately checked, typed Bend mutant; the
    // tracked implementation remains the sole source authority.
    const emitted = readFileSync(output, "utf8")
    const declaration = new RegExp(`^function \\$${method}\\$\\([^)]*\\) \\{[\\s\\S]*?^\\}`, "gmu")
    assert.equal([...emitted.matchAll(declaration)].length, 1, "missing unique emitted mutation target " + method)
    const replaced = emitted.replace(declaration, (body) => {
      const start = body.indexOf("{") + 1
      const invoke = `return $mutation_relocate($typed_mutant.${mutant}(...Array.from(arguments, $mutation_encode)));`
      return (
        body.slice(0, start) + (branch ? `\n  if (${branch}) { ${invoke} }` + body.slice(start) : `\n  ${invoke}\n}`)
      )
    })
    const arity = method === "advance" ? 5 : method === "observed_failure" ? 3 : 1
    const argumentsList = Array.from({ length: arity }, (_, index) => "a" + index).join(",")
    const probed = replaced.replace(
      "export default {",
      `export default {
"__mutation_probe": run_lib((${argumentsList}) => $${method}$(${argumentsList}), ${arity}),`
    )
    assert.notEqual(probed, replaced, "missing emitted export facade")
    const mutatedOutput = join(temporary, mutant + ".mjs")
    writeFileSync(
      mutatedOutput,
      `import $typed_mutant from ${JSON.stringify(pathToFileURL(mutantOutput).href)};\n` +
        `const $mutation_relocate = value => (${relocate.toString()})(value, ${JSON.stringify(rootPrefix)});\n` +
        `const $mutation_encode = value => value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key,item]) => [key, key === "$" && typeof item === "string" && !item.includes(".") && !["Nil","Con","None","Some"].includes(item) ? ${JSON.stringify(rootPrefix)} + item : $mutation_encode(item)])) : value;\n` +
        probed
    )
    core = (await import(pathToFileURL(mutatedOutput))).default
    try {
      if (method === "first_matching")
        assert.deepEqual(core.__mutation_probe(list([tag("Candidate", { handle: 1, matching: true })])), tag("None"))
      if (method === "signal_scope") assert.deepEqual(core.__mutation_probe(tag("BeforeEvaluate")), tag("NativeSignal"))
      if (method === "observed_failure")
        assert.deepEqual(
          core.__mutation_probe(tag("Started", { request: 73 }), false, tag("Timeout")),
          tag("NeverSent")
        )
      assert.throws(
        () => run(facts),
        (error) => error.code === "ERR_ASSERTION",
        mutant + " must change the whole emitted flow"
      )
      rejectedMutants.push(mutant)
    } finally {
      core = original
    }
    run(facts)
  }
  assert.ok(coverage.has("DriveAdviceTail") && coverage.has("PublishExisting") && coverage.has("ObserveInterrupted"))
  console.log(
    JSON.stringify({
      passed: true,
      packaged,
      cases,
      prefixes,
      commands: coverage.size,
      stateComparisons,
      rejectedMutants,
      scope:
        "complete emitted Evaluation public-step/state correspondence plus independent ordered trace oracle; every fixture command fault, two signal domains and reply correlation; not Canonical ownership, physical IO or universal proof"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
