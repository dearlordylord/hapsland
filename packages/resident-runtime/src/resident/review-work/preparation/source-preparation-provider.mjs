import { decodeControlledOptions } from "../../authorization/controlled.ts"
import { verifyObservationRoot } from "@hapsland/native-observation/direct-event/adapter"
import { effectiveSessionAnalytics } from "@hapsland/runtime-inputs/configuration/resolve"
import * as Effect from "effect/Effect"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import { recordActivity } from "@hapsland/activity-observation/activity/status"
import { captureWorkspaceBytes } from "../../work-ownership/workspace.ts"
import { withinWork } from "../../work-ownership/cancellation.ts"
import { ResidentAdapterError } from "../../adapter-error.ts"
import {
  ResidentProviderPermit,
  ResidentResourceReceipt
} from "../../state/resolver-custody/resident-provider-permit.mjs"
import { createPostPreparationProvider } from "./post-preparation-host.mjs"
import { list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"

/**
 * @typedef {Extract<import("../../state/capacity/model.ts").PreparationAdmission, {status: "admitted"}>} AdmittedPreparation
 * @typedef {{handle: bigint, candidate: bigint, invocation: bigint, admissionRequest: bigint, preparation: AdmittedPreparation}} PreparationReceipt
 * @typedef {ReturnType<typeof import("@hapsland/review-execution/direct-event/preparation").createPreparationCapability>} PreparationCapability
 * @typedef {{invocation: number, machine: PreparationCapability["machine"], input: Parameters<PreparationCapability["machine"]["initial"]>[0], perform: (request: Parameters<PreparationCapability["perform"]>[0][number], options: Parameters<PreparationCapability["perform"]>[1]) => ReturnType<PreparationCapability["perform"]>, decode: PreparationCapability["decode"], revoke: () => unknown, close: () => unknown, error?: (token: bigint) => unknown, finish?: () => unknown | Promise<unknown>}} PreparationSession
 * @typedef {Pick<ReturnType<typeof import("../composition/owned-artifact-driver.mjs").createOwnedArtifactDriver<PreparationSession | ReturnType<typeof createPostPreparationProvider>>>, "state" | "allocatePreparationInvocation" | "constructionFailed" | "drive" | "handoffResult" | "driveHandoff">} SourceDriver
 */
// Foreign effects and opaque receipts for one whole source. The cursor chooses
// admission, refusal reporting, candidate progression and source completion.
/**
 * @param {bigint} invocation
 * @param {import("./post-preparation-host.mjs").PostContext} context
 * @param {{owner: import("@hapsland/agent-flow-bend/canonical-resolver-owner").CanonicalResolverOwner, bridge: ReturnType<typeof import("../../state/resolver-custody/resident-owner-transaction.mjs").createResidentOwnerTransaction>, driver: SourceDriver, candidates: import("@hapsland/native-observation/direct-event/observation").DirectObservation["candidates"], buildPreparationSession: (invocation: number, candidate: import("@hapsland/native-observation/direct-event/observation").DirectObservation["candidates"][number], preparation: AdmittedPreparation) => PreparationSession | Promise<PreparationSession>, analyticsEnabled?: boolean, entry?: "full" | "after-gates"}} options
 */
export function createSourcePreparationProvider(
  invocation,
  context,
  { owner, bridge, driver, candidates, buildPreparationSession, analyticsEnabled = false, entry = "full" }
) {
  const handles = new Map(candidates.map((candidate, index) => [BigInt(index + 1), candidate]))
  /** @type {Map<bigint, PreparationReceipt>} */
  const preparations = new Map()
  /** @type {Map<bigint, unknown>} */
  const errors = new Map()
  /** @type {Map<bigint, Cause.Cause<unknown>>} */
  const errorCauses = new Map()
  /** @type {Map<bigint, string>} */
  const expected = new Map()
  let revoked = false,
    closed = false,
    finished = false
  /** @type {unknown} */
  let primaryFailure
  /** @type {ReturnType<typeof decodeControlledOptions>} */
  let controlled
  /** @type {boolean | undefined} */
  let credentialRequired
  /** @type {Cause.Cause<unknown> | undefined} */
  let pendingDefectCause
  const run = Effect.runPromise,
    ledger = context.deps.residentLedger,
    job = context.job
  const originalReservation = job.reservation
  bridge.bindSourceReservation(invocation, originalReservation)
  /** @param {Omit<Parameters<typeof recordActivity>[0], "statePath" | "root" | "advicee" | "lifetime">} fields */
  const activity = (fields) =>
    recordActivity({
      statePath: job.dispatch.activityPath,
      root: job.observation.root,
      advicee: job.observation.advicee,
      lifetime: context.deps.lifetime,
      ...fields
    })
  /** @param {bigint} handle */
  const candidate = (handle) => {
    const value = handles.get(handle)
    if (!value) throw new Error("Unknown source candidate")
    return value
  }
  return {
    invocation: Number(invocation),
    input: {
      invocation,
      sourcePreparation: {
        entry,
        controlledPresent: job.dispatch.controlled !== null,
        policyRequired: job.round !== undefined && job.workObservationId !== undefined,
        candidates: list([...handles.keys()])
      }
    },
    /** @param {bigint} token */
    error: (token) => errors.get(token),
    /** @param {bigint} token */
    cause: (token) => errorCauses.get(token),
    revoke() {
      revoked = true
    },
    close() {
      closed = true
    },
    async finish() {
      if (finished) return
      // Only exact resources acquired by this source; transferred units are owned
      // by their independent dispatcher/advice scope and are never swept here.
      /** @type {unknown[]} */
      const failures = []
      /** @template A, E @param {Effect.Effect<A, E>} effect @param {() => unknown} [settled] */
      const attempt = async (effect, settled = () => {}) => {
        try {
          await run(Effect.uninterruptible(effect))
          settled()
        } catch (error) {
          failures.push(error)
        }
      }
      for (const receipt of preparations.values())
        if (context.activeWorkspaces.has(receipt.preparation.reservation)) {
          await attempt(ledger.release(receipt.preparation.reservation), () =>
            context.activeWorkspaces.delete(receipt.preparation.reservation)
          )
        }
      if (originalReservation !== undefined) await attempt(ledger.release(originalReservation))
      for (const key of [...context.unassignedClaims])
        await attempt(context.deps.residentReleaseReuseClaim(key), () => context.unassignedClaims.delete(key))
      if (failures.length)
        throw new AggregateError(
          primaryFailure === undefined ? failures : [primaryFailure, ...failures],
          "Source resource cleanup remains incomplete",
          { cause: primaryFailure ?? failures[0] }
        )
      bridge.forgetSourceReservation(invocation)
      finished = true
    },
    /**
     * @param {import("./source-preparation-core.js").Request} request
     * @param {{signal?: AbortSignal | undefined, ownerLease?: import("../../state/resolver-custody/provider-authority.ts").ProviderLease, beforeCommand?: (command: import("./source-preparation-core.js").Command) => void, afterCommit?: (command: import("./source-preparation-core.js").Command, publication: import("../../state/resolver-custody/provider-authority.ts").OwnerPublication) => void}} [options]
     * @returns {Promise<import("./source-preparation-core.js").Reply>}
     */
    async perform(request, options = {}) {
      if (revoked || closed || options.signal?.aborted) throw new Error("Revoked source session")
      if (request.invocation !== invocation) throw new Error("Wrong source invocation")
      const command = request.command
      /** @type {"Failed" | "Defect" | "Cancelled"} */
      let failureKind = "Failed"
      /** @type {Cause.Cause<unknown> | undefined} */
      let failureCause
      /** @type {import("./source-preparation-core.js").Response} */
      let response = { $: "Ack" }
      let observationCommitted = false
      /** @template A, E @param {Effect.Effect<A, E>} effect @returns {Promise<A>} */
      const run = async (effect) => {
        const exit = await Effect.runPromiseExit(effect)
        if (Exit.isFailure(exit)) {
          failureCause = exit.cause
          failureKind = Cause.hasDies(exit.cause)
            ? "Defect"
            : Cause.hasFails(exit.cause)
              ? "Failed"
              : Cause.hasInterrupts(exit.cause)
                ? "Cancelled"
                : "Failed"
          return Effect.runPromise(Effect.failCause(exit.cause))
        }
        return exit.value
      }
      /** @param {import("../../state/resolver-custody/provider-authority.ts").OwnerPublication} publication */
      const committed = (publication) => options.afterCommit?.(command, publication)
      const ownerLease = () => {
        if (options.ownerLease === undefined) throw new TypeError("Source command lacks its Canonical lease")
        return options.ownerLease
      }
      /** @template A, E @param {Effect.Effect<A, E>} effect @returns {Promise<A>} */
      const scoped = (effect) =>
        run(
          Effect.uninterruptible(effect).pipe(
            Effect.provideService(ResidentProviderPermit, { credential: ownerLease(), committed }),
            Effect.provideService(ResidentResourceReceipt, committed)
          )
        )
      try {
        if (command.$ === "CheckCandidateActive") pendingDefectCause = undefined
        options.beforeCommand?.(command)
        switch (command.$) {
          case "StartPolicySource": {
            const round = job.round,
              observationId = job.workObservationId
            if (round === undefined || observationId === undefined) throw new TypeError("Missing source policy binding")
            response = {
              $: "GateAccepted",
              value: await scoped(
                ledger.rounds.policyWork(round).pipe(Effect.map((policy) => policy.startSource(observationId)))
              )
            }
            break
          }
          case "StartObservation":
            response = {
              $: "GateAccepted",
              value: !(await run(bridge.startSourceObservation(ownerLease(), committed))).refusal
            }
            break
          case "AwaitBackendGate":
            await scoped(context.deps.residentAwaitBackendGate())
            break
          case "ReadRuntimeActive":
            response = { $: "Active", value: (await scoped(ledger.runtime.snapshot())).lifecycle === "active" }
            break
          case "DecodeControlled":
            controlled = await run(Effect.sync(() => decodeControlledOptions(job.dispatch.controlled)))
            response = { $: "GateAccepted", value: controlled !== undefined }
            break
          case "ReadCredentialRequired":
            credentialRequired = await run(Effect.sync(() => context.deps.residentCredentialRequired(controlled)))
            break
          case "CheckCredentialShape": {
            const required = credentialRequired
            if (required === undefined) throw new TypeError("Missing source credential fact")
            response = {
              $: "GateAccepted",
              value: await run(
                Effect.sync(() =>
                  context.deps.residentCredentialShapeMatches(job.dispatch, job.settings.credentialEnvVar, required)
                )
              )
            }
            break
          }
          case "VerifyObservationRoot":
            response = {
              $: "GateAccepted",
              value: await run(withinWork(verifyObservationRoot(job.observation), context.preparationSignal))
            }
            break
          case "CheckCredentialGeneration": {
            const required = credentialRequired
            if (required === undefined) throw new TypeError("Missing source credential fact")
            response = {
              $: "GateAccepted",
              value: await run(
                Effect.sync(() => context.deps.residentCredentialGenerationCurrent(job.dispatch, required))
              )
            }
            break
          }
          case "ReleaseJobReservation": {
            const held = owner.find(invocation, bridge.control.readState().children)
            if (held.$ !== "Some") throw new TypeError("Missing source invocation")
            const child = held.value
            if (child.scope.$ === "AfterSourceScope")
              await run(bridge.releaseSourceReservation(ownerLease(), committed))
            else if (originalReservation !== undefined) await scoped(ledger.release(originalReservation))
            break
          }
          case "CheckJobActive":
            response = { $: "Active", value: await scoped(context.deps.residentJobActive(job)) }
            break
          case "RecordPreparationFailureAnalytics":
            await scoped(context.deps.residentRecordAnalytics(job, "preparation-failed"))
            break
          case "RecordUnavailableActivity":
            await run(Effect.sync(() => activity({ stage: "unavailable" })))
            break
          case "ReadEffectiveAnalytics":
            analyticsEnabled = await run(
              Effect.sync(() => effectiveSessionAnalytics(job.settings.configuration.policy))
            )
            job.analyticsEnabled = analyticsEnabled
            break
          case "CheckCandidateActive":
            candidate(command.candidate)
            response = { $: "Active", value: await scoped(context.deps.residentJobActive(job)) }
            break
          case "AdmitCandidateWorkspace": {
            const selected = candidate(command.candidate),
              requestedBytes = await run(Effect.sync(() => captureWorkspaceBytes(selected.path)))
            /** @type {PreparationReceipt | undefined} */
            let receipt
            /** @param {import("../../state/resolver-custody/provider-authority.ts").NativePublication<unknown>} publication */
            const onCommitted = (publication) => {
              const value = publication.value
              if (value && typeof value === "object" && "status" in value && value.status === "admitted") {
                if (
                  !("operation" in value) ||
                  typeof value.operation !== "number" ||
                  !("reservation" in value) ||
                  !value.reservation ||
                  typeof value.reservation !== "object" ||
                  !("id" in value.reservation) ||
                  typeof value.reservation.id !== "number" ||
                  !("partition" in value.reservation) ||
                  typeof value.reservation.partition !== "string"
                )
                  throw new TypeError("Malformed committed preparation admission")
                receipt = Object.freeze({
                  handle: request.id + 1n,
                  candidate: command.candidate,
                  invocation,
                  admissionRequest: request.id,
                  preparation: /** @type {AdmittedPreparation} */ (value)
                })
                preparations.set(receipt.handle, receipt)
                context.activeWorkspaces.add(receipt.preparation.reservation)
              }
              committed(publication)
            }
            const result = await run(
              Effect.uninterruptible(
                ledger.beginObservedPreparation(
                  job.partition,
                  job.canonicalObservationId,
                  requestedBytes,
                  job.canonicalRound
                )
              ).pipe(
                Effect.provideService(ResidentProviderPermit, { credential: ownerLease(), committed: onCommitted })
              )
            )
            /** @type {Record<"stale-round" | "wrong-stage", import("./source-preparation-core.js").UnavailableReason["$"]>} */
            const reasons = { "stale-round": "StaleRound", "wrong-stage": "WrongStage" }
            if (result.status === "admitted") {
              if (receipt === undefined) throw new TypeError("Missing committed preparation admission receipt")
              response = { $: "WorkspaceAdmitted", preparation: receipt.handle }
            } else {
              response = {
                $: "WorkspaceRefused",
                requested_bytes: BigInt(requestedBytes),
                reason:
                  result.status === "capacity-refused"
                    ? { $: "CapacityRefused" }
                    : result.status === "unavailable"
                      ? {
                          $: "Unavailable",
                          reason: {
                            $:
                              reasons[result.reason] ??
                              (() => {
                                throw new Error("Unknown workspace unavailability")
                              })()
                          }
                        }
                      : { $: "InvalidMeasurement" }
              }
            }
            break
          }
          case "PrepareCandidate": {
            const receipt = preparations.get(command.preparation)
            if (
              !receipt ||
              receipt.invocation !== invocation ||
              receipt.candidate !== command.candidate ||
              receipt.admissionRequest + 1n !== request.id
            )
              throw new Error("Candidate preparation differs from issued admission receipt")
            const held = owner.find(invocation, driver.state.children)
            if (held.$ !== "Some" || held.value.scope.$ !== "SourceScope")
              throw new TypeError("Missing Canonical Source parent")
            const child = held.value
            /** @type {import("@hapsland/agent-flow-bend/canonical-resolver-owner").Parent} */
            const parent = { $: "Parent", invocation, generation: child.generation, request: request.id }
            const prepInvocation = driver.allocatePreparationInvocation(
              {
                $: "PreparationScope",
                partition: child.scope.partition,
                lifetime: child.scope.lifetime,
                round: child.scope.round,
                preparation: BigInt(receipt.preparation.operation)
              },
              parent
            )
            /** @type {PreparationSession} */
            let session
            try {
              session = await run(
                Effect.promise(() =>
                  Promise.resolve(
                    buildPreparationSession(prepInvocation, candidate(command.candidate), receipt.preparation)
                  )
                )
              )
            } catch (original) {
              const originalCause = failureCause ?? Cause.die(original)
              let combinedCause = originalCause
              const failures = []
              try {
                driver.constructionFailed(prepInvocation)
              } catch (cleanup) {
                failures.push(cleanup)
                combinedCause = Cause.combine(combinedCause, Cause.die(cleanup))
              }
              // Match the native preparation onError finalizer: release this
              // exact workspace before the outer Source panic diagnostic.
              // Keep failed release custody for finish's existing retry.
              try {
                await scoped(ledger.release(receipt.preparation.reservation))
                context.activeWorkspaces.delete(receipt.preparation.reservation)
              } catch (cleanup) {
                failures.push(cleanup)
                combinedCause = Cause.combine(combinedCause, failureCause ?? Cause.die(cleanup))
              }
              failureCause = combinedCause
              if (failures.length) {
                failureKind = "Defect"
                throw new AggregateError([original, ...failures], "Preparation construction and cleanup failed", {
                  cause: original
                })
              }
              throw original
            }
            const handoff = await driver.drive(session, session.input, { signal: options.signal })
            if (!("handoff" in handoff)) {
              const failure = "failure" in handoff ? handoff.failure : undefined
              const reason = failure && "reason" in failure ? failure.reason : undefined
              const tag = failure && "$" in failure ? failure.$ : undefined
              throw Object.assign(new Error("Preparation child failed: " + String(reason ?? tag)), { cause: failure })
            }
            const result = driver.handoffResult(handoff).preparation
            const prepared = session.decode(result, job.observation.advicee)
            const pathObservation = { ...job.observation, candidates: [candidate(command.candidate)] }
            const post = createPostPreparationProvider(
              handoff.handoff,
              context,
              prepared,
              receipt.preparation,
              pathObservation,
              analyticsEnabled,
              {
                owner,
                driver,
                sourceInvocation: invocation,
                operation: BigInt(receipt.preparation.operation),
                capability: receipt.preparation.reservation,
                handoff,
                parent
              }
            )
            let accepted
            try {
              accepted = await driver.driveHandoff(handoff, post, () => post.input, { signal: options.signal })
            } catch (error) {
              const cause = post.handoffFailureCause
              if (cause !== undefined) {
                failureCause = cause
                failureKind = Cause.hasDies(cause)
                  ? "Defect"
                  : Cause.hasFails(cause)
                    ? "Failed"
                    : Cause.hasInterrupts(cause)
                      ? "Cancelled"
                      : "Failed"
                if (failureKind === "Defect") pendingDefectCause = cause
                await run(Effect.failCause(cause))
              }
              throw error
            }
            const reason = "reason" in accepted ? accepted.reason : undefined
            if (reason && (reason.$ === "DefectFailure" || reason.$ === "TechnicalFailure")) {
              failureCause = post.terminationCause ?? post.cause(reason.token)
              if (failureCause !== undefined) {
                failureKind = Cause.hasDies(failureCause)
                  ? "Defect"
                  : Cause.hasFails(failureCause)
                    ? "Failed"
                    : Cause.hasInterrupts(failureCause)
                      ? "Cancelled"
                      : "Failed"
                if (failureKind === "Defect") pendingDefectCause = failureCause
                await run(Effect.failCause(failureCause))
              }
              throw post.error(reason.token) ?? new Error("Post-preparation failed: " + reason.$)
            }
            if ("failure" in accepted)
              throw (
                options.signal?.reason ??
                Object.assign(new Error("Post-preparation invocation cancelled"), { cause: accepted.failure })
              )
            response = { $: "CandidateContinued", value: "continued" in accepted && accepted.continued === true }
            break
          }
          case "ObserveCandidateDiagnostic": {
            failureKind = "Defect"
            const selected = candidate(command.candidate),
              diagnostic = command.diagnostic
            /** @type {Parameters<typeof context.deps.residentInspection.observeDiagnostic>[3]} */
            const value =
              diagnostic.$ === "WorkspaceCapacity"
                ? {
                    stage: "preparation",
                    code: "preparation-resource-refused",
                    args: { phase: "capture-workspace", requestedBytes: Number(diagnostic.requested_bytes) }
                  }
                : diagnostic.$ === "WorkspaceUnavailable"
                  ? {
                      stage: "preparation",
                      code: "preparation-unavailable",
                      args: { reason: diagnostic.reason.$ === "StaleRound" ? "stale-round" : "wrong-stage" }
                    }
                  : { stage: "preparation", code: "panic", args: { boundary: "review-preparation" } }
            context.deps.residentInspection.observeDiagnostic(
              job.inspectionReceipt,
              selected.path,
              selected.path,
              value
            )
            break
          }
          case "RejectCandidateCapacity":
            await scoped(ledger.runtime.rejectCapacity())
            break
          case "RecordCandidateAnalytics":
            await scoped(
              context.deps.residentRecordAnalytics(
                job,
                command.outcome.$ === "CapacityRejected" ? "capacity-rejected" : "preparation-failed"
              )
            )
            break
          case "RecordCandidateUnavailable":
            await run(Effect.sync(() => activity({ stage: "unavailable" })))
            break
          case "ReadExpectedActivity": {
            expected.clear()
            context.expectedActivityUnits.forEach((identity, index) => expected.set(BigInt(index + 1), identity))
            response = { $: "ExpectedActivity", identities: list([...expected.keys()]) }
            break
          }
          case "RecordPendingActivity":
            await run(
              Effect.sync(() =>
                activity({
                  stage: "pending",
                  expectedUnitIdentities: unlist(command.identities).map((handle) => {
                    const identity = expected.get(handle)
                    if (identity === undefined) throw new Error("Unknown expected activity receipt")
                    return identity
                  })
                })
              )
            )
            break
          case "CompletePolicySource": {
            const round = job.round,
              observationId = job.workObservationId
            if (round === undefined || observationId === undefined) throw new TypeError("Missing source policy binding")
            response = {
              $: "CompletionAccepted",
              value: await scoped(
                ledger.rounds.policyWork(round).pipe(Effect.map((policy) => policy.completeSource(observationId)))
              )
            }
            break
          }
          case "CompleteObservation":
            await run(
              bridge.completeSourceObservation(ownerLease(), (publication) => {
                observationCommitted = true
                job.completed = true
                committed(publication)
              })
            )
            response = { $: "CompletionAccepted", value: true }
            break
          case "AfterPrepare":
            await run(
              withinWork(
                context.deps.residentPreparationControls.afterPrepare.pipe(
                  Effect.mapError(() => new ResidentAdapterError({ operation: "preparation barrier" }))
                ),
                options.signal ?? context.preparationSignal
              )
            )
            break
          default:
            throw new Error("Unknown source command")
        }
      } catch (error) {
        primaryFailure ??= error
        const token = BigInt(errors.size + 1)
        errors.set(token, error)
        const cause = failureCause ?? (failureKind === "Defect" ? Cause.die(error) : Cause.fail(error))
        const combinedCause =
          command.$ === "ObserveCandidateDiagnostic" && pendingDefectCause
            ? Cause.combine(pendingDefectCause, cause)
            : cause
        errorCauses.set(token, combinedCause)
        if (
          failureKind === "Defect" &&
          [
            "CheckCandidateActive",
            "AdmitCandidateWorkspace",
            "PrepareCandidate",
            "ObserveCandidateDiagnostic",
            "RejectCandidateCapacity",
            "RecordCandidateAnalytics",
            "RecordCandidateUnavailable"
          ].includes(command.$)
        )
          pendingDefectCause = combinedCause
        if (command.$ === "ObserveCandidateDiagnostic" && pendingDefectCause) {
          try {
            await run(Effect.failCause(combinedCause))
          } catch (combined) {
            errors.set(token, combined)
          }
        }
        response =
          failureKind === "Defect"
            ? observationCommitted
              ? { $: "ObservationCommittedDefect", token, recoverable: Cause.hasFails(combinedCause) }
              : {
                  $: "Defect",
                  token,
                  interrupted: Cause.hasInterrupts(combinedCause),
                  recoverable: Cause.hasFails(combinedCause)
                }
            : failureKind === "Cancelled"
              ? observationCommitted
                ? { $: "ObservationCommittedCancelled", token }
                : { $: "Cancelled", token }
              : observationCommitted
                ? { $: "ObservationCommittedFailure", token }
                : { $: "Failed", token }
      }
      return { $: "Reply", invocation, id: request.id, response }
    }
  }
}
