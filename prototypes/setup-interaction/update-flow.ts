// Prototype: grouped update consent; independent pure reducer and synthetic owner.
import { Effect, Terminal } from "effect"
import { createHash } from "node:crypto"
import type { Interaction } from "./interaction.ts"
import { replayStep, unobserved, type Observe } from "./workflow-replay.ts"
export type UpdateResult = "updated" | "already-current" | "partial" | "failed" | "declined"
export type UpdatePlan = { host: string; digest: string; current: boolean }
export type UpdateModel = {
  phase:
    | "Discovering"
    | "Staging"
    | "Previewing"
    | "Preview"
    | "Approval"
    | "Applying"
    | "Activating"
    | "Done"
    | "Cancelled"
  revision: number
  hosts: string[]
  plans: UpdatePlan[]
  results: Record<string, UpdateResult>
  retained: boolean
  activation?: "activated" | "failed"
  stale: boolean
}
export type UpdateAction =
  | { kind: "discovered"; commandId: number; hosts: string[] }
  | { kind: "staged"; commandId: number }
  | { kind: "previewed"; commandId: number; plans: UpdatePlan[]; activation?: "activated" | "failed" }
  | { kind: "continue" | "back" | "exit" }
  | { kind: "approve"; yes: boolean; digests: string[] }
  | { kind: "applied"; commandId: number; results: Record<string, UpdateResult>; stale: boolean }
  | { kind: "activated"; commandId: number; status: "activated" | "failed" }
export const initialUpdate = (): UpdateModel => ({
  phase: "Discovering",
  revision: 0,
  hosts: [],
  plans: [],
  results: {},
  retained: false,
  stale: false
})
export function reduceUpdate(model: UpdateModel, event: { revision: number; action: UpdateAction }): UpdateModel {
  if (event.revision !== model.revision || model.phase === "Done" || model.phase === "Cancelled") return model
  const action = event.action
  if ("commandId" in action && action.commandId !== model.revision) return model
  const move = (phase: UpdateModel["phase"], patch: Partial<UpdateModel> = {}): UpdateModel => ({
    ...model,
    ...patch,
    phase,
    revision: model.revision + 1
  })
  if (action.kind === "exit")
    return ["Applying", "Activating"].includes(model.phase) ? model : move("Cancelled", { plans: [] })
  if (action.kind === "back") {
    if (model.phase === "Approval") return move("Preview")
    if (model.phase === "Preview") return move("Previewing", { plans: [] })
    return model
  }
  if (model.phase === "Discovering" && action.kind === "discovered")
    return move(action.hosts.length ? "Staging" : "Done", { hosts: action.hosts })
  if (model.phase === "Staging" && action.kind === "staged") return move("Previewing", { retained: true })
  if (
    model.phase === "Previewing" &&
    action.kind === "previewed" &&
    action.plans.length === model.hosts.length &&
    model.hosts.every((host) => action.plans.filter((p) => p.host === host).length === 1)
  ) {
    const results = { ...model.results }
    for (const p of action.plans) if (p.current) results[p.host] = "already-current"
    return move(action.plans.every((p) => p.current) ? "Activating" : "Preview", {
      plans: action.plans,
      results,
      ...(action.activation ? { activation: action.activation } : {})
    })
  }
  if (model.phase === "Preview" && action.kind === "continue") return move("Approval")
  if (
    model.phase === "Approval" &&
    action.kind === "approve" &&
    JSON.stringify(action.digests) === JSON.stringify(model.plans.filter((p) => !p.current).map((p) => p.digest))
  ) {
    if (action.yes) return move("Applying")
    return move("Done", {
      results: Object.fromEntries(model.plans.map((p) => [p.host, p.current ? "already-current" : "declined"]))
    })
  }
  if (model.phase === "Applying" && action.kind === "applied")
    return action.stale
      ? move("Previewing", { plans: [], stale: true })
      : move(
          Object.values(action.results).some((r) => ["updated", "partial", "already-current"].includes(r))
            ? "Activating"
            : "Done",
          { results: action.results }
        )
  if (model.phase === "Activating" && action.kind === "activated") return move("Done", { activation: action.status })
  return model
}
export function fakeUpdateOwner(
  options: {
    hosts?: string[]
    outcomes?: Record<string, Exclude<UpdateResult, "declined">>
    stale?: boolean
    activationFails?: boolean
  } = {}
) {
  const hosts = options.hosts ?? ["Claude", "Codex"]
  let generation = 0,
    changed = false,
    writes = 0,
    staged = 0,
    activations = 0
  const completed = new Map<string, UpdateResult>()
  const plans = (): UpdatePlan[] =>
    hosts.map((host) => ({
      host,
      current: options.outcomes?.[host] === "already-current",
      digest: createHash("sha256").update(JSON.stringify({ host, generation })).digest("hex")
    }))
  return {
    discover: () => Effect.succeed([...hosts]),
    stage: () =>
      Effect.sync(() => {
        staged++
      }),
    preview: () => Effect.sync(plans),
    apply: (approved: UpdatePlan[]) =>
      Effect.sync(() => {
        if (options.stale && !changed) {
          generation++
          changed = true
        }
        if (JSON.stringify(approved) !== JSON.stringify(plans())) return { results: {}, stale: true }
        const results: Record<string, UpdateResult> = {}
        for (const plan of approved) {
          const previous = completed.get(plan.digest)
          const status = previous ?? options.outcomes?.[plan.host] ?? "updated"
          if (!previous && (status === "updated" || status === "partial")) writes++
          completed.set(plan.digest, status)
          results[plan.host] = status
        }
        return { results, stale: false }
      }),
    activate: () =>
      Effect.sync((): "activated" | "failed" => {
        activations++
        return options.activationFails ? "failed" : "activated"
      }),
    observed: () => ({ writes, staged, activations })
  }
}
export type UpdateOwner = ReturnType<typeof fakeUpdateOwner>
const previewText = (m: UpdateModel) =>
  `Batch update preview (simulated)\n${m.plans.map((p) => `${p.host}: ${p.current ? "already current" : "replace marked Hapsland integration"}; digest ${p.digest}`).join("\n")}\nStaged package retained; Back does not delete it. ${m.stale ? "Changed proposals require fresh approval." : ""}`
export function runUpdate(interaction: Interaction, owner: UpdateOwner, observe: Observe = unobserved) {
  return Effect.gen(function* () {
    let model = initialUpdate()
    const dispatch = (action: UpdateAction) =>
      Effect.gen(function* () {
        const before = model
        model = reduceUpdate(model, { revision: before.revision, action })
        yield* observe(
          replayStep(
            before,
            model,
            action,
            action.kind === "approve" ? (action.yes ? "approve group" : "decline group") : action.kind
          )
        )
      })
    while (model.phase !== "Done" && model.phase !== "Cancelled") {
      yield* interaction.present(`Update: ${model.phase} (simulated)\n`)
      const id = model.revision
      const step = Effect.gen(function* (): Effect.fn.Return<UpdateAction, Terminal.QuitError> {
        switch (model.phase) {
          case "Discovering":
            return { kind: "discovered", commandId: id, hosts: yield* owner.discover() }
          case "Staging":
            yield* owner.stage()
            return { kind: "staged", commandId: id }
          case "Previewing": {
            const plans = yield* owner.preview()
            const activation =
              plans.some((p) => p.current) && !plans.every((p) => p.current) ? yield* owner.activate() : undefined
            return { kind: "previewed", commandId: id, plans, ...(activation ? { activation } : {}) }
          }
          case "Preview": {
            yield* interaction.present(previewText(model) + "\n")
            const answer = yield* interaction.choose({
              message: "Review batch update",
              choices: [{ title: "Continue to grouped approval", value: "continue" }],
              back: false
            })
            return { kind: answer.kind === "selected" ? "continue" : "exit" }
          }
          case "Approval": {
            const answer = yield* interaction.confirm({
              message: "Apply all applicable agent updates?",
              preview: previewText(model),
              back: true
            })
            return answer.kind === "confirmed"
              ? {
                  kind: "approve",
                  yes: answer.yes,
                  digests: model.plans.filter((p) => !p.current).map((p) => p.digest)
                }
              : { kind: answer.kind }
          }
          case "Applying":
            return { kind: "applied", commandId: id, ...(yield* owner.apply(model.plans)) }
          case "Activating":
            return { kind: "activated", commandId: id, status: yield* owner.activate() }
          default:
            return { kind: "exit" }
        }
      })
      yield* dispatch(
        yield* step.pipe(Effect.catchTag("QuitError", () => Effect.succeed<UpdateAction>({ kind: "exit" })))
      )
    }
    yield* interaction.present(
      `Update outcome (simulated): ${JSON.stringify(model.results)}. Activation: ${model.activation ?? "not performed"}.\n${model.retained ? "Staged package retained for recovery; no rollback implied." : "No registered integrations; run setup first."}\nRestart updated agents and inspect native trust; no real review was verified.\n`
    )
    return model
  })
}
