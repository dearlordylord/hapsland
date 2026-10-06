import { decodeCallbackNativePrefix } from "./callback-native-prefix.ts"
import { expect, it } from "vitest"
import { createRun, restoreReplay, type Run, DEFAULT_FILE_TREE_PROFILE } from "./index.ts"
import { encodeCanonicalEvent } from "@hapsland/canonical-policy/canonical/adapter"
import { callbackPublicBoundary, decodeCallbackNativeBoundary } from "./callback-native-codec.ts"
import type { CallbackTarget } from "./callback-controls.ts"
import {
  runWorkloadNative,
  runWorkloadEmitted
} from "../../monkey-business-bend/conformance/workload-native-runner.mjs"

// Original-input native, emitted-JS and public traces retain the full contract
// boundary through exact structural codecs. No compact-count fallback applies.
function advance(run: Run) {
  expect(run.advance({ untilTime: 30, maxEvents: 200 }).reason).not.toBe("eventLimit")
}
function issued(run: Run): CallbackTarget {
  for (let fuel = 0; fuel < 100; fuel++) {
    const target = run.observe().callbackTargets.find((value) => value.effect.kind === "jevSettled")
    if (target) return target
    run.step()
  }
  throw new Error("original completion not issued within 100 steps")
}
function runCase(
  kind: "wrongStage" | "reverseOrder" | "canceled" | "dropped" | "latePreparation" | "latePreparationRetainedOne"
) {
  const run = createRun({
    inputs: [{ kind: "edit", at: 0, bytes: 10, unitBytes: [5], outcome: "finding" }],
    ...(kind === "latePreparation" || kind === "latePreparationRetainedOne"
      ? {
          session: {
            agent: "p",
            seed: 11,
            editIntervalMs: 1000000,
            variationMs: 0,
            editsPerTask: 1000,
            bytes: 10,
            unitBytes: [5]
          }
        }
      : {}),
    seed: 17,
    jevDelay: 5,
    preparationDelay: 2,
    retention: kind === "latePreparationRetainedOne" ? 1 : 1000,
    outputProfile: { outcome: "certain", delayMs: 0, leaseMs: 30 },
    fileTrees: {
      ...DEFAULT_FILE_TREE_PROFILE,
      minFiles: 2,
      maxFiles: 2,
      maxImports: 1,
      maxDepth: 1,
      deniedPercent: 0,
      minSourceBytes: 100,
      maxSourceBytes: 100,
      minTreeBytes: 20,
      maxTreeBytes: 20
    }
  })
  const controls: unknown[] = [],
    sources: unknown[] = []
  const captured: ReturnType<Run["observe"]>["observations"][number][] = []
  run.subscribe((frame) => {
    if (captured.length === 2048) throw new Error("finite conformance trace exceeds 2048 frames")
    captured.push(frame)
  })
  function control(target: CallbackTarget, action: "hold" | "release" | "drop" | "duplicate" | "reorder") {
    const before = run.projection
    run.applyControl({ kind: "callback", action, target })
    const report = run.observe().callbackReports.at(-1)
    if (!report) throw new Error("callback control report unavailable")
    controls.push({
      time: report.at,
      sequence: report.controlSequence,
      before,
      after: run.projection,
      control: report.control,
      result: report.result
    })
  }
  if (kind === "latePreparation" || kind === "latePreparationRetainedOne") {
    let preparation: CallbackTarget | undefined
    for (let fuel = 0; fuel < 100 && !preparation; fuel++) {
      run.step()
      preparation = run.observe().callbackTargets.find((target) => target.effect.kind === "preparationCompleted")
    }
    if (!preparation) throw new Error("original preparation unavailable")
    control(preparation, "hold")
    const before = run.projection
    const agent = run.agentScopes[0]?.agent
    if (!agent) throw new Error("declared advicee unavailable")
    run.applyControl({ kind: "adviceeLifecycle", agent, action: "disconnect" })
    controls.push({
      before,
      after: run.projection,
      control: { kind: "adviceeLifecycle", partition: 1, action: "disconnect" }
    })
    advance(run)
    expect(run.projection.dispatch.running).toHaveLength(1)
    expect(run.projection.global).toEqual({ items: 0, bytes: 0 })
    control(preparation, "release")
    advance(run)
    const late = captured.find((frame) => frame.event.kind === "preparationCompleted")
    expect(late?.event).toMatchObject(preparation.owner)
    expect(late?.rejection).toBe("StaleOperation")
    expect(late?.commands).toEqual([])
    expect(run.projection.dispatch.running).toEqual([])
    if (kind === "latePreparationRetainedOne") expect(run.observe().callbackTargets).not.toContainEqual(preparation)
    else expect(run.observe().callbackTargets).toContainEqual(preparation)
    expect(captured.filter((frame) => frame.event.kind === "submissionTerminal")).toEqual([])
    expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe())
    return callbackPublicBoundary(run.observe(), controls, sources, captured)
  }
  const end = issued(run)
  expect(end.owner).toEqual({ partition: 1, lifetime: 1, round: 1, operation: 3 })
  // One shared allocator: parent1, preparation2, unit3, physical request4.
  expect(end.effect).toEqual({ kind: "jevSettled", request: 4 })
  if (kind === "wrongStage" || kind === "reverseOrder") {
    const start = run.observe().callbackTargets.find((value) => value.effect.kind === "jevStarted")
    if (!start) throw new Error("original start unavailable at issuance boundary")
    if (kind === "wrongStage") {
      control(start, "hold")
      control(end, "reorder")
    } else {
      control(end, "reorder")
      control(start, "hold")
    }
    advance(run)
    expect(run.observations.filter((frame) => frame.event.kind === "jevRequestSettled").at(-1)?.rejection).toBe(
      "WrongStage"
    )
    expect(run.projection.dispatch.requests).toHaveLength(1)
    expect(run.projection.global).toEqual({ items: 1, bytes: 5 })
    control(start, "release")
    control(end, "duplicate")
    advance(run)
    expect(run.observations.filter((frame) => frame.event.kind === "submissionTerminal")).toHaveLength(1)
    expect(run.projection.dispatch.requests).toEqual([])
  } else if (kind === "canceled") {
    control(end, "hold")
    const stopped = { kind: "stopPolled" as const, partition: 1, lifetime: 1, round: 1, deadline: true }
    run.schedule({ kind: "canonical", at: 5, event: stopped })
    sources.push({ time: 5, event: encodeCanonicalEvent(stopped) })
    advance(run)
    expect(run.projection.dispatch.requests).toHaveLength(1)
    expect(run.projection.global).toEqual({ items: 0, bytes: 0 })
    control(end, "release")
    advance(run)
    expect(
      run.observations
        .filter((frame) => frame.event.kind === "jevRequestSettled")
        .at(-1)
        ?.commands.map((command) => command.kind)
    ).toEqual(["jevObservationIgnored"])
    const released = run.projection
    control(end, "duplicate")
    advance(run)
    expect(run.observations.filter((frame) => frame.event.kind === "jevRequestSettled").at(-1)?.rejection).toBe(
      "StaleOperation"
    )
    expect(run.projection).toEqual(released)
    expect(run.observations.filter((frame) => frame.event.kind === "submissionTerminal")).toEqual([])
  } else {
    const before = run.projection
    control({ ...end, owner: { ...end.owner, lifetime: 2 } }, "duplicate")
    expect(run.observe().callbackReports.at(-1)?.result).toBe("missing")
    expect(run.projection).toEqual(before)
    control({ ...end, originalOrder: end.originalOrder + 1000 }, "duplicate")
    expect(run.observe().callbackReports.at(-1)?.result).toBe("missing")
    expect(run.projection).toEqual(before)
    control(end, "drop")
    advance(run)
    expect(run.projection.dispatch.requests).toHaveLength(1)
    expect(run.projection.global).toEqual({ items: 1, bytes: 5 })
    expect(run.observations.filter((frame) => frame.event.kind === "jevRequestSettled")).toEqual([])
  }
  const restored = restoreReplay(JSON.parse(JSON.stringify(run.exportReplay())))
  expect(restored.observe()).toEqual(run.observe())
  return callbackPublicBoundary(run.observe(), controls, sources, captured)
}

const nativePrograms = [
  ["wrongStage", "wrong-stage"],
  ["reverseOrder", "reverse-order"],
  ["canceled", "canceled"],
  ["dropped", "dropped"],
  ["latePreparation", "late-preparation"],
  ["latePreparationRetainedOne", "late-preparation-retained-one"]
] as const

// Aggregate allowance: C60s + clang90s + native15s + JS30s + run5s,
// plus15s cleanup. All original cases remain; runner defaults are unchanged.
it("compares all six original callback cases at the full immutable native/emitted/public/replay boundary", () => {
  const expected = nativePrograms.map(([kind]) => runCase(kind))
  // Every original program remains mandatory inside one fresh aggregate root.
  // Native inputs are the original programs, never public observation traces.
  const fixture = new URL("../../monkey-business-bend/conformance/callback-original-scenarios.bend", import.meta.url)
  const native = runWorkloadNative(fixture, {
      emissionTimeoutMs: 60000,
      clangTimeoutMs: 90000,
      executionTimeoutMs: 15000
    }),
    emitted = runWorkloadEmitted(fixture, { emissionTimeoutMs: 30000 })
  expect(native).toEqual(emitted)
  const nativeDTO = decodeCallbackNativePrefix(native),
    emittedDTO = decodeCallbackNativePrefix(emitted)
  expect(nativeDTO).toEqual(emittedDTO)
  expect(expected).toHaveLength(6)
  expect(decodeCallbackNativeBoundary(nativeDTO)).toEqual(expected)
  expect(decodeCallbackNativeBoundary(emittedDTO)).toEqual(expected)
}, 215000)

it("consumes a rejected late preparation receipt while releasing its original physical parent", () => {
  const run = createRun({
    inputs: [{ kind: "edit", at: 0, bytes: 10, unitBytes: [5] }],
    preparationDelay: 20,
    retention: 1
  })
  let target: CallbackTarget | undefined
  for (let fuel = 0; fuel < 100 && !target; fuel++) {
    run.step()
    target = run.observe().callbackTargets.find((value) => value.effect.kind === "preparationCompleted")
  }
  if (!target) throw new Error("original preparation callback not issued within 100 steps")
  expect(target.owner).toEqual({ partition: 1, lifetime: 1, round: 1, operation: 2 })
  run.applyControl({ kind: "callback", action: "hold", target })
  const agent = run.agentScopes[0]?.agent
  if (!agent) throw new Error("declared advicee unavailable")
  run.applyControl({ kind: "adviceeLifecycle", agent, action: "disconnect" })
  advance(run)
  expect(run.projection.dispatch.running).toHaveLength(1)
  expect(run.projection.global).toEqual({ items: 0, bytes: 0 })
  run.applyControl({ kind: "callback", action: "release", target })
  let rejected = false
  for (let fuel = 0; fuel < 100; fuel++) {
    const result = run.step()
    if (result?.event.kind === "preparationCompleted") {
      expect(result.event).toMatchObject(target.owner)
      expect(result.rejection).toBe("StaleOperation")
      expect(result.commands).toEqual([])
      rejected = true
    }
    if (run.projection.dispatch.running.length === 0) break
  }
  expect(rejected).toBe(true)
  expect(run.projection.dispatch.running).toEqual([])
  // Receipt survives only in bounded history, which now holds physical release.
  expect(run.observe().callbackTargets).not.toContainEqual(target)
  expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe())
})
