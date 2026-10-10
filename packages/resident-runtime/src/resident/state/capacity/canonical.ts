import { projectCanonical, stepCanonical } from "@hapsland/canonical-policy/canonical/adapter"
import { type CapacityDraft, type ResidentTransition, type CapacityState } from "./model.ts"

export function dispatchScope(
  draft: CapacityDraft,
  namedCount: number,
  cancelledCount: number,
  hasUnnamed: boolean
): boolean {
  const result = transition(draft, { kind: "dispatchScopeCheck", namedCount, cancelledCount, hasUnnamed })
  if (result.rejection !== undefined || result.outputs.length !== 1) throw new Error("canonical dispatch scope refused")
  const command = result.outputs[0]
  if (command?.kind === "discardNamedOnly") return true
  if (command?.kind === "discardAllUnfinished") return false
  throw new Error("invalid canonical dispatch scope command")
}
export function transition(
  draft: CapacityDraft,
  event: ResidentTransition,
  commitNative?: (
    result: ReturnType<typeof stepCanonical> & { readonly projection: ReturnType<typeof projectCanonical> }
  ) => void
): ReturnType<typeof stepCanonical> {
  const result = stepCanonical(draft.canonical, event)
  if (result.rejection === undefined) {
    commitNative?.({ ...result, projection: projectCanonical(result.state) })
    draft.canonical = result.state
  }
  return result
}
export function canonicalProjection(draft: CapacityState): ReturnType<typeof projectCanonical> {
  return projectCanonical(draft.canonical)
}
