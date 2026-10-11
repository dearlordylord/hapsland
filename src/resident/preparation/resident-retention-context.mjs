import assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import * as Cause from "effect/Cause"
import * as Scope from "effect/Scope"
import * as Latch from "effect/Latch"
import { initialRuntimeRecords } from "../../../packages/resident-runtime/src/resident/state/runtime-records.ts"
import { initialRevision } from "../../../packages/resident-runtime/src/resident/state/revision.ts"
import { initialEvaluationReuse } from "../../../packages/resident-runtime/src/resident/state/evaluation-reuse.ts"
import { initialJoinedReviews } from "../../../packages/resident-runtime/src/resident/state/joined-reviews.ts"
import { initialRoundRecords } from "../../../packages/resident-runtime/src/resident/state/round-records.ts"
import { initialAdviceRecords } from "../../../packages/resident-runtime/src/resident/state/advice-records.ts"
import { initialDelivery } from "../../../packages/resident-runtime/src/resident/state/delivery/operations.ts"
import {
  initialDispatchRegistry,
  makeDispatcher
} from "../../../packages/resident-runtime/src/resident/state/dispatch.ts"
import { residentCapacity } from "../../../packages/resident-runtime/src/resident/state/resident/capacity.ts"
import { residentRevision } from "../../../packages/resident-runtime/src/resident/state/resident/revision.ts"
import { residentReuse } from "../../../packages/resident-runtime/src/resident/state/resident/reuse.ts"
import { residentJoinedReviews } from "../../../packages/resident-runtime/src/resident/state/resident/joined-reviews.ts"
import { residentRounds } from "../../../packages/resident-runtime/src/resident/state/resident/rounds.ts"
import { residentRuntime } from "../../../packages/resident-runtime/src/resident/state/resident/runtime.ts"
import { residentAdvice } from "../../../packages/resident-runtime/src/resident/state/resident/advice.ts"
import { residentDelivery } from "../../../packages/resident-runtime/src/resident/state/resident/delivery.ts"
import { residentDispatch } from "../../../packages/resident-runtime/src/resident/state/resident/dispatch.ts"
import { makeResidentWorkLifecycle } from "../../../packages/resident-runtime/src/resident/work-ownership/lifecycle.ts"
import { residentRetainAdvice } from "../../../packages/resident-runtime/src/resident/review-work/evaluation/retention.ts"
import { defaultPreparationControls } from "../../../packages/resident-runtime/src/resident/execution-controls/preparation-controls.ts"
import { logicalBytes } from "../../../packages/resident-runtime/src/resident/state/encoded-size.ts"
import { advicee } from "@hapsland/build-tooling/test-support/test-fixtures"
import {
  providerTransaction,
  dispatchExecutionBoundary,
  ResidentProviderPermit,
  ResidentResourceReceipt
} from "../../../packages/resident-runtime/src/resident/state/resolver-custody/resident-provider-permit.mjs"

// Shared resident owners outlive every candidate in one source scenario.
// Setup and sinks are fixture composition; source progression belongs to Bend.
export async function createResidentRetentionContext(
  connection,
  root,
  rootIdentity,
  {
    mode = "retention-success",
    useOwned = false,
    cachedStandalone = false,
    cachedFault,
    observation: providedObservation
  } = {}
) {
  const run = Effect.runSync,
    identity = advicee(),
    accepted = []
  run(
    connection.bridge.native((draft, records) => [
      undefined,
      {
        ...records,
        runtime: { ...initialRuntimeRecords(), ...records.runtime },
        revision: initialRevision(),
        reuse: initialEvaluationReuse(),
        joined: initialJoinedReviews(),
        rounds: initialRoundRecords(),
        advice: initialAdviceRecords(),
        delivery: initialDelivery(),
        dispatch: initialDispatchRegistry()
      }
    ])
  )
  const transaction = providerTransaction(connection.transaction, connection.bridge)
  const ledger = {
    ...residentCapacity(transaction),
    runtime: residentRuntime(transaction),
    revision: residentRevision(transaction),
    rounds: residentRounds(transaction),
    dispatch: residentDispatch(transaction)
  }
  const reuse = residentReuse(transaction)(logicalBytes),
    joined = residentJoinedReviews(transaction)(logicalBytes),
    advice = residentAdvice(transaction),
    delivery = residentDelivery(transaction)()
  ledger.advice = advice
  const admission = run(delivery.admitEdit("agent", "retention-edit", 0))
  assert.ok(admission)
  const round = run(
    ledger.rounds.bind(
      "agent",
      admission.generation,
      { root, rootIdentity, advicee: identity, activityPath: undefined },
      "cohort"
    )
  )
  assert.equal(round.canonicalRound, connection.round)
  const work = run(ledger.rounds.snapshot(round)).work
  const scope = run(Scope.make()),
    hold = run(Latch.make(false))
  const dispatcher = await Effect.runPromise(
    makeDispatcher(
      ledger,
      (unit) => ({ operation: unit.canonicalOperationId, round: unit.canonicalRound }),
      (entry) =>
        Effect.gen(function* () {
          assert.equal(yield* ResidentProviderPermit, undefined)
          assert.equal(yield* ResidentResourceReceipt, undefined)
          accepted.push(entry.value)
          yield* hold.await
        }),
      dispatchExecutionBoundary
    ).pipe(Effect.provideService(Scope.Scope, scope))
  )
  assert.ok(providedObservation, "Retention fixture requires an explicit observation")
  const observation = providedObservation
  const receipt = { scope: { root }, correlation: { fixture: "postflow" } }
  const job = {
    kind: "ingress",
    inspectionReceipt: receipt,
    observation,
    partition: "agent",
    canonicalRound: connection.round,
    canonicalObservationId: 1,
    ...(cachedStandalone ? {} : { round, workObservationId: 1 }),
    work,
    settings: { configuration: { policy: { digest: "f".repeat(64) } } },
    dispatch: { activityPath: undefined, credential: null, controlled: null }
  }
  const fateEvents = [],
    barrierDie = new Error("injected cached barrier defect"),
    removalDie = new Error("injected advice removal acknowledgement defect"),
    inspectionDie = new Error("injected retained inspection failure"),
    tailEffects = []
  const inspection = {
    observePreparation() {},
    observePreparedUnit() {},
    observeAdviceFate(capability, findings, fate, reason) {
      fateEvents.push({ id: capability.id, count: findings.length, fate, reason })
    },
    evaluationId(key) {
      return "physical:" + key
    },
    observeDiagnostic() {},
    forgetOrigin() {},
    registerOrigin() {}
  }
  const deps = {
    residentNow: () => 0,
    residentAdviceExpired: () => Effect.succeed(false),
    residentReviewControls: {
      afterAdvicePending: () => {
        tailEffects.push("barrier")
        return cachedFault?.startsWith("barrier-mixed")
          ? Effect.failCause(
              Cause.combine(Cause.fail(new Error("injected cached advice barrier failure")), Cause.die(barrierDie))
            )
          : cachedFault === "barrier"
            ? Effect.fail(new Error("injected cached advice barrier failure"))
            : Effect.void
      }
    },
    lifetime: "physical",
    residentLedger: ledger,
    residentReuse: reuse,
    residentJoined: joined,
    residentAdvice: () => advice.values(),
    residentComposedDelivery: delivery,
    residentDispatcher: dispatcher,
    residentLifetimeController: new AbortController(),
    residentInspection: inspection,
    residentRoundSnapshot: (capability) =>
      ledger.rounds.snapshot(capability).pipe(
        Effect.map((snapshot) => {
          if (!snapshot) throw new Error("Missing native round")
          return snapshot
        })
      ),
    residentRecordAnalytics: () => Effect.void
  }
  const lifecycle = makeResidentWorkLifecycle(deps)
  const retire = () =>
    Effect.gen(function* () {
      assert.equal(yield* ledger.rounds.retire(round), true)
      round.controller.abort()
    })
  const context = {
    deps: {
      ...deps,
      ...lifecycle,
      inspection: {
        isEnabled: () => cachedFault?.startsWith("inspection") && run(advice.values()).length > 0,
        offer: () => {
          throw inspectionDie
        }
      },
      residentRecordOperationalFailure: () => Effect.void,
      residentRecordJoinedOutcomes: () => Effect.void,
      residentRetainAdvice: () => {
        throw new Error("Unexpected cached path")
      },
      residentPreparationControls: {
        ...defaultPreparationControls,
        afterReuseBoundary: (phase) =>
          phase === "ownerClaimed"
            ? mode === "retention-owner-claimed"
              ? retire()
              : mode === "retention-fault-owner-claimed"
                ? Effect.die(new Error("injected after owner claim"))
                : Effect.void
            : Effect.void
      }
    },
    job,
    sequence: 1,
    expectedActivityUnits: [],
    unassignedClaims: new Set(),
    activeWorkspaces: new Set(connection.preparation ? [connection.preparation.reservation] : []),
    preparationSignal: work.controller.signal
  }
  if (cachedFault === "inactive") {
    const active = context.deps.residentJobActive
    context.deps.residentJobActive = (job) => (job.kind === "unit" ? Effect.succeed(false) : active(job))
  }
  if (cachedFault === "barrier-mixed-remove-ack") {
    let failed = false
    const afterRemoval = (effect) =>
      effect.pipe(Effect.tap(() => (failed ? Effect.void : ((failed = true), Effect.die(removalDie)))))
    if (useOwned) {
      const remove = connection.bridge.adviceTailRemove
      connection.bridge.adviceTailRemove = (...args) => afterRemoval(remove(...args))
    } else {
      const remove = context.deps.residentRemoveAdvice
      context.deps.residentRemoveAdvice = (...args) => afterRemoval(remove(...args))
    }
  }
  const removalReceipts = []
  if (cachedFault === "barrier-mixed-remove-before") {
    let failed = false
    const beforeRemoval = () =>
      Effect.sync(() => {
        const snapshot = run(transaction.read),
          values = run(advice.values())
        assert.equal(values.length, 1)
        const capability = values[0]
        assert.strictEqual(snapshot.records.advice.entries.get(capability.id).capability, capability)
        assert.equal(snapshot.records.revision.current.size, 1)
        assert.equal(run(ledger.revision.current(capability.revision, capability.prepared)), true)
        assert.ok(snapshot.reservations.has(capability.reservation.id))
        removalReceipts.push(capability)
      }).pipe(Effect.andThen(Effect.die(removalDie)))
    if (useOwned) {
      const remove = connection.bridge.adviceTailRemove
      connection.bridge.adviceTailRemove = (...args) => (!failed ? ((failed = true), beforeRemoval()) : remove(...args))
    } else {
      const remove = context.deps.residentRemoveAdvice
      context.deps.residentRemoveAdvice = (...args) => (!failed ? ((failed = true), beforeRemoval()) : remove(...args))
    }
  }
  context.deps.residentRetainAdvice = (unit, evaluation, sequence) =>
    residentRetainAdvice(context.deps, unit, evaluation, sequence)
  if (useOwned)
    context.ownedAdvice = { bridge: connection.bridge, driver: connection.owned.driver, core: connection.postCore }
  return {
    retire,
    run,
    identity,
    accepted,
    transaction,
    ledger,
    reuse,
    joined,
    advice,
    delivery,
    round,
    work,
    scope,
    hold,
    dispatcher,
    observation,
    receipt,
    job,
    fateEvents,
    barrierDie,
    removalDie,
    inspectionDie,
    tailEffects,
    removalReceipts,
    deps,
    lifecycle,
    context
  }
}
