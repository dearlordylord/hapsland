import { compareExperiments, compareInteraction, evaluateHeldOut, searchContexts,
  type ExperimentContext, type ExperimentPlan } from "./index.ts"

/** Authored teaching fixtures, not samples from an empirical workload distribution. */
export function runExampleStudy() {
  const common = {
    budget: 160, enabled: ["jevService", "deliveryRelay", "accessRepair"],
    actions: [], untilTime: 70, maxEvents: 100
  }
  const scenario = {
    seed: 7, preparationDelay: 2, jevDelay: 5, outcome: "finding" as const,
    inputs: [{ at: 0, kind: "edit" as const, bytes: 10, unitBytes: [5] }],
    session: { editIntervalMs: 1000000, variationMs: 0, editsPerTask: 1000 },
    outputProfile: { outcome: "certain" as const, delayMs: 80, leaseMs: 200 }
  }
  const contexts: readonly ExperimentContext[] = [
    { role: "tuning", experiment: { ...common, context: "slowJev",
      scenario: { ...scenario, jevDelay: 100, outputProfile: { ...scenario.outputProfile, delayMs: 1 } } } },
    { role: "tuning", experiment: { ...common, context: "slowFindingDelivery", scenario } },
    { role: "tuning", experiment: { ...common, context: "allClear", scenario: { ...scenario, outcome: "clear" } } },
    { role: "tuning", experiment: { ...common, context: "unavailableSource",
      scenario: { ...scenario, environment: { currentWork: true, credentialReady: true, sourceReadable: false } } } },
    { role: "tuning", experiment: { ...common, context: "unavailableCredentials",
      scenario: { ...scenario, environment: { currentWork: true, credentialReady: false, sourceReadable: true } } } },
    { role: "heldOut", experiment: { ...common, context: "heldOutFindingDelivery", untilTime: 90,
      scenario: { ...scenario, seed: 17, jevDelay: 9, outputProfile: { ...scenario.outputProfile, delayMs: 120 } } } },
    { role: "heldOut", experiment: { ...common, context: "heldOutNoEligibleOutput",
      scenario: { ...scenario, seed: 17, outcome: "clear" } } }
  ]
  const baseline: ExperimentPlan = { name: "no-investment", actions: [] }
  const service: ExperimentPlan = { name: "service", actions: [{ at: 0, mechanism: "jevService" }] }
  const relay: ExperimentPlan = { name: "relay", actions: [{ at: 0, mechanism: "deliveryRelay" }] }
  const repair: ExperimentPlan = { name: "repair", actions: [{ at: 0, mechanism: "accessRepair" }] }
  const pairs: readonly ExperimentPlan[] = [
    { name: "service+relay", actions: [...service.actions, ...relay.actions] },
    { name: "service+repair", actions: [...service.actions, ...repair.actions] },
    { name: "relay+repair", actions: [...relay.actions, ...repair.actions] }
  ]
  const lateService: ExperimentPlan = { name: "late-service", actions: [{ at: 2, mechanism: "jevService" }] }
  const lateRelay: ExperimentPlan = { name: "late-relay", actions: [{ at: 7, mechanism: "deliveryRelay" }] }
  const plans = [baseline, service, relay, repair, ...pairs, lateService, lateRelay]
  return {
    assumptions: ["authored deterministic fixtures; fixed explicit finding/clear outcomes",
      "fixed investment budgets; no game rewards or spatial combat in direct mode",
      "late request/output interventions preserve already issued/authorized facts",
      "relay candidate declared before held-out evaluation; no automatic balance patch",
      "finite search of declared schedules; no global optimality or probability claim",
      "human learning and enjoyment are unmeasured"],
    search: searchContexts(contexts, plans, 44),
    interactions: contexts.filter(context => context.role === "tuning").map(context => ({
      context: context.experiment.context,
      serviceRelay: compareInteraction(context.experiment, service, relay),
      relayRepair: compareInteraction(context.experiment, relay, repair)
    })),
    lateInterventions: [
      compareExperiments(contexts[0]!.experiment, baseline, lateService),
      compareExperiments(contexts[1]!.experiment, baseline, lateRelay)
    ],
    validation: evaluateHeldOut(contexts, baseline, relay)
  }
}

/** Compact measured data for the declared study; full traces remain available above. */
export function summarizeExampleStudy(study = runExampleStudy()) {
  const metrics = (result: ReturnType<typeof compareInteraction>["baseline"]) => ({
    spent: result.game.spent, remainingBudget: result.game.remainingBudget,
    requestsStarted: result.business.requestsStarted, certainOutputs: result.business.certainOutputs,
    retainedEntries: result.business.pendingFindings, ownedBytes: result.business.ownedBytes,
    termination: result.termination, actions: result.actions.map(action => ({
      mechanism: action.action.mechanism, result: action.result, charged: action.charged
    }))
  })
  return {
    assumptions: study.assumptions,
    tuning: study.search.tuning.map(context => ({ context: context.context,
      runs: context.search.runs.map(run => ({ name: run.name, ...metrics(run.result) })),
      invalid: context.search.invalid, unsearched: context.search.unsearched })),
    interactions: study.interactions.map(context => ({ context: context.context,
      serviceRelay: { baseline: metrics(context.serviceRelay.baseline), a: metrics(context.serviceRelay.a),
        b: metrics(context.serviceRelay.b), combined: metrics(context.serviceRelay.combined) },
      relayRepair: { baseline: metrics(context.relayRepair.baseline), a: metrics(context.relayRepair.a),
        b: metrics(context.relayRepair.b), combined: metrics(context.relayRepair.combined) } })),
    lateInterventions: study.lateInterventions.map(comparison => ({ context: comparison.baseline.result.context,
      baseline: metrics(comparison.baseline.result), candidate: metrics(comparison.candidate.result), delta: comparison.delta })),
    heldOut: study.validation.map(context => ({ context: context.context,
      baseline: metrics(context.comparison.baseline.result), candidate: metrics(context.comparison.candidate.result),
      delta: context.comparison.delta }))
  }
}
