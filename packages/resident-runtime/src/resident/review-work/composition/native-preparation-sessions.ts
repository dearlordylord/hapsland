import * as Effect from "effect/Effect"
import type { FinalizationSession } from "@hapsland/review-execution/direct-event/preparation"
import { performFinalizationAsync } from "@hapsland/review-execution/direct-event/preparation"
import { createNativeSessionRegistry } from "@hapsland/runtime-environment/runtime/native-session-registry"
import { performGraphServiceEffect } from "@hapsland/source-analysis/direct-event/graph-resolution"
import { hostNatural } from "@hapsland/source-artifacts/direct-event/value/codec"
import type { createBendResolver } from "@hapsland/source-analysis/direct-event/graph-resolution"
import type {
  createSourcePreparationProvider,
  PreparationSession
} from "../preparation/source-preparation-provider.mjs"
import type { createPostPreparationProvider } from "../preparation/post-preparation-host.mjs"
import type { createAdviceTailProvider } from "../evaluation/advice-tail-provider.mjs"
import type { Request, ForeignOptions } from "./owned-artifact-driver.mjs"
import type { Reply } from "./owned-machine.mjs"

// The five existing native protocols share invocation resource custody. Their
// command/reply types and exact session objects remain with their owners.
type GraphSession = Parameters<Parameters<typeof createBendResolver>[0]["drive"]>[0]
type SourceSession = ReturnType<typeof createSourcePreparationProvider>
type PostSession = ReturnType<typeof createPostPreparationProvider>
type AdviceSession = ReturnType<typeof createAdviceTailProvider>
export type PreparationNativeSession =
  | FinalizationSession
  | GraphSession
  | SourceSession
  | PostSession
  | AdviceSession
  | PreparationSession

export const createPreparationSessionRegistry = () => createNativeSessionRegistry<PreparationNativeSession>()

const sourceSession = (session: PreparationNativeSession): session is SourceSession =>
  "input" in session && "sourcePreparation" in session.input
const preparationSession = (session: PreparationNativeSession): session is PreparationSession =>
  "input" in session && "preparation" in session.input
const postSession = (session: PreparationNativeSession): session is PostSession =>
  "input" in session && "postPreparation" in session.input
const adviceSession = (session: PreparationNativeSession): session is AdviceSession =>
  "input" in session && "adviceTail" in session.input

/** Mechanical request/session correlation at the existing closed ABI seam.
 * Reject wrong-family lookups before any provider performs an effect. No native
 * session is reconstructed, wrapped, or stored in another registry.
 */
export function performPreparationSessionRequest(
  registry: ReturnType<typeof createPreparationSessionRegistry>,
  request: Request,
  options: ForeignOptions
): Effect.Effect<Reply> {
  return Effect.suspend((): Effect.Effect<Reply> => {
    const { signal: requestedSignal, ...execution } = options
    const signal = requestedSignal === undefined ? {} : { signal: requestedSignal }
    const session = registry.get(hostNatural(request.invocation))
    if (!session) throw new TypeError("Unknown owned service invocation")
    if ("finalization" in request) {
      if (!("input" in session && "finalization" in session.input))
        throw new TypeError("Wrong finalization service session")
      return Effect.promise(() => performFinalizationAsync(request))
    }
    if ("operation" in request) {
      if ("input" in session) throw new TypeError("Wrong graph service session")
      return performGraphServiceEffect(session, request, options)
    }
    const command = request.command
    switch (command.$) {
      case "StartPolicySource":
      case "StartObservation":
      case "AwaitBackendGate":
      case "ReadRuntimeActive":
      case "DecodeControlled":
      case "ReadCredentialRequired":
      case "CheckCredentialShape":
      case "VerifyObservationRoot":
      case "CheckCredentialGeneration":
      case "ReleaseJobReservation":
      case "CheckJobActive":
      case "RecordPreparationFailureAnalytics":
      case "RecordUnavailableActivity":
      case "ReadEffectiveAnalytics":
      case "CheckCandidateActive":
      case "AdmitCandidateWorkspace":
      case "PrepareCandidate":
      case "ObserveCandidateDiagnostic":
      case "RejectCandidateCapacity":
      case "RecordCandidateAnalytics":
      case "RecordCandidateUnavailable":
      case "ReadExpectedActivity":
      case "RecordPendingActivity":
      case "CompletePolicySource":
      case "CompleteObservation":
      case "AfterPrepare":
        if (!sourceSession(session)) throw new TypeError("Wrong source service session")
        return session.performEffect({ ...request, command }, { ...execution, ...signal })
      case "ObservePreparation":
      case "CheckActive":
      case "ReleaseWorkspace":
      case "Offer":
      case "ReportDeliverabilityCapacity":
      case "ReportDeliverabilityNotice":
      case "ReportEmptyAnalytics":
      case "ReportEmptyActivity":
      case "ObserveReady":
      case "LookupReuse":
      case "ReadCached":
      case "ReadPending":
      case "RestorePending":
      case "ObservePlans":
      case "RecordReuseAnalytics":
      case "OwnerBarrier":
      case "CompletePreparation":
      case "RegisterClear":
      case "ReleaseClear":
      case "ReadLiveAdvice":
      case "PublishJoinedAdvice":
      case "RecordJoinedOutcomes":
      case "ReadCurrentAdvice":
      case "ReadJoinedPending":
      case "AppendJoined":
      case "RememberExpected":
      case "RecordReuseActivity":
      case "JoinedBarrier":
      case "RegisterRevision":
      case "RegisterWork":
      case "ObserveUnit":
      case "AttachOwner":
      case "Enqueue":
      case "StartCachedReview":
      case "CompleteCachedReview":
      case "RecordCachedActivity":
      case "CheckCachedActive":
      case "ReadCachedAdvice":
      case "RetireCachedWork":
      case "ReleaseCachedUnit":
      case "InsertCachedAdvice":
      case "ObserveRetainedAdvice":
      case "PreserveAdviceTail":
      case "AwaitAdviceTail":
      case "FinalizeCachedUnit":
      case "ReleaseAttached":
      case "ReleaseUnspawned":
      case "ReportCapacity":
      case "Cleanup":
        if (!postSession(session)) throw new TypeError("Wrong post-preparation service session")
        return session.performEffect({ ...request, command }, { ...execution, ...signal })
      case "AdvicePendingBarrier":
      case "AdviceCheckActive":
      case "AdvicePublish":
      case "AdviceRecordPublished":
      case "AdviceCheckExpired":
      case "AdviceRemove":
        if (!adviceSession(session)) throw new TypeError("Wrong advice service session")
        return session.performEffect({ ...request, command }, { ...execution, ...signal })
      case "InspectPath":
      case "CaptureSource":
      case "Preflight":
      case "RejectMaterializationCapacity":
      case "RecordMaterializationCapacity":
      case "AdmitMaterialization":
      case "ExtractSource":
      case "VerifyNativePatch":
      case "ClassifyAmbiguity":
      case "ResolveRoot":
      case "RenderUnits":
        if (!preparationSession(session)) throw new TypeError("Wrong preparation service session")
        if (!options.ownerLease) throw new TypeError("Preparation request lacks its owner lease")
        return session.performEffect(
          { ...request, command },
          { ...execution, ...signal, ownerLease: options.ownerLease }
        )
    }
    const unsupported: never = command
    throw new TypeError(`Unsupported owned service command: ${String(unsupported)}`)
  })
}
