import { captureWorkspaceBytes, analysisWorkspaceBytes } from "../../work-ownership/workspace.ts"
import type { Advice, AdviceContent } from "../../state/advice-records.ts"
import * as Effect from "effect/Effect"
import { canonicalValue } from "@hapsland/review-definition/direct-event/model"
import {
  checkHandoffSources,
  revalidateEvaluations,
  type RevalidationResult
} from "@hapsland/review-execution/direct-event/pipeline"
import { verifyObservationRoot } from "@hapsland/native-observation/direct-event/adapter"
import { captureStable } from "@hapsland/native-observation/direct-event/capture"
import { type ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import { type AdviceCapture } from "../../state/resident/state.ts"
import { resizePreparationAdmission } from "../../work-ownership/reservation.ts"
import { withinWork } from "../../work-ownership/cancellation.ts"
import { logicalBytes } from "../../state/encoded-size.ts"
import { type Dependencies } from "./context.ts"

export const residentHandoffSourceCurrent = Effect.fn("ResidentIpc.handoffSourceCurrent")((
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
) => {
  return Effect.gen(function* () {
    if (response.status !== "advice") return new Map<string, boolean>()
    const selected: Advice[] = []
    for (const advice of yield* deps.residentAdvice())
      if ((yield* deps.residentLedger.advice.current(advice)).delivery?.token === response.token) selected.push(advice)
    // Complete all potentially waiting controls before starting the shared
    // source snapshot. A later control cannot make an earlier capture stale.
    const eligible: Advice[] = []
    for (const advice of selected) {
      const workspace = yield* deps.residentLedger.adviceCaptures.start(
        advice.reservation,
        advice.revision,
        captureWorkspaceBytes(advice.prepared.input.path)
      )
      if (workspace === undefined) continue
      const available = yield* Effect.gen(function* () {
        yield* deps.residentReviewControls.afterSourceWorkspaceReserved(advice.id)
        return yield* verifyObservationRoot(advice.observation)
      }).pipe(
        (effect) => withinWork(effect, advice.round?.controller.signal ?? deps.residentLifetimeController.signal),
        Effect.catch(() => Effect.succeed(false)),
        Effect.ensuring(deps.residentLedger.adviceCaptures.finish(workspace))
      )
      if (available) eligible.push(advice)
    }
    const members = eligible.map((advice) => ({
      id: advice.id,
      root: advice.observation.root,
      rootIdentity: advice.observation.rootIdentity,
      fingerprints: advice.prepared.input.sourceFingerprints
    }))
    // Existing advice reservations own the delivery-local source cache. There
    // is no extra item reservation at a saturated partition boundary.
    const owners = new Map<string, { capture: AdviceCapture; bytes: number; analysisBytes: number }>()
    const unavailable = new Set<string>()
    const residentCommitCurrentRevalidation = Effect.fn("ResidentRuntime.commitCurrentRevalidation")(function* (
      advice: Advice,
      content: AdviceContent,
      validation: Extract<RevalidationResult, { readonly status: "current" }>
    ): Effect.fn.Return<boolean> {
      const workAccepted =
        advice.round === undefined ||
        advice.workUnitId === undefined ||
        (yield* deps.residentLedger.rounds.policyWork(advice.round)).reviseFinding(
          advice.workUnitId,
          validation.findings.length,
          logicalBytes(validation.findings)
        )
      if (!workAccepted) return false
      yield* deps.residentLedger.advice.revise(advice, validation.evaluations, validation.findings)
      const retainedFindings = new Set(validation.findings.map((finding) => canonicalValue(finding)))
      const findings =
        content.delivery?.findings.filter((finding) => retainedFindings.has(canonicalValue(finding))) ?? []
      yield* deps.residentLedger.advice.updateDelivery(advice, response.token, { findings })
      deps.residentInspection.observeAdviceFate(advice, validation.findings, "current", "revalidated-current")
      return true
    })
    return yield* Effect.gen(function* () {
      for (const advice of eligible) {
        if (owners.has(advice.partition) || unavailable.has(advice.partition)) continue
        const partitionMembers = members.filter((member) =>
          eligible.some((candidate) => candidate.id === member.id && candidate.partition === advice.partition)
        )
        const bytes =
          1024 +
          2 *
            logicalBytes(
              partitionMembers.flatMap((member) =>
                (member.fingerprints ?? []).map((fingerprint) => [member.root, member.rootIdentity, fingerprint])
              )
            )
        const capture = yield* deps.residentLedger.adviceCaptures.start(advice.reservation, advice.revision, bytes)
        if (capture === undefined) unavailable.add(advice.partition)
        else owners.set(advice.partition, { capture, bytes, analysisBytes: 0 })
      }
      const admitted = members.filter((member) =>
        eligible.some((advice) => advice.id === member.id && owners.has(advice.partition))
      )
      const reserveSourceCapture = Effect.fn("ResidentRuntime.reserveSourceCapture")(function* (
        root: Parameters<typeof captureStable>[0],
        source: Parameters<typeof captureStable>[1]
      ) {
        const advice = eligible.find((candidate) => candidate.observation.root === root)
        const owner = advice === undefined ? undefined : owners.get(advice.partition)
        if (owner === undefined) return undefined
        const required = owner.bytes + owner.analysisBytes + captureWorkspaceBytes(source.relativePath)
        const resized = yield* deps.residentLedger.adviceCaptures.resize(owner.capture, required)
        if (resized.status !== "resized") {
          if (advice !== undefined) unavailable.add(advice.partition)
          return undefined
        }
        return owner
      })
      const result = yield* checkHandoffSources(admitted, {
        verifyMember: (member, captureSource) =>
          Effect.gen(function* () {
            const advice = eligible.find((candidate) => candidate.id === member.id)
            if (advice === undefined) return undefined
            const owner = owners.get(advice.partition)
            if (owner === undefined) return undefined
            const content = yield* deps.residentLedger.advice.current(advice)
            let capacityUnavailable = false
            return yield* withinWork(
              revalidateEvaluations(
                advice.observation,
                content.evaluations,
                {
                  controlledWriter: true,
                  advicee: advice.observation.advicee,
                  settings: advice.settings,
                  captureSource,
                  beforeAnalyze: (path, sourceBytes, preflight) =>
                    Effect.gen(function* () {
                      owner.analysisBytes = analysisWorkspaceBytes(path, sourceBytes, preflight, advice.settings.rules)
                      const required = owner.bytes + owner.analysisBytes
                      const resized = yield* deps.residentLedger.adviceCaptures.resize(owner.capture, required)
                      if (resized.status !== "resized") capacityUnavailable = true
                      return resizePreparationAdmission(resized, required)
                    })
                },
                { isCurrentWork: (prepared) => deps.residentIsCurrentWork(advice.revision, prepared) }
              ),
              advice.round?.controller.signal ?? deps.residentLifetimeController.signal
            ).pipe(
              Effect.flatMap((validation) =>
                Effect.gen(function* () {
                  if (capacityUnavailable || validation.status === "unavailable") return undefined
                  if (validation.status !== "current") return false
                  return yield* residentCommitCurrentRevalidation(advice, content, validation)
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
            const owner = yield* reserveSourceCapture(args[0], args[1])
            if (owner === undefined)
              return {
                status: "unavailable" as const,
                diagnostic: {
                  stage: "capture" as const,
                  code: "capture-unavailable" as const,
                  args: { reason: "unknown" as const }
                }
              }
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
          })
      })
      for (const advice of eligible) if (unavailable.has(advice.partition)) result.delete(advice.id)
      return result
    }).pipe(
      Effect.ensuring(
        Effect.gen(function* () {
          for (const owner of owners.values()) yield* deps.residentLedger.adviceCaptures.finish(owner.capture)
        })
      )
    )
  })
})
