import type { SetupClient } from "./client-selection.ts"

export type UpdateScope = SetupClient | "resident"

export type UpdateOutcome = "updated" | "already current" | "skipped" | "partial" | "busy" | "indeterminate" | "failed"
export type UpdateAgent = {
  host: UpdateScope
  digest?: string
  outcome?: UpdateOutcome
  activation?: "complete" | "failed"
}
export type UpdateModel = {
  phase:
    | "Discovering"
    | "Targeting"
    | "Previewing"
    | "Review"
    | "Approval"
    | "Applying"
    | "Activating"
    | "Done"
    | "Cancelled"
  revision: number
  agents: readonly UpdateAgent[]
  discoveryFailures: readonly UpdateScope[]
  cursor: number
  activationReturn?: "Previewing" | "Applying"
}
export type UpdateAction =
  | { kind: "discovered"; commandId: number; hosts: readonly UpdateScope[]; failures: readonly UpdateScope[] }
  | { kind: "targeted"; commandId: number }
  | {
      kind: "previewed"
      commandId: number
      host: UpdateScope
      result: { kind: "proposal"; digest: string } | { kind: "current" | "failed" | "busy" | "indeterminate" }
    }
  | { kind: "continue" | "back" | "exit" }
  | { kind: "approve"; yes: boolean; proposals: readonly { host: UpdateScope; digest: string }[] }
  | { kind: "observed"; commandId: number; host: UpdateScope; outcome: Exclude<UpdateOutcome, "skipped"> }
  | { kind: "activated"; commandId: number; host: UpdateScope; result: "complete" | "failed" }
export type UpdateEvent = { revision: number; action: UpdateAction }
export type UpdateCommand =
  | { kind: "discover"; id: number }
  | { kind: "target"; id: number }
  | { kind: "preview"; id: number; host: UpdateScope }
  | { kind: "activate"; id: number; host: UpdateScope }
  | { kind: "apply"; id: number; host: UpdateScope; digest: string }
export const initialUpdate = (): UpdateModel => ({
  phase: "Discovering",
  revision: 0,
  agents: [],
  discoveryFailures: [],
  cursor: 0
})
export const updateProposals = (model: UpdateModel) =>
  model.agents.flatMap((agent) => (agent.digest === undefined ? [] : [{ host: agent.host, digest: agent.digest }]))
export const updateCommand = (model: UpdateModel): UpdateCommand | undefined => {
  if (model.phase === "Discovering") return { kind: "discover", id: model.revision }
  if (model.phase === "Targeting") return { kind: "target", id: model.revision }
  const agent = model.agents[model.cursor]
  if (!agent) return undefined
  if (model.phase === "Previewing") return { kind: "preview", id: model.revision, host: agent.host }
  if (model.phase === "Activating") return { kind: "activate", id: model.revision, host: agent.host }
  if (model.phase === "Applying" && agent.digest)
    return { kind: "apply", id: model.revision, host: agent.host, digest: agent.digest }
  return undefined
}
const move = (model: UpdateModel, phase: UpdateModel["phase"], patch: Partial<UpdateModel> = {}): UpdateModel => ({
  ...model,
  ...patch,
  phase,
  revision: model.revision + 1
})
const patchAgent = (model: UpdateModel, patch: Partial<UpdateAgent>) =>
  model.agents.map((item, index) => (index === model.cursor ? { ...item, ...patch } : item))
const nextPreview = (model: UpdateModel, agents: readonly UpdateAgent[]) =>
  move(
    model,
    model.cursor + 1 < agents.length ? "Previewing" : agents.some((item) => item.digest) ? "Review" : "Done",
    { agents, cursor: model.cursor + 1 }
  )
const nextApply = (model: UpdateModel, agents: readonly UpdateAgent[]) => {
  const cursor = agents.findIndex(
    (item, index) => index > model.cursor && item.digest !== undefined && item.outcome === undefined
  )
  return move(model, cursor < 0 ? "Done" : "Applying", { agents, cursor })
}
const skipProposals = (model: UpdateModel) =>
  model.agents.map((item) =>
    item.digest && item.outcome === undefined ? { ...item, outcome: "skipped" as const } : item
  )
const navigate = (model: UpdateModel, action: UpdateAction): UpdateModel => {
  if (action.kind === "back") return model.phase === "Approval" ? move(model, "Review") : model
  return model.phase === "Review" || model.phase === "Approval"
    ? move(model, "Cancelled", { agents: skipProposals(model) })
    : model
}
const discovered = (model: UpdateModel, action: UpdateAction): UpdateModel => {
  if (action.kind !== "discovered" || new Set(action.hosts).size !== action.hosts.length) return model
  return move(model, action.hosts.length ? "Targeting" : "Done", {
    agents: action.hosts.map((host) => ({ host })),
    discoveryFailures: [...new Set(action.failures)]
  })
}
const previewed = (model: UpdateModel, action: UpdateAction): UpdateModel => {
  if (action.kind !== "previewed" || action.host !== model.agents[model.cursor]?.host) return model
  if (action.result.kind === "proposal")
    return /^[a-f0-9]{64}$/.test(action.result.digest)
      ? nextPreview(model, patchAgent(model, { digest: action.result.digest }))
      : model
  if (action.result.kind === "current")
    return move(model, "Activating", {
      agents: patchAgent(model, { outcome: "already current" }),
      activationReturn: "Previewing"
    })
  return nextPreview(model, patchAgent(model, { outcome: action.result.kind }))
}
const sameProposals = (model: UpdateModel, approvals: readonly { host: UpdateScope; digest: string }[]) => {
  const proposals = updateProposals(model)
  return (
    proposals.length === approvals.length &&
    proposals.every(
      (proposal, index) => proposal.host === approvals[index]?.host && proposal.digest === approvals[index]?.digest
    )
  )
}
const approved = (model: UpdateModel, action: UpdateAction): UpdateModel => {
  if (action.kind !== "approve" || !sameProposals(model, action.proposals)) return model
  if (!action.yes) return move(model, "Done", { agents: skipProposals(model) })
  return move(model, "Applying", { cursor: model.agents.findIndex((item) => item.digest !== undefined) })
}
const observed = (model: UpdateModel, action: UpdateAction): UpdateModel => {
  if (action.kind !== "observed" || action.host !== model.agents[model.cursor]?.host) return model
  const agents = patchAgent(model, { outcome: action.outcome })
  return ["updated", "already current", "partial"].includes(action.outcome)
    ? move(model, "Activating", { agents, activationReturn: "Applying" })
    : nextApply(model, agents)
}
const activated = (model: UpdateModel, action: UpdateAction): UpdateModel => {
  if (action.kind !== "activated" || action.host !== model.agents[model.cursor]?.host) return model
  const agents = patchAgent(model, { activation: action.result })
  return model.activationReturn === "Previewing" ? nextPreview(model, agents) : nextApply(model, agents)
}
const terminal = (model: UpdateModel) => model
const transitions: Record<UpdateModel["phase"], (model: UpdateModel, action: UpdateAction) => UpdateModel> = {
  Discovering: discovered,
  Targeting: (model, action) => (action.kind === "targeted" ? move(model, "Previewing") : model),
  Previewing: previewed,
  Review: (model, action) => (action.kind === "continue" ? move(model, "Approval") : model),
  Approval: approved,
  Applying: observed,
  Activating: activated,
  Done: terminal,
  Cancelled: terminal
}
export function reduceUpdate(model: UpdateModel, event: UpdateEvent): UpdateModel {
  const action = event.action
  if (event.revision !== model.revision || ("commandId" in action && action.commandId !== model.revision)) return model
  if (action.kind === "back" || action.kind === "exit") return navigate(model, action)
  return transitions[model.phase](model, action)
}
