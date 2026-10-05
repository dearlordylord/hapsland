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

/** Four declared numeric configurations plus baseline; no automatic parameter selection. */
export function runGameParameterStudy() {
  const experiment: GameExperiment = { context: "configured-service-parameters", scenario: "continuousGame",
    seed: 152, layout: 0, budget: 160, enabled: ["configured"], actions: [], untilTicks: 12, maxEvents: 100,
    settings: { sourceDelayMs: 0, jevDelayMs: 100, outputDelayMs: 80, outcome: "finding",
      burst: 1, arrivalIntervalMs: 30000 } }
  const descriptor = { cost: 60, ability: "jevService" as const, displayName: "Configurable service", lesson: "Future latency and connectivity" }
  const build = { atTick: 0, kind: "build" as const, tower: "configured", x: 424, y: 392 }
  const configurations = [
    { name: "default-strength", strength: 1, radius: 100, upgrade: false },
    { name: "strength-three", strength: 3, radius: 100, upgrade: false },
    { name: "narrow-strength-three", strength: 3, radius: 20, upgrade: false },
    { name: "upgraded-strength-three", strength: 3, radius: 100, upgrade: true }
  ]
  return { scope: "baseline and four declared strength/radius/upgrade configurations" as const,
    baseline: runGameExperiment({ ...experiment, catalogue: { configured: descriptor } }),
    runs: configurations.map(configuration => ({ configuration,
      result: runGameExperiment({ ...experiment,
        catalogue: { configured: { ...descriptor, strength: configuration.strength, radius: configuration.radius } },
        actions: configuration.upgrade ? [build, { atTick: 0, kind: "upgrade", index: 1 }] : [build] }) })) }
}

/** One declared pressure context; no difficulty target or balance threshold is asserted. */
export function runGamePressureStudy() {
  const experiment: GameExperiment = {
    context: "clear-review-pressure", scenario: "continuousGame", seed: 152, layout: 0,
    budget: 160, enabled: ["jevService"], actions: [], untilTicks: 200, maxEvents: 2000,
    settings: { sourceDelayMs: 0, jevDelayMs: 3200, outputDelayMs: 800,
      outcome: "clear", burst: 7, arrivalIntervalMs: 60000 }
  }
  const comparison = compareGameExperiments(experiment, { name: "no-investment", actions: [] },
    { name: "connected-service", actions: [{ atTick: 0, kind: "build", tower: "jevService", x: 424, y: 392 }] })
  const summarize = (result: GameResult) => ({
    game: result.game, termination: result.termination,
    pressure: {
      peakLedgerBytes: Math.max(...result.observations.map(item => item.business.projection.global.bytes)),
      ledgerByteTicks: result.observations.slice(1).reduce((total, item) => total + item.business.projection.global.bytes, 0),
      peakPermitWaiting: Math.max(...result.observations.map(item =>
        item.business.projection.dispatch.queued.filter(entry => !entry.preparation && !entry.cancelled).length)),
      peakAtJev: Math.max(...result.observations.map(item =>
        item.business.projection.work.filter(work => work.kind === "atJev").length))
    },
    requestSettlements: events(result, "JevRequestSettled"),
    actionRefusals: result.actions.filter(action => action.result !== "Applied"),
    businessRefusals: refusalObservations(result),
    retainedEntries: result.business.projection.pendingFindings.length,
    timeline: result.observations.map(item => ({ tick: item.game.tick, health: item.game.health,
      businessTime: item.business.now, ledgerBytes: item.business.projection.global.bytes,
      permitWaiting: item.business.projection.dispatch.queued.filter(entry => !entry.preparation && !entry.cancelled).length })),
    recording: result.recording
  })
  return { scope: "one authored clear-review pressure context; two matched 160-budget plans" as const,
    limits: { untilTicks: 200, maxEvents: 2000, burst: 7, arrivalIntervalMs: 60000 },
    baseline: summarize(comparison.baseline.result), candidate: summarize(comparison.candidate.result), delta: comparison.delta }
}

function refusalObservations(result: GameResult) {
  const refusals: { time: number; kind: string }[] = []
  function commands(value: unknown, time: number) {
    if (value === null || typeof value !== "object") return
    const object = value as Record<string, unknown>
    if (typeof object.$ === "string" && /Refused|Denied|Rejected/.test(object.$))
      refusals.push({ time, kind: object.$ })
    for (const child of Object.values(object)) if (typeof child === "object") commands(child, time)
  }
  function visit(value: unknown) {
    if (Array.isArray(value)) { for (const item of value) visit(item); return }
    if (value === null || typeof value !== "object") return
    const object = value as Record<string, unknown>
    if (typeof object.$ === "string" && object.$.endsWith("ProductFrame")) {
      const rejection = object.rejection as Record<string, unknown>
      if (typeof rejection.$ === "string" && !rejection.$.endsWith("None"))
        refusals.push({ time: object.time as number, kind: JSON.stringify(rejection) })
      commands(object.commands, object.time as number)
      return
    }
    for (const child of Object.values(object)) visit(child)
  }
  visit(result.trace)
  return refusals
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
    searchBudget, declaredCombinations: 50, tuning, interactions, heldOut, pressureStudy: runGamePressureStudy(), parameterStudy: runGameParameterStudy(),
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
    pressureStudy: study.pressureStudy,
    parameterStudy: { scope: study.parameterStudy.scope, baseline: metrics(study.parameterStudy.baseline),
      runs: study.parameterStudy.runs.map(run => ({ configuration: run.configuration, ...metrics(run.result) })) },
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
  require(base.length === 2 && accelerated.length === 2, "the authored edit has two review units and two slowJev requests")
  require(base[0]!.time - accelerated[0]!.time === 100, "level-one service must reduce future 200ms request by100ms")
  for (const context of ["blockedSource", "blockedCredentials"])
    require(run(context, "repair").business.projection.pendingFindings.length === 2 &&
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
  const submissionTimes = (result: GameResult) => events(result, "SubmissionTerminal").map(item => item.time)
  require(JSON.stringify(submissionTimes(run("slowDelivery", "no-investment"))) === "[220,220]" &&
    JSON.stringify(submissionTimes(run("slowDelivery", "relay"))) === "[120,120]",
    "level-one relay must halve future200ms delivery, preserving the20ms request")
  require(JSON.stringify(submissionTimes(study.lateInterventions[1]!.candidate.result)) ===
    JSON.stringify(submissionTimes(study.lateInterventions[1]!.baseline.result)),
    "late relay must preserve already authorized submission timing")
  require(JSON.stringify(submissionTimes(study.heldOut[0]!.comparison.baseline.result)) === "[280,280]" &&
    JSON.stringify(submissionTimes(study.heldOut[0]!.comparison.candidate.result)) === "[160,160]",
    "held-out relay must halve future240ms delivery after40ms review")
  require(submissionTimes(study.heldOut[1]!.comparison.candidate.result).length === 0 &&
    study.heldOut[1]!.comparison.candidate.result.game.spent === 55,
    "held-out clear relay must remain a charged dead investment")
  require(study.tuning.reduce((count, context) => count + context.search.runs.length + context.search.invalid.length, 0) === 49,
    "search must execute exactly49 declared combinations")
  require(study.tuning.at(-1)!.search.unsearched.length === 1, "search must expose one unsearched placement plan")
  require(study.heldOut.length === 2 && study.heldOut.every(context => context.context.startsWith("heldOut")),
    "held-out contexts must remain separate")
  for (const context of study.tuning)
    for (const item of context.search.runs)
      require(item.result.game.spent + item.result.game.remainingBudget === 160 && item.result.business.events <= 128,
        "actual-game budget and event limits must hold")
  const pressure = study.pressureStudy
  require(pressure.baseline.requestSettlements.length > 0 &&
    pressure.baseline.requestSettlements.length === pressure.candidate.requestSettlements.length,
    "pressure comparison must preserve admitted request count")
  require(pressure.baseline.requestSettlements.every(item => item.time === 3200) &&
    pressure.candidate.requestSettlements.every(item => item.time === 1600),
    "connected level-one Service must halve configured3200ms future request latency")
  require(pressure.baseline.pressure.peakAtJev === pressure.candidate.pressure.peakAtJev &&
    JSON.stringify(pressure.baseline.businessRefusals) === JSON.stringify(pressure.candidate.businessRefusals),
    "latency purchase must not change permits or erase initial admission refusals")
  require(pressure.baseline.game.initialBudget === 160 && pressure.candidate.game.initialBudget === 160 &&
    pressure.candidate.game.spent === 60, "pressure comparison must retain matched investment budgets")
  const expectedParameterTimes: Record<string, readonly number[]> = {
    "default-strength": [50, 50], "strength-three": [25, 25],
    "narrow-strength-three": [100, 100], "upgraded-strength-three": [14, 14]
  }
  for (const run of study.parameterStudy.runs)
    require(JSON.stringify(settled(run.result).map(item => item.time)) ===
      JSON.stringify(expectedParameterTimes[run.configuration.name]),
      `declared parameter timing failed: ${run.configuration.name}`)
  return { checked: "declared spatial Host scenarios only" as const, tuningRuns: 49, heldOutContexts: 2,
    pressureComparisonRuns: 2, parameterComparisonRuns: 5 }
}
