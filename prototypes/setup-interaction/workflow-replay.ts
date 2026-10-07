// Prototype: safe diagram projection; this does not execute or govern workflows.
import { Effect } from "effect"
export type ReplayStep = {
  from: string
  to: string
  event: string
  revision: number
  nextRevision: number
  commandId?: number
}
export type Observe = (step: ReplayStep) => Effect.Effect<void>
export const unobserved: Observe = () => Effect.void
export const replayStep = (
  before: { phase: string; revision: number },
  after: { phase: string; revision: number },
  event: { kind: string; commandId?: number },
  label = event.kind
): ReplayStep => ({
  from: before.phase,
  to: after.phase,
  event: label,
  revision: before.revision,
  nextRevision: after.revision,
  ...(event.commandId === undefined ? {} : { commandId: event.commandId })
})

// Synchronous publication keeps safe state and its transition in one execution turn.
// This observes state only; owners and captured credentials never enter this seam.
export type PublishState<Model> = (model: Model) => void
export const ignoreState = () => {}
