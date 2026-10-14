import type { UnitJob } from "../../../work-ownership/jobs.ts"
import type { CachedEvaluation } from "../../../state/evaluation-reuse.ts"
import type { AdviceInitial } from "../../../state/advice-records.ts"
import type { EvaluatedUnit } from "@hapsland/review-execution/direct-event/pipeline"
import type { residentSettingsEnvironmentOnly } from "../../../authorization/credentials.ts"

/** Independent original cached-advice enrollment recipe; verification only. */
export const nativeEnrollCachedAdvice = (
  value: UnitJob,
  planned: { readonly cached: CachedEvaluation },
  context: { readonly sequence: number },
  ports: {
    readonly uuid: () => string
    readonly now: () => number
    readonly environmentOnly: typeof residentSettingsEnvironmentOnly
  }
): { readonly initial: AdviceInitial; readonly evaluation: EvaluatedUnit } => {
  const credential = value.dispatch.credential,
    required = value.dispatch.controlled === null || value.dispatch.controlled.requireCredential === true
  const evaluation = { prepared: value.prepared, findings: planned.cached.evaluation.findings }
  const initial = {
    analyticsPath: value.dispatch.activityPath,
    analyticsEnabled: value.analyticsEnabled ?? value.dispatch.sessionAnalytics === true,
    analyticsControlled: value.dispatch.controlled !== null,
    id: ports.uuid(),
    ...(value.round === undefined ? {} : { round: value.round }),
    ...(value.workUnitId === undefined ? {} : { workUnitId: value.workUnitId }),
    admissionId: value.admissionId,
    canonicalOperationId: value.canonicalOperationId,
    canonicalRound: value.canonicalRound,
    observation: value.observation,
    settings: value.settings,
    partition: value.partition,
    reservation: value.reservation,
    prepared: value.prepared,
    ...(value.sourceHash === undefined ? {} : { sourceHash: value.sourceHash }),
    revision: value.revision,
    evaluationKey: value.evaluationKey,
    evaluations: [evaluation],
    findings: evaluation.findings,
    sequence: context.sequence,
    credentialGeneration: credential?.generation ?? null,
    credentialStatePath: credential?.statePath ?? null,
    credentialRequired: required,
    credentialEnvironmentOnly: credential === null ? false : ports.environmentOnly(value.settings),
    pendingAt: ports.now()
  }

  return { initial, evaluation }
}
