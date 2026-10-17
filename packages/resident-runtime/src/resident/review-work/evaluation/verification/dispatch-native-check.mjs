import assert from "node:assert/strict"
import { mkdtemp, lstat, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execFileSync } from "node:child_process"
import { prepareObservation } from "@hapsland/review-execution/direct-event/pipeline"
import { DEFAULT_DIRECT_FILE_POLICY } from "@hapsland/native-observation/direct-event/selection"
import { configuredRules, advicee } from "../../preparation/verification/preparation-fixtures.mjs"
import { runEvaluationProvider } from "../native-provider.ts"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Cause from "effect/Cause"
import * as Ref from "effect/Ref"
import owner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import { initialCanonical, projectCanonical } from "@hapsland/canonical-policy/canonical/adapter"
import { residentTransaction } from "../../../state/resident/transaction.ts"
import { residentCapacity } from "../../../state/resident/capacity.ts"
import { createResidentOwnerTransaction } from "../../../state/resolver-custody/resident-owner-transaction.mjs"
import { createPreparationSessionRegistry } from "../../composition/native-preparation-sessions.ts"
import { createResidentPreparationDriver } from "../../composition/preparation-driver.ts"
import { makeEvaluationDispatchCallback } from "../native-dispatch.ts"

const run = Effect.runSync
let cases = 0
const root = await mkdtemp(join(tmpdir(), "hapsland-dispatch-native-"))
try {
  execFileSync("git", ["init", "-q", root], { timeout: 5000 })
  await writeFile(join(root, "unit.ts"), "export type Count = number;\n")
  const a = await lstat(root),
    b = await lstat(join(root, ".git"))
  const rootIdentity = {
    rootDevice: String(a.dev),
    rootInode: String(a.ino),
    gitDirectory: join(root, ".git"),
    gitDevice: String(b.dev),
    gitInode: String(b.ino)
  }
  const preparationResult = await Effect.runPromise(
    prepareObservation(
      { root, rootIdentity, advicee: advicee(), candidates: [{ operation: "add", path: "unit.ts" }] },
      { settings: { rules: configuredRules }, policy: DEFAULT_DIRECT_FILE_POLICY }
    )
  )
  const prepared = preparationResult.outcomes.find((value) => value.status === "ready")?.prepared
  assert.ok(prepared, "physical source preparation must produce a provider input")
  for (const variant of [
    "started",
    "interrupted",
    "credential-changed",
    "observer-defect",
    "callback-interrupted",
    "provider-clear",
    "provider-input-refused"
  ]) {
    const limits = { globalItems: 100, globalBytes: 10000, partitionItems: 16, partitionBytes: 10000 }
    const ref = run(
      Ref.make({
        residentLifetime: "dispatch-native",
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
    const transaction = residentTransaction(ref, "dispatch-native"),
      capacity = residentCapacity(transaction)
    const registry = createPreparationSessionRegistry()
    const bridge = createResidentOwnerTransaction({
      owner,
      transaction,
      onActions: (actions) => Effect.sync(() => driver?.acceptActions(actions))
    })
    const driver = createResidentPreparationDriver({ bridge, registry })
    const partition = run(capacity.partitionId("agent")),
      round = run(capacity.roundId("agent"))
    const observation = run(capacity.admitObservation("agent", round))
    assert.equal(run(capacity.observation("agent", observation, "startObservation", round)), true)
    const preparation = run(capacity.beginObservedPreparation("agent", observation, 100, round))
    assert.equal(preparation.status, "admitted")
    const [unit] = run(
      capacity.completePreparation("agent", preparation.operation, preparation.reservation, [20], round)
    )
    assert.ok(unit)
    assert.equal(run(capacity.startReview("agent", unit.operation, round)), true)
    const invocation = bridge.control.readCustody().next_invocation
    const control = (method, args) => {
      const step = bridge.control.invoke(method, args)
      assert.equal(step.$, "Advanced")
      return step
    }
    const child = (id) => owner.find(id, bridge.control.readCustody().children).value
    control("launch_evaluation", [
      { $: "EvaluationContext", partition, lifetime: 1, round, operation: unit.operation },
      900
    ])
    control("install", [invocation, 0, 901, 0])
    control("provider_start", [invocation])
    const binding = { partition: "agent", operation: unit.operation, round, reservation: unit.reservation }
    const firstLease = { invocation, generation: 0, lease: child(invocation).lease.value.id, request: 0 }
    const ready = run(
      bridge.evaluationReady(firstLease, binding, {
        $: "EvaluationFacts",
        root_valid: true,
        configuration_valid: true,
        credential_ready: true,
        selected: true,
        current_work: true,
        physical_available: true
      })
    ).value
    assert.equal(ready.status, "issued")
    control("provider_completed", [invocation, firstLease.lease, 0, 902])
    control("install_evaluation_provider", [invocation, 1, 903, 1])
    control("provider_start", [invocation])
    const parent = { invocation, generation: 1, lease: child(invocation).lease.value.id, request: 1 }
    const held = child(invocation)
    const observations = [],
      controller = new AbortController(),
      original = new Error("original dispatch observer defect")
    const job = {
      partition: "agent",
      canonicalOperationId: unit.operation,
      canonicalRound: round,
      reservation: unit.reservation,
      dispatch: { credential: null, demoBudgetPath: null },
      observation: { root },
      prepared:
        variant === "provider-input-refused"
          ? { ...prepared, input: { ...prepared.input, contract: "invalid-fixture-contract" } }
          : prepared,
      settings: {}
    }
    const callback = makeEvaluationDispatchCallback({
      context: {
        job,
        signal: controller.signal,
        deps: {
          residentLedger: capacity,
          residentRecordAnalytics: (_job, kind) =>
            variant === "callback-interrupted" && kind === "request-started" ? Effect.never : Effect.void,
          residentObserveJevRequest(value) {
            observations.push(value)
            if (value.stage === "started" && variant === "interrupted") controller.abort()
            if (value.stage === "started" && variant === "observer-defect") throw original
          }
        }
      },
      identity: {
        partition: "agent",
        canonicalPartition: partition,
        lifetime: "dispatch-native",
        canonicalLifetime: 1,
        round,
        hapslandRound: null,
        operation: unit.operation
      },
      request: ready.request,
      parent,
      bridge,
      driver,
      credential: () =>
        variant === "credential-changed" ? { status: "present", source: "environment", generation: -1 } : undefined
    })
    let physicalCalls = 0
    const provider = runEvaluationProvider(
      {
        job,
        deps: {
          residentControlledRequestEffect: async () => {
            physicalCalls++
            assert.equal(projectCanonical(run(transaction.read).canonical).dispatch.requests[0].started, true)
            assert.deepEqual(child(invocation).lease, held.lease)
          }
        }
      },
      { controlled: {}, credential: undefined, request: ready.request, beforeDispatch: callback, observeOutcome() {} }
    )
    const exit = await Effect.runPromiseExit(
      variant.startsWith("provider-")
        ? provider
        : variant === "callback-interrupted"
          ? callback.pipe(Effect.timeout("30 millis"))
          : callback
    )
    assert.equal(child(invocation).generation, held.generation)
    assert.deepEqual(child(invocation).lease, held.lease, "callback must leave parent provider await parked")
    const projection = projectCanonical(run(transaction.read).canonical)
    const request = projection.dispatch.requests.find((value) => value.request === ready.request)
    assert.ok(request)
    if (variant === "credential-changed" || variant === "provider-input-refused") {
      assert.equal(Exit.isFailure(exit), variant === "credential-changed")
      assert.equal(request.started, false)
      assert.equal(job.requestStarted, undefined)
      assert.deepEqual(observations, [])
    } else {
      assert.equal(request.started, true)
      assert.equal(job.requestStarted, true)
      assert.deepEqual(
        observations.map((value) => value.stage),
        variant === "interrupted" ? ["started", "interrupted"] : variant === "callback-interrupted" ? [] : ["started"]
      )
      if (variant === "observer-defect") {
        assert.equal(Exit.isFailure(exit), true)
        assert.strictEqual(Cause.squash(exit.cause), original)
      } else if (variant === "callback-interrupted") assert.equal(Exit.isFailure(exit), true)
      else assert.equal(Exit.isSuccess(exit), true)
    }
    if (variant === "provider-clear") {
      assert.equal(physicalCalls, 1)
      assert.equal(exit.value.status, "evaluated")
      assert.equal(exit.value.findings.length, 0)
    } else assert.equal(physicalCalls, 0)
    if (variant === "provider-input-refused") {
      control("provider_completed", [invocation, parent.lease, 1, 950])
      control("install", [invocation, 2, 951, 2])
      control("provider_start", [invocation])
    }
    assert.equal(request.interrupted, variant === "interrupted")
    if (variant === "provider-input-refused") assert.equal(exit.value.status, "input-invalid")
    assert.equal(registry.size, 0)
    assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
    assert.equal(registry.pendingCleanup, 0)
    assert.equal(
      await Effect.runPromiseExit(callback).then(Exit.isFailure),
      true,
      "a callback cannot acquire a second child"
    )
    assert.equal(projectCanonical(run(transaction.read).canonical).dispatch.requests.length, 1)
    assert.equal(run(transaction.read).requestRounds.size, 1, "provider completion alone cannot release the request")
    if (variant !== "provider-input-refused") {
      control("provider_completed", [invocation, parent.lease, 1, 950])
      control("install", [invocation, 2, 951, 2])
      control("provider_start", [invocation])
    }
    const outcome =
      variant === "credential-changed" || variant === "provider-input-refused"
        ? "neverSent"
        : variant === "interrupted"
          ? "interrupted"
          : variant === "observer-defect" || variant === "callback-interrupted"
            ? "backendFailure"
            : "clear"
    const settled = run(
      bridge.evaluationSettle(
        { invocation, generation: 2, lease: child(invocation).lease.value.id, request: 2 },
        binding,
        outcome,
        outcome === "clear"
      )
    ).value
    assert.equal(settled, outcome === "clear" ? "clearSettled" : "unavailable")
    assert.equal(run(transaction.read).requestRounds.size, 0)
    assert.equal(run(transaction.read).reservations.size, 0)
    assert.equal(projectCanonical(run(transaction.read).canonical).dispatch.requests.length, 0)
    control("provider_completed", [invocation, child(invocation).lease.value.id, 2, 952])
    control("terminal", [invocation, 3, 953])
    cases++
  }
} finally {
  await rm(root, { recursive: true, force: true })
}
console.log(
  JSON.stringify({
    passed: true,
    cases,
    scope:
      "packaged Dispatch through shared resident driver/registry and actual Canonical/native request metadata; parked parent, start/interruption, credential refusal, original observer Cause and duplicate callback; controlled physical provider and input refusal covered; whole evaluation adoption remains open"
  })
)
