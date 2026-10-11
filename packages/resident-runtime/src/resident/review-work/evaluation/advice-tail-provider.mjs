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
export function createAdviceTailProvider(invocation, bridge, capability, unit, context) {
  const advice = 1n,
    errors = new Map(),
    errorCauses = new Map(),
    publications = new Map()
  let revoked = false,
    closed = false,
    finished = false,
    accepted = false,
    cleanupDischarged = false,
    primaryFailure,
    primaryCause,
    addedCause,
    finalizationCause,
    lastCause,
    pendingFate
  const run = async (effect) => {
    const exit = await Effect.runPromiseExit(
      Effect.uninterruptible(effect).pipe(
        Effect.provideService(ResidentProviderPermit, undefined),
        Effect.provideService(ResidentResourceReceipt, undefined)
      )
    )
    if (Exit.isFailure(exit)) {
      lastCause = exit.cause
      return Effect.runPromise(Effect.failCause(exit.cause))
    }
    return exit.value
  }
  const kind = (cause) =>
    Cause.hasDies(cause)
      ? "Defect"
      : Cause.hasFails(cause)
        ? "Failed"
        : Cause.hasInterrupts(cause)
          ? "Cancelled"
          : "Failed"
  const expired = async () => {
    const snapshot = await run(bridge.read)
    if (snapshot.records.advice.entries.get(capability.id)?.capability !== capability) return false
    return await run(
      context.deps.residentAdviceExpired(capability, await run(Effect.sync(() => context.deps.residentNow())))
    )
  }
  const publishFate = () => {
    if (!pendingFate) return
    const fields = {
      ExpiredRetirement: ["expired", "retention-expired"],
      RetentionFailureRetirement: ["discarded", "retention-failed"]
    }[pendingFate.retirement.$]
    if (!fields) throw new Error("Unknown Bend advice fate")
    const fate = pendingFate
    context.deps.residentInspection.observeAdviceFate(fate.capability, fate.findings, ...fields)
    pendingFate = undefined
  }
  const committedRemoval = (publication, after) => {
    const receipt = publication.adviceOwnership
    if (receipt?.presentAfter === false) cleanupDischarged = true
    if (receipt?.removed) pendingFate = receipt
    publishFate()
    after?.(publication)
  }
  return {
    input: { invocation, adviceTail: { advice } },
    invocation: Number(invocation),
    error: (token) => errors.get(token),
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
    async finish() {
      if (finished) return
      lastCause = undefined
      try {
        await run(Effect.sync(publishFate))
        if (accepted || cleanupDischarged) {
          finished = true
          return
        }
        const retirement = context.retirementForExpired(await expired())
        await run(bridge.adviceCleanup(capability, (publication) => committedRemoval(publication), retirement))
        cleanupDischarged = true
        finished = true
      } catch (error) {
        const cause = lastCause ?? Cause.die(error)
        finalizationCause = finalizationCause === undefined ? cause : Cause.combine(finalizationCause, cause)
        throw new AggregateError(
          primaryFailure === undefined ? [error] : [primaryFailure, error],
          "Advice tail cleanup remains incomplete",
          { cause: primaryFailure ?? error }
        )
      }
    },
    async perform(request, options = {}) {
      if (request.invocation !== invocation || request.command.advice !== advice)
        throw new Error("Wrong advice tail capability")
      const command = request.command
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
            await run(
              withinWork(
                context.deps.residentReviewControls
                  .afterAdvicePending(capability.id)
                  .pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "pending advice barrier" }))),
                context.deps.residentLifetimeController.signal
              )
            )
            break
          case "AdviceCheckActive": {
            const value = await run(context.deps.residentJobActive(unit))
            response = { $: "Active", value }
            if (!value) accepted = true
            break
          }
          case "AdvicePublish": {
            const published = await run(
              bridge.adviceTailPublish(options.ownerLease, capability, (publication) =>
                options.afterCommit?.(command, publication)
              )
            )
            const handle = BigInt(publications.size + 1)
            publications.set(handle, published)
            response = { $: "Published", publication: handle }
            break
          }
          case "AdviceRecordPublished":
            if (!publications.has(command.publication)) throw new Error("Unknown advice publication")
            await run(context.deps.residentRecordJoinedOutcomes(publications.get(command.publication), capability.id))
            accepted = true
            break
          case "AdviceCheckExpired":
            response = { $: "Expired", value: await expired() }
            break
          case "AdviceRemove": {
            const result = await run(
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
