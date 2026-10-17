import assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Cause from "effect/Cause"
import * as Ref from "effect/Ref"
import owner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import { initialCanonical, projectCanonical } from "@hapsland/canonical-policy/canonical/adapter"
import { effectNative, nativeFailureAggregate } from "@hapsland/runtime-environment/runtime/native-execution"
import { residentTransaction } from "../../../../../dist/resident/state/resident/transaction.js"
import { residentCapacity } from "../../../../../dist/resident/state/resident/capacity.js"
import { createResidentOwnerTransaction } from "../../../../../dist/resident/state/resolver-custody/resident-owner-transaction.mjs"
import { createResidentPreparationDriver } from "../../../../../dist/resident/review-work/composition/preparation-driver.js"
import { createPreparationSessionRegistry } from "../../../../../dist/resident/review-work/composition/native-preparation-sessions.js"
import { createEvaluationSession } from "../../../../../dist/resident/review-work/evaluation/evaluation-session.js"
import { makeEvaluationDispatchCallback } from "../../../../../dist/resident/review-work/evaluation/native-dispatch.js"
import { physicalRequest } from "../../../../../dist/resident/work-ownership/cancellation.js"
import { ResidentAdapterError } from "../../../../../dist/resident/adapter-error.js"

const run = Effect.runSync,
  tag = ($, fields = {}) => ({ $, ...fields })
const bounded = async (promise) => {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Fixture signal deadline exceeded")), 3000)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}
let cases = 0
for (const variant of [
  "cancel",
  "cleanup-before-settle",
  "cleanup-after-settle",
  "provider-defect",
  "provider-adapter-error"
]) {
  const limits = { globalItems: 100, globalBytes: 10000, partitionItems: 16, partitionBytes: 10000 }
  const ref = run(
    Ref.make({
      residentLifetime: "registry-cleanup",
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
  const transaction = residentTransaction(ref, "registry-cleanup"),
    capacity = residentCapacity(transaction),
    registry = createPreparationSessionRegistry()
  const bridge = createResidentOwnerTransaction({
    owner,
    transaction,
    onActions: (actions) => Effect.sync(() => driver.acceptActions(actions))
  })
  const driver = createResidentPreparationDriver({ bridge, registry })
  const partition = run(capacity.partitionId("agent")),
    round = run(capacity.roundId("agent"))
  const observation = run(capacity.admitObservation("agent", round))
  run(capacity.observation("agent", observation, "startObservation", round))
  const preparation = run(capacity.beginObservedPreparation("agent", observation, 100, round))
  const [unit] = run(capacity.completePreparation("agent", preparation.operation, preparation.reservation, [20], round))
  assert.ok(unit)
  const context = { $: "EvaluationContext", partition, lifetime: 1, round, operation: unit.operation }
  const binding = { partition: "agent", operation: unit.operation, round, reservation: unit.reservation }
  const identity = {
    partition: "agent",
    canonicalPartition: partition,
    lifetime: "registry-cleanup",
    canonicalLifetime: 1,
    round,
    hapslandRound: null,
    operation: unit.operation
  }
  const facts = {
    $: "EvaluationFacts",
    root_valid: true,
    configuration_valid: true,
    credential_ready: true,
    selected: true,
    current_work: true,
    physical_available: true
  }
  const controller = new AbortController(),
    work = new AbortController(),
    entered = Promise.withResolvers(),
    aborted = Promise.withResolvers(),
    release = Promise.withResolvers()
  const original = new Error("original provider defect"),
    cleanupFailure = new Error("original cleanup observer defect")
  const job = {
    partition: "agent",
    canonicalOperationId: unit.operation,
    canonicalRound: round,
    reservation: unit.reservation,
    dispatch: { credential: null, demoBudgetPath: null },
    observation: { root: "/unused" }
  }
  let origin,
    drained = false,
    cleaned = false,
    injected = false,
    allowCleanup = false,
    settlements = 0,
    cleanupLaunches = 0
  const child = (invocation) => owner.find(invocation, bridge.control.readCustody().children).value
  const outcomes = {
    Clear: "clear",
    Finding: "finding",
    NeverSent: "neverSent",
    BackendFailure: "backendFailure",
    RequestTimeout: "timeout",
    RequestInterrupted: "interrupted"
  }
  const dispositions = { clearSettled: "ClearSettled", unavailable: "Unavailable", stale: "Stale", ignored: "Ignored" }
  const perform = Effect.fn("Fixture.evaluationIO")(function* (command, lease) {
    const projection = projectCanonical(run(transaction.read).canonical)
    switch (command.$) {
      case "StartReview":
        return tag("Flag", { value: yield* capacity.startReview("agent", unit.operation, round) })
      case "ReadJobActive":
      case "ReadCurrentWork":
        return tag("Flag", { value: true })
      case "ReadRuntimeActive":
      case "ReadCompleted":
        return tag("Flag", { value: false })
      case "ReadReviewing":
        return tag("Flag", {
          value: projection.work.some((value) => value.operation === unit.operation && value.kind === "reviewing")
        })
      case "ReadAborted":
        return tag("Flag", { value: work.signal.aborted })
      case "Authorization": {
        const value = command.command
        switch (value.$) {
          case "Authorization.ReadCredentialRequired":
            return tag("Authorized", { response: tag("Authorization.Flag", { value: false }) })
          case "Authorization.ValidateControlled":
          case "Authorization.CheckCredentialShape":
          case "Authorization.VerifyInitialRoot":
          case "Authorization.CheckCredentialGeneration":
          case "Authorization.CheckCredentialName":
          case "Authorization.CheckProviderIdentity":
          case "Authorization.VerifyDispatchRoot":
          case "Authorization.ReadCurrentWork":
          case "Authorization.ReadPhysicalAvailable":
            return tag("Authorized", { response: tag("Authorization.Flag", { value: true }) })
          case "Authorization.ResolveCredential":
            return tag("Authorized", { response: tag("Authorization.Resolved", { present: true }) })
          case "Authorization.ReadFileAdmission":
            return tag("Authorized", {
              response: tag("Authorization.FileAdmission", { selected: true, admitted: true })
            })
          case "Authorization.ReadyRequest": {
            const result = (yield* bridge.evaluationReady(lease, binding, facts)).value
            assert.equal(result.status, "issued")
            job.requestId = result.request
            return tag("Authorized", {
              response: tag("Authorization.RequestDecision", {
                decision: tag("Authorization.Issued", { request: result.request })
              })
            })
          }
          case "Authorization.ReadEffectiveAnalytics":
          case "Authorization.AuthorizationBarrier":
          case "Authorization.CredentialBarrier":
          case "Authorization.ObserveFileAdmission":
          case "Authorization.ObserveIssued":
          case "Authorization.ArmInterruption":
            return tag("Authorized", { response: tag("Authorization.Ack") })
          default:
            assert.fail("Unexpected authorization command: " + value.$)
        }
        break
      }
      case "RunProvider": {
        yield* makeEvaluationDispatchCallback({
          context: {
            job,
            signal: work.signal,
            deps: {
              residentLedger: capacity,
              residentObserveJevRequest() {},
              residentRecordAnalytics: () => Effect.void
            }
          },
          identity,
          request: job.requestId,
          credential: () => undefined,
          parent: lease,
          bridge,
          driver
        })
        yield* physicalRequest("fixture provider", (signal) => {
          entered.resolve()
          signal.addEventListener("abort", () => aborted.resolve(), { once: true })
          return release.promise.then(() => {
            drained = true
          })
        })
        if (variant === "provider-defect") return yield* Effect.die(original)
        if (variant === "provider-adapter-error")
          return yield* Effect.fail(new ResidentAdapterError({ operation: "fixture provider" }))
        return tag("ProviderReturned", { result: tag("Backend") })
      }
      case "ReadRequestState": {
        const current = projection.dispatch.requests.find((value) => value.request === job.requestId)
        return tag("RequestState", {
          receipt: !current
            ? tag("Settled", { request: job.requestId })
            : tag(current.interrupted ? "Interrupted" : current.started ? "Started" : "Issued", {
                request: current.request
              })
        })
      }
      case "SettleRequest": {
        assert.equal(drained, true, "physical provider must settle before accounting")
        const disposition = (yield* bridge.evaluationSettle(
          lease,
          binding,
          outcomes[command.outcome.$],
          command.current
        )).value
        settlements++
        assert.equal(
          disposition,
          projection.work.some((value) => value.operation === unit.operation) ? "unavailable" : "ignored"
        )
        return tag("RequestSettled", { disposition: tag(dispositions[disposition]) })
      }
      case "ObserveEscaped":
        if (
          child(lease.invocation).scope.$ === "EvaluationCleanupScope" &&
          variant === "cleanup-before-settle" &&
          !allowCleanup
        ) {
          injected = true
          return yield* Effect.die(cleanupFailure)
        }
        return tag("Ack")
      case "ObserveSettled":
        if (
          child(lease.invocation).scope.$ === "EvaluationCleanupScope" &&
          variant === "cleanup-after-settle" &&
          !injected
        ) {
          injected = true
          return yield* Effect.die(cleanupFailure)
        }
        return tag("Ack")
      case "ReleaseUnit":
        yield* capacity.release(unit.reservation)
        return tag("Ack")
      case "AwaitBackendGate":
      case "EvaluationBarrier":
      case "DecodeControlled":
      case "SettleJoined":
      case "RecordDebugFailure":
      case "ReleaseReuseClaim":
        return tag("Ack")
      default:
        assert.fail("Unexpected evaluation command: " + command.$)
    }
  })
  const recovery = () =>
    Effect.suspend(() => {
      if (cleaned) return Effect.void
      if (child(origin).phase.$ === "ChildAccepted") {
        cleaned = true
        return Effect.void
      }
      assert.equal(child(origin).phase.$, "ChildCancelled")
      assert.equal(drained, true, "registry cleanup cannot precede physical drain")
      let cleanup
      return driver
        .driveConstructedEffect(() => {
          const invocation = driver.allocateEvaluationCleanupInvocation(origin)
          cleanupLaunches++
          cleanup = createEvaluationSession({
            invocation,
            mode: { kind: "cleanup" },
            workSignal: work.signal,
            perform,
            finish: () => Effect.void
          })
          return { session: cleanup, input: cleanup.input }
        })
        .pipe(
          Effect.flatMap((result) => {
            assert.ok("evaluation" in result)
            return cleanup.completion(result.evaluation)
          }),
          Effect.tap(() =>
            Effect.sync(() => {
              cleaned = true
            })
          )
        )
    })
  const inputCleanup = function* () {
    const exit = yield effectNative(Effect.exit(recovery()), false)
    if (Exit.isFailure(exit)) throw nativeFailureAggregate([], "Fixture input cleanup failed", undefined, exit.cause)
  }
  let session
  const effect = driver
    .driveConstructedEffect(() => {
      origin = driver.allocateEvaluationInvocation(context, inputCleanup)
      session = createEvaluationSession({
        invocation: origin,
        mode: { kind: "root", input: tag("Input", { policy_unit: false }) },
        workSignal: work.signal,
        perform,
        finish: (cancelled) => (cancelled ? recovery() : Effect.void)
      })
      return { session, input: session.input }
    })
    .pipe(
      Effect.flatMap((result) => ("evaluation" in result ? session.completion(result.evaluation) : Effect.interrupt))
    )
  const pending = Effect.runPromiseExit(effect, { signal: controller.signal })
  await bounded(entered.promise)
  if (variant.startsWith("provider-")) release.resolve()
  else {
    controller.abort()
    await bounded(aborted.promise)
    assert.equal(drained, false)
    assert.equal(cleanupLaunches, 0)
    assert.equal(run(transaction.read).requestRounds.size, 1)
    assert.equal(projectCanonical(run(transaction.read).canonical).dispatch.requests[0].started, true)
    release.resolve()
  }
  const exit = await bounded(pending)
  if (variant === "provider-adapter-error") assert.equal(Exit.isSuccess(exit), true)
  else assert.equal(Exit.isFailure(exit), true)
  if (variant === "provider-defect") assert.strictEqual(Cause.squash(exit.cause), original)
  if (variant.startsWith("cleanup-")) {
    assert.equal(injected, true)
    assert.ok(registry.pendingCleanup > 0)
    if (variant === "cleanup-before-settle") {
      assert.ok(driver.resources.payloads > 0)
      assert.equal(run(transaction.read).requestRounds.size, 1)
    }
    allowCleanup = true
    await Effect.runPromise(registry.retryCleanupEffect())
    assert.ok(cleanupLaunches >= 2)
    assert.ok(
      exit.cause.reasons.some((value) => value._tag === "Die" && value.defect === cleanupFailure),
      "cleanup observer Cause must survive registry retries"
    )
  }
  assert.equal(settlements, 1, "retry must not repeat committed settlement")
  assert.equal(run(transaction.read).requestRounds.size, 0)
  assert.equal(run(transaction.read).reservations.size, 0)
  assert.equal(registry.pendingCleanup, 0)
  assert.equal(registry.size, 0)
  assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
  cases++
}
console.log(
  JSON.stringify({
    passed: true,
    cases,
    scope:
      "packaged whole cursor through shared Canonical driver/registry; actual request/reservation metadata and held physical Promise; cleanup after drain, retained cleanup before/after settlement, one settlement, task adapter failure and original provider defect; controlled authorization/observation ports, full production evaluation and retained advice remain open"
  })
)
