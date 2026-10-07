// Prototype: per-agent maintenance consent and journal recovery; no real journal.
import { Effect, Terminal } from "effect"
import { createHash } from "node:crypto"
import type { Interaction } from "./interaction.ts"
import { replayStep, unobserved, ignoreState, type Observe, type PublishState } from "./workflow-replay.ts"
export type MaintenanceCommand = "repair" | "reinstall" | "uninstall"
export type MaintenanceOperation = "install" | "update" | "uninstall"
export type MaintenanceOutcome = "complete" | "partial" | "failed" | "declined" | "intact"
export type MaintenancePlan = {
  host: string
  operation: MaintenanceOperation
  recovered: boolean
  current: boolean
  digest: string
}
export type MaintenanceModel = {
  phase: "Discovering" | "Inspecting" | "Preview" | "Approval" | "Applying" | "Activating" | "Done" | "Cancelled"
  revision: number
  command: MaintenanceCommand
  hosts: string[]
  index: number
  plan?: MaintenancePlan
  results: Record<string, MaintenanceOutcome>
  activation: Record<string, "activated" | "failed">
  stale: boolean
}
export type MaintenanceAction =
  | { kind: "discovered"; commandId: number; hosts: string[]; packageActivation?: "activated" | "failed" }
  | { kind: "inspected"; commandId: number; plan: MaintenancePlan }
  | { kind: "continue" | "back" | "exit" }
  | { kind: "approve"; yes: boolean; digest: string }
  | { kind: "applied"; commandId: number; outcome: Exclude<MaintenanceOutcome, "declined" | "intact"> | "stale" }
  | { kind: "activated"; commandId: number; status: "activated" | "failed" }
export const initialMaintenance = (command: MaintenanceCommand = "repair"): MaintenanceModel => ({
  phase: "Discovering",
  revision: 0,
  command,
  hosts: [],
  index: 0,
  results: {},
  activation: {},
  stale: false
})
export function reduceMaintenance(
  model: MaintenanceModel,
  event: { revision: number; action: MaintenanceAction }
): MaintenanceModel {
  const action = event.action
  if (
    event.revision !== model.revision ||
    model.phase === "Done" ||
    model.phase === "Cancelled" ||
    ("commandId" in action && action.commandId !== model.revision)
  )
    return model
  const move = (phase: MaintenanceModel["phase"], patch: Partial<MaintenanceModel> = {}): MaintenanceModel => ({
    ...model,
    ...patch,
    phase,
    revision: model.revision + 1
  })
  const next = (patch: Partial<MaintenanceModel> = {}) =>
    move(model.index + 1 < model.hosts.length ? "Inspecting" : "Done", {
      index: model.index + 1,
      plan: undefined,
      stale: false,
      ...patch
    })
  const host = model.hosts[model.index]
  if (action.kind === "exit")
    return ["Applying", "Activating"].includes(model.phase) ? model : move("Cancelled", { plan: undefined })
  if (action.kind === "back")
    return model.phase === "Approval"
      ? move("Preview")
      : model.phase === "Preview"
        ? move("Inspecting", { plan: undefined })
        : model
  if (model.phase === "Discovering" && action.kind === "discovered")
    return move(action.hosts.length ? "Inspecting" : "Done", {
      hosts: action.hosts,
      ...(action.packageActivation ? { activation: { package: action.packageActivation } } : {})
    })
  if (model.phase === "Inspecting" && action.kind === "inspected" && action.plan.host === host)
    return action.plan.current
      ? next({ results: { ...model.results, [action.plan.host]: "intact" } })
      : move("Preview", { plan: action.plan })
  if (model.phase === "Preview" && action.kind === "continue") return move("Approval")
  if (model.phase === "Approval" && action.kind === "approve" && model.plan?.digest === action.digest && host)
    return action.yes ? move("Applying") : next({ results: { ...model.results, [host]: "declined" } })
  if (model.phase === "Applying" && action.kind === "applied" && host) {
    if (action.outcome === "stale") return move("Inspecting", { plan: undefined, stale: true })
    const results = { ...model.results, [host]: action.outcome }
    return model.plan?.operation !== "uninstall" && action.outcome !== "failed"
      ? move("Activating", { results })
      : next({ results })
  }
  if (model.phase === "Activating" && action.kind === "activated" && host)
    return next({ activation: { ...model.activation, [host]: action.status } })
  return model
}
export function fakeMaintenanceOwner(
  options: {
    hosts?: string[]
    recovered?: Record<string, MaintenanceOperation>
    outcomes?: Record<string, "complete" | "partial" | "failed">
    current?: string[]
    stale?: boolean
    activationFails?: boolean
  } = {}
) {
  let generation = 0,
    changed = false,
    writes = 0,
    activations = 0
  const operations: string[] = [],
    completed = new Map<string, "complete" | "partial" | "failed">()
  const plan = (host: string, command: MaintenanceCommand): MaintenancePlan => {
    const recovered = command === "repair" ? options.recovered?.[host] : undefined
    const operation =
      recovered ??
      (command === "uninstall" ? "uninstall" : command === "repair" && host === "Claude" ? "update" : "install")
    return {
      host,
      operation,
      recovered: recovered !== undefined,
      current: options.current?.includes(host) ?? false,
      digest: createHash("sha256").update(JSON.stringify({ host, command, operation, generation })).digest("hex")
    }
  }
  return {
    discover: () => Effect.succeed(options.hosts ?? ["Claude", "Codex"]),
    inspect: (host: string, command: MaintenanceCommand) => Effect.sync(() => plan(host, command)),
    apply: (approved: MaintenancePlan, command: MaintenanceCommand) =>
      Effect.sync((): "complete" | "partial" | "failed" | "stale" => {
        if (options.stale && !changed) {
          generation++
          changed = true
        }
        if (JSON.stringify(approved) !== JSON.stringify(plan(approved.host, command))) return "stale"
        const previous = completed.get(approved.digest)
        if (previous) return previous
        const result = options.outcomes?.[approved.host] ?? "complete"
        operations.push(`${approved.host}:${approved.operation}`)
        if (result !== "failed") writes++
        completed.set(approved.digest, result)
        return result
      }),
    activate: () =>
      Effect.sync((): "activated" | "failed" => {
        activations++
        return options.activationFails ? "failed" : "activated"
      }),
    observed: () => ({ writes, activations, operations: [...operations] })
  }
}
export type MaintenanceOwner = ReturnType<typeof fakeMaintenanceOwner>
const preview = (m: MaintenanceModel) =>
  `Maintenance preview (simulated): ${m.plan?.host} ${m.command}\nOperation: ${m.plan?.operation}; digest ${m.plan?.digest}.\n${m.plan?.recovered ? `Resume interrupted ${m.plan.operation}; rerun repair afterward if needed.` : "No interrupted journal operation."}\nPreserve independent hooks, settings and credentials. ${m.stale ? "Proposal changed; fresh consent required." : ""}`
export function runMaintenance(
  interaction: Interaction,
  owner: MaintenanceOwner,
  command: MaintenanceCommand = "repair",
  observe: Observe = unobserved,
  publish: PublishState<MaintenanceModel> = ignoreState
) {
  return Effect.gen(function* () {
    let model = initialMaintenance(command)
    publish(model)
    while (model.phase !== "Done" && model.phase !== "Cancelled") {
      yield* interaction.present(`Maintenance: ${model.phase} (simulated)\n`)
      const before = model,
        id = model.revision
      const step = Effect.gen(function* (): Effect.fn.Return<MaintenanceAction, Terminal.QuitError> {
        switch (model.phase) {
          case "Discovering": {
            const hosts = yield* owner.discover()
            const packageActivation = !hosts.length && command === "reinstall" ? yield* owner.activate() : undefined
            return { kind: "discovered", commandId: id, hosts, ...(packageActivation ? { packageActivation } : {}) }
          }
          case "Inspecting":
            return { kind: "inspected", commandId: id, plan: yield* owner.inspect(model.hosts[model.index]!, command) }
          case "Preview": {
            yield* interaction.present(preview(model) + "\n")
            const answer = yield* interaction.choose({
              message: "Review maintenance",
              choices: [{ title: "Continue to agent approval", value: "continue" }],
              back: false
            })
            return { kind: answer.kind === "selected" ? "continue" : "exit" }
          }
          case "Approval": {
            const answer = yield* interaction.confirm({
              message: `Apply ${command} to ${model.plan!.host}?`,
              preview: preview(model),
              back: true
            })
            return answer.kind === "confirmed"
              ? { kind: "approve", yes: answer.yes, digest: model.plan!.digest }
              : { kind: answer.kind }
          }
          case "Applying":
            return { kind: "applied", commandId: id, outcome: yield* owner.apply(model.plan!, command) }
          case "Activating":
            return { kind: "activated", commandId: id, status: yield* owner.activate() }
          default:
            return { kind: "exit" }
        }
      })
      const action = yield* step.pipe(
        Effect.catchTag("QuitError", () => Effect.succeed<MaintenanceAction>({ kind: "exit" }))
      )
      model = reduceMaintenance(before, { revision: id, action })
      publish(model)
      yield* observe(
        replayStep(
          before,
          model,
          action,
          action.kind === "approve" ? (action.yes ? "approve agent" : "decline agent") : action.kind
        )
      )
    }
    yield* interaction.present(
      `Maintenance outcome (simulated): ${JSON.stringify(model.results)}; activation ${JSON.stringify(model.activation)}.\nPartial operations require journal inspection; Back/Exit does not undo completed work.\nSettings and credentials are untouched by this prototype.\n`
    )
    return model
  })
}
