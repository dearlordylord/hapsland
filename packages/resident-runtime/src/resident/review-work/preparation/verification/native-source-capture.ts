import type { ReviewSettingsSnapshot } from "@hapsland/review-definition/runtime/review-settings"
import { type DirectObservation } from "@hapsland/native-observation/direct-event/observation"
import { captureWorkspaceBytes, analysisWorkspaceBytes } from "../../../work-ownership/workspace.ts"
import { recordActivity } from "@hapsland/activity-observation/activity/status"
import * as Effect from "effect/Effect"
import * as Cause from "effect/Cause"
import { type PreparationDiagnostic } from "@hapsland/review-definition/direct-event/model"
import { prepareObservation, type PreparedObservation } from "@hapsland/review-execution/direct-event/pipeline"
import { resizePreparationAdmission } from "../../../work-ownership/reservation.ts"
import { withinWork } from "../../../work-ownership/cancellation.ts"
import { type PreparationContext } from "../context.ts"

import { nativePostPreparation } from "./native-post-preparation.ts"

const startCanonicalSource = Effect.fn("ResidentRuntime.startCanonicalSource")(function* (
  context: PreparationContext<"residentLedger">
) {
  if (context.job.round === undefined || context.job.workObservationId === undefined) return true
  return (yield* context.deps.residentLedger.rounds.policyWork(context.job.round)).startSource(
    context.job.workObservationId
  )
})

export const startSourcePreparation = Effect.fn("ResidentRuntime.startSourcePreparation")(function* (
  context: PreparationContext<"residentAwaitBackendGate" | "residentLedger">
) {
  if (!(yield* startCanonicalSource(context))) {
    yield* context.deps.residentLedger.release(context.job.reservation)
    return false
  }
  if (
    !(yield* context.deps.residentLedger.observation(
      context.job.partition,
      context.job.canonicalObservationId,
      "startObservation",
      context.job.canonicalRound
    ))
  ) {
    yield* context.deps.residentLedger.release(context.job.reservation)
    return false
  }
  yield* context.deps.residentAwaitBackendGate()
  if ((yield* context.deps.residentLedger.runtime.snapshot()).lifecycle !== "active") {
    yield* context.deps.residentLedger.release(context.job.reservation)
    return false
  }
  return true
})

const recordRefusedPreparation = Effect.fn("ResidentRuntime.recordRefusedPreparation")(function* (
  context: PreparationContext<"lifetime" | "residentInspection" | "residentLedger" | "residentRecordAnalytics">,
  candidate: DirectObservation["candidates"][number],
  preparation: Exclude<
    Effect.Success<ReturnType<typeof context.deps.residentLedger.beginObservedPreparation>>,
    { status: "admitted" }
  >,
  requestedBytes: number
) {
  const diagnostic: PreparationDiagnostic =
    preparation.status === "capacity-refused"
      ? {
          stage: "preparation",
          code: "preparation-resource-refused",
          args: { phase: "capture-workspace", requestedBytes }
        }
      : preparation.status === "unavailable"
        ? { stage: "preparation", code: "preparation-unavailable", args: { reason: preparation.reason } }
        : { stage: "preparation", code: "panic", args: { boundary: "review-preparation" } }
  context.deps.residentInspection.observeDiagnostic(
    context.job.inspectionReceipt,
    candidate.path,
    candidate.path,
    diagnostic
  )
  if (preparation.status === "capacity-refused") yield* context.deps.residentLedger.runtime.rejectCapacity()
  yield* context.deps.residentRecordAnalytics(
    context.job,
    preparation.status === "capacity-refused" ? "capacity-rejected" : "preparation-failed"
  )
  recordActivity({
    statePath: context.job.dispatch.activityPath,
    root: context.job.observation.root,
    advicee: context.job.observation.advicee,
    lifetime: context.deps.lifetime,
    stage: "unavailable"
  })
})

export const prepareCandidate = Effect.fn("ResidentRuntime.prepareCandidate")(
  function* (
    context: PreparationContext<
      | "inspection"
      | "lifetime"
      | "residentAdvice"
      | "residentCaptureSource"
      | "residentDispatcher"
      | "residentInspection"
      | "residentJobActive"
      | "residentJoined"
      | "residentLedger"
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
    >,
    settings: ReviewSettingsSnapshot,
    analyticsEnabled: boolean,
    candidate: DirectObservation["candidates"][number]
  ) {
    if (!(yield* context.deps.residentJobActive(context.job))) return false
    const requestedBytes = captureWorkspaceBytes(candidate.path)
    const preparation = yield* context.deps.residentLedger.beginObservedPreparation(
      context.job.partition,
      context.job.canonicalObservationId,
      requestedBytes,
      context.job.canonicalRound
    )
    if (preparation.status !== "admitted") {
      yield* recordRefusedPreparation(context, candidate, preparation, requestedBytes)
      return true
    }
    const workspace = preparation.reservation
    context.activeWorkspaces.add(workspace)
    const pathObservation: DirectObservation = { ...context.job.observation, candidates: [candidate] }
    const prepared: PreparedObservation = yield* withinWork(
      Effect.gen(function* () {
        return yield* prepareObservation(pathObservation, {
          controlledWriter: true,
          advicee: pathObservation.advicee,
          settings,
          ...context.deps.residentInspection.preparationPorts(context.job),
          ...(context.deps.residentCaptureSource === undefined
            ? {}
            : { captureSource: context.deps.residentCaptureSource }),
          beforeAnalyze: (path, sourceBytes, preflight) =>
            Effect.gen(function* () {
              const required = analysisWorkspaceBytes(path, sourceBytes, preflight, settings.rules)
              const resized = yield* context.deps.residentLedger.resize(workspace, required)
              if (resized.status === "capacity-refused") {
                yield* context.deps.residentLedger.runtime.rejectCapacity()
                yield* context.deps.residentRecordAnalytics(context.job, "capacity-rejected")
              }
              return resizePreparationAdmission(resized, required)
            })
        })
      }),
      context.preparationSignal
    ).pipe(Effect.onError(() => context.deps.residentLedger.release(workspace)))
    return yield* nativePostPreparation(context, prepared, preparation, pathObservation, analyticsEnabled)
  },
  (effect, context, _settings, _analyticsEnabled, candidate) =>
    effect.pipe(
      Effect.onError((cause) =>
        Effect.sync(() => {
          if (Cause.hasDies(cause) && !Cause.hasInterrupts(cause))
            context.deps.residentInspection.observeDiagnostic(
              context.job.inspectionReceipt,
              candidate.path,
              candidate.path,
              { stage: "preparation", code: "panic", args: { boundary: "review-preparation" } }
            )
        })
      )
    )
)
