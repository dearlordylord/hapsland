import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import Game from "./game.generated.mjs"
import { readNat, readRecord } from "../../../src/canonical/boundary-schema.ts"
import { projectTrustedCanonical } from "../../../src/canonical/canonical-boundary.ts"
import { configurationIdentity } from "./identity.ts"

const towerKinds = { rapid: 0, refiner: 1, relay: 2, parallelizer: 3, coordinator: 4, packager: 5, shield: 6 } as const
export type TowerIdentity = keyof typeof towerKinds
export type GameAction = { readonly atTick: number } & (
  | { readonly kind: "build"; readonly tower: TowerIdentity; readonly x: number; readonly y: number }
  | { readonly kind: "upgrade"; readonly index: number }
)
export type GameExperiment = {
  readonly context: string
  /** Current continuous-game preset; its advicee workload seed remains 152. */
  readonly scenario: "continuousGame"
  readonly seed: number
  readonly layout: 0 | 1 | 2
  readonly budget: number
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
  if (new Set(input.enabled).size !== input.enabled.length || input.enabled.some(tower => !Object.hasOwn(towerKinds, tower)))
    throw new RangeError("invalid enabled game towers")
  for (const action of input.actions) {
    if (!Number.isSafeInteger(action.atTick) || action.atTick < 0 || action.atTick > input.untilTicks)
      throw new RangeError("invalid game action tick")
    const coordinates = action.kind === "build" ? [action.x, action.y] : action.kind === "upgrade" ? [action.index] : []
    if (coordinates.length === 0 || coordinates.some(value => !Number.isSafeInteger(value) || value < 0 || value > 0xffffffff))
      throw new RangeError("invalid game action")
    if (action.kind === "build" && !Object.hasOwn(towerKinds, action.tower)) throw new RangeError("unknown game tower")
  }
}

/** Actual Host placement, targeting, firing and health over the one shared NativeRun. */
export function runGameExperiment(input: GameExperiment) {
  validate(input)
  input = structuredClone(input)
  let world = Game.create_world(Game.default_config(), BigInt(input.seed), input.budget, input.layout)
  const observations = [observe(world)]
  const actions: { action: GameAction; result: string; charged: number }[] = []
  const trace: unknown[] = []
  const schedule = [...input.actions].sort((a, b) => a.atTick - b.atTick)
  let position = 0
  let state = observations[0]!
  while (true) {
    while (position < schedule.length && schedule[position]!.atTick === state.game.tick) {
      const action = schedule[position++]!
      if (action.kind === "build" && !input.enabled.includes(action.tower)) {
        actions.push({ action, result: "disabled", charged: 0 })
        continue
      }
      const receipt = readRecord(Game.apply(world, action.kind === "build"
        ? { $: "Build", x: action.x, y: action.y, kind: towerKinds[action.tower] }
        : { $: "Upgrade", index: action.index }))
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
