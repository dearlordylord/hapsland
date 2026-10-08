import type { SetupProgressObservation } from "./setup.ts"
import type { VerificationOutcome } from "./verification-conversation.ts"

// Only safe owner observations enter the model. Credential values and raw owner
// records stay inside the interpreter and the existing setup/credential owners.
type ObservedStage = Pick<SetupProgressObservation["stages"][number], "stage" | "status">
export type SetupObservation = {
  status: string
  stages: readonly ObservedStage[]
  credential?: { status: string; generation?: number }
  installDigest?: string
  rulesDigest?: string
}
export type SetupModel = {
  phase:
    | "Previewing"
    | "HookApproval"
    | "RulesApproval"
    | "Applying"
    | "Activating"
    | "Verifying"
    | "Diagnosing"
    | "Done"
    | "Cancelled"
    | "Back"
    | "Failed"
  revision: number
  progressSequence: number
  observations: readonly SetupObservation[]
  proposal?: SetupObservation
  installApproved?: string | undefined
  rulesApproved?: string | undefined
  activation: "not-attempted" | "completed" | "failed"
  verification?: VerificationOutcome
  readiness?: string
  exitCode: number
}
export type SetupAction =
  | { kind: "progressed"; commandId: number; sequence: number; observation: SetupObservation }
  | { kind: "previewed" | "applied"; commandId: number; observation: SetupObservation }
  | { kind: "approveHooks" | "approveRules"; digest: string; yes: boolean }
  | { kind: "activated" | "stale" | "failed"; commandId: number }
  | { kind: "verified"; commandId: number; outcome: VerificationOutcome }
  | { kind: "diagnosed"; commandId: number; status: string; succeeded: boolean }
  | { kind: "back" | "exit" }
export type SetupEvent = { revision: number; action: SetupAction }
export type SetupCommand = { kind: "preview" | "apply" | "activate" | "verify" | "diagnose"; id: number }
export const initialSetup = (): SetupModel => ({
  phase: "Previewing",
  revision: 0,
  progressSequence: 0,
  observations: [],
  activation: "not-attempted",
  exitCode: 0
})
export const setupCommand = (model: SetupModel): SetupCommand | undefined => {
  const kinds = {
    Previewing: "preview",
    Applying: "apply",
    Activating: "activate",
    Verifying: "verify",
    Diagnosing: "diagnose"
  } as const
  return model.phase in kinds ? { kind: kinds[model.phase as keyof typeof kinds], id: model.revision } : undefined
}
const move = (model: SetupModel, phase: SetupModel["phase"], patch: Partial<SetupModel> = {}): SetupModel => ({
  ...model,
  ...patch,
  progressSequence: 0,
  phase,
  revision: model.revision + 1
})
export const setupStageStatus = (
  observation: SetupObservation | undefined,
  stage: ObservedStage["stage"]
): ObservedStage["status"] | undefined => observation?.stages.find((item) => item.stage === stage)?.status
const installationCanProceed = (status: ObservedStage["status"] | undefined): boolean =>
  status === "complete" || status === "pending" || status === "partial"
const installationWasWritten = (status: ObservedStage["status"] | undefined): boolean =>
  status === "complete" || status === "partial"
const approvalPhase = (observation: SetupObservation): SetupModel["phase"] =>
  observation.installDigest ? "HookApproval" : observation.rulesDigest ? "RulesApproval" : "Applying"
const previewed = (model: SetupModel, observation: SetupObservation): SetupModel => {
  const patch = {
    proposal: observation,
    observations: [...model.observations, observation],
    installApproved: undefined,
    rulesApproved: undefined
  }
  if (setupStageStatus(observation, "compatibility") !== "complete")
    return move(model, "Done", { ...patch, exitCode: 3 })
  if (!installationCanProceed(setupStageStatus(observation, "installation")))
    return move(model, "Done", { ...patch, exitCode: observation.status === "partial" ? 5 : 4 })
  return move(model, approvalPhase(observation), patch)
}
export const setupObservationReady = (observation: SetupObservation | undefined): boolean => {
  const ready = (["installation", "credential", "repository"] as const).every(
    (stage) => setupStageStatus(observation, stage) === "complete"
  )
  const rules = setupStageStatus(observation, "rules")
  return ready && (rules === undefined || rules === "complete" || rules === "skipped")
}

const afterActivation = (model: SetupModel): SetupModel => {
  const observation = model.observations.at(-1)
  if (observation?.credential?.status === "cancelled") return move(model, "Cancelled")
  const ready = setupObservationReady(observation)
  return move(model, ready ? "Verifying" : "Done", { exitCode: ready ? 0 : observation?.status === "partial" ? 5 : 6 })
}
const applied = (model: SetupModel, observation: SetupObservation): SetupModel => {
  const next = { ...model, observations: [...model.observations, observation] }
  // Activation completes the already authorized installation even when hidden
  // input was cancelled. Cancellation then stops input, verification and doctor.
  if (installationWasWritten(setupStageStatus(observation, "installation"))) return move(next, "Activating")
  if (observation.credential?.status === "cancelled") return move(next, "Cancelled")
  // A changed owner proposal is a fresh preview, never an automatic retry.
  if (setupStageStatus(observation, "installation") === "pending" && observation.installDigest !== undefined)
    return move(next, approvalPhase(observation), {
      proposal: observation,
      installApproved: undefined,
      rulesApproved: undefined
    })
  return afterActivation(next)
}
const approveHooks = (model: SetupModel, action: SetupAction): SetupModel => {
  if (action.kind !== "approveHooks" || action.digest !== model.proposal?.installDigest) return model
  if (!action.yes) return move(model, "Done")
  return move(model, model.proposal?.rulesDigest ? "RulesApproval" : "Applying", { installApproved: action.digest })
}
const approveRules = (model: SetupModel, action: SetupAction): SetupModel => {
  if (action.kind !== "approveRules" || action.digest !== model.proposal?.rulesDigest) return model
  return action.yes ? move(model, "Applying", { rulesApproved: action.digest }) : move(model, "Done")
}
const progress = (model: SetupModel, action: Extract<SetupAction, { kind: "progressed" }>): SetupModel => {
  if (action.sequence !== model.progressSequence + 1) return model
  return { ...model, progressSequence: action.sequence, observations: [...model.observations, action.observation] }
}
const applying = (model: SetupModel, action: SetupAction): SetupModel => {
  if (action.kind === "progressed") return progress(model, action)
  if (action.kind === "applied") return applied(model, action.observation)
  if (action.kind === "stale")
    return move(model, "Previewing", { installApproved: undefined, rulesApproved: undefined })
  return model
}
const unchanged = (model: SetupModel) => model
const transitions: Record<SetupModel["phase"], (model: SetupModel, action: SetupAction) => SetupModel> = {
  Previewing: (model, action) => (action.kind === "previewed" ? previewed(model, action.observation) : model),
  HookApproval: approveHooks,
  RulesApproval: approveRules,
  Applying: applying,
  Activating: (model, action) =>
    action.kind === "activated" ? afterActivation({ ...model, activation: "completed" }) : model,
  Verifying: (model, action) =>
    action.kind === "verified"
      ? move(model, action.outcome.kind === "cancelled" ? "Cancelled" : "Diagnosing", { verification: action.outcome })
      : model,
  Diagnosing: (model, action) =>
    action.kind === "diagnosed"
      ? move(model, "Done", { readiness: action.status, exitCode: action.succeeded ? 0 : 6 })
      : model,
  Done: unchanged,
  Cancelled: unchanged,
  Back: unchanged,
  Failed: unchanged
}
const navigate = (model: SetupModel, action: SetupAction): SetupModel => {
  if (!["HookApproval", "RulesApproval"].includes(model.phase)) return model
  if (action.kind === "exit") return move(model, "Cancelled")
  return move(model, model.phase === "RulesApproval" ? "Previewing" : "Back", {
    installApproved: undefined,
    rulesApproved: undefined
  })
}
const failed = (model: SetupModel): SetupModel =>
  setupCommand(model)
    ? move(model, "Failed", { exitCode: 6, activation: model.phase === "Activating" ? "failed" : model.activation })
    : model
const matches = (model: SetupModel, event: SetupEvent): boolean => {
  if (event.revision !== model.revision) return false
  return !("commandId" in event.action) || event.action.commandId === model.revision
}
export const reduceSetup = (model: SetupModel, event: SetupEvent): SetupModel => {
  if (!matches(model, event)) return model
  const action = event.action
  if (action.kind === "back" || action.kind === "exit") return navigate(model, action)
  if (action.kind === "failed") return failed(model)
  return transitions[model.phase](model, action)
}
