import * as Redacted from "effect/Redacted"
import { resolveCredentialInput } from "@hapsland/runtime-inputs/credentials/input"
import type { CodexDirectEventOutput } from "@hapsland/delivery-output/direct-event/output"
import { packageCommand } from "@hapsland/runtime-environment/runtime/package-runtime"
import { effectiveSessionAnalytics } from "@hapsland/runtime-inputs/configuration/resolve"
import type { RoundCloseReason } from "@hapsland/activity-observation/activity/status"
import { spawn, type ChildProcess } from "node:child_process"
import * as Effect from "effect/Effect"
import * as Cause from "effect/Cause"
import * as Clock from "effect/Clock"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import { Socket } from "node:net"
import { resolve } from "node:path"
import { closeSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import type { DirectObservation, DirectAdvicee } from "@hapsland/native-observation/direct-event/observation"

import { ReviewConfigError } from "@hapsland/runtime-inputs/runtime/review-settings-error"
import { loadConfiguration } from "@hapsland/runtime-inputs/configuration/load"
import {
  type ResidentControlledOptions,
  CLIENT_REQUEST_DEADLINE_MS,
  EDIT_REQUEST_DEADLINE_MS,
  MAX_IPC_FRAME_BYTES,
  STARTUP_READINESS_DEADLINE_MS,
  decodeCurrentResidentResponse,
  encodeCurrentResidentRequest,
  type ResidentEditPolicy,
  type ResidentDispatchContext,
  type ResidentRequest,
  type ResidentResponse,
  type CollectionMode
} from "./protocol.ts"
import { DEFAULT_CREDENTIAL_STATE_PATH, readCredentialState } from "@hapsland/runtime-inputs/credentials/state"
import type { ClaudeHostOutput } from "@hapsland/delivery-output/direct-event/claude-output"
import {
  prepareResidentDirectory,
  resolveResidentPaths,
  verifyResidentSocket,
  type ResidentPaths,
  type ResidentEndpointError
} from "./paths.ts"

const monotonicMillis = Clock.monotonicTimeNanos.pipe(Effect.map((now) => Number(now) / 1_000_000))

export class ResidentIpcError extends Schema.TaggedError<ResidentIpcError>()("ResidentIpcError", {
  message: Schema.String
}) {}

const requestConnected = Effect.fn("ResidentClient.requestConnected")(function* (
  paths: ResidentPaths,
  request: ResidentRequest,
  timeoutMs: number
) {
  const frame = `${encodeCurrentResidentRequest(request)}\n`
  if (Buffer.byteLength(frame, "utf8") > MAX_IPC_FRAME_BYTES) {
    return yield* Effect.fail(new ResidentIpcError({ message: "resident request exceeded frame bound" }))
  }
  return yield* Effect.acquireUseRelease(
    Effect.try({ try: () => new Socket(), catch: () => new ResidentIpcError({ message: "resident IPC unavailable" }) }),
    (socket) =>
      Effect.callback<ResidentResponse, ResidentIpcError>((resume) => {
        let settled = false
        let bytes = 0
        let encoded = ""
        const finish = (result: Effect.Effect<ResidentResponse, ResidentIpcError>) => {
          if (settled) return
          settled = true
          resume(result)
        }
        socket.once("connect", () => socket.write(frame))
        socket.on("data", (chunk: Buffer) => {
          bytes += chunk.byteLength
          if (bytes > MAX_IPC_FRAME_BYTES) {
            finish(Effect.fail(new ResidentIpcError({ message: "resident response exceeded frame bound" })))
            return
          }
          encoded += chunk.toString("utf8")
          const newline = encoded.indexOf("\n")
          if (newline < 0) return
          try {
            const unknown: unknown = JSON.parse(encoded.slice(0, newline))
            const decoded = decodeCurrentResidentResponse(unknown, request)
            if (decoded === undefined) throw new Error("response schema mismatch")
            finish(Effect.succeed(decoded))
          } catch {
            finish(Effect.fail(new ResidentIpcError({ message: "resident response was invalid" })))
          }
        })
        socket.once("error", () => finish(Effect.fail(new ResidentIpcError({ message: "resident IPC unavailable" }))))
        socket.once("close", () =>
          finish(Effect.fail(new ResidentIpcError({ message: "resident response closed before acknowledgement" })))
        )
        // Connect only after the callback owns every event. The acquisition
        // can yield before this callback, so an already-connecting socket can
        // emit its one-shot connect event before our frame writer is attached.
        try {
          socket.connect(paths.socket)
        } catch {
          finish(Effect.fail(new ResidentIpcError({ message: "resident IPC unavailable" })))
        }
        return Effect.sync(() => {
          settled = true
        })
      }).pipe(
        Effect.timeoutOrElse({
          duration: timeoutMs,
          orElse: () =>
            Effect.fail(new ResidentIpcError({ message: "resident request deadline exceeded; outcome is uncertain" }))
        })
      ),
    (socket) =>
      Effect.sync(() => {
        socket.destroy()
      })
  )
})

export const residentRequestEffect = Effect.fn("ResidentClient.request")(function* (
  paths: ResidentPaths,
  request: ResidentRequest,
  timeoutMs = CLIENT_REQUEST_DEADLINE_MS
) {
  const deadline = (yield* monotonicMillis) + timeoutMs
  yield* verifyResidentSocket(paths).pipe(
    Effect.timeoutOrElse({
      duration: timeoutMs,
      orElse: () => Effect.fail(new ResidentIpcError({ message: "resident endpoint verification timed out" }))
    })
  )
  const remaining = deadline - (yield* monotonicMillis)
  if (remaining <= 0) return yield* Effect.fail(new ResidentIpcError({ message: "resident request deadline exceeded" }))
  return yield* requestConnected(paths, request, remaining)
})

export interface ResidentStartupOperations {
  readonly now: Effect.Effect<number>
  readonly prepare: (paths: ResidentPaths, timeoutMs: number) => Effect.Effect<void, ResidentEndpointError>
  readonly probe: (
    paths: ResidentPaths,
    timeoutMs: number
  ) => Effect.Effect<ResidentResponse, ResidentIpcError | ResidentEndpointError>
  readonly launch: (paths: ResidentPaths, timeoutMs: number) => Effect.Effect<void, ResidentIpcError>
  readonly wait: (milliseconds: number) => Effect.Effect<void>
  readonly clearDiagnostic: (paths: ResidentPaths) => Effect.Effect<void, ResidentIpcError>
  readonly diagnostic: (paths: ResidentPaths) => Effect.Effect<string>
}
export class ResidentStartup extends Context.Service<ResidentStartup, ResidentStartupOperations>()(
  "hapsland/ResidentStartup"
) {}

export class ResidentLauncher extends Context.Service<
  ResidentLauncher,
  {
    readonly now: Effect.Effect<number>
    readonly spawn: (paths: ResidentPaths) => Effect.Effect<void, ResidentIpcError>
  }
>()("hapsland/ResidentLauncher") {}

const residentLauncherLayer = Layer.sync(ResidentLauncher, () => {
  // A startup pass may retry while its detached child is still booting. Keep
  // that native launch unique until physical close; readiness remains a probe.
  const children = new Map<string, ChildProcess>()
  return ResidentLauncher.of({
    now: monotonicMillis,
    spawn: Effect.fn("ResidentLauncher.spawn")(function* (paths: ResidentPaths) {
      if (children.has(paths.lock)) return
      const command = packageCommand("resident")
      const diagnostic = `${paths.lock}.startup-error`
      return yield* Effect.acquireUseRelease(
        Effect.try({
          try: () => openSync(diagnostic, "a", 0o600),
          catch: () => new ResidentIpcError({ message: "resident launch failed" })
        }),
        (descriptor) =>
          Effect.callback<void, ResidentIpcError>((resume) => {
            let child: ReturnType<typeof spawn>
            try {
              child = spawn(command.executable, [...command.args, paths.directory], {
                detached: true,
                stdio: ["ignore", "ignore", descriptor],
                env: process.env
              })
            } catch {
              resume(Effect.fail(new ResidentIpcError({ message: "resident launch failed" })))
              return
            }
            children.set(paths.lock, child)
            const release = () => {
              if (children.get(paths.lock) === child) children.delete(paths.lock)
            }
            child.once("close", release)
            const started = () => {
              child.unref()
              resume(Effect.void)
            }
            const failed = (cause: Error) => {
              release()
              try {
                writeFileSync(diagnostic, `${String(cause)}\n`, { flag: "a", mode: 0o600 })
              } catch {
                /* launch failure remains visible */
              }
              resume(Effect.fail(new ResidentIpcError({ message: "resident launch failed" })))
            }
            child.once("spawn", started)
            child.once("error", failed)
            return Effect.sync(() => {
              child.removeListener("spawn", started)
              child.removeListener("error", failed)
            })
          }),
        (descriptor) => Effect.sync(() => closeSync(descriptor))
      )
    }, Effect.uninterruptible)
  })
})

export const makeResidentStartup = Effect.gen(function* () {
  const launcher = yield* ResidentLauncher
  const launches = yield* Ref.make<ReadonlyMap<string, { readonly expiry: number }>>(new Map())
  const launch = Effect.fn("ResidentStartup.launch")(function* (paths: ResidentPaths, _timeoutMs: number) {
    const now = yield* launcher.now
    const claim = yield* Ref.modify(launches, (current) => {
      const next = new Map([...current].filter(([, value]) => value.expiry > now))
      if (next.has(paths.lock)) return [undefined, next] as const
      const claim = Object.freeze({ expiry: now + 2_000 })
      next.set(paths.lock, claim)
      return [claim, next] as const
    })
    if (claim === undefined) return
    yield* launcher.spawn(paths).pipe(
      Effect.onError(() =>
        Ref.update(launches, (current) => {
          if (current.get(paths.lock) !== claim) return current
          const next = new Map(current)
          next.delete(paths.lock)
          return next
        })
      )
    )
  }, Effect.uninterruptible)
  return ResidentStartup.of({
    now: launcher.now,
    prepare: Effect.fn("ResidentStartup.prepare")((paths: ResidentPaths) => prepareResidentDirectory(paths)),
    probe: Effect.fn("ResidentStartup.probe")((paths: ResidentPaths, timeoutMs: number) =>
      residentRequestEffect(paths, { requestRoute: "shared", operation: "hello" }, timeoutMs)
    ),
    launch,
    wait: Effect.fn("ResidentStartup.wait")((milliseconds: number) => Effect.sleep(milliseconds)),
    clearDiagnostic: Effect.fn("ResidentStartup.clearDiagnostic")((paths: ResidentPaths) =>
      Effect.try({
        try: () => rmSync(`${paths.lock}.startup-error`, { force: true }),
        catch: () => new ResidentIpcError({ message: "resident startup diagnostic cleanup failed" })
      })
    ),
    diagnostic: Effect.fn("ResidentStartup.diagnostic")((paths: ResidentPaths) =>
      Effect.sync(() => {
        try {
          return readFileSync(`${paths.lock}.startup-error`, "utf8").trim().slice(-1_024)
        } catch {
          return ""
        }
      })
    )
  })
}).pipe(Effect.withSpan("ResidentStartup.make"))

export const residentStartupLayer = Layer.effect(ResidentStartup, makeResidentStartup).pipe(
  Layer.provide(residentLauncherLayer)
)

export const ensureResidentEffect = Effect.fn("ResidentClient.ensureResident")(function* (
  paths: ResidentPaths | undefined = undefined,
  readinessMs = STARTUP_READINESS_DEADLINE_MS
) {
  paths ??= yield* resolveResidentPaths()
  const dependencies = yield* ResidentStartup
  const ready = (response: Extract<ResidentResponse, { status: "ready" }>) =>
    dependencies.clearDiagnostic(paths).pipe(Effect.as(response))
  const deadline = (yield* dependencies.now) + readinessMs
  const remaining = dependencies.now.pipe(Effect.map((now) => Math.max(0, deadline - now)))
  yield* dependencies
    .prepare(paths, yield* remaining)
    .pipe(
      Effect.timeoutOrElse({
        duration: yield* remaining,
        orElse: () => Effect.fail(new ResidentIpcError({ message: "resident endpoint preparation timed out" }))
      })
    )
  if ((yield* remaining) <= 0)
    return yield* Effect.fail(new ResidentIpcError({ message: "resident readiness deadline exceeded" }))
  const probe = (timeoutMs: number) =>
    dependencies.probe(paths, timeoutMs).pipe(Effect.catch(() => Effect.succeed(undefined)))
  // Failed probes do not determine death; atomic owner acquisition protects
  // contending servers and stale recovery checks process liveness.
  const existing = yield* probe(Math.min(250, yield* remaining))
  if (existing?.status === "ready") return yield* ready(existing)
  type Ready = Extract<ResidentResponse, { status: "ready" }>
  let lastLaunch = Number.NEGATIVE_INFINITY
  const readinessPass = Effect.fn("ResidentClient.readinessPass")(function* () {
    if ((yield* remaining) <= 0) return undefined
    if ((yield* dependencies.now) - lastLaunch >= 500) {
      yield* dependencies.launch(paths, yield* remaining)
      lastLaunch = yield* dependencies.now
    }
    if ((yield* remaining) <= 0) return undefined
    const response = yield* probe(Math.min(250, yield* remaining))
    return response?.status === "ready" ? response : undefined
  })
  const readinessSchedule = Schedule.fromStep(
    Effect.succeed((_now: number, response: Ready | undefined) =>
      Effect.gen(function* () {
        if (response !== undefined) return yield* Cause.done(response)
        const backoff = Math.min(50, yield* remaining)
        if (backoff <= 0) return yield* Cause.done(undefined)
        yield* dependencies.wait(backoff)
        if ((yield* remaining) <= 0) return yield* Cause.done(undefined)
        return [undefined, Duration.zero] as [Ready | undefined, Duration.Duration]
      })
    )
  )
  const response = yield* readinessPass().pipe(Effect.repeat(readinessSchedule))
  if (response !== undefined) return yield* ready(response)
  const diagnostic = yield* dependencies.diagnostic(paths)
  const detail = diagnostic.length > 0 ? `; resident launch failed: ${diagnostic}` : ""
  return yield* Effect.fail(
    new ResidentIpcError({ message: `resident did not become ready within 10 seconds${detail}` })
  )
})

/** Read-only bounded probe. Unlike ensureResident, this never launches or repairs a resident. */
export const inspectResidentEffect = Effect.fn("ResidentClient.inspectResident")(function* (
  paths: ResidentPaths | undefined = undefined
): Effect.fn.Return<
  { readonly available: boolean; readonly lifetime?: string; readonly pid?: number },
  ResidentIpcError | ResidentEndpointError
> {
  paths ??= yield* resolveResidentPaths()
  const response = yield* residentRequestEffect(
    paths,
    { requestRoute: "shared", operation: "hello" },
    Math.min(250, CLIENT_REQUEST_DEADLINE_MS)
  ).pipe(Effect.catch(() => Effect.succeed(undefined)))
  return response?.status === "ready"
    ? { available: true, lifetime: response.lifetime, pid: response.pid }
    : { available: false }
})

const controlledAnswers = (options: ResidentControlledOptions) => ({
  ...(options.answers === undefined ? {} : { answers: options.answers }),
  ...(options.delayMs === undefined ? {} : { delayMs: options.delayMs }),
  ...(options.failure === undefined ? {} : { failure: options.failure })
})
const controlledSourceOutcomes = (options: ResidentControlledOptions) => ({
  ...(options.failureOnSourceIncludes === undefined
    ? {}
    : { failureOnSourceIncludes: options.failureOnSourceIncludes }),
  ...(options.findingOnSourceIncludes === undefined
    ? {}
    : { findingOnSourceIncludes: options.findingOnSourceIncludes }),
  ...(options.syntheticR6BrandedRepair === undefined
    ? {}
    : { syntheticR6BrandedRepair: options.syntheticR6BrandedRepair })
})
const controlledTranscripts = (options: ResidentControlledOptions) => ({
  ...(options.capturePath === undefined ? {} : { capturePath: options.capturePath }),
  ...(options.requestSummaryPath === undefined ? {} : { requestSummaryPath: options.requestSummaryPath }),
  ...(options.outcomePath === undefined ? {} : { outcomePath: options.outcomePath })
})
const controlledCredentials = (options: ResidentControlledOptions) =>
  options.requireCredential === undefined ? {} : { requireCredential: options.requireCredential }
const controlledDispatchOptions = (options: ResidentControlledOptions | undefined) =>
  options === undefined
    ? null
    : {
        ...controlledAnswers(options),
        ...controlledSourceOutcomes(options),
        ...controlledTranscripts(options),
        ...controlledCredentials(options)
      }
const userConfigurationOptions = (path: string | undefined) => (path === undefined ? {} : { userConfigPath: path })
const nullableResolvedPath = (path: string | undefined) => (path === undefined ? null : resolve(path))
const dispatchUsesCredential = (controlled: ReturnType<typeof controlledDispatchOptions>) =>
  controlled === null || controlled.requireCredential === true

export const readComposedEditPolicyEffect = Effect.fn("ResidentClient.readComposedEditPolicy")(function* (
  root: string,
  advicee: DirectAdvicee,
  paths: ResidentPaths | undefined = undefined,
  targetPaths?: ReadonlyArray<string>,
  onRefusal?: (outcome: "skipped-other-root" | "unavailable") => void
) {
  paths ??= yield* resolveResidentPaths()
  const owner = yield* inspectResidentEffect(paths)
  const lifetime = inspectedLifetime(owner)
  if (lifetime === undefined) return undefined
  const response = yield* residentRequestEffect(
    paths,
    {
      requestRoute: "shared",
      operation: "edit-policy",
      lifetime,
      root,
      advicee,
      ...(targetPaths === undefined ? {} : { targetPaths })
    },
    250
  )
  if (response.status === "edit-policy") return response.policy
  onRefusal?.(response.status === "skipped-other-root" ? "skipped-other-root" : "unavailable")
  return undefined
})

export const makeResidentDispatchContextEffect = Effect.fn("ResidentClient.makeResidentDispatchContext")(function* (
  root: string,
  statePath: string,
  activityPath: string,
  userConfigPath: string | undefined,
  controlledOptions: ResidentControlledOptions | undefined,
  editPolicy?: ResidentEditPolicy
): Effect.fn.Return<ResidentDispatchContext, ResidentIpcError | ReviewConfigError> {
  const capture =
    editPolicy === undefined
      ? yield* loadConfiguration(root, userConfigurationOptions(userConfigPath)).pipe(
          Effect.mapError(
            (error) => new ReviewConfigError({ source: error.source, field: error.field, reason: error.reason })
          )
        )
      : undefined
  const credentialEnvVar = editPolicy?.credentialEnvVar ?? capture!.policy.credentialEnvVar.value
  const sessionAnalytics = editPolicy?.sessionAnalytics ?? effectiveSessionAnalytics(capture!.policy)
  const controlled = controlledDispatchOptions(controlledOptions)
  const configuration = yield* Config.all({
    credentialStatePath: Config.NonEmptyString("REVIEW_CREDENTIAL_STATE_PATH").pipe(
      Config.withDefault(DEFAULT_CREDENTIAL_STATE_PATH)
    ),
    demoBudgetPath: Config.option(Config.NonEmptyString("REVIEW_DEMO_BUDGET_PATH"))
  }).pipe(Effect.mapError(() => new ResidentIpcError({ message: "resident dispatch configuration unavailable" })))
  const credentialInput = !dispatchUsesCredential(controlled)
    ? undefined
    : yield* resolveCredentialInput({ envVar: credentialEnvVar, root }).pipe(
        Effect.mapError(() => new ResidentIpcError({ message: "resident credential input unavailable" }))
      )
  const credentialStatePath = resolve(configuration.credentialStatePath)
  const credentialState = yield* Effect.try({
    try: () => readCredentialState(credentialStatePath),
    catch: () => new ResidentIpcError({ message: "resident credential metadata unavailable" })
  })
  return {
    statePath: resolve(statePath),
    activityPath: resolve(activityPath),
    sessionAnalytics,
    userConfigPath: nullableResolvedPath(userConfigPath),
    demoBudgetPath: nullableResolvedPath(Option.getOrUndefined(configuration.demoBudgetPath)),
    credential: !dispatchUsesCredential(controlled)
      ? null
      : {
          name: credentialEnvVar,
          environmentValue: credentialInput?.value === undefined ? null : Redacted.value(credentialInput.value),
          generation: credentialState.generation,
          statePath: credentialStatePath
        },
    controlled
  }
})

export type CollectedAdvice = {
  readonly output: ClaudeHostOutput
  readonly token: string
  readonly lifetime: string
  readonly paths: ResidentPaths
  readonly root: string
  readonly advicee: DirectAdvicee
  readonly activityPath: string | undefined
  readonly findingCount: number
}

export const admitObservationEffect = Effect.fn("ResidentClient.admitObservation")(function* (
  observation: DirectObservation,
  controlledWriter: boolean,
  dispatch: ResidentDispatchContext,
  paths: ResidentPaths | undefined = undefined,
  composed = true
) {
  paths ??= yield* resolveResidentPaths()
  if (!composed) return { status: "unsupported" } as const
  const owner = yield* ensureResidentEffect(paths)
  if (!controlledWriter) return { status: "empty" } as const
  return yield* residentRequestEffect(paths, {
    requestRoute: "shared",
    operation: "admit",
    lifetime: owner.lifetime,
    observation,
    controlledWriter: true,
    composed: true,
    dispatch
  })
})

export type CollectionOutcome =
  | { readonly status: "advice"; readonly advice: CollectedAdvice }
  | { readonly status: "pending" | "empty" }
  | {
      readonly status: "unavailable"
      readonly reason: "backend" | "credential" | "capacity" | "stale" | "lost" | "expired"
    }

type EditResponse = Extract<ResidentResponse, { readonly requestRoute: "edit" }>
const editResponse = (response: ResidentResponse | undefined): EditResponse | undefined =>
  response !== undefined && "requestRoute" in response && response.requestRoute === "edit" ? response : undefined
const editNonAdviceStatuses = {
  pending: "pending",
  empty: "empty",
  unavailable: "unavailable",
  "rejected-capacity": "unavailable",
  "rejected-stale": "unavailable",
  "skipped-other-root": "empty",
  "obsolete-lifetime": "unavailable",
  unsupported: "unavailable"
} as const
const editNonAdviceOutcome = (response: Exclude<EditResponse, { readonly status: "advice" }>): CollectionOutcome => {
  if (response.status === "unavailable") return response
  const status = editNonAdviceStatuses[response.status]
  return status === "unavailable" ? { status, reason: "lost" } : { status }
}
const editCollectionOutcome = (
  response: EditResponse | undefined,
  owner: { readonly lifetime: string },
  paths: ResidentPaths,
  observation: DirectObservation,
  dispatch: ResidentDispatchContext
): CollectionOutcome => {
  if (response === undefined) return { status: "unavailable", reason: "lost" }
  if (response.status !== "advice") return editNonAdviceOutcome(response)
  return {
    status: "advice",
    advice: {
      output: response.output,
      token: response.token,
      lifetime: owner.lifetime,
      paths,
      root: observation.root,
      advicee: observation.advicee,
      activityPath: dispatch.activityPath,
      findingCount: response.findingCount
    }
  }
}
type SharedAdviceResponse = Exclude<
  Extract<ResidentResponse, { readonly status: "advice" }>,
  { readonly requestRoute: "edit" }
>
const sharedAdviceResponse = (response: ResidentResponse): response is SharedAdviceResponse =>
  response.status === "advice" && !("requestRoute" in response)
const collectedSharedAdvice = (
  response: SharedAdviceResponse,
  lifetime: string,
  paths: ResidentPaths,
  root: string,
  advicee: DirectAdvicee,
  dispatch: ResidentDispatchContext
) => ({
  output: response.output,
  token: response.token,
  lifetime,
  paths,
  root,
  advicee,
  activityPath: dispatch.activityPath,
  findingCount: response.findingCount
})
const inspectedLifetime = (owner: { readonly available: boolean; readonly lifetime?: string }): string | undefined =>
  owner.available ? owner.lifetime : undefined
const collectionFinish = (finish: { readonly token: string; readonly deadlineReached: boolean } | undefined) =>
  finish === undefined ? {} : { finish }
const pendingOrEmpty = (response: ResidentResponse): { readonly status: "pending" | "empty" } => ({
  status: response.status === "pending" ? "pending" : "empty"
})
const promptDigestFields = (promptDigest: string | undefined) => (promptDigest === undefined ? {} : { promptDigest })
const promptOnlyIfMissing = (onlyIfMissing: true | undefined) =>
  onlyIfMissing === true ? { onlyIfMissing: true as const } : {}

/** One bounded response attempt, tied to its originating resident lifetime. */
export const admitAndCollectEffect = Effect.fn("ResidentClient.admitAndCollect")(function* (
  observation: DirectObservation,
  dispatch: ResidentDispatchContext,
  deadlineAt: number,
  paths: ResidentPaths | undefined = undefined
): Effect.fn.Return<CollectionOutcome, ResidentIpcError | ResidentEndpointError, ResidentStartup> {
  if (observation.advicee.host !== "claude-code") return { status: "unavailable", reason: "lost" }
  paths ??= yield* resolveResidentPaths()
  const owner = yield* ensureResidentEffect(
    paths,
    Math.min(STARTUP_READINESS_DEADLINE_MS, Math.max(1, deadlineAt - (yield* monotonicMillis)))
  )
  const timeoutMs = Math.min(EDIT_REQUEST_DEADLINE_MS, deadlineAt - (yield* monotonicMillis))
  if (timeoutMs <= 150) return { status: "unavailable", reason: "expired" }
  const response = yield* residentRequestEffect(
    paths,
    {
      requestRoute: "edit",
      operation: "admit-and-collect",
      lifetime: owner.lifetime,
      observation,
      controlledWriter: true,
      composed: true,
      dispatch,
      waitMs: Math.max(0, Math.floor(timeoutMs - 150))
    },
    timeoutMs
  ).pipe(Effect.catch(() => Effect.succeed(undefined)))
  return editCollectionOutcome(editResponse(response), owner, paths, observation, dispatch)
})

export const collectReadyEffect = Effect.fn("ResidentClient.collectReady")(function* (
  root: string,
  advicee: DirectAdvicee,
  dispatch: ResidentDispatchContext,
  paths: ResidentPaths | undefined = undefined,
  mode: CollectionMode = "ordinary"
): Effect.fn.Return<
  (CollectedAdvice & { readonly output: CodexDirectEventOutput }) | undefined,
  ResidentIpcError | ResidentEndpointError,
  ResidentStartup
> {
  paths ??= yield* resolveResidentPaths()
  const owner = yield* ensureResidentEffect(paths)
  const response = yield* residentRequestEffect(paths, {
    requestRoute: "shared",
    operation: "collect",
    lifetime: owner.lifetime,
    root,
    advicee,
    dispatch,
    mode,
    composed: true
  })
  return sharedAdviceResponse(response)
    ? collectedSharedAdvice(response, owner.lifetime, paths, root, advicee, dispatch)
    : undefined
})

export type AdviceeCollectionOutcome =
  | { readonly status: "advice"; readonly advice: CollectedAdvice & { readonly output: CodexDirectEventOutput } }
  | { readonly status: "pending" | "empty" }

/** Shared background/Stop collection probe for any supported host advicee. */
export const collectAdviceeOutcomeEffect = Effect.fn("ResidentClient.collectAdviceeOutcome")(function* (
  root: string,
  advicee: DirectAdvicee,
  dispatch: ResidentDispatchContext,
  paths: ResidentPaths | undefined = undefined,
  mode: CollectionMode = "ordinary",
  deadlineAt = Number.POSITIVE_INFINITY,
  finish?: { readonly token: string; readonly deadlineReached: boolean }
): Effect.fn.Return<AdviceeCollectionOutcome, ResidentIpcError | ResidentEndpointError> {
  paths ??= yield* resolveResidentPaths()
  const owner = yield* inspectResidentEffect(paths)
  const lifetime = inspectedLifetime(owner)
  if (lifetime === undefined) return { status: "empty" }
  const remaining = deadlineAt - (yield* monotonicMillis) - 100
  if (remaining <= 0) return { status: "empty" }
  const response = yield* residentRequestEffect(
    paths,
    {
      requestRoute: "shared",
      operation: "collect",
      lifetime,
      root,
      advicee,
      dispatch,
      mode,
      reportWorkState: true,
      composed: true,
      ...collectionFinish(finish)
    },
    Math.min(CLIENT_REQUEST_DEADLINE_MS, remaining)
  )
  if (sharedAdviceResponse(response))
    return { status: "advice", advice: collectedSharedAdvice(response, lifetime, paths, root, advicee, dispatch) }
  return pendingOrEmpty(response)
})

/** Read an existing resident's pin without starting work or extending its lifetime. */
export const resolveComposedRootEffect = Effect.fn("ResidentClient.resolveComposedRoot")(function* (
  root: string,
  advicee: DirectAdvicee,
  paths: ResidentPaths
) {
  const owner = yield* inspectResidentEffect(paths)
  if (owner.lifetime === undefined) return root
  const response = yield* residentRequestEffect(
    paths,
    { requestRoute: "shared", operation: "recipient-root", lifetime: owner.lifetime, root, advicee },
    250
  )
  return response.status === "recipient-root" ? (response.root ?? root) : root
})

export const markComposedUserPromptEffect = Effect.fn("ResidentClient.markComposedUserPrompt")(function* (
  root: string,
  advicee: DirectAdvicee,
  marker: string,
  paths: ResidentPaths | undefined = undefined,
  promptDigest?: string,
  onlyIfMissing?: true
): Effect.fn.Return<boolean, ResidentIpcError | ResidentEndpointError, ResidentStartup> {
  paths ??= yield* resolveResidentPaths()
  const owner = yield* ensureResidentEffect(paths, 1_500)
  const response = yield* residentRequestEffect(paths, {
    requestRoute: "shared",
    operation: "prompt-marker",
    lifetime: owner.lifetime,
    root,
    advicee,
    marker,
    ...promptDigestFields(promptDigest),
    ...promptOnlyIfMissing(onlyIfMissing)
  })
  return response.status === "advanced"
})

export const claimComposedBackgroundEffect = Effect.fn("ResidentClient.claimComposedBackground")(function* (
  root: string,
  advicee: DirectAdvicee,
  token: string,
  paths: ResidentPaths | undefined = undefined
): Effect.fn.Return<boolean, ResidentIpcError | ResidentEndpointError, ResidentStartup> {
  paths ??= yield* resolveResidentPaths()
  const owner = yield* ensureResidentEffect(paths, 1_500)
  const response = yield* residentRequestEffect(paths, {
    requestRoute: "shared",
    operation: "claim-background",
    lifetime: owner.lifetime,
    root,
    advicee,
    token
  })
  return response.status === "background-claimed"
})

export const releaseComposedBackgroundEffect = Effect.fn("ResidentClient.releaseComposedBackground")(function* (
  root: string,
  advicee: DirectAdvicee,
  token: string,
  paths: ResidentPaths | undefined = undefined
): Effect.fn.Return<boolean, ResidentIpcError | ResidentEndpointError> {
  paths ??= yield* resolveResidentPaths()
  const owner = yield* inspectResidentEffect(paths)
  const lifetime = inspectedLifetime(owner)
  if (lifetime === undefined) return false
  const response = yield* residentRequestEffect(paths, {
    requestRoute: "shared",
    operation: "release-background",
    lifetime,
    root,
    advicee,
    token
  })
  return response.status === "released"
})

export const beginComposedSubmissionEffect = Effect.fn("ResidentClient.beginComposedSubmission")(function* (
  advice: CollectedAdvice,
  surface: "edit" | "background" | "stop"
): Effect.fn.Return<boolean, ResidentIpcError | ResidentEndpointError> {
  const response = yield* residentRequestEffect(advice.paths, {
    requestRoute: "shared",
    operation: "begin-submission",
    lifetime: advice.lifetime,
    token: advice.token,
    surface
  })
  return response.status === "submitting"
})

export const releaseComposedSubmissionEffect = Effect.fn("ResidentClient.releaseComposedSubmission")(function* (
  advice: CollectedAdvice
): Effect.fn.Return<boolean, ResidentIpcError | ResidentEndpointError> {
  const response = yield* residentRequestEffect(advice.paths, {
    requestRoute: "shared",
    operation: "release",
    lifetime: advice.lifetime,
    token: advice.token
  })
  return response.status === "released"
})

export const acknowledgeAdviceEffect = Effect.fn("ResidentClient.acknowledgeAdvice")(function* (
  advice: CollectedAdvice
) {
  const deadline = (yield* monotonicMillis) + CLIENT_REQUEST_DEADLINE_MS
  const acknowledged = yield* residentRequestEffect(advice.paths, {
    requestRoute: "shared",
    operation: "acknowledge",
    lifetime: advice.lifetime,
    token: advice.token
  }).pipe(Effect.catch(() => Effect.succeed(undefined)))
  if (acknowledged?.status !== "acknowledged") return false

  const remaining = deadline - (yield* monotonicMillis)
  if (remaining <= 0) return false
  const finalized = yield* residentRequestEffect(
    advice.paths,
    { requestRoute: "shared", operation: "finalize", lifetime: advice.lifetime, token: advice.token },
    remaining
  ).pipe(Effect.catch(() => Effect.succeed(undefined)))
  return finalized?.status === "finalized"
})

export const composedStopBoundaryEffect = Effect.fn("ResidentClient.composedStopBoundary")(function* (
  operation: "begin-stop" | "finish-stop",
  root: string,
  advicee: DirectAdvicee,
  token: string,
  close = false,
  paths: ResidentPaths | undefined = undefined,
  reason: RoundCloseReason = "no-advice"
): Effect.fn.Return<boolean, ResidentIpcError | ResidentEndpointError> {
  paths ??= yield* resolveResidentPaths()
  const owner = yield* inspectResidentEffect(paths)
  const lifetime = inspectedLifetime(owner)
  if (lifetime === undefined) return false
  const response = yield* residentRequestEffect(
    paths,
    { requestRoute: "shared", operation, lifetime, root, advicee, token, close, reason },
    250
  )
  return response.status === "advanced"
})

export const retireComposedEditEffect = Effect.fn("ResidentClient.retireComposedEdit")(function* (
  root: string,
  advicee: DirectAdvicee,
  paths: ResidentPaths | undefined = undefined
) {
  paths ??= yield* resolveResidentPaths()
  const owner = yield* inspectResidentEffect(paths)
  const lifetime = inspectedLifetime(owner)
  if (lifetime === undefined) return false
  const response = yield* residentRequestEffect(
    paths,
    { requestRoute: "shared", operation: "retire-edit", lifetime, root, advicee, startedAt: 1 },
    250
  )
  return response.status === "advanced"
})

export const registerComposedEditEffect = Effect.fn("ResidentClient.registerComposedEdit")(function* (
  root: string,
  advicee: DirectAdvicee,
  startedAt: number,
  paths: ResidentPaths | undefined = undefined,
  activityPath?: string,
  userConfigPath?: string
): Effect.fn.Return<boolean, ResidentIpcError | ResidentEndpointError, ResidentStartup> {
  paths ??= yield* resolveResidentPaths()
  const owner = yield* ensureResidentEffect(paths, 1_500)
  const response = yield* residentRequestEffect(paths, {
    requestRoute: "shared",
    operation: "register-edit",
    lifetime: owner.lifetime,
    root,
    advicee,
    startedAt,
    ...(activityPath === undefined ? {} : { activityPath }),
    ...(userConfigPath === undefined ? {} : { userConfigPath })
  })
  return response.status === "advanced"
})

/** Metadata publication bypasses credentials, review capacity, and review rounds. */
export const recordNativeMetadataEffect = Effect.fn("ResidentClient.recordNativeMetadata")(function* (
  metadata: ReadonlyArray<import("@hapsland/native-observation/direct-event/observation").NativeEditMetadata>,
  userConfigPath: string | undefined,
  activityPath: string | undefined,
  paths: ResidentPaths | undefined = undefined
) {
  if (metadata.length === 0) return
  paths ??= yield* resolveResidentPaths()
  const owner = yield* ensureResidentEffect(paths)
  yield* residentRequestEffect(paths, {
    requestRoute: "shared",
    operation: "record-native",
    lifetime: owner.lifetime,
    metadata,
    userConfigPath: nullableResolvedPath(userConfigPath),
    ...(activityPath === undefined ? {} : { activityPath: resolve(activityPath) })
  })
})
