import assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"
import owner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import { initialCanonical, projectCanonical } from "@hapsland/canonical-policy/canonical/adapter"
import { residentTransaction } from "../../../../../dist/resident/state/resident/transaction.js"
import { residentCapacity } from "../../../../../dist/resident/state/resident/capacity.js"
import { createResidentOwnerTransaction } from "../../../../../dist/resident/state/resolver-custody/resident-owner-transaction.mjs"
import core from "../../../../../dist/resident/review-work/evaluation/evaluation-core.js"

const run = Effect.runSync
const tag = ($, fields = {}) => ({ $, ...fields })
let cases = 0,
  commands = 0
for (const variant of ["unissued", "unissued-work-gone", "issued", "started", "interrupted", "settled"]) {
  const limits = { globalItems: 100, globalBytes: 10000, partitionItems: 16, partitionBytes: 10000 }
  const ref = run(
    Ref.make({
      residentLifetime: "evaluation-cleanup",
      limits,
      canonical: initialCanonical(limits),
      resolverCustody: owner.initial_custody(),
      reservations: new Map(),
      partitionIds: new Map(),
      partitionIdentityBytes: 0,
      roundIds: new Map(),
      requestRounds: new Map(),
      collectionTokens: new Map(),
      nextCollectionToken: 1,
      nextPartitionId: 1,
      minimumFreshStart: 0,
      records: { runtime: { peakLedgerBytes: 0 } }
    })
  )
  const transaction = residentTransaction(ref, "evaluation-cleanup"),
    capacity = residentCapacity(transaction)
  const bridge = createResidentOwnerTransaction({ owner, transaction })
  const partition = run(capacity.partitionId("agent")),
    round = run(capacity.roundId("agent"))
  const observation = run(capacity.admitObservation("agent", round))
  run(capacity.observation("agent", observation, "startObservation", round))
  const preparation = run(capacity.beginObservedPreparation("agent", observation, 100, round))
  const [unit] = run(capacity.completePreparation("agent", preparation.operation, preparation.reservation, [20], round))
  assert.ok(unit)
  run(capacity.startReview("agent", unit.operation, round))
  const control = (method, args) => bridge.control.invoke(method, args)
  const accepted = (method, args) => {
    const result = control(method, args)
    assert.equal(result.$, "Advanced", method)
    return result
  }
  const child = (invocation) => owner.find(invocation, bridge.control.readCustody().children).value
  const lease = (invocation, generation, request) => ({
    invocation,
    generation,
    request,
    lease: child(invocation).lease.value.id
  })
  const origin = bridge.control.readCustody().next_invocation
  const context = { $: "EvaluationContext", partition, lifetime: 1, round, operation: unit.operation }
  const binding = { partition: "agent", operation: unit.operation, round, reservation: unit.reservation }
  const facts = {
    $: "EvaluationFacts",
    root_valid: true,
    configuration_valid: true,
    credential_ready: true,
    selected: true,
    current_work: true,
    physical_available: true
  }
  accepted("launch_evaluation", [context, 100])
  assert.equal(
    control("launch_evaluation_cleanup", [origin, 101]).$,
    "Rejected",
    "active root cannot grant cleanup custody"
  )
  accepted("install", [origin, 0, 102, 0])
  accepted("provider_start", [origin])
  let request
  if (!variant.startsWith("unissued")) {
    const ready = run(bridge.evaluationReady(lease(origin, 0, 0), binding, facts)).value
    assert.equal(ready.status, "issued")
    request = ready.request
    if (["started", "interrupted", "settled"].includes(variant)) {
      accepted("provider_completed", [origin, child(origin).lease.value.id, 0, 103])
      accepted("install_evaluation_provider", [origin, 1, 104, 1])
      accepted("provider_start", [origin])
      const dispatch = bridge.control.readCustody().next_invocation
      accepted("launch_evaluation_dispatch", [{ $: "Parent", invocation: origin, generation: 1, request: 1 }, 105])
      accepted("install", [dispatch, 0, 106, 0])
      accepted("provider_start", [dispatch])
      assert.equal(run(bridge.evaluationStart(lease(dispatch, 0, 0), binding)).value, true)
      accepted("provider_completed", [dispatch, child(dispatch).lease.value.id, 0, 107])
      accepted("complete_evaluation_dispatch", [dispatch, 1, 108, true])
    }
    if (variant === "settled") {
      accepted("provider_completed", [origin, child(origin).lease.value.id, 1, 109])
      accepted("install", [origin, 2, 110, 2])
      accepted("provider_start", [origin])
      assert.equal(
        run(bridge.evaluationSettle(lease(origin, 2, 2), binding, "backendFailure", false)).value,
        "unavailable"
      )
    }
  }
  accepted("cancel", [origin])
  if (variant === "unissued-work-gone") run(capacity.release(unit.reservation))
  const invocation = bridge.control.readCustody().next_invocation
  accepted("launch_evaluation_cleanup", [origin, 200])
  assert.equal(control("launch_evaluation_cleanup", [origin, 201]).$, "Rejected", "only one cleanup may be active")
  assert.deepEqual(child(invocation).parent, { $: "None" }, "cancelled parent cannot fence accounting")
  assert.equal(child(invocation).scope.origin, origin)
  assert.deepEqual(child(invocation).scope.context, context)
  assert.equal(control("terminal", [invocation, 0, 202]).$, "Rejected")
  assert.equal(
    control("complete_evaluation", [invocation, 0, 203]).$,
    ["settled", "unissued-work-gone"].includes(variant) ? "Advanced" : "Rejected"
  )
  // The settled case above exercised terminal authority; use a fresh retry for the cursor.
  let cleanup = invocation
  if (["settled", "unissued-work-gone"].includes(variant)) {
    cleanup = bridge.control.readCustody().next_invocation
    accepted("launch_evaluation_cleanup", [origin, 204])
  }
  let step = core.cleanup_initial(cleanup),
    generation = 0
  const trace = []
  while (step.$ === "Await") {
    assert.ok(generation < 40)
    const command = step.request.command
    trace.push(command.$)
    accepted("install", [cleanup, generation, 300 + generation * 2, step.id])
    accepted("provider_start", [cleanup])
    const credential = lease(cleanup, generation, step.id)
    const before = run(transaction.read)
    assert.equal(
      run(bridge.evaluationReady(credential, binding, facts)).value.status,
      "stale",
      "cleanup cannot authorize a request"
    )
    assert.deepEqual(run(transaction.read), before)
    assert.equal(run(bridge.evaluationStart(credential, binding)).value, false)
    assert.equal(control("install_evaluation_provider", [cleanup, generation, 700, step.id]).$, "Rejected")
    assert.equal(
      control("launch_evaluation_dispatch", [{ $: "Parent", invocation: cleanup, generation, request: step.id }, 701])
        .$,
      "Rejected"
    )
    let response
    const projection = projectCanonical(run(transaction.read).canonical)
    switch (command.$) {
      case "ReadRequestState": {
        const actual = projection.dispatch.requests.find((value) => value.request === request)
        const receipt =
          request === undefined
            ? tag("Unissued")
            : !actual
              ? tag("Settled", { request })
              : tag(actual.interrupted ? "Interrupted" : actual.started ? "Started" : "Issued", { request })
        response = tag("RequestState", { receipt })
        break
      }
      case "ReadAborted":
        response = tag("Flag", { value: variant === "interrupted" })
        break
      case "ReadReviewing":
        response = tag("Flag", {
          value: projection.work.some((value) => value.operation === unit.operation && value.kind === "reviewing")
        })
        break
      case "ReadRuntimeActive":
      case "ReadCompleted":
        response = tag("Flag", { value: false })
        break
      case "Authorization": {
        if (command.command.$ === "Authorization.DenyRequest") {
          const result = run(
            bridge.evaluationReady(credential, binding, {
              $: "EvaluationFacts",
              root_valid: false,
              configuration_valid: false,
              credential_ready: false,
              selected: false,
              current_work: false,
              physical_available: false
            })
          ).value
          assert.equal(result.status, "unavailable")
          response = tag("Authorized", {
            response: tag("Authorization.RequestDecision", { decision: tag("Authorization.Unavailable") })
          })
        } else {
          assert.equal(command.command.$, "Authorization.ObserveUnavailable")
          response = tag("Authorized", { response: tag("Authorization.Ack") })
        }
        break
      }
      case "InterruptRequest":
        response = tag("Flag", { value: run(capacity.interruptJevRequest("agent", unit.operation, request)) })
        break
      case "SettleRequest": {
        assert.equal(run(bridge.evaluationSettle(credential, binding, "clear", true)).value, "stale")
        assert.equal(run(bridge.evaluationSettle(credential, binding, "finding", true)).value, "stale")
        assert.equal(
          run(
            bridge.evaluationSettle(
              credential,
              { ...binding, reservation: { ...binding.reservation } },
              "backendFailure",
              false
            )
          ).value,
          "stale"
        )
        const outcomes = { NeverSent: "neverSent", BackendFailure: "backendFailure", RequestInterrupted: "interrupted" }
        const outcome = outcomes[command.outcome.$]
        assert.equal(
          outcome,
          variant === "issued" ? "neverSent" : variant === "interrupted" ? "interrupted" : "backendFailure"
        )
        const result = run(bridge.evaluationSettle(credential, binding, outcome, false)).value
        assert.equal(result, "unavailable")
        response = tag("RequestSettled", { disposition: tag("Unavailable") })
        break
      }
      case "ReleaseUnit":
        run(capacity.release(unit.reservation))
        response = tag("Ack")
        break
      case "ObserveEscaped":
      case "ObserveInterrupted":
      case "ObserveSettled":
      case "SettleJoined":
      case "RecordDebugFailure":
      case "ReleaseReuseClaim":
        response = tag("Ack")
        break
      default:
        assert.fail("Cleanup issued a forbidden or unbound command: " + command.$)
    }
    accepted("provider_completed", [cleanup, credential.lease, step.id, 301 + generation * 2])
    step = core.resume(step, { $: "Reply", invocation: cleanup, id: step.id, response })
    generation++
    commands++
  }
  assert.equal(step.$, "FinishedEvaluation")
  assert.deepEqual(step.result.task_faults, tag("Nil"))
  assert.deepEqual(step.result.final_faults, tag("Nil"))
  accepted("complete_evaluation", [cleanup, generation, 800])
  assert.equal(child(origin).phase.$, "ChildCancelled")
  assert.equal(run(transaction.read).requestRounds.size, 0)
  assert.equal(run(transaction.read).reservations.size, 0)
  assert.equal(projectCanonical(run(transaction.read).canonical).dispatch.requests.length, 0)
  assert.ok(!trace.includes("RunProvider") && !trace.includes("InsertAdvice"))
  const retry = bridge.control.readCustody().next_invocation
  accepted("launch_evaluation_cleanup", [origin, 900])
  if (request !== undefined)
    assert.equal(
      child(retry).scope.permission.$,
      "EvaluationSettled",
      "retry follows the actual request ledger, not stale root permission"
    )
  accepted("cancel", [retry])
  cases++
}
console.log(
  JSON.stringify({
    passed: true,
    cases,
    commands,
    scope:
      "packaged recovery cursor plus actual Ref/Canonical cleanup custody and native settlement; denial-only issuance, no provider/retention/result acceptance, exact request/reservation, cancelled root and unissued/issued/started/interrupted/settled cleanup; registry-driven physical cancellation and full evaluation adoption remain open"
  })
)
