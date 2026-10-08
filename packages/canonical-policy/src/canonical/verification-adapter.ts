import {
  verificationCommandName,
  verificationRouteIndex,
  verificationRoutes,
  verificationMaxChecks,
  verificationAttemptBucket as bendAttemptBucket,
  type VerificationPlan as BendPlan,
  type VerificationAxis
} from "@hapsland/agent-flow-bend/verification-policy"
const phases = [
  "Loading",
  "Approval",
  "Checking",
  "Recovery",
  "ReplacementApproval",
  "EnteringKey",
  "SavingKey",
  "Done",
  "Cancelled"
] as const
const actions = [
  "loadFailed",
  "loaded",
  "approve",
  "observed",
  "recheck",
  "replace",
  "back",
  "exit",
  "approveReplacement",
  "entered",
  "inputEnded",
  "stored"
] as const
export type VerificationPhase = (typeof phases)[number]
export type VerificationActionKind = (typeof actions)[number]
export type VerificationSourceName = "saved" | "file" | "environment"
export type VerificationResultName = "accepted" | "rejected" | "forbidden" | "rate-limited" | "unconfirmed"
export type VerificationCommandKind = "load" | "check" | "input" | "save"
export type VerificationPlan =
  | Readonly<{ kind: "hold" }>
  | Readonly<{
      kind: "advance"
      phase: VerificationPhase
      patch: "none" | "unavailable" | "loaded" | "attempt" | "observation" | "storage"
    }>
const phaseIds = Object.fromEntries(phases.map((phase, index) => [phase, index])) as Record<VerificationPhase, number>
const sourceIds = { saved: 1, file: 2, environment: 3 } as const
const resultIds = { accepted: 0, rejected: 1, forbidden: 2, "rate-limited": 3, unconfirmed: 4 } as const
const patchNames = {
  VerifyNoPatch: "none",
  VerifyUnavailablePatch: "unavailable",
  VerifyLoadedPatch: "loaded",
  VerifyAttemptPatch: "attempt",
  VerifyObservationPatch: "observation",
  VerifyStoragePatch: "storage"
} as const
const dimensions = { attempts: 4, source: 4, ready: 2, result: 5, yes: 2, stored: 2 } as const
const decodePlan = (plan: BendPlan): VerificationPlan => {
  if (plan.$ === "VerifyHold") return Object.freeze({ kind: "hold" })
  if (plan.$ !== "VerifyAdvance") throw new TypeError("Unknown verification plan")
  const phase = plan.phase.$.slice(6) as VerificationPhase
  if (typeof phaseIds[phase] !== "number" || !Object.hasOwn(patchNames, plan.patch.$))
    throw new TypeError("Unknown verification transition")
  return Object.freeze({ kind: "advance", phase, patch: patchNames[plan.patch.$] })
}
const prepareNavigationRoutes = () =>
  Object.freeze(
    verificationRoutes.map((route) => {
      const seen = new Set<VerificationAxis>()
      const axes = route.axes.map((axis) => {
        if (!Object.hasOwn(dimensions, axis.name) || axis.radix !== dimensions[axis.name] || seen.has(axis.name))
          throw new TypeError("Unknown verification fact axis")
        seen.add(axis.name)
        return Object.freeze({ name: axis.name, radix: axis.radix })
      })
      if (route.plans.length !== axes.reduce((length, axis) => length * axis.radix, 1))
        throw new TypeError("Incomplete verification route")
      return Object.freeze({ axes: Object.freeze(axes), plans: Object.freeze(route.plans.map(decodePlan)) })
    })
  )
let navigationRoutes: ReturnType<typeof prepareNavigationRoutes> | undefined
export const getVerificationNavigationRoutes = () => {
  if (navigationRoutes !== undefined) return navigationRoutes
  const routes = prepareNavigationRoutes()
  for (const phase of phases)
    for (const action of actions) {
      const index = verificationRouteIndex(phase, action)
      if (!Number.isInteger(index) || routes[index] === undefined) throw new TypeError("Unknown verification route")
    }
  navigationRoutes = routes
  return routes
}
export const verificationNavigationIndex: (phase: VerificationPhase, action: VerificationActionKind) => number =
  verificationRouteIndex
export const verificationCommandKind: (phase: VerificationPhase) => VerificationCommandKind | undefined =
  verificationCommandName
export const verificationCheckLimit = Number(verificationMaxChecks())
if (verificationCheckLimit !== 3) throw new TypeError("Verification check-limit ABI changed")
export const verificationAttemptBucket = (attempts: number): number => {
  if (!Number.isSafeInteger(attempts) || attempts < 0)
    throw new TypeError("Verification attempts must be a natural number")
  return bendAttemptBucket(attempts)
}
export const verificationSourceId = (source: VerificationSourceName | undefined): number => {
  if (source === undefined) return 0
  const id = sourceIds[source]
  if (typeof id !== "number") throw new TypeError("Unknown verification source")
  return id
}
export const verificationResultId = (result: VerificationResultName): number => {
  const id = resultIds[result]
  if (typeof id !== "number") throw new TypeError("Unknown verification result")
  return id
}
