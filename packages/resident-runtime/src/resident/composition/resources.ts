import { makeCollectionFindingOffer } from "../advice-delivery/finding-policy.ts"
import { recordRepeatEditDiagnostic } from "../review-work/review-observation.ts"
import { makeResidentInspection } from "../inspection/observer.ts"
import { ResidentDispatchControls, dispatchControlsLayer } from "../execution-controls/dispatch-controls.ts"
import { ResidentReviewControls, reviewControlsLayer } from "../execution-controls/review-controls.ts"
import { ResidentPreparationControls, preparationControlsLayer } from "../execution-controls/preparation-controls.ts"
import { makeResidentRuntimeConfiguration } from "../runtime-configuration.ts"
import * as Effect from "effect/Effect"
import * as Deferred from "effect/Deferred"
import * as Semaphore from "effect/Semaphore"
import { makeReviewSettings } from "@hapsland/review-definition/runtime/review-settings"
import { type ResidentPaths } from "@hapsland/resident-transport/resident/paths"
import { makeResidentState } from "../state/resident/state.ts"
import { Context, Exit, Layer, Ref, Scope } from "effect"
import type * as Fiber from "effect/Fiber"
import * as FiberHandle from "effect/FiberHandle"
import { PENDING_ADVICE_EXPIRY_MS } from "../advice-delivery/collection.ts"
import { ResidentAdapterError } from "../adapter-error.ts"
import { type UnitJob, type Job } from "../work-ownership/jobs.ts"
import { type ResidentRuntimeOptions } from "../runtime-options.ts"
import { OPERATIONAL_NOTICE_COOLDOWN_MS, validatedOperationalNoticeKeys } from "../advice-delivery/notices.ts"
import { logicalBytes } from "../state/encoded-size.ts"

export const makeResidentResources = Effect.fn("ResidentRuntime.resources")(function* (
  paths: ResidentPaths,
  now: () => number,
  options: ResidentRuntimeOptions
) {
  const closed = yield* Deferred.make<void>()
  const runtimeConfiguration = yield* makeResidentRuntimeConfiguration().pipe(
    Effect.mapError(() => new ResidentAdapterError({ operation: "resident runtime configuration" }))
  )
  const reviewSettings = yield* makeReviewSettings()
  const residentLedger = yield* makeResidentState<UnitJob, string, Job>()
  const admissionLock = yield* Semaphore.make(1)
  const updateNoticeBudgets = yield* Ref.make<ReadonlyMap<string, number>>(new Map())
  const lifetime = residentLedger.residentLifetime
  const residentInspection = yield* makeResidentInspection(paths.socket, lifetime, options.inspectionPersistence)
  const inspection = residentInspection.recorder
  const residentJoined = residentLedger.joinedReviews(logicalBytes)
  const residentRuntimeScope = yield* Scope.Scope
  const residentIpcScope = yield* Scope.make()
  yield* Effect.addFinalizer(() => Scope.close(residentIpcScope, Exit.void))
  const residentDispatchScope = yield* Scope.make()
  yield* Effect.addFinalizer(() => Scope.close(residentDispatchScope, Exit.void))
  const residentStopExpiries = new Map<string, Fiber.Fiber<void>>()
  const residentComposedDelivery = residentLedger.delivery((diagnostic) => {
    recordRepeatEditDiagnostic(paths.directory, diagnostic)
  })
  const residentIdleChecks = yield* FiberHandle.make<void, never>().pipe(
    Effect.provideService(Scope.Scope, residentDispatchScope)
  )
  const residentQuietChecks = yield* FiberHandle.make<void, never>().pipe(
    Effect.provideService(Scope.Scope, residentDispatchScope)
  )
  const residentLifetimeController = new AbortController()
  const residentCollectionFindingOffer = makeCollectionFindingOffer(residentLedger)
  const maximumOperationalNoticeKeys = validatedOperationalNoticeKeys(options.maximumOperationalNoticeKeys)
  const residentNow = now
  const residentNotices = residentLedger.notices(
    maximumOperationalNoticeKeys,
    OPERATIONAL_NOTICE_COOLDOWN_MS,
    PENDING_ADVICE_EXPIRY_MS,
    logicalBytes
  )
  const residentCaptureSource = options.captureSource
  const residentControlScope = yield* Scope.make()
  yield* Effect.addFinalizer(() => Scope.close(residentControlScope, Exit.void))
  const residentPreparationControls = Context.get(
    yield* Layer.buildWithScope(options.preparationControls ?? preparationControlsLayer, residentControlScope),
    ResidentPreparationControls
  )
  const residentReviewControls = Context.get(
    yield* Layer.buildWithScope(options.reviewControls ?? reviewControlsLayer, residentControlScope),
    ResidentReviewControls
  )
  const residentDispatchControls = Context.get(
    yield* Layer.buildWithScope(options.dispatchControls ?? dispatchControlsLayer, residentControlScope),
    ResidentDispatchControls
  )
  const residentDispatchAuthorityObserver = options.dispatchAuthorityObserver
  const residentJevRequestObserver = options.jevRequestObserver
  const residentOfflineHttpClient = options.offlineHttpClient
  const residentControlledRequestEffect = options.controlledRequestEffect
  const residentReuse = residentLedger.reuse(logicalBytes)
  return {
    paths,
    options,
    closed,
    runtimeConfiguration,
    reviewSettings,
    residentLedger,
    admissionLock,
    updateNoticeBudgets,
    lifetime,
    residentInspection,
    inspection,
    residentJoined,
    residentRuntimeScope,
    residentIpcScope,
    residentDispatchScope,
    residentStopExpiries,
    residentComposedDelivery,
    residentIdleChecks,
    residentQuietChecks,
    residentLifetimeController,
    residentCollectionFindingOffer,
    maximumOperationalNoticeKeys,
    residentNow,
    residentNotices,
    residentCaptureSource,
    residentControlScope,
    residentPreparationControls,
    residentReviewControls,
    residentDispatchControls,
    residentDispatchAuthorityObserver,
    residentJevRequestObserver,
    residentOfflineHttpClient,
    residentControlledRequestEffect,
    residentReuse
  }
})

export type ResidentResources = Effect.Success<ReturnType<typeof makeResidentResources>>
