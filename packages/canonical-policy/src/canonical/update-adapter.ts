import {
  updateNativeCommand,
  updateBindReducers,
  updateNavigationTable,
  updateRoutes,
  type UpdatePlan as BendPlan,
  type UpdateAxis
} from "@hapsland/agent-flow-bend/update-policy"
const phases = [
  "Discovering",
  "Targeting",
  "Previewing",
  "Review",
  "Approval",
  "Applying",
  "Activating",
  "Done",
  "Cancelled"
] as const
export type UpdatePhase = (typeof phases)[number]
export type UpdateNativeActionKind =
  | "discovered"
  | "targeted"
  | "previewed"
  | "continue"
  | "approve"
  | "observed"
  | "activated"
  | "back"
  | "exit"
export type UpdatePlan =
  | Readonly<{ kind: "hold" }>
  | Readonly<{
      kind: "advance"
      phase: UpdatePhase
      patch:
        | "no"
        | "discovered"
        | "previewProposal"
        | "previewOutcome"
        | "currentPreview"
        | "skipped"
        | "beginApply"
        | "observedApply"
        | "observedActivate"
        | "activatedPreview"
        | "activatedApply"
    }>
export type UpdatePatch = Extract<UpdatePlan, { kind: "advance" }>["patch"]
const phaseIds = Object.fromEntries(phases.map((phase, index) => [phase, index])) as Record<UpdatePhase, number>
const patchNames = {
  UpdateNoPatch: "no",
  UpdateDiscoveredPatch: "discovered",
  UpdatePreviewProposalPatch: "previewProposal",
  UpdatePreviewOutcomePatch: "previewOutcome",
  UpdateCurrentPreviewPatch: "currentPreview",
  UpdateSkippedPatch: "skipped",
  UpdateBeginApplyPatch: "beginApply",
  UpdateObservedApplyPatch: "observedApply",
  UpdateObservedActivatePatch: "observedActivate",
  UpdateActivatedPreviewPatch: "activatedPreview",
  UpdateActivatedApplyPatch: "activatedApply"
} as const
const dimensions = {
  unique: 2,
  nonempty: 2,
  matched: 2,
  validDigest: 2,
  more: 2,
  proposals: 2,
  pending: 2,
  approvalsMatch: 2,
  yes: 2,
  returnPreview: 2
} as const
const decodePlan = (plan: BendPlan): UpdatePlan => {
  if (plan.$ === "UpdateHold") return Object.freeze({ kind: "hold" })
  if (plan.$ !== "UpdateAdvance") throw new TypeError("Unknown update plan")
  const phase = plan.phase.$.slice(6) as UpdatePhase
  if (typeof phaseIds[phase] !== "number" || !Object.hasOwn(patchNames, plan.patch.$))
    throw new TypeError("Unknown update transition")
  return Object.freeze({ kind: "advance", phase, patch: patchNames[plan.patch.$] })
}
const prepareNavigationRoutes = () =>
  Object.freeze(
    updateRoutes.map((route) => {
      const seen = new Set<UpdateAxis>()
      const axes = route.axes.map((axis) => {
        if (!Object.hasOwn(dimensions, axis.name) || axis.radix !== dimensions[axis.name] || seen.has(axis.name))
          throw new TypeError("Unknown update fact axis")
        seen.add(axis.name)
        return Object.freeze({ name: axis.name, radix: axis.radix })
      })
      if (route.plans.length !== axes.reduce((length, axis) => length * axis.radix, 1))
        throw new TypeError("Incomplete update route")
      return Object.freeze({ axes: Object.freeze(axes), plans: Object.freeze(route.plans.map(decodePlan)) })
    })
  )
let navigationRoutes: ReturnType<typeof prepareNavigationRoutes> | undefined
export const getUpdateNavigationRoutes = () => (navigationRoutes ??= prepareNavigationRoutes())
export type UpdateSelection = number | Readonly<Record<string, number>>
const nativeVariants = {
  discovered: [],
  targeted: [],
  continue: [],
  approve: [],
  activated: [],
  back: [],
  exit: [],
  previewed: ["proposal", "current", "failed", "busy", "indeterminate"],
  observed: ["updated", "already current", "partial", "busy", "indeterminate", "failed"]
} as const
const prepareNavigationTable = () => {
  const routes = getUpdateNavigationRoutes()
  const valid = (index: number) => {
    if (!Number.isInteger(index) || routes[index] === undefined) throw new TypeError("Unknown update route")
    return index
  }
  return Object.freeze(
    Object.fromEntries(
      phases.map((phase) => {
        const source = updateNavigationTable[phase]
        if (!source || Object.keys(source).length !== Object.keys(nativeVariants).length)
          throw new TypeError("Incomplete update navigation")
        return [
          phase,
          Object.freeze(
            Object.fromEntries(
              Object.entries(nativeVariants).map(([kind, variants]) => {
                const selection = source[kind]
                if (typeof selection === "number") return [kind, valid(selection)]
                if (!selection || Object.keys(selection).length !== variants.length || variants.length === 0)
                  throw new TypeError("Incomplete update variants")
                return [kind, Object.freeze(Object.fromEntries(variants.map((tag) => [tag, valid(selection[tag]!)])))]
              })
            )
          )
        ]
      })
    )
  ) as Readonly<Record<UpdatePhase, Readonly<Record<UpdateNativeActionKind, UpdateSelection>>>>
}
let navigationTable: ReturnType<typeof prepareNavigationTable> | undefined
export const getUpdateNavigationTable = () => (navigationTable ??= prepareNavigationTable())
export const getUpdateNativeCommand = updateNativeCommand

export const bindUpdateReducers = <
  Model extends { readonly phase: UpdatePhase },
  Action extends { readonly kind: UpdateNativeActionKind }
>(
  facts: Readonly<Record<UpdateAxis, (model: Model, action: Action) => number>>,
  readTag: (action: Action) => string | undefined,
  apply: Readonly<Record<UpdatePatch, (model: Model, action: Action, phase: UpdatePhase) => Model>>
) => {
  getUpdateNavigationTable()
  return Object.freeze(updateBindReducers(facts, readTag, apply)) as (model: Model, action: Action) => Model
}
