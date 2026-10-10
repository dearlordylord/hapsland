import type { ResidentLedger, Job, UnitJob } from "../work-ownership/jobs.ts"
import type { RoundWork } from "../state/round-records.ts"
import type { Advice } from "../state/advice-records.ts"
import type { Dispatcher } from "../state/dispatch.ts"
import { type Socket, createServer, type Server } from "node:net"
import type { ResidentPaths } from "@hapsland/resident-transport/resident/paths"
import * as Effect from "effect/Effect"
import * as Deferred from "effect/Deferred"
import { chmod, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { prepareResidentDirectory, verifyRemovableSocket } from "@hapsland/resident-transport/resident/paths"
import { MAX_IPC_CONNECTIONS } from "@hapsland/resident-transport/resident/protocol"
import { Exit, Scope } from "effect"
import * as Fiber from "effect/Fiber"
import * as FiberHandle from "effect/FiberHandle"
import * as Schedule from "effect/Schedule"
import { ResidentAdapterError, residentAdapter } from "../adapter-error.ts"
import { RESIDENT_IDLE_CHECK_MS, VIRTUAL_ROUND_QUIET_CHECK_MS } from "./timing.ts"

type LifecycleResources = {
  readonly paths: ResidentPaths
  readonly lifetime: string
  readonly closed: Deferred.Deferred<void>
  readonly residentLedger: ResidentLedger
  readonly residentRuntimeScope: Scope.Scope
  readonly residentIpcScope: Scope.Closeable
  readonly residentDispatchScope: Scope.Closeable
  readonly residentControlScope: Scope.Closeable
  readonly residentStopExpiries: Map<string, Fiber.Fiber<void>>
  readonly residentIdleChecks: FiberHandle.FiberHandle<void, never>
  readonly residentQuietChecks: FiberHandle.FiberHandle<void, never>
  readonly residentLifetimeController: AbortController
  readonly residentNow: () => number
  readonly residentNotices: ReturnType<ResidentLedger["notices"]>
  readonly residentReuse: ReturnType<ResidentLedger["reuse"]>
}
type LifecycleWorkflows = {
  readonly admission: {
    readonly residentRoundSnapshot: (
      round: RoundWork
    ) => Effect.Effect<{ readonly work: { readonly controller: AbortController } }>
  }
  readonly workLifecycle: {
    readonly sweepQuietRounds: (now: number) => Effect.Effect<number>
    readonly residentReleaseReuseClaim: (key: string) => Effect.Effect<void>
    readonly residentReleaseUnit: (job: UnitJob) => Effect.Effect<void>
    readonly residentRemoveAdvice: (
      id: string,
      token?: string,
      retirement?: { readonly fate: "discarded"; readonly reason: "resident-disposed" }
    ) => Effect.Effect<boolean>
    readonly residentReleaseNoticeCooldown: (key: string) => Effect.Effect<void>
  }
  readonly ipc: {
    readonly residentAccept: (socket: Socket) => Effect.Effect<void>
    readonly inspectionAccept: (socket: Socket) => Effect.Effect<void>
  }
}
type LifecyclePorts = {
  readonly residentDispatcher: Dispatcher<string, Job>
  readonly cleanup: () => Effect.Effect<"busy" | "cleaned">
  readonly residentAdvice: () => Effect.Effect<readonly Advice[]>
}

export const makeResidentLifecycle = Effect.fn("ResidentRuntime.lifecycle")(function* (
  resources: LifecycleResources,
  workflows: LifecycleWorkflows,
  ports: LifecyclePorts
) {
  const {
    closed,
    residentLedger,
    residentRuntimeScope,
    residentIpcScope,
    residentDispatchScope,
    residentStopExpiries,
    residentIdleChecks,
    residentQuietChecks,
    residentLifetimeController,
    residentNow,
    residentNotices,
    residentControlScope,
    residentReuse
  } = resources
  let residentServer: Server | undefined
  let inspectionServer: Server | undefined
  let inspectionConnections = 0
  let residentOwnsOwnerRecord = false
  const residentScheduleRetirementClose = Effect.fn("ResidentRuntime.scheduleRetirementClose")(function* () {
    if (!(yield* residentLedger.runtime.scheduleRetirement())) return
    // Retirement runs at the process boundary, outside the scope it closes.
    // Keeping the closing fiber in that scope would make it await itself.
    yield* Effect.forkIn(Effect.sleep("10 millis").pipe(Effect.andThen(close)), residentRuntimeScope)
  })
  const residentScheduleIdleCheck = Effect.fn("ResidentRuntime.scheduleIdleCheck")(function* () {
    if ((yield* residentLedger.runtime.snapshot()).lifecycle !== "active") return
    const pass = Effect.gen(function* () {
      if ((yield* residentLedger.runtime.snapshot()).lifecycle !== "active") return true
      if ((yield* residentLedger.runtime.snapshot()).connections === 0 && (yield* ports.cleanup()) === "cleaned") {
        yield* residentScheduleRetirementClose()
        return true
      }
      return false
    })
    yield* FiberHandle.run(
      residentIdleChecks,
      Effect.sleep(RESIDENT_IDLE_CHECK_MS).pipe(
        Effect.andThen(
          pass.pipe(
            Effect.repeat({ schedule: Schedule.spaced(RESIDENT_IDLE_CHECK_MS), until: (retiring) => retiring }),
            Effect.asVoid
          )
        )
      )
    )
  })
  const residentScheduleQuietCheck = Effect.fn("ResidentRuntime.scheduleQuietCheck")(function* () {
    if ((yield* residentLedger.runtime.snapshot()).lifecycle !== "active") return
    const pass = Effect.gen(function* () {
      if ((yield* residentLedger.runtime.snapshot()).lifecycle !== "active") return true
      yield* workflows.workLifecycle.sweepQuietRounds(residentNow())
      return false
    })
    yield* FiberHandle.run(
      residentQuietChecks,
      Effect.sleep(VIRTUAL_ROUND_QUIET_CHECK_MS).pipe(
        Effect.andThen(
          pass.pipe(
            Effect.repeat({ schedule: Schedule.spaced(VIRTUAL_ROUND_QUIET_CHECK_MS), until: (retiring) => retiring }),
            Effect.asVoid
          )
        )
      )
    )
  })
  const listen = Effect.fn("ResidentIpc.listen")(() => {
    const owner = { paths: resources.paths, lifetime: resources.lifetime }
    // Endpoint publication is a bounded acquisition. Signal interruption must
    // wait for binding to settle so its owning finalizer can remove the socket.
    return Effect.uninterruptible(
      Effect.gen(function* () {
        if (process.platform !== "linux" && process.platform !== "darwin") {
          return yield* Effect.fail(new ResidentAdapterError({ operation: "resident IPC requires Linux or macOS" }))
        }
        yield* prepareResidentDirectory(owner.paths).pipe(
          Effect.mapError(() => new ResidentAdapterError({ operation: "prepare resident directory" }))
        )
        // The launcher holds the live-owner directory. A socket pathname alone is
        // never treated as ownership evidence.
        yield* verifyRemovableSocket(owner.paths).pipe(
          Effect.mapError(() => new ResidentAdapterError({ operation: "verify removable socket" }))
        )
        yield* residentAdapter("remove stale socket", () => rm(owner.paths.socket, { force: true }))
        const runSocket = Effect.runForkWith(yield* Effect.context())
        const server = createServer((socket) => {
          if (!server.listening) {
            socket.destroy()
            return
          }
          // This native callback only starts a fiber in the socket owner scope.
          runSocket(Effect.forkIn(workflows.ipc.residentAccept(socket), residentIpcScope, { startImmediately: true }))
        })
        server.maxConnections = MAX_IPC_CONNECTIONS
        yield* Effect.callback<void, ResidentAdapterError>((resume) => {
          server.once("error", () =>
            resume(Effect.fail(new ResidentAdapterError({ operation: "bind resident socket" })))
          )
          server.listen(owner.paths.socket, () => resume(Effect.void))
        })
        residentServer = server
        yield* residentAdapter("secure resident socket", () => chmod(owner.paths.socket, 0o600))
        const inspectionPaths = { ...owner.paths, socket: join(owner.paths.directory, "inspection.sock") }
        yield* verifyRemovableSocket(inspectionPaths).pipe(
          Effect.mapError(() => new ResidentAdapterError({ operation: "verify inspection socket" }))
        )
        yield* residentAdapter("remove stale inspection socket", () => rm(inspectionPaths.socket, { force: true }))
        const readonlyServer = createServer((socket) => {
          if (!readonlyServer.listening || inspectionConnections >= 4) {
            socket.destroy()
            return
          }
          inspectionConnections += 1
          runSocket(Effect.forkIn(workflows.ipc.inspectionAccept(socket), residentIpcScope, { startImmediately: true }))
        })
        readonlyServer.maxConnections = 4
        yield* Effect.callback<void, ResidentAdapterError>((resume) => {
          readonlyServer.once("error", () =>
            resume(Effect.fail(new ResidentAdapterError({ operation: "bind inspection socket" })))
          )
          readonlyServer.listen(inspectionPaths.socket, () => resume(Effect.void))
        })
        inspectionServer = readonlyServer
        yield* residentAdapter("secure inspection socket", () => chmod(inspectionPaths.socket, 0o600))
        residentOwnsOwnerRecord = true
        yield* residentAdapter("publish resident endpoint", () =>
          writeFile(owner.paths.owner, `${JSON.stringify({ pid: process.pid, lifetime: owner.lifetime })}\n`, {
            encoding: "utf8",
            mode: 0o600
          })
        )
        yield* residentScheduleIdleCheck()
        yield* residentScheduleQuietCheck()
      })
    )
  })
  const beginServerClose = Effect.fn("ResidentRuntime.beginServerClose")(function* (server: Server | undefined) {
    if (server === undefined) return undefined
    return yield* Effect.forkChild(
      Effect.callback<void>((resume) => {
        server.close(() => resume(Effect.void))
      }),
      { startImmediately: true }
    )
  })
  const residentDispose = Effect.fn("ResidentRuntime.close")(() => {
    const owner = { paths: resources.paths, lifetime: resources.lifetime }
    return Effect.uninterruptible(
      Effect.gen(function* () {
        yield* residentLedger.runtime.close()
        residentLifetimeController.abort()
        yield* FiberHandle.clear(residentIdleChecks)
        yield* FiberHandle.clear(residentQuietChecks)
        yield* Fiber.interruptAll(residentStopExpiries.values())
        residentStopExpiries.clear()
        for (const [, round] of yield* residentLedger.rounds.entries()) {
          round.controller.abort()
          ;(yield* workflows.admission.residentRoundSnapshot(round)).work.controller.abort()
        }
        const closeDispatchedJobs = Effect.fn("ResidentRuntime.closeDispatchedJobs")(function* () {
          for (const job of yield* ports.residentDispatcher.close()) {
            if (job.kind === "unit") {
              yield* workflows.workLifecycle.residentReleaseReuseClaim(job.evaluationKey)
              yield* workflows.workLifecycle.residentReleaseUnit(job)
            } else yield* residentLedger.release(job.reservation)
          }
        })
        yield* closeDispatchedJobs()
        const retirePendingOnClose = Effect.fn("ResidentRuntime.retirePendingOnClose")(function* () {
          for (const advice of yield* ports.residentAdvice())
            yield* workflows.workLifecycle.residentRemoveAdvice(advice.id, undefined, {
              fate: "discarded",
              reason: "resident-disposed"
            })
          for (const key of [...(yield* residentNotices.entries()).map(([key]) => key)])
            yield* workflows.workLifecycle.residentReleaseNoticeCooldown(key)
        })
        yield* retirePendingOnClose()
        // Running work may be interrupted by process exit or finish later. Clear
        // its logical ownership after native effects settle. Issued Jev permits
        // remain reserved through an interruption attempt.
        yield* residentReuse.clear()
        yield* ports.residentDispatcher.whenIdle()
        yield* Scope.close(residentDispatchScope, Exit.void)
        yield* Scope.close(residentControlScope, Exit.void)
        const server = residentServer
        const endpointClosed = yield* beginServerClose(server)
        const readonlyServer = inspectionServer
        const inspectionClosed = yield* beginServerClose(readonlyServer)
        yield* Scope.close(residentIpcScope, Exit.void)
        if (inspectionClosed !== undefined) yield* Fiber.join(inspectionClosed)
        if (readonlyServer !== undefined) {
          inspectionServer = undefined
          yield* residentAdapter("remove owned inspection socket", () =>
            rm(join(owner.paths.directory, "inspection.sock"), { force: true })
          )
        }
        if (endpointClosed !== undefined) yield* Fiber.join(endpointClosed)
        yield* residentLedger.clear()
        if (server !== undefined) {
          residentServer = undefined
          yield* residentAdapter("remove owned socket", () => rm(owner.paths.socket, { force: true }))
        }
        if (residentOwnsOwnerRecord) {
          residentOwnsOwnerRecord = false
          yield* residentAdapter("remove owned endpoint record", () => rm(owner.paths.owner, { force: true }))
        }
      })
    )
  })
  const disposeOnce = yield* Effect.cached(Effect.suspend(() => residentDispose()))
  const close = disposeOnce.pipe(Effect.tap(() => Deferred.succeed(closed, undefined)))
  return {
    listen,
    close,
    residentScheduleRetirementClose,
    residentScheduleIdleCheck,
    releaseInspectionConnection: () => {
      inspectionConnections -= 1
    }
  }
})
