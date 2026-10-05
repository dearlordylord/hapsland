import { compareGameExperiments, compareGameInteraction, runGameExperiment, searchGameExperiments,
  type GameExperiment, type GamePlan } from "./game.ts"

type Context = { readonly role: "tuning" | "heldOut"; readonly experiment: GameExperiment }
type GameResult = ReturnType<typeof runGameExperiment>

/** Frame events are observations, not a second interpretation of business transitions. */
function events(result: GameResult, name: string): { time: number; event: Record<string, unknown> }[] {
  const found: { time: number; event: Record<string, unknown> }[] = []
  function visit(value: unknown) {
    if (Array.isArray(value)) { for (const item of value) visit(item); return }
    if (value === null || typeof value !== "object") return
    const object = value as Record<string, unknown>
    if (typeof object.$ === "string" && object.$.endsWith("ProductFrame")) {
      const event = object.event as Record<string, unknown>
      if (typeof event.$ === "string" && event.$.endsWith(name)) found.push({ time: object.time as number, event })
      return
    }
    for (const child of Object.values(object)) visit(child)
  }
  visit(result.trace)
  return found
}

/** Authored spatial Host experiments; candidate selection never reads held-out results. */
export function runGameExampleStudy() {
  const common: GameExperiment = {
    context: "base", scenario: "continuousGame", seed: 152, layout: 0, budget: 160,
    enabled: ["jevService", "deliveryRelay", "accessRepair"], actions: [], untilTicks: 16, maxEvents: 128,
    settings: { sourceDelayMs: 0, jevDelayMs: 20, outputDelayMs: 200, outcome: "finding",
      burst: 1, arrivalIntervalMs: 30000 }
  }
  const contexts: readonly Context[] = [
    { role: "tuning", experiment: { ...common, context: "slowJev",
      settings: { ...common.settings, jevDelayMs: 200, outputDelayMs: 20 } } },
    { role: "tuning", experiment: { ...common, context: "slowDelivery" } },
    { role: "tuning", experiment: { ...common, context: "blockedSource",
      settings: { ...common.settings, sourceReadable: false } } },
    { role: "tuning", experiment: { ...common, context: "blockedCredentials",
      settings: { ...common.settings, credentialReady: false } } },
    { role: "tuning", experiment: { ...common, context: "clear",
      settings: { ...common.settings, outcome: "clear" } } },
    { role: "heldOut", experiment: { ...common, context: "heldOutFindingDelivery", seed: 17,
      settings: { ...common.settings, jevDelayMs: 40, outputDelayMs: 240 } } },
    { role: "heldOut", experiment: { ...common, context: "heldOutClear", seed: 17,
      settings: { ...common.settings, outcome: "clear" } } }
  ]
  const baseline: GamePlan = { name: "no-investment", actions: [] }
  const service: GamePlan = { name: "service", actions: [
    { atTick: 0, kind: "build", tower: "jevService", x: 424, y: 392 }
  ] }
  const relay: GamePlan = { name: "relay", actions: [
    { atTick: 0, kind: "build", tower: "deliveryRelay", x: 152, y: 392 }
  ] }
  const repair: GamePlan = { name: "repair", actions: [
    { atTick: 0, kind: "build", tower: "accessRepair", x: 424, y: 232 }
  ] }
  const lateService: GamePlan = { name: "late-service", actions: [
    { ...service.actions[0]!, atTick: 1 }
  ] }
  const lateRelay: GamePlan = { name: "late-relay", actions: [
    { ...relay.actions[0]!, atTick: 2 }
  ] }
  const disconnected: GamePlan = { name: "disconnected-service", actions: [
    { atTick: 0, kind: "build", tower: "jevService", x: 424, y: 232 }
  ] }
  const plans: readonly GamePlan[] = [baseline, service, relay, repair,
    { name: "service+relay", actions: [...service.actions, ...relay.actions] },
    { name: "service+repair", actions: [...service.actions, ...repair.actions] },
    { name: "relay+repair", actions: [...relay.actions, ...repair.actions] },
    lateService, lateRelay, disconnected]
  const searchBudget = 49
  let remaining = searchBudget
  const tuning = contexts.filter(context => context.role === "tuning").map(context => {
    const search = searchGameExperiments(context.experiment, plans, remaining)
    remaining -= Math.min(remaining, plans.length)
    return { context: context.experiment.context, search }
  })
  const interactions = contexts.filter(context => context.role === "tuning").map(context => ({
    context: context.experiment.context,
    serviceRelay: compareGameInteraction(context.experiment, service, relay),
    relayRepair: compareGameInteraction(context.experiment, relay, repair)
  }))
  const heldOut = contexts.filter(context => context.role === "heldOut").map(context => ({
    context: context.experiment.context,
    comparison: compareGameExperiments(context.experiment, baseline, relay)
  }))
  return {
    assumptions: ["authored source-free fixtures; explicit finding/clear outcomes, not random samples",
      "fixed 160 construction budget; Host upgrades and health; no output rewards",
      "three supported abilities; current fixed radius/strength formulas",
      "same scenario and purchase schedule boundaries within each comparison",
      "relay candidate declared before held-out evaluation",
      "finite declared placement/timing search; no global optimum or probability claim",
      "human prediction, learning and enjoyment remain unmeasured"],
    searchBudget, declaredCombinations: 50, tuning, interactions, heldOut,
    lateInterventions: [compareGameExperiments(contexts[0]!.experiment, baseline, lateService),
      compareGameExperiments(contexts[1]!.experiment, baseline, lateRelay)],
    placementCountercase: compareGameExperiments(contexts[0]!.experiment, baseline, disconnected)
  }
}

export function summarizeGameExampleStudy(study = runGameExampleStudy()) {
  const metrics = (result: GameResult) => ({
    game: result.game,
    business: { time: result.business.now, events: result.business.events,
      ownedBytes: result.business.projection.global.bytes,
      retainedEntries: result.business.projection.pendingFindings.length,
      requestSettlements: events(result, "JevRequestSettled"),
      individualSubmissionTerminals: events(result, "SubmissionTerminal"),
      bundleOutputTerminals: events(result, "OutputTerminal") },
    actions: result.actions, termination: result.termination,
    sourceIdentity: result.recording.sourceIdentity,
    configurationIdentity: result.recording.configurationIdentity, traceIdentity: result.recording.traceIdentity
  })
  const comparison = (value: ReturnType<typeof compareGameExperiments>) => ({
    context: value.baseline.result.context,
    baseline: metrics(value.baseline.result), candidate: metrics(value.candidate.result), delta: value.delta
  })
  const interaction = (value: ReturnType<typeof compareGameInteraction>) => ({
    baseline: metrics(value.baseline), a: metrics(value.a), b: metrics(value.b), combined: metrics(value.combined)
  })
  return { assumptions: study.assumptions, searchBudget: study.searchBudget, declaredCombinations: study.declaredCombinations,
    tuning: study.tuning.map(context => ({ context: context.context,
      runs: context.search.runs.map(run => ({ name: run.name, ...metrics(run.result) })),
      invalid: context.search.invalid, unsearched: context.search.unsearched })),
    interactions: study.interactions.map(context => ({ context: context.context,
      serviceRelay: interaction(context.serviceRelay), relayRepair: interaction(context.relayRepair) })),
    heldOut: study.heldOut.map(context => ({ context: context.context, comparison: comparison(context.comparison) })),
    lateInterventions: study.lateInterventions.map(comparison), placementCountercase: comparison(study.placementCountercase) }
}

/** Independent expectations from configured latency and declared investment rules. */
export function checkGameExampleStudy(study = runGameExampleStudy()) {
  const require = (condition: boolean, message: string) => { if (!condition) throw new Error(message) }
  const run = (context: string, plan: string) => {
    const result = study.tuning.find(item => item.context === context)?.search.runs.find(item => item.name === plan)?.result
    if (!result) throw new Error(`missing declared run ${context}/${plan}`)
    return result
  }
  const settled = (result: GameResult) => events(result, "JevRequestSettled")
  const base = settled(run("slowJev", "no-investment"))
  const accelerated = settled(run("slowJev", "service"))
  require(base.length === 1 && accelerated.length === 1, "one declared request must settle in slowJev")
  require(base[0]!.time - accelerated[0]!.time === 100, "level-one service must reduce future 200ms request by100ms")
  for (const context of ["blockedSource", "blockedCredentials"])
    require(run(context, "repair").business.projection.pendingFindings.length === 1 &&
      run(context, "no-investment").business.projection.pendingFindings.length === 0,
    `repair must restore future finding progress in ${context}`)
  require(run("clear", "relay").game.spent === 55 &&
    events(run("clear", "relay"), "SubmissionTerminal").length === 0,
    "clear-review relay must cost55 without eligible finding submission")
  require(JSON.stringify(settled(study.lateInterventions[0]!.candidate.result)) ===
    JSON.stringify(settled(study.lateInterventions[0]!.baseline.result)),
    "late service must preserve already issued request timing/outcome")
  require(study.placementCountercase.candidate.result.game.spent === 60 &&
    JSON.stringify(settled(study.placementCountercase.candidate.result)) ===
    JSON.stringify(settled(study.placementCountercase.baseline.result)),
    "disconnected service must remain a charged placement without request acceleration")
  require(study.tuning.reduce((count, context) => count + context.search.runs.length + context.search.invalid.length, 0) === 49,
    "search must execute exactly49 declared combinations")
  require(study.tuning.at(-1)!.search.unsearched.length === 1, "search must expose one unsearched placement plan")
  require(study.heldOut.length === 2 && study.heldOut.every(context => context.context.startsWith("heldOut")),
    "held-out contexts must remain separate")
  for (const context of study.tuning)
    for (const item of context.search.runs)
      require(item.result.game.spent + item.result.game.remainingBudget === 160 && item.result.business.events <= 128,
        "actual-game budget and event limits must hold")
  return { checked: "declared spatial Host scenarios only" as const, tuningRuns: 49, heldOutContexts: 2 }
}
