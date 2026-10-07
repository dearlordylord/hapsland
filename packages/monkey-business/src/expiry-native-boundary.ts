import {
  decoder,
  readBendList,
  readBool,
  readNat,
  readRecord
} from "@hapsland/canonical-policy/canonical/boundary-schema"
import { freezeCanonicalData } from "@hapsland/canonical-policy/canonical/immutable"
import { decodeNativePrefix } from "./callback-native-prefix.ts"
import { callbackPublicBoundary, decodePrefixCanonicalEvent } from "./callback-native-codec.ts"
import {
  decodeTrustedCanonicalStep,
  projectTrustedCanonical,
  encodeCanonicalEvent
} from "@hapsland/canonical-policy/canonical/canonical-boundary"
import { decodeAdviceeLifecycles } from "./advicee-lifecycle.ts"
import { OperationalNoticeKindSchema } from "./notice-controls.ts"
import { type CallbackTarget } from "./callback-controls.ts"
import {
  restoreReplay,
  type Run,
  type RunObservation,
  type RunRuntimeSnapshot,
  type RunStructuralFrame
} from "./index.ts"
import { strict as assert } from "node:assert"
import { isDeepStrictEqual } from "node:util"
import { decodeDriver } from "./driver-codec.ts"

const readDiagnostic = decoder(OperationalNoticeKindSchema)
function diagnostic(value: unknown) {
  const record = readRecord(value)
  if (record.$ === "None") return null
  if (record.$ !== "Some") throw new TypeError("invalid original notice diagnostic")
  return readDiagnostic(record.value)
}

/** Complete transport equality is checked before decoding this public projection. */
export function decodeExpiryNativeBoundary(words: unknown) {
  return readBendList(
    decodeNativePrefix(words, "expiry_scenarios"),
    (value) => {
      const envelope = readRecord(value),
        trace = readRecord(envelope.trace)
      if (
        envelope.$ !== "expiry_observed_driver.Envelope" ||
        trace.$ !== "expiry_observed_driver.PublicTrace" ||
        !readBool(trace.valid)
      )
        throw new TypeError("expiry observer did not complete")
      const rawFrames = fullList(trace.frames).map(readRecord)
      for (const frame of rawFrames)
        if (
          ![
            "expiry_observed_driver.Observed",
            "expiry_observed_driver.Control",
            "expiry_observed_driver.Boundary"
          ].includes(String(frame.$))
        )
          throw new TypeError("uncompared expiry transport frame")
      const frames = rawFrames
        .filter((frame) => frame.$ === "expiry_observed_driver.Observed")
        .map((frame) => {
          const observed = readRecord(frame.frame)
          if (observed.$ !== "expiry_observed_wire.Canonical")
            throw new TypeError("unexpected expiry observation family")
          const before = businessOf(observed.before),
            after = businessOf(observed.after),
            outcome = fullSingle(observed.result)
          const result = decodeTrustedCanonicalStep(
            outcome.$ === "expiry_observed_wire.Advanced"
              ? { $: "Canonical.Advanced", state: after.canonical, commands: outcome.commands }
              : { $: "Canonical.Rejected", state: after.canonical, reason: outcome.reason }
          )
          const commandScopes = fullList(observed.command_scopes).map((value) => maybe(value) ?? null)
          exact(
            commandScopes,
            fullList(maybe(frame.scopes)).map((value) => maybe(value) ?? null),
            "captured command scopes"
          )
          if (commandScopes.length !== result.commands.length) throw new TypeError("expiry command scope count differs")
          exact(maybe(frame.receipt), undefined, "original receipt premise")
          exact(maybe(observed.receipt), undefined, "physical receipt premise")
          exact(fullList(observed.physical), [], "physical delivery premise")
          return {
            kind: "canonical",
            time: readNat(observed.time),
            before: projectTrustedCanonical(before.canonical),
            after: projectTrustedCanonical(after.canonical),
            event: decodePrefixCanonicalEvent(observed.event),
            commands: result.commands,
            commandScopes,
            rejection: result.rejection ?? null,
            receipt: null,
            noticeDiagnostic: diagnostic(frame.diagnostic)
          }
        })
      const eventCount = readNat(trace.consumed),
        endpoint = fullSingle(trace.runtime),
        business = fullSingle(endpoint.business)
      if (eventCount !== frames.length) throw new TypeError("expiry event accounting differs")
      return freezeCanonicalData({
        frames,
        endpoint: {
          time: readNat(endpoint.time),
          projection: projectTrustedCanonical(business.canonical),
          targets: [] as CallbackTarget[],
          lifecycles: decodeAdviceeLifecycles(business.lifecycles)
        },
        eventCount
      })
    },
    2048
  )
}

export function expiryPublicBoundary(observation: RunObservation) {
  const full = callbackPublicBoundary(observation, [], [])
  return freezeCanonicalData({
    frames: full.frames.map((frame, index) => ({
      ...frame,
      noticeDiagnostic: observation.observations[index]?.noticeDiagnostic ?? null
    })),
    endpoint: full.endpoint,
    eventCount: observation.eventCount
  })
}

/** Factual public control/advance history. Wrappers invoke each ordinary owner
 * exactly once; structural observation never spends an event budget. */
export function captureExpiryPublicRun(run: Run) {
  const initial = run.runtimeSnapshot()
  const frames: RunStructuralFrame[] = []
  const checkpoints: {
    operation: "control" | "advance"
    input: unknown
    before: RunRuntimeSnapshot
    after: RunRuntimeSnapshot
    result: unknown
  }[] = []
  const unsubscribe = run.subscribeStructural((frame) => frames.push(frame))
  const applyControl = run.applyControl.bind(run),
    advance = run.advance.bind(run)
  function replayBoundary() {
    const restored = restoreReplay(JSON.parse(JSON.stringify(run.exportReplay())))
    assert.deepEqual(restored.observe(), run.observe(), "ordinary expiry replay observation")
    assert.deepEqual(
      publicOwnerFacts(restored.runtimeSnapshot()),
      publicOwnerFacts(run.runtimeSnapshot()),
      "ordinary expiry replay owner facts"
    )
    assert.deepEqual(restored.exportReplay(), run.exportReplay(), "ordinary expiry replay inputs")
  }
  run.applyControl = (input) => {
    const before = run.runtimeSnapshot()
    const result = applyControl(input)
    checkpoints.push({ operation: "control", input, before, after: run.runtimeSnapshot(), result })
    replayBoundary()
    return result
  }
  run.advance = (input) => {
    const before = run.runtimeSnapshot()
    const result = advance(input)
    if (result.reason === "eventLimit") throw new Error("original expiry advance exhausted its declared budget")
    checkpoints.push({ operation: "advance", input, before, after: run.runtimeSnapshot(), result })
    replayBoundary()
    return result
  }
  return {
    run,
    initial,
    frames,
    checkpoints,
    finish() {
      unsubscribe()
      replayBoundary()
      return {
        initial,
        frames,
        checkpoints,
        endpoint: run.runtimeSnapshot(),
        boundary: expiryPublicBoundary(run.observe())
      }
    }
  }
}

const fullList = (value: unknown) => readBendList(value, (value) => value, 2048)
function fullSingle(value: unknown) {
  const values = fullList(value)
  if (values.length !== 1) throw new TypeError("expiry requires an actual singleton carrier")
  return readRecord(values[0])
}
function firstMismatch(actual: unknown, expected: unknown, path = "$", depth = 0): string {
  if (depth >= 64) return `${path} (depth bound)`
  if (actual !== null && expected !== null && typeof actual === "object" && typeof expected === "object") {
    const left = actual as Record<string, unknown>,
      right = expected as Record<string, unknown>
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])]
    for (const key of keys)
      if (!isDeepStrictEqual(left[key], right[key]))
        return firstMismatch(left[key], right[key], `${path}.${key}`, depth + 1)
  }
  const scalar = (value: unknown) =>
    typeof value === "number" || typeof value === "boolean" || value === undefined || value === null
      ? String(value)
      : typeof value === "string"
        ? `string(length=${value.length})`
        : typeof value
  return `${path}: native=${scalar(actual)}, public=${scalar(expected)}`
}
function exact(actual: unknown, expected: unknown, field: string): void {
  if (!isDeepStrictEqual(actual, expected))
    throw new Error(`expiry public business layer differs at ${field}; ${firstMismatch(actual, expected)}`)
}
function maybe(value: unknown): unknown {
  const record = readRecord(value)
  if (record.$ === "None") return undefined
  if (record.$ !== "Some") throw new TypeError("invalid expiry factual Maybe")
  return record.value
}
function fullAction(value: unknown) {
  return decodeDriver({ handled: true, actions: { $: "Con", head: value, tail: { $: "Nil" } } }).actions[0]
}
function businessOf(value: unknown) {
  return fullSingle(fullSingle(value).business)
}
function publicOwnerFacts(source: RunRuntimeSnapshot) {
  const engine = readRecord(source.engine),
    scenarios = readRecord(engine.scenarios)
  return {
    canonical: projectTrustedCanonical(engine.canonical),
    notices: scenarios.notices,
    clocks: scenarios.clocks,
    collection: scenarios.collection,
    finishes: readRecord(scenarios.stop).finishes,
    lifecycles: engine.lifecycles
  }
}
function compareExpirySnapshot(value: unknown, source: RunRuntimeSnapshot, capsules: unknown, field: string) {
  const snapshot = fullSingle(value),
    business = fullSingle(snapshot.business)
  if (snapshot.$ !== "expiry_observed_wire.Snapshot" || business.$ !== "expiry_observed_wire.BusinessState")
    throw new TypeError("invalid expiry business snapshot")
  const expected = publicOwnerFacts(source)
  exact(
    { ...business, $: undefined, canonical: projectTrustedCanonical(business.canonical) },
    { ...expected, $: undefined },
    `${field} public owner facts`
  )
  exact(snapshot.time, readRecord(readRecord(source.engine).scheduler).now, `${field} actual clock`)
  exact(snapshot.next_order, source.order, `${field} original queued identity`)
  exact(snapshot.jobs, source.jobs.length, `${field} retained job count`)
  exact(source.issuedRequests, [], `${field} suspended request ownership`)
  exact(source.retainedCallbacks, [], `${field} suspended callback ownership`)
  const entries = fullList(snapshot.pending).map(readRecord),
    scopes = fullList(capsules).map(readRecord)
  exact(entries.length, source.queue.length, `${field} queued public input count`)
  const orders = new Set<number>()
  for (const item of entries) {
    const order = readNat(item.order)
    if (orders.has(order)) throw new TypeError("duplicate expiry queued order")
    orders.add(order)
    const pending = source.queue.find((value) => value.order === order)
    if (!pending) throw new Error(`${field} loses actual public input ${order}`)
    exact(item.at, pending.at, `${field} input ${order} time`)
    const scope = scopes.filter((value) => readNat(value.order) === order)
    if (scope.length > 1) throw new TypeError("duplicate notice scope capsule")
    exact(
      scope.length ? maybe(scope[0]!.scope) : undefined,
      pending.noticeScope,
      `${field} input ${order} notice scope`
    )
    exact(
      scope.length ? maybe(scope[0]!.diagnostic) : undefined,
      pending.noticeDiagnostic,
      `${field} input ${order} diagnostic`
    )
    if (item.$ === "expiry_observed_wire.Event") {
      if (pending.input.kind !== "canonical") throw new TypeError("expiry changed original input kind")
      exact(
        fullAction(item.action),
        { event: pending.input.event, delay: 0, job: false },
        `${field} input ${order} actual action`
      )
      const partition = pending.partition ?? 1
      exact(item.partition, partition, `${field} input ${order} source partition`)
      const life = fullList(expected.lifecycles)
        .map(readRecord)
        .find((value) => value.partition === partition)
      if (partition !== 0 && !life) throw new Error(`${field} missing actual source allocation`)
      exact(item.lifetime, partition === 0 ? 0 : life!.lifetime, `${field} input ${order} source lifetime`)
      exact(pending.driverSourceJob, undefined, `${field} input ${order} immediate source premise`)
      exact(pending.job, undefined, `${field} input ${order} active job premise`)
    } else if (item.$ === "expiry_observed_wire.Arrival") {
      const emission = readRecord(item.event),
        partition = readNat(emission.partition)
      const agent = partition === 1 ? "first" : partition === 2 ? "second" : undefined
      if (!agent) throw new TypeError("unknown original expiry workload advicee")
      const common = {
        at: readNat(emission.at),
        generation: readNat(emission.generation),
        agent,
        recurring: readBool(emission.recurring)
      }
      const kind = readNat(emission.kind)
      const original =
        kind === 0
          ? { ...common, kind: "task", task: readNat(emission.task) }
          : kind === 2
            ? { ...common, kind: "finish" }
            : {
                ...common,
                kind: "edit",
                bytes: readNat(emission.bytes),
                unitBytes: fullList(emission.units).map(readNat),
                revision: readNat(emission.revision),
                ...(readBool(emission.repair) ? { repair: true } : {})
              }
      exact(original, pending.input, `${field} input ${order} actual workload emission`)
      const life = fullList(expected.lifecycles)
        .map(readRecord)
        .find((value) => value.partition === partition)
      if (!life) throw new Error("expiry workload has no actual allocation")
      exact(item.lifetime, life.lifetime, `${field} input ${order} workload lifetime`)
    } else throw new TypeError("uncompared expiry public queued input")
  }
  for (const scope of scopes) if (!orders.has(readNat(scope.order))) throw new TypeError("orphan expiry queue capsule")
}

function originalControl(value: unknown) {
  const original = readRecord(value),
    action = readRecord(original.action)
  const target = { partition: action.partition, group: action.group, key: action.key }
  if (action.$ === "expiry_observed_driver.Failure")
    return { kind: "noticeFailure", target, diagnostic: action.diagnostic }
  if (action.$ === "expiry_observed_driver.Lease") return { kind: "noticeLease", target }
  if (action.$ === "expiry_observed_driver.Collect")
    return {
      kind: "noticeCollect",
      partition: action.partition,
      group: action.group,
      composed: action.composed,
      authorityBound: action.authority_bound,
      allowed: fullList(action.allowed)
    }
  if (action.$ === "expiry_observed_driver.Profile") {
    const profile = readRecord(action.profile)
    return {
      kind: "expiryProfile",
      profile: {
        pendingMs: profile.pending_duration,
        leaseMs: profile.lease_duration,
        cooldownMs: profile.cooldown_duration
      }
    }
  }
  throw new TypeError("raw expiry input was silently changed into a control")
}

/** Original Notice operations and intermediate owner facts at the public boundary. */
export function compareExpiryBusinessTrace(
  value: unknown,
  expected: readonly ReturnType<ReturnType<typeof captureExpiryPublicRun>["finish"]>[]
) {
  const envelopes = fullList(value).map(readRecord)
  exact(envelopes.length, expected.length, "original Notice scenario count")
  for (const [caseIndex, envelope] of envelopes.entries()) {
    const source = expected[caseIndex]
    if (!source) throw new Error("missing original Notice public case")
    const startup = readRecord(envelope.startup),
      trace = readRecord(envelope.trace)
    if (!readBool(trace.valid)) throw new TypeError("invalid Notice transport")
    const frames = fullList(trace.frames).map(readRecord)
    const nativeObserved = frames.filter((frame) => frame.$ === "expiry_observed_driver.Observed")
    const actualObserved = source.frames.filter((frame) => frame.kind !== "callbackDelivery")
    exact(nativeObserved.length, actualObserved.length, `case ${caseIndex} actual observation count`)
    // Operational notices have no environmental callback delivery; this is an
    // independent premise of these twelve suspended-workload inputs.
    exact(
      source.frames.filter((frame) => frame.kind === "callbackDelivery"),
      [],
      `case ${caseIndex} physical callback premise`
    )
    for (const [index, wrapped] of nativeObserved.entries()) {
      const native = readRecord(wrapped.frame),
        actual = actualObserved[index]
      if (!actual || actual.kind !== "canonical" || native.$ !== "expiry_observed_wire.Canonical")
        throw new TypeError("Notice scenario changed its original observation family")
      compareExpirySnapshot(
        native.before,
        actual.before,
        wrapped.before_capsules,
        `case ${caseIndex} frame ${index} before`
      )
      compareExpirySnapshot(
        native.after,
        actual.after,
        wrapped.after_capsules,
        `case ${caseIndex} frame ${index} after`
      )
      exact(native.time, actual.time, `case ${caseIndex} frame ${index} time`)
      exact(native.order, actual.scheduled.order, `case ${caseIndex} frame ${index} original order`)
      exact(
        maybe(native.provided),
        actual.scheduled.partition ?? 1,
        `case ${caseIndex} frame ${index} original provided scope`
      )
      if (actual.observation.event.kind === "preparationGraph")
        throw new TypeError("canonical Notice frame changed original graph event kind")
      exact(
        decodePrefixCanonicalEvent(native.event),
        encodeCanonicalEvent(actual.observation.event),
        `case ${caseIndex} frame ${index} event`
      )
      const result = fullSingle(native.result),
        actualResult = readRecord(readRecord(actual.transition).result)
      exact(
        result.$,
        actualResult.$ === "Canonical.Advanced" ? "expiry_observed_wire.Advanced" : "expiry_observed_wire.Rejected",
        `case ${caseIndex} frame ${index} result kind`
      )
      exact(
        result.commands ?? result.reason,
        actualResult.commands ?? actualResult.reason,
        `case ${caseIndex} frame ${index} ordered commands or rejection`
      )
      exact(
        fullList(native.command_scopes).map(maybe),
        actual.observation.commandScopes,
        `case ${caseIndex} frame ${index} scopes`
      )
      exact(maybe(native.receipt), undefined, `case ${caseIndex} frame ${index} selected receipt`)
      exact(fullList(native.physical), [], `case ${caseIndex} frame ${index} physical transitions`)
      exact(
        diagnostic(wrapped.diagnostic),
        actual.observation.noticeDiagnostic ?? null,
        `case ${caseIndex} frame ${index} diagnostic`
      )
    }
    const suspend = source.checkpoints[0]
    if (!suspend || suspend.operation !== "control") throw new Error("missing original suspension checkpoint")
    exact(suspend.input, { kind: "suspendArrivals", suspended: true }, "original startup control")
    compareExpirySnapshot(startup.constructed, source.initial, startup.capsules, `case ${caseIndex} constructor`)
    compareExpirySnapshot(startup.suspended, suspend.after, startup.capsules, `case ${caseIndex} suspension`)
    const controls = frames.filter((frame) => frame.$ === "expiry_observed_driver.Control")
    const actualControls = source.checkpoints.filter((frame) => frame.operation === "control").slice(1)
    exact(controls.length, actualControls.length, `case ${caseIndex} control count`)
    let activeProfile: unknown = envelope.profile
    for (const [index, control] of controls.entries()) {
      const actual = actualControls[index]
      if (!actual) throw new Error("missing original Notice control checkpoint")
      exact(originalControl(control.input), actual.input, `case ${caseIndex} control ${index} full input`)
      exact(
        readRecord(control.input).at,
        readRecord(readRecord(actual.before.engine).scheduler).now,
        `case ${caseIndex} control ${index} original clock`
      )
      exact(control.before_profile, activeProfile, `case ${caseIndex} control ${index} original profile`)
      const action = readRecord(readRecord(control.input).action)
      if (action.$ === "expiry_observed_driver.Profile") activeProfile = action.profile
      exact(control.after_profile, activeProfile, `case ${caseIndex} control ${index} current profile`)
      compareExpirySnapshot(
        control.before,
        actual.before,
        control.before_capsules,
        `case ${caseIndex} control ${index} before`
      )
      compareExpirySnapshot(
        control.after,
        actual.after,
        control.after_capsules,
        `case ${caseIndex} control ${index} after`
      )
    }
    const boundaries = frames.filter((frame) => frame.$ === "expiry_observed_driver.Boundary")
    const actualBoundaries = source.checkpoints.filter((frame) => frame.operation === "advance")
    exact(boundaries.length, actualBoundaries.length, `case ${caseIndex} advance count`)
    for (const [index, boundary] of boundaries.entries()) {
      const actual = actualBoundaries[index]
      if (!actual) throw new Error("missing original Notice advance checkpoint")
      const input = readRecord(actual.input),
        result = readRecord(actual.result)
      exact(
        [boundary.endpoint, boundary.budget, boundary.consumed],
        [input.untilTime, input.maxEvents, result.events],
        `case ${caseIndex} advance ${index} original budget/count`
      )
      compareExpirySnapshot(
        boundary.runtime,
        actual.after,
        boundary.capsules,
        `case ${caseIndex} advance ${index} public owner facts`
      )
    }
    exact(trace.profile, activeProfile, `case ${caseIndex} retained profile`)
    exact(trace.consumed, source.boundary.eventCount, `case ${caseIndex} consumed accounting`)
    compareExpirySnapshot(trace.runtime, source.endpoint, trace.capsules, `case ${caseIndex} final public owner facts`)
  }
}
