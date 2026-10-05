import { expect, it } from "vitest"
import { readFileSync } from "node:fs"
import {
  runGameExperiment,
  verifyGeneratedGameIdentity,
  replayGameExperiment,
  compareGameExperiments,
  compareGameInteraction,
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

const gameInput = {
  context: "configured-game",
  scenario: "continuousGame" as const,
  seed: 152,
  budget: 160,
  layout: 0 as const,
  enabled: ["jevService" as const, "deliveryRelay" as const, "accessRepair" as const],
  settings: {
    sourceDelayMs: 0,
    jevDelayMs: 100,
    outputDelayMs: 80,
    outcome: "finding" as const,
    burst: 1,
    arrivalIntervalMs: 30000
  },
  actions: [],
  untilTicks: 12,
  maxEvents: 100
}

it("records actual-game placement and upgrades with configured scenarios and exact replay", () => {
  const result = runGameExperiment({
    ...gameInput,
    untilTicks: 0,
    actions: [
      { atTick: 0, kind: "build", tower: "jevService", x: 424, y: 392 },
      { atTick: 0, kind: "upgrade", index: 1 }
    ]
  })
  expect(result.actions.map((action) => [action.result, action.charged])).toEqual([
    ["Applied", 60],
    ["Applied", 40]
  ])
  expect(result.game).toEqual({
    initialBudget: 160,
    spent: 100,
    remainingBudget: 60,
    health: 100,
    tick: 0,
    towerCount: 1
  })
  expect(replayGameExperiment(JSON.parse(JSON.stringify(result.recording)))).toEqual(result)
  expect(result.businessReplay.format).toBe("monkey-business/1")
  const mutatedReplay = JSON.parse(JSON.stringify(result.recording))
  mutatedReplay.businessReplay.logicIdentity = "wrong business logic"
  expect(() => replayGameExperiment(mutatedReplay)).toThrow()
  expect(() => replayGameExperiment({ ...result.recording, traceIdentity: "changed" })).toThrow("trace")
  expect(() =>
    replayGameExperiment({
      ...result.recording,
      experiment: { ...result.recording.experiment, settings: { ...gameInput.settings, jevDelayMs: 101 } }
    })
  ).toThrow("recording")
})

it("preserves resources for illegal, unaffordable, disabled and max-level repair actions", () => {
  const result = runGameExperiment({
    ...gameInput,
    budget: 45,
    untilTicks: 0,
    enabled: ["accessRepair"],
    actions: [
      { atTick: 0, kind: "build", tower: "accessRepair", x: 0, y: 0 },
      { atTick: 0, kind: "build", tower: "jevService", x: 424, y: 392 },
      { atTick: 0, kind: "upgrade", index: 1 },
      { atTick: 0, kind: "build", tower: "accessRepair", x: 424, y: 232 },
      { atTick: 0, kind: "upgrade", index: 1 },
      { atTick: 0, kind: "build", tower: "accessRepair", x: 424, y: 392 }
    ]
  })
  expect(result.actions.map((action) => action.result)).toEqual([
    "IllegalPlacement",
    "disabled",
    "UnknownTower",
    "Applied",
    "MaxLevel",
    "Unaffordable"
  ])
  expect(result.actions.map((action) => action.charged)).toEqual([0, 0, 0, 45, 0, 0])
  expect(result.game.remainingBudget).toBe(0)
})

it("enforces the global event budget within a dense actual-game tick", () => {
  const result = runGameExperiment({
    ...gameInput,
    settings: { ...gameInput.settings, jevDelayMs: 0, outputDelayMs: 0, burst: 20 },
    maxEvents: 1,
    actions: [{ atTick: 12, kind: "build", tower: "jevService", x: 424, y: 392 }]
  })
  expect(result.termination).toBe("eventLimit")
  expect(result.business.events).toBe(1)
  expect(result.actions[0]?.result).toBe("notReached")
  expect(result.game.spent).toBe(0)
})

it("compares actual-game four arms and enumerates only declared placement schedules", () => {
  const a = {
    name: "service",
    actions: [{ atTick: 0, kind: "build" as const, tower: "jevService" as const, x: 424, y: 392 }]
  }
  const b = {
    name: "relay",
    actions: [{ atTick: 0, kind: "build" as const, tower: "deliveryRelay" as const, x: 152, y: 392 }]
  }
  const interaction = compareGameInteraction({ ...gameInput, untilTicks: 0 }, a, b)
  expect(
    [interaction.baseline, interaction.a, interaction.b, interaction.combined].map((result) => result.game.spent)
  ).toEqual([0, 60, 55, 115])
  const comparison = compareGameExperiments({ ...gameInput, untilTicks: 0 }, { name: "none", actions: [] }, a)
  expect(comparison.delta.game.spent).toBe(60)
  const searched = searchGameExperiments(gameInput, [a, b], 1)
  expect(searched.runs.map((run) => run.name)).toEqual(["service"])
  expect(searched.unsearched).toEqual(["relay"])
  const invalid = searchGameExperiments(gameInput, [{ name: "bad", actions: [{ ...a.actions[0]!, atTick: 13 }] }], 1)
  expect(invalid.invalid[0]?.error).toBe("invalid game action tick")
})

it("validates explicit game scenario domains before starting the engine", () => {
  for (const settings of [
    { jevDelayMs: -1 },
    { sourceDelayMs: 1.5 },
    { outputDelayMs: Infinity },
    { burst: 0 },
    { burst: 1025 },
    { arrivalIntervalMs: 19 },
    { arrivalIntervalMs: 60001 }
  ])
    expect(() => runGameExperiment({ ...gameInput, settings })).toThrow("invalid game")
})

/** Read actual shared product events from frame lists, without interpreting reducer state. */
function gameEvents(trace: readonly unknown[], name: string): { time: number; event: Record<string, unknown> }[] {
  const found: { time: number; event: Record<string, unknown> }[] = []
  function visit(value: unknown) {
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    if (value === null || typeof value !== "object") return
    const object = value as Record<string, unknown>
    if (typeof object.$ === "string" && object.$.endsWith("ProductFrame")) {
      const event = object.event as Record<string, unknown>
      if (typeof event.$ === "string" && event.$.endsWith(name)) found.push({ time: object.time as number, event })
      return
    }
    for (const child of Object.values(object)) visit(child)
  }
  visit(trace)
  return found
}

it("accelerates future actual-game requests while preserving issued facts and explicit finding outcomes", () => {
  const baseline = runGameExperiment(gameInput)
  const early = runGameExperiment({
    ...gameInput,
    actions: [{ atTick: 0, kind: "build", tower: "jevService", x: 424, y: 392 }]
  })
  const late = runGameExperiment({
    ...gameInput,
    actions: [{ atTick: 1, kind: "build", tower: "jevService", x: 424, y: 392 }]
  })
  const settled = (result: typeof baseline) => gameEvents(result.trace, "JevRequestSettled")
  expect(settled(baseline)).toHaveLength(1)
  expect(settled(early)).toHaveLength(1)
  expect(settled(baseline)[0]!.time - settled(early)[0]!.time).toBe(50)
  expect(settled(early)[0]!.event.outcome).toEqual(settled(baseline)[0]!.event.outcome)
  expect(settled(late)).toEqual(settled(baseline))
})

it("accelerates future actual-game finding output with a clear countercase and committed-output preservation", () => {
  const baseline = runGameExperiment(gameInput)
  const early = runGameExperiment({
    ...gameInput,
    actions: [{ atTick: 0, kind: "build", tower: "deliveryRelay", x: 152, y: 392 }]
  })
  const late = runGameExperiment({
    ...gameInput,
    actions: [{ atTick: 6, kind: "build", tower: "deliveryRelay", x: 152, y: 392 }]
  })
  const outputs = (result: typeof baseline) => gameEvents(result.trace, "OutputTerminal")
  expect(outputs(baseline)).toHaveLength(1)
  expect(outputs(baseline)[0]!.time - outputs(early)[0]!.time).toBe(40)
  expect(outputs(late)).toEqual(outputs(baseline))
  const clear = runGameExperiment({
    ...gameInput,
    settings: { ...gameInput.settings, outcome: "clear" },
    actions: [{ atTick: 0, kind: "build", tower: "deliveryRelay", x: 152, y: 392 }]
  })
  expect(outputs(clear)).toEqual([])
  expect(clear.game.spent).toBe(55)
  expect(early.business.projection.pendingFindings).toHaveLength(1)
})

it("restores blocked actual-game access and leaves healthy access business behavior unchanged", () => {
  const repair = [{ atTick: 0, kind: "build" as const, tower: "accessRepair" as const, x: 424, y: 232 }]
  for (const settings of [{ sourceReadable: false }, { credentialReady: false }]) {
    const blocked = runGameExperiment({ ...gameInput, settings: { ...gameInput.settings, ...settings } })
    const restored = runGameExperiment({
      ...gameInput,
      settings: { ...gameInput.settings, ...settings },
      actions: repair
    })
    expect(restored.business.projection.pendingFindings).toHaveLength(1)
    expect(blocked.business.projection.pendingFindings).toHaveLength(0)
    expect(restored.game.spent).toBe(45)
  }
  const baseline = runGameExperiment(gameInput)
  const healthy = runGameExperiment({ ...gameInput, actions: repair })
  expect(gameEvents(healthy.trace, "JevRequestSettled")).toEqual(gameEvents(baseline.trace, "JevRequestSettled"))
  expect(gameEvents(healthy.trace, "OutputTerminal")).toEqual(gameEvents(baseline.trace, "OutputTerminal"))
})

it("uses configured actual-game prices and refuses unaffordable or disabled purchases without charge", () => {
  const catalogue = {
    helper: { cost: 12, ability: "deliveryRelay" as const, displayName: "Helper", lesson: "Future output" },
    disabled: { cost: 0, ability: "accessRepair" as const, displayName: "Disabled", lesson: "Access" }
  }
  const result = runGameExperiment({
    ...gameInput,
    catalogue,
    enabled: ["helper"],
    budget: 20,
    untilTicks: 0,
    actions: [
      { atTick: 0, kind: "build", tower: "helper", x: 152, y: 392 },
      { atTick: 0, kind: "build", tower: "helper", x: 424, y: 392 },
      { atTick: 0, kind: "build", tower: "disabled", x: 424, y: 232 }
    ]
  })
  expect(result.actions.map((action) => [action.result, action.charged])).toEqual([
    ["Applied", 12],
    ["Unaffordable", 0],
    ["disabled", 0]
  ])
  expect(result.game.spent).toBe(12)
  expect(result.game.remainingBudget).toBe(8)
  expect(replayGameExperiment(JSON.parse(JSON.stringify(result.recording)))).toEqual(result)
  expect(() => runGameExperiment({ ...gameInput, catalogue: {} })).toThrow("enabled")
  expect(() =>
    runGameExperiment({ ...gameInput, catalogue: { helper: { ...catalogue.helper, cost: -1 } }, enabled: ["helper"] })
  ).toThrow("cost")
  expect(() =>
    runGameExperiment({
      ...gameInput,
      catalogue,
      enabled: ["helper"],
      actions: [{ atTick: 0, kind: "build", tower: "jevService", x: 424, y: 392 }]
    })
  ).toThrow("unknown game tower")
})

it("replaces a stable actual-game identity with delivery ability and records its causal countercase", () => {
  const descriptor = { cost: 60, displayName: "Editable mechanism", lesson: "Future service" }
  const actions = [{ atTick: 0, kind: "build" as const, tower: "experiment", x: 152, y: 392 }]
  const original = runGameExperiment({
    ...gameInput,
    enabled: ["experiment"],
    actions,
    catalogue: { experiment: { ...descriptor, ability: "jevService" } }
  })
  const replaced = runGameExperiment({
    ...gameInput,
    enabled: ["experiment"],
    actions,
    catalogue: { experiment: { ...descriptor, lesson: "Future output", ability: "deliveryRelay" } }
  })
  const baseline = runGameExperiment(gameInput)
  const outputs = (result: typeof baseline) => gameEvents(result.trace, "OutputTerminal")
  expect(outputs(baseline)[0]!.time - outputs(replaced)[0]!.time).toBe(40)
  expect(replaced.game.spent).toBe(60)
  expect(replaced.recording.configurationIdentity).not.toBe(original.recording.configurationIdentity)
  expect(replayGameExperiment(replaced.recording)).toEqual(replaced)
  const clear = runGameExperiment({
    ...gameInput,
    enabled: ["experiment"],
    actions,
    settings: { ...gameInput.settings, outcome: "clear" },
    catalogue: { experiment: { ...descriptor, ability: "deliveryRelay" } }
  })
  expect(outputs(clear)).toEqual([])
  expect(clear.game.spent).toBe(60)
})

it("refuses deliberately stale generated actual-game identities", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../prototypes/canonical-defense/lab/game.generated.json", import.meta.url), "utf8")
  )
  expect(() => verifyGeneratedGameIdentity({ ...manifest, moduleIdentity: "sha256:stale" })).toThrow("module identity")
  expect(() => verifyGeneratedGameIdentity({ ...manifest, sourceIdentity: "sha256:stale" })).toThrow("source identity")
  expect(() => verifyGeneratedGameIdentity(manifest)).not.toThrow()
})

const direct = {
  context: "direct",
  scenario: {
    seed: 7,
    preparationDelay: 2,
    jevDelay: 60,
    outcome: "finding" as const,
    inputs: [{ at: 0, kind: "edit" as const, bytes: 10, unitBytes: [5] }],
    outputProfile: { outcome: "uncertain" as const, delayMs: 60, leaseMs: 200 }
  },
  budget: 300,
  enabled: ["jevService", "deliveryRelay", "accessRepair"],
  actions: [],
  untilTime: 200,
  maxEvents: 100
}

it("derives repeated JevService purchases from the original delay and preserves explicit outcomes", () => {
  const result = runExperiment({
    ...direct,
    actions: [
      { at: 0, mechanism: "jevService" },
      { at: 0, mechanism: "jevService" }
    ]
  })
  expect(result.replay.controls.map((c) => c.control)).toEqual([
    { kind: "jevProfile", delayMs: 30, outcome: "finding" },
    { kind: "jevProfile", delayMs: 20, outcome: "finding" }
  ])
  expect(result.game).toEqual({ initialBudget: 300, spent: 120, remainingBudget: 180 })
  expect(replayExperiment(JSON.parse(JSON.stringify(result.recording)))).toEqual(result)
})

it("preserves sampled outcome weights and supports validated configurable costs and base delays", () => {
  const weights = { neverSent: 0, finding: 2, clear: 3, backendFailure: 0, timeout: 0, interrupted: 0 }
  const { outcome: _, ...scenario } = direct.scenario
  const descriptor = {
    cost: 12,
    displayName: "Service",
    lesson: "Future latency",
    target: "Requests",
    applicability: "Before issuance",
    observation: "Settlement",
    ability: { kind: "jevService" as const, baseDelayMs: 90 }
  }
  const result = runExperiment({
    ...direct,
    scenario: { ...scenario, outcomeWeights: weights },
    catalogue: { service: descriptor },
    enabled: ["service"],
    actions: [{ at: 0, mechanism: "service" }]
  })
  expect(result.replay.controls[0]?.control).toEqual({ kind: "jevProfile", delayMs: 45, outcomeWeights: weights })
  expect(result.game.spent).toBe(12)
  expect(() =>
    runExperiment({
      ...direct,
      catalogue: { service: { ...descriptor, ability: { kind: "jevService", baseDelayMs: -1 } } },
      enabled: ["service"]
    })
  ).toThrow("base delay")
})

it("derives DeliveryRelay timing without changing certainty or lease", () => {
  const result = runExperiment({
    ...direct,
    actions: [
      { at: 0, mechanism: "deliveryRelay" },
      { at: 0, mechanism: "deliveryRelay" }
    ]
  })
  expect(result.replay.controls.map((c) => c.control)).toEqual([
    { kind: "outputProfile", outcome: "uncertain", delayMs: 30, leaseMs: 200 },
    { kind: "outputProfile", outcome: "uncertain", delayMs: 20, leaseMs: 200 }
  ])
  expect(result.game.spent).toBe(110)
})

it("restores source and credentials once, preserving current-work and credential-generation facts", () => {
  const result = runExperiment({
    ...direct,
    scenario: {
      ...direct.scenario,
      environment: { currentWork: false, credentialReady: false, credentialGeneration: 3, sourceReadable: false }
    },
    actions: [
      { at: 0, mechanism: "accessRepair" },
      { at: 0, mechanism: "accessRepair" }
    ]
  })
  expect(result.replay.controls.map((c) => c.control)).toEqual([
    { kind: "environment", currentWork: false, credentialReady: false, credentialGeneration: 3, sourceReadable: true },
    { kind: "credentials", action: "restore" }
  ])
  expect(result.actions.map((a) => [a.result, a.charged])).toEqual([
    ["applied", 45],
    ["inapplicable", 0]
  ])
  expect(result.game.spent).toBe(45)
  expect(replayExperiment(result.recording)).toEqual(result)
})

it("preserves already issued Jev facts when purchasing after issuance", () => {
  const result = runExperiment({ ...direct, actions: [{ at: 2, mechanism: "jevService" }] })
  expect(
    result.observations.flatMap((f) =>
      f.event.kind === "jevRequestSettled" ? [{ time: f.time, outcome: f.event.outcome }] : []
    )
  ).toEqual([{ time: 62, outcome: "finding" }])
})

it("preserves authorized output timing when purchasing at its commitment boundary", () => {
  const result = runExperiment({
    ...direct,
    scenario: { ...direct.scenario, outputProfile: { outcome: "certain", delayMs: 60, leaseMs: 200 } },
    actions: [{ at: 62, mechanism: "deliveryRelay" }]
  })
  expect(result.observations.filter((f) => f.event.kind === "submissionTerminal").map((f) => f.time)).toEqual([122])
})

it("charges only enabled affordable actions and refuses removed catalogue references", () => {
  const result = runExperiment({
    ...direct,
    budget: 60,
    enabled: ["jevService"],
    actions: [
      { at: 0, mechanism: "jevService" },
      { at: 0, mechanism: "jevService" },
      { at: 0, mechanism: "deliveryRelay" }
    ]
  })
  expect(result.actions.map((a) => [a.result, a.charged])).toEqual([
    ["applied", 60],
    ["unaffordable", 0],
    ["disabled", 0]
  ])
  expect(() => runExperiment({ ...direct, catalogue: {} })).toThrow("unknown mechanism")
  expect(() => runExperiment({ ...direct, enabled: ["refiner"] })).toThrow("unknown mechanism")
  expect(() => runExperiment({ ...direct, actions: [{ ...{ at: 0, mechanism: "jevService", cost: 0 } }] })).toThrow(
    "cost"
  )
  expect(() =>
    runExperiment({ ...direct, actions: [{ ...{ at: 0, mechanism: "jevService", baseDelayMs: 0 } }] })
  ).toThrow("parameters")
})

it("bounds execution and exposes unreached actions, retained findings and actual endpoints", () => {
  const result = runExperiment({ ...direct, maxEvents: 1, actions: [{ at: 100, mechanism: "jevService" }] })
  expect(result.termination).toBe("eventLimit")
  expect(result.execution.events).toBe(1)
  expect(result.actions[0]?.result).toBe("notReached")
  expect(result.game.spent).toBe(0)
  const ordinary = runExperiment(direct)
  expect(ordinary.business.pendingFindings).toBe(1)
  expect(ordinary.business.ownedBytes).toBeGreaterThan(0)
  expect(() => replayExperiment({ ...ordinary.recording, mechanismIdentity: "wrong" })).toThrow("identity")
  expect(() => replayExperiment({ ...ordinary.recording, experiment: { ...direct, budget: 301 } })).toThrow("identity")
})

it("retains equal-budget comparisons, interaction arms, bounded search and held-out separation", () => {
  const baseline = { name: "none", actions: [] }
  const a = { name: "service", actions: [{ at: 0, mechanism: "jevService" }] }
  const b = { name: "relay", actions: [{ at: 0, mechanism: "deliveryRelay" }] }
  const compared = compareExperiments(direct, baseline, a)
  expect(compared.delta.game.spent).toBe(60)
  expect(compared.baseline.result.game.initialBudget).toBe(compared.candidate.result.game.initialBudget)
  const interaction = compareInteraction(direct, a, b)
  expect([interaction.baseline, interaction.a, interaction.b, interaction.combined].map((r) => r.game.spent)).toEqual([
    0, 60, 55, 115
  ])
  const searched = searchExperiments(
    direct,
    [baseline, { name: "bad", actions: [{ at: 0, mechanism: "removed" }] }, a],
    2
  )
  expect(searched.invalid[0]?.name).toBe("bad")
  expect(searched.unsearched).toEqual(["service"])
  const contexts = [
    { role: "tuning" as const, experiment: direct },
    { role: "heldOut" as const, experiment: { ...direct, context: "held-out" } }
  ]
  expect(searchContexts(contexts, [baseline, a], 1).heldOut).toEqual(["held-out"])
  expect(evaluateHeldOut(contexts, baseline, a)[0]?.context).toBe("held-out")
})

it("keeps decisions and streamed observations independent of retention", () => {
  const actions = [{ at: 0, mechanism: "deliveryRelay" }]
  const zero = runExperiment({ ...direct, actions, scenario: { ...direct.scenario, retention: 0 } })
  const retained = runExperiment({ ...direct, actions, scenario: { ...direct.scenario, retention: 1000 } })
  expect(zero.actions).toEqual(retained.actions)
  expect(zero.business).toEqual(retained.business)
  expect(zero.observations).toEqual(retained.observations)
})
