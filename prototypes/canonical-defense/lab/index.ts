import { createRun, restoreReplay, type Replay, type RunConfig, type Observation, type Control } from "../../../packages/monkey-business/src/index.ts"

import { labSourceIdentity, configurationIdentity } from "./identity.ts"

const MECHANISM_IDENTITY = labSourceIdentity()

export type ExperimentRecording = {
  readonly format: 1
  readonly mechanismIdentity: string
  readonly configurationIdentity: string
  readonly experiment: Experiment
  readonly businessReplay: Replay
}

export type Experiment = {
  readonly context: string
  readonly scenario: RunConfig
  readonly budget: number
  readonly catalogue?: Readonly<Record<string, MechanismDescriptor>>
  readonly enabled: readonly string[]
  readonly actions: readonly MechanismAction[]
  readonly untilTime: number
  readonly maxEvents: number
}

export type MechanismAction = {
  readonly at: number
  readonly mechanism: string
}
export type ActionReport = {
  readonly charged: number
  readonly action: MechanismAction
  readonly result: "disabled" | "unaffordable" | "applied" | "notReached" | "inapplicable"
}

export type MechanismDescriptor = {
  readonly cost: number
  readonly displayName: string
  readonly lesson: string
  readonly target: string
  readonly applicability: string
  readonly observation: string
  readonly ability:
    | { readonly kind: "jevService"; readonly baseDelayMs?: number }
    | { readonly kind: "deliveryRelay"; readonly baseDelayMs?: number }
    | { readonly kind: "accessRepair" }
}

export const mechanisms: Readonly<Record<string, MechanismDescriptor>> = {
  jevService: { cost: 60, displayName: "JevService", lesson: "Future request latency within shared permits",
    target: "future Jev requests", applicability: "issued requests preserve outcomes and deadlines",
    observation: "request settlement times and occupied permits", ability: { kind: "jevService" } },
  deliveryRelay: { cost: 55, displayName: "DeliveryRelay", lesson: "Future delivery versus committed ownership",
    target: "future finding output attempts", applicability: "authorized attempts preserve captured timing and membership",
    observation: "submissionTerminal timing and retained findings", ability: { kind: "deliveryRelay" } },
  accessRepair: { cost: 45, displayName: "AccessRepair", lesson: "Access restoration before useful work",
    target: "source readability and credential availability", applicability: "one restoration per experiment",
    observation: "request admission after restored access", ability: { kind: "accessRepair" } }
}

/** Each level derives from the declared base, never the previously reduced delay. */
function mechanismControls(input: Experiment, action: MechanismAction, level: number,
  initial: ReturnType<ReturnType<typeof createRun>["runtimeSnapshot"]>): readonly Control[] {
  const ability = input.catalogue![action.mechanism]!.ability
  if (ability.kind === "jevService") {
    const delayMs = Math.floor((ability.baseDelayMs ?? initial.jevDelay) / (1 + level))
    return [{ kind: "jevProfile", delayMs, ...(initial.outcome === undefined
      ? { outcomeWeights: initial.outcomeWeights } : { outcome: initial.outcome }) }]
  }
  if (ability.kind === "deliveryRelay")
    return [{ kind: "outputProfile", ...initial.outputProfile,
      delayMs: Math.floor((ability.baseDelayMs ?? initial.outputProfile.delayMs) / (1 + level)) }]
  return [
    { kind: "environment", ...initial.environment, sourceReadable: true },
    { kind: "credentials", action: "restore" }
  ]
}

function validateExperiment(input: Experiment): void {
  if (!Number.isSafeInteger(input.budget) || input.budget < 0) throw new RangeError("invalid budget")
  if (!Number.isSafeInteger(input.untilTime) || input.untilTime < 0 || input.untilTime >= 2 ** 48)
    throw new RangeError("invalid untilTime")
  if (!Number.isSafeInteger(input.maxEvents) || input.maxEvents < 1 || input.maxEvents >= 2 ** 48)
    throw new RangeError("invalid maxEvents")
  const catalogue = input.catalogue ?? mechanisms
  for (const descriptor of Object.values(catalogue)) {
    if (!Number.isSafeInteger(descriptor.cost) || descriptor.cost < 0) throw new RangeError("invalid mechanism cost")
    for (const field of [descriptor.displayName, descriptor.lesson, descriptor.target, descriptor.applicability, descriptor.observation])
      if (typeof field !== "string" || !field.trim()) throw new RangeError("invalid mechanism descriptor")
    if (descriptor.ability.kind === "jevService" || descriptor.ability.kind === "deliveryRelay") {
      const delay = descriptor.ability.baseDelayMs
      if (delay !== undefined && (!Number.isSafeInteger(delay) || delay < 0 || delay > 1_000_000_000))
        throw new RangeError("invalid base delay")
    } else if (descriptor.ability.kind !== "accessRepair") throw new RangeError("invalid mechanism ability")
  }
  for (const identity of input.enabled)
    if (!Object.hasOwn(catalogue, identity)) throw new RangeError(`unknown mechanism: ${identity}`)
  for (const action of input.actions) {
    if (!Object.hasOwn(catalogue, action.mechanism)) throw new RangeError("unknown mechanism")
    if (!Number.isSafeInteger(action.at) || action.at < 0 || action.at > input.untilTime)
      throw new RangeError("invalid action time")
    if (Object.hasOwn(action, "cost")) throw new RangeError("action cost belongs to mechanism configuration")
    if (Object.hasOwn(action, "delayMs") || Object.hasOwn(action, "leaseMs") || Object.hasOwn(action, "baseDelayMs"))
      throw new RangeError("action parameters belong to mechanism configuration")
  }
  if (new Set(input.enabled).size !== input.enabled.length) throw new RangeError("duplicate mechanism")
}

/** Game-owned experiment boundary. Business transitions belong to Monkey Business. */
export function runExperiment(input: Experiment) {
  validateExperiment(input)
  input = structuredClone({ ...input, catalogue: input.catalogue ?? mechanisms })
  const run = createRun(input.scenario)
  let requestsStarted = 0
  let frames = 0
  let peakOwnedBytes = 0
  let certainOutputs = 0
  const observations: Observation[] = []
  run.subscribe(frame => {
    frames++
    observations.push(frame)
    peakOwnedBytes = Math.max(peakOwnedBytes, frame.after.global.bytes)
    if (frame.event.kind === "submissionTerminal" && frame.event.certain) certainOutputs++
    if (frame.event.kind === "finishTerminal" && frame.event.outcome === "acknowledged") certainOutputs++
    if (frame.event.kind === "jevRequestStarted") requestsStarted++
  })
  const actions: ActionReport[] = []
  let spent = 0
  const initial = run.runtimeSnapshot()
  const levels = new Map<string, number>()
  let repaired = false
  let remainingEvents = input.maxEvents
  for (const action of [...input.actions].sort((a, b) => a.at - b.at)) {
    const ability = input.catalogue![action.mechanism]!.ability
    const cost = input.catalogue![action.mechanism]!.cost
    if (!input.enabled.includes(action.mechanism)) {
      actions.push({ action, result: "disabled", charged: 0 })
    } else if (ability.kind === "accessRepair" && repaired) {
      actions.push({ action, result: "inapplicable", charged: 0 })
    } else if (cost > input.budget - spent) {
      actions.push({ action, result: "unaffordable", charged: 0 })
    } else if (remainingEvents === 0) {
      actions.push({ action, result: "notReached", charged: 0 })
    } else {
      if (action.at > run.observe().now) {
        const advanced = run.advance({ untilTime: action.at, maxEvents: remainingEvents })
        remainingEvents -= advanced.events
        if (advanced.reason === "eventLimit" || advanced.now !== action.at) {
          actions.push({ action, result: "notReached", charged: 0 })
          continue
        }
      }
      const level = (levels.get(action.mechanism) ?? 0) + 1
      for (const control of mechanismControls(input, action, level, initial)) run.applyControl(control)
      levels.set(action.mechanism, level)
      if (ability.kind === "accessRepair") repaired = true
      spent += cost
      actions.push({ action, result: "applied", charged: cost })
    }
  }
  const endpoint = run.advance({ untilTime: input.untilTime, maxEvents: remainingEvents })
  return {
    context: input.context,
    actions,
    game: { initialBudget: input.budget, spent, remainingBudget: input.budget - spent },
    business: {
      requestsStarted, frames, peakOwnedBytes, certainOutputs,
      pendingFindings: run.projection.pendingFindings.length,
      ownedBytes: run.projection.global.bytes
    },
    observations,
    replay: run.exportReplay(),
    termination: endpoint.reason,
    execution: {
      untilTime: input.untilTime, maxEvents: input.maxEvents,
      now: run.observe().now, events: run.observe().eventCount
    },
    recording: {
      format: 1 as const,
      mechanismIdentity: MECHANISM_IDENTITY,
      configurationIdentity: configurationIdentity(input),
      experiment: structuredClone(input),
      businessReplay: run.exportReplay()
    }

  }
}

/** Replay verifies both the shared engine identity and the game-owned inputs. */
export function replayExperiment(recording: ExperimentRecording) {
  if (recording.format !== 1 || recording.mechanismIdentity !== MECHANISM_IDENTITY)
    throw new Error("incompatible experiment identity")
  if (recording.configurationIdentity !== configurationIdentity(recording.experiment))
    throw new Error("incompatible experiment configuration identity")
  restoreReplay(recording.businessReplay)
  const result = runExperiment(recording.experiment)
  if (JSON.stringify(result.replay) !== JSON.stringify(recording.businessReplay))
    throw new Error("incompatible experiment replay")
  return result
}

export type ExperimentPlan = { readonly name: string; readonly actions: readonly MechanismAction[] }

function validateSearch(plans: readonly ExperimentPlan[], maxRuns: number) {
  if (!Number.isSafeInteger(maxRuns) || maxRuns < 1) throw new RangeError("invalid maxRuns")
  if (new Set(plans.map(plan => plan.name)).size !== plans.length) throw new RangeError("duplicate plan name")
  if (plans.some(plan => !plan.name)) throw new RangeError("empty plan name")
}

/** Finite enumeration, without an optimality or probability claim. */
export function searchExperiments(experiment: Experiment, plans: readonly ExperimentPlan[], maxRuns: number) {
  validateExperiment({ ...experiment, actions: [] })
  validateSearch(plans, maxRuns)
  const runs: { name: string; result: ReturnType<typeof runExperiment> }[] = []
  const invalid: { name: string; error: string }[] = []
  for (const plan of plans.slice(0, maxRuns)) {
    const input = { ...experiment, actions: plan.actions }
    try {
      validateExperiment(input)
    } catch (error) {
      if (!(error instanceof RangeError)) throw error
      invalid.push({ name: plan.name, error: error.message })
      continue
    }
    runs.push({ name: plan.name, result: runExperiment(input) })
  }
  return { scope: "declared plans only" as const, runs, invalid, unsearched: plans.slice(maxRuns).map(plan => plan.name) }
}

/** Both policies run against the same declared business inputs and resource bounds. */
export function compareExperiments(experiment: Experiment, baseline: ExperimentPlan, candidate: ExperimentPlan) {
  const before = runExperiment({ ...experiment, actions: baseline.actions })
  const after = runExperiment({ ...experiment, actions: candidate.actions })
  return {
    scope: "one declared context and two declared policies" as const,
    outcomeCoupling: experiment.scenario.outcome === undefined
      ? "same seed; sampled outcomes may attach to different issued operations" as const
      : "fixed scenario outcome override; explicit per-input overrides still apply" as const,
    baseline: { name: baseline.name, result: before },
    candidate: { name: candidate.name, result: after },
    delta: {
      game: {
        spent: after.game.spent - before.game.spent,
        remainingBudget: after.game.remainingBudget - before.game.remainingBudget
      },
      business: {
        requestsStarted: after.business.requestsStarted - before.business.requestsStarted,
        frames: after.business.frames - before.business.frames,
        peakOwnedBytes: after.business.peakOwnedBytes - before.business.peakOwnedBytes,
        certainOutputs: after.business.certainOutputs - before.business.certainOutputs,
        pendingFindings: after.business.pendingFindings - before.business.pendingFindings,
        ownedBytes: after.business.ownedBytes - before.business.ownedBytes
      }
    }
  }
}

export type ExperimentContext = {
  readonly role: "tuning" | "heldOut"
  readonly experiment: Experiment
}

function validateContexts(contexts: readonly ExperimentContext[]) {
  const identities = new Set<string>()
  for (const context of contexts) {
    if (context.role !== "tuning" && context.role !== "heldOut") throw new RangeError("invalid context role")
    if (!context.experiment.context || identities.has(context.experiment.context))
      throw new RangeError("empty or duplicate context")
    identities.add(context.experiment.context)
    validateExperiment(context.experiment)
  }
}

/** The attempt budget is global across tuning contexts, including invalid plans. */
export function searchContexts(contexts: readonly ExperimentContext[], plans: readonly ExperimentPlan[], maxRuns: number) {
  validateContexts(contexts)
  validateSearch(plans, maxRuns)
  let remaining = maxRuns
  const tuning: { context: string; search: ReturnType<typeof searchExperiments> }[] = []
  for (const context of contexts.filter(context => context.role === "tuning")) {
    const selected = plans.slice(0, remaining)
    const search = remaining > 0
      ? searchExperiments(context.experiment, plans, remaining)
      : { scope: "declared plans only" as const, runs: [], invalid: [], unsearched: plans.map(plan => plan.name) }
    remaining -= selected.length
    tuning.push({ context: context.experiment.context, search })
  }
  return { tuning, heldOut: contexts.filter(context => context.role === "heldOut").map(context => context.experiment.context) }
}

/** Validation takes explicitly chosen policies; it does not select a winner using held-out results. */
export function evaluateHeldOut(contexts: readonly ExperimentContext[], baseline: ExperimentPlan, candidate: ExperimentPlan) {
  validateContexts(contexts)
  return contexts.filter(context => context.role === "heldOut").map(context => ({
    context: context.experiment.context,
    comparison: compareExperiments(context.experiment, baseline, candidate)
  }))
}

/** Equal-budget four-arm comparison. At equal times, A's actions precede B's actions. */
export function compareInteraction(experiment: Experiment, a: ExperimentPlan, b: ExperimentPlan) {
  const baseline = runExperiment({ ...experiment, actions: [] })
  const first = runExperiment({ ...experiment, actions: a.actions })
  const second = runExperiment({ ...experiment, actions: b.actions })
  const combined = runExperiment({ ...experiment, actions: [...a.actions, ...b.actions] })
  return {
    scope: "one declared context; baseline, A, B and ordered A+B" as const,
    policies: { a: a.name, b: b.name },
    baseline, a: first, b: second, combined
  }
}
