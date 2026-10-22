import { expect, it, vi } from "vitest"
import Game from "@hapsland/canonical-defense/lab/game-native"
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
  enabled: ["workAccelerator", "resultCourier"],
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

it("records purchases and upgrades without changing captured work or replay", () => {
  const result = runGameExperiment({
    ...gameInput,
    untilTicks: 0,
    actions: [
      { atTick: 0, kind: "build", tower: "workAccelerator", x: 424, y: 392 },
      { atTick: 0, kind: "upgrade", index: 1 }
    ]
  })
  expect(result.actions.map((a) => [a.result, a.charged])).toEqual([
    ["Applied", 50],
    ["Applied", 40]
  ])
  expect(result.game).toMatchObject({ spent: 90, remainingBudget: 70, towerCount: 1, health: 100 })
  expect(replayGameExperiment(JSON.parse(JSON.stringify(result.recording)))).toEqual(result)
  expect(() => replayGameExperiment({ ...result.recording, traceIdentity: "changed" })).toThrow("trace")
  const changed = { ...result.recording, businessReplay: { ...result.businessReplay, logicIdentity: "wrong" } }
  expect(() => replayGameExperiment(changed)).toThrow()
})
it.each(["finding", "clear", "sampled"] as const)("construction preserves %s scenario and public replay", (outcome) => {
  const input = { ...gameInput, settings: { ...gameInput.settings, outcome } }
  const baseline = runGameExperiment(input)
  const built = runGameExperiment({
    ...input,
    actions: [{ atTick: 0, kind: "build", tower: "workAccelerator", x: 424, y: 392 }]
  })
  expect(built.businessReplay).toEqual(baseline.businessReplay)
  expect(replayGameExperiment(built.recording)).toEqual(built)
})
it("refused purchases and upgrades spend nothing; maximum level is three", () => {
  const result = runGameExperiment({
    ...gameInput,
    budget: 140,
    untilTicks: 0,
    enabled: ["resultCourier"],
    actions: [
      { atTick: 0, kind: "build", tower: "resultCourier", x: 0, y: 0 },
      { atTick: 0, kind: "build", tower: "workAccelerator", x: 424, y: 392 },
      { atTick: 0, kind: "upgrade", index: 1 },
      { atTick: 0, kind: "build", tower: "resultCourier", x: 152, y: 392 },
      { atTick: 0, kind: "upgrade", index: 1 },
      { atTick: 0, kind: "upgrade", index: 1 },
      { atTick: 0, kind: "upgrade", index: 1 },
      { atTick: 0, kind: "build", tower: "resultCourier", x: 424, y: 392 }
    ]
  })
  expect(result.actions.map((a) => [a.result, a.charged])).toEqual([
    ["IllegalPlacement", 0],
    ["disabled", 0],
    ["UnknownTower", 0],
    ["Applied", 40],
    ["Applied", 32],
    ["Applied", 48],
    ["MaxLevel", 0],
    ["Unaffordable", 0]
  ])
  expect(result.game.remainingBudget).toBe(20)
})
it("enforces the event budget and exposes unreached scheduled investments", () => {
  const result = runGameExperiment({
    ...gameInput,
    maxEvents: 1,
    settings: { ...gameInput.settings, jevDelayMs: 0, outputDelayMs: 0, burst: 20 },
    actions: [{ atTick: 12, kind: "build", tower: "workAccelerator", x: 424, y: 392 }]
  })
  expect(result.termination).toBe("eventLimit")
  expect(result.business.events).toBe(1)
  expect(result.actions[0]?.result).toBe("notReached")
  expect(result.game.spent).toBe(0)
})
it("compares four arms at equal budgets and leaves undeclared search plans unsearched", () => {
  const a = {
    name: "accelerator",
    actions: [{ atTick: 0, kind: "build" as const, tower: "workAccelerator", x: 424, y: 392 }]
  }
  const b = {
    name: "courier",
    actions: [{ atTick: 0, kind: "build" as const, tower: "resultCourier", x: 152, y: 392 }]
  }
  const four = compareGameInteraction({ ...gameInput, untilTicks: 0 }, a, b)
  expect([four.baseline, four.a, four.b, four.combined].map((r) => r.game.spent)).toEqual([0, 50, 40, 90])
  expect(
    compareGameExperiments({ ...gameInput, untilTicks: 0 }, { name: "none", actions: [] }, a).delta.game.spent
  ).toBe(50)
  const search = searchGameExperiments(gameInput, [a, b], 1)
  expect(search.runs.map((r) => r.name)).toEqual(["accelerator"])
  expect(search.unsearched).toEqual(["courier"])
})
it("validates settings and rejects removed building upgrades before starting", () => {
  for (const settings of [
    { jevDelayMs: -1 },
    { sourceDelayMs: 1.5 },
    { outputDelayMs: Infinity },
    { burst: 0 },
    { burst: 1025 },
    { arrivalIntervalMs: 19 }
  ])
    expect(() => runGameExperiment({ ...gameInput, settings })).toThrow("invalid game")
  for (const ability of ["jevService", "deliveryRelay", "accessRepair"])
    expect(() =>
      runGameExperiment({
        ...gameInput,
        catalogue: { old: { cost: 1, ability: ability as never, displayName: "old", lesson: "removed" } },
        enabled: ["old"]
      })
    ).toThrow("invalid game mechanism ability")
  for (const parameters of [
    { strength: 0 },
    { strength: 17 },
    { strength: 1.5 },
    { radius: 19 },
    { radius: 241 },
    { radius: 20.5 }
  ])
    expect(() =>
      runGameExperiment({
        ...gameInput,
        catalogue: {
          custom: { cost: 50, ability: "workAccelerator", displayName: "custom", lesson: "cadence", ...parameters }
        },
        enabled: ["custom"]
      })
    ).toThrow("invalid game mechanism")
})
it("custom prices and ability replacement bind replay to actual capabilities", () => {
  const input = {
    ...gameInput,
    untilTicks: 0,
    budget: 20,
    enabled: ["custom"],
    catalogue: {
      custom: { cost: 12, ability: "resultCourier" as const, displayName: "custom", lesson: "authorized output" }
    },
    actions: [
      { atTick: 0, kind: "build" as const, tower: "custom", x: 152, y: 392 },
      { atTick: 0, kind: "build" as const, tower: "custom", x: 424, y: 392 }
    ]
  }
  const result = runGameExperiment(input)
  expect(result.actions.map((a) => [a.result, a.charged])).toEqual([
    ["Applied", 12],
    ["Unaffordable", 0]
  ])
  expect(result.catalogue.custom!.target).toBe("one queued authorized output terminal in range")
  expect(replayGameExperiment(result.recording)).toEqual(result)
  expect(() => runGameExperiment({ ...input, catalogue: {} })).toThrow("enabled")
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

const activeInput = {
  ...gameInput,
  budget: 100,
  enabled: ["workAccelerator", "resultCourier"],
  untilTicks: 65,
  settings: { ...gameInput.settings, jevDelayMs: 800, outputDelayMs: 400 }
}
const acceleratorBuild = { atTick: 0, kind: "build" as const, tower: "workAccelerator", x: 652, y: 215 }
const courierBuild = { atTick: 0, kind: "build" as const, tower: "resultCourier", x: 152, y: 456 }
const fire = (atTick: number, index: number, operation = 0) => ({ atTick, kind: "fire" as const, index, operation })

// Immutable worlds below are produced only by actual Host ticks. Reusing their
// ingress avoids repeating full public replay for every local refusal check.
function normalized(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (key, item: unknown) =>
      typeof item === "bigint" ? Number(item) : key === "$" && typeof item === "string" ? item.split("/").at(-1) : item
    )
  )
}
function nativeApply(world: unknown, action: Parameters<typeof Game.apply>[1]) {
  return Game.apply(world, action) as { world: unknown; result: { $: string }; charged: number }
}
function nativeBuild(world: unknown, x = 652, y = 215, kind = 3) {
  const receipt = nativeApply(world, { $: "Build", x, y, kind })
  expect(receipt.result.$).toBe("Applied")
  return receipt.world
}
function nativeFire(world: unknown, index = 1, operation = 3) {
  return nativeApply(world, { $: "Fire", index, operation: BigInt(operation) })
}
function nativeTicks(world: unknown, count: number) {
  const trace: unknown[] = []
  for (let i = 0; i < count; i++) {
    const tick = Game.tick_bounded(world, 256n) as { world: unknown; frames: unknown }
    world = tick.world
    // Retain actual semantic event frames, not every large intermediate state.
    const frames = tick.frames as { $: string }
    for (const name of ["ReviewServiceRequestSettled", "SubmissionTerminal", "FinishTerminal"])
      for (const event of gameEvents([frames], name))
        trace.push({ $: "NativeRunTypes.ProductFrame", ...(normalized(event) as object) })
  }
  return { world, trace }
}
const warmWorlds = new Map<string, unknown>()
function warmWorld(tick = 290, result = 2) {
  const key = `${tick}/${result}`
  if (!warmWorlds.has(key)) {
    const initial = Game.create_scenario(
      {
        $: "Scenario",
        jev: 800n,
        delivery: 400n,
        source: 0n,
        ready: true,
        readable: true,
        result,
        burst: 1,
        interval: 60000
      },
      152n,
      160,
      0
    )
    warmWorlds.set(key, nativeTicks(initial, tick).world)
  }
  return warmWorlds.get(key)
}
function target(world: unknown, index = 1, operation = 3) {
  return normalized(Game.shot_target(world, index, BigInt(operation)))
}

it("accelerates the selected physical operation and independently replays the complete journey", () => {
  const result = runGameExperiment({
    ...activeInput,
    untilTicks: 900,
    maxEvents: 1000,
    actions: [acceleratorBuild, fire(290, 1, 3), fire(290, 1, 4)]
  })
  expect(result.actions.map((a) => a.result)).toEqual(["Applied", "Applied", "CoolingDown"])
  expect(result.actions[1]?.target?.owner.operation).toBe(3)
  expect(result.actions[2]?.target).toBeUndefined()
  expect(gameEvents(result.trace, "ReviewServiceRequestSettled").map((e) => [e.event.operation, e.time])).toEqual([
    [3, 7960],
    [4, 10240]
  ])
  expect(gameEvents(result.trace, "SubmissionTerminal").map((e) => e.time)).toEqual([12520, 14800])
  expect(result.business.projection.work.filter((w) => w.kind === "pendingFinding")).toHaveLength(2)
  expect(result.game.spent).toBe(50)
  expect(replayGameExperiment(JSON.parse(JSON.stringify(result.recording)))).toEqual(result)
})

it("two local shots target distinct callbacks and improve the final family arrival", () => {
  const world = nativeBuild(nativeBuild(warmWorld()), 700, 215)
  expect(target(world, 1, 3)).toMatchObject({ value: { owner: { operation: 3 } } })
  expect(target(world, 2, 4)).toMatchObject({ value: { owner: { operation: 4 } } })
  const first = nativeFire(world, 1, 3)
  expect(first.result.$).toBe("Applied")
  const second = nativeFire(first.world, 2, 4)
  expect(second.result.$).toBe("Applied")
  expect(nativeFire(second.world, 1, 3).result.$).toBe("CoolingDown")
  const journey = nativeTicks(second.world, 610)
  expect(gameEvents(journey.trace, "ReviewServiceRequestSettled").map((e) => e.time)).toEqual([7960, 8060])
  expect(gameEvents(journey.trace, "SubmissionTerminal").map((e) => e.time)).toEqual([12520, 13020])
  const baseline = nativeTicks(warmWorld(), 610)
  expect(gameEvents(baseline.trace, "SubmissionTerminal").map((e) => e.time)).toEqual([14640, 15140])
  expect(Game.observe(journey.world)).toMatchObject({ remainingBudget: 60 })
})

it("wrong placement, zero-time ingress and completed work are not actionable", () => {
  expect(nativeFire(nativeBuild(warmWorld(), 152, 215)).result.$).toBe("NoTarget")
  expect(nativeFire(nativeBuild(warmWorld(0))).result.$).toBe("NoTarget")
  const complete = nativeBuild(warmWorld(530))
  expect(nativeFire(complete).result.$).toBe("NoTarget")
  expect(nativeFire(complete, 2).result.$).toBe("UnknownTower")
  expect(
    gameEvents(nativeTicks(nativeBuild(warmWorld(), 152, 215), 240).trace, "ReviewServiceRequestSettled").map(
      (e) => e.time
    )
  ).toEqual([10080, 10240])
})

it("courier accelerates one assembled packet without changing the independent follower", () => {
  const result = runGameExperiment({
    ...activeInput,
    untilTicks: 900,
    maxEvents: 1000,
    actions: [courierBuild, fire(1, 1), fire(590, 1, 3), fire(634, 1, 3), fire(634, 1, 4)]
  })
  expect(result.actions.map((a) => a.result)).toEqual(["Applied", "NoTarget", "NoTarget", "Applied", "CoolingDown"])
  expect(result.actions[3]?.target?.owner.operation).toBe(3)
  expect(gameEvents(result.trace, "ReviewServiceRequestSettled").map((e) => e.time)).toEqual([10080, 10240])
  // Only the assembled selected packet accelerates. The independent follower
  // keeps its baseline arrival and both captured certainties remain intact.
  expect(gameEvents(result.trace, "SubmissionTerminal").map((e) => [e.event.advice, e.time, e.event.certain])).toEqual([
    [3, 13680, true],
    [4, 15140, true]
  ])
  expect(result.business.projection.work.filter((w) => w.kind === "pendingFinding")).toHaveLength(2)
  expect(result.game.spent).toBe(40)
})

function bendItems(value: unknown): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = []
  let list = value as { $: string; head: Record<string, unknown>; tail: unknown }
  while (list.$ === "Con") {
    items.push(list.head)
    list = list.tail as typeof list
  }
  return items
}
function packetGroups(world: unknown) {
  const control = bendItems((world as { auto: unknown }).auto)[0]!
  return bendItems(bendItems(control.rules)[0]!.groups)
}
function visiblePackets(world: unknown) {
  return bendItems((Game.visual_state(world) as { targets: unknown }).targets).filter((pose) => pose.phase === 5)
}
it("courier preview appears only after all fragments assemble into an individual packet", () => {
  const early = nativeBuild(warmWorld(590), 152, 456, 4)
  expect(visiblePackets(early)).toEqual([])
  expect(nativeFire(early).result.$).toBe("NoTarget")
  const merged = nativeTicks(early, 43).world
  expect(packetGroups(merged).find((group) => (group.owner as { operation: bigint }).operation === 3n)).toMatchObject({
    merged: true,
    carrier: false
  })
  expect(visiblePackets(merged)).toEqual([])
  const ready = nativeTicks(merged, 1).world
  expect(visiblePackets(ready)).toHaveLength(1)
  expect(visiblePackets(ready)[0]).toMatchObject({ x: 148, y: 444 })
  expect(nativeFire(ready).result.$).toBe("Applied")
})
it("an unhit sibling changes lane availability but never exceeds fragment base speed", () => {
  const early = warmWorld()
  const shot = nativeFire(nativeBuild(early))
  expect(shot.result.$).toBe("Applied")
  const firstLanes: number[] = []
  const mergedTicks: number[] = []
  for (const initial of [early, shot.world]) {
    let world = nativeTicks(initial, 222).world
    let previous = new Map<number, Record<string, unknown>>()
    for (let tick = 512; tick <= 658; tick++) {
      const group = packetGroups(world).find((item) => (item.owner as { operation: bigint }).operation === 4n)!
      const fragments = bendItems(group.fragments)
      if (tick === 512) firstLanes.push(fragments[0]!.y as number)
      if (group.merged) {
        mergedTicks.push(tick)
        break
      }
      for (const fragment of fragments) {
        const rule = fragment.rule as number
        const before = previous.get(rule)
        if (before) {
          const distance =
            Math.abs((fragment.x as number) - (before.x as number)) +
            Math.abs((fragment.y as number) - (before.y as number))
          expect(distance).toBeLessThanOrEqual(2 + (rule % 4))
        }
      }
      previous = new Map(fragments.map((fragment) => [fragment.rule as number, fragment]))
      world = nativeTicks(world, 1).world
    }
  }
  expect(firstLanes).toEqual([444, 436])
  expect(mergedTicks).toEqual([658, 641])
})

it("Finish waits for both selected members and exposes exactly one courier packet", () => {
  const scheduled = Game.schedule_finish(warmWorld(0), 10060n)
  const early = nativeBuild(nativeTicks(scheduled, 634).world, 152, 456, 4)
  expect(packetGroups(early).map((group) => [group.merged, group.carrier])).toEqual([
    [false, false],
    [true, false]
  ])
  expect(visiblePackets(early)).toEqual([])
  expect(nativeFire(early, 1, 0).result.$).toBe("NoTarget")
  const ready = nativeTicks(early, 25).world
  expect(packetGroups(ready).filter((group) => group.merged)).toHaveLength(2)
  expect(packetGroups(ready).filter((group) => group.carrier)).toHaveLength(1)
  expect(visiblePackets(ready)).toHaveLength(1)
  expect(target(ready, 1, 0)).toMatchObject({
    value: {
      owner: { operation: 4 },
      effect: { selected: { $: "Con", head: 4, tail: { $: "Con", head: 3, tail: { $: "Nil" } } } }
    }
  })
  const shot = nativeFire(ready, 1, 0)
  expect(shot.result.$).toBe("Applied")
  const delivered = nativeTicks(shot.world, 100)
  expect(gameEvents(delivered.trace, "SubmissionTerminal")).toEqual([])
  expect(gameEvents(delivered.trace, "FinishTerminal").map((frame) => [frame.time, frame.event.selected])).toEqual([
    [14180, { $: "Con", head: 4, tail: { $: "Con", head: 3, tail: { $: "Nil" } } }]
  ])
})

it("clear reviews preserve their outcome and offer no result to the courier", () => {
  const shot = nativeFire(nativeBuild(warmWorld(290, 1)))
  expect(shot.result.$).toBe("Applied")
  const done = nativeTicks(shot.world, 240)
  expect(gameEvents(done.trace, "ReviewServiceRequestSettled").map((e) => [e.time, e.event.outcome])).toEqual([
    [7960, { $: "Canonical.RequestClear" }],
    [10240, { $: "Canonical.RequestClear" }]
  ])
  expect(gameEvents(done.trace, "SubmissionTerminal")).toEqual([])
  expect(nativeFire(nativeBuild(done.world, 152, 456, 4)).result.$).toBe("NoTarget")
})

it("ordinary radius distinguishes the leader before the following live body enters", () => {
  const world = nativeBuild(warmWorld(280))
  expect(nativeFire(world, 1, 4).result.$).toBe("NoTarget")
  expect(target(world)).toMatchObject({ value: { owner: { operation: 3 } } })
  expect(nativeFire(world).result.$).toBe("Applied")
})

it("small radius refusal does not consume cooldown before the exact body arrives", () => {
  const initial = Game.build_tuned(warmWorld(280), 700, 215, 3, 50, 1, 36) as { world: unknown; result: { $: string } }
  expect(initial.result.$).toBe("Applied")
  expect(nativeFire(initial.world, 1, 4).result.$).toBe("NoTarget")
  const entered = nativeTicks(initial.world, 10).world
  expect(nativeFire(entered, 1, 3).result.$).toBe("Applied")
})

it("independent public replay rejects an intentionally wrong tower target mapping", () => {
  const original = Game.apply
  const mutant = vi
    .spyOn(Game, "apply")
    .mockImplementation((world, action) =>
      original(world, action.$ === "Fire" ? { ...action, operation: action.operation === 3n ? 4n : 3n } : action)
    )
  try {
    expect(() =>
      runGameExperiment({
        ...activeInput,
        untilTicks: 291,
        maxEvents: 1000,
        actions: [acceleratorBuild, fire(290, 1, 3)]
      })
    ).toThrow()
  } finally {
    mutant.mockRestore()
  }
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
      f.event.kind === "reviewServiceRequestSettled" ? [{ time: f.time, outcome: f.event.outcome }] : []
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

function automaticJourney(upgrade: boolean, paired: boolean) {
  let world = nativeBuild(warmWorld(0))
  if (upgrade) world = nativeApply(world, { $: "Upgrade", index: 1 }).world
  if (paired) world = nativeBuild(world, 700, 215)
  const shots: { tick: number; shot: unknown }[] = []
  const trace: unknown[] = []
  for (let tick = 0; tick < 350; tick++) {
    const pass = Game.automatic(world) as { world: unknown; shots: unknown }
    world = pass.world
    let list = pass.shots as { $: string; head: unknown; tail: unknown }
    while (list.$ === "Con") {
      shots.push({ tick, shot: normalized(list.head) })
      list = list.tail as typeof list
    }
    const next = nativeTicks(world, 1)
    world = next.world
    trace.push(...next.trace)
  }
  return { world, shots, trace }
}

it("automatic towers act on real moving work without authored fire inputs", () => {
  const result = automaticJourney(false, true)
  expect(result.shots.map((shot) => shot.tick)).toEqual([198, 209, 218, 229, 238, 249])
  expect(result.shots.map((shot) => shot.shot)).toMatchObject([
    { index: 2, target: { owner: { operation: 2 } } },
    { index: 1, target: { owner: { operation: 2 } } },
    { index: 2, target: { owner: { operation: 2 } } },
    { index: 1, target: { owner: { operation: 3 } } },
    { index: 2, target: { owner: { operation: 4 } } },
    { index: 1, target: { owner: { operation: 4 } } }
  ])
  expect(gameEvents(result.trace, "ReviewServiceRequestSettled").map((e) => e.time)).toEqual([6660, 6820])
  expect(Game.observe(result.world)).toMatchObject({ remainingBudget: 60 })
})

it("Stop delivers ready A, excludes late B, and replays complete Finish registration", async () => {
  const { summarizeGameResult } = await import("@hapsland/canonical-defense/lab/game-example")
  const result = runGameExperiment({
    ...activeInput,
    budget: 160,
    untilTicks: 740,
    maxEvents: 1000,
    settings: { ...activeInput.settings, arrivalIntervalMs: 60000, finishAtMs: 7800 },
    actions: [acceleratorBuild, fire(290, 1, 3)]
  })
  const stopped = summarizeGameResult(result)
  expect(stopped.settlements.map((e) => [e.operation, e.time])).toEqual([[3, 7960]])
  expect(stopped.physicalCallbacks.settlements.map((e) => [e.event.operation, e.time])).toEqual([
    [3, 7960],
    [4, 10240]
  ])
  expect(stopped.finishes.map((e) => [e.time, e.event.selected])).toEqual([
    [12520, { $: "Con", head: 3, tail: { $: "Nil" } }]
  ])
  expect(stopped.submissions).toEqual([])
  expect(stopped.lastSettlement).toBe(7960)
  expect(replayGameExperiment(JSON.parse(JSON.stringify(result.recording)))).toEqual(result)
})

it("an upgrade changes range and cadence while two towers provide separate firing schedules", () => {
  const upgraded = automaticJourney(true, false)
  const paired = automaticJourney(false, true)
  expect(upgraded.shots.map((shot) => shot.tick)).toEqual([194, 204, 214, 224, 234, 244])
  expect(paired.shots.map((shot) => shot.tick)).toEqual([198, 209, 218, 229, 238, 249])
  expect(gameEvents(upgraded.trace, "ReviewServiceRequestSettled").map((e) => e.time)).toEqual([6560, 6720])
  expect(gameEvents(paired.trace, "ReviewServiceRequestSettled").map((e) => e.time)).toEqual([6660, 6820])
  expect(Game.observe(upgraded.world)).toMatchObject({ remainingBudget: 70 })
  expect(Game.observe(paired.world)).toMatchObject({ remainingBudget: 60 })
})

it.each(["none", "courier"] as const)("a courier cannot repair premature recurring Stop: %s", async (plan) => {
  const { runRecurringCourierCase } = await import("@hapsland/canonical-defense/lab/game-example")
  const { metrics } = runRecurringCourierCase(plan)
  expect(metrics.termination).toBe("tickLimit")
  expect(metrics.game.tick).toBe(40)
  expect(metrics.game.spent).toBe(plan === "courier" ? 40 : 0)
  expect(metrics.shots).toEqual([])
  expect(metrics.settlements).toEqual([])
  expect(metrics.submissions).toEqual([])
  expect(metrics.finishes).toEqual([])
})

it("advisory study rejects empty, incomplete, duplicate and undeclared matrices without claiming teaching qualification", async () => {
  const { teachingContexts, teachingPlans, runTeachingCase, checkGameExampleStudy } =
    await import("@hapsland/canonical-defense/lab/game-example")
  const example = runTeachingCase(
    teachingContexts.find((context) => context.name === "quick-sparse")!,
    teachingPlans(0)[0]!
  )
  // Synthetic rows test the validator only; they are explicitly not 81 measured worlds.
  const rows = teachingContexts.flatMap((context) =>
    teachingPlans(context.layout).map((plan) => ({
      ...example,
      context: context.name,
      role: context.role,
      plan: plan.name
    }))
  )
  expect(() => checkGameExampleStudy([])).toThrow("missing study row")
  expect(() => checkGameExampleStudy(rows.slice(1))).toThrow("missing study row")
  expect(() => checkGameExampleStudy([...rows, rows[0]!])).toThrow("duplicate study row")
  expect(() => checkGameExampleStudy([...rows, { ...rows[0]!, plan: "undeclared" }])).toThrow("undeclared study row")
  expect(checkGameExampleStudy(rows)).toMatchObject({
    cases: 81,
    passed: true,
    educationalQualification: "unqualified"
  })
  expect(checkGameExampleStudy(rows).reason).toContain("do not establish")
})

it("advisory study's unchanged Stop candidates all end before physical review or delivery", async () => {
  const { teachingContexts, teachingPlans, runTeachingCase, checkGameExampleStudy } =
    await import("@hapsland/canonical-defense/lab/game-example")
  const context = teachingContexts.find((context) => context.name === "stop-cutoff")!
  const measured = teachingPlans(context.layout).map((plan) => runTeachingCase(context, plan))
  expect(measured).toHaveLength(9)
  for (const { metrics } of measured) {
    expect(metrics.game.tick).toBe(90)
    expect(metrics.refusals).toEqual([])
    expect(metrics.shots).toEqual([])
    expect(metrics.settlements).toEqual([])
    expect(metrics.physicalCallbacks.settlements).toEqual([])
    expect(metrics.finishes).toEqual([])
  }
  expect(() => checkGameExampleStudy(measured)).toThrow("missing study row")
})
