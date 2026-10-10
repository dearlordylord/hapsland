import { residentSettingsEnvironmentOnly } from "../../authorization/credentials.ts"
import { captureInspectionFate } from "@hapsland/review-execution/inspection/capture"
import type { RoundWork } from "../../state/round-records.ts"
import * as Effect from "effect/Effect"
import { randomUUID } from "node:crypto"
import { type EvaluatedUnit } from "@hapsland/review-execution/direct-event/pipeline"
import { type ResidentDispatchContext } from "@hapsland/resident-transport/resident/protocol"
import { type UnitJob } from "../../work-ownership/jobs.ts"
import { ResidentAdapterError } from "../../adapter-error.ts"
import { withinWork } from "../../work-ownership/cancellation.ts"
import { type Dependencies } from "./context.ts"

const residentRetireRoundUnit = Effect.fn("ResidentRuntime.retireRoundUnit")(function* (
  deps: Pick<Dependencies, "residentLedger">,
  round: RoundWork,
  id: number | undefined
) {
  if (id !== undefined) (yield* deps.residentLedger.rounds.policyWork(round)).retire(id)
})

export const residentRetireUnitWork = Effect.fn("ResidentRuntime.retireUnitWork")(function* (
  deps: Pick<Dependencies, "residentLedger">,
  job: UnitJob
) {
  if (job.round !== undefined) yield* residentRetireRoundUnit(deps, job.round, job.workUnitId)
})

const residentRetainedCredentialRequired = (dispatch: ResidentDispatchContext): boolean =>
  dispatch.controlled === null || dispatch.controlled.requireCredential === true

const residentRetainedCredentialFields = (job: UnitJob) => {
  const required = residentRetainedCredentialRequired(job.dispatch)
  const credential = job.dispatch.credential
  if (credential === null)
    return {
      credentialGeneration: null,
      credentialStatePath: null,
      credentialRequired: required,
      credentialEnvironmentOnly: false
    }
  return {
    credentialGeneration: credential.generation,
    credentialStatePath: credential.statePath,
    credentialRequired: required,
    credentialEnvironmentOnly: residentSettingsEnvironmentOnly(job.settings)
  }
}

const residentJoinRetainedAdvice = Effect.fn("ResidentRuntime.joinRetainedAdvice")(function* (
  deps: Pick<
    Dependencies,
    "residentAdvice" | "residentLedger" | "residentRecordJoinedOutcomes" | "residentReleaseUnit"
  >,
  job: UnitJob
) {
  const existing = (yield* deps.residentAdvice()).find((item) => item.evaluationKey === job.evaluationKey)
  if (existing === undefined) return false
  // Publication checks the captured capability is still owned; retirement
  // between this snapshot and publication cannot resurrect its finding.
  yield* deps.residentRecordJoinedOutcomes(yield* deps.residentLedger.advice.publish(existing), existing.id)
  yield* residentRetireUnitWork(deps, job)
  yield* deps.residentReleaseUnit(job)
  return true
})

export const residentRetainAdvice = Effect.fn("ResidentRuntime.retainAdvice")((
  deps: Pick<
    Dependencies,
    | "inspection"
    | "residentAdvice"
    | "residentJobActive"
    | "residentLedger"
    | "residentLifetimeController"
    | "residentNow"
    | "residentRecordJoinedOutcomes"
    | "residentReleaseUnit"
    | "residentRemoveAdvice"
    | "residentReviewControls"
  >,
  job: UnitJob,
  evaluation: EvaluatedUnit,
  sequence: number
) => {
  return Effect.gen(function* () {
    if (!(yield* deps.residentJobActive(job))) {
      yield* residentRetireUnitWork(deps, job)
      yield* deps.residentReleaseUnit(job)
      return
    }
    if (yield* residentJoinRetainedAdvice(deps, job)) return
    const insertRetainedAdvice = Effect.fn("ResidentRuntime.insertRetainedAdvice")(function* () {
      return yield* deps.residentLedger.advice.insert({
        analyticsPath: job.dispatch.activityPath,
        analyticsEnabled: job.analyticsEnabled ?? job.dispatch.sessionAnalytics === true,
        analyticsControlled: job.dispatch.controlled !== null,
        id: randomUUID(),
        ...(job.round === undefined ? {} : { round: job.round }),
        ...(job.workUnitId === undefined ? {} : { workUnitId: job.workUnitId }),
        admissionId: job.admissionId,
        canonicalOperationId: job.canonicalOperationId,
        canonicalRound: job.canonicalRound,
        observation: job.observation,
        settings: job.settings,
        partition: job.partition,
        reservation: job.reservation,
        prepared: job.prepared,
        ...(job.sourceHash === undefined ? {} : { sourceHash: job.sourceHash }),
        revision: job.revision,
        evaluationKey: job.evaluationKey,
        evaluations: [evaluation],
        findings: evaluation.findings,
        sequence,
        ...residentRetainedCredentialFields(job),
        pendingAt: deps.residentNow()
      })
    })
    const advice = yield* insertRetainedAdvice()
    if (job.inspectionReceipt !== undefined && deps.inspection.isEnabled(job.inspectionReceipt.scope.root))
      deps.inspection.offer(
        job.inspectionReceipt.scope,
        {
          ...job.inspectionReceipt.correlation,
          ...(job.inspectionEvaluationId === undefined ? {} : { evaluationId: job.inspectionEvaluationId })
        },
        captureInspectionFate(evaluation.findings, "retained", "pending-advice", advice.id)
      )
    job.completed = true
    yield* Effect.gen(function* () {
      yield* withinWork(
        deps.residentReviewControls
          .afterAdvicePending(advice.id)
          .pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "pending advice barrier" }))),
        deps.residentLifetimeController.signal
      )
      // A finding already retained is excluded from unfinished-work cutoff.
      // Replacing that work cohort must not discard the completed finding.
      if (!(yield* deps.residentJobActive(job))) return
      yield* deps.residentRecordJoinedOutcomes(yield* deps.residentLedger.advice.publish(advice), advice.id)
    }).pipe(
      Effect.onError(() =>
        deps
          .residentRemoveAdvice(advice.id, undefined, { fate: "discarded", reason: "retention-failed" })
          .pipe(Effect.asVoid)
      )
    )
  })
})
