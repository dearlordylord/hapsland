import { residentSettingsEnvironmentOnly } from "../../authorization/credentials.ts"
import { effectiveSessionAnalytics } from "@hapsland/runtime-inputs/configuration/resolve"
import { recordActivity } from "@hapsland/activity-observation/activity/status"
import * as Effect from "effect/Effect"
import { canonicalValue } from "@hapsland/review-definition/direct-event/model"
import { verifyObservationRoot } from "@hapsland/native-observation/direct-event/adapter"
import {
  resolvedDirectFilePolicy,
  selectedByDirectFilePolicy
} from "@hapsland/native-observation/direct-event/selection"
import { admitReview } from "@hapsland/runtime-inputs/configuration/decision"
import { type ControlledDecisionModelOptions } from "@hapsland/review-execution/review-execution/controlled-decision-model"
import { resolveCredential } from "@hapsland/credential-storage/credentials/owner"
import { readCredentialState } from "@hapsland/runtime-inputs/credentials/state"
import { ResidentAdapterError } from "../../adapter-error.ts"
import { workInvalidated } from "../../work-ownership/cancellation.ts"
import { type EvaluationContext, type ResolvedEvaluationCredentials } from "./context.ts"
import { observeRequest } from "./observation.ts"
import { reportInterruption } from "./settlement.ts"

const requestReady = Effect.fn("ResidentRuntime.requestReady")(function* (
  context: EvaluationContext<"residentLedger" | "residentObserveJevRequest" | "residentRecordAnalytics">,
  facts: {
    readonly rootValid: boolean
    readonly configurationValid: boolean
    readonly credentialReady: boolean
    readonly selected: boolean
    readonly currentWork: boolean
    readonly physicalAvailable: boolean
  }
) {
  context.state.readyReported = true
  const decision = yield* context.deps.residentLedger.readyJevRequest(
    context.job.partition,
    context.job.canonicalOperationId,
    context.job.reservation,
    facts,
    context.job.canonicalRound
  )
  if (decision.status !== "stale") {
    const canonicalPartition = yield* context.deps.residentLedger.knownPartitionId(context.job.partition)
    if (canonicalPartition === undefined) throw new Error("issued review lost its partition identity")
    context.state.requestIdentity = {
      partition: context.job.partition,
      canonicalPartition,
      lifetime: context.deps.residentLedger.residentLifetime,
      canonicalLifetime: context.deps.residentLedger.canonicalLifetime,
      round: decision.round,
      hapslandRound: context.job.round?.generation ?? null,
      operation: context.job.canonicalOperationId
    }
  }
  if (decision.status === "issued") {
    context.state.issuedRequest = decision.request
    context.job.requestId = decision.request
    yield* observeRequest(context, "issued", decision.request)
    yield* workInvalidated(context.signal).pipe(
      Effect.catch(() => reportInterruption(context)),
      Effect.forkScoped
    )
  } else if (decision.status === "unavailable") {
    yield* observeRequest(context, "unavailable")
  }
  return decision
})

export const denyReady = Effect.fn("ResidentRuntime.denyReady")(function* (
  context: EvaluationContext<"residentLedger" | "residentObserveJevRequest" | "residentRecordAnalytics">,
  reason?: "credential"
) {
  const decision = yield* requestReady(context, {
    rootValid: false,
    configurationValid: false,
    credentialReady: false,
    selected: false,
    currentWork: false,
    physicalAvailable: false
  })
  if (decision.status === "issued") throw new Error("canonical Jev request authorized unverified facts")
  return { status: "notAuthorized" as const, reason }
})

const startCanonicalUnit = Effect.fn("ResidentRuntime.startCanonicalUnit")(function* (
  context: EvaluationContext<"residentLedger">
) {
  if (context.job.round === undefined || context.job.workUnitId === undefined) return true
  return (yield* context.deps.residentLedger.rounds.policyWork(context.job.round)).startUnit(context.job.workUnitId)
})

const startNativeUnit = Effect.fn("ResidentRuntime.startNativeUnit")(function* (
  context: EvaluationContext<"residentLedger" | "residentReleaseReuseClaim" | "residentReleaseUnit">
) {
  if (!(yield* startCanonicalUnit(context))) {
    yield* context.deps.residentReleaseReuseClaim(context.job.evaluationKey)
    yield* context.deps.residentReleaseUnit(context.job)
    return false
  }
  if (
    !(yield* context.deps.residentLedger.startReview(
      context.job.partition,
      context.job.canonicalOperationId,
      context.job.canonicalRound
    ))
  ) {
    yield* context.deps.residentReleaseReuseClaim(context.job.evaluationKey)
    yield* context.deps.residentReleaseUnit(context.job)
    return false
  }
  return true
})

const unitAdmissionCurrent = Effect.fn("ResidentRuntime.unitAdmissionCurrent")(function* (
  context: EvaluationContext<"residentIsCurrentWork" | "residentJobActive">
) {
  return (
    (yield* context.deps.residentJobActive(context.job)) &&
    (yield* context.deps.residentIsCurrentWork(context.job.revision, context.job.prepared))
  )
})

export const startUnitEvaluation = Effect.fn("ResidentRuntime.startUnitEvaluation")(function* (
  context: EvaluationContext<
    | "lifetime"
    | "residentAwaitBackendGate"
    | "residentIsCurrentWork"
    | "residentJobActive"
    | "residentLedger"
    | "residentObserveJevRequest"
    | "residentRecordAnalytics"
    | "residentReleaseReuseClaim"
    | "residentReleaseUnit"
    | "residentSettleJoined"
  >
) {
  if (!(yield* startNativeUnit(context))) return false
  yield* context.deps.residentAwaitBackendGate()
  if (!(yield* unitAdmissionCurrent(context))) {
    yield* denyReady(context)
    yield* context.deps.residentRecordAnalytics(context.job, "review-unavailable")
    yield* context.deps.residentSettleJoined(context.job.evaluationKey, "unavailable", "stale")
    recordActivity({
      statePath: context.job.dispatch.activityPath,
      root: context.job.observation.root,
      advicee: context.job.observation.advicee,
      lifetime: context.deps.lifetime,
      stage: "incomplete",
      unitIdentity: context.job.evaluationKey
    })
    yield* context.deps.residentReleaseReuseClaim(context.job.evaluationKey)
    yield* context.deps.residentReleaseUnit(context.job)
    return false
  }
  return true
})

export const resolveEvaluationCredentials = Effect.fn("ResidentRuntime.resolveEvaluationCredentials")(function* (
  context: EvaluationContext<
    | "residentCredentialRequired"
    | "residentCredentialShapeMatches"
    | "residentDispatchControls"
    | "residentLedger"
    | "residentObserveJevRequest"
    | "residentRecordAnalytics"
  >,
  controlled: ControlledDecisionModelOptions | undefined
) {
  const validateEvaluationSettings = Effect.fn("ResidentRuntime.validateEvaluationSettings")(function* () {
    const settings = context.job.settings
    context.job.analyticsEnabled = effectiveSessionAnalytics(settings.configuration.policy)
    if (context.job.dispatch.controlled !== null && controlled === undefined) return yield* denyReady(context)
    const credentialRequired = context.deps.residentCredentialRequired(controlled)
    if (
      !context.deps.residentCredentialShapeMatches(context.job.dispatch, settings.credentialEnvVar, credentialRequired)
    )
      return yield* denyReady(context, "credential")
    const dispatchCredential = context.job.dispatch.credential
    if (!(yield* verifyObservationRoot(context.job.observation))) return yield* denyReady(context)
    yield* context.deps.residentDispatchControls
      .atBoundary("authorized")
      .pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "authorization barrier" })))
    return { settings, credentialRequired, dispatchCredential }
  })
  const loaded = yield* validateEvaluationSettings()
  if ("status" in loaded) return loaded
  const { settings, credentialRequired, dispatchCredential } = loaded
  const resolveDispatchCredential = Effect.fn("ResidentRuntime.resolveDispatchCredential")(function* () {
    return !credentialRequired || dispatchCredential === null
      ? undefined
      : yield* resolveCredential({
          envVar: dispatchCredential.name,
          environmentOnly: residentSettingsEnvironmentOnly(settings),
          environmentValue: dispatchCredential.environmentValue,
          expectedGeneration: dispatchCredential.generation,
          statePath: dispatchCredential.statePath
        })
  })
  const credential = yield* resolveDispatchCredential()
  if (credentialRequired && credential?.status !== "present") {
    return yield* denyReady(context, "credential")
  }
  const credentialStillCurrent = () => {
    if (credential?.status !== "present") return true
    const current = readCredentialState(dispatchCredential?.statePath)
    return current.generation === credential.generation && !(credential.source === "saved" && current.savedUseSuspended)
  }
  if (!credentialStillCurrent()) return yield* denyReady(context, "credential")
  yield* context.deps.residentDispatchControls
    .atBoundary("credentialResolved")
    .pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "credential barrier" })))
  if (!credentialStillCurrent()) return yield* denyReady(context, "credential")
  return { settings, credentialRequired, dispatchCredential, credential }
})

export const authorizePreparedUnit = Effect.fn("ResidentRuntime.authorizePreparedUnit")(function* (
  context: EvaluationContext<
    | "residentIsCurrentWork"
    | "residentJobActive"
    | "residentLedger"
    | "residentObserveDispatchAuthority"
    | "residentObserveJevRequest"
    | "residentRecordAnalytics"
  >,
  resolved: ResolvedEvaluationCredentials
) {
  const { settings, credentialRequired, dispatchCredential, credential } = resolved
  const credentialReady = () => !credentialRequired || credential?.status === "present"
  const credentialObservation = () => ({
    credentialStatus: credential?.status ?? ("not-required" as const),
    credentialGeneration: credential?.generation ?? null
  })
  const editConfiguration = context.job.settings.configuration
  if (credentialRequired && dispatchCredential?.name !== editConfiguration.policy.credentialEnvVar.value)
    return yield* denyReady(context, "credential")
  if (canonicalValue(context.job.prepared.input.providerIdentity) !== canonicalValue(settings.providerIdentity))
    return yield* denyReady(context)
  const dispatchRootVerified = yield* verifyObservationRoot(context.job.observation)
  if (!dispatchRootVerified) {
    yield* context.deps.residentObserveDispatchAuthority(context.job, {
      decision: "deny",
      reason: "physical-root-mismatch",
      policyDigest: editConfiguration.policy.digest,
      selected: null,
      admission: "refuseRoot",
      physicalRootVerified: false,
      ...credentialObservation()
    })
    return yield* denyReady(context)
  }
  const selected = selectedByDirectFilePolicy(
    context.job.prepared.input.path,
    resolvedDirectFilePolicy(editConfiguration.policy)
  )
  const admission = admitReview({
    rootValid: dispatchRootVerified,
    configurationValid: true,
    credentialReady: credentialReady(),
    selected
  })
  yield* context.deps.residentObserveDispatchAuthority(context.job, {
    decision: admission === "admitReview" ? "allow" : "deny",
    reason: admission === "admitReview" ? "selected-by-file-policy" : "excluded-by-file-policy",
    policyDigest: editConfiguration.policy.digest,
    selected,
    admission,
    physicalRootVerified: true,
    ...credentialObservation()
  })
  const ready = yield* requestReady(context, {
    rootValid: dispatchRootVerified,
    configurationValid: true,
    credentialReady: credentialReady(),
    selected: selected && admission === "admitReview",
    currentWork: yield* context.deps.residentIsCurrentWork(context.job.revision, context.job.prepared),
    physicalAvailable: yield* context.deps.residentJobActive(context.job)
  })
  return ready
})
