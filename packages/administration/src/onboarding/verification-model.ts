import {
  verificationCheckLimit,
  verificationCommandKind,
  verificationNavigationIndex,
  getVerificationNavigationRoutes,
  verificationAttemptBucket,
  verificationSourceId,
  verificationResultId,
  type VerificationPlan
} from "@hapsland/canonical-policy/canonical/verification-adapter"
import type { CredentialLifecycleResult } from "@hapsland/credential-storage/credentials/owner"

export const MAX_KEY_CHECKS = verificationCheckLimit
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
  const kind = verificationCommandKind(model.phase)
  if (kind === undefined) return undefined
  return kind === "check" ? { kind, id: model.revision, keyRevision: model.keyRevision } : { kind, id: model.revision }
}

const move = (
  model: VerificationModel,
  phase: VerificationModel["phase"],
  patch: Partial<VerificationModel> = {}
): VerificationModel => ({ ...model, ...patch, phase, revision: model.revision + 1 })
type Materialize = (model: VerificationModel, action: VerificationAction) => VerificationModel
const materialize = (plan: VerificationPlan): Materialize => {
  if (plan.kind === "hold") return (model) => model
  const phase = plan.phase
  switch (plan.patch) {
    case "none":
      return (model) => move(model, phase)
    case "unavailable":
      return (model) => move(model, phase, { eligibility: "unavailable" })
    case "loaded":
      return (model, action) => {
        if (action.kind !== "loaded") throw new TypeError("Verification loaded patch requires a load observation")
        return move(model, phase, {
          source: action.source,
          eligibility: action.eligibility,
          keyRevision: model.keyRevision + 1
        })
      }
    case "attempt":
      return (model, action) => {
        if (action.kind !== "approve") throw new TypeError("Verification attempt patch requires approval")
        return move(model, phase, { attempts: model.attempts + 1 })
      }
    case "observation":
      return (model, action) => {
        if (action.kind !== "observed" || model.source === undefined)
          throw new TypeError("Verification observation patch requires a current source")
        return move(model, phase, {
          observations: [
            ...model.observations,
            { attempt: model.attempts, source: model.source, result: action.result }
          ]
        })
      }
    case "storage":
      return (model, action) => {
        if (action.kind !== "stored") throw new TypeError("Verification storage patch requires a save observation")
        return move(model, phase, { storage: action.storage })
      }
  }
}
// Map native values to source-free facts. Bucketing selects a plan; actual counts stay native.
const facts = {
  attempts: (model: VerificationModel) => verificationAttemptBucket(model.attempts),
  source: (model: VerificationModel) => verificationSourceId(model.source),
  ready: (_: VerificationModel, action: VerificationAction) =>
    Number(action.kind === "loaded" && action.eligibility === "ready"),
  result: (_: VerificationModel, action: VerificationAction) =>
    verificationResultId(action.kind === "observed" ? action.result : "accepted"),
  yes: (_: VerificationModel, action: VerificationAction) => Number("yes" in action && action.yes),
  stored: (_: VerificationModel, action: VerificationAction) =>
    Number(action.kind === "stored" && action.storage.status === "stored")
}
const prepareReducers = () =>
  getVerificationNavigationRoutes().map((route) => {
    const applications = route.plans.map(materialize)
    const axes = route.axes.map((axis) => ({ read: facts[axis.name], radix: axis.radix }))
    if (axes.length === 0) return applications[0]!
    return (model: VerificationModel, action: VerificationAction) => {
      let index = 0
      for (const axis of axes) index = index * axis.radix + axis.read(model, action)
      return applications[index]!(model, action)
    }
  })
let reducers: ReturnType<typeof prepareReducers> | undefined
export const reduceVerification = (model: VerificationModel, event: VerificationEvent): VerificationModel => {
  const action = event.action
  if (
    event.revision !== model.revision ||
    ("commandId" in action && action.commandId !== model.revision) ||
    ("keyRevision" in action && action.keyRevision !== model.keyRevision)
  )
    return model
  reducers ??= prepareReducers()
  return reducers[verificationNavigationIndex(model.phase, action.kind)]!(model, action)
}
