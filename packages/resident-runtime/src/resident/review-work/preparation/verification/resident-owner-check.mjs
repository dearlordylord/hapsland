import assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Exit from "effect/Exit"
import * as Ref from "effect/Ref"
import owner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import { initialCanonical, projectCanonical } from "@hapsland/canonical-policy/canonical/adapter"
import { residentTransaction } from "../../../state/resident/transaction.ts"
import { residentCapacity } from "../../../state/resident/capacity.ts"
import { retireRound } from "../../../state/capacity/rounds.ts"
import { completePreparation } from "../../../state/capacity/preparation.ts"
import { residentAdvice } from "../../../state/resident/advice.ts"
import { residentRevision } from "../../../state/resident/revision.ts"
import { initialRevision } from "../../../state/revision.ts"
import { initialAdviceRecords } from "../../../state/advice-records.ts"
import { initialJoinedReviews } from "../../../state/joined-reviews.ts"
import { initialDelivery } from "../../../state/delivery/operations.ts"
import { createOwnedArtifactDriver } from "../../composition/owned-artifact-driver.mjs"
import { createAdviceTailMachine } from "../post-preparation-dispatcher.mjs"
import { createAdviceTailProvider } from "../../evaluation/advice-tail-provider.mjs"
import { createGraphServiceRegistry as createServiceRegistry } from "@hapsland/source-analysis/direct-event/graph-resolution"
import { createResidentOwnerTransaction } from "../../../state/resolver-custody/resident-owner-transaction.mjs"
const postCore = (
  await import(
    new URL("../../../../../dist/resident/review-work/preparation/post-preparation-core.js", import.meta.url)
  )
).default
{
  const tailMachine = createAdviceTailMachine(postCore)
  const run = Effect.runSync,
    limits = { globalItems: 100, globalBytes: 10000, partitionItems: 16, partitionBytes: 10000 }
  let cases = 0,
    callerChecks = 0,
    custodyReads = 0
  for (const variant of [
    "completed",
    "interrupted",
    "replaced",
    "reset-recreated",
    "rollback",
    "single-action-consumer"
  ]) {
    const records = { runtime: { peakLedgerBytes: 0 }, marker: 0 }
    const initial = {
      residentLifetime: "fixture",
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
      records
    }
    const ref = run(Ref.make(initial)),
      transaction = residentTransaction(ref, "fixture"),
      capacity = residentCapacity(transaction)
    const published = []
    const bridge = createResidentOwnerTransaction({
      owner,
      transaction,
      onActions: (actions) =>
        Effect.sync(() => {
          const snapshot = run(transaction.read)
          // Every effect sees already-published metadata, never an uncommitted draft.
          assert.ok(Object.isFrozen(snapshot.resolverCustody))
          published.push(...actions)
        })
    })
    const partition = run(capacity.partitionId("agent")),
      round = run(capacity.roundId("agent"))
    const observation = run(capacity.admitObservation("agent", round))
    assert.equal(run(capacity.observation("agent", observation, "startObservation", round)), true)
    const preparation = run(capacity.beginObservedPreparation("agent", observation, 100, round))
    assert.equal(preparation.status, "admitted")
    const scope = {
      $: "Scope",
      partition: Number(BigInt(partition)),
      lifetime: 1,
      round: Number(BigInt(round)),
      preparation: Number(BigInt(preparation.operation))
    }
    const event = (name, fields = {}) => run(bridge.event({ $: name, ...fields }))
    const beforeLaunch = run(transaction.read).canonical
    for (const input_handle of [50, 51]) assert.equal(event("LaunchEvent", { scope, input_handle }).refusal, undefined)
    assert.strictEqual(run(transaction.read).canonical, beforeLaunch)
    assert.deepEqual(
      published.map((x) => x.invocation),
      [1, 2]
    )
    assert.equal("canonical" in run(transaction.read).resolverCustody, false)
    event("InstallEvent", { invocation: 1, generation: 0, handle: 11, request: 0 })
    event("ProviderStartEvent", { invocation: 1 })
    assert.strictEqual(run(transaction.read).canonical, beforeLaunch)
    const credential = { invocation: 1, generation: 0, lease: 1, request: 0 }
    for (const key of ["invocation", "generation", "lease", "request"]) {
      const before = run(transaction.read)
      assert.throws(
        () =>
          run(
            bridge.nativeScoped({ ...credential, [key]: credential[key] + 1 }, (draft, nativeRecords) => [
              undefined,
              { ...nativeRecords, marker: 999 }
            ])
          ),
        /Revoked resident provider permit/
      )
      assert.strictEqual(run(transaction.read), before)
    }
    assert.equal(
      run(bridge.nativeScoped(credential, (draft, nativeRecords) => ["permitted", nativeRecords])).value,
      "permitted"
    )
    // Opaque owner identity changes between the helper lookup and its commit.
    const originalPending = { revision: undefined },
      replacementPending = { revision: undefined }
    run(
      bridge.native((draft, nativeRecords) => [
        undefined,
        { ...nativeRecords, reuse: { pending: new Map([["opaque-pending", originalPending]]) } }
      ])
    )
    const lookedUp = run(transaction.read).records.reuse.pending.get("opaque-pending")
    run(
      bridge.native((draft, nativeRecords) => [
        undefined,
        { ...nativeRecords, reuse: { pending: new Map([["opaque-pending", replacementPending]]) } }
      ])
    )
    const beforeRestore = run(transaction.read)
    let attemptedRestore = false
    assert.throws(
      () =>
        run(
          bridge.nativeRestorePending(
            credential,
            { key: "opaque-pending", owner: lookedUp },
            (draft, nativeRecords) => {
              attemptedRestore = true
              return [undefined, nativeRecords]
            }
          )
        ),
      /Pending revision owner changed/
    )
    assert.equal(attemptedRestore, false)
    assert.strictEqual(run(transaction.read), beforeRestore)
    if (variant === "single-action-consumer") {
      const currentOwner = bridge.control.readState()
      const freshness = currentOwner.next_invocation
      const launchedFreshness = bridge.control.invoke("launch_freshness", [901])
      assert.equal(launchedFreshness.$, "Advanced")
      assert.deepEqual(owner.find(freshness, bridge.control.readState().children).value.scope, {
        $: "FreshnessScope",
        operation: freshness
      })
      assert.deepEqual(bridge.control.readState().canonical, currentOwner.canonical)
      assert.equal(bridge.control.invoke("cancel", [freshness]).$, "Advanced")
      assert.equal(owner.child_active(owner.find(freshness, bridge.control.readState().children).value), false)
      cases++
      const before = published.length
      const step = bridge.control.invoke("cancel", [1])
      assert.equal(step.$, "Advanced")
      assert.equal(step.actions.head.$, "CancelChild")
      assert.equal(published.length, before, "driver control does not also deliver actions to external sink")
      cases++
      continue
    }
    if (variant === "rollback") {
      const before = run(transaction.read)
      assert.throws(
        () =>
          run(
            bridge.native((draft, _nativeRecords) => {
              draft.resolverCustody = owner.initial_custody()
              draft.roundIds.clear()
              throw new Error("fixture rollback")
            })
          ),
        /fixture rollback/
      )
      assert.strictEqual(run(transaction.read), before)
      assert.equal(published.length, 3)
      cases++
      continue
    }
    if (variant === "completed") {
      event("ProviderCompletedEvent", { invocation: 1, lease: 1, request: 0, reply_handle: 60 })
      assert.equal(event("TerminalEvent", { invocation: 1, generation: 0, result_handle: 70 }).refusal.$, "WrongPhase")
      event("TerminalEvent", { invocation: 1, generation: 1, result_handle: 70 })
      assert.equal(event("TerminalEvent", { invocation: 1, generation: 1, result_handle: 70 }).refusal.$, "WrongPhase")
      event("TerminalEvent", { invocation: 2, generation: 0, result_handle: 71 })
      const completed = run(
        bridge.native((draft, nativeRecords) => [
          completePreparation(draft, "agent", preparation.operation, preparation.reservation, [10, 20], round),
          { ...nativeRecords, marker: 1 }
        ])
      )
      assert.equal(completed.value.length, 2)
      const snapshot = run(transaction.read),
        projection = projectCanonical(snapshot.canonical)
      assert.equal(snapshot.records.marker, 1)
      assert.equal(projection.global.bytes, 30)
      assert.equal(snapshot.reservations.size, 2)
      assert.equal(snapshot.records.runtime.peakLedgerBytes, 100)
      assert.equal(published.filter((x) => x.$ === "AcceptResult").length, 2)
    } else {
      if (variant === "interrupted")
        run(
          bridge.canonical({
            kind: "interruptPreparation",
            partition,
            lifetime: 1,
            round,
            operation: preparation.operation
          })
        )
      else if (variant === "reset-recreated")
        run(
          bridge.native((draft, nativeRecords) => {
            const original = draft.canonical
            draft.canonical = initialCanonical(limits)
            draft.canonical = original
            return [undefined, nativeRecords]
          })
        )
      else
        run(
          bridge.native((draft, nativeRecords) => {
            retireRound(draft, "agent", round)
            return [undefined, { ...nativeRecords, marker: 1 }]
          })
        )
      const beforeDenied = run(transaction.read)
      assert.throws(
        () =>
          run(
            bridge.nativeScoped(credential, (draft, nativeRecords) => [undefined, { ...nativeRecords, marker: 999 }])
          ),
        /Revoked resident provider permit/
      )
      assert.strictEqual(run(transaction.read), beforeDenied)
      const late = event("ProviderCompletedEvent", { invocation: 1, lease: 1, request: 0, reply_handle: 60 })
      assert.deepEqual(
        late.actions.map((x) => x.$),
        ["CleanupProvider"]
      )
      assert.equal(
        event("ProviderCompletedEvent", { invocation: 1, lease: 1, request: 0, reply_handle: 60 }).refusal.$,
        "WrongLease"
      )
      assert.equal(event("TerminalEvent", { invocation: 1, generation: 1, result_handle: 70 }).refusal.$, "WrongPhase")
      assert.equal(published.filter((x) => x.$ === "Resume" || x.$ === "AcceptResult").length, 0)
      assert.equal(published.filter((x) => x.$ === "CancelChild").length, 2)
      assert.equal(
        projectCanonical(run(transaction.read).canonical).global.bytes,
        variant === "reset-recreated" ? 100 : 0
      )
      if (variant === "replaced") assert.equal(run(transaction.read).reservations.size, 0)
    }
    cases++
  }
  // Interrupt during the post-commit sink. Cleanup delivery is masked through
  // every action; this checks the actual Effect runtime rather than only syntax.
  {
    const limits = { globalItems: 100, globalBytes: 10000, partitionItems: 16, partitionBytes: 10000 }
    const initial = {
      residentLifetime: "delivery",
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
    }
    const ref = run(Ref.make(initial)),
      transaction = residentTransaction(ref, "delivery"),
      capacity = residentCapacity(transaction)
    const partition = run(capacity.partitionId("agent")),
      round = run(capacity.roundId("agent")),
      observation = run(capacity.admitObservation("agent", round))
    run(capacity.observation("agent", observation, "startObservation", round))
    const preparation = run(capacity.beginObservedPreparation("agent", observation, 100, round))
    let interrupt = false
    const controller = new AbortController(),
      delivered = []
    const bridge = createResidentOwnerTransaction({
      owner,
      transaction,
      onActions: (actions) =>
        Effect.gen(function* () {
          if (interrupt) yield* Effect.sync(() => controller.abort())
          if (interrupt) yield* Effect.sleep("1 millis")
          yield* Effect.sync(() => delivered.push(...actions))
        })
    })
    const scope = {
      $: "Scope",
      partition: Number(BigInt(partition)),
      lifetime: 1,
      round: Number(BigInt(round)),
      preparation: Number(BigInt(preparation.operation))
    }
    run(bridge.event({ $: "LaunchEvent", scope, input_handle: 50 }))
    run(bridge.event({ $: "InstallEvent", invocation: 1, generation: 0, handle: 11, request: 0 }))
    run(bridge.event({ $: "ProviderStartEvent", invocation: 1 }))
    interrupt = true
    await Effect.runPromise(
      bridge.canonical({
        kind: "interruptPreparation",
        partition,
        lifetime: 1,
        round,
        operation: preparation.operation
      }),
      { signal: controller.signal }
    ).catch(() => undefined)
    assert.equal(controller.signal.aborted, true)
    assert.deepEqual(
      delivered.slice(-2).map((x) => x.$),
      ["CancelChild", "RetireHandle"]
    )
    assert.equal(projectCanonical(run(transaction.read).canonical).global.bytes, 0)
    cases++
  }
  // Actual advice/capacity/revision owners qualify the closed tail API. Source
  // values are controlled handles here; full preparation IO has its own consumer.
  for (const releaseMode of ["normal", "ack-loss", "replacement"]) {
    const limits = { globalItems: 100, globalBytes: 10000, partitionItems: 16, partitionBytes: 10000 }
    const initial = {
      residentLifetime: "source-completion",
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
    }
    const ref = run(Ref.make(initial)),
      transaction = residentTransaction(ref, "source-completion"),
      capacity = residentCapacity(transaction)
    const partition = run(capacity.partitionId("agent")),
      round = run(capacity.roundId("agent")),
      observation = run(capacity.admitObservation("agent", round))
    assert.equal(run(capacity.observation("agent", observation, "startObservation", round)), true)
    const bridge = createResidentOwnerTransaction({ owner, transaction })
    const original = run(capacity.reserve("agent", 32, "observationDispatch"))
    assert.ok(original)
    bridge.bindSourceReservation(1, original)
    const event = (input) => {
      const result = run(bridge.event(input))
      assert.equal(result.refusal, undefined)
      return result
    }
    event({
      $: "LaunchSourceEvent",
      scope: {
        $: "SourceScope",
        partition: Number(BigInt(partition)),
        lifetime: 1,
        round: Number(BigInt(round)),
        observation: Number(BigInt(observation)),
        permission: { $: "SourceNew" }
      },
      input_handle: 1
    })
    event({
      $: "InstallSourceEvent",
      invocation: 1,
      generation: 0,
      handle: 2,
      request: 0,
      permission: { $: "SourceActivity" }
    })
    event({ $: "ProviderStartEvent", invocation: 1 })
    event({ $: "ProviderCompletedEvent", invocation: 1, lease: 1, request: 0, reply_handle: 3 })
    event({
      $: "InstallSourceEvent",
      invocation: 1,
      generation: 1,
      handle: 4,
      request: 1,
      permission: { $: "SourceObservation" }
    })
    event({ $: "ProviderStartEvent", invocation: 1 })
    const credential = { invocation: 1, generation: 1, lease: 2, request: 1 }
    assert.throws(
      () =>
        run(
          bridge.nativeScoped(credential, () => {
            throw new Error("must never enter callback")
          })
        ),
      /requires its closed operation/
    )
    let committed
    assert.throws(
      () =>
        run(
          bridge.completeSourceObservation(credential, (result) => {
            committed = result
            throw new Error("injected source completion ack loss")
          })
        ),
      /source completion ack loss/
    )
    assert.equal(owner.find(1, run(transaction.read).resolverCustody.children).value.scope.$, "AfterSourceScope")
    assert.equal(
      committed.outputs.filter(
        (output) => output.$ === "Canonical.EventEstablished" && output.event.$ === "Canonical.ObservationCompleted"
      ).length,
      1
    )
    assert.equal(
      committed.actions.some((action) => action.$ === "CancelChild" && action.invocation === 1),
      false
    )
    const completed = run(transaction.read)
    assert.throws(() => run(bridge.completeSourceObservation(credential)), /completion refused/)
    assert.strictEqual(run(transaction.read), completed)
    assert.throws(
      () =>
        run(
          bridge.nativeScoped(credential, () => {
            throw new Error("must never enter callback")
          })
        ),
      /forbids native mutations/
    )
    event({ $: "ProviderCompletedEvent", invocation: 1, lease: 2, request: 1, reply_handle: 5 })
    event({
      $: "InstallAfterSourceEvent",
      invocation: 1,
      generation: 2,
      handle: 6,
      request: 2,
      permission: { $: "AfterBarrier" }
    })
    event({ $: "ProviderStartEvent", invocation: 1 })
    event({ $: "ProviderCompletedEvent", invocation: 1, lease: 3, request: 2, reply_handle: 7 })
    event({
      $: "InstallAfterSourceEvent",
      invocation: 1,
      generation: 3,
      handle: 8,
      request: 3,
      permission: { $: "AfterRecoveryAnalytics" }
    })
    event({ $: "ProviderStartEvent", invocation: 1 })
    event({ $: "ProviderCompletedEvent", invocation: 1, lease: 4, request: 3, reply_handle: 9 })
    event({
      $: "InstallAfterSourceEvent",
      invocation: 1,
      generation: 4,
      handle: 10,
      request: 4,
      permission: { $: "AfterRecoveryRelease" }
    })
    event({ $: "ProviderStartEvent", invocation: 1 })
    const releaseCredential = { invocation: 1, generation: 4, lease: 5, request: 4 }
    assert.throws(() => bridge.forgetSourceReservation(1), /Source authority remains active/)
    assert.throws(() => bridge.bindSourceReservation(1, original), /before invocation launch/)
    assert.throws(
      () => run(bridge.releaseSourceReservation({ ...releaseCredential, request: 3 })),
      /Revoked resident provider permit/
    )
    let replacement
    if (releaseMode === "replacement") {
      replacement = Object.freeze({ ...original })
      run(
        transaction.commitAllEffect((draft, records) => {
          const retained = draft.reservations.get(original.id)
          draft.reservations.set(original.id, { ...retained, capability: replacement })
          return [undefined, records]
        })
      )
    }
    let released
    if (releaseMode === "ack-loss")
      assert.throws(
        () =>
          run(
            bridge.releaseSourceReservation(releaseCredential, (result) => {
              released = result
              throw new Error("source release ack loss")
            })
          ),
        /source release ack loss/
      )
    else released = run(bridge.releaseSourceReservation(releaseCredential))
    assert.equal(released.value, releaseMode !== "replacement")
    if (replacement) assert.strictEqual(run(transaction.read).reservations.get(original.id).capability, replacement)
    else assert.equal(run(transaction.read).reservations.has(original.id), false)
    assert.equal(run(bridge.releaseSourceReservation(releaseCredential)).value, false)
    event({ $: "ProviderCompletedEvent", invocation: 1, lease: 5, request: 4, reply_handle: 11 })
    assert.throws(() => run(bridge.releaseSourceReservation(releaseCredential)), /Revoked resident provider permit/)
    event({ $: "TerminalEvent", invocation: 1, generation: 5, result_handle: 12 })
    bridge.forgetSourceReservation(1)
    assert.throws(() => bridge.bindSourceReservation(1, original), /before invocation launch/)
    if (replacement) run(capacity.release(replacement))
    assert.equal(owner.find(1, run(transaction.read).resolverCustody.children).value.phase.$, "ChildAccepted")
    cases++
  }
  // Exact source interruption is atomic with custody, including a leased child.
  for (const variant of ["failed", "cancel-leased", "absent"]) {
    const initial = {
      residentLifetime: "source-interruption",
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
    }
    const ref = run(Ref.make(initial)),
      transaction = residentTransaction(ref, "source-interruption"),
      capacity = residentCapacity(transaction)
    const partition = run(capacity.partitionId("agent")),
      round = run(capacity.roundId("agent")),
      observation = run(capacity.admitObservation("agent", round))
    run(capacity.observation("agent", observation, "startObservation", round))
    const bridge = createResidentOwnerTransaction({ owner, transaction }),
      event = (input) => run(bridge.event(input))
    const sourceScope = {
      $: "SourceScope",
      partition: Number(BigInt(partition)),
      lifetime: 1,
      round: Number(BigInt(round)),
      observation: Number(BigInt(observation)),
      permission: { $: "SourceNew" }
    }
    event({ $: "LaunchSourceEvent", scope: sourceScope, input_handle: 1 })
    const beforeGeneric = run(transaction.read)
    assert.equal(event({ $: "TerminalEvent", invocation: 1, generation: 0, result_handle: 9 }).refusal.$, "WrongPhase")
    assert.deepEqual(run(transaction.read), beforeGeneric)
    let preparation
    if (variant === "cancel-leased") {
      preparation = run(capacity.beginObservedPreparation("agent", observation, 100, round))
      event({
        $: "InstallSourceEvent",
        invocation: 1,
        generation: 0,
        handle: 2,
        request: 0,
        permission: { $: "SourceCandidate" }
      })
      event({ $: "ProviderStartEvent", invocation: 1 })
      event({
        $: "LaunchSourcePreparationEvent",
        parent: { $: "Parent", invocation: 1, generation: 0, request: 0 },
        scope: {
          $: "PreparationScope",
          partition: Number(BigInt(partition)),
          lifetime: 1,
          round: Number(BigInt(round)),
          preparation: Number(BigInt(preparation.operation))
        },
        input_handle: 3
      })
      event({ $: "InstallEvent", invocation: 2, generation: 0, handle: 4, request: 0 })
      event({ $: "ProviderStartEvent", invocation: 2 })
    }
    if (variant === "absent")
      assert.equal(run(capacity.observation("agent", observation, "completeObservation", round)), true)
    const before = run(transaction.read)
    const result = event(
      variant === "cancel-leased"
        ? { $: "CancelEvent", invocation: 1 }
        : { $: "TerminalSourceFailedEvent", invocation: 1, generation: 0, result_handle: 9 }
    )
    if (variant === "wrong-stage") {
      assert.equal(result.refusal.$, "CanonicalRejected")
      assert.equal(result.refusal.reason.$, "../../../packages/agent-flow-bend/Canonical.WrongStage")
      assert.deepEqual(run(transaction.read), before)
      cases++
      continue
    }
    assert.equal(result.refusal, undefined)
    assert.equal(
      result.outputs.filter(
        (output) => output.$ === "Canonical.EventEstablished" && output.event.$ === "Canonical.ObservationInterrupted"
      ).length,
      variant === "absent" ? 0 : 1
    )
    const snapshot = run(transaction.read),
      child = owner.find(1, snapshot.resolverCustody.children).value
    assert.equal(child.phase.$, variant === "cancel-leased" ? "ChildCancelled" : "ChildAccepted")
    assert.equal(
      result.actions.some((action) => action.$ === "AcceptResult" && action.result_handle === 9),
      variant !== "cancel-leased"
    )
    if (variant === "cancel-leased") {
      assert.equal(child.lease.$, "Some")
      assert.equal(owner.find(2, snapshot.resolverCustody.children).value.phase.$, "ChildCancelled")
      for (const [invocation, lease] of [
        [1, 1],
        [2, 2]
      ]) {
        const late = event({ $: "ProviderCompletedEvent", invocation, lease, request: 0, reply_handle: 8 })
        assert.equal(
          late.actions.some((action) => action.$ === "Resume"),
          false
        )
        assert.equal(late.actions.filter((action) => action.$ === "CleanupProvider").length, 1)
      }
      run(capacity.release(preparation.reservation))
    }
    cases++
  }
  for (const tailVariant of [
    "normal",
    "missing-publish",
    "driver-active-false",
    "driver-cleanup-pending",
    "driver-barrier-failure",
    "driver-expired-failure",
    "driver-fate-ack-failure",
    "driver-observer-pending",
    "driver-construction-failure",
    "driver-construction-cleanup-failure"
  ]) {
    const limits = { globalItems: 100, globalBytes: 100000, partitionItems: 16, partitionBytes: 100000 }
    const initial = {
      residentLifetime: "advice-tail",
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
      records: {
        runtime: { peakLedgerBytes: 0 },
        revision: initialRevision(),
        advice: initialAdviceRecords(),
        joined: initialJoinedReviews(),
        delivery: initialDelivery(),
        adviceCaptures: new Map()
      }
    }
    const ref = run(Ref.make(initial)),
      transaction = residentTransaction(ref, "advice-tail"),
      capacity = residentCapacity(transaction),
      revision = residentRevision(transaction),
      advice = residentAdvice(transaction)
    let adviceDriver,
      deliverTail = false
    const adviceInputs = new Map([
      [4, 2],
      [5, 2]
    ])
    const bridge = createResidentOwnerTransaction({
        owner,
        transaction,
        validateAdviceInput: (origin, handle) =>
          adviceDriver ? adviceDriver.validateAdviceInput(origin, handle) : adviceInputs.get(handle) === origin,
        onActions: (actions) =>
          Effect.sync(() => {
            if (deliverTail) adviceDriver.acceptActions(actions)
          })
      }),
      event = (input) => run(bridge.event(input))
    const partition = run(capacity.partitionId("agent")),
      round = run(capacity.roundId("agent")),
      observation = run(capacity.admitObservation("agent", round))
    run(capacity.observation("agent", observation, "startObservation", round))
    const preparation = run(capacity.beginObservedPreparation("agent", observation, 100, round)),
      scope = {
        $: "Scope",
        partition: Number(BigInt(partition)),
        lifetime: 1,
        round: Number(BigInt(round)),
        preparation: Number(BigInt(preparation.operation))
      }
    event({ $: "LaunchPreparationEvent", scope, input_handle: 1 })
    event({ $: "TerminalPreparationEvent", invocation: 1, generation: 0, result_handle: 2 })
    const allocations = run(
      bridge.native((draft, records) => [
        completePreparation(draft, "agent", preparation.operation, preparation.reservation, [100, 100], round),
        records
      ])
    ).value
    assert.equal(allocations.length, 2)
    const prepared = {
      root: "/controlled",
      advicee: { host: "codex", session: "controlled" },
      identity: "controlled-advice",
      input: { path: "root.py", declaration: { name: "Root" } }
    }
    const findings = [
      {
        path: "root.py",
        declaration: "Root",
        ruleId: "fixture",
        probability: 1,
        message: "controlled",
        semanticIdentity: prepared.identity
      }
    ]
    const revisions = allocations.map(
      () => run(revision.register("controlled", prepared, true, "shared-advice")).revision
    )
    for (const allocation of allocations) {
      assert.equal(run(capacity.startReview("agent", allocation.operation, round)), true)
      assert.equal(
        run(capacity.completeReview("agent", allocation.operation, allocation.reservation, "finding", round)),
        true
      )
    }
    const initialAdvice = (index) => ({
      settings: {},
      id: "same-native-id",
      analyticsPath: undefined,
      analyticsEnabled: false,
      analyticsControlled: false,
      canonicalRound: round,
      admissionId: observation,
      canonicalOperationId: allocations[index].operation,
      observation: { root: "/controlled", advicee: prepared.advicee },
      partition: "agent",
      reservation: allocations[index].reservation,
      prepared,
      revision: revisions[index],
      evaluationKey: "controlled:" + index,
      sequence: index + 1,
      credentialGeneration: null,
      credentialStatePath: null,
      credentialRequired: false,
      credentialEnvironmentOnly: false,
      pendingAt: 0,
      evaluations: [{ prepared, findings }],
      findings
    })
    event({ $: "InstallEvent", invocation: 2, generation: 0, handle: 3, request: 0 })
    event({ $: "ProviderStartEvent", invocation: 2 })
    const birthCredential = { invocation: 2, generation: 0, lease: 1, request: 0 }
    const beforeBirth = run(transaction.read)
    assert.throws(
      () => run(bridge.adviceInsertAndHandoff({ ...birthCredential, lease: 99 }, initialAdvice(0), 4)),
      /Revoked/
    )
    assert.strictEqual(run(transaction.read), beforeBirth)
    // An otherwise valid insertion with a foreign canonical operation must roll back.
    assert.throws(() =>
      run(bridge.adviceInsertAndHandoff(birthCredential, { ...initialAdvice(0), canonicalOperationId: 999 }, 4))
    )
    assert.strictEqual(run(transaction.read), beforeBirth)
    const constructorFailure = new Error("injected tail constructor failure")
    const cleanupFailure = new Error("injected registry cleanup failure")
    let birthReceipt
    const registry = createServiceRegistry()
    if (tailVariant.startsWith("driver-")) {
      adviceDriver = createOwnedArtifactDriver({
        owner,
        control: {
          ...bridge.control,
          readState() {
            throw new Error("Driver metadata must not assemble the Canonical state")
          },
          readCustody() {
            custodyReads++
            return bridge.control.readCustody()
          }
        },
        registry,
        machine: tailMachine,
        selectMachine: () => {
          if (tailVariant.startsWith("driver-construction-")) throw constructorFailure
          return tailMachine
        },
        foreign: ([request], options) => registry.get(Number(request.invocation)).performEffect(request, options)
      })
      const input = adviceDriver.prepareAdviceInput(2, {})
      assert.equal(input, 1)
      assert.equal(adviceDriver.validateAdviceInput(99, input), false)
      deliverTail = true
    }
    const birthInput = tailVariant.startsWith("driver-") ? 1 : 4
    assert.throws(
      () =>
        run(
          bridge.adviceInsertAndHandoff(birthCredential, initialAdvice(0), birthInput, (publication) => {
            birthReceipt = publication.adviceReceipt
            throw new Error("injected advice insertion acknowledgement loss")
          })
        ),
      /acknowledgement loss/
    )
    const capability = birthReceipt.capability
    assert.strictEqual(run(advice.values())[0], capability)
    assert.strictEqual(bridge.adviceReceipts[0], birthReceipt)
    assert.equal(birthReceipt.invocation, 3)
    assert.equal(birthReceipt.scope.lifetime, 1)
    assert.equal(owner.find(3, run(transaction.read).resolverCustody.children).value.phase.$, "ChildInstalling")
    const afterBirth = run(transaction.read)
    assert.throws(() => run(bridge.adviceInsertAndHandoff(birthCredential, initialAdvice(0), 5)))
    assert.strictEqual(run(transaction.read), afterBirth, "duplicate birth does not publish native replacement")
    if (tailVariant.startsWith("driver-")) {
      deliverTail = false
      event({ $: "CancelEvent", invocation: 2 })
      const lifetimeController = new AbortController()
      let cleanupFails =
          tailVariant === "driver-cleanup-pending" || tailVariant === "driver-construction-cleanup-failure",
        observerFails = tailVariant === "driver-observer-pending",
        ackFails = tailVariant === "driver-fate-ack-failure"
      const marker = Context.Reference("advice-tail-caller", { defaultValue: () => "missing" })
      let expectedCaller,
        cleanupCalls = 0
      const inCaller = (effect, direct = true) =>
        Effect.gen(function* () {
          assert.equal(yield* marker, "advice-caller")
          if (direct) assert.strictEqual(yield* Effect.fiber, expectedCaller)
          callerChecks++
          return yield* effect
        })
      const runTail = (effect) =>
        Effect.runPromise(
          Effect.withFiber((fiber) => {
            expectedCaller = fiber
            return effect.pipe(
              Effect.ensuring(
                Effect.sync(() => {
                  expectedCaller = undefined
                })
              )
            )
          }).pipe(Effect.provideService(marker, "advice-caller"))
        )
      const exitTail = (effect) => runTail(Effect.exit(effect))
      const observerFailure = new Error("injected observer failure before offer")
      const fates = []
      const tailOptions = {
        signal: lifetimeController.signal,
        afterCommit: (command) => {
          if (command.$ === "AdviceRemove" && ackFails) {
            ackFails = false
            throw new Error("injected removal acknowledgement failure")
          }
        }
      }
      const observeAdviceFate = (actual, actualFindings, fate, reason) => {
        if (observerFails) throw observerFailure
        assert.strictEqual(actual, capability)
        assert.deepEqual(actualFindings, findings)
        fates.push({ fate, reason })
      }
      const tailBridge = {
        ...bridge,
        adviceTailRemove: (...args) =>
          cleanupFails ? Effect.fail(new Error("injected pending removal failure")) : bridge.adviceTailRemove(...args),
        read: inCaller(bridge.read),
        adviceCleanup: (...args) => {
          if (cleanupFails) cleanupCalls++
          return inCaller(cleanupFails ? Effect.fail(cleanupFailure) : bridge.adviceCleanup(...args))
        }
      }
      const provider = createAdviceTailProvider(
        3,
        tailBridge,
        capability,
        {},
        {
          retirementForExpired: postCore.advice_retirement,
          deps: {
            residentReviewControls: {
              afterAdvicePending: () =>
                inCaller(
                  tailVariant !== "driver-active-false"
                    ? Effect.fail(new Error("injected pending advice barrier failure"))
                    : Effect.void,
                  false
                )
            },
            residentLifetimeController: lifetimeController,
            residentNow: () => 0,
            residentAdviceExpired: () => inCaller(Effect.succeed(tailVariant === "driver-expired-failure")),
            residentInspection: { observeAdviceFate },
            residentJobActive: () => inCaller(Effect.succeed(false))
          }
        }
      )
      if (tailVariant === "driver-construction-cleanup-failure") {
        const rejected = await exitTail(
          adviceDriver.driveAdviceEffect(adviceDriver.adviceHandoff(3), provider, tailOptions)
        )
        assert.ok(Exit.isFailure(rejected))
        assert.ok(
          rejected.cause.reasons.some((reason) => reason._tag === "Die" && reason.defect === constructorFailure)
        )
        assert.equal(
          rejected.cause.reasons.filter((reason) => reason._tag === "Fail" && reason.error === cleanupFailure).length,
          cleanupCalls
        )
        // Effect preserves the cleanup failure in its Cause, even when its thrown
        // FiberFailure is wrapped by the host finalization aggregate.
        assert.ok(Cause.hasFails(provider.addedFailureCause))
        assert.strictEqual(Cause.findErrorOption(provider.addedFailureCause).value, cleanupFailure)
        assert.notEqual(owner.find(3, run(transaction.read).resolverCustody.children).value.phase.$, "ChildAccepted")
        assert.equal(registry.pendingCleanup, 1)
        assert.ok(adviceDriver.resources.sessions > 0)
        assert.strictEqual(run(advice.values())[0], capability)
        const retried = await exitTail(registry.retryCleanupEffect())
        assert.ok(Exit.isFailure(retried))
        assert.ok(retried.cause.reasons.some((reason) => reason._tag === "Fail" && reason.error === cleanupFailure))
        assert.equal(registry.pendingCleanup, 1)
        cleanupFails = false
        await runTail(registry.retryCleanupEffect())
        assert.equal(registry.pendingCleanup, 0)
        assert.equal(owner.find(3, run(transaction.read).resolverCustody.children).value.phase.$, "ChildAccepted")
        assert.deepEqual(adviceDriver.resources, {
          payloads: 0,
          leases: 0,
          sessions: 0,
          artifactStates: 0,
          launches: 0
        })
        assert.equal(run(advice.values()).length, 0)
        assert.deepEqual(fates, [{ fate: "discarded", reason: "retention-failed" }])
        run(capacity.release(allocations[1].reservation))
        run(revision.release(revisions[1]))
        assert.equal(projectCanonical(run(transaction.read).canonical).global.bytes, 0)
        cases++
        continue
      }
      if (tailVariant === "driver-construction-failure") {
        await assert.rejects(
          runTail(adviceDriver.driveAdviceEffect(adviceDriver.adviceHandoff(3), provider, tailOptions)),
          /injected tail constructor failure/
        )
        assert.equal(owner.find(3, run(transaction.read).resolverCustody.children).value.phase.$, "ChildAccepted")
        assert.equal(run(advice.values()).length, 0)
        assert.equal(registry.pendingCleanup, 0)
        assert.deepEqual(adviceDriver.resources, {
          payloads: 0,
          leases: 0,
          sessions: 0,
          artifactStates: 0,
          launches: 0
        })
        assert.deepEqual(fates, [{ fate: "discarded", reason: "retention-failed" }])
        run(capacity.release(allocations[1].reservation))
        run(revision.release(revisions[1]))
        assert.equal(projectCanonical(run(transaction.read).canonical).global.bytes, 0)
        cases++
        continue
      }
      if (tailVariant === "driver-cleanup-pending" || tailVariant === "driver-observer-pending") {
        const rejected = await exitTail(
          adviceDriver.driveAdviceEffect(adviceDriver.adviceHandoff(3), provider, tailOptions)
        )
        assert.ok(Exit.isFailure(rejected))
        const barrier = provider.terminationCause.reasons.find(
          (reason) => reason._tag === "Fail" && reason.error.operation === "pending advice barrier"
        )
        assert.ok(barrier)
        assert.ok(rejected.cause.reasons.some((reason) => reason._tag === "Fail" && reason.error === barrier.error))
        if (tailVariant === "driver-cleanup-pending") {
          assert.equal(cleanupCalls, 2)
          assert.equal(
            rejected.cause.reasons.filter((reason) => reason._tag === "Fail" && reason.error === cleanupFailure).length,
            cleanupCalls
          )
        } else
          assert.ok(rejected.cause.reasons.some((reason) => reason._tag === "Die" && reason.defect === observerFailure))
        assert.equal(registry.size, 0)
        assert.equal(registry.pendingCleanup, 1)
        if (tailVariant === "driver-cleanup-pending") assert.strictEqual(run(advice.values())[0], capability)
        else assert.equal(run(advice.values()).length, 0)
        const retried = await exitTail(registry.retryCleanupEffect())
        assert.ok(Exit.isFailure(retried))
        if (tailVariant === "driver-cleanup-pending") {
          assert.equal(cleanupCalls, 3)
          assert.equal(
            retried.cause.reasons.filter((reason) => reason._tag === "Fail" && reason.error === cleanupFailure).length,
            1
          )
        } else
          assert.ok(retried.cause.reasons.some((reason) => reason._tag === "Die" && reason.defect === observerFailure))
        assert.equal(registry.pendingCleanup, 1)
        cleanupFails = false
        observerFails = false
        await runTail(registry.retryCleanupEffect())
        assert.equal(registry.pendingCleanup, 0)
        assert.equal(run(advice.values()).length, 0)
        assert.equal(run(revision.current(revisions[1], prepared)), true)
        run(capacity.release(allocations[1].reservation))
        run(revision.release(revisions[1]))
        assert.equal(projectCanonical(run(transaction.read).canonical).global.bytes, 0)
        assert.deepEqual(fates, [{ fate: "discarded", reason: "retention-failed" }])
        cases++
        continue
      }
      if (tailVariant !== "driver-active-false") {
        const outcome = await runTail(
          adviceDriver.driveAdviceEffect(adviceDriver.adviceHandoff(3), provider, tailOptions)
        )
        assert.equal(outcome.adviceRetained, false)
        assert.equal(outcome.reason.$, "TechnicalFailure")
        assert.equal(outcome.reason.token, 1)
        assert.equal(run(advice.values()).length, 0)
        assert.equal(registry.pendingCleanup, 0)
        assert.deepEqual(fates, [
          tailVariant === "driver-expired-failure"
            ? { fate: "expired", reason: "retention-expired" }
            : { fate: "discarded", reason: "retention-failed" }
        ])
        assert.equal(run(revision.current(revisions[1], prepared)), true)
        run(capacity.release(allocations[1].reservation))
        run(revision.release(revisions[1]))
        assert.equal(projectCanonical(run(transaction.read).canonical).global.bytes, 0)
        assert.deepEqual(adviceDriver.resources, {
          payloads: 0,
          leases: 0,
          sessions: 0,
          artifactStates: 0,
          launches: 0
        })
        assert.equal(registry.size, 0)
        cases++
        continue
      }
      assert.deepEqual(
        await runTail(
          adviceDriver.driveAdviceEffect(adviceDriver.adviceHandoff(3), provider, { signal: lifetimeController.signal })
        ),
        { adviceRetained: true }
      )
      assert.strictEqual(
        run(advice.values())[0],
        capability,
        "completed advice survives parent cancellation and inactive work"
      )
      assert.equal(owner.find(3, run(transaction.read).resolverCustody.children).value.phase.$, "ChildAccepted")
      assert.deepEqual(adviceDriver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
      assert.equal(registry.size, 0)
      assert.equal(run(bridge.adviceCleanup(capability)), true)
      run(capacity.release(allocations[1].reservation))
      run(revision.release(revisions[1]))
      assert.equal(projectCanonical(run(transaction.read).canonical).global.bytes, 0)
      cases++
      continue
    }
    const install = (generation, request, permission) =>
      event({
        $: "InstallAdviceEvent",
        invocation: 3,
        generation,
        handle: 10 + request,
        request,
        permission: { $: permission }
      })
    const begin = () => event({ $: "ProviderStartEvent", invocation: 3 }),
      complete = (lease, request) =>
        event({ $: "ProviderCompletedEvent", invocation: 3, lease, request, reply_handle: 20 + request })
    install(0, 0, "TailBarrier")
    begin()
    complete(2, 0)
    install(1, 1, "TailActive")
    begin()
    complete(3, 1)
    install(2, 2, "TailPublish")
    begin()
    const credential = { invocation: 3, generation: 2, lease: 4, request: 2 }
    let attempted = false
    const before = run(transaction.read)
    assert.throws(
      () =>
        run(
          bridge.nativeScoped(credential, (draft, records) => {
            attempted = true
            return [undefined, records]
          })
        ),
      /closed capability operation/
    )
    assert.equal(attempted, false)
    assert.strictEqual(run(transaction.read), before)
    assert.throws(() => run(bridge.adviceTailPublish(credential, { ...capability })), /issued tail receipt/)
    assert.strictEqual(run(transaction.read), before)
    if (tailVariant === "missing-publish") assert.equal(run(bridge.adviceCleanup(capability)), true)
    assert.deepEqual(run(bridge.adviceTailPublish(credential, capability)), [])
    complete(4, 2)
    install(3, 3, "TailRemove")
    begin()
    const cleanupCredential = { invocation: 3, generation: 3, lease: 5, request: 3 }
    let committedRemoval
    assert.throws(
      () =>
        run(
          bridge.adviceTailRemove(cleanupCredential, capability, (publication) => {
            committedRemoval = publication.adviceOwnership
            throw new Error("injected exact advice removal acknowledgement loss")
          })
        ),
      /acknowledgement loss/
    )
    assert.equal(committedRemoval.presentBefore, tailVariant === "normal")
    assert.equal(committedRemoval.presentAfter, false)
    assert.equal(run(advice.values()).length, 0)
    assert.equal(run(revision.current(revisions[1], prepared)), true)
    const replacement = run(advice.insert(initialAdvice(1)))
    assert.notStrictEqual(replacement, capability)
    const absent = run(bridge.adviceTailRemove(cleanupCredential, capability))
    assert.deepEqual(absent, { removed: false, absent: true })
    assert.strictEqual(run(advice.values())[0], replacement)
    assert.equal(run(revision.current(revisions[1], prepared)), true)
    assert.equal(run(bridge.adviceCleanup(capability)), false)
    assert.strictEqual(run(advice.values())[0], replacement)
    assert.equal(run(bridge.adviceCleanup(replacement)), true)
    assert.equal(run(revision.count()), 0)
    complete(5, 3)
    event({ $: "TerminalEvent", invocation: 3, generation: 4, result_handle: 40 })
    assert.equal(owner.find(3, run(transaction.read).resolverCustody.children).value.phase.$, "ChildAccepted")
    assert.equal(projectCanonical(run(transaction.read).canonical).global.bytes, 0)
    cases++
  }
  assert.ok(callerChecks > 0)
  assert.ok(custodyReads > 0)
  console.log(
    JSON.stringify({
      passed: true,
      cases,
      callerChecks,
      custodyReads,
      scope:
        "actual resident Ref/capacity/revision/advice owners; atomic insertion and independent Canonical advice-tail driver; revoked and duplicate birth rollback, insertion/removal ack loss, parent cancellation, expiry fate, absent publication and replacement identity, persistent resource/observer cleanup obligations; controlled source handles, full cached settlement and production adoption remain open"
    })
  )
}
