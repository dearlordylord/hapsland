import { getMaintenanceCommand, bindMaintenanceReducer } from "@hapsland/canonical-policy/canonical/maintenance-adapter"
import type { SetupClient } from "./client-selection.ts"

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
export const maintenanceEffectCommand: (model: MaintenanceModel) => MaintenanceEffectCommand | undefined =
  getMaintenanceCommand

const move = (
  model: MaintenanceModel,
  phase: MaintenanceModel["phase"],
  patch: Partial<MaintenanceModel> = {}
): MaintenanceModel => ({ ...model, ...patch, phase, revision: model.revision + 1 })
const patchAgent = (model: MaintenanceModel, patch: Partial<MaintenanceAgent>) =>
  model.agents.map((agent, index) => (index === model.cursor ? { ...agent, ...patch } : agent))
const nextPatch = (model: MaintenanceModel, phase: MaintenanceModel["phase"], patch: Partial<MaintenanceAgent>) =>
  move(model, phase, { agents: patchAgent(model, patch), cursor: model.cursor + 1 })
const requireAction = <Kind extends MaintenanceAction["kind"]>(
  action: MaintenanceAction,
  kind: Kind
): Extract<MaintenanceAction, { kind: Kind }> => {
  if (action.kind !== kind) throw new TypeError("Maintenance materializer requires " + kind)
  return action as Extract<MaintenanceAction, { kind: Kind }>
}
const requireProposal = (action: MaintenanceAction) => {
  const preview = requireAction(action, "previewed")
  if (preview.result.kind !== "proposal") throw new TypeError("Maintenance materializer requires a proposal")
  return preview.result
}
const matchesCurrent = (model: MaintenanceModel, event: MaintenanceEvent) => {
  const action = event.action
  if (event.revision !== model.revision || ("commandId" in action && action.commandId !== model.revision)) return false
  return !("host" in action) || action.host === model.agents[model.cursor]?.host
}
export const reduceMaintenance: (model: MaintenanceModel, event: MaintenanceEvent) => MaintenanceModel =
  bindMaintenanceReducer<MaintenanceModel, MaintenanceAction>(
    matchesCurrent,
    (action) =>
      action.kind === "previewed"
        ? action.result.kind === "proposal"
          ? "proposalPreviewed"
          : "outcomePreviewed"
        : action.kind,
    {
      unique: (_model, action) => action.kind === "discovered" && new Set(action.hosts).size === action.hosts.length,
      nonempty: (_model, action) => action.kind === "discovered" && action.hosts.length > 0,
      reinstall: (model) => model.command === "reinstall",
      validDigest: (_model, action) =>
        action.kind === "previewed" && action.result.kind === "proposal" && /^[a-f0-9]{64}$/.test(action.result.digest),
      digestMatches: (model, action) =>
        action.kind === "approve" && action.digest === model.agents[model.cursor]?.digest,
      yes: (_model, action) => action.kind === "approve" && action.yes,
      activate: (model, action) =>
        action.kind === "observed" &&
        model.agents[model.cursor]?.operation !== "uninstall" &&
        ["restored", "partial"].includes(action.outcome),
      more: (model) => model.cursor + 1 < model.agents.length
    },
    {
      no: (model, _action, phase) => move(model, phase),
      discovered: (model, action, phase) => {
        const discovered = requireAction(action, "discovered")
        return move(model, phase, {
          agents: discovered.hosts.map((host) => ({ host })),
          discoveryFailures: [...new Set(discovered.failures)]
        })
      },
      inspected: (model, action, phase) => {
        const inspected = requireAction(action, "inspected")
        return move(model, phase, {
          agents: patchAgent(model, { operation: inspected.operation, recovering: inspected.recovering })
        })
      },
      digest: (model, action, phase) =>
        move(model, phase, { agents: patchAgent(model, { digest: requireProposal(action).digest }) }),
      outcomeNext: (model, action, phase) => {
        const preview = requireAction(action, "previewed")
        if (preview.result.kind === "proposal")
          throw new TypeError("Maintenance outcome materializer received proposal")
        return nextPatch(model, phase, { outcome: preview.result.kind })
      },
      skippedNext: (model, _action, phase) => nextPatch(model, phase, { outcome: "skipped" }),
      observedActivate: (model, action, phase) =>
        move(model, phase, { agents: patchAgent(model, { outcome: requireAction(action, "observed").outcome }) }),
      observedNext: (model, action, phase) =>
        nextPatch(model, phase, { outcome: requireAction(action, "observed").outcome }),
      activatedNext: (model, action, phase) =>
        nextPatch(model, phase, { activation: requireAction(action, "activated").result }),
      emptyActivation: (model, action, phase) =>
        move(model, phase, { emptyActivation: requireAction(action, "activatedEmpty").result }),
      skipPending: (model, _action, phase) =>
        move(model, phase, {
          agents: model.agents.map((agent) => (agent.outcome === undefined ? { ...agent, outcome: "skipped" } : agent))
        }),
      failedNext: (model, _action, phase) => nextPatch(model, phase, { outcome: "failed" })
    }
  )
