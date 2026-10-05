import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import Game from "./game.generated.mjs"
import { readNat, readRecord } from "../../../src/canonical/boundary-schema.ts"
import { projectTrustedCanonical } from "../../../src/canonical/canonical-boundary.ts"
import { configurationIdentity } from "./identity.ts"

const towerKinds = { jevService: 0, deliveryRelay: 1, accessRepair: 2 } as const
export type TowerAbility = keyof typeof towerKinds
export type TowerIdentity = string
export type GameMechanismDescriptor = {
  readonly cost: number
  readonly ability: TowerAbility
  readonly displayName: string
  readonly lesson: string
}
export const gameMechanisms: Readonly<Record<string, GameMechanismDescriptor>> = {
  jevService: { cost: 60, ability: "jevService", displayName: "JevService", lesson: "Future request latency within fixed permits" },
  deliveryRelay: { cost: 55, ability: "deliveryRelay", displayName: "DeliveryRelay", lesson: "Future delivery preserves committed ownership" },
  accessRepair: { cost: 45, ability: "accessRepair", displayName: "AccessRepair", lesson: "Restore readable source and available credentials" }
}
export type GameAction = { readonly atTick: number } & (
  | { readonly kind: "build"; readonly tower: TowerIdentity; readonly x: number; readonly y: number }
  | { readonly kind: "upgrade"; readonly index: number }
)
export type GameScenarioSettings = {
  readonly jevDelayMs?: number
  readonly outputDelayMs?: number
  readonly sourceDelayMs?: number
  readonly credentialReady?: boolean
  readonly sourceReadable?: boolean
  readonly outcome?: "sampled" | "clear" | "finding"
  readonly burst?: number
  readonly arrivalIntervalMs?: number
}
export type GameExperiment = {
  readonly context: string
  /** Explicit continuous workload settings; defaults match the interactive game. */
  readonly scenario: "continuousGame"
  readonly settings?: GameScenarioSettings
  readonly seed: number
  readonly layout: 0 | 1 | 2
  readonly budget: number
  readonly catalogue?: Readonly<Record<string, GameMechanismDescriptor>>
  readonly enabled: readonly TowerIdentity[]
  readonly actions: readonly GameAction[]
  readonly untilTicks: number
  readonly maxEvents: number
}

function sourceIdentity() {
  const hash = createHash("sha256")
  const metadata = JSON.parse(readFileSync(new URL("./game.generated.json", import.meta.url), "utf8")) as { sources: string[] }
  for (const path of ["game.ts", "identity.ts", "game.generated.mjs", "game.generated.d.mts", "game.generated.json",
    "../../../src/canonical/canonical-boundary.ts", "../../../src/canonical/boundary-schema.ts"])
    hash.update(path).update(readFileSync(new URL(path, import.meta.url)))
  for (const path of metadata.sources)
    hash.update(path).update(readFileSync(new URL(`../../../${path}`, import.meta.url)))
  return `sha256:${hash.digest("hex")}`
}
const SOURCE_IDENTITY = sourceIdentity()

/** Convert emitted owner-qualified tags for the existing exact boundary decoder. */
function boundary(value: unknown): unknown {
  if (typeof value === "bigint") {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("unsafe emitted natural")
    return Number(value)
  }
  if (Array.isArray(value)) return value.map(boundary)
  if (value !== null && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      key === "$" && typeof item === "string" ? item.slice(item.lastIndexOf("/") + 1) : boundary(item)]))
  return value
}
function observe(world: unknown) {
  const game = readRecord(boundary(Game.observe(world)))
  const engine = readRecord(boundary(Game.engine_observation(world)))
  if (engine.valid !== true) throw new Error("invalid shared native game engine")
  return {
    game: { health: readNat(game.health), remainingBudget: readNat(game.remainingBudget),
      tick: readNat(game.tick), towerCount: readNat(game.towerCount) },
    business: { now: readNat(engine.time), events: readNat(engine.event_count),
      projection: projectTrustedCanonical(engine.canonical) }
  }
}
function validate(input: GameExperiment) {
  if (!input.context || input.scenario !== "continuousGame") throw new RangeError("invalid game context or scenario")
  for (const [name, number, maximum] of [
    ["seed", input.seed, 0xffffffff], ["budget", input.budget, 0xffffffff],
    ["untilTicks", input.untilTicks, 1_000_000], ["maxEvents", input.maxEvents, 1_000_000]
  ] as const)
    if (!Number.isSafeInteger(number) || number < (name === "maxEvents" ? 1 : 0) || number > maximum)
      throw new RangeError(`invalid game ${name}`)
  if (![0, 1, 2].includes(input.layout)) throw new RangeError("invalid game layout")
  const catalogue = input.catalogue ?? gameMechanisms
  for (const descriptor of Object.values(catalogue)) {
    if (!Number.isSafeInteger(descriptor.cost) || descriptor.cost < 0 || descriptor.cost > 0xffffffff)
      throw new RangeError("invalid game mechanism cost")
    if (!Object.hasOwn(towerKinds, descriptor.ability)) throw new RangeError("invalid game mechanism ability")
    for (const value of [descriptor.displayName, descriptor.lesson])
      if (typeof value !== "string" || !value.trim()) throw new RangeError("invalid game mechanism metadata")
  }
  if (new Set(input.enabled).size !== input.enabled.length || input.enabled.some(tower => !Object.hasOwn(catalogue, tower)))
    throw new RangeError("invalid enabled game towers")
  const settings = input.settings ?? {}
  for (const [name, value, minimum, maximum] of [
    ["jevDelayMs", settings.jevDelayMs, 0, 1_000_000_000],
    ["outputDelayMs", settings.outputDelayMs, 0, 1_000_000_000],
    ["sourceDelayMs", settings.sourceDelayMs, 0, 1_000_000_000],
    ["burst", settings.burst, 1, 1024],
    ["arrivalIntervalMs", settings.arrivalIntervalMs, 20, 60000]
  ] as const)
    if (value !== undefined && (!Number.isSafeInteger(value) || value < minimum || value > maximum))
      throw new RangeError(`invalid game ${name}`)
  for (const value of [settings.credentialReady, settings.sourceReadable])
    if (value !== undefined && typeof value !== "boolean") throw new RangeError("invalid game access setting")
  if (settings.outcome !== undefined && !["sampled", "clear", "finding"].includes(settings.outcome))
    throw new RangeError("invalid game outcome")
  for (const action of input.actions) {
    if (Object.hasOwn(action, "cost") || Object.hasOwn(action, "ability"))
      throw new RangeError("game action configuration belongs to catalogue")
    if (!Number.isSafeInteger(action.atTick) || action.atTick < 0 || action.atTick > input.untilTicks)
      throw new RangeError("invalid game action tick")
    const coordinates = action.kind === "build" ? [action.x, action.y] : action.kind === "upgrade" ? [action.index] : []
    if (coordinates.length === 0 || coordinates.some(value => !Number.isSafeInteger(value) || value < 0 || value > 0xffffffff))
      throw new RangeError("invalid game action")
    if (action.kind === "build" && !Object.hasOwn(catalogue, action.tower)) throw new RangeError("unknown game tower")
  }
}

/** Actual Host placement, targeting, firing and health over the one shared NativeRun. */
export function runGameExperiment(input: GameExperiment) {
  validate(input)
  input = structuredClone({ ...input, catalogue: input.catalogue ?? gameMechanisms })
  const settings = input.settings ?? {}
  let world = Game.create_scenario({ $: "Scenario",
    jev: BigInt(settings.jevDelayMs ?? 3200), delivery: BigInt(settings.outputDelayMs ?? 800),
    source: BigInt(settings.sourceDelayMs ?? 800), ready: settings.credentialReady ?? true,
    readable: settings.sourceReadable ?? true,
    result: settings.outcome === "clear" ? 1 : settings.outcome === "finding" ? 2 : 0,
    burst: settings.burst ?? 1, interval: settings.arrivalIntervalMs ?? 30000
  }, BigInt(input.seed), input.budget, input.layout)
  const observations = [observe(world)]
  const actions: { action: GameAction; result: string; charged: number }[] = []
  const trace: unknown[] = []
  const schedule = [...input.actions].sort((a, b) => a.atTick - b.atTick)
  let position = 0
  let state = observations[0]!
  while (true) {
    if (state.business.events >= input.maxEvents || state.game.health === 0) break
    while (position < schedule.length && schedule[position]!.atTick === state.game.tick) {
      const action = schedule[position++]!
      if (action.kind === "build" && !input.enabled.includes(action.tower)) {
        actions.push({ action, result: "disabled", charged: 0 })
        continue
      }
      const receipt = readRecord(action.kind === "build"
        ? Game.build_priced(world, action.x, action.y,
          towerKinds[input.catalogue![action.tower]!.ability], input.catalogue![action.tower]!.cost)
        : Game.apply(world, { $: "Upgrade", index: action.index }))
      world = receipt.world
      actions.push({ action, result: readRecord(receipt.result).$ as string, charged: readNat(boundary(receipt.charged)) })
      state = observe(world)
    }
    if (state.game.tick >= input.untilTicks || state.business.events >= input.maxEvents || state.game.health === 0) break
    const tick = readRecord(Game.tick_bounded(world, BigInt(input.maxEvents - state.business.events)))
    trace.push(boundary({ frames: tick.frames, physical: tick.physical }))
    world = tick.world
    state = observe(world)
    observations.push(state)
  }
  for (const action of schedule.slice(position)) actions.push({ action, result: "notReached", charged: 0 })
  const traceIdentity = configurationIdentity({ trace, state, actions })
  const recording = { format: 1 as const, sourceIdentity: SOURCE_IDENTITY,
    configurationIdentity: configurationIdentity(input), experiment: input, traceIdentity }
  return { context: input.context, actions, observations,
    game: { ...state.game, initialBudget: input.budget, spent: input.budget - state.game.remainingBudget },
    business: state.business, trace,
    termination: state.game.health === 0 ? "dead" as const : state.business.events >= input.maxEvents ? "eventLimit" as const : "tickLimit" as const,
    recording }
}

export function replayGameExperiment(recording: ReturnType<typeof runGameExperiment>["recording"]) {
  if (recording.format !== 1 || recording.sourceIdentity !== SOURCE_IDENTITY ||
    recording.configurationIdentity !== configurationIdentity(recording.experiment))
    throw new Error("incompatible game experiment recording")
  const result = runGameExperiment(recording.experiment)
  if (result.recording.traceIdentity !== recording.traceIdentity) throw new Error("incompatible game experiment trace")
  return result
}

export type GamePlan = { readonly name: string; readonly actions: readonly GameAction[] }

export function compareGameExperiments(input: GameExperiment, baseline: GamePlan, candidate: GamePlan) {
  const before = runGameExperiment({ ...input, actions: baseline.actions })
  const after = runGameExperiment({ ...input, actions: candidate.actions })
  return { scope: "one continuous-game context and two declared plans" as const,
    baseline: { name: baseline.name, result: before }, candidate: { name: candidate.name, result: after },
    delta: {
      game: { health: after.game.health - before.game.health, spent: after.game.spent - before.game.spent,
        remainingBudget: after.game.remainingBudget - before.game.remainingBudget },
      business: { events: after.business.events - before.business.events,
        ownedBytes: after.business.projection.global.bytes - before.business.projection.global.bytes,
        retainedEntries: after.business.projection.pendingFindings.length - before.business.projection.pendingFindings.length }
    } }
}

/** Placement and upgrade search enumerates caller-declared schedules only. */
export function searchGameExperiments(input: GameExperiment, plans: readonly GamePlan[], maxRuns: number) {
  validate({ ...input, actions: [] })
  if (!Number.isSafeInteger(maxRuns) || maxRuns < 1 || plans.some(plan => !plan.name) ||
    new Set(plans.map(plan => plan.name)).size !== plans.length) throw new RangeError("invalid game search")
  const runs: { name: string; result: ReturnType<typeof runGameExperiment> }[] = []
  const invalid: { name: string; error: string }[] = []
  for (const plan of plans.slice(0, maxRuns)) {
    const experiment = { ...input, actions: plan.actions }
    try { validate(experiment) } catch (error) {
      if (!(error instanceof RangeError)) throw error
      invalid.push({ name: plan.name, error: error.message })
      continue
    }
    runs.push({ name: plan.name, result: runGameExperiment(experiment) })
  }
  return { scope: "declared continuous-game schedules only" as const, runs, invalid,
    unsearched: plans.slice(maxRuns).map(plan => plan.name) }
}

/** Equal-budget actual-game baseline, A, B and ordered A+B comparison. */
export function compareGameInteraction(input: GameExperiment, a: GamePlan, b: GamePlan) {
  return { scope: "one configured game context; baseline, A, B and ordered A+B" as const,
    policies: { a: a.name, b: b.name },
    baseline: runGameExperiment({ ...input, actions: [] }),
    a: runGameExperiment({ ...input, actions: a.actions }),
    b: runGameExperiment({ ...input, actions: b.actions }),
    combined: runGameExperiment({ ...input, actions: [...a.actions, ...b.actions] }) }
}
