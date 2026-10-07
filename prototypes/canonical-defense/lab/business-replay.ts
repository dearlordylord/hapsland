import assert from "node:assert/strict"
import { readBendList, readNat, readRecord } from "@hapsland/canonical-policy/canonical/boundary-schema"
import {
  createRun, restoreReplay, type Replay, type RunConfig, type RunStructuralFrame
} from "../../../packages/monkey-business/src/index.ts"
import { compareNativeFrames, compareNativeRuntime } from "../compare-native-runtime.mjs"

export type BusinessReplaySettings = {
  readonly jevDelayMs?: number
  readonly outputDelayMs?: number
  readonly sourceDelayMs?: number
  readonly credentialReady?: boolean
  readonly sourceReadable?: boolean
  readonly outcome?: "sampled" | "clear" | "finding"
  readonly burst?: number
  readonly arrivalIntervalMs?: number
}

/** Independent public declaration of DefenseConsumer + DefenseLab scenario inputs. */
export function gameBusinessConfig(settings: BusinessReplaySettings, seed: number): RunConfig {
  return {
    seed, retention: 1000,
    limits: { globalItems: 32, globalBytes: 480, partitionItems: 16, partitionBytes: 480 },
    session: {
      agent: "agent-1", seed, editIntervalMs: settings.arrivalIntervalMs ?? 30000,
      variationMs: 200, editsPerTask: 4, taskPauseMs: 3000, adviceResponse: "ignore",
      repairDelayMs: 300, bytes: 100, unitBytes: [10, 20]
    },
    preparationDelay: settings.sourceDelayMs ?? 800,
    jevDelay: settings.jevDelayMs ?? 3200,
    adviceLifetime: 20000,
    environment: {
      currentWork: true, credentialReady: settings.credentialReady ?? true,
      credentialGeneration: 1, sourceReadable: settings.sourceReadable ?? true
    },
    outputProfile: { outcome: "certain", delayMs: settings.outputDelayMs ?? 800, leaseMs: 5000 },
    outcomeWeights: { neverSent: 0, finding: 1, clear: 0, backendFailure: 0, timeout: 0, interrupted: 0 },
    fileTrees: {
      minFiles: 1, maxFiles: 3, maxImports: 2, maxDepth: 2, deniedPercent: 0,
      missingPercent: 0, unreadablePercent: 0, repeatedEdgePercent: 10, cyclicEdgePercent: 0,
      unsupportedPercent: 0, deadlineStep: 0, localWork: 0,
      minSourceBytes: 4, maxSourceBytes: 8, minTreeBytes: 3, maxTreeBytes: 6
    }
  }
}

function runtime(observation: unknown) {
  const value = readRecord(observation)
  assert.equal(value.$, "NativeRunTypes.Observation", "complete native observation required")
  assert.equal(value.valid, true, "native observation must be valid")
  return readRecord(value.runtime)
}

function boolean(value: unknown): boolean {
  assert.equal(typeof value, "boolean", "native environment boolean required")
  return value as boolean
}

function environment(observation: unknown) {
  const value = readRecord(runtime(observation).environment)
  return {
    currentWork: boolean(value.current_work), credentialReady: boolean(value.credential_ready),
    credentialGeneration: readNat(value.credential_generation), sourceReadable: boolean(value.source_readable)
  }
}

function outputOutcome(value: unknown): "certain" | "uncertain" | "failed" {
  switch (readRecord(value).$) {
    case "OutputScenario.Certain": return "certain"
    case "OutputScenario.Uncertain": return "uncertain"
    case "OutputScenario.Failed": return "failed"
    default: throw new Error("unsupported native output outcome")
  }
}

export type BusinessActionBoundary = {
  readonly before: unknown
  readonly after: unknown
  readonly applied: boolean
  readonly label: string
}
export type BusinessTickBoundary = {
  readonly before: unknown
  readonly after: unknown
  readonly frames: unknown
  readonly physical: unknown
  readonly untilTime: number
  readonly maxEvents: number
  readonly label: string
}

/**
 * Mirror original inputs through the ordinary public Run, never by scheduling
 * observed Canonical outcomes. The existing full native comparator establishes
 * equivalence before a business replay is exported.
 */
export function createGameBusinessReplay(settings: BusinessReplaySettings = {}, seed: number) {
  const run = createRun(gameBusinessConfig(settings, seed))
  // RunConfig deliberately excludes weights + an override together. Installing
  // the override before any work preserves the game's 100%-Finding weights.
  if (settings.outcome === "clear" || settings.outcome === "finding")
    run.applyControl({ kind: "jevProfile", delayMs: settings.jevDelayMs ?? 3200, outcome: settings.outcome })
  run.applyControl({ kind: "burst", agent: "agent-1", count: settings.burst ?? 1 })

  function compare(observation: unknown, label: string): void {
    compareNativeRuntime(runtime(observation), run.runtimeSnapshot(), label)
    const native = readRecord(observation)
    assert.equal(readNat(native.time), run.now, `${label} observation time`)
    assert.equal(readNat(native.event_count), run.eventCount, `${label} observation count`)
  }

  function recordAction({ before, after, applied, label }: BusinessActionBoundary): void {
    compare(before, `${label} before`)
    if (applied) {
      const afterEnvironment = readRecord(runtime(after).environment)
      // Host applies both profiles on every successful build/upgrade, including
      // a zero-strength or disconnected purchase. Read the actual effect; do not
      // duplicate the game's strength/placement policy in the public adapter.
      run.applyControl({ kind: "jevProfile", delayMs: readNat(afterEnvironment.jev_delay) })
      run.applyControl({ kind: "outputProfile",
        outcome: outputOutcome(readRecord(afterEnvironment.output_profile).outcome),
        delayMs: readNat(afterEnvironment.output_delay), leaseMs: readNat(afterEnvironment.output_lease) })
      const previous = environment(before), next = environment(after)
      if (previous.currentWork !== next.currentWork || previous.credentialReady !== next.credentialReady ||
          previous.credentialGeneration !== next.credentialGeneration || previous.sourceReadable !== next.sourceReadable)
        run.applyControl({ kind: "environment", ...next })
    }
    compare(after, `${label} after`)
  }

  function advanceAndCompare({ before, after, frames, physical, untilTime, maxEvents, label }: BusinessTickBoundary): void {
    compare(before, `${label} before`)
    const publicFrames: RunStructuralFrame[] = []
    const unsubscribe = run.subscribeStructural(frame => publicFrames.push(frame))
    try {
      const initialCount = run.eventCount
      run.advance({ untilTime, maxEvents })
      // Independently declared game profile: four checks, all Finding. Forced
      // Clear stays authoritative. Multiplicity updates the existing result.
      const settlements = publicFrames.filter(frame => frame.kind === "canonical" &&
        frame.observation.event.kind === "jevRequestSettled" &&
        frame.observation.event.outcome === "finding" && frame.observation.event.currentWork)
      let counts = 0
      for (const frame of settlements) {
        if (frame.kind !== "canonical" || frame.observation.event.kind !== "jevRequestSettled") continue
        const event = frame.observation.event
        const work = run.observe().projection.work.find(item => item.partition === event.partition &&
          item.lifetime === event.lifetime && item.round === event.round && item.operation === event.operation)
        if (work?.kind !== "pendingFinding") continue
        run.schedule({ at: run.now, kind: "canonical", event: { kind: "findingCountUpdated",
          partition: event.partition, lifetime: event.lifetime, round: event.round,
          operation: event.operation, count: 4 } })
        counts++
      }
      if (counts) run.advance({ untilTime: run.now, maxEvents: Math.min(32, maxEvents - (run.eventCount - initialCount)) })
    } finally { unsubscribe() }
    // Frames alone omit silent physical callbacks; compare the complete delivery
    // stream as well, exactly as the maintained consumer verifier does.
    const deliveries = readBendList(physical, readRecord, 2048)
    const publicPhysical = publicFrames.filter(frame => frame.kind === "callbackDelivery")
    assert.equal(deliveries.length, publicPhysical.length, `${label} all physical deliveries`)
    for (const [index, delivery] of deliveries.entries()) {
      const actual = publicPhysical[index]!
      assert.equal(delivery.$, "NativeRunTypes.PhysicalDelivery")
      compareNativeRuntime(delivery.before, actual.before, `${label} delivery ${index} before`)
      compareNativeRuntime(delivery.after, actual.after, `${label} delivery ${index} after`)
      assert.deepEqual(delivery.action, actual.delivery, `${label} delivery ${index} full action`)
    }
    compareNativeFrames(frames, publicFrames, label)
    compare(after, `${label} endpoint`)
  }

  function exportAndRestore(observation: unknown): Replay {
    compare(observation, "ordinary business replay export")
    const replay: Replay = JSON.parse(JSON.stringify(run.exportReplay()))
    const restored = restoreReplay(replay)
    assert.deepEqual(restored.exportReplay(), replay, "ordinary business replay timeline and endpoint")
    assert.deepEqual(restored.observe(), run.observe(), "ordinary business replay full observation")
    compareNativeRuntime(runtime(observation), restored.runtimeSnapshot(), "restored native business endpoint")
    return replay
  }

  return { compare, recordAction, advanceAndCompare, exportAndRestore }
}
