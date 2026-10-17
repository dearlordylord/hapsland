import { captureWorkspaceBytes, analysisWorkspaceBytes } from "../../work-ownership/workspace.ts"
import type { Advice, AdviceContent } from "../../state/advice-records.ts"
import * as Effect from "effect/Effect"
import * as Scope from "effect/Scope"
import * as Exit from "effect/Exit"
import { list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import { canonicalValue } from "@hapsland/review-definition/direct-event/model"
import {
  checkHandoffSources,
  revalidateEvaluations,
  type RevalidationResult
} from "@hapsland/review-execution/direct-event/pipeline"
import { verifyObservationRoot } from "@hapsland/native-observation/direct-event/adapter"
import { captureStable, type CaptureResult } from "@hapsland/native-observation/direct-event/capture"
import { type ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import { type AdviceCapture } from "../../state/resident/state.ts"
import { resizePreparationAdmission } from "../../work-ownership/reservation.ts"
import { withinWork } from "../../work-ownership/cancellation.ts"
import { logicalBytes } from "../../state/encoded-size.ts"
import { type Dependencies } from "./context.ts"
import core, {
  type PCommand,
  type PResponse,
  type PItem,
  type KCommand,
  type KResponse,
  type PStep
} from "./handoff-core.js"

const unavailableCapture = (): CaptureResult => ({
  status: "unavailable",
  diagnostic: { stage: "capture", code: "capture-unavailable", args: { reason: "unknown" } }
})

// Advice, capture and buffer custody remain native. Handoff.bend owns all three
// passes, partition admission, first-member lookups and revalidation commit.
export const makeResidentSourceCurrentSession = Effect.fn("ResidentRuntime.sourceCurrentSession")(function* (
  deps: Pick<
    Dependencies,
    | "residentAdvice"
    | "residentCaptureSource"
    | "residentInspection"
    | "residentIsCurrentWork"
    | "residentLedger"
    | "residentLifetimeController"
    | "residentReviewControls"
  >,
  response: ResidentResponse
) {
  const scope = yield* Scope.make()
  let advice: readonly Advice[] = []
  let result = new Map<string, boolean>()
  const identities = new Map<string, number>(),
    roots = new Map<string, number>(),
    partitions = new Map<string, number>()
  const handle = (values: Map<string, number>, value: string) => {
    const previous = values.get(value)
    if (previous !== undefined) return previous
    const next = values.size
    values.set(value, next)
    return next
  }
  const adviceAt = (value: number) => {
    const item = advice[value]
    if (item === undefined) throw new Error("invalid prepare advice capability")
    return item
  }
  const token = () => {
    if (response.status !== "advice") throw new Error("missing prepare response capability")
    return response.token
  }
  const itemFacts = (item: Advice, value: number): PItem => ({
    $: "PItem",
    handle: value,
    identity: handle(identities, item.id),
    root: handle(roots, item.observation.root),
    partition: handle(partitions, item.partition),
    work: item.round !== undefined && item.workUnitId !== undefined
  })
  const member = (item: Advice) => ({
    id: item.id,
    root: item.observation.root,
    rootIdentity: item.observation.rootIdentity,
    fingerprints: item.prepared.input.sourceFingerprints
  })
  const workspaces: Array<{ capture: AdviceCapture; finished: boolean; handle: number }> = []
  const finishWorkspace = (held: { capture: AdviceCapture; finished: boolean }) =>
    Effect.suspend(() =>
      held.finished
        ? Effect.void
        : deps.residentLedger.adviceCaptures.finish(held.capture).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                held.finished = true
              })
            )
          )
    )
  const owners = new Map<number, { capture: AdviceCapture; bytes: number; analysisBytes: number }>()
  const ownerAt = (partition: number) => {
    const owner = owners.get(partition)
    if (owner === undefined) throw new Error("invalid prepare partition capability")
    return owner
  }
  const commit = Effect.fn("ResidentRuntime.commitCurrentRevalidation")(function* (
    item: Advice,
    content: AdviceContent,
    validation: Extract<RevalidationResult, { readonly status: "current" }>
  ) {
    const native = Effect.fn("ResidentRuntime.prepareCommitCommand")(function* (
      command: KCommand
    ): Effect.fn.Return<KResponse> {
      switch (command.$) {
        case "KReviseWork":
          if (item.round === undefined || item.workUnitId === undefined)
            throw new Error("missing prepare work capability")
          return {
            $: "KTruth",
            value: (yield* deps.residentLedger.rounds.policyWork(item.round)).reviseFinding(
              item.workUnitId,
              validation.findings.length,
              logicalBytes(validation.findings)
            )
          }
        case "KReviseAdvice":
          yield* deps.residentLedger.advice.revise(item, validation.evaluations, validation.findings)
          return { $: "KAck" }
        case "KFindingKeys":
          return {
            $: "KKeys",
            retained: list(validation.findings.map((finding) => canonicalValue(finding))),
            delivery: list((content.delivery?.findings ?? []).map((finding) => canonicalValue(finding)))
          }
        case "KUpdateDelivery": {
          const findings = unlist(command.indices).map((index) => {
            const finding = content.delivery?.findings[index]
            if (finding === undefined) throw new Error("invalid retained finding capability")
            return finding
          })
          yield* deps.residentLedger.advice.updateDelivery(item, token(), { findings })
          return { $: "KAck" }
        }
        case "KObserve":
          deps.residentInspection.observeAdviceFate(item, validation.findings, "current", "revalidated-current")
          return { $: "KAck" }
      }
    })
    let step = core.prepare_commit_initial(1, item.round !== undefined && item.workUnitId !== undefined)
    while (step.$ === "KAwait") {
      const request = step.request
      step = core.prepare_commit_resume(step, {
        $: "KReply",
        invocation: request.invocation,
        id: request.id,
        response: yield* native(request.command)
      })
    }
    if (step.$ !== "KDone") throw new Error("Bend prepare commit refused native reply")
    return step.accepted
  })
  const native = Effect.fn("ResidentRuntime.prepareHandoffCommand")(function* (
    command: PCommand
  ): Effect.fn.Return<PResponse, never, Scope.Scope> {
    switch (command.$) {
      case "PAdvice":
        advice = yield* deps.residentAdvice()
        return { $: "PHandles", values: list(advice.map((_item, value) => value)) }
      case "PFacts": {
        const item = adviceAt(command.advice)
        const content = yield* deps.residentLedger.advice.current(item)
        return { $: "PAdviceFacts", item: itemFacts(item, command.advice), owned: content.delivery?.token === token() }
      }
      case "PStartWorkspace": {
        const item = adviceAt(command.advice)
        // Register native release in the same masked acquisition step. A reply
        // may be interrupted before the next specialized Bend command starts.
        const held = yield* Effect.acquireRelease(
          deps.residentLedger.adviceCaptures
            .start(item.reservation, item.revision, captureWorkspaceBytes(item.prepared.input.path))
            .pipe(
              Effect.map((capture) => {
                if (capture === undefined) return undefined
                const held = { capture, finished: false, handle: workspaces.length }
                workspaces.push(held)
                return held
              })
            ),
          (workspace) => (workspace === undefined ? Effect.void : finishWorkspace(workspace))
        )
        return { $: "PWorkspace", workspace: held === undefined ? { $: "None" } : { $: "Some", value: held.handle } }
      }
      case "PCheckWorkspace": {
        const item = adviceAt(command.advice),
          held = workspaces[command.workspace]
        if (held === undefined) throw new Error("invalid prepare workspace capability")
        const available = yield* Effect.gen(function* () {
          yield* deps.residentReviewControls.afterSourceWorkspaceReserved(item.id)
          return yield* verifyObservationRoot(item.observation)
        }).pipe(
          (effect) => withinWork(effect, item.round?.controller.signal ?? deps.residentLifetimeController.signal),
          Effect.catch(() => Effect.succeed(false)),
          Effect.ensuring(
            Effect.suspend(() => {
              return finishWorkspace(held)
            })
          )
        )
        return { $: "PTruth", value: available }
      }
      case "PReservePartition": {
        const item = adviceAt(command.advice)
        const members = unlist(command.members).map((value) => member(adviceAt(value)))
        const bytes =
          1024 +
          2 *
            logicalBytes(
              members.flatMap((entry) =>
                (entry.fingerprints ?? []).map((fingerprint) => [entry.root, entry.rootIdentity, fingerprint])
              )
            )
        const capture = yield* deps.residentLedger.adviceCaptures.start(item.reservation, item.revision, bytes).pipe(
          Effect.tap((capture) =>
            Effect.sync(() => {
              if (capture !== undefined)
                owners.set(handle(partitions, item.partition), { capture, bytes, analysisBytes: 0 })
            })
          ),
          Effect.uninterruptible
        )
        return { $: "PTruth", value: capture !== undefined }
      }
      case "PVerifyAll": {
        let frame = command.frame
        const admitted = unlist(command.admitted).map((value) => member(adviceAt(value)))
        result = yield* checkHandoffSources(admitted, {
          verifyMember: (entry, captureSource) =>
            Effect.gen(function* () {
              const selected = core.prepare_member(frame, handle(identities, entry.id))
              if (selected.$ === "None") return undefined
              const item = adviceAt(selected.value.handle),
                owner = ownerAt(selected.value.partition)
              const content = yield* deps.residentLedger.advice.current(item)
              let capacityUnavailable = false
              return yield* withinWork(
                revalidateEvaluations(
                  item.observation,
                  content.evaluations,
                  {
                    controlledWriter: true,
                    advicee: item.observation.advicee,
                    settings: item.settings,
                    captureSource,
                    beforeAnalyze: (path, sourceBytes, preflight) =>
                      Effect.gen(function* () {
                        owner.analysisBytes = analysisWorkspaceBytes(path, sourceBytes, preflight, item.settings.rules)
                        const required = owner.bytes + owner.analysisBytes
                        const resized = yield* deps.residentLedger.adviceCaptures.resize(owner.capture, required)
                        capacityUnavailable = core.prepare_capacity(capacityUnavailable, resized.status === "resized")
                        return resizePreparationAdmission(resized, required)
                      })
                  },
                  { isCurrentWork: (prepared) => deps.residentIsCurrentWork(item.revision, prepared) }
                ),
                item.round?.controller.signal ?? deps.residentLifetimeController.signal
              ).pipe(
                Effect.flatMap((validation) =>
                  Effect.gen(function* () {
                    const route = core.prepare_validation(capacityUnavailable, {
                      $:
                        validation.status === "current"
                          ? "PCurrentValidation"
                          : validation.status === "unavailable"
                            ? "PUnavailableValidation"
                            : "PStaleValidation"
                    })
                    switch (route.$) {
                      case "PNoResult":
                        return undefined
                      case "PStaleResult":
                        return false
                      case "PCommitResult":
                        if (validation.status !== "current") throw new Error("missing current validation capability")
                        return yield* commit(item, content, validation)
                    }
                  })
                ),
                Effect.catch(() => Effect.succeed(undefined)),
                Effect.ensuring(
                  Effect.gen(function* () {
                    owner.analysisBytes = 0
                    yield* deps.residentLedger.adviceCaptures.resize(owner.capture, owner.bytes)
                  })
                )
              )
            }),
          captureSource: (...args) =>
            Effect.gen(function* () {
              const selected = core.prepare_source(frame, handle(roots, args[0]))
              if (selected.$ === "None") return unavailableCapture()
              const owner = ownerAt(selected.value.partition)
              const required = owner.bytes + owner.analysisBytes + captureWorkspaceBytes(args[1].relativePath)
              const resized = yield* deps.residentLedger.adviceCaptures.resize(owner.capture, required)
              const reservation = core.prepare_reservation(
                resized.status === "resized",
                frame,
                selected.value.partition
              )
              frame = reservation.frame
              switch (reservation.$) {
                case "PCaptureRefused":
                  return unavailableCapture()
                case "PCaptureAdmitted":
                  return yield* (deps.residentCaptureSource ?? captureStable)(...args).pipe(
                    Effect.tap((captured) =>
                      Effect.sync(() => {
                        if (captured.status === "captured") owner.bytes += 8 * captured.capture.byteLength
                      })
                    ),
                    Effect.ensuring(
                      Effect.suspend(() =>
                        deps.residentLedger.adviceCaptures.resize(owner.capture, owner.bytes + owner.analysisBytes)
                      )
                    )
                  )
              }
            })
        })
        return { $: "PVerifiedAll", frame }
      }
      case "PDeleteUnavailable":
        for (const value of unlist(command.members)) result.delete(adviceAt(value).id)
        return { $: "PAck" }
    }
  })

  let scopeClosed = false
  const finish = () =>
    Effect.gen(function* () {
      for (const [partition, owner] of owners) {
        yield* deps.residentLedger.adviceCaptures.finish(owner.capture)
        owners.delete(partition)
      }
    }).pipe(
      Effect.ensuring(
        Effect.suspend(() => {
          if (!scopeClosed)
            return Scope.close(scope, Exit.void).pipe(
              Effect.onExit(() =>
                Effect.sync(() => {
                  scopeClosed = true
                })
              )
            )
          return Effect.gen(function* () {
            for (const held of workspaces.toReversed()) yield* finishWorkspace(held)
          })
        })
      )
    )
  return {
    initial: (invocation: number) => core.prepare_initial(invocation, response.status === "advice"),
    advance: Effect.fn("ResidentRuntime.sourceCurrentAdvance")(function* (step: PStep) {
      if (step.$ !== "PAwait") throw new Error("prepare cursor has no request")
      const request = step.request
      return core.prepare_resume(step, {
        $: "PReply",
        invocation: request.invocation,
        id: request.id,
        response: yield* native(request.command).pipe(Effect.provideService(Scope.Scope, scope))
      })
    }),
    finish,
    decode: (step: PStep) => {
      if (step.$ !== "PDone") throw new Error("Bend handoff preparation refused native reply")
      return result
    }
  }
})

export const residentHandoffSourceCurrent = Effect.fn("ResidentIpc.handoffSourceCurrent")(function* (
  deps: Parameters<typeof makeResidentSourceCurrentSession>[0],
  response: ResidentResponse
) {
  const session = yield* makeResidentSourceCurrentSession(deps, response)
  return yield* Effect.gen(function* () {
    let step = session.initial(1)
    while (step.$ === "PAwait") step = yield* session.advance(step)
    return session.decode(step)
  }).pipe(Effect.ensuring(session.finish()))
})
