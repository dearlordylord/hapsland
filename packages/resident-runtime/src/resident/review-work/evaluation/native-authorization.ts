import * as Effect from "effect/Effect"
import { resolveCredential } from "@hapsland/credential-storage/credentials/owner"
import { verifyObservationRoot } from "@hapsland/native-observation/direct-event/adapter"
import {
  resolvedDirectFilePolicy,
  selectedByDirectFilePolicy
} from "@hapsland/native-observation/direct-event/selection"
import { canonicalValue } from "@hapsland/review-definition/direct-event/model"
import type { ControlledDecisionModelOptions } from "@hapsland/review-execution/review-execution/controlled-decision-model"
import { admitReview } from "@hapsland/runtime-inputs/configuration/decision"
import { effectiveSessionAnalytics } from "@hapsland/runtime-inputs/configuration/resolve"
import { readCredentialState } from "@hapsland/runtime-inputs/credentials/state"
import { ResidentAdapterError } from "../../adapter-error.ts"
import { residentSettingsEnvironmentOnly } from "../../authorization/credentials.ts"
import type { createResidentOwnerTransaction } from "../../state/resolver-custody/resident-owner-transaction.mjs"
import type { ProviderLease } from "../../state/resolver-custody/provider-authority.ts"
import type { JevRequestIdentity } from "../request-observation.ts"
import type { EvaluationContext } from "./context.ts"
import type { AuthorizationCommand, AuthorizationResponse } from "./evaluation-core.js"
import { recordRequestObservation } from "./observation.ts"

type Needs =
  | "residentCredentialRequired"
  | "residentCredentialShapeMatches"
  | "residentDispatchControls"
  | "residentObserveDispatchAuthority"
  | "residentIsCurrentWork"
  | "residentJobActive"
  | "residentObserveJevRequest"
  | "residentRecordAnalytics"

export const makeEvaluationAuthorizationSession = (options: {
  readonly context: Pick<EvaluationContext<Needs>, "deps" | "job">
  readonly bridge: Pick<ReturnType<typeof createResidentOwnerTransaction>, "evaluationReady">
  readonly identity: JevRequestIdentity
  readonly controlled: () => ControlledDecisionModelOptions | undefined
  readonly armInterruption: () => Effect.Effect<void>
}) => {
  const { context, bridge } = options
  const { deps, job } = context
  let credential: Effect.Success<ReturnType<typeof resolveCredential>> | undefined
  let fileAdmission: { readonly selected: boolean; readonly admission: ReturnType<typeof admitReview> } | undefined
  const credentialObservation = () =>
    ({
      credentialStatus: credential?.status ?? "not-required",
      credentialGeneration: credential?.generation ?? null
    }) satisfies Pick<
      Parameters<typeof deps.residentObserveDispatchAuthority>[1],
      "credentialStatus" | "credentialGeneration"
    >
  const ack = (): AuthorizationResponse => ({ $: "Authorization.Ack" })
  const flag = (value: boolean): AuthorizationResponse => ({ $: "Authorization.Flag", value })
  const observe = (stage: "issued" | "unavailable", request?: number) =>
    recordRequestObservation({ ...context, identity: options.identity }, stage, request)
  const ready = Effect.fn("ResidentRuntime.evaluationAuthorizationReady")(function* (
    lease: ProviderLease,
    facts: {
      readonly credential_ready: boolean
      readonly selected: boolean
      readonly current_work: boolean
      readonly physical_available: boolean
    },
    verified: boolean
  ) {
    const result = yield* bridge.evaluationReady(
      lease,
      {
        partition: job.partition,
        operation: job.canonicalOperationId,
        round: job.canonicalRound,
        reservation: job.reservation
      },
      {
        $: "EvaluationFacts",
        root_valid: verified,
        configuration_valid: verified,
        credential_ready: facts.credential_ready,
        selected: facts.selected,
        current_work: facts.current_work,
        physical_available: facts.physical_available
      }
    )
    const decision = result.value
    if (decision.status === "issued") {
      job.requestId = decision.request
      return {
        $: "Authorization.RequestDecision",
        decision: { $: "Authorization.Issued", request: decision.request }
      } satisfies AuthorizationResponse
    }
    return {
      $: "Authorization.RequestDecision",
      decision: { $: decision.status === "unavailable" ? "Authorization.Unavailable" : "Authorization.Stale" }
    } satisfies AuthorizationResponse
  })
  const perform = Effect.fn("ResidentRuntime.evaluationAuthorizationCommand")(function* (
    command: AuthorizationCommand,
    lease: ProviderLease
  ): Effect.fn.Return<AuthorizationResponse, ResidentAdapterError> {
    switch (command.$) {
      case "Authorization.ReadEffectiveAnalytics":
        job.analyticsEnabled = effectiveSessionAnalytics(job.settings.configuration.policy)
        return ack()
      case "Authorization.ValidateControlled":
        return flag(job.dispatch.controlled === null || options.controlled() !== undefined)
      case "Authorization.ReadCredentialRequired":
        return flag(deps.residentCredentialRequired(options.controlled()))
      case "Authorization.CheckCredentialShape":
        return flag(deps.residentCredentialShapeMatches(job.dispatch, job.settings.credentialEnvVar, command.required))
      case "Authorization.VerifyInitialRoot":
      case "Authorization.VerifyDispatchRoot":
        return flag(yield* verifyObservationRoot(job.observation))
      case "Authorization.AuthorizationBarrier":
        yield* deps.residentDispatchControls
          .atBoundary("authorized")
          .pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "authorization barrier" })))
        return ack()
      case "Authorization.ResolveCredential": {
        const dispatch = job.dispatch.credential
        credential =
          !command.required || dispatch === null
            ? undefined
            : yield* resolveCredential({
                envVar: dispatch.name,
                environmentOnly: residentSettingsEnvironmentOnly(job.settings),
                environmentValue: dispatch.environmentValue,
                expectedGeneration: dispatch.generation,
                statePath: dispatch.statePath
              })
        return { $: "Authorization.Resolved", present: credential?.status === "present" }
      }
      case "Authorization.CheckCredentialGeneration": {
        if (credential?.status !== "present") return flag(true)
        const current = readCredentialState(job.dispatch.credential?.statePath)
        return flag(
          current.generation === credential.generation && !(credential.source === "saved" && current.savedUseSuspended)
        )
      }
      case "Authorization.CredentialBarrier":
        yield* deps.residentDispatchControls
          .atBoundary("credentialResolved")
          .pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "credential barrier" })))
        return ack()
      case "Authorization.CheckCredentialName":
        return flag(
          !command.required ||
            job.dispatch.credential?.name === job.settings.configuration.policy.credentialEnvVar.value
        )
      case "Authorization.CheckProviderIdentity":
        return flag(
          canonicalValue(job.prepared.input.providerIdentity) === canonicalValue(job.settings.providerIdentity)
        )
      case "Authorization.ObserveRootRefusal":
        yield* deps.residentObserveDispatchAuthority(job, {
          decision: "deny",
          reason: "physical-root-mismatch",
          policyDigest: job.settings.configuration.policy.digest,
          selected: null,
          admission: "refuseRoot",
          physicalRootVerified: false,
          ...credentialObservation()
        })
        return ack()
      case "Authorization.ReadFileAdmission": {
        const selected = selectedByDirectFilePolicy(
          job.prepared.input.path,
          resolvedDirectFilePolicy(job.settings.configuration.policy)
        )
        const admission = admitReview({
          rootValid: true,
          configurationValid: true,
          credentialReady: command.credential_ready,
          selected
        })
        fileAdmission = { selected, admission }
        return { $: "Authorization.FileAdmission", selected, admitted: admission === "admitReview" }
      }
      case "Authorization.ObserveFileAdmission": {
        if (
          fileAdmission === undefined ||
          command.selected !== fileAdmission.selected ||
          command.admitted !== (fileAdmission.admission === "admitReview")
        )
          throw new Error("evaluation authorization observation lacks its file admission")
        yield* deps.residentObserveDispatchAuthority(job, {
          decision: command.admitted ? "allow" : "deny",
          reason: command.admitted ? "selected-by-file-policy" : "excluded-by-file-policy",
          policyDigest: job.settings.configuration.policy.digest,
          selected: fileAdmission.selected,
          admission: fileAdmission.admission,
          physicalRootVerified: true,
          ...credentialObservation()
        })
        return ack()
      }
      case "Authorization.ReadCurrentWork":
        return flag(yield* deps.residentIsCurrentWork(job.revision, job.prepared))
      case "Authorization.ReadPhysicalAvailable":
        return flag(yield* deps.residentJobActive(job))
      case "Authorization.ReadyRequest":
        return yield* ready(lease, command.facts, true)
      case "Authorization.DenyRequest":
        return yield* ready(
          lease,
          { credential_ready: false, selected: false, current_work: false, physical_available: false },
          false
        )
      case "Authorization.ObserveIssued":
        yield* observe("issued", command.request)
        return ack()
      case "Authorization.ObserveUnavailable":
        yield* observe("unavailable")
        return ack()
      case "Authorization.ArmInterruption":
        yield* options.armInterruption()
        return ack()
      default: {
        const exhaustive: never = command
        return exhaustive
      }
    }
  })
  return { perform, credential: () => credential }
}
