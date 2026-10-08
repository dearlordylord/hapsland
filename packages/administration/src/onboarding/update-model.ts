import {
  getUpdateNativeCommand,
  bindUpdateReducers,
  type UpdatePatch
} from "@hapsland/canonical-policy/canonical/update-adapter"
import type { SetupClient } from "./client-selection.ts"

export type UpdateOutcome = "updated" | "already current" | "skipped" | "partial" | "busy" | "indeterminate" | "failed"
export type UpdateAgent = {
  host: SetupClient
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
  discoveryFailures: readonly SetupClient[]
  cursor: number
  activationReturn?: "Previewing" | "Applying"
}
export type UpdateAction =
  | { kind: "discovered"; commandId: number; hosts: readonly SetupClient[]; failures: readonly SetupClient[] }
  | { kind: "targeted"; commandId: number }
  | {
      kind: "previewed"
      commandId: number
      host: SetupClient
      result: { kind: "proposal"; digest: string } | { kind: "current" | "failed" | "busy" | "indeterminate" }
    }
  | { kind: "continue" | "back" | "exit" }
  | { kind: "approve"; yes: boolean; proposals: readonly { host: SetupClient; digest: string }[] }
  | { kind: "observed"; commandId: number; host: SetupClient; outcome: Exclude<UpdateOutcome, "skipped"> }
  | { kind: "activated"; commandId: number; host: SetupClient; result: "complete" | "failed" }
export type UpdateEvent = { revision: number; action: UpdateAction }
export type UpdateCommand =
  | { kind: "discover"; id: number }
  | { kind: "target"; id: number }
  | { kind: "preview"; id: number; host: SetupClient }
  | { kind: "activate"; id: number; host: SetupClient }
  | { kind: "apply"; id: number; host: SetupClient; digest: string }
export const initialUpdate = (): UpdateModel => ({
  phase: "Discovering",
  revision: 0,
  agents: [],
  discoveryFailures: [],
  cursor: 0
})
export const updateProposals = (model: UpdateModel) =>
  model.agents.flatMap((agent) => (agent.digest === undefined ? [] : [{ host: agent.host, digest: agent.digest }]))
export const updateCommand: (model: UpdateModel) => UpdateCommand | undefined = getUpdateNativeCommand
const move = (model: UpdateModel, phase: UpdateModel["phase"], patch: Partial<UpdateModel> = {}): UpdateModel => ({
  ...model,
  ...patch,
  phase,
  revision: model.revision + 1
})
const patchAgent = (model: UpdateModel, patch: Partial<UpdateAgent>) =>
  model.agents.map((item, index) => (index === model.cursor ? { ...item, ...patch } : item))
const nextApplyCursor = (model: UpdateModel) =>
  model.agents.findIndex(
    (item, index) => index > model.cursor && item.digest !== undefined && item.outcome === undefined
  )
const skipProposals = (model: UpdateModel) =>
  model.agents.map((item) =>
    item.digest && item.outcome === undefined ? { ...item, outcome: "skipped" as const } : item
  )
const sameProposals = (model: UpdateModel, approvals: readonly { host: SetupClient; digest: string }[]) => {
  const proposals = updateProposals(model)
  return (
    proposals.length === approvals.length &&
    proposals.every(
      (proposal, index) => proposal.host === approvals[index]?.host && proposal.digest === approvals[index]?.digest
    )
  )
}
// Bend-derived leaves select a payload materializer and phase directly.
const materializers = {
  no: (model: UpdateModel, action: UpdateAction, phase: UpdateModel["phase"]): UpdateModel => {
    return move(model, phase)
  },
  discovered: (model: UpdateModel, action: UpdateAction, phase: UpdateModel["phase"]): UpdateModel => {
    const discovery = action as Extract<UpdateAction, { kind: "discovered" }>
    return move(model, phase, {
      agents: discovery.hosts.map((host) => ({ host })),
      discoveryFailures: [...new Set(discovery.failures)]
    })
  },
  previewProposal: (model: UpdateModel, action: UpdateAction, phase: UpdateModel["phase"]): UpdateModel => {
    const proposal = action as { kind: "previewed"; result: { kind: "proposal"; digest: string } }
    return move(model, phase, {
      agents: patchAgent(model, { digest: proposal.result.digest }),
      cursor: model.cursor + 1
    })
  },
  previewOutcome: (model: UpdateModel, action: UpdateAction, phase: UpdateModel["phase"]): UpdateModel => {
    const preview = action as { kind: "previewed"; result: { kind: "failed" | "busy" | "indeterminate" } }
    return move(model, phase, { agents: patchAgent(model, { outcome: preview.result.kind }), cursor: model.cursor + 1 })
  },
  currentPreview: (model: UpdateModel, action: UpdateAction, phase: UpdateModel["phase"]): UpdateModel => {
    return move(model, phase, {
      agents: patchAgent(model, { outcome: "already current" }),
      activationReturn: "Previewing"
    })
  },
  skipped: (model: UpdateModel, action: UpdateAction, phase: UpdateModel["phase"]): UpdateModel => {
    return move(model, phase, { agents: skipProposals(model) })
  },
  beginApply: (model: UpdateModel, action: UpdateAction, phase: UpdateModel["phase"]): UpdateModel => {
    return move(model, phase, { cursor: model.agents.findIndex((item) => item.digest !== undefined) })
  },
  observedApply: (model: UpdateModel, action: UpdateAction, phase: UpdateModel["phase"]): UpdateModel => {
    const observation = action as Extract<UpdateAction, { kind: "observed" }>
    return move(model, phase, {
      agents: patchAgent(model, { outcome: observation.outcome }),
      cursor: nextApplyCursor(model)
    })
  },
  observedActivate: (model: UpdateModel, action: UpdateAction, phase: UpdateModel["phase"]): UpdateModel => {
    const observation = action as Extract<UpdateAction, { kind: "observed" }>
    return move(model, phase, {
      agents: patchAgent(model, { outcome: observation.outcome }),
      activationReturn: "Applying"
    })
  },
  activatedPreview: (model: UpdateModel, action: UpdateAction, phase: UpdateModel["phase"]): UpdateModel => {
    const activation = action as Extract<UpdateAction, { kind: "activated" }>
    return move(model, phase, {
      agents: patchAgent(model, { activation: activation.result }),
      cursor: model.cursor + 1
    })
  },
  activatedApply: (model: UpdateModel, action: UpdateAction, phase: UpdateModel["phase"]): UpdateModel => {
    const activation = action as Extract<UpdateAction, { kind: "activated" }>
    return move(model, phase, {
      agents: patchAgent(model, { activation: activation.result }),
      cursor: nextApplyCursor(model)
    })
  }
} satisfies Readonly<
  Record<UpdatePatch, (model: UpdateModel, action: UpdateAction, phase: UpdateModel["phase"]) => UpdateModel>
>
const facts = {
  unique: (_: UpdateModel, action: UpdateAction) => {
    const hosts = (action as Extract<UpdateAction, { kind: "discovered" }>).hosts
    return Number(new Set(hosts).size === hosts.length)
  },
  nonempty: (_: UpdateModel, action: UpdateAction) =>
    Number((action as Extract<UpdateAction, { kind: "discovered" }>).hosts.length > 0),
  matched: (model: UpdateModel, action: UpdateAction) =>
    Number((action as { host: SetupClient }).host === model.agents[model.cursor]?.host),
  validDigest: (_: UpdateModel, action: UpdateAction) =>
    Number(/^[a-f0-9]{64}$/.test((action as { result: { digest: string } }).result.digest)),
  more: (model: UpdateModel) => Number(model.cursor + 1 < model.agents.length),
  proposals: (model: UpdateModel, action: UpdateAction) =>
    Number(
      model.agents.some((item, index) =>
        Boolean(
          action.kind === "previewed" && action.result.kind === "proposal" && index === model.cursor
            ? action.result.digest
            : item.digest
        )
      )
    ),
  pending: (model: UpdateModel) => Number(nextApplyCursor(model) >= 0),
  approvalsMatch: (model: UpdateModel, action: UpdateAction) =>
    Number(sameProposals(model, (action as Extract<UpdateAction, { kind: "approve" }>).proposals)),
  yes: (_: UpdateModel, action: UpdateAction) => Number((action as Extract<UpdateAction, { kind: "approve" }>).yes),
  returnPreview: (model: UpdateModel) => Number(model.activationReturn === "Previewing")
}
const prepareReducers = () =>
  bindUpdateReducers(
    facts,
    (action: UpdateAction) =>
      action.kind === "previewed" ? action.result.kind : action.kind === "observed" ? action.outcome : undefined,
    materializers
  )
let reducers: ReturnType<typeof prepareReducers> | undefined
export const reduceUpdate = (model: UpdateModel, event: UpdateEvent): UpdateModel => {
  const action = event.action
  if (event.revision !== model.revision || ("commandId" in action && action.commandId !== model.revision)) return model
  reducers ??= prepareReducers()
  return reducers(model, action)
}
