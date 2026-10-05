import { evaluateHeldOut, searchContexts, type ExperimentContext, type ExperimentPlan } from "./index.ts"

/** Authored teaching fixtures, not samples from an empirical workload distribution. */
export function runExampleStudy() {
  const common = {
    budget: 160, enabled: ["coordinator", "packager", "parallelizer", "outputLatency"],
    actions: [], untilTime: 30, maxEvents: 100
  }
  const scenario = {
    seed: 7, preparationDelay: 2, jevDelay: 5,
    inputs: [{ at: 0, kind: "edit" as const, bytes: 10, unitBytes: [5] }],
    outputProfile: { outcome: "certain" as const, delayMs: 100, leaseMs: 200 }
  }
  const contexts: readonly ExperimentContext[] = [
    { role: "tuning", experiment: { ...common, context: "slow-finding-output",
      scenario: { ...scenario, outcome: "finding" } } },
    { role: "heldOut", experiment: { ...common, context: "clear-review",
      scenario: { ...scenario, outcome: "clear" } } }
  ]
  const baseline: ExperimentPlan = { name: "no-investment", actions: [] }
  const candidate: ExperimentPlan = { name: "early-output-profile", actions: [{ at: 0, mechanism: "outputLatency" }] }
  const plans: readonly ExperimentPlan[] = [baseline, candidate,
    { name: "provisional-three", actions: [
      { at: 0, mechanism: "coordinator" }, { at: 0, mechanism: "packager" }, { at: 0, mechanism: "parallelizer" }
    ] }]
  return {
    assumptions: ["authored deterministic fixtures", "fixed investment budgets; no game rewards or combat",
      "output latency is an experimental replacement, not Packager batching",
      "candidate selected before held-out evaluation; no automatic balance patch",
      "human learning and enjoyment are unmeasured"],
    search: searchContexts(contexts, plans, 3),
    validation: evaluateHeldOut(contexts, baseline, candidate)
  }
}
