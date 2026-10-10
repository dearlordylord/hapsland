import type { CredentialLifecycleResult } from "@hapsland/credential-storage/credentials/owner"

export const MAX_KEY_CHECKS = 3
export type KeyVerification = "accepted" | "rejected" | "forbidden" | "rate-limited" | "unconfirmed"
export type VerificationSource = "saved" | "file" | "environment"
export type VerificationModel = {
  phase:
    | "Loading"
    | "Approval"
    | "Checking"
    | "Recovery"
    | "ReplacementApproval"
    | "EnteringKey"
    | "SavingKey"
    | "Done"
    | "Cancelled"
  revision: number
  keyRevision: number
  attempts: number
  source?: VerificationSource
  eligibility?: "ready" | "unavailable" | "other provider"
  observations: readonly { attempt: number; source: VerificationSource; result: KeyVerification }[]
  storage?: { status: CredentialLifecycleResult["status"]; generation: number }
}
export type VerificationAction =
  | { kind: "loadFailed"; commandId: number }
  | {
      kind: "loaded"
      commandId: number
      source: VerificationSource
      eligibility: NonNullable<VerificationModel["eligibility"]>
    }
  | { kind: "approve"; keyRevision: number; yes: boolean }
  | { kind: "observed"; commandId: number; keyRevision: number; result: KeyVerification }
  | { kind: "recheck" | "replace" | "back" | "exit" }
  | { kind: "approveReplacement"; yes: boolean; keyRevision: number }
  | { kind: "entered" | "inputEnded"; commandId: number }
  | { kind: "stored"; commandId: number; storage: NonNullable<VerificationModel["storage"]> }
export type VerificationEvent = { revision: number; action: VerificationAction }
export type VerificationCommand =
  | { kind: "load"; id: number }
  | { kind: "check"; id: number; keyRevision: number }
  | { kind: "input"; id: number }
  | { kind: "save"; id: number }
export const initialVerification = (): VerificationModel => ({
  phase: "Loading",
  revision: 0,
  keyRevision: 0,
  attempts: 0,
  observations: []
})
export const verificationCommand = (model: VerificationModel): VerificationCommand | undefined => {
  switch (model.phase) {
    case "Loading":
      return { kind: "load", id: model.revision }
    case "Checking":
      return { kind: "check", id: model.revision, keyRevision: model.keyRevision }
    case "EnteringKey":
      return { kind: "input", id: model.revision }
    case "SavingKey":
      return { kind: "save", id: model.revision }
    default:
      return undefined
  }
}
const move = (
  model: VerificationModel,
  phase: VerificationModel["phase"],
  patch: Partial<VerificationModel> = {}
): VerificationModel => ({ ...model, ...patch, phase, revision: model.revision + 1 })
const loaded = (model: VerificationModel, action: VerificationAction) =>
  action.kind === "loaded"
    ? move(model, action.eligibility === "ready" && model.attempts < MAX_KEY_CHECKS ? "Approval" : "Done", {
        source: action.source,
        eligibility: action.eligibility,
        keyRevision: model.keyRevision + 1
      })
    : model
const approved = (model: VerificationModel, action: VerificationAction) => {
  if (action.kind !== "approve" || model.attempts >= MAX_KEY_CHECKS) return model
  return action.yes ? move(model, "Checking", { attempts: model.attempts + 1 }) : move(model, "Done")
}
const observed = (model: VerificationModel, action: VerificationAction) => {
  if (action.kind !== "observed" || model.source === undefined) return model
  const recoverable =
    ["rejected", "forbidden"].includes(action.result) &&
    model.source !== "environment" &&
    model.attempts < MAX_KEY_CHECKS
  return move(model, recoverable ? "Recovery" : "Done", {
    observations: [...model.observations, { attempt: model.attempts, source: model.source, result: action.result }]
  })
}
const recover = (model: VerificationModel, action: VerificationAction) => {
  if (action.kind === "recheck") return move(model, "Loading")
  return action.kind === "replace" && model.source === "saved" ? move(model, "ReplacementApproval") : model
}
const terminal = (model: VerificationModel) => model
const transitions: Record<
  VerificationModel["phase"],
  (model: VerificationModel, action: VerificationAction) => VerificationModel
> = {
  Loading: (model, action) =>
    action.kind === "loadFailed" ? move(model, "Done", { eligibility: "unavailable" }) : loaded(model, action),
  Approval: approved,
  Checking: observed,
  Recovery: recover,
  ReplacementApproval: (model, action) =>
    action.kind === "approveReplacement" ? move(model, action.yes ? "EnteringKey" : "Recovery") : model,
  EnteringKey: (model, action) =>
    action.kind === "entered"
      ? move(model, "SavingKey")
      : action.kind === "inputEnded"
        ? move(model, "Cancelled")
        : model,
  SavingKey: (model, action) =>
    action.kind === "stored"
      ? move(model, action.storage.status === "stored" ? "Loading" : "Done", { storage: action.storage })
      : model,
  Done: terminal,
  Cancelled: terminal
}
const navigate = (model: VerificationModel, action: VerificationAction) => {
  if (action.kind === "back")
    return model.phase === "ReplacementApproval" || (model.phase === "Approval" && model.attempts > 0)
      ? move(model, "Recovery")
      : model
  return ["Approval", "Recovery", "ReplacementApproval"].includes(model.phase) ? move(model, "Cancelled") : model
}
const matches = (model: VerificationModel, event: VerificationEvent) => {
  if (event.revision !== model.revision) return false
  const action = event.action
  if ("commandId" in action && action.commandId !== model.revision) return false
  return !("keyRevision" in action) || action.keyRevision === model.keyRevision
}
export const reduceVerification = (model: VerificationModel, event: VerificationEvent): VerificationModel => {
  if (!matches(model, event)) return model
  if (event.action.kind === "back" || event.action.kind === "exit") return navigate(model, event.action)
  return transitions[model.phase](model, event.action)
}
