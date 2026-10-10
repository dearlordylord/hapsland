import { effectiveSessionAnalytics } from "@hapsland/runtime-inputs/configuration/resolve"
import { recordActivity } from "@hapsland/activity-observation/activity/status"
import * as Effect from "effect/Effect"
import { verifyObservationRoot } from "@hapsland/native-observation/direct-event/adapter"
import { type CapacityReservation } from "../../state/capacity.ts"
import { type IngressJob } from "../../work-ownership/jobs.ts"
import { withinWork } from "../../work-ownership/cancellation.ts"
import { decodeControlledOptions } from "../../authorization/controlled.ts"
import { type Dependencies, type PreparationContext } from "./context.ts"
import { startSourcePreparation, prepareCandidate } from "./capture.ts"
import { completeSourcePreparation } from "./retention.ts"

const residentPrepare = Effect.fn("ResidentRuntime.prepare")((
  deps: Pick<
    Dependencies,
    | "inspection"
    | "lifetime"
    | "residentAdvice"
    | "residentAwaitBackendGate"
    | "residentCaptureSource"
    | "residentCredentialGenerationCurrent"
    | "residentCredentialRequired"
    | "residentCredentialShapeMatches"
    | "residentDispatcher"
    | "residentInspection"
    | "residentJobActive"
    | "residentJoined"
    | "residentLedger"
    | "residentLifetimeController"
    | "residentPreparationControls"
    | "residentRecordAnalytics"
    | "residentRecordJoinedOutcomes"
    | "residentRecordOperationalFailure"
    | "residentRegisterCurrentWork"
    | "residentReleaseCurrentWork"
    | "residentReleaseReuseClaim"
    | "residentReleaseUnit"
    | "residentRestoreCurrentWork"
    | "residentRetainAdvice"
    | "residentRetireCachedUnit"
    | "residentReuse"
    | "runtimeConfiguration"
  >,
  job: IngressJob,
  sequence: number
) => {
  const expectedActivityUnits: Array<string> = []
  const unassignedClaims = new Set<string>()
  const activeWorkspaces = new Set<CapacityReservation>()
  const preparationSignal = job.work?.controller.signal ?? deps.residentLifetimeController.signal
  const context: PreparationContext<
    | "inspection"
    | "lifetime"
    | "residentAdvice"
    | "residentAwaitBackendGate"
    | "residentCaptureSource"
    | "residentCredentialGenerationCurrent"
    | "residentCredentialRequired"
    | "residentCredentialShapeMatches"
    | "residentDispatcher"
    | "residentInspection"
    | "residentJobActive"
    | "residentJoined"
    | "residentLedger"
    | "residentLifetimeController"
    | "residentPreparationControls"
    | "residentRecordAnalytics"
    | "residentRecordJoinedOutcomes"
    | "residentRecordOperationalFailure"
    | "residentRegisterCurrentWork"
    | "residentReleaseCurrentWork"
    | "residentReleaseReuseClaim"
    | "residentReleaseUnit"
    | "residentRestoreCurrentWork"
    | "residentRetainAdvice"
    | "residentRetireCachedUnit"
    | "residentReuse"
    | "runtimeConfiguration"
  > = { deps, job, sequence, expectedActivityUnits, unassignedClaims, activeWorkspaces, preparationSignal }
  return Effect.gen(function* () {
    if (!(yield* startSourcePreparation(context))) return
    const controlled = decodeControlledOptions(job.dispatch.controlled)
    const settings = yield* withinWork(
      Effect.gen(function* () {
        const settings = job.settings
        if (job.dispatch.controlled !== null && controlled === undefined) return undefined
        const credentialRequired = deps.residentCredentialRequired(controlled)
        if (!deps.residentCredentialShapeMatches(job.dispatch, settings.credentialEnvVar, credentialRequired))
          return undefined
        if (!(yield* verifyObservationRoot(job.observation))) return undefined
        if (!deps.residentCredentialGenerationCurrent(job.dispatch, credentialRequired)) return undefined
        return settings
      }),
      preparationSignal
    )
    yield* deps.residentLedger.release(job.reservation)
    if (
      settings === undefined ||
      (yield* deps.residentLedger.runtime.snapshot()).lifecycle !== "active" ||
      !(yield* deps.residentJobActive(job))
    ) {
      yield* deps.residentRecordAnalytics(job, "preparation-failed")
      recordActivity({
        statePath: job.dispatch.activityPath,
        root: job.observation.root,
        advicee: job.observation.advicee,
        lifetime: deps.lifetime,
        stage: "unavailable"
      })
      return
    }
    const analyticsEnabled = effectiveSessionAnalytics(settings.configuration.policy)
    job.analyticsEnabled = analyticsEnabled

    // A candidate path is captured and analyzed only while its maximum
    // supported logical workspace is charged. Processing candidates one at
    // a time prevents a 16-path event from materializing 1,024 complete
    // inputs outside the ledger.

    for (const candidate of job.observation.candidates) {
      if (!(yield* prepareCandidate(context, settings, analyticsEnabled, candidate))) return
    }
    yield* completeSourcePreparation(context)
    return
  }).pipe(
    Effect.catch(() =>
      Effect.gen(function* () {
        yield* deps.residentRecordAnalytics(job, "preparation-failed")
        if (deps.runtimeConfiguration.debug) console.error("resident preparation unavailable")
        yield* deps.residentLedger.release(job.reservation)
        if ((yield* deps.residentLedger.runtime.snapshot()).lifecycle === "active")
          recordActivity({
            statePath: job.dispatch.activityPath,
            root: job.observation.root,
            advicee: job.observation.advicee,
            lifetime: deps.lifetime,
            stage: "unavailable"
          })
      })
    ),
    Effect.ensuring(
      Effect.gen(function* () {
        yield* deps.residentLedger.release(job.reservation)
        for (const workspace of activeWorkspaces) yield* deps.residentLedger.release(workspace)
        for (const key of unassignedClaims) yield* deps.residentReleaseReuseClaim(key)
        if (!job.completed)
          yield* deps.residentLedger.observation(
            job.partition,
            job.canonicalObservationId,
            "interruptObservation",
            job.canonicalRound
          )
      })
    )
  )
})

export const makeResidentPreparation = (
  deps: Pick<
    Dependencies,
    | "inspection"
    | "lifetime"
    | "residentAdvice"
    | "residentAwaitBackendGate"
    | "residentCaptureSource"
    | "residentCredentialGenerationCurrent"
    | "residentCredentialRequired"
    | "residentCredentialShapeMatches"
    | "residentDispatcher"
    | "residentInspection"
    | "residentJobActive"
    | "residentJoined"
    | "residentLedger"
    | "residentLifetimeController"
    | "residentPreparationControls"
    | "residentRecordAnalytics"
    | "residentRecordJoinedOutcomes"
    | "residentRecordOperationalFailure"
    | "residentRegisterCurrentWork"
    | "residentReleaseCurrentWork"
    | "residentReleaseReuseClaim"
    | "residentReleaseUnit"
    | "residentRestoreCurrentWork"
    | "residentRetainAdvice"
    | "residentRetireCachedUnit"
    | "residentReuse"
    | "runtimeConfiguration"
  >
) => {
  return { residentPrepare: residentPrepare.bind(null, deps) }
}
