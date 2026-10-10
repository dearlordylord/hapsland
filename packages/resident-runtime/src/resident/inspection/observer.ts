import * as Effect from "effect/Effect"
import { createHash, randomUUID } from "node:crypto"
import { join } from "node:path"
import type { NativeEditMetadata, DirectObservation } from "@hapsland/native-observation/direct-event/observation"
import {
  candidatesForSourceRoot,
  observationForTargetRoot
} from "@hapsland/native-observation/direct-event/target-observation"
import type { CaptureDiagnostic } from "@hapsland/native-observation/direct-event/capture"
import type { Finding } from "@hapsland/delivery-output/direct-event/output"
import { captureInspectionPolicy, captureInspectionFate } from "@hapsland/review-execution/inspection/capture"
import type { InspectionScope, InspectionCorrelation } from "@hapsland/inspection-records/inspection/contract"
import { makeInspectionRecorder, type InspectionPersistence } from "@hapsland/inspection-records/inspection/recorder"
import { makeInspectionStorage } from "@hapsland/inspection-records/inspection/storage"
import { readInspectionSettings } from "@hapsland/inspection-records/inspection/settings"
import { HAPSLAND_STATE_DIRECTORY } from "@hapsland/runtime-environment/runtime/user-paths"
import { monotonicNow } from "@hapsland/resident-transport/resident/hook-clock"
import type { ResidentDispatchContext } from "@hapsland/resident-transport/resident/protocol"
import type { PreparedUnit, PreparationDiagnostic } from "@hapsland/review-definition/direct-event/model"
import type { prepareObservation, PreparedObservation } from "@hapsland/review-execution/direct-event/pipeline"
import type { Advice } from "../state/advice-records.ts"
import { type InspectionReceipt } from "./receipt.ts"

type InspectionIngress = { readonly inspectionReceipt?: InspectionReceipt }

type InspectionUnit = InspectionIngress & {
  readonly inspectionEvaluationId?: string
  readonly partition: string
  readonly canonicalOperationId: number
  readonly prepared: PreparedUnit
  readonly dispatch: Pick<ResidentDispatchContext, "controlled">
}

/** Optional recording owns its consent, provenance and journal, independently of review authority. */
export const makeResidentInspection = Effect.fn("ResidentInspection.make")(function* (
  endpoint: string,
  lifetime: string,
  persistence?: InspectionPersistence
) {
  // Optional provenance is bounded independently of review authority and contains no source.
  const inspectionOrigins = new Map<string, string>()
  const inspectionRegistrations = new Map<string, { epoch: number; at: number }>()
  const inspectionLimits = new Map<string, { readonly retentionMs: number; readonly storageBytes: number }>()
  let inspectionJournal:
    | {
        readonly retentionMs: number
        readonly storageBytes: number
        readonly store: ReturnType<typeof makeInspectionStorage>
      }
    | undefined
  const inspection = yield* makeInspectionRecorder(
    { endpoint, lifetime },
    persistence ?? {
      write: (record, encoded, publication) =>
        Effect.suspend(() => {
          const limits = inspectionLimits.get(record.scope.root)
          if (limits === undefined) return Effect.void
          if (
            inspectionJournal === undefined ||
            inspectionJournal.retentionMs !== limits.retentionMs ||
            inspectionJournal.storageBytes !== limits.storageBytes
          )
            inspectionJournal = {
              ...limits,
              store: makeInspectionStorage(join(HAPSLAND_STATE_DIRECTORY, "inspection"), limits)
            }
          return inspectionJournal.store.write(record, encoded, publication)
        })
    }
  )
  return makeResidentInspectionOperations({ inspection, inspectionOrigins, inspectionRegistrations, inspectionLimits })
})

type Dependencies = {
  readonly inspection: Effect.Success<ReturnType<typeof makeInspectionRecorder>>
  readonly inspectionOrigins: Map<string, string>
  readonly inspectionRegistrations: Map<string, { epoch: number; at: number }>
  readonly inspectionLimits: Map<string, { readonly retentionMs: number; readonly storageBytes: number }>
}

const inspectionObserveAdviceFate = (
  deps: Dependencies,
  advice: Advice,
  findings: ReadonlyArray<Finding>,
  fate: Parameters<typeof captureInspectionFate>[1],
  reason: Parameters<typeof captureInspectionFate>[2]
) => {
  if (!deps.inspection.isEnabled(advice.observation.root)) return
  const evaluationId = deps.inspectionOrigins.get(advice.evaluationKey)
  deps.inspection.offer(
    {
      root: advice.observation.root,
      runtime: advice.observation.advicee.host,
      runtimeVersion: advice.observation.advicee.hostVersion,
      sessionId: advice.observation.advicee.sessionId,
      subagentId: advice.observation.advicee.subagentId
    },
    evaluationId === undefined ? {} : { evaluationId },
    captureInspectionFate(findings, fate, reason, advice.id)
  )
}

const refreshInspectionConsent = (
  deps: Dependencies,
  root: string,
  dispatch: Pick<ResidentDispatchContext, "userConfigPath">
): void => {
  const settings = readInspectionSettings(root, dispatch.userConfigPath ?? undefined)
  if (settings && (deps.inspectionLimits.has(root) || deps.inspectionLimits.size < 128))
    deps.inspectionLimits.set(root, settings)
  deps.inspection.observeRecording(root, deps.inspectionLimits.has(root) ? settings?.enabled : undefined)
}

const registerInspectionSource = (deps: Dependencies, scope: InspectionScope): void => {
  const epoch = deps.inspection.consentEpoch(scope.root)
  const registered = deps.inspectionRegistrations.get(scope.root)
  const registrationTime = monotonicNow()
  if (
    epoch !== undefined &&
    (registered === undefined || registered.epoch !== epoch || registrationTime - registered.at >= 60000)
  ) {
    if (deps.inspection.offer(scope, {}, { kind: "source-registration" }) === "queued")
      deps.inspectionRegistrations.set(scope.root, { epoch, at: registrationTime })
  }
}

const inspectionReceiveMetadata = (
  deps: Dependencies,
  metadata: NativeEditMetadata,
  dispatch: Pick<ResidentDispatchContext, "userConfigPath">
): InspectionReceipt => {
  refreshInspectionConsent(deps, metadata.root, dispatch)
  const scope = {
    root: metadata.root,
    runtime: metadata.advicee.host,
    runtimeVersion: metadata.advicee.hostVersion,
    sessionId: metadata.advicee.sessionId,
    subagentId: metadata.advicee.subagentId
  }
  const correlation = { receiptId: randomUUID() }
  registerInspectionSource(deps, scope)
  deps.inspection.offer(scope, correlation, { kind: "edit-received", candidates: metadata.candidates })
  if (metadata.admission !== undefined)
    deps.inspection.offer(scope, correlation, { kind: "edit-admission", outcome: metadata.admission })
  if (metadata.diagnostic !== undefined) {
    const candidate =
      metadata.diagnostic.stage === "capture" && metadata.candidates.length === 1 ? metadata.candidates[0] : undefined
    deps.inspection.offer(scope, correlation, {
      kind: "diagnostic",
      ...(candidate === undefined ? {} : { path: candidate.path, candidatePosition: candidate.position }),
      diagnostic: metadata.diagnostic
    })
  }
  return {
    scope,
    correlation,
    candidates: Object.freeze(metadata.candidates.map(({ path, position }) => Object.freeze({ path, position })))
  }
}

const inspectionIngress = (deps: Dependencies, observation: DirectObservation, dispatch: ResidentDispatchContext) => {
  const metadata =
    observation.nativeMetadata ??
    (observation.candidateRoots === undefined
      ? [
          {
            ...observation,
            candidates: observation.candidates.map(({ operation, path, ...candidate }, position) => ({
              operation,
              path,
              ...("moveTo" in candidate && candidate.moveTo !== undefined ? { moveTo: candidate.moveTo } : {}),
              position,
              selection: { status: "not-evaluated" as const }
            }))
          }
        ]
      : [...new Set(observation.candidateRoots.flatMap((target) => (target === null ? [] : [target.root])))].map(
          (root) => {
            const { indices } = candidatesForSourceRoot(observation, root)
            const target = observation.candidateRoots!.find((target) => target?.root === root)!
            const local = observationForTargetRoot(observation, root, target.rootIdentity, indices)
            return {
              ...local,
              candidates: local.candidates.map(({ operation, path, ...candidate }, index) => ({
                operation,
                path,
                ...("moveTo" in candidate && candidate.moveTo !== undefined ? { moveTo: candidate.moveTo } : {}),
                position: indices[index]!,
                selection: { status: "not-evaluated" as const }
              }))
            }
          }
        ))
  return new Map(metadata.map((projection) => [projection.root, inspectionReceiveMetadata(deps, projection, dispatch)]))
}

const inspectionRefuse = (
  deps: Dependencies,
  observation: DirectObservation,
  dispatch: ResidentDispatchContext,
  outcome: "unsupported" | "obsolete-lifetime"
) => {
  for (const receipt of inspectionIngress(deps, observation, dispatch).values())
    deps.inspection.offer(receipt.scope, receipt.correlation, { kind: "edit-admission", outcome })
}

const inspectionUnitCorrelation = (
  job: InspectionUnit,
  receipt: InspectionReceipt,
  request?: number
): InspectionCorrelation => ({
  ...receipt.correlation,
  ...(job.inspectionEvaluationId === undefined ? {} : { evaluationId: job.inspectionEvaluationId }),
  unitId: createHash("sha256").update(`${job.partition}:${job.canonicalOperationId}`).digest("hex"),
  ...(request === undefined
    ? {}
    : { requestId: createHash("sha256").update(`${job.partition}:${request}`).digest("hex") })
})

const inspectionObservePreparedUnit = (deps: Dependencies, unit: InspectionUnit): void => {
  if (unit.inspectionReceipt !== undefined) {
    deps.inspection.offer(unit.inspectionReceipt.scope, inspectionUnitCorrelation(unit, unit.inspectionReceipt), {
      kind: "unit-prepared",
      semanticIdentity: unit.prepared.identity,
      path: unit.prepared.input.path,
      declaration: unit.prepared.input.declaration.name,
      completeness: unit.prepared.input.completeness
    })
    if (deps.inspection.isEnabled(unit.inspectionReceipt.scope.root)) {
      deps.inspection.offer(
        unit.inspectionReceipt.scope,
        inspectionUnitCorrelation(unit, unit.inspectionReceipt),
        captureInspectionPolicy(unit.prepared, unit.dispatch.controlled !== null)
      )
    }
  }
}

const inspectionObserveUnitFate = (
  deps: Dependencies,
  job: InspectionUnit,
  findings: ReadonlyArray<Finding>,
  fate: Parameters<typeof captureInspectionFate>[1],
  reason: Parameters<typeof captureInspectionFate>[2]
): void => {
  const receipt = job.inspectionReceipt
  if (!findings.length || receipt === undefined || !deps.inspection.isEnabled(receipt.scope.root)) return
  deps.inspection.offer(
    receipt.scope,
    {
      ...receipt.correlation,
      ...(job.inspectionEvaluationId === undefined ? {} : { evaluationId: job.inspectionEvaluationId })
    },
    captureInspectionFate(findings, fate, reason)
  )
}

const inspectionObserveDiagnostic = (
  deps: Dependencies,
  receipt: InspectionReceipt | undefined,
  candidatePath: string,
  path: string,
  diagnostic: CaptureDiagnostic | PreparationDiagnostic
): void => {
  if (receipt === undefined) return
  try {
    if (!deps.inspection.isEnabled(receipt.scope.root)) return
    const candidates = receipt.candidates.filter((candidate) => candidate.path === candidatePath)
    const candidatePosition = candidates.length === 1 ? candidates[0]!.position : undefined
    deps.inspection.offer(receipt.scope, receipt.correlation, {
      kind: "diagnostic",
      path,
      ...(candidatePosition === undefined ? {} : { candidatePosition }),
      diagnostic
    })
  } catch {
    /* Optional diagnosis cannot change preparation or resource authority. */
  }
}

const preparationInspectionPorts = (
  deps: Dependencies,
  job: InspectionIngress
): Pick<
  Parameters<typeof prepareObservation>[1],
  "observePreparationOmission" | "observeCaptureDiagnostic" | "captureHooks"
> => ({
  observeCaptureDiagnostic: (candidatePath, sourcePath, diagnostic) =>
    inspectionObserveDiagnostic(deps, job.inspectionReceipt, candidatePath, sourcePath, diagnostic),
  observePreparationOmission: (path, declaration, reason) => {
    const receipt = job.inspectionReceipt
    if (receipt !== undefined && deps.inspection.isEnabled(receipt.scope.root))
      deps.inspection.offer(receipt.scope, receipt.correlation, {
        kind: "preparation-omission",
        path,
        declaration,
        reason
      })
  },
  ...(job.inspectionReceipt === undefined
    ? {}
    : {
        captureHooks: {
          sourceRead: (path: string) => {
            const receipt = job.inspectionReceipt
            if (receipt === undefined || !deps.inspection.isEnabled(receipt.scope.root)) return
            try {
              deps.inspection.offer(receipt.scope, receipt.correlation, { kind: "preparation-read", path })
            } catch {
              /* Optional observation cannot invalidate the actual source read. */
            }
          }
        }
      })
})

const inspectionObserveAnalysis = (
  deps: Dependencies,
  outcome: PreparedObservation["observation"]["outcomes"][number],
  receipt: InspectionReceipt
): void => {
  if (outcome.status === "incomplete") {
    if ("diagnostic" in outcome)
      inspectionObserveDiagnostic(deps, receipt, outcome.path, outcome.path, outcome.diagnostic)
    else
      deps.inspection.offer(receipt.scope, receipt.correlation, {
        kind: "preparation-omission",
        path: outcome.path,
        reason: outcome.reason
      })
  } else if (outcome.analysis.status === "incomplete") {
    for (const failure of outcome.analysis.failures) {
      deps.inspection.offer(receipt.scope, receipt.correlation, {
        kind: "preparation-omission",
        path: outcome.path,
        reason: failure.reason,
        ...(failure.root === undefined ? {} : { declaration: failure.root })
      })
    }
  }
}

const inspectionObservePreparation = (
  deps: Dependencies,
  job: InspectionIngress,
  prepared: PreparedObservation
): void => {
  if (job.inspectionReceipt !== undefined) {
    const receipt = job.inspectionReceipt
    for (const outcome of prepared.outcomes) {
      if (outcome.status === "skipped")
        deps.inspection.offer(receipt.scope, receipt.correlation, { kind: "preparation-skipped", path: outcome.path })
    }
    for (const outcome of prepared.observation.outcomes) {
      inspectionObserveAnalysis(deps, outcome, receipt)
    }
  }
}

const registerInspectionOrigin = (deps: Dependencies, evaluationKey: string): void => {
  if (deps.inspectionOrigins.size >= 512) {
    const oldest = deps.inspectionOrigins.keys().next().value
    if (oldest !== undefined) deps.inspectionOrigins.delete(oldest)
  }
  deps.inspectionOrigins.set(evaluationKey, randomUUID())
}

const makeResidentInspectionOperations = (deps: Dependencies) => {
  return {
    recorder: deps.inspection,
    observeAdviceFate: inspectionObserveAdviceFate.bind(null, deps),
    receiveMetadata: inspectionReceiveMetadata.bind(null, deps),
    ingress: inspectionIngress.bind(null, deps),
    refuse: inspectionRefuse.bind(null, deps),
    unitCorrelation: inspectionUnitCorrelation,
    observePreparedUnit: inspectionObservePreparedUnit.bind(null, deps),
    observeUnitFate: inspectionObserveUnitFate.bind(null, deps),
    observeDiagnostic: inspectionObserveDiagnostic.bind(null, deps),
    preparationPorts: preparationInspectionPorts.bind(null, deps),
    observePreparation: inspectionObservePreparation.bind(null, deps),
    registerOrigin: registerInspectionOrigin.bind(null, deps),
    forgetOrigin: (evaluationKey: string) => deps.inspectionOrigins.delete(evaluationKey),
    evaluationId: (evaluationKey: string) => deps.inspectionOrigins.get(evaluationKey)
  }
}
