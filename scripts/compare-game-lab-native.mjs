import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createGameStreams } from "../prototypes/canonical-defense/game-stream-runner.mjs"
import {
  callbackNativeOwnerSources,
  callbackNativeDescriptors
} from "../prototypes/canonical-defense/lab-trace-metadata.ts"
import { decodeNativePrefixWithDescriptors } from "@hapsland/monkey-business/callback-native-prefix"
import { readBendList, readRecord } from "@hapsland/canonical-policy/canonical/boundary-schema"
import { decodeCallbackTarget } from "../packages/monkey-business/src/callback-controls.ts"
import { projectTrustedCanonical } from "@hapsland/canonical-policy/canonical/canonical-boundary"

const list = (value) => readBendList(value, (value) => value, 2048)
function activeFacts(vector) {
  const envelope = readRecord(
    decodeNativePrefixWithDescriptors(vector.slice(4), "lab_trace", callbackNativeDescriptors)
  )
  const world = readRecord(envelope.after),
    state = readRecord(list(world.engine)[0]),
    core = readRecord(list(state.core)[0])
  return {
    envelope,
    world,
    projection: projectTrustedCanonical(core.canonical),
    frames: list(envelope.frames).map(readRecord),
    transport: list(envelope.transport).map(readRecord)
  }
}

// Existing game transport owns compiler preflight, transitive source/tool hashes,
// finite subprocess deadlines, numeric IO wiring and retained output receipts.
const fixture = new URL("../prototypes/canonical-defense/DefenseLabConformance.bend", import.meta.url)
const supervised = process.env.HAPSLAND_GAME_OUTER_DEADLINE_MS !== undefined
const streams = await createGameStreams(fixture, callbackNativeOwnerSources, {
  registerBank: true,
  jsEmissionTimeoutMs: supervised ? 0 : 30000,
  ...(process.env.HAPSLAND_GAME_NATIVE_RESUME_RECEIPT === undefined
    ? {}
    : { resumeCompilerReceipt: process.env.HAPSLAND_GAME_NATIVE_RESUME_RECEIPT }),
  emissionTimeoutMs: supervised ? 0 : 30000,
  clangTimeoutMs: 120000,
  executionTimeoutMs: 5000,
  executionArgumentGroups: Array.from({ length: 16 }, (_, id) => [String(id)]),
  ...(supervised ? { overallDeadlineMs: Number(process.env.HAPSLAND_GAME_OUTER_DEADLINE_MS) } : {})
})
try {
  const rows = 16 * 40
  assert.equal(streams.native.length, rows, "all sixteen declared finite scenarios and every tick")
  assert.equal(streams.emitted.length, rows, "identical complete emitted scenario/tick coverage")
  const warmupTicks = [490, 220, 220, 490, 634, 634, 40, 490, 634, 490, 634, 490, 490, 490, 490, 634]
  const witnesses = Array.from({ length: 16 }, () => ({ frames: [], recipients: new Map(), firstShot: undefined }))
  let previousCount = 0
  for (let index = 0; index < rows; index++) {
    const native = JSON.parse(readFileSync(streams.native[index], "utf8"))
    const emitted = JSON.parse(readFileSync(streams.emitted[index], "utf8"))
    const scenario = Math.floor(index / 40),
      tick = index % 40
    assert.ok(Array.isArray(native) && native.length > 4, "nonempty complete owner vectors")
    assert.deepEqual(
      native.slice(0, 3),
      [scenario, tick, scenario === 14 ? 512 : 128],
      "original scenario, exact tick order and hard event budget"
    )
    if (tick === 0) previousCount = 0
    assert.ok(
      Number.isSafeInteger(native[3]) && native[3] >= previousCount && native[3] <= (scenario === 14 ? 512 : 128),
      "finite monotonically consumed hard event budget"
    )
    previousCount = native[3]
    assert.deepEqual(
      native,
      emitted,
      `scenario ${scenario} tick ${tick}: complete before/intervention/after Worlds, Frames, PhysicalDeliveries and transport journals`
    )
    const facts = activeFacts(native)
    const beforeState = readRecord(list(readRecord(facts.envelope.intervention).engine)[0])
    const afterState = readRecord(list(facts.world.engine)[0])
    let transportBoundary = beforeState.count
    for (const change of facts.transport) {
      assert.equal(change.$, "DefenseTransport.Change", "actual physical transport input")
      assert.ok(
        Number.isSafeInteger(change.eventCount) &&
          change.eventCount >= transportBoundary &&
          change.eventCount <= afterState.count,
        "transport input retains its exact ordered event boundary"
      )
      assert.ok(Number.isSafeInteger(change.at) && change.at >= 0, "finite absolute transport deadline")
      decodeCallbackTarget(change.target) // validates every full owner/effect/original-order field
      transportBoundary = change.eventCount
    }
    assert.equal(
      readRecord(facts.envelope.before).clock,
      warmupTicks[scenario] + tick,
      "declared actual Host warmup and complete retained tick sequence"
    )
    assert.equal(facts.world.clock, warmupTicks[scenario] + tick + 1, "one physical step per retained tick")
    const witness = witnesses[scenario]
    witness.frames.push(...facts.frames)
    for (const world of [readRecord(facts.envelope.intervention), facts.world]) {
      for (const mob of list(readRecord(list(world.auto)[0]).mobs)) {
        if (mob.before <= mob.after || list(mob.beams).length === 0) continue
        const target = decodeCallbackTarget(mob.target)
        witness.recipients.set(JSON.stringify(target), target)
        witness.firstShot ??= tick
        assert.ok(mob.boost >= 2, "a recorded hit changes actual physical cadence")
      }
    }
    if ([2, 5].includes(scenario) && tick < 10)
      assert.equal(list(facts.world.towers).length, 0, "late construction really waits ten physical ticks")
  }
  const products = (id) => witnesses[id].frames.filter((frame) => frame.$ === "NativeRunTypes.ProductFrame")
  const settlements = (id) => products(id).filter((frame) => frame.event.$ === "Canonical.ReviewServiceRequestSettled")
  const settledAt = (id, operation) => settlements(id).find((frame) => frame.event.operation === operation)?.time
  const recipients = (id) => [...witnesses[id].recipients.values()]
  const operations = (id) => [...new Set(recipients(id).map((target) => target.owner.operation))].sort((a, b) => a - b)
  for (const id of [0, 3]) {
    assert.deepEqual(
      settlements(id).map((frame) => [frame.event.operation, frame.time]),
      [
        [3, 10080],
        [4, 10240]
      ],
      "baseline siblings finish only after the complete physical Jev journey"
    )
    assert.deepEqual(recipients(id), [], "baseline has no hidden tower intervention")
  }
  for (const id of [1, 2]) {
    assert.ok(operations(id).includes(2), "accelerator hits the real preparation owner after ingress")
    assert.equal(witnesses[id].firstShot, id === 1 ? 0 : 10, "early versus late physical construction")
    assert.ok(
      products(id).some((frame) => frame.event.$ === "Canonical.PreparationCompleted"),
      "accelerated preparation actually completes within the retained physical window"
    )
  }
  for (const id of [4, 5, 15]) {
    assert.ok(
      recipients(id).some((target) => target.effect.kind === "outputTerminal"),
      "courier automatically hits an authorized output on its physical path"
    )
    assert.equal(witnesses[id].firstShot, id === 5 ? 10 : 0)
  }
  assert.deepEqual(recipients(6), [], "blocked source offers no invented accelerator target")
  assert.deepEqual(operations(7), [3], "manual accelerator changes only selected sibling A")
  assert.ok(settledAt(7, 3) < settledAt(3, 3), "selected sibling actually settles earlier")
  assert.equal(settledAt(7, 4), settledAt(3, 4), "unhit sibling retains baseline settlement")
  assert.deepEqual(operations(8), [3], "manual courier changes only the selected authorized output")
  assert.deepEqual(operations(9), [3, 4], "two targeted towers reach distinct physical siblings")
  for (const operation of [3, 4])
    assert.ok(settledAt(9, operation) < settledAt(3, operation), "both explicitly hit siblings settle earlier")
  assert.ok(
    recipients(10).some(
      (target) =>
        target.effect.kind === "finishTerminal" &&
        target.effect.selected.length === 1 &&
        target.effect.selected[0] === 3
    ),
    "courier hits the exact committed partial Finish packet"
  )
  for (const id of [11, 12]) {
    const auth = products(id).find((frame) => frame.event.$ === "Canonical.FinishAuthorize")
    assert.ok(auth, "actual Stop authorizes ready A")
    assert.deepEqual(list(auth.event.selected), [3], "Stop preserves exact ready-only membership")
    assert.equal(auth.time, id === 11 ? 10100 : 10080, "after-boundary versus exact-boundary Stop")
    const lateB = settlements(id).find((frame) => frame.event.operation === 4)
    assert.ok(
      lateB &&
        list(lateB.outputs).some(
          (output) =>
            output.$ === "Canonical.PolicyDecided" &&
            output.decision.$ === "Canonical.ReviewServiceRequestObservationIgnored"
        ),
      "cancelled B's later physical callback remains visible and fenced"
    )
  }
  const tie = products(12)
  assert.ok(
    tie.findIndex((frame) => frame.event.$ === "Canonical.ReviewServiceRequestSettled" && frame.event.operation === 3) <
      tie.findIndex((frame) => frame.event.$ === "Canonical.FinishAuthorize"),
    "actual exact-cutoff event order: A callback before authorization"
  )
  assert.equal(
    products(13).some((frame) => frame.event.$ === "Canonical.FinishAuthorize"),
    false,
    "deadline before physical A readiness cannot fabricate a packet"
  )
  for (const frame of settlements(13))
    assert.ok(
      list(frame.outputs).some(
        (output) =>
          output.$ === "Canonical.PolicyDecided" &&
          output.decision.$ === "Canonical.ReviewServiceRequestObservationIgnored"
      ),
      "before-boundary cancellation fences subsequent results"
    )
  assert.equal(
    recipients(14).filter((target) => target.effect.kind === "reviewServiceRequestSettled").length,
    2,
    "two automatic towers hit distinct exact reviews in the eight-review workload"
  )

  console.log(
    JSON.stringify({
      registerAbi: "host register bank; per-work-loop storage; lowering source/tool pinned",
      scope: "actual Lab native/emitted full owner vectors only; no public-lane or interactive-platform claim",
      scenarios: [
        "clear baseline",
        "early accelerator construction",
        "late accelerator construction",
        "finding baseline",
        "early courier construction",
        "late courier construction",
        "blocked source with ineffective accelerator",
        "targeted accelerator affects selected sibling only",
        "targeted authorized output courier",
        "two accelerators explicitly target distinct physical siblings",
        "courier accelerates a committed partial Finish",
        "original Stop sends A and fences late B",
        "exact cutoff: A callback before authorization",
        "deadline before physical A readiness sends nothing",
        "main tick automatically fires two accelerators at distinct work",
        "main tick automatically accelerates a moving authorized output"
      ],
      ticksPerScenario: 40,
      warmupTicks,
      warmupScope:
        "actual Host ticks from original inputs, bounded by 634; native/emitted compared retained window only",
      eventBudgets: { ordinary: 128, automaticLoad: 512 },
      initialGameBudget: 160,
      equalRows: rows,
      activeBehavior:
        "physical ingress warmup, selected-sibling acceleration, real output and committed-Finish hits, exact Stop membership and late-result fencing",
      phases: {
        cEmissionMs: supervised ? "remaining authenticated supervisor deadline" : 30000,
        clangMs: 120000,
        jsEmissionMs: supervised ? "remaining authenticated supervisor deadline" : 30000,
        executionMsPerLane: 5000
      }
    })
  )
} finally {
  streams.cleanup()
}
