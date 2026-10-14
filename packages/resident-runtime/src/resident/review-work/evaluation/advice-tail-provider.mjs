import {
  effectNative,
  runNativeEffect,
  nativeFailureAggregate
} from "@hapsland/runtime-environment/runtime/native-execution"
import * as Effect from "effect/Effect"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import {
  ResidentProviderPermit,
  ResidentResourceReceipt
} from "../../state/resolver-custody/resident-provider-permit.mjs"
import { withinWork } from "../../work-ownership/cancellation.ts"
import { ResidentAdapterError } from "../../adapter-error.ts"
// Exact-capability IO binding for the independent Bend advice tail. No host flow
// loop, source completion, policy branch or arbitrary transaction callback.
/**
 * @param {bigint} invocation
 * @param {ReturnType<typeof import("../../state/resolver-custody/resident-owner-transaction.mjs").createResidentOwnerTransaction>} bridge
 * @param {import("../../state/advice-records.ts").Advice} capability
 * @param {import("../../work-ownership/jobs.ts").UnitJob} unit
 * @param {{ deps: Pick<import("./context.ts").Dependencies, "residentAdvice" | "residentNow" | "residentInspection" | "residentReviewControls" | "residentLifetimeController" | "residentJobActive" | "residentRecordJoinedOutcomes"> & Pick<import("../../advice-delivery/handoff/context.ts").Dependencies, "residentAdviceExpired">, retirementForExpired: typeof import("../preparation/post-preparation-core.js").default.advice_retirement }} context
 */
export function createAdviceTailProvider(invocation, bridge, capability, unit, context) {
  const advice = 1n
  /** @type {Map<bigint, unknown>} */
  const errors = new Map()
  /** @type {Map<bigint, Cause.Cause<unknown>>} */
  const errorCauses = new Map()
  /** @type {Map<bigint, readonly import("../../state/joined-reviews.ts").JoinedReviewOutcome[]>} */
  const publications = new Map()
  let revoked = false,
    closed = false,
    finished = false,
    accepted = false,
    cleanupDischarged = false
  /** @type {unknown} */
  let primaryFailure
  /** @type {Cause.Cause<unknown> | undefined} */
  let primaryCause
  /** @type {Cause.Cause<unknown> | undefined} */
  let addedCause
  /** @type {Cause.Cause<unknown> | undefined} */
  let finalizationCause
  /** @type {Cause.Cause<unknown> | undefined} */
  let lastCause
  /** @type {import("../../state/resolver-custody/provider-authority.ts").AdviceOwnership | undefined} */
  let pendingFate
  /** @template A, E @param {Effect.Effect<A, E>} effect @param {typeof Effect.interruptible} restore @returns {import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<A>} */
  const runEffect = function* (effect, restore) {
    const exit = /** @type {Exit.Exit<A, E>} */ (
      yield effectNative(
        Effect.exit(
          restore(
            Effect.uninterruptible(effect).pipe(
              Effect.provideService(ResidentProviderPermit, undefined),
              Effect.provideService(ResidentResourceReceipt, undefined)
            )
          )
        ),
        false
      )
    )
    if (Exit.isFailure(exit)) {
      lastCause = exit.cause
      throw Cause.squash(exit.cause)
    }
    return exit.value
  }
  /** @param {Cause.Cause<unknown>} cause */
  const kind = (cause) =>
    Cause.hasDies(cause)
      ? "Defect"
      : Cause.hasFails(cause)
        ? "Failed"
        : Cause.hasInterrupts(cause)
          ? "Cancelled"
          : "Failed"
  /** @param {typeof Effect.interruptible} restore @returns {import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<boolean>} */
  const expired = function* (restore) {
    /** @template A, E @param {Effect.Effect<A, E>} effect @returns {import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<A>} */
    const run = (effect) => runEffect(effect, restore)
    const snapshot = yield* run(bridge.read)
    if (snapshot.records.advice.entries.get(capability.id)?.capability !== capability) return false
    return yield* run(
      context.deps.residentAdviceExpired(capability, yield* run(Effect.sync(() => context.deps.residentNow())))
    )
  }
  const publishFate = () => {
    if (!pendingFate) return
    if (!pendingFate.retirement) throw new Error("Advice removal lacks its retirement receipt")
    /** @type {Record<import("../preparation/post-preparation-core.js").AdviceRetirement["$"], readonly ["expired" | "discarded", "retention-expired" | "retention-failed"]>} */
    const fates = {
      ExpiredRetirement: ["expired", "retention-expired"],
      RetentionFailureRetirement: ["discarded", "retention-failed"]
    }
    const fields = fates[pendingFate.retirement.$]
    if (!fields) throw new Error("Unknown Bend advice fate")
    const fate = pendingFate
    if (!fate.findings) throw new Error("Advice removal lacks its findings receipt")
    context.deps.residentInspection.observeAdviceFate(fate.capability, fate.findings, ...fields)
    pendingFate = undefined
  }
  /**
   * @param {import("../../state/resolver-custody/provider-authority.ts").NativePublication<unknown>} publication
   * @param {import("../../state/resolver-custody/provider-authority.ts").CommitReceipt} [after]
   */
  const committedRemoval = (publication, after) => {
    const receipt = publication.adviceOwnership
    if (receipt?.presentAfter === false) cleanupDischarged = true
    if (receipt?.removed) pendingFate = receipt
    publishFate()
    after?.(publication)
  }
  /** @type {{ invocation: bigint, adviceTail: { advice: bigint, failure?: import("../preparation/post-preparation-core.js").Termination, preserved?: boolean } }} */
  const input = { invocation, adviceTail: { advice } }
  return {
    input,
    invocation: Number(invocation),
    /** @param {bigint} token */
    error: (token) => errors.get(token),
    /** @param {bigint} token */
    cause: (token) => errorCauses.get(token),
    get terminationCause() {
      return primaryCause
    },
    get addedFailureCause() {
      return finalizationCause === undefined
        ? addedCause
        : addedCause === undefined
          ? finalizationCause
          : Cause.combine(addedCause, finalizationCause)
    },
    get handoffFailureCause() {
      return finalizationCause === undefined
        ? undefined
        : primaryCause === undefined
          ? finalizationCause
          : Cause.combine(primaryCause, finalizationCause)
    },
    /** @param {unknown} error @param {Cause.Cause<unknown>} [cause] */
    forceCleanup(error, cause = Cause.die(error)) {
      primaryFailure ??= error
      primaryCause ??= cause
      const token = BigInt(errors.size + 1)
      errors.set(token, error)
      errorCauses.set(token, primaryCause)
      this.input.adviceTail.failure = {
        $:
          kind(primaryCause) === "Defect"
            ? "DefectFailure"
            : kind(primaryCause) === "Cancelled"
              ? "CancelledReason"
              : "TechnicalFailure",
        token
      }
    },
    preserve() {
      if (closed || accepted || cleanupDischarged) throw new Error("Advice tail cannot be preserved")
      accepted = true
      this.input.adviceTail.preserved = true
    },
    revoke() {
      revoked = true
    },
    close() {
      closed = true
    },
    /** @returns {import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<void>} */
    *finishFlow() {
      /** @template A, E @param {Effect.Effect<A, E>} effect @returns {import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<A>} */
      const run = (effect) => runEffect(effect, (value) => value)
      if (finished) return
      lastCause = undefined
      try {
        yield* run(Effect.sync(publishFate))
        if (accepted || cleanupDischarged) {
          finished = true
          return
        }
        const retirement = context.retirementForExpired(yield* expired((effect) => effect))
        yield* run(bridge.adviceCleanup(capability, (publication) => committedRemoval(publication), retirement))
        cleanupDischarged = true
        finished = true
      } catch (error) {
        const cause = lastCause ?? Cause.die(error)
        finalizationCause = finalizationCause === undefined ? cause : Cause.combine(finalizationCause, cause)
        throw nativeFailureAggregate(
          primaryFailure === undefined ? [error] : [primaryFailure, error],
          "Advice tail cleanup remains incomplete",
          { cause: primaryFailure ?? error },
          primaryCause === undefined ? cause : Cause.combine(primaryCause, cause)
        )
      }
    },
    /** @param {import("../preparation/post-preparation-core.js").Request} request
     * @param {{ signal?: AbortSignal, ownerLease?: import("../../state/resolver-custody/provider-authority.ts").ProviderLease, afterCommit?: (command: import("../preparation/post-preparation-core.js").Command, publication: import("../../state/resolver-custody/provider-authority.ts").NativePublication<unknown>) => void }} [options]
     * @returns {Effect.Effect<import("../preparation/post-preparation-core.js").Reply>}
     */
    performEffect(request, options = {}) {
      return Effect.uninterruptibleMask((restore) =>
        runNativeEffect(this.performFlow(request, restore, options), () => {})
      )
    },
    /**
     * @param {import("../preparation/post-preparation-core.js").Request} request
     * @param {{ signal?: AbortSignal, ownerLease?: import("../../state/resolver-custody/provider-authority.ts").ProviderLease, afterCommit?: (command: import("../preparation/post-preparation-core.js").Command, publication: import("../../state/resolver-custody/provider-authority.ts").NativePublication<unknown>) => void }} [options]
     * @param {typeof Effect.interruptible} restore
     * @returns {import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<import("../preparation/post-preparation-core.js").Reply>}
     */
    *performFlow(request, restore, options = {}) {
      /** @template A, E @param {Effect.Effect<A, E>} effect @returns {import("@hapsland/runtime-environment/runtime/native-execution").NativeFlow<A>} */
      const run = (effect) => runEffect(effect, restore)
      if (request.invocation !== invocation || !("advice" in request.command) || request.command.advice !== advice)
        throw new Error("Wrong advice tail capability")
      const command = request.command
      /** @type {import("../preparation/post-preparation-core.js").Response} */
      let response = { $: "Ack" }
      lastCause = undefined
      try {
        if (
          closed ||
          ((revoked || options.signal?.aborted) && !["AdviceRemove", "AdviceCheckExpired"].includes(command.$))
        )
          throw new Error("Advice tail requires cleanup")
        switch (command.$) {
          case "AdvicePendingBarrier":
            yield* run(
              withinWork(
                context.deps.residentReviewControls
                  .afterAdvicePending(capability.id)
                  .pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "pending advice barrier" }))),
                context.deps.residentLifetimeController.signal
              )
            )
            break
          case "AdviceCheckActive": {
            const value = yield* run(context.deps.residentJobActive(unit))
            response = { $: "Active", value }
            if (!value) accepted = true
            break
          }
          case "AdvicePublish": {
            if (!options.ownerLease) throw new Error("Advice publication lacks its Canonical lease")
            const published = yield* run(
              bridge.adviceTailPublish(options.ownerLease, capability, (publication) =>
                options.afterCommit?.(command, publication)
              )
            )
            const handle = BigInt(publications.size + 1)
            publications.set(handle, published)
            response = { $: "Published", publication: handle }
            break
          }
          case "AdviceRecordPublished": {
            const publication = publications.get(command.publication)
            if (!publication) throw new Error("Unknown advice publication")
            yield* run(context.deps.residentRecordJoinedOutcomes(publication, capability.id))
            accepted = true
            break
          }
          case "AdviceCheckExpired":
            response = { $: "Expired", value: yield* expired(restore) }
            break
          case "AdviceRemove": {
            if (!options.ownerLease) throw new Error("Advice removal lacks its Canonical lease")
            const result = yield* run(
              bridge.adviceTailRemove(
                options.ownerLease,
                capability,
                (publication) => committedRemoval(publication, (value) => options.afterCommit?.(command, value)),
                command.retirement
              )
            )
            if (!result.absent) throw new Error("Exact advice cleanup refused")
            cleanupDischarged = true
            break
          }
          default:
            throw new Error("Unknown advice tail operation")
        }
      } catch (error) {
        primaryFailure ??= error
        const cause = lastCause ?? Cause.die(error)
        primaryCause = primaryCause === undefined ? cause : Cause.combine(primaryCause, cause)
        addedCause = addedCause === undefined ? cause : Cause.combine(addedCause, cause)
        const token = BigInt(errors.size + 1)
        errors.set(token, error)
        errorCauses.set(token, primaryCause)
        response = { $: kind(cause), token }
      }
      return { $: "Reply", invocation: request.invocation, id: request.id, response }
    }
  }
}
