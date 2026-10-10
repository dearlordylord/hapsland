import type { makeResidentResponses } from "../advice-delivery/response.ts"
import type { makeResidentInspection } from "../inspection/observer.ts"
import { inspectionSourceId } from "@hapsland/inspection-records/inspection/contract"
import { makeSocketFramePort, type SocketFramePort } from "@hapsland/resident-transport/resident/socket-frame"
import type { makeResidentRuntimeConfiguration } from "../runtime-configuration.ts"
import * as Effect from "effect/Effect"
import { writeFile } from "node:fs/promises"
import { type Socket } from "node:net"
import { type ResidentPaths } from "@hapsland/resident-transport/resident/paths"
import {
  type UpdateRecipient,
  EDIT_REQUEST_DEADLINE_MS,
  MAX_IPC_CONNECTIONS,
  decodeCurrentResidentRequest,
  encodeCurrentResidentResponse,
  type ResidentRequest,
  type ResidentResponse
} from "@hapsland/resident-transport/resident/protocol"
import { Ref } from "effect"
import { type ResidentLedger } from "../work-ownership/jobs.ts"
import type { ResidentAdapterError } from "../adapter-error.ts"
import { residentAdapter } from "../adapter-error.ts"
import { type EditRequest, type EditCollectionRequest, type ResponseContext } from "../advice-delivery/authority.ts"
import { classifyResidentFrame } from "./frame.ts"

type Dependencies = {
  readonly releaseInspectionConnection: () => void
  readonly incompatibleCallerResponse: (
    recipient: UpdateRecipient | undefined,
    eligible: boolean
  ) => Effect.Effect<ResidentResponse, never, never>
  readonly residentPruneCollectionTokenIds: () => Effect.Effect<void, never, never>
  readonly lifetime: string
  readonly releaseDelivery: (token: string) => Effect.Effect<void>
  readonly residentHandle: (
    request: ResidentRequest,
    responseContext?: Ref.Ref<ResponseContext> | undefined
  ) => Effect.Effect<ResidentResponse, ResidentAdapterError, never>
  readonly responses: Pick<ReturnType<typeof makeResidentResponses>, "prepareTransport" | "finalizeTransport">
  readonly residentEditCollectionRequest: (request: EditRequest) => EditCollectionRequest
  readonly residentScheduleRetirementClose: () => Effect.Effect<void, never, never>
  readonly runtimeConfiguration: Effect.Success<ReturnType<typeof makeResidentRuntimeConfiguration>>
  readonly residentLedger: ResidentLedger
  readonly residentScheduleIdleCheck: () => Effect.Effect<void, never, never>
  readonly residentRequestLifetime: (
    request: ResidentRequest
  ) => Effect.Effect<ResidentResponse | undefined, never, never>
  readonly paths: ResidentPaths
  readonly inspection: Effect.Success<ReturnType<typeof makeResidentInspection>>["recorder"]
}
const residentServe = Effect.fn("ResidentIpc.serve")(function* (deps: Dependencies, port: SocketFramePort) {
  const admission = classifyResidentFrame(yield* port.read)
  if (admission.kind === "closed") return
  if (admission.kind === "incompatible") {
    yield* port.write(
      encodeCurrentResidentResponse(yield* deps.incompatibleCallerResponse(admission.recipient, admission.eligible))
    )
    yield* port.closed
    return
  }
  if (admission.kind === "response") {
    yield* port.write(encodeCurrentResidentResponse(admission.response))
    yield* port.closed
    return
  }
  const decoded = admission.request
  if (decoded.operation === "admit-and-collect") yield* port.setIdleTimeout(EDIT_REQUEST_DEADLINE_MS)
  yield* deps.residentPruneCollectionTokenIds()
  const context = yield* Ref.make<ResponseContext>({})
  let responseToken: string | undefined
  let handedToTransport = false
  const respond = Effect.gen(function* () {
    const response = yield* deps.residentHandle(decoded, context)
    if (response.status === "advice") responseToken = response.token
    const sourceCurrent = yield* deps.responses.prepareTransport(decoded, response)
    // Keep final authorization and socket handoff within one ownership
    // boundary; the response finalizer owns any untransferred lease.
    yield* Effect.uninterruptible(
      Effect.gen(function* () {
        const authority = (yield* Ref.get(context)).authority
        const request =
          decoded.operation === "admit-and-collect" ? deps.residentEditCollectionRequest(decoded) : decoded
        const handoff = yield* deps.responses.finalizeTransport(
          decoded,
          request,
          response,
          sourceCurrent,
          authority,
          () => port.canWrite()
        )
        yield* deps.residentPruneCollectionTokenIds()
        if (!port.canWrite()) {
          if (handoff.status === "advice") yield* deps.releaseDelivery(handoff.token)
          if (handoff.status === "cleaned") yield* deps.residentScheduleRetirementClose()
          return
        }
        handedToTransport = yield* port.write(encodeCurrentResidentResponse(handoff))
        if (handoff.status === "cleaned") yield* deps.residentScheduleRetirementClose()
      })
    )
    yield* port.closed
  }).pipe(
    Effect.catch(() =>
      port.write(encodeCurrentResidentResponse({ status: "unsupported" })).pipe(Effect.andThen(port.closed))
    ),
    Effect.ensuring(
      Effect.gen(function* () {
        const token = (yield* Ref.get(context)).token ?? responseToken
        if ((!handedToTransport || port.errored()) && token !== undefined) yield* deps.releaseDelivery(token)
        yield* Ref.set(context, {})
      })
    )
  )
  yield* respond.pipe(
    Effect.raceFirst(port.closed),
    Effect.ensuring(
      Effect.gen(function* () {
        yield* port.close
        const closedPath = deps.runtimeConfiguration.collectDisconnectPath
        if (closedPath !== undefined && decoded.operation === "collect" && decoded.advicee.toolUseId === "disconnect") {
          yield* residentAdapter("collect disconnect diagnostic", () => writeFile(closedPath, "closed\n")).pipe(
            Effect.ignore
          )
        }
      })
    )
  )
})
const residentAccept = Effect.fn("ResidentIpc.accept")((deps: Dependencies, socket: Socket) =>
  Effect.acquireUseRelease(
    makeSocketFramePort(socket),
    (port) =>
      Effect.acquireUseRelease(
        deps.residentLedger.runtime.openConnection(MAX_IPC_CONNECTIONS),
        (connection) =>
          Effect.gen(function* () {
            if (connection === undefined) {
              yield* port.write(encodeCurrentResidentResponse({ status: "rejected-capacity" }))
              yield* port.closed
              return
            }
            yield* deps.residentScheduleIdleCheck()
            yield* residentServe(deps, port)
          }),
        (connection) =>
          port.close.pipe(
            Effect.andThen(
              Effect.gen(function* () {
                if (connection !== undefined) yield* deps.residentLedger.runtime.releaseConnection(connection)
                yield* deps.residentScheduleIdleCheck()
              })
            )
          )
      ),
    (port) => port.close
  )
)
const inspectionAccept = Effect.fn("ResidentInspection.accept")((deps: Dependencies, socket: Socket) =>
  Effect.acquireUseRelease(
    makeSocketFramePort(socket),
    (port) =>
      Effect.gen(function* () {
        yield* port.setIdleTimeout(300)
        const frame = yield* port.read
        const request = frame._tag === "Frame" ? decodeCurrentResidentRequest(frame.encoded) : undefined
        const response =
          request?.operation === "hello"
            ? yield* deps.residentRequestLifetime(request)
            : request?.operation === "inspection-status"
              ? ((yield* deps.residentRequestLifetime(request)) ?? {
                  status: "inspection-status" as const,
                  sourceId: inspectionSourceId(deps.paths.socket, deps.lifetime),
                  observedAt: Date.now(),
                  ...deps.inspection.currentRecording()
                })
              : { status: "unsupported" as const }
        yield* port.write(encodeCurrentResidentResponse(response ?? { status: "unsupported" }))
        yield* port.closed
      }),
    (port) => port.close
  ).pipe(
    Effect.timeoutOption(300),
    Effect.asVoid,
    Effect.ensuring(
      Effect.sync(() => {
        deps.releaseInspectionConnection()
      })
    )
  )
)
export const makeResidentIpc = (deps: Dependencies) => {
  return { residentAccept: residentAccept.bind(null, deps), inspectionAccept: inspectionAccept.bind(null, deps) }
}
