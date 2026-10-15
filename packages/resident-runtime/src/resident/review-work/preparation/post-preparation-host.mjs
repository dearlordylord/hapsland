import {
  effectNative,
  runNativeEffect,
  nativeFailureAggregate
} from "@hapsland/runtime-environment/runtime/native-execution"
import postCore from "./post-preparation-core.js"
import { withinWork } from "../../work-ownership/cancellation.ts"
import { ResidentAdapterError } from "../../adapter-error.ts"
import { createAdviceTailProvider } from "../evaluation/advice-tail-provider.mjs"
import { enrollCachedAdvice } from "./post-enrollment.ts"
import { observeRetainedAdvice } from "./post-observation.ts"
import * as Effect from "effect/Effect"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import { recordActivity } from "@hapsland/activity-observation/activity/status"
import {
  ResidentProviderPermit,
  ResidentResourceReceipt
} from "../../state/resolver-custody/resident-provider-permit.mjs"
import { logicalBytes } from "../../state/encoded-size.ts"
import { list, unlist as array } from "@hapsland/source-artifacts/direct-event/value/codec"
import { sourcePartition } from "../../recipient/identity.ts"
import { evaluationSourcePartition } from "../../work-ownership/identity.ts"
import { selectPostValue } from "./post-selection.mjs"
import { postOutcomeFits, postOutcomeReservationBytes } from "./post-sizing.ts"
// Canonical-owned effect dispatcher. Reuse progression belongs to Bend;
// Host handlers expose semantic owner effects and resource receipts.
/**
 * @typedef {{outcome: import("./context.ts").ReadyPreparedOutcome, evaluationKey: string, route: import("./post-preparation-core.js").Route, cached?: import("../../state/evaluation-reuse.ts").CachedEvaluation}} NativePlan
 * @typedef {Pick<ReturnType<typeof import("../composition/owned-artifact-driver.mjs").createOwnedArtifactDriver<ReturnType<typeof createAdviceTailProvider>>>, "driveAdviceEffect" | "adviceHandoff" | "prepareAdviceInput" | "releaseAdviceInput">} AdviceDriver
 * @typedef {Pick<ReturnType<typeof import("../composition/owned-artifact-driver.mjs").createOwnedArtifactDriver>, "state" | "handoffResult">} PreparationHandoffDriver
 * @typedef {import("./context.ts").PreparationContext & { deps: import("./context.ts").Dependencies & Pick<import("../evaluation/context.ts").Dependencies, "residentNow" | "residentReviewControls"> & Pick<import("../../advice-delivery/handoff/context.ts").Dependencies, "residentAdviceExpired">, ownedAdvice?: {core: typeof import("./post-preparation-core.js").default, bridge: ReturnType<typeof import("../../state/resolver-custody/resident-owner-transaction.mjs").createResidentOwnerTransaction>, driver: AdviceDriver} }} PostContext
 * @typedef {{owner: import("@hapsland/agent-flow-bend/canonical-resolver-owner").CanonicalResolverOwner, driver: PreparationHandoffDriver, sourceInvocation: number, operation: number, capability: import("../../state/capacity/model.ts").CapacityReservation, handoff: {handoff: number, scope: Extract<import("@hapsland/agent-flow-bend/canonical-resolver-owner").Scope, {$: "RetainingScope"}>}, parent: {invocation: number, generation: number, request: number}}} SourceWorkspace
 */
/** @template A @param {A} value @returns {{$: "Some", value: A}} */
const some = (value) => ({ $: "Some", value })
/** @type {{$: "None"}} */
const none = { $: "None" }
/**
 * @param {number} invocation
 * @param {PostContext} context
 * @param {import("@hapsland/review-execution/direct-event/pipeline").PreparedObservation} prepared
 * @param {Extract<import("../../state/capacity/model.ts").PreparationAdmission, {status: "admitted"}>} preparation
 * @param {import("@hapsland/native-observation/direct-event/observation").DirectObservation} pathObservation
 * @param {boolean} analyticsEnabled
 * @param {SourceWorkspace} [sourceWorkspace]
 */
export function createPostPreparationProvider(
  invocation,
  context,
  prepared,
  preparation,
  pathObservation,
  analyticsEnabled,
  sourceWorkspace
) {
  const ledger = context.deps.residentLedger
  /** @type {Map<number, NativePlan>} */
  const plans = new Map()
  /** @type {Map<number, import("../../state/capacity/model.ts").CapacityReservation>} */
  const reservations = new Map()
  /** @type {Map<number, import("../../state/revision.ts").WorkRevision>} */
  const revisions = new Map()
  /** @type {Map<number, import("../../work-ownership/jobs.ts").UnitJob>} */
  const units = new Map()
  /** @type {Map<number, unknown>} */
  const errors = new Map()
  /** @type {Map<number, Cause.Cause<unknown>>} */
  const errorCauses = new Map()
  /** @type {Map<number, import("../../state/resolver-custody/provider-authority.ts").PendingRestore>} */
  const pendingOwners = new Map()
  /** @type {Map<number, import("../../state/advice-records.ts").Advice>} */
  const adviceOwners = new Map()
  /** @type {Map<number, readonly import("../../state/joined-reviews.ts").JoinedReviewOutcome[]>} */
  const publications = new Map()
  /** @type {Map<number, {receipt: import("../../state/resolver-custody/provider-authority.ts").AdviceReceipt, provider: ReturnType<typeof createAdviceTailProvider>, unit: import("../../work-ownership/jobs.ts").UnitJob, evaluation: import("@hapsland/review-execution/direct-event/pipeline").EvaluatedUnit, started: boolean, preserved?: boolean}>} */
  const tails = new Map()
  let revoked = false,
    closed = false,
    finished = false
  /** @type {unknown} */
  let primaryFailure
  /** @type {Cause.Cause<unknown> | undefined} */
  let primaryCause
  /** @type {Cause.Cause<unknown> | undefined} */
  let finalizationCause
  if (sourceWorkspace) {
    const { owner, driver, sourceInvocation, operation, capability, handoff, parent } = sourceWorkspace
    driver.handoffResult(handoff)
    const child = owner.find(invocation, driver.state.children),
      origin = owner.find(handoff.scope.origin, driver.state.children),
      source = owner.find(sourceInvocation, driver.state.children)
    if (
      handoff.handoff !== invocation ||
      child.$ !== "Some" ||
      child.value.scope.$ !== "RetainingScope" ||
      child.value.scope.origin !== handoff.scope.origin ||
      origin.$ !== "Some" ||
      origin.value.scope.$ !== "PreparationScope" ||
      origin.value.scope.preparation !== operation ||
      source.$ !== "Some" ||
      source.value.scope.$ !== "SourceScope" ||
      child.value.parent.$ !== "Some" ||
      child.value.parent.value.invocation !== sourceInvocation ||
      child.value.parent.value.generation !== parent.generation ||
      child.value.parent.value.request !== parent.request ||
      source.value.generation !== parent.generation ||
      source.value.request.$ !== "Some" ||
      source.value.request.value !== parent.request ||
      capability !== preparation.reservation ||
      !context.activeWorkspaces.has(capability)
    )
      throw new Error("Source workspace lifetime lacks its Canonical handoff")
  }
  /** @type {Set<import("../../work-ownership/jobs.ts").Job>} */
  const transferred = new Set()
  /** @type {Set<number>} */
  const dischargedReservations = new Set()
  /** @type {Set<string>} */
  const ownedClaims = new Set()
  /** @type {Map<number, import("../../state/revision.ts").WorkRevision>} */
  const acquiredRevisions = new Map()
  /** @type {Map<number, number>} */
  const revisionReservations = new Map()
  /** @param {number} handle */
  const transferredReservation = (handle) => [...transferred].some((value) => (Number(BigInt(value.reservation.id))) === handle)
  /** @param {number} handle */
  const transferredAcquisition = (handle) => {
    const reservation = revisionReservations.get(handle)
    return reservation !== undefined && transferredReservation(reservation)
  }
  /** @param {string} key */
  const transferredClaim = (key) =>
    [...transferred].some((value) => value.kind === "unit" && value.evaluationKey === key)
  /** @type {Set<number>} */
  const dischargedWork = new Set()
  /** @param {number} handle */
  const claimKey = (handle) => {
    const plan = plans.get(handle)
    if (!plan) throw new Error("Unknown native cleanup claim")
    return plan.evaluationKey
  }
  /** @param {import("./post-preparation-core.js").CleanupAction} action
   * @returns {import("./post-preparation-core.js").CleanupFact} */
  const cleanupFact = (action) => {
    switch (action.$) {
      case "ReleaseCleanupReservation":
        return {
          $: "CleanupReservation",
          handle: action.handle,
          present: reservations.has(action.handle),
          transferred: transferredReservation(action.handle),
          discharged: dischargedReservations.has(action.handle)
        }
      case "ReleaseCleanupRevision":
        return {
          $: "CleanupRevision",
          handle: action.handle,
          present: acquiredRevisions.has(action.handle),
          transferred: transferredAcquisition(action.handle)
        }
      case "ReleaseCleanupClaim": {
        const plan = plans.get(action.handle)
        if (!plan) return { $: "CleanupInvalidPlan" }
        const key = plan.evaluationKey
        return {
          $: "CleanupClaim",
          handle: action.handle,
          present: ownedClaims.has(key),
          transferred: transferredClaim(key)
        }
      }
      case "InvalidCleanupAllocation":
        return { $: "CleanupInvalidAllocation" }
      default:
        throw new Error("Invalid main cleanup fact request")
    }
  }
  const outcomes = new Map(prepared.outcomes.map((outcome, index) => [(Number(BigInt(index + 1))), outcome]))
  /** @type {import("./post-preparation-core.js").Outcome[]} */
  const facts = [...outcomes].map(([handle, outcome]) => ({
    $: "Outcome",
    handle,
    ready: outcome.status === "ready",
    fits: postOutcomeFits(outcome),
    reservation_bytes: postOutcomeReservationBytes(outcome, pathObservation, context.job.dispatch)
  }))
  /** @param {import("./post-preparation-core.js").Planned} fact */
  const item = (fact) => {
    const value = plans.get(fact.key)
    if (!value) throw new Error("Unknown native plan")
    return value
  }
  /** @param {import("./post-preparation-core.js").Planned} fact */
  const completeItem = (fact) => {
    const value = item(fact)
    if (postCore.route_cached(value.route) && value.cached === undefined)
      throw new Error("Cached plan lacks its native receipt")
    return value
  }
  /** @param {import("./post-preparation-core.js").Planned} fact @param {string} message */
  const cachedItem = (fact, message) => {
    const value = completeItem(fact)
    if (!postCore.route_cached(value.route)) throw new Error(message)
    if (value.cached === undefined) throw new Error("Cached plan lacks its native receipt")
    return /** @type {NativePlan & {cached: import("../../state/evaluation-reuse.ts").CachedEvaluation}} */ (value)
  }
  const adviceBinding = () => {
    const binding = context.ownedAdvice
    if (!binding) throw new Error("Advice resource lacks its Canonical composition")
    return binding
  }
  /** @param {import("./post-preparation-core.js").Slot} slot */
  const reservation = (slot) => {
    const value = reservations.get(slot.reservation)
    if (!value) throw new Error("Unknown native reservation")
    return value
  }
  /** @param {number} token */
  const revision = (token) => {
    const value = revisions.get(token)
    if (!value) throw new Error("Unknown native revision")
    return value
  }
  /**
   * @param {import("./post-preparation-core.js").Slot} slot
   * @param {number} revisionToken
   * @param {{$: "None"} | {$: "Some", value: number}} work
   * @returns {import("../../work-ownership/jobs.ts").UnitJob}
   */
  const unit = (slot, revisionToken, work) => {
    const existing = units.get(slot.reservation)
    if (existing) return existing
    const planned = item(slot.item),
      job = context.job,
      selected = selectPostValue(
        postCore,
        prepared.observation.outcomes,
        { $: "ObservedSelection" },
        (outcome) => outcome.path === planned.outcome.path,
        { observed: (outcome) => outcome.status === "observed" }
      ),
      observed = selected.found ? selected.value : undefined,
      sourceHash = observed?.status === "observed" ? observed.snapshot.sourceHash : undefined
    const inspectionEvaluationId = context.deps.residentInspection.evaluationId(planned.evaluationKey)
    /** @type {import("../../work-ownership/jobs.ts").UnitJob} */
    const value = {
      kind: "unit",
      ...(inspectionEvaluationId === undefined ? {} : { inspectionEvaluationId }),
      ...(job.inspectionReceipt === undefined ? {} : { inspectionReceipt: job.inspectionReceipt }),
      settings: job.settings,
      canonicalRound: job.canonicalRound,
      ...(job.round === undefined ? {} : { round: job.round, work: job.work }),
      ...(work.$ === "None" ? {} : { workUnitId: Number(work.value) }),
      admissionId: job.canonicalObservationId,
      canonicalOperationId: Number(slot.operation),
      observation: pathObservation,
      partition: job.partition,
      reservation: reservation(slot),
      dispatch: job.dispatch,
      analyticsEnabled,
      prepared: planned.outcome.prepared,
      ...(sourceHash === undefined ? {} : { sourceHash }),
      revision: revision(revisionToken),
      evaluationKey: planned.evaluationKey
    }
    units.set(slot.reservation, value)
    return value
  }
  return {
    input: {
      invocation,
      postPreparation: {
        roundBound: context.job.round !== undefined,
        incomplete: prepared.observation.status === "incomplete",
        outcomes: list(facts)
      }
    },
    /** @param {number} token */
    error: (token) => errors.get(token),
    /** @param {number} token */
    cause: (token) => errorCauses.get(token),
    get terminationCause() {
      return primaryCause
    },
    get handoffFailureCause() {
      return finalizationCause === undefined
        ? undefined
        : primaryCause === undefined
          ? finalizationCause
          : Cause.combine(primaryCause, finalizationCause)
    },
    invocation: Number(invocation),
    revoke() {
      revoked = true
    },
    close() {
      closed = true
    },
    get transferredUnits() {
      return transferred.size
    },
    /** @returns {import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<void>} */
    *finishFlow() {
      /** @template A @param {Effect.Effect<A>} effect @returns {import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<A>} */
      const run = function* (effect) {
        return /** @type {A} */ (yield effectNative(effect, false))
      }

      if (finished) return
      /** @type {unknown[]} */
      const failures = []
      /** @type {Cause.Cause<unknown>[]} */
      const failureCauses = []
      /** @template A, E @param {Effect.Effect<A, E>} effect @param {() => unknown} [receipt] @returns {import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<boolean>} */
      const attempt = function* (effect, receipt) {
        const exit = /** @type {Exit.Exit<A, E>} */ (
          yield effectNative(
            Effect.exit(
              Effect.uninterruptible(effect).pipe(
                Effect.provideService(ResidentProviderPermit, undefined),
                Effect.provideService(ResidentResourceReceipt, receipt)
              )
            ),
            false
          )
        )
        if (Exit.isFailure(exit)) {
          failureCauses.push(exit.cause)
          finalizationCause =
            finalizationCause === undefined ? exit.cause : Cause.combine(finalizationCause, exit.cause)
          try {
            throw Cause.squash(exit.cause)
          } catch (error) {
            failures.push(error)
          }
          return false
        }
        return true
      }
      // Each stage is a fresh ephemeral ABI projection of authoritative custody.
      /** @type {Map<number, string>} */
      let claimHandles = new Map()
      /** @param {import("./post-preparation-core.js").CleanupStage} stage
       * @returns {import("./post-preparation-core.js").CleanupFact[]} */
      const inventory = (stage) => {
        switch (stage.$) {
          case "CleanupTails":
            return [...tails].map(([handle, tail]) => ({ $: "CleanupTail", handle, started: tail.started }))
          case "CleanupWorks":
            return [...units].map(([handle, value]) => ({
              $: "CleanupWork",
              handle,
              cached: selectPostValue(
                postCore,
                [...plans.values()],
                { $: "CachedPlanMembership" },
                (plan) => plan.evaluationKey === value.evaluationKey,
                { route: (plan) => plan.route }
              ).found,
              completed: value.completed === true || dischargedWork.has(handle),
              round_bound: value.round !== undefined,
              work_bound: value.workUnitId !== undefined
            }))
          case "CleanupReservations":
            return [...reservations.keys()].map((handle) => cleanupFact({ $: "ReleaseCleanupReservation", handle }))
          case "CleanupRevisions":
            return [...acquiredRevisions.keys()].map((handle) => cleanupFact({ $: "ReleaseCleanupRevision", handle }))
          case "CleanupClaims":
            claimHandles = new Map([...ownedClaims].map((key, index) => [(Number(BigInt(index + 1))), key]))
            return [...claimHandles].map(([handle, key]) => ({
              $: "CleanupClaim",
              handle,
              present: ownedClaims.has(key),
              transferred: transferredClaim(key)
            }))
          case "CleanupWorkspaceStage":
            return [
              {
                $: "CleanupWorkspace",
                source_owned: sourceWorkspace !== undefined,
                active: context.activeWorkspaces.has(preparation.reservation)
              }
            ]
        }
      }
      const core = postCore
      let finish = core.cleanup_finish_initial()
      while (finish.$ !== "CleanupFinishDone") {
        if (finish.$ === "CleanupFinishRejected") throw new Error("Invalid cleanup finalization cursor")
        if (finish.$ === "CleanupFinishRead") {
          finish = core.cleanup_finish_inventory(finish, list(inventory(finish.stage)))
          continue
        }
        const action = finish.cursor.action
        const failureCount = failures.length
        switch (action.$) {
          case "DrainCleanupTail": {
            const tail = tails.get(action.handle)
            if (!tail) throw new Error("Unknown cleanup tail")
            if (tail.started) break
            tail.started = true
            let rejected
            try {
              yield* run(
                adviceBinding().driver.driveAdviceEffect(
                  adviceBinding().driver.adviceHandoff(tail.receipt.invocation),
                  tail.provider,
                  { signal: context.deps.residentLifetimeController.signal }
                )
              )
            } catch (error) {
              rejected = error
              failures.push(error)
            }
            const cause = tail.provider.handoffFailureCause ?? tail.provider.terminationCause
            if (cause !== undefined) {
              failureCauses.push(cause)
              finalizationCause = finalizationCause === undefined ? cause : Cause.combine(finalizationCause, cause)
              if (rejected === undefined) {
                try {
                  throw Cause.squash(cause)
                } catch (error) {
                  failures.push(error)
                }
              }
            } else if (rejected !== undefined) {
              failureCauses.push(Cause.die(rejected))
              finalizationCause =
                finalizationCause === undefined
                  ? Cause.die(rejected)
                  : Cause.combine(finalizationCause, Cause.die(rejected))
            }
            break
          }
          case "RetireCleanupWork": {
            const value = units.get(action.handle)
            if (!value || value.round === undefined || value.workUnitId === undefined)
              throw new Error("Unknown cleanup work")
            if (value.completed || dischargedWork.has(action.handle)) break
            const workUnitId = value.workUnitId
            if (
              yield* attempt(
                ledger.rounds.policyWork(value.round).pipe(Effect.map((policy) => policy.retire(workUnitId)))
              )
            )
              dischargedWork.add(action.handle)
            break
          }
          case "ReleaseCleanupReservation": {
            const value = reservations.get(action.handle)
            if (!value || transferredReservation(action.handle)) break
            const discharged = () => {
              reservations.delete(action.handle)
              dischargedReservations.add(action.handle)
            }
            if (yield* attempt(ledger.release(value), discharged)) {
              reservations.delete(action.handle)
              dischargedReservations.add(action.handle)
            }
            break
          }
          case "ReleaseCleanupRevision": {
            const value = acquiredRevisions.get(action.handle)
            if (!value || transferredAcquisition(action.handle)) break
            yield* attempt(context.deps.residentReleaseCurrentWork(value), () =>
              acquiredRevisions.delete(action.handle)
            )
            break
          }
          case "ReleaseCleanupClaim": {
            const key = claimHandles.get(action.handle)
            if (key === undefined) throw new Error("Unknown cleanup claim")
            if (!ownedClaims.has(key) || transferredClaim(key)) break
            const discharged = () => {
              ownedClaims.delete(key)
              context.unassignedClaims.delete(key)
            }
            if (yield* attempt(context.deps.residentReleaseReuseClaim(key), discharged)) {
              ownedClaims.delete(key)
              context.unassignedClaims.delete(key)
            }
            break
          }
          case "ReleaseCleanupWorkspace":
            if (yield* attempt(ledger.release(preparation.reservation)))
              context.activeWorkspaces.delete(preparation.reservation)
            break
          default:
            throw new Error("Invalid final cleanup operation")
        }
        finish = core.cleanup_finish_reply(finish, failures.length === failureCount)
      }
      if (failures.length)
        throw nativeFailureAggregate(
          primaryFailure === undefined ? failures : [primaryFailure, ...failures],
          "Post-preparation resource finalization failed",
          { cause: primaryFailure ?? failures[0] },
          Cause.fromReasons([...(primaryCause?.reasons ?? []), ...failureCauses.flatMap((cause) => cause.reasons)])
        )
      finished = true
    },
    /** @param {import("./post-preparation-core.js").Request} request
     * @param {{signal?: AbortSignal | undefined, ownerLease?: import("../../state/resolver-custody/provider-authority.ts").ProviderLease, beforeCommand?: (command: import("./post-preparation-core.js").Command) => void, afterCommit?: (command: import("./post-preparation-core.js").Command, publication: import("../../state/resolver-custody/provider-authority.ts").NativePublication<unknown>) => void, afterPendingRestore?: (receipt: NonNullable<import("../../state/resolver-custody/provider-authority.ts").NativePublication<unknown>["restoredPending"]>) => void}} [options]
     * @returns {Effect.Effect<import("./post-preparation-core.js").Reply>}
     */
    performEffect(request, options = {}) {
      return Effect.uninterruptibleMask((restore) =>
        runNativeEffect(this.performFlow(request, restore, options), () => {})
      )
    },
    /**
     * @param {import("./post-preparation-core.js").Request} request
     * @param {{signal?: AbortSignal | undefined, ownerLease?: import("../../state/resolver-custody/provider-authority.ts").ProviderLease, beforeCommand?: (command: import("./post-preparation-core.js").Command) => void, afterCommit?: (command: import("./post-preparation-core.js").Command, publication: import("../../state/resolver-custody/provider-authority.ts").NativePublication<unknown>) => void, afterPendingRestore?: (receipt: NonNullable<import("../../state/resolver-custody/provider-authority.ts").NativePublication<unknown>["restoredPending"]>) => void}} [options]
     * @param {typeof Effect.interruptible} restore
     * @returns {import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<import("./post-preparation-core.js").Reply>}
     */
    *performFlow(request, restore, options = {}) {
      if (revoked || closed || options.signal?.aborted) throw new Error("Revoked post-preparation session")
      if (request.invocation !== invocation) throw new Error("Wrong postflow provider invocation")
      const command = request.command
      /** @type {import("./post-preparation-core.js").Response} */
      let response = { $: "Ack" }
      const acquisitionHandle = ["RegisterClear", "RegisterRevision"].includes(command.$)
        ? (Number(BigInt(revisions.size + 1)))
        : undefined
      const cleanup = [
        "Cleanup",
        "PerformCleanup",
        "ReleaseUnspawned",
        "ReleaseAttached",
        "FinalizeCachedUnit"
      ].includes(command.$)
      /** @param {import("../../state/resolver-custody/provider-authority.ts").NativePublication<unknown> & {releasedAcquisition?: number | undefined}} publication */
      const committed = (publication) => {
        if (publication.restoredPending) {
          publication.restoredPending.pendingOwnerIdentity.revision = publication.restoredPending.revision
          options.afterPendingRestore?.(publication.restoredPending)
        }
        if (command.$ === "ReleaseClear") acquiredRevisions.delete(command.revision)
        for (const key of publication.claimedKeys) ownedClaims.add(key)
        for (const value of publication.transferredUnits) transferred.add(value)
        if (command.$ === "CompletePreparation" && Array.isArray(publication.value)) {
          for (const allocation of /** @type {unknown[]} */ (publication.value)) {
            if (!allocation) continue
            if (typeof allocation !== "object" || !("reservation" in allocation))
              throw new Error("Invalid allocation receipt")
            const reservation = allocation.reservation
            if (
              typeof reservation !== "object" ||
              reservation === null ||
              !("id" in reservation) ||
              typeof reservation.id !== "number" ||
              !("partition" in reservation) ||
              typeof reservation.partition !== "string"
            )
              throw new Error("Invalid reservation receipt")
            reservations.set(
              (Number(BigInt(reservation.id))),
              /** @type {import("../../state/capacity/model.ts").CapacityReservation} */ (reservation)
            )
          }
        }
        const result = publication.value
        if (
          (command.$ === "RegisterRevision" || command.$ === "RegisterClear") &&
          typeof result === "object" &&
          result !== null &&
          "revision" in result &&
          result.revision
        ) {
          const value = result.revision
          if (
            typeof value !== "object" ||
            !("subject" in value) ||
            typeof value.subject !== "string" ||
            !("token" in value) ||
            typeof value.token !== "string" ||
            !("generation" in value) ||
            typeof value.generation !== "number"
          )
            throw new Error("Invalid revision receipt")
          if (acquisitionHandle === undefined) throw new Error("Missing revision acquisition handle")
          // Retain the exact native object after checking all WorkRevision fields.
          const revision = /** @type {import("../../state/revision.ts").WorkRevision} */ (value)
          revisions.set(acquisitionHandle, revision)
          acquiredRevisions.set(acquisitionHandle, revision)
          if (command.$ === "RegisterRevision") revisionReservations.set(acquisitionHandle, command.slot.reservation)
        }
        options.afterCommit?.(command, publication)
      }
      /** @type {"Failed" | "Defect" | "Cancelled"} */
      let failureKind = "Failed"
      /** @type {Cause.Cause<unknown> | undefined} */
      let failureCause
      /**
       * @template A, E
       * @param {Effect.Effect<A, E>} effect
       * @param {number | undefined} [releasedAcquisition]
       * @param {string | undefined} [releasedClaim]
       * @param {number | undefined} [releasedReservation]
       * @returns {import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<A>}
       */
      const run = function* (effect, releasedAcquisition, releasedClaim, releasedReservation) {
        /** @param {import("../../state/resolver-custody/provider-authority.ts").NativePublication<unknown>} publication */
        const receipt = (publication) => {
          if (releasedReservation !== undefined) {
            reservations.delete(releasedReservation)
            dischargedReservations.add(releasedReservation)
          }
          if (releasedAcquisition !== undefined) acquiredRevisions.delete(releasedAcquisition)
          if (releasedClaim !== undefined) {
            ownedClaims.delete(releasedClaim)
            context.unassignedClaims.delete(releasedClaim)
          }
          committed({ ...publication, releasedAcquisition })
        }
        const exit = /** @type {Exit.Exit<A, E>} */ (
          yield effectNative(
            Effect.exit(
              restore(
                Effect.uninterruptible(effect).pipe(
                  Effect.provideService(ResidentResourceReceipt, receipt),
                  Effect.provideService(
                    ResidentProviderPermit,
                    cleanup || !options.ownerLease ? undefined : { credential: options.ownerLease, committed: receipt }
                  )
                )
              )
            ),
            false
          )
        )
        if (Exit.isFailure(exit)) {
          failureCause = exit.cause
          failureKind = Cause.hasDies(exit.cause)
            ? "Defect"
            : Cause.hasFails(exit.cause)
              ? "Failed"
              : Cause.hasInterrupts(exit.cause)
                ? "Cancelled"
                : "Failed"
          throw Cause.squash(exit.cause)
        }
        return exit.value
      }
      /** @param {number} handle @returns {import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<void>} */
      const releaseAcquisition = function* (handle) {
        if (!acquiredRevisions.has(handle) || transferredAcquisition(handle)) return
        yield* run(context.deps.residentReleaseCurrentWork(revision(handle)), handle)
        acquiredRevisions.delete(handle)
      }
      try {
        options.beforeCommand?.(command)
        failureKind = "Defect"
        switch (command.$) {
          case "CheckActive":
            response = { $: "Active", value: yield* run(context.deps.residentJobActive(context.job)) }
            break
          case "ReleaseWorkspace":
            yield* run(ledger.release(preparation.reservation))
            context.activeWorkspaces.delete(preparation.reservation)
            break
          case "Offer":
            response = {
              $: "Offered",
              accepted:
                (yield* run(ledger.preparedOffer(command.outcome.ready, command.allowed))) === "preparedAdmitted"
            }
            break
          case "ObservePreparation":
            context.deps.residentInspection.observePreparation(context.job, prepared)
            break
          case "ReportDeliverabilityCapacity":
            yield* run(ledger.runtime.rejectCapacity())
            yield* run(context.deps.residentRecordAnalytics(context.job, "capacity-rejected"))
            break
          case "ReportDeliverabilityNotice":
            yield* run(context.deps.residentRecordOperationalFailure(context.job.observation, "capacity"))
            recordActivity({
              statePath: context.job.dispatch.activityPath,
              root: context.job.observation.root,
              advicee: context.job.observation.advicee,
              lifetime: context.deps.lifetime,
              stage: "unavailable"
            })
            break
          case "ReportEmptyAnalytics":
            yield* run(
              context.deps.residentRecordAnalytics(
                context.job,
                command.incomplete ? "incomplete-candidate" : "skipped-candidate"
              )
            )
            break
          case "ReportEmptyActivity":
            recordActivity({
              statePath: context.job.dispatch.activityPath,
              root: context.job.observation.root,
              advicee: context.job.observation.advicee,
              lifetime: context.deps.lifetime,
              stage: command.incomplete ? "incomplete" : "skipped"
            })
            break
          case "ObserveReady":
            yield* run(ledger.runtime.observePreparedUnits(array(command.ready).length))
            break
          case "LookupReuse": {
            const outcome = outcomes.get(command.outcome.handle)
            if (!outcome || outcome.status !== "ready") throw new Error("Reuse requires its ready outcome receipt")
            const generationPartition = evaluationSourcePartition(
              context.job.observation,
              context.job.work?.id ?? "standalone",
              context.job.dispatch.credential?.generation ?? "controlled",
              context.job.settings.configuration.policy.digest
            )
            const evaluationKey = context.deps.residentReuse.key(generationPartition, outcome.prepared)
            const liveAdvice = selectPostValue(
              postCore,
              yield* run(context.deps.residentAdvice()),
              { $: "AdviceMembership" },
              (advice) => advice.evaluationKey === evaluationKey
            ).found
            const route = yield* run(context.deps.residentReuse.route(evaluationKey, liveAdvice))
            const key = command.outcome.handle
            /** @type {Record<typeof route, Exclude<import("./post-preparation-core.js").Route["$"], "CachedFinding">>} */
            const routeFacts = {
              owner: "Owner",
              cached: "CachedEntry",
              joinedAdvice: "JoinedAdvice",
              joinedPending: "JoinedPending",
              joinedClaimed: "JoinedClaimed"
            }
            /** @type {import("./post-preparation-core.js").Route} */
            const routeReceipt = { $: routeFacts[route] }
            for (const action of array(postCore.native_plan_actions(routeReceipt))) {
              switch (action.$) {
                case "StoreNativePlan":
                  plans.set(key, { outcome, evaluationKey, route: routeReceipt })
                  break
                case "TrackNativeClaim":
                  ownedClaims.add(evaluationKey)
                  context.unassignedClaims.add(evaluationKey)
                  break
              }
            }
            response = { $: "Routed", key, route: routeReceipt }
            break
          }
          case "ReadCached": {
            const planned = item(command.item),
              cached = yield* run(context.deps.residentReuse.cached(planned.evaluationKey))
            planned.cached = cached
            response = {
              $: "CachedFacts",
              evaluation: command.item.key,
              findings: (Number(BigInt(cached.evaluation.findings.length)))
            }
            break
          }
          case "ReadPending": {
            const planned = item(command.item),
              owner = yield* run(context.deps.residentReuse.pending(planned.evaluationKey))
            if (owner === undefined) throw new Error("canonical reuse route lacks pending evaluation")
            const handle = (Number(BigInt(pendingOwners.size + 1)))
            pendingOwners.set(handle, { key: planned.evaluationKey, owner })
            response = { $: "PendingOwner", owner: handle }
            break
          }
          case "RestorePending": {
            const planned = item(command.item),
              record = pendingOwners.get(command.owner),
              owner = record?.owner
            if (record?.key !== planned.evaluationKey || !owner) throw new Error("Unknown pending owner handle")
            const effect = context.deps.residentRestoreCurrentWork(
              sourcePartition(context.job.observation.root, context.job.observation.advicee),
              planned.outcome.prepared
            )
            const restored = yield* run(
              Effect.gen(function* () {
                const permit = yield* ResidentProviderPermit
                return yield* effect.pipe(
                  Effect.provideService(
                    ResidentProviderPermit,
                    permit ? { ...permit, pendingRestore: { key: planned.evaluationKey, owner } } : undefined
                  )
                )
              })
            )
            owner.revision = restored
            break
          }
          case "ObservePlans": {
            /** @type {Record<import("./post-preparation-core.js").InspectionRoute["$"], "fresh" | "cached" | "existing-advice" | "joined-pending" | "joined-claimed">} */
            const routes = {
              FreshInspection: "fresh",
              CachedInspection: "cached",
              AdviceInspection: "existing-advice",
              PendingInspection: "joined-pending",
              ClaimedInspection: "joined-claimed"
            }
            for (const fact of array(command.planned)) {
              const planned = completeItem(fact)
              /** @type {PostContext["job"]["inspectionReceipt"]} */
              let receipt
              /** @type {string | undefined} */
              let evaluationId
              let observation = postCore.plan_observation_initial(planned.route)
              while (observation.$ === "PlanObservationAwait") {
                const operation = observation.operation
                /** @type {import("./post-preparation-core.js").PlanObservationResponse} */
                let result = { $: "PlanObservationAck" }
                switch (operation.$) {
                  case "ReadPlanReceipt":
                    receipt = context.job.inspectionReceipt
                    result = { $: "PlanObservationFlag", value: receipt !== undefined }
                    break
                  case "ForgetPlanOrigin":
                    context.deps.residentInspection.forgetOrigin(planned.evaluationKey)
                    break
                  case "CheckPlanInspection":
                    if (receipt === undefined) throw new Error("Missing plan inspection receipt")
                    result = { $: "PlanObservationFlag", value: context.deps.inspection.isEnabled(receipt.scope.root) }
                    break
                  case "RegisterPlanOrigin":
                    context.deps.residentInspection.registerOrigin(planned.evaluationKey)
                    break
                  case "ReadPlanEvaluation":
                    evaluationId = context.deps.residentInspection.evaluationId(planned.evaluationKey)
                    result = { $: "PlanObservationFlag", value: evaluationId !== undefined }
                    break
                  case "OfferMissingPlan":
                  case "OfferLinkedPlan": {
                    if (receipt === undefined) throw new Error("Missing plan inspection receipt")
                    const original =
                      operation.$ === "OfferMissingPlan"
                        ? { status: /** @type {const} */ ("missing"), reason: /** @type {const} */ ("not-captured") }
                        : {
                            status: /** @type {const} */ ("linked"),
                            evaluationId: /** @type {string} */ (evaluationId)
                          }
                    context.deps.inspection.offer(
                      receipt.scope,
                      { ...receipt.correlation, ...(evaluationId === undefined ? {} : { evaluationId }) },
                      {
                        kind: "evaluation-route",
                        route: routes[operation.route.$],
                        semanticIdentity: planned.outcome.prepared.identity,
                        path: planned.outcome.path,
                        declaration: planned.outcome.prepared.input.declaration.name,
                        original
                      }
                    )
                    break
                  }
                }
                observation = postCore.plan_observation_resume(observation, result)
              }
              if (observation.$ !== "PlanObservationDone") throw new Error("Invalid plan observation reply")
            }
            break
          }
          case "OwnerBarrier":
            yield* run(
              withinWork(
                context.deps.residentPreparationControls
                  .afterReuseBoundary("ownerClaimed")
                  .pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "owner claim barrier" }))),
                context.preparationSignal
              )
            )
            break
          case "RecordReuseAnalytics": {
            const planned = completeItem(command.item)
            switch (postCore.reuse_observation(planned.route).$) {
              case "CachedReuseObservation":
                yield* run(
                  context.deps.residentRecordAnalytics(
                    context.job,
                    "cache-hit",
                    cachedItem(command.item, "Reuse analytics requires a cached or joined plan").cached.evaluation
                      .findings
                  )
                )
                break
              case "JoinedReuseObservation":
                yield* run(context.deps.residentRecordAnalytics(context.job, "joined-review"))
                break
              case "InvalidReuseObservation":
                throw new Error("Reuse analytics requires a cached or joined plan")
            }
            break
          }
          case "JoinedBarrier":
            yield* run(
              withinWork(
                context.deps.residentPreparationControls
                  .afterReuseBoundary("claimJoined")
                  .pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "joined claim barrier" }))),
                context.preparationSignal
              )
            )
            break
          case "CompletePreparation": {
            const retained = array(command.retained),
              allocations = yield* run(
                ledger.completePreparation(
                  context.job.partition,
                  preparation.operation,
                  preparation.reservation,
                  retained.map((fact) => Number(fact.outcome.reservation_bytes)),
                  context.job.canonicalRound
                )
              )
            context.activeWorkspaces.delete(preparation.reservation)
            response = {
              $: "Reserved",
              allocations: list(
                allocations.map((allocation) => {
                  if (allocation === undefined) return none
                  const handle = (Number(BigInt(allocation.reservation.id)))
                  reservations.set(handle, allocation.reservation)
                  return some({ $: "Allocation", operation: (Number(BigInt(allocation.operation))), reservation: handle })
                })
              )
            }
            break
          }
          case "RegisterClear": {
            const value = yield* run(
              context.deps.residentRegisterCurrentWork(
                sourcePartition(context.job.observation.root, context.job.observation.advicee),
                item(command.item).outcome.prepared
              )
            )
            const handle = acquisitionHandle
            if (handle === undefined) throw new Error("Missing revision acquisition handle")
            revisions.set(handle, value)
            acquiredRevisions.set(handle, value)
            response = { $: "Revision", token: handle }
            break
          }
          case "ReleaseClear":
            yield* releaseAcquisition(command.revision)
            break
          case "ReadLiveAdvice": {
            const selected = selectPostValue(
              postCore,
              yield* run(context.deps.residentAdvice()),
              { $: "AdviceSelection" },
              (advice) => advice.evaluationKey === item(command.item).evaluationKey
            )
            const existing = selected.found ? selected.value : undefined
            const handle = (Number(BigInt(adviceOwners.size + 1)))
            if (existing !== undefined) adviceOwners.set(handle, existing)
            response = { $: "AdviceOwner", owner: existing === undefined ? none : some(handle) }
            break
          }
          case "PublishJoinedAdvice": {
            const existing = adviceOwners.get(command.advice)
            if (!existing) throw new Error("Unknown advice owner")
            const publication = yield* run(ledger.advice.publish(existing)),
              handle = (Number(BigInt(publications.size + 1)))
            publications.set(handle, publication)
            response = { $: "Published", publication: handle }
            break
          }
          case "RecordJoinedOutcomes": {
            const existing = adviceOwners.get(command.advice),
              publication = publications.get(command.publication)
            if (!existing || !publication) throw new Error("Unknown joined publication")
            yield* run(context.deps.residentRecordJoinedOutcomes(publication, existing.id))
            break
          }
          case "ReadCurrentAdvice": {
            const existing = adviceOwners.get(command.advice)
            if (!existing) throw new Error("Unknown advice owner")
            response = {
              $: "FindingCount",
              findings: (Number(BigInt((yield* run(ledger.advice.current(existing))).findings.length)))
            }
            break
          }
          case "ReadJoinedPending": {
            const planned = item(command.item),
              owner = yield* run(context.deps.residentReuse.pending(planned.evaluationKey)),
              handle = (Number(BigInt(pendingOwners.size + 1)))
            if (owner !== undefined) pendingOwners.set(handle, { key: planned.evaluationKey, owner })
            response = { $: "JoinOwner", owner: owner === undefined ? none : some(handle) }
            break
          }
          case "AppendJoined": {
            const planned = item(command.item),
              record = command.owner.$ === "None" ? undefined : pendingOwners.get(command.owner.value),
              pending = record?.owner
            if (command.owner.$ === "Some" && (!pending || record.key !== planned.evaluationKey))
              throw new Error("Unknown joined pending owner")
            yield* run(
              context.deps.residentJoined.append({
                admission: context.job.canonicalObservationId,
                evaluationKey: planned.evaluationKey,
                observation: pathObservation,
                activityPath: context.job.dispatch.activityPath,
                ...(pending === undefined ? {} : { revision: pending.revision })
              })
            )
            break
          }
          case "RememberExpected":
            context.expectedActivityUnits.push(item(command.item).evaluationKey)
            break
          case "RecordReuseActivity": {
            const planned = item(command.item),
              activity = command.activity
            if (activity.$ === "ClearActivity") context.expectedActivityUnits.push(planned.evaluationKey)
            recordActivity({
              statePath: context.job.dispatch.activityPath,
              root: context.job.observation.root,
              advicee: context.job.observation.advicee,
              lifetime: context.deps.lifetime,
              stage:
                activity.$ === "ClearActivity"
                  ? "clear"
                  : activity.$ === "FindingsActivity"
                    ? "findings"
                    : "unavailable",
              ...(activity.$ === "FindingsActivity" ? { findings: Number(activity.findings) } : {}),
              unitIdentity: planned.evaluationKey
            })
            break
          }
          case "RegisterRevision": {
            const token = yield* run(
              context.deps.residentRegisterCurrentWork(
                sourcePartition(context.job.observation.root, context.job.observation.advicee),
                item(command.slot.item).outcome.prepared
              )
            )
            const handle = acquisitionHandle
            if (handle === undefined) throw new Error("Missing revision acquisition handle")
            revisions.set(handle, token)
            acquiredRevisions.set(handle, token)
            revisionReservations.set(handle, command.slot.reservation)
            response = { $: "Revision", token: handle }
            break
          }
          case "RegisterWork": {
            const policy =
                context.job.round === undefined || context.job.workObservationId === undefined
                  ? undefined
                  : yield* run(ledger.rounds.policyWork(context.job.round)),
              planned = completeItem(command.slot.item),
              operation = Number(command.slot.operation)
            const observation = context.job.workObservationId
            /** @type {number | undefined} */
            let work
            switch (postCore.planned_work(planned.route, policy !== undefined, observation !== undefined).$) {
              case "NoPlannedWork":
                break
              case "SpawnPlannedWork":
                if (policy === undefined || observation === undefined)
                  throw new Error("Missing work registration receipt")
                work = policy.spawn(observation, operation)
                break
              case "CachedPlannedWork": {
                if (policy === undefined || observation === undefined)
                  throw new Error("Missing work registration receipt")
                const cached = cachedItem(command.slot.item, "Cached work requires its cached plan").cached
                work = policy.cachedFinding(
                  observation,
                  cached.evaluation.findings.length,
                  logicalBytes(cached.evaluation.findings),
                  operation
                )
                break
              }
            }
            response = { $: "Work", token: work === undefined ? none : some((Number(BigInt(work)))) }
            break
          }
          case "ObserveUnit":
            context.expectedActivityUnits.push(item(command.slot.item).evaluationKey)
            context.deps.residentInspection.observePreparedUnit(unit(command.slot, command.revision, command.work))
            break
          case "AttachOwner": {
            const value = unit(command.slot, command.revision, command.work),
              accepted = yield* run(context.deps.residentJoined.attachOwner(value.evaluationKey, value, value.revision))
            if (accepted) context.unassignedClaims.delete(value.evaluationKey)
            response = { $: "Attached", accepted }
            break
          }
          case "Enqueue":
            response = {
              $: "Queued",
              accepted: yield* run(
                context.deps.residentDispatcher.enqueue(
                  context.job.partition,
                  unit(command.slot, command.revision, command.work)
                )
              )
            }
            break
          case "ReleaseUnspawned":
          case "ReleaseAttached":
          case "ReleaseCachedUnit":
          case "FinalizeCachedUnit": {
            /** @type {Record<typeof command.$, import("./post-preparation-core.js").ReleaseKind>} */
            const kinds = {
              ReleaseUnspawned: { $: "UnspawnedRelease" },
              ReleaseAttached: { $: "AttachedRelease" },
              ReleaseCachedUnit: { $: "CachedRelease" },
              FinalizeCachedUnit: { $: "FinalizedRelease" }
            }
            /** @type {import("../../work-ownership/jobs.ts").UnitJob | undefined} */
            let releaseUnit
            /** @type {number | undefined} */
            let releaseWorkUnitId
            const requireUnit = () => {
              if (!releaseUnit) throw new Error("Release unit has not been constructed")
              return releaseUnit
            }
            let release = postCore.release_initial(kinds[command.$])
            while (release.$ === "ReleaseAwait") {
              /** @type {import("./post-preparation-core.js").ReleaseResponse} */
              let result = { $: "ReleaseAck" }
              switch (release.operation.$) {
                case "ReleaseReadTransfer":
                  result = { $: "ReleaseFlag", value: transferredReservation(command.slot.reservation) }
                  break
                case "ReleaseReadOwner":
                  result = { $: "ReleaseFlag", value: command.slot.item.route.$ === "Owner" }
                  break
                case "ReleaseBuildUnit":
                  releaseUnit = unit(command.slot, command.revision, "work" in command ? command.work : none)
                  break
                case "ReleaseReadPlanClaim":
                  result = { $: "ReleaseFlag", value: ownedClaims.has(item(command.slot.item).evaluationKey) }
                  break
                case "ReleaseReadUnitClaim":
                  result = { $: "ReleaseFlag", value: ownedClaims.has(requireUnit().evaluationKey) }
                  break
                case "ReleasePlanClaim": {
                  const key = item(command.slot.item).evaluationKey
                  yield* run(context.deps.residentReleaseReuseClaim(key), undefined, key)
                  break
                }
                case "ReleaseCapacityClaim": {
                  const key = requireUnit().evaluationKey
                  yield* run(context.deps.residentReleaseReuseClaim(key, "capacity"), undefined, key)
                  break
                }
                case "ReleaseForgetPlanClaim": {
                  const key = item(command.slot.item).evaluationKey
                  ownedClaims.delete(key)
                  context.unassignedClaims.delete(key)
                  break
                }
                case "ReleaseForgetUnitClaim": {
                  const key = requireUnit().evaluationKey
                  ownedClaims.delete(key)
                  context.unassignedClaims.delete(key)
                  break
                }
                case "ReleaseSlotReservation":
                  yield* run(ledger.release(reservation(command.slot)))
                  break
                case "ReleaseUnitReservation":
                  yield* run(ledger.release(requireUnit().reservation))
                  break
                case "ReleaseForgetReservation":
                  reservations.delete(command.slot.reservation)
                  dischargedReservations.add(command.slot.reservation)
                  break
                case "ReleaseAcquisition":
                  yield* releaseAcquisition(command.revision)
                  break
                case "ReleaseCurrentWork":
                  yield* run(context.deps.residentReleaseCurrentWork(requireUnit().revision))
                  break
                case "ReleaseForgetAcquisition":
                  acquiredRevisions.delete(command.revision)
                  break
                case "ReleaseMarkUnit":
                  requireUnit().released = true
                  break
                case "ReleaseReadWorkBound":
                  releaseWorkUnitId = requireUnit().workUnitId
                  result = { $: "ReleaseFlag", value: releaseWorkUnitId !== undefined }
                  break
                case "ReleaseReadCompleted":
                  result = { $: "ReleaseFlag", value: requireUnit().completed === true }
                  break
                case "ReleaseReadRound":
                  result = { $: "ReleaseFlag", value: requireUnit().round !== undefined }
                  break
                case "ReleaseRetireWork": {
                  const value = requireUnit(),
                    workUnitId = releaseWorkUnitId,
                    round = value.round
                  if (round === undefined || workUnitId === undefined)
                    throw new Error("Missing finalization work receipt")
                  yield* run(ledger.rounds.policyWork(round).pipe(Effect.map((policy) => policy.retire(workUnitId))))
                  break
                }
                case "ReleaseReadReleased":
                  result = { $: "ReleaseFlag", value: requireUnit().released === true }
                  break
                default: {
                  /** @type {never} */
                  const unsupported = release.operation
                  throw new Error("Unsupported release operation " + String(unsupported))
                }
              }
              release = postCore.release_resume(release, result)
            }
            if (release.$ !== "ReleaseDone") throw new Error("Invalid Post release cursor reply")
            break
          }
          case "ReportCapacity":
            yield* run(ledger.runtime.rejectCapacity())
            yield* run(context.deps.residentRecordAnalytics(context.job, "capacity-rejected"))
            yield* run(context.deps.residentRecordOperationalFailure(context.job.observation, "capacity"))
            break
          case "StartCachedReview":
            response = {
              $: "ReviewAccepted",
              value: yield* run(
                ledger.startReview(context.job.partition, Number(command.slot.operation), context.job.canonicalRound)
              )
            }
            break
          case "CompleteCachedReview":
            response = {
              $: "ReviewAccepted",
              value: yield* run(
                ledger.completeReview(
                  context.job.partition,
                  Number(command.slot.operation),
                  reservation(command.slot),
                  "finding",
                  context.job.canonicalRound
                )
              )
            }
            break
          case "RecordCachedActivity": {
            const planned = cachedItem(command.slot.item, "Cached activity requires its cached plan")
            recordActivity({
              statePath: context.job.dispatch.activityPath,
              root: context.job.observation.root,
              advicee: context.job.observation.advicee,
              lifetime: context.deps.lifetime,
              stage: "findings",
              findings: planned.cached.evaluation.findings.length,
              unitIdentity: planned.evaluationKey
            })
            break
          }
          case "CheckCachedActive":
            response = {
              $: "Active",
              value: yield* run(context.deps.residentJobActive(unit(command.slot, command.revision, command.work)))
            }
            break
          case "ReadCachedAdvice": {
            const selected = selectPostValue(
              postCore,
              yield* run(context.deps.residentAdvice()),
              { $: "AdviceSelection" },
              (value) => value.evaluationKey === item(command.slot.item).evaluationKey
            )
            const existing = selected.found ? selected.value : undefined
            const handle = (Number(BigInt(adviceOwners.size + 1)))
            if (existing) adviceOwners.set(handle, existing)
            response = { $: "AdviceOwner", owner: existing === undefined ? none : some(handle) }
            break
          }
          case "RetireCachedWork": {
            const value = unit(command.slot, command.revision, command.work)
            const workUnitId = value.workUnitId
            switch (
              postCore.planned_work(command.slot.item.route, value.round !== undefined, workUnitId !== undefined).$
            ) {
              case "NoPlannedWork":
                break
              case "CachedPlannedWork":
              case "SpawnPlannedWork":
                yield* run(
                  ledger.rounds
                    .policyWork(/** @type {import("../../state/round-records.ts").RoundWork} */ (value.round))
                    .pipe(Effect.map((policy) => policy.retire(/** @type {number} */ (workUnitId))))
                )
                break
            }
            break
          }
          case "InsertCachedAdvice": {
            if (!context.ownedAdvice || !options.ownerLease)
              throw new Error("Cached advice requires Canonical composition")
            const value = unit(command.slot, command.revision, command.work),
              planned = cachedItem(command.slot.item, "Cached advice requires its cached plan")
            const { initial, evaluation } = enrollCachedAdvice(value, planned, context)
            const binding = context.ownedAdvice,
              handle = binding.driver.prepareAdviceInput(invocation, { unit: value, evaluation })
            try {
              yield* run(
                binding.bridge.adviceInsertAndHandoff(options.ownerLease, initial, handle, (publication) => {
                  transferred.add(value)
                  const receipt = publication.adviceReceipt
                  if (!receipt) throw new Error("Advice insert lacks its Canonical handoff receipt")
                  const provider = createAdviceTailProvider(
                    receipt.invocation,
                    binding.bridge,
                    receipt.capability,
                    value,
                    { deps: context.deps, retirementForExpired: binding.core.advice_retirement }
                  )
                  tails.set(receipt.invocation, { receipt, provider, unit: value, evaluation, started: false })
                  committed(publication)
                })
              )
            } finally {
              binding.driver.releaseAdviceInput(handle)
            }
            const tail = [...tails.values()].find((tail) => tail.unit === value)
            if (!tail) throw new Error("Advice insert did not establish resource receipt")
            response = { $: "AdviceInserted", tail: tail.receipt.invocation }
            break
          }
          case "ObserveRetainedAdvice": {
            const tail = tails.get(command.tail)
            if (!tail) throw new Error("Unknown advice transfer")
            observeRetainedAdvice(postCore, tail, () => context.deps.inspection)
            break
          }
          case "PreserveAdviceTail": {
            const tail = tails.get(command.tail)
            if (!tail) throw new Error("Unknown advice preservation receipt")
            if (tail.preserved) break
            if (tail.started) throw new Error("Advice tail already started")
            tail.preserved = true
            tail.started = true
            tail.provider.preserve()
            yield* run(
              adviceBinding().driver.driveAdviceEffect(
                adviceBinding().driver.adviceHandoff(command.tail),
                tail.provider,
                { signal: context.deps.residentLifetimeController.signal }
              )
            )
            break
          }
          case "AwaitAdviceTail": {
            const tail = tails.get(command.tail)
            if (!tail || tail.started) throw new Error("Unknown or consumed advice transfer")
            tail.started = true
            let accepted
            try {
              accepted = yield* run(
                adviceBinding().driver.driveAdviceEffect(
                  adviceBinding().driver.adviceHandoff(command.tail),
                  tail.provider,
                  { signal: context.deps.residentLifetimeController.signal }
                )
              )
            } catch (error) {
              const cause = tail.provider.handoffFailureCause ?? tail.provider.terminationCause
              if (cause !== undefined) yield* run(Effect.failCause(cause))
              throw error
            }
            if (!("adviceRetained" in accepted) || !accepted.adviceRetained) {
              const reason = "reason" in accepted ? accepted.reason : undefined
              const token = reason && "token" in reason ? reason.token : undefined
              const cause =
                tail.provider.terminationCause ?? (token === undefined ? undefined : tail.provider.cause(token))
              if (cause !== undefined) yield* run(Effect.failCause(cause))
              throw (token === undefined ? undefined : tail.provider.error(token)) ?? new Error("Advice tail failed")
            }
            break
          }
          case "Cleanup":
            response = { $: "CleanupInventory", facts: list(array(command.actions).map(cleanupFact)) }
            break
          case "PerformCleanup": {
            const action = command.action
            switch (action.$) {
              case "ReleaseCleanupRevision":
                yield* releaseAcquisition(action.handle)
                break
              case "ReleaseCleanupReservation": {
                if (transferredReservation(action.handle)) break
                const value = reservations.get(action.handle)
                if (value !== undefined) {
                  yield* run(ledger.release(value), undefined, undefined, action.handle)
                  reservations.delete(action.handle)
                  dischargedReservations.add(action.handle)
                } else if (!dischargedReservations.has(action.handle)) throw new Error("Unknown native reservation")
                break
              }
              case "ReleaseCleanupClaim": {
                const key = claimKey(action.handle)
                if (ownedClaims.has(key) && !transferredClaim(key)) {
                  yield* run(context.deps.residentReleaseReuseClaim(key), undefined, key)
                  ownedClaims.delete(key)
                  context.unassignedClaims.delete(key)
                }
                break
              }
              case "InvalidCleanupAllocation":
                throw new Error("Cleanup allocation lacks its bound plan")
              case "InvalidCleanupReservation":
                throw new Error("Unknown native reservation")
              case "InvalidCleanupPlan":
                throw new Error("Unknown native plan")
              default:
                throw new Error("Invalid main cleanup operation")
            }
            break
          }
          default:
            throw new Error("Unknown postflow command " + command.$)
        }
      } catch (error) {
        const cause = failureCause ?? (failureKind === "Defect" ? Cause.die(error) : Cause.fail(error))
        if (primaryFailure === undefined) primaryCause = cause
        else if (cleanup) primaryCause = primaryCause === undefined ? cause : Cause.combine(primaryCause, cause)
        primaryFailure ??= error
        const token = (Number(BigInt(errors.size + 1)))
        errors.set(token, error)
        errorCauses.set(token, cause)
        response = { $: failureKind, token }
      }
      return { $: "Reply", invocation: request.invocation, id: request.id, response }
    }
  }
}
