import { expect, it } from "vitest"
import { spawnSync } from "node:child_process"
import Mechanics from "../prototypes/canonical-defense/lab/mechanics.generated.mjs"
import {
  runGameExperiment,
  replayGameExperiment,
  compareGameExperiments,
  searchGameExperiments
} from "../prototypes/canonical-defense/lab/game.ts"
import {
  runExperiment,
  replayExperiment,
  searchExperiments,
  compareExperiments,
  compareInteraction,
  searchContexts,
  evaluateHeldOut
} from "../prototypes/canonical-defense/lab/index.ts"

it("reuses actual game placement and upgrades with independently expected charges and refusals", () => {
  const native = spawnSync("bend", ["prototypes/canonical-defense/DefenseLabTests.bend"], {
    encoding: "utf8",
    timeout: 55000,
    maxBuffer: 4 * 1024 * 1024
  })
  expect(native.error).toBeUndefined()
  expect(native.status, native.stdout + native.stderr).toBe(0)
  expect(native.stdout).toContain("PASS Refiner legal placement costs55")
  expect(native.stdout).toContain("PASS illegal placement preserves160 budget")
  expect(native.stdout).toContain("PASS unaffordable placement costs zero")
  expect(native.stdout).toContain("PASS first upgrade costs40")
}, 60000)

it("records actual game placement, upgrades and health independently of business transitions", () => {
  const result = runGameExperiment({
    context: "actual-game",
    scenario: "continuousGame",
    seed: 152,
    budget: 160,
    layout: 0,
    enabled: ["refiner"],
    untilTicks: 2,
    maxEvents: 100,
    actions: [
      { atTick: 0, kind: "build", tower: "refiner", x: 424, y: 232 },
      { atTick: 0, kind: "upgrade", index: 1 }
    ]
  })
  expect(result.actions.map((action) => [action.result, action.charged])).toEqual([
    ["Applied", 55],
    ["Applied", 40]
  ])
  expect(result.game).toEqual({
    initialBudget: 160,
    spent: 95,
    remainingBudget: 65,
    health: 100,
    tick: 2,
    towerCount: 1
  })
  expect(result.business.events).toBe(0)
  expect(result.business.now).toBe(0)
  expect(result.termination).toBe("tickLimit")
  expect(replayGameExperiment(JSON.parse(JSON.stringify(result.recording)))).toEqual(result)
  expect(() => replayGameExperiment({ ...result.recording, traceIdentity: "changed" })).toThrow("trace")
})

it("reports actual game action refusals and preserves fixed investment resources", () => {
  const result = runGameExperiment({
    context: "game-refusals",
    scenario: "continuousGame",
    seed: 152,
    budget: 54,
    layout: 0,
    enabled: ["refiner"],
    untilTicks: 0,
    maxEvents: 100,
    actions: [
      { atTick: 0, kind: "build", tower: "refiner", x: 0, y: 0 },
      { atTick: 0, kind: "build", tower: "refiner", x: 424, y: 232 },
      { atTick: 0, kind: "build", tower: "coordinator", x: 424, y: 232 },
      { atTick: 0, kind: "upgrade", index: 1 }
    ]
  })
  expect(result.actions.map((action) => action.result)).toEqual([
    "IllegalPlacement",
    "Unaffordable",
    "disabled",
    "UnknownTower"
  ])
  expect(result.actions.map((action) => action.charged)).toEqual([0, 0, 0, 0])
  expect(result.game.remainingBudget).toBe(54)
  expect(result.game.towerCount).toBe(0)
})

it("bounds actual game business events and reports later actions as unreached", () => {
  const result = runGameExperiment({
    context: "game-exhaustion",
    scenario: "continuousGame",
    seed: 152,
    budget: 160,
    layout: 0,
    enabled: ["refiner"],
    untilTicks: 200,
    maxEvents: 1,
    actions: [{ atTick: 200, kind: "build", tower: "refiner", x: 424, y: 232 }]
  })
  expect(result.termination).toBe("eventLimit")
  expect(result.business.events).toBe(1)
  expect(result.game.tick).toBeLessThan(200)
  expect(result.actions[0]?.result).toBe("notReached")
  expect(result.game.spent).toBe(0)
})

it("compares and searches declared actual-game placement schedules under equal bounds", () => {
  const input = {
    context: "game-plans",
    scenario: "continuousGame" as const,
    seed: 152,
    budget: 160,
    layout: 0 as const,
    enabled: ["refiner" as const],
    actions: [],
    untilTicks: 2,
    maxEvents: 100
  }
  const baseline = { name: "none", actions: [] }
  const candidate = {
    name: "placed",
    actions: [{ atTick: 0, kind: "build" as const, tower: "refiner" as const, x: 424, y: 232 }]
  }
  const comparison = compareGameExperiments(input, baseline, candidate)
  expect(comparison.delta.game).toEqual({ health: 0, spent: 55, remainingBudget: -55 })
  expect(comparison.delta.business).toEqual({ events: 0, ownedBytes: 0, retainedEntries: 0 })
  const search = searchGameExperiments(input, [baseline, candidate], 1)
  expect(search.runs.map((run) => run.name)).toEqual(["none"])
  expect(search.unsearched).toEqual(["placed"])
  expect(
    searchGameExperiments(input, [{ name: "bad", actions: [{ ...candidate.actions[0]!, atTick: 3 }] }], 1).invalid[0]
      ?.error
  ).toBe("invalid game action tick")
})

it("runs a fixed-budget no-investment experiment on shared business observations", () => {
  const result = runExperiment({
    context: "single-finding",
    scenario: {
      seed: 7,
      outcome: "finding",
      inputs: [
        { at: 0, kind: "edit", bytes: 10, unitBytes: [5] },
        { at: 20, kind: "finish" }
      ]
    },
    budget: 160,
    enabled: [],
    actions: [],
    untilTime: 40,
    maxEvents: 100
  })
  expect(result.game).toEqual({ initialBudget: 160, spent: 0, remainingBudget: 160 })
  expect(result.business.requestsStarted).toBe(1)
  expect(result.business.frames).toBeGreaterThan(0)
  expect(result.replay.format).toBe("monkey-business/1")
  expect(result.termination).not.toBe("eventLimit")
})

it("rejects unknown enabled mechanisms and unbounded execution before a run starts", () => {
  const input = {
    context: "validation",
    scenario: { seed: 7 },
    budget: 160,
    enabled: [],
    actions: [],
    untilTime: 40,
    maxEvents: 100
  }
  expect(() => runExperiment({ ...input, enabled: ["unknown"] })).toThrow("unknown mechanism")
  expect(() => runExperiment({ ...input, maxEvents: 0 })).toThrow("maxEvents")
  expect(() => runExperiment({ ...input, untilTime: Infinity })).toThrow("untilTime")
})

it("reports unsupported abilities without spending or changing the business replay", () => {
  const common = {
    context: "unsupported",
    scenario: { seed: 7, outcome: "finding" as const },
    budget: 160,
    enabled: ["coordinator", "parallelizer", "packager"],
    untilTime: 40,
    maxEvents: 100
  }
  const baseline = runExperiment({ ...common, actions: [] })
  const candidate = runExperiment({
    ...common,
    actions: [
      { at: 0, mechanism: "coordinator" },
      { at: 0, mechanism: "parallelizer" },
      { at: 0, mechanism: "packager" }
    ]
  })
  expect(candidate.actions.map((action) => action.result)).toEqual(["unsupported", "unsupported", "unsupported"])
  expect(candidate.game.spent).toBe(0)
  expect(candidate.replay).toEqual(baseline.replay)
})

it("applies future output latency through the shared control and charges only affordable actions", () => {
  const common = {
    context: "output-latency",
    scenario: {
      seed: 7,
      outcome: "finding" as const,
      outputProfile: { outcome: "certain" as const, delayMs: 20, leaseMs: 100 },
      inputs: [{ at: 0, kind: "edit" as const, bytes: 10, unitBytes: [5] }]
    },
    budget: 60,
    enabled: ["outputLatency"],
    untilTime: 60,
    maxEvents: 100
  }
  const result = runExperiment({
    ...common,
    actions: [
      { at: 0, mechanism: "outputLatency" },
      { at: 0, mechanism: "outputLatency" }
    ]
  })
  expect(result.actions.map((action) => action.result)).toEqual(["applied", "unaffordable"])
  expect(result.game).toEqual({ initialBudget: 60, spent: 60, remainingBudget: 0 })
  expect(result.replay.controls).toHaveLength(1)
  expect(result.replay.controls[0]?.control).toEqual({
    kind: "outputProfile",
    outcome: "certain",
    delayMs: 2,
    leaseMs: 100
  })
})

it("reproduces game accounting and business results and refuses another mechanism identity", () => {
  const input = {
    context: "replay",
    scenario: { seed: 7, outcome: "finding" as const },
    budget: 160,
    enabled: ["outputLatency"],
    actions: [{ at: 0, mechanism: "outputLatency" }],
    untilTime: 40,
    maxEvents: 100
  }
  const original = runExperiment(input)
  expect(replayExperiment(original.recording)).toEqual(original)
  expect(() => replayExperiment({ ...original.recording, mechanismIdentity: "different" })).toThrow("incompatible")
  input.actions[0]!.at = 1
  expect(original.recording.experiment.actions[0]?.at).toBe(0)
})

it("enumerates only the declared plan budget and reports the unsearched remainder", () => {
  const experiment = {
    context: "enumeration",
    scenario: { seed: 7, outcome: "finding" as const },
    budget: 160,
    enabled: ["outputLatency"],
    actions: [],
    untilTime: 40,
    maxEvents: 100
  }
  const result = searchExperiments(
    experiment,
    [
      { name: "baseline", actions: [] },
      { name: "fast-output", actions: [{ at: 0, mechanism: "outputLatency" }] },
      { name: "unsearched", actions: [] }
    ],
    2
  )
  expect(result.runs.map((run) => run.name)).toEqual(["baseline", "fast-output"])
  expect(result.unsearched).toEqual(["unsearched"])
  expect(result.runs[1]?.result.game.spent).toBe(60)
  expect(result.scope).toBe("declared plans only")
})

it("does not apply a timed action before its business boundary or beyond the global event budget", () => {
  const common = {
    context: "action-boundary",
    scenario: {
      seed: 7,
      outcome: "finding" as const,
      inputs: [{ at: 20, kind: "edit" as const, bytes: 10, unitBytes: [5] }]
    },
    budget: 160,
    enabled: ["outputLatency"],
    untilTime: 40,
    maxEvents: 100
  }
  const early = runExperiment({ ...common, actions: [{ at: 10, mechanism: "outputLatency" }] })
  expect(early.actions[0]?.result).toBe("notReached")
  expect(early.game.spent).toBe(0)
  expect(early.replay.controls).toHaveLength(0)
  const bounded = runExperiment({ ...common, maxEvents: 1, actions: [{ at: 30, mechanism: "outputLatency" }] })
  expect(bounded.business.frames).toBeLessThanOrEqual(1)
  expect(bounded.actions[0]?.result).toBe("notReached")
  expect(bounded.termination).toBe("eventLimit")
})

it("reports retained ownership separately from successful output", () => {
  const result = runExperiment({
    context: "retention",
    scenario: {
      seed: 7,
      outcome: "finding",
      outputProfile: { outcome: "certain", delayMs: 100, leaseMs: 200 },
      inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5] }]
    },
    budget: 160,
    enabled: [],
    actions: [],
    untilTime: 30,
    maxEvents: 100
  })
  expect(result.business.peakOwnedBytes).toBeGreaterThan(0)
  expect(result.business.pendingFindings).toBe(1)
  expect(result.business.certainOutputs).toBe(0)
  expect(result.business.ownedBytes).toBeGreaterThan(0)
  expect(result.observations.some((frame) => frame.event.kind === "jevRequestStarted")).toBe(true)
})

it("compares policies with identical scenario, budget and stopping bounds and exposes separate metric deltas", () => {
  const experiment = {
    context: "paired",
    scenario: {
      seed: 7,
      outcome: "finding" as const,
      outputProfile: { outcome: "certain" as const, delayMs: 100, leaseMs: 200 },
      inputs: [{ at: 0, kind: "edit" as const, bytes: 10, unitBytes: [5] }]
    },
    budget: 160,
    enabled: ["outputLatency"],
    actions: [],
    untilTime: 30,
    maxEvents: 100
  }
  const result = compareExperiments(
    experiment,
    { name: "baseline", actions: [] },
    { name: "candidate", actions: [{ at: 0, mechanism: "outputLatency" }] }
  )
  expect(result.baseline.result.game.initialBudget).toBe(160)
  expect(result.candidate.result.game.initialBudget).toBe(160)
  expect(result.delta.game.spent).toBe(60)
  expect(result.delta.business.certainOutputs).toBe(1)
  // Acknowledgment retains the finding; delivery certainty is a separate observation.
  expect(result.delta.business.pendingFindings).toBe(0)
  expect(result.delta.business.requestsStarted).toBe(0)
  expect(result.scope).toBe("one declared context and two declared policies")
  expect(experiment.actions).toEqual([])
})

it("searches tuning contexts only and evaluates a declared selection separately on held-out contexts", () => {
  const common = {
    scenario: { seed: 7, outcome: "finding" as const },
    budget: 160,
    enabled: ["outputLatency"],
    actions: [],
    untilTime: 40,
    maxEvents: 100
  }
  const contexts = [
    { role: "tuning" as const, experiment: { ...common, context: "train" } },
    { role: "heldOut" as const, experiment: { ...common, context: "unseen" } }
  ]
  const plans = [
    { name: "baseline", actions: [] },
    { name: "fast", actions: [{ at: 0, mechanism: "outputLatency" }] }
  ]
  const search = searchContexts(contexts, plans, 1)
  expect(search.tuning.map((context) => context.context)).toEqual(["train"])
  expect(search.tuning[0]?.search.runs.map((run) => run.name)).toEqual(["baseline"])
  expect(search.heldOut).toEqual(["unseen"])
  const bounded = searchContexts(
    [...contexts, { role: "tuning", experiment: { ...common, context: "second-train" } }],
    plans,
    1
  )
  expect(bounded.tuning[1]?.search.runs).toEqual([])
  expect(bounded.tuning[1]?.search.unsearched).toEqual(["baseline", "fast"])
  const validation = evaluateHeldOut(contexts, plans[0]!, plans[1]!)
  expect(validation.map((context) => context.context)).toEqual(["unseen"])
  expect(validation[0]?.comparison.delta.game.spent).toBe(60)
  expect(() => searchContexts([contexts[0]!, contexts[0]!], plans, 1)).toThrow("duplicate context")
})

it("replaces a named mechanism's ability without changing the scenario or action boundary", () => {
  const experiment = {
    context: "replace-ability",
    scenario: { seed: 7, outcome: "finding" as const },
    budget: 160,
    enabled: ["coordinator"],
    untilTime: 40,
    maxEvents: 100,
    actions: [{ at: 0, mechanism: "coordinator" }]
  }
  const original = runExperiment(experiment)
  expect(original.actions[0]?.result).toBe("unsupported")
  const replacement = runExperiment({
    ...experiment,
    catalogue: {
      coordinator: {
        cost: 35,
        displayName: "Output helper",
        lesson: "Future output timing",
        target: "future output attempts",
        applicability: "before authorization",
        observation: "submissionTerminal time",
        ability: { kind: "outputLatency" as const, delayMs: 2, leaseMs: 100 }
      }
    }
  })
  expect(replacement.actions[0]?.result).toBe("applied")
  expect(replacement.replay.controls[0]?.control).toEqual({
    kind: "outputProfile",
    outcome: "certain",
    delayMs: 2,
    leaseMs: 100
  })
  expect(replayExperiment(replacement.recording)).toEqual(replacement)
  expect(() => runExperiment({ ...experiment, catalogue: {} })).toThrow("unknown mechanism")
})

it("records invalid declared plans but propagates shared-engine failures", () => {
  const experiment = {
    context: "search-errors",
    scenario: { seed: 7 },
    budget: 160,
    enabled: [],
    actions: [],
    untilTime: 40,
    maxEvents: 100
  }
  const result = searchExperiments(
    experiment,
    [
      { name: "invalid", actions: [{ at: 0, mechanism: "removed" }] },
      { name: "valid", actions: [] }
    ],
    2
  )
  expect(result.invalid).toEqual([{ name: "invalid", error: "unknown mechanism" }])
  expect(result.runs.map((run) => run.name)).toEqual(["valid"])
  expect(() =>
    searchExperiments(
      {
        ...experiment,
        scenario: {
          seed: 7,
          outcomeWeights: { finding: 0, clear: 0, backendFailure: 0, interrupted: 0, neverSent: 0, timeout: 0 }
        }
      },
      [{ name: "baseline", actions: [] }],
      1
    )
  ).toThrow(RangeError)
})

it("validates search contracts even when there are no tuning runs", () => {
  const experiment = {
    context: "empty-search",
    scenario: { seed: 7 },
    budget: 160,
    enabled: [],
    actions: [],
    untilTime: 40,
    maxEvents: 100
  }
  expect(() => searchExperiments({ ...experiment, budget: -1 }, [], 1)).toThrow("budget")
  expect(() =>
    searchContexts(
      [{ role: "heldOut", experiment }],
      [
        { name: "duplicate", actions: [] },
        { name: "duplicate", actions: [] }
      ],
      1
    )
  ).toThrow("duplicate plan name")
})

it("binds recordings to the actual lab source and all experiment inputs, including game-only accounting", () => {
  const result = runExperiment({
    context: "identity",
    scenario: { seed: 7 },
    budget: 160,
    enabled: [],
    actions: [],
    untilTime: 40,
    maxEvents: 100
  })
  expect(result.recording.mechanismIdentity).toMatch(/^sha256:[a-f0-9]{64}$/)
  expect(result.recording.configurationIdentity).toMatch(/^sha256:[a-f0-9]{64}$/)
  expect(() =>
    replayExperiment({ ...result.recording, experiment: { ...result.recording.experiment, budget: 161 } })
  ).toThrow("configuration identity")
})

it("preserves an authorized output deadline when a later ability changes only the future profile", () => {
  const experiment = {
    context: "committed-output",
    catalogue: {
      outputLatency: {
        cost: 60,
        displayName: "Output",
        lesson: "Future output",
        target: "future output attempts",
        applicability: "before authorization",
        observation: "submissionTerminal time",
        ability: { kind: "outputLatency" as const, delayMs: 0, leaseMs: 100 }
      }
    },
    scenario: {
      seed: 7,
      preparationDelay: 2,
      jevDelay: 5,
      outcome: "finding" as const,
      inputs: [{ at: 0, kind: "edit" as const, bytes: 10, unitBytes: [5] }],
      outputProfile: { outcome: "certain" as const, delayMs: 5, leaseMs: 100 }
    },
    budget: 160,
    enabled: ["outputLatency"],
    actions: [],
    untilTime: 20,
    maxEvents: 100
  }
  const baseline = runExperiment(experiment)
  const late = runExperiment({ ...experiment, actions: [{ at: 7, mechanism: "outputLatency" }] })
  const early = runExperiment({ ...experiment, actions: [{ at: 0, mechanism: "outputLatency" }] })
  const outputTimes = (result: ReturnType<typeof runExperiment>) =>
    result.observations.filter((frame) => frame.event.kind === "submissionTerminal").map((frame) => frame.time)
  // Preparation takes 2ms, review 5ms, and authorization captures a further 5ms.
  expect(outputTimes(baseline)).toEqual([12])
  expect(late.actions[0]?.result).toBe("applied")
  expect(outputTimes(late)).toEqual([12])
  expect(outputTimes(early)).toEqual([7])
  expect(late.business.requestsStarted).toBe(1)
  expect(late.business.pendingFindings).toBe(1)
  expect(replayExperiment(JSON.parse(JSON.stringify(late.recording)))).toEqual(late)
})

it("charges the configured price rather than a price chosen by the player plan", () => {
  const result = runExperiment({
    context: "configured-price",
    scenario: { seed: 7 },
    budget: 20,
    catalogue: {
      helper: {
        cost: 12,
        displayName: "Helper",
        lesson: "Future output",
        target: "future output attempts",
        applicability: "before authorization",
        observation: "submissionTerminal time",
        ability: { kind: "outputLatency", delayMs: 2, leaseMs: 100 }
      }
    },
    enabled: ["helper"],
    actions: [
      { at: 0, mechanism: "helper" },
      { at: 0, mechanism: "helper" }
    ],
    untilTime: 40,
    maxEvents: 100
  })
  expect(result.game).toEqual({ initialBudget: 20, spent: 12, remainingBudget: 8 })
  expect(result.actions.map((action) => action.result)).toEqual(["applied", "unaffordable"])
})

it("rejects plan-supplied prices and invalid catalogue prices before execution", () => {
  const experiment = {
    context: "price-validation",
    scenario: { seed: 7 },
    budget: 160,
    enabled: ["outputLatency"],
    untilTime: 40,
    maxEvents: 100,
    actions: [{ at: 0, mechanism: "outputLatency", cost: 0 }]
  }
  expect(() => runExperiment(experiment)).toThrow("action cost belongs to mechanism configuration")
  expect(() =>
    runExperiment({
      ...experiment,
      actions: [],
      catalogue: {
        outputLatency: {
          displayName: "Output",
          lesson: "Future output",
          target: "future output attempts",
          applicability: "before authorization",
          observation: "submissionTerminal time",
          cost: -1,
          ability: { kind: "outputLatency", delayMs: 2, leaseMs: 100 }
        }
      }
    })
  ).toThrow("invalid mechanism cost")
})

it("rejects effect parameters supplied by a player plan", () => {
  const experiment = {
    context: "plan-parameters",
    scenario: { seed: 7 },
    budget: 160,
    enabled: ["outputLatency"],
    untilTime: 40,
    maxEvents: 100,
    actions: [{ at: 0, mechanism: "outputLatency", delayMs: 0, leaseMs: 100 }]
  }
  expect(() => runExperiment(experiment)).toThrow("action parameters belong to mechanism configuration")
})

it("distinguishes a fixed outcome override from seed-only outcome coupling in paired comparisons", () => {
  const experiment = {
    context: "outcome-coupling",
    scenario: { seed: 7 },
    budget: 160,
    enabled: [],
    actions: [],
    untilTime: 40,
    maxEvents: 100
  }
  const baseline = { name: "baseline", actions: [] }
  const candidate = { name: "candidate", actions: [] }
  expect(compareExperiments(experiment, baseline, candidate).outcomeCoupling).toBe(
    "same seed; sampled outcomes may attach to different issued operations"
  )
  expect(
    compareExperiments({ ...experiment, scenario: { seed: 7, outcome: "finding" } }, baseline, candidate)
      .outcomeCoupling
  ).toBe("fixed scenario outcome override; explicit per-input overrides still apply")
})

it("compares baseline, A, B and A+B with shared bounds and exposes profile replacement rather than additive acceleration", () => {
  const experiment = {
    context: "profile-interaction",
    scenario: {
      seed: 7,
      preparationDelay: 2,
      jevDelay: 5,
      outcome: "finding" as const,
      inputs: [{ at: 0, kind: "edit" as const, bytes: 10, unitBytes: [5] }],
      outputProfile: { outcome: "certain" as const, delayMs: 100, leaseMs: 200 }
    },
    catalogue: {
      a: {
        cost: 60,
        displayName: "A",
        lesson: "Future output",
        target: "future output attempts",
        applicability: "before authorization",
        observation: "submissionTerminal time",
        ability: { kind: "outputLatency" as const, delayMs: 2, leaseMs: 100 }
      },
      b: {
        cost: 60,
        displayName: "B",
        lesson: "Future output",
        target: "future output attempts",
        applicability: "before authorization",
        observation: "submissionTerminal time",
        ability: { kind: "outputLatency" as const, delayMs: 0, leaseMs: 100 }
      }
    },
    budget: 160,
    enabled: ["a", "b"],
    actions: [],
    untilTime: 8,
    maxEvents: 100
  }
  const result = compareInteraction(
    experiment,
    { name: "A", actions: [{ at: 0, mechanism: "a" }] },
    { name: "B", actions: [{ at: 0, mechanism: "b" }] }
  )
  expect([result.baseline, result.a, result.b, result.combined].map((run) => run.game.initialBudget)).toEqual([
    160, 160, 160, 160
  ])
  expect([result.baseline, result.a, result.b, result.combined].map((run) => run.business.certainOutputs)).toEqual([
    0, 0, 1, 1
  ])
  expect(result.combined.game.spent).toBe(120)
  expect(result.combined.replay.controls.map((entry) => entry.control)).toEqual([
    { kind: "outputProfile", outcome: "certain", delayMs: 2, leaseMs: 100 },
    { kind: "outputProfile", outcome: "certain", delayMs: 0, leaseMs: 100 }
  ])
  expect(result.scope).toBe("one declared context; baseline, A, B and ordered A+B")
})

it("does not charge or apply a disabled mechanism", () => {
  const experiment = {
    context: "disabled",
    scenario: { seed: 7 },
    budget: 160,
    enabled: [],
    actions: [],
    untilTime: 40,
    maxEvents: 100
  }
  const baseline = runExperiment(experiment)
  const disabled = runExperiment({ ...experiment, actions: [{ at: 0, mechanism: "outputLatency" }] })
  expect(disabled.actions[0]?.result).toBe("disabled")
  expect(disabled.game.spent).toBe(0)
  expect(disabled.replay).toEqual(baseline.replay)
})

it("keeps streamed metrics and actions independent of business observation retention", () => {
  const experiment = {
    context: "retention-independence",
    scenario: {
      seed: 7,
      outcome: "finding" as const,
      inputs: [{ at: 0, kind: "edit" as const, bytes: 10, unitBytes: [5] }]
    },
    budget: 160,
    enabled: ["outputLatency"],
    actions: [{ at: 0, mechanism: "outputLatency" }],
    untilTime: 40,
    maxEvents: 100
  }
  const streaming = runExperiment({ ...experiment, scenario: { ...experiment.scenario, retention: 0 } })
  const retained = runExperiment({ ...experiment, scenario: { ...experiment.scenario, retention: 1000 } })
  expect(streaming.game).toEqual(retained.game)
  expect(streaming.business).toEqual(retained.business)
  expect(streaming.actions).toEqual(retained.actions)
  expect(streaming.observations).toEqual(retained.observations)
})

it("reports the actual observation endpoint separately from the declared horizon and event budget", () => {
  const result = runExperiment({
    context: "actual-endpoint",
    scenario: { seed: 7, outcome: "finding", inputs: [{ at: 20, kind: "edit", bytes: 10, unitBytes: [5] }] },
    budget: 160,
    enabled: [],
    actions: [],
    untilTime: 40,
    maxEvents: 1
  })
  expect(result.execution).toEqual({
    untilTime: 40,
    maxEvents: 1,
    now: result.replay.endpoint.now,
    events: result.replay.endpoint.eventCount
  })
  expect(result.execution.events).toBe(1)
  expect(result.execution.now).toBeLessThan(40)
  expect(result.termination).toBe("eventLimit")
})

it("records each action's actual charge, including zero for refusals", () => {
  const result = runExperiment({
    context: "action-receipts",
    scenario: { seed: 7 },
    budget: 60,
    enabled: ["outputLatency"],
    actions: [
      { at: 0, mechanism: "outputLatency" },
      { at: 0, mechanism: "outputLatency" },
      { at: 0, mechanism: "coordinator" }
    ],
    untilTime: 40,
    maxEvents: 100
  })
  expect(result.actions.map((action) => ({ result: action.result, charged: action.charged }))).toEqual([
    { result: "applied", charged: 60 },
    { result: "unaffordable", charged: 0 },
    { result: "disabled", charged: 0 }
  ])
  expect(result.actions.reduce((sum, action) => sum + action.charged, 0)).toBe(result.game.spent)
})

it("changes output timing without changing the declared output certainty", () => {
  const result = runExperiment({
    context: "output-certainty",
    scenario: {
      seed: 7,
      outcome: "finding",
      outputProfile: { outcome: "uncertain", delayMs: 100, leaseMs: 200 },
      inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5] }]
    },
    budget: 160,
    enabled: ["outputLatency"],
    actions: [{ at: 0, mechanism: "outputLatency" }],
    untilTime: 40,
    maxEvents: 100
  })
  expect(result.replay.controls[0]?.control).toEqual({
    kind: "outputProfile",
    outcome: "uncertain",
    delayMs: 2,
    leaseMs: 100
  })
  expect(result.business.certainOutputs).toBe(0)
})

it("checks the shared game mapping on native Bend and emitted JavaScript against independent literals", () => {
  const native = spawnSync("bend", ["prototypes/canonical-defense/DefenseMechanicsTests.bend"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    timeout: 30000
  })
  expect(native.error).toBeUndefined()
  expect(native.status, native.stdout + native.stderr).toBe(0)
  expect(native.stdout.split("\n").filter((line) => line.startsWith("PASS "))).toHaveLength(5)
  for (const $ of ["DependencyAcceleration", "FutureBatching", "LaunchPacing"] as const)
    expect(Mechanics.translate({ $ })).toEqual({ $: "Unsupported" })
  expect(Mechanics.translate({ $: "OutputLatency", outcome: 1, delay: 2n, lease: 100n })).toEqual({
    $: "OutputTiming",
    outcome: 1,
    delay: 2n,
    lease: 100n
  })
  const expectedWeights = [0n, 1071644672n, 1072693248n, 0n, 0n, 0n].reduceRight<unknown>(
    (tail, high) => ({
      $: "Con",
      head: { $: "../../packages/monkey-business-bend/Numeric.Words", high, low: 0n },
      tail
    }),
    { $: "Nil" }
  )
  expect(Mechanics.translate({ $: "Refinement" })).toEqual({
    $: "FutureReview",
    delay: 3200n,
    weights: expectedWeights
  })
}, 40000)

it("runs the example study with a causal tuning benefit and a held-out dead investment", async () => {
  const { runExampleStudy } = await import("../prototypes/canonical-defense/lab/example.ts")
  const result = runExampleStudy()
  const tuning = result.search.tuning[0]!.search.runs
  expect(tuning[0]?.result.business.certainOutputs).toBe(0)
  expect(tuning[1]?.result.business.certainOutputs).toBe(1)
  expect(tuning[2]?.result.actions.map((action) => action.result)).toEqual([
    "unsupported",
    "unsupported",
    "unsupported"
  ])
  expect(result.search.heldOut).toEqual(["clear-review"])
  expect(result.validation[0]?.comparison.delta.business.certainOutputs).toBe(0)
  expect(result.validation[0]?.comparison.delta.game.spent).toBe(60)
})

it("requires each configured mechanism to declare its target, applicability and observable lesson", () => {
  const experiment = {
    context: "teaching-metadata",
    scenario: { seed: 7 },
    budget: 160,
    enabled: ["helper"],
    actions: [],
    untilTime: 40,
    maxEvents: 100,
    catalogue: {
      helper: {
        cost: 60,
        displayName: "Helper",
        lesson: "Future output",
        target: "future output attempts",
        applicability: "before authorization",
        observation: "submissionTerminal time",
        ability: { kind: "outputLatency" as const, delayMs: 2, leaseMs: 100 }
      }
    }
  }
  expect(runExperiment(experiment).recording.experiment.catalogue?.helper?.observation).toBe("submissionTerminal time")
  expect(() =>
    runExperiment({ ...experiment, catalogue: { helper: { ...experiment.catalogue.helper, observation: "" } } })
  ).toThrow("invalid mechanism descriptor")
})

it("uses the native Refiner's future-review mapping in the laboratory", () => {
  const result = runExperiment({
    context: "refiner-mapping",
    scenario: { seed: 7 },
    budget: 160,
    enabled: ["refiner"],
    actions: [{ at: 0, mechanism: "refiner" }],
    untilTime: 40,
    maxEvents: 100
  })
  expect(result.actions[0]).toMatchObject({ result: "applied", charged: 55 })
  expect(result.replay.controls[0]?.control).toEqual({
    kind: "jevProfile",
    delayMs: 3200,
    outcomeWeights: { neverSent: 0, finding: 0.5, clear: 1, backendFailure: 0, timeout: 0, interrupted: 0 }
  })
  expect(replayExperiment(result.recording)).toEqual(result)
})

it("shows Refiner prevention before sampling and preserves an already issued finding and deadline", () => {
  const experiment = {
    context: "refiner-causality",
    scenario: {
      seed: 17,
      preparationDelay: 2,
      jevDelay: 5,
      session: { editIntervalMs: 1000000, variationMs: 0, editsPerTask: 1000 },
      inputs: [{ at: 0, kind: "edit" as const, bytes: 10, unitBytes: [5] }],
      outcomeWeights: { neverSent: 0, finding: 50, clear: 50, backendFailure: 0, timeout: 0, interrupted: 0 }
    },
    budget: 160,
    enabled: ["refiner"],
    actions: [],
    untilTime: 4000,
    maxEvents: 100
  }
  const baseline = runExperiment(experiment)
  const early = runExperiment({ ...experiment, actions: [{ at: 0, mechanism: "refiner" }] })
  const late = runExperiment({ ...experiment, actions: [{ at: 2, mechanism: "refiner" }] })
  const settlements = (result: ReturnType<typeof runExperiment>) =>
    result.observations.flatMap((frame) =>
      frame.event.kind === "jevRequestSettled" ? [{ time: frame.time, outcome: frame.event.outcome }] : []
    )
  // Independent xorshift/FNV vector: seed17 first word1976001954 gives draw0.46007.
  // It lies below baseline finding1/2, above refined finding1/3.
  expect(settlements(baseline)).toEqual([{ time: 7, outcome: "finding" }])
  expect(settlements(early)).toEqual([{ time: 3202, outcome: "clear" }])
  expect(late.actions[0]?.result).toBe("applied")
  expect(settlements(late)).toEqual([{ time: 7, outcome: "finding" }])
  expect(early.business.pendingFindings).toBe(0)
  expect(late.business.pendingFindings).toBe(1)
})
