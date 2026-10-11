import type { SetupClient } from "../../../packages/administration/src/onboarding/client-selection.ts"

export type MaintenanceCommand = "repair" | "reinstall" | "uninstall"
export type MaintenanceOperation = "install" | "update" | "uninstall"
export type MaintenanceOutcome =
  | "restored"
  | "removed"
  | "intact"
  | "already removed"
  | "skipped"
  | "partial"
  | "busy"
  | "indeterminate"
  | "failed"
export type MaintenanceAgent = {
  host: SetupClient
  operation?: MaintenanceOperation
  recovering?: boolean
  digest?: string
  outcome?: MaintenanceOutcome
  activation?: "complete" | "failed"
}
export type MaintenanceModel = {
  command: MaintenanceCommand
  phase:
    | "Discovering"
    | "Inspecting"
    | "Previewing"
    | "Review"
    | "Approval"
    | "Applying"
    | "Activating"
    | "ActivatingEmpty"
    | "Done"
    | "Cancelled"
  revision: number
  agents: readonly MaintenanceAgent[]
  discoveryFailures: readonly SetupClient[]
  cursor: number
  emptyActivation?: "complete" | "failed"
}
export type MaintenanceAction =
  | { kind: "discovered"; commandId: number; hosts: readonly SetupClient[]; failures: readonly SetupClient[] }
  | { kind: "inspected"; commandId: number; host: SetupClient; operation: MaintenanceOperation; recovering: boolean }
  | { kind: "failed"; commandId: number; host: SetupClient }
  | {
      kind: "previewed"
      commandId: number
      host: SetupClient
      result:
        | { kind: "proposal"; digest: string }
        | { kind: "intact" | "already removed" | "partial" | "busy" | "indeterminate" | "failed" }
    }
  | { kind: "continue" | "back" | "exit" }
  | { kind: "approve"; host: SetupClient; digest: string; yes: boolean }
  | { kind: "observed"; commandId: number; host: SetupClient; outcome: MaintenanceOutcome }
  | { kind: "activated"; commandId: number; host: SetupClient; result: "complete" | "failed" }
  | { kind: "activatedEmpty"; commandId: number; result: "complete" | "failed" }
export type MaintenanceEvent = { revision: number; action: MaintenanceAction }
export type MaintenanceEffectCommand =
  | { kind: "discover"; id: number }
  | { kind: "inspect"; id: number; host: SetupClient }
  | { kind: "preview"; id: number; host: SetupClient; operation: MaintenanceOperation }
  | { kind: "apply"; id: number; host: SetupClient; operation: MaintenanceOperation; digest: string }
  | { kind: "activate"; id: number; host: SetupClient }
  | { kind: "activateEmpty"; id: number }
export const initialMaintenance = (command: MaintenanceCommand): MaintenanceModel => ({
  command,
  phase: "Discovering",
  revision: 0,
  agents: [],
  discoveryFailures: [],
  cursor: 0
})
const agentCommand = (model: MaintenanceModel, agent: MaintenanceAgent): MaintenanceEffectCommand | undefined => {
  if (model.phase === "Inspecting") return { kind: "inspect", id: model.revision, host: agent.host }
  if (model.phase === "Activating") return { kind: "activate", id: model.revision, host: agent.host }
  if (!agent.operation) return undefined
  if (model.phase === "Previewing")
    return { kind: "preview", id: model.revision, host: agent.host, operation: agent.operation }
  if (model.phase === "Applying" && agent.digest)
    return { kind: "apply", id: model.revision, host: agent.host, operation: agent.operation, digest: agent.digest }
  return undefined
}
export const maintenanceEffectCommand = (model: MaintenanceModel): MaintenanceEffectCommand | undefined => {
  if (model.phase === "Discovering") return { kind: "discover", id: model.revision }
  if (model.phase === "ActivatingEmpty") return { kind: "activateEmpty", id: model.revision }
  const agent = model.agents[model.cursor]
  return agent ? agentCommand(model, agent) : undefined
}

const move = (
  model: MaintenanceModel,
  phase: MaintenanceModel["phase"],
  patch: Partial<MaintenanceModel> = {}
): MaintenanceModel => ({ ...model, ...patch, phase, revision: model.revision + 1 })
const patchAgent = (model: MaintenanceModel, patch: Partial<MaintenanceAgent>) =>
  model.agents.map((agent, index) => (index === model.cursor ? { ...agent, ...patch } : agent))
const next = (model: MaintenanceModel, patch: Partial<MaintenanceAgent>) =>
  move(model, model.cursor + 1 < model.agents.length ? "Inspecting" : "Done", {
    agents: patchAgent(model, patch),
    cursor: model.cursor + 1
  })
const discovered = (model: MaintenanceModel, action: MaintenanceAction) => {
  if (action.kind !== "discovered" || new Set(action.hosts).size !== action.hosts.length) return model
  return move(model, action.hosts.length ? "Inspecting" : model.command === "reinstall" ? "ActivatingEmpty" : "Done", {
    agents: action.hosts.map((host) => ({ host })),
    discoveryFailures: [...new Set(action.failures)]
  })
}
const inspected = (model: MaintenanceModel, action: MaintenanceAction) =>
  action.kind === "inspected"
    ? move(model, "Previewing", {
        agents: patchAgent(model, { operation: action.operation, recovering: action.recovering })
      })
    : model
const previewed = (model: MaintenanceModel, action: MaintenanceAction) => {
  if (action.kind !== "previewed") return model
  if (action.result.kind !== "proposal") return next(model, { outcome: action.result.kind })
  return /^[a-f0-9]{64}$/.test(action.result.digest)
    ? move(model, "Review", { agents: patchAgent(model, { digest: action.result.digest }) })
    : model
}
const approved = (model: MaintenanceModel, action: MaintenanceAction) => {
  if (action.kind !== "approve" || action.digest !== model.agents[model.cursor]?.digest) return model
  return action.yes ? move(model, "Applying") : next(model, { outcome: "skipped" })
}
const observed = (model: MaintenanceModel, action: MaintenanceAction) => {
  if (action.kind !== "observed") return model
  return model.agents[model.cursor]?.operation !== "uninstall" && ["restored", "partial"].includes(action.outcome)
    ? move(model, "Activating", { agents: patchAgent(model, { outcome: action.outcome }) })
    : next(model, { outcome: action.outcome })
}
const unchanged = (model: MaintenanceModel) => model
const transitions: Record<
  MaintenanceModel["phase"],
  (model: MaintenanceModel, action: MaintenanceAction) => MaintenanceModel
> = {
  Discovering: discovered,
  Inspecting: inspected,
  Previewing: previewed,
  Review: (model, action) => (action.kind === "continue" ? move(model, "Approval") : model),
  Approval: approved,
  Applying: observed,
  Activating: (model, action) => (action.kind === "activated" ? next(model, { activation: action.result }) : model),
  ActivatingEmpty: (model, action) =>
    action.kind === "activatedEmpty" ? move(model, "Done", { emptyActivation: action.result }) : model,
  Done: unchanged,
  Cancelled: unchanged
}
const navigate = (model: MaintenanceModel, action: MaintenanceAction) => {
  if (action.kind === "back") return model.phase === "Approval" ? move(model, "Review") : model
  if (model.phase !== "Review" && model.phase !== "Approval") return model
  return move(model, "Cancelled", {
    agents: model.agents.map((agent) => (agent.outcome === undefined ? { ...agent, outcome: "skipped" } : agent))
  })
}
const matchesCurrent = (model: MaintenanceModel, event: MaintenanceEvent) => {
  const action = event.action
  if (event.revision !== model.revision || ("commandId" in action && action.commandId !== model.revision)) return false
  return !("host" in action) || action.host === model.agents[model.cursor]?.host
}
export const reduceMaintenance = (model: MaintenanceModel, event: MaintenanceEvent): MaintenanceModel => {
  const action = event.action
  if (!matchesCurrent(model, event)) return model
  if (action.kind === "back" || action.kind === "exit") return navigate(model, action)
  if (action.kind === "failed" && ["Inspecting", "Previewing", "Applying"].includes(model.phase))
    return next(model, { outcome: "failed" })
  return transitions[model.phase](model, action)
}
