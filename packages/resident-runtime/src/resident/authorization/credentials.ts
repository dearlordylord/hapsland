import { readCredentialState } from "@hapsland/runtime-inputs/credentials/state"
import { providerEnvironmentOnly } from "@hapsland/runtime-environment/runtime/backend"
import type { ReviewSettingsSnapshot } from "@hapsland/review-definition/runtime/review-settings"
import type { ResidentDispatchContext } from "@hapsland/resident-transport/resident/protocol"
import type { ControlledDecisionModelOptions } from "@hapsland/review-execution/review-execution/controlled-decision-model"

type CredentialAuthorityFacts = {
  readonly credentialRequired: boolean
  readonly credentialStatePath: string | null
  readonly credentialGeneration: number | null
  readonly credentialEnvironmentOnly: boolean
}
export const residentCredentialRequired = (controlled: ControlledDecisionModelOptions | undefined): boolean =>
  controlled === undefined || controlled.requireCredential === true
export const residentCredentialShapeMatches = (
  dispatch: ResidentDispatchContext,
  name: string,
  required: boolean
): boolean => !required || (dispatch.credential?.name === name && dispatch.credential !== null)
export const residentCredentialGenerationCurrent = (dispatch: ResidentDispatchContext, required: boolean): boolean =>
  !required ||
  dispatch.credential === null ||
  readCredentialState(dispatch.credential.statePath).generation === dispatch.credential.generation
export const residentSettingsEnvironmentOnly = (settings: ReviewSettingsSnapshot): boolean =>
  providerEnvironmentOnly(settings.backend) ||
  settings.configuration.policy.credentialEnvVar.origin.layer !== "built-in"
export function residentCredentialAuthority(authority: CredentialAuthorityFacts): boolean {
  if (!authority.credentialRequired) return true
  const credentialState =
    authority.credentialStatePath === null ? undefined : readCredentialState(authority.credentialStatePath)
  return (
    credentialState !== undefined &&
    credentialState.generation === authority.credentialGeneration &&
    (authority.credentialEnvironmentOnly || !credentialState.savedUseSuspended)
  )
}
export function residentAdviceCredentialAuthority(advice: CredentialAuthorityFacts): boolean {
  if (advice.credentialStatePath === null) return !advice.credentialRequired
  const state = readCredentialState(advice.credentialStatePath)
  return (
    state !== undefined &&
    state.generation === advice.credentialGeneration &&
    (advice.credentialEnvironmentOnly || !state.savedUseSuspended)
  )
}
