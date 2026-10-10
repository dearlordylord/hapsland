import { makeLocalResidentOperations } from "./composition/local-response.ts"
import { monotonicNow } from "@hapsland/resident-transport/resident/hook-clock"
import * as Effect from "effect/Effect"
import * as Deferred from "effect/Deferred"
import { resolveResidentPaths, type ResidentPaths } from "@hapsland/resident-transport/resident/paths"
import { type ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import { makeDispatcher, type Dispatcher } from "./state/dispatch.ts"
import { Context, Layer, Scope } from "effect"
import { type Job } from "./work-ownership/jobs.ts"
import { type ResidentRuntimeOptions } from "./runtime-options.ts"
import { type ResidentRuntimeOperations, type ResidentRuntime } from "./runtime.ts"
import { logicalBytes } from "./state/encoded-size.ts"
import { makeResidentResources } from "./composition/resources.ts"
import { makeResidentWorkflows } from "./composition/workflows.ts"
import { makeResidentLifecycle } from "./endpoint-lifecycle/lifecycle.ts"

export class ResidentRuntimeService extends Context.Service<ResidentRuntimeService, ResidentRuntimeOperations>()(
  "@hapsland/ResidentRuntime"
) {}

export const makeResidentRuntime = Effect.fn("ResidentRuntime.make")(function* (
  paths: ResidentPaths | undefined = undefined,
  now: () => number = monotonicNow,
  options: ResidentRuntimeOptions = {}
) {
  paths ??= yield* resolveResidentPaths()
  const resources = yield* makeResidentResources(paths, now, options)
  const { closed, residentLedger, lifetime, residentDispatchScope, residentNow, residentNotices, residentReuse } =
    resources
  const workflows = makeResidentWorkflows(resources, {
    get stats() {
      return stats
    },
    get close() {
      return lifecycle.close
    },
    get residentDispatcher() {
      return residentDispatcher
    },
    get residentAdvice() {
      return residentAdvice
    },
    get cleanup() {
      return cleanup
    },
    get sweepQuietRounds() {
      return workflows.workLifecycle.sweepQuietRounds
    },
    get residentScheduleRetirementClose() {
      return lifecycle.residentScheduleRetirementClose
    },
    get residentScheduleIdleCheck() {
      return lifecycle.residentScheduleIdleCheck
    },
    releaseInspectionConnection: () => lifecycle.releaseInspectionConnection()
  })
  const { admission, adviceCollection, delivery, workLifecycle, preparation, evaluation, requests, responses } =
    workflows
  const lifecycle = yield* makeResidentLifecycle(resources, workflows, {
    get residentDispatcher() {
      return residentDispatcher
    },
    get cleanup() {
      return cleanup
    },
    get residentAdvice() {
      return residentAdvice
    }
  })
  const { listen, close } = lifecycle
  const residentAdvice = Effect.fn("ResidentRuntime.advice")(() => residentLedger.advice.values())
  const stats = Effect.fn("ResidentRuntime.stats")(function* (): Effect.fn.Return<
    Extract<ResidentResponse, { status: "stats" }>
  > {
    const now = residentNow()
    yield* workLifecycle.residentExpirePending(now)
    yield* workLifecycle.residentPruneNoticeCooldowns(now)
    const dispatch = yield* residentDispatcher.snapshot()
    const capacity = yield* residentLedger.snapshot()
    const reuse = yield* residentReuse.snapshot()
    return {
      status: "stats",
      queued: dispatch.queued,
      running: dispatch.running,
      pendingAdvice: (yield* residentAdvice()).length + (yield* workLifecycle.residentPendingNoticeCount()),
      pendingFindingBatches: (yield* residentAdvice()).length,
      pendingOperationalNotices: yield* workLifecycle.residentPendingNoticeCount(),
      retainedBytes: capacity.bytes,
      rejectedCapacity: (yield* residentLedger.runtime.snapshot()).rejectedCapacity,
      successfulCacheEntries: reuse.entries,
      pendingEvaluations: reuse.pending,
      noticeCooldowns: (yield* residentNotices.entries()).length,
      currentWork: yield* residentLedger.revision.count()
    }
  })
  const cleanup = Effect.fn("ResidentRuntime.cleanup")(function* (): Effect.fn.Return<"busy" | "cleaned"> {
    if ((yield* residentLedger.runtime.snapshot()).lifecycle !== "active") return "busy"
    const now = residentNow()
    yield* workLifecycle.residentExpirePending(now)
    yield* workLifecycle.residentPruneNoticeCooldowns(now)
    return yield* residentLedger.runtime.cleanup(logicalBytes)
  })
  const { collect, handle } = makeLocalResidentOperations({ lifetime, adviceCollection, responses, requests })
  const residentRun = Effect.fn("ResidentRuntime.run")((job: Job, sequence: number) =>
    job.kind === "ingress" ? preparation.residentPrepare(job, sequence) : evaluation.residentEvaluateUnit(job, sequence)
  )
  const residentDispatcher: Dispatcher<string, Job> = yield* makeDispatcher<string, Job>(
    residentLedger,
    (job) => ({
      operation: job.kind === "ingress" ? job.canonicalObservationId : job.canonicalOperationId,
      round: job.canonicalRound
    }),
    (entry) => residentRun(entry.value, entry.sequence)
  ).pipe(Effect.provideService(Scope.Scope, residentDispatchScope))
  const operations = Object.freeze(
    ResidentRuntimeService.of({
      lifetime,
      paths,
      listen,
      close,
      handle,
      stats,
      whenIdle: delivery.whenIdle,
      whenClosed: Deferred.await(closed)
    })
  )
  const runtime: ResidentRuntime = Object.freeze({
    operations,
    lifetime,
    paths,
    stats,
    cleanup,
    admit: admission.admit,
    collect,
    acknowledge: delivery.acknowledge,
    finalize: delivery.finalize,
    releaseDelivery: delivery.releaseDelivery,
    beginComposedSubmission: delivery.beginComposedSubmission,
    releaseComposedSubmission: delivery.releaseComposedSubmission,
    whenIdle: delivery.whenIdle,
    pendingAdviceMetadata: delivery.pendingAdviceMetadata,
    accountingMetrics: delivery.accountingMetrics,
    sweepQuietRounds: workLifecycle.sweepQuietRounds,
    handle,
    listen,
    close
  })
  yield* Effect.addFinalizer(() => close.pipe(Effect.orDie))
  return runtime
})

export const residentRuntimeLayer = (
  paths: ResidentPaths,
  now: () => number = monotonicNow,
  options: ResidentRuntimeOptions = {}
) =>
  Layer.effect(
    ResidentRuntimeService,
    makeResidentRuntime(paths, now, options).pipe(Effect.map((runtime) => runtime.operations))
  )

export type { JevRequestObservation } from "./review-work/request-observation.ts"

export type { ResidentRuntimeOptions } from "./runtime-options.ts"

export type { ResidentRuntimeOperations, ResidentRuntime } from "./runtime.ts"

export { OPERATIONAL_NOTICE_COOLDOWN_MS, MAX_OPERATIONAL_NOTICE_KEYS } from "./advice-delivery/notices.ts"

export { residentUnitWorstOutcomeBytes, residentUnitReservationBytes } from "./work-ownership/reservation.ts"
