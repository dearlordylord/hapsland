import { decoder, readBendList, readBool, readNat, readRecord } from "../../../src/canonical/boundary-schema.ts";
import { freezeCanonicalData } from "../../../src/canonical/immutable.ts";
import { decodeNativePrefix } from "./callback-native-prefix.ts";
import { callbackPublicBoundary } from "./callback-native-codec.ts";
import { decodeObservedFrame, decodeObservedState, stateEndpoint } from "./sharing-native-boundary.ts";
import { OperationalNoticeKindSchema } from "./notice-controls.ts";
import type { CallbackTarget } from "./callback-controls.ts";
import { restoreReplay, type Run, type RunObservation, type RunRuntimeSnapshot, type RunStructuralFrame } from "./index.ts";
import { strict as assert } from "node:assert";
import { isDeepStrictEqual } from "node:util";
import { encodeCanonicalEvent } from "../../../src/canonical/canonical-boundary.ts";
import { decodeDriver, encodeDriverOutcome } from "./driver-codec.ts";
import { decodePrefixCanonicalEvent } from "./callback-native-codec.ts";

const readDiagnostic = decoder(OperationalNoticeKindSchema);
function diagnostic(value: unknown) {
  const record = readRecord(value);
  if (record.$ === "None") return null;
  if (record.$ !== "Some") throw new TypeError("invalid original notice diagnostic");
  return readDiagnostic(record.value);
}

/** Complete shared observer frames and endpoint; the generated owner descriptor
 * also retains every original input and private state field for native/JS comparison. */
export function decodeExpiryNativeBoundary(words: unknown) {
  return readBendList(decodeNativePrefix(words, "expiry_scenarios"), value => {
    const envelope = readRecord(value);
    if (envelope.$ !== "expiry_observed_driver.Envelope") throw new TypeError("invalid expiry envelope");
    const trace = readRecord(envelope.trace);
    if (trace.$ !== "expiry_observed_driver.Trace" || !readBool(trace.valid)) throw new TypeError("expiry observer did not complete");
    const receipts: CallbackTarget[] = [];
    const rawFrames = readBendList(trace.frames, readRecord, 2048);
    for (const frame of rawFrames) if (!["expiry_observed_driver.Observed", "expiry_observed_driver.Control", "expiry_observed_driver.Boundary"].includes(String(frame.$)))
      throw new TypeError("uncompared expiry transport frame");
    const frames = rawFrames.filter(frame => frame.$ === "expiry_observed_driver.Observed").map(frame => ({ ...decodeObservedFrame(frame, receipts),
      noticeDiagnostic: diagnostic(frame.diagnostic) }));
    const eventCount = readNat(trace.consumed);
    if (eventCount !== frames.length) throw new TypeError("expiry event accounting differs");
    return freezeCanonicalData({ frames, endpoint: stateEndpoint(decodeObservedState({ $: "Con", head: readRecord(readBendList(trace.runtime, readRecord, 1)[0]).state, tail: { $: "Nil" } }), receipts), eventCount });
  }, 2048);
}

export function expiryPublicBoundary(observation: RunObservation) {
  const full = callbackPublicBoundary(observation, [], []);
  return freezeCanonicalData({ frames: full.frames.map((frame, index) => ({ ...frame,
    noticeDiagnostic: observation.observations[index]?.noticeDiagnostic ?? null })), endpoint: full.endpoint, eventCount: observation.eventCount });
}

/** Factual public control/advance history. Wrappers invoke each ordinary owner
 * exactly once; structural observation never spends an event budget. */
export function captureExpiryPublicRun(run: Run) {
  const initial = run.runtimeSnapshot();
  const frames: RunStructuralFrame[] = [];
  const checkpoints: { operation: "control" | "advance"; input: unknown;
    before: RunRuntimeSnapshot; after: RunRuntimeSnapshot; result: unknown }[] = [];
  const unsubscribe = run.subscribeStructural(frame => frames.push(frame));
  const applyControl = run.applyControl.bind(run), advance = run.advance.bind(run);
  function replayBoundary() {
    const restored = restoreReplay(JSON.parse(JSON.stringify(run.exportReplay())));
    assert.deepEqual(restored.observe(),run.observe(),"ordinary expiry replay observation");
    assert.deepEqual(restored.runtimeSnapshot(),run.runtimeSnapshot(),"ordinary expiry replay full runtime");
    assert.deepEqual(restored.exportReplay(),run.exportReplay(),"ordinary expiry replay inputs");
  }
  run.applyControl = input => {
    const before = run.runtimeSnapshot();
    const result = applyControl(input);
    checkpoints.push({ operation: "control", input, before, after: run.runtimeSnapshot(), result });
    replayBoundary();
    return result;
  };
  run.advance = input => {
    const before = run.runtimeSnapshot();
    const result = advance(input);
    if (result.reason === "eventLimit") throw new Error("original expiry advance exhausted its declared budget");
    checkpoints.push({ operation: "advance", input, before, after: run.runtimeSnapshot(), result });
    replayBoundary();
    return result;
  };
  return {
    run, initial, frames, checkpoints,
    finish() {
      unsubscribe();
      replayBoundary();
      return { initial, frames, checkpoints, endpoint: run.runtimeSnapshot(),
        boundary: expiryPublicBoundary(run.observe()) };
    },
  };
}

const fullList = (value: unknown) => readBendList(value,value => value,2048);
function fullSingle(value: unknown) {
  const values = fullList(value);
  if (values.length !== 1) throw new TypeError("expiry requires an actual singleton carrier");
  return readRecord(values[0]);
}
function exact(actual: unknown, expected: unknown, field: string): void {
  if (!isDeepStrictEqual(actual,expected)) throw new Error(`full expiry observer differs at ${field}`);
}
function maybe(value: unknown): unknown {
  const record = readRecord(value);
  if (record.$ === "None") return undefined;
  if (record.$ !== "Some") throw new TypeError("invalid expiry factual Maybe");
  return record.value;
}
function fullAction(value: unknown) {
  return decodeDriver({ handled: true, actions: { $: "Con", head: value, tail: { $: "Nil" } } }).actions[0];
}
function compareExpiryRuntime(value: unknown, source: RunRuntimeSnapshot, capsules: unknown, field: string) {
  const runtime = fullSingle(value), queue = readRecord(runtime.queue);
  exact(runtime.state,source.engine,`${field} full owner state`);
  exact(readNat(runtime.delay),source.jevDelay,`${field} delay`);
  exact(readNat(queue.sequence),source.order,`${field} queued identity`);
  const entries = fullList(queue.items).map(readRecord);
  exact(entries.length,source.queue.length,`${field} pending count`);
  const scopes = fullList(capsules).map(readRecord);
  const orders = new Set<number>();
  for (const item of entries) {
    const order = readNat(item.order);
    if (orders.has(order)) throw new TypeError("duplicate expiry queued order");
    orders.add(order);
    const pending = source.queue.find(value => value.order === order);
    if (!pending) throw new Error(`${field} loses actual queue item ${order}`);
    exact(readNat(item.at),pending.at,`${field} item ${order} absolute time`);
    const scope = scopes.filter(value => readNat(value.order) === order);
    if (scope.length > 1) throw new TypeError("duplicate notice scope capsule");
    exact(scope.length ? maybe(scope[0]!.scope) : undefined,pending.noticeScope,`${field} item ${order} notice scope`);
    exact(scope.length ? maybe(scope[0]!.diagnostic) : undefined,pending.noticeDiagnostic,`${field} item ${order} diagnostic`);
    const input = readRecord(item.input);
    if (input.$ === "advicee_lifecycle_driver.Event") {
      if (pending.input.kind !== "canonical") throw new TypeError("expiry event changed original input kind");
      // Original raw inputs and operational notice feedback are explicitly
      // immediate source facts. They are not reconstructed from an endpoint.
      exact(fullAction(input.action), { event: pending.input.event, delay: 0, job: false },`${field} item ${order} complete immediate action`);
      const job = readRecord(input.job), partition = pending.partition ?? 1;
      const lifecycle = fullList(readRecord(source.engine).lifecycles).map(readRecord).find(value => value.partition === partition);
      if (!lifecycle) throw new Error("expiry queued source has no actual advicee allocation");
      exact([job.partition,job.lifetime,job.bytes,fullList(job.units),job.outcome],
        [partition,lifecycle.lifetime,0,[],encodeDriverOutcome("neverSent")],`${field} item ${order} full source tuple`);
    } else if (input.$ === "advicee_lifecycle_driver.Arrival") {
      const emission = readRecord(input.event);
      const partition = readNat(emission.partition), agent = partition === 1 ? "first" : partition === 2 ? "second" : undefined;
      if (!agent) throw new TypeError("unknown original expiry workload advicee");
      const common = { at: readNat(emission.at), generation: readNat(emission.generation), agent, recurring: readBool(emission.recurring) };
      const kind = readNat(emission.kind);
      const original = kind === 0 ? { ...common, kind: "task", task: readNat(emission.task) }
        : kind === 2 ? { ...common, kind: "finish" }
        : { ...common, kind: "edit", bytes: readNat(emission.bytes), unitBytes: fullList(emission.units).map(readNat),
            revision: readNat(emission.revision), ...(readBool(emission.repair) ? { repair: true } : {}) };
      exact(original,pending.input,`${field} item ${order} actual workload emission`);
      const lifecycle = fullList(readRecord(source.engine).lifecycles).map(readRecord).find(value => value.partition === partition);
      if (!lifecycle) throw new Error("expiry workload has no original allocation");
      exact(input.lifetime,lifecycle.lifetime,`${field} item ${order} workload lifetime`);
    } else throw new TypeError(`uncompared original Notice input ${String(input.$)}`);
  }
  for (const scope of scopes) if (!orders.has(readNat(scope.order))) throw new TypeError("orphan expiry queue capsule");
  // Suspended constructor inputs issue no edit jobs. Compare both actual
  // carriers, rather than manufacturing an empty native jobs projection.
  exact(fullList(runtime.jobs),source.jobs,`${field} retained jobs`);
  exact(source.issuedRequests,[],`${field} suspended request ownership`);
  exact(source.retainedCallbacks,[],`${field} suspended callback ownership`);
}
function originalControl(value: unknown) {
  const original = readRecord(value), action = readRecord(original.action);
  const target = { partition: action.partition, group: action.group, key: action.key };
  if (action.$ === "expiry_observed_driver.Failure") return { kind: "noticeFailure", target, diagnostic: action.diagnostic };
  if (action.$ === "expiry_observed_driver.Lease") return { kind: "noticeLease", target };
  if (action.$ === "expiry_observed_driver.Collect") return { kind: "noticeCollect", partition: action.partition, group: action.group,
    composed: action.composed, authorityBound: action.authority_bound, allowed: fullList(action.allowed) };
  if (action.$ === "expiry_observed_driver.Profile") {
    const profile = readRecord(action.profile);
    return { kind: "expiryProfile", profile: { pendingMs: profile.pending_duration, leaseMs: profile.lease_duration, cooldownMs: profile.cooldown_duration } };
  }
  throw new TypeError("raw expiry input was silently changed into a control");
}

/** Full original Notice trace, not only the public Canonical projection.
 * Generated ONE decoding retains every native/JS field before this comparison. */
export function compareExpiryFullTrace(value: unknown, expected: readonly ReturnType<ReturnType<typeof captureExpiryPublicRun>["finish"]>[]) {
  const envelopes = fullList(value).map(readRecord);
  exact(envelopes.length,expected.length,"original Notice scenario count");
  for (const [caseIndex,envelope] of envelopes.entries()) {
    const source = expected[caseIndex];
    if (!source) throw new Error("missing original Notice public case");
    const startup = readRecord(envelope.startup), trace = readRecord(envelope.trace);
    if (!readBool(trace.valid)) throw new TypeError("invalid full Notice transport");
    const frames = fullList(trace.frames).map(readRecord);
    const nativeObserved = frames.filter(frame => frame.$ === "expiry_observed_driver.Observed");
    const actualObserved = source.frames.filter(frame => frame.kind !== "callbackDelivery");
    exact(nativeObserved.length,actualObserved.length,`case ${caseIndex} actual observation count`);
    // Operational notices have no environmental callback delivery; this is an
    // independent premise of these twelve suspended-workload inputs.
    exact(source.frames.filter(frame => frame.kind === "callbackDelivery"),[],`case ${caseIndex} physical callback premise`);
    for (const [index,wrapped] of nativeObserved.entries()) {
      const native = readRecord(wrapped.frame), actual = actualObserved[index];
      if (!actual || actual.kind !== "canonical" || native.$ !== "advicee_lifecycle_driver.CanonicalFrame")
        throw new TypeError("Notice scenario changed its original observation family");
      exact(fullSingle(native.before),actual.before.engine,`case ${caseIndex} frame ${index} before owner`);
      exact(fullSingle(native.after),actual.after.engine,`case ${caseIndex} frame ${index} after owner`);
      // Frame capsules are attached separately below; the common carrier keeps
      // complete queue/jobs, selected receipt, scopes and physical transitions.
      compareExpiryRuntime(native.runtime_before,actual.before,wrapped.before_capsules,`case ${caseIndex} frame ${index} before`);
      compareExpiryRuntime(native.runtime_after,actual.after,wrapped.after_capsules,`case ${caseIndex} frame ${index} after`);
      exact(native.time,actual.time,`case ${caseIndex} frame ${index} time`);
      exact(native.order,actual.scheduled.order,`case ${caseIndex} frame ${index} original order`);
      exact(maybe(native.provided),actual.scheduled.partition ?? 1,`case ${caseIndex} frame ${index} original provided scope`);
      exact(decodePrefixCanonicalEvent(native.event),encodeCanonicalEvent(actual.observation.event),`case ${caseIndex} frame ${index} event`);
      exact(fullSingle(native.result),readRecord(actual.transition).result,`case ${caseIndex} frame ${index} entire result`);
      exact(fullList(native.command_scopes).map(maybe),actual.observation.commandScopes,`case ${caseIndex} frame ${index} scopes`);
      exact(maybe(native.receipt),undefined,`case ${caseIndex} frame ${index} selected receipt`);
      exact(fullList(native.physical),[],`case ${caseIndex} frame ${index} physical transitions`);
      exact(diagnostic(wrapped.diagnostic),actual.observation.noticeDiagnostic ?? null,`case ${caseIndex} frame ${index} diagnostic`);
    }
    const suspend = source.checkpoints[0];
    if (!suspend || suspend.operation !== "control") throw new Error("missing original suspension checkpoint");
    exact(suspend.input,{ kind: "suspendArrivals", suspended: true },"original startup control");
    compareExpiryRuntime(startup.constructed,source.initial,startup.capsules,`case ${caseIndex} constructor`);
    compareExpiryRuntime(startup.suspended,suspend.after,startup.capsules,`case ${caseIndex} suspension`);
    const controls = frames.filter(frame => frame.$ === "expiry_observed_driver.Control");
    const actualControls = source.checkpoints.filter(frame => frame.operation === "control").slice(1);
    exact(controls.length,actualControls.length,`case ${caseIndex} control count`);
    let activeProfile: unknown = envelope.profile;
    for (const [index,control] of controls.entries()) {
      const actual = actualControls[index];
      if (!actual) throw new Error("missing original Notice control checkpoint");
      exact(originalControl(control.input),actual.input,`case ${caseIndex} control ${index} full input`);
      exact(readRecord(control.input).at,readRecord(readRecord(actual.before.engine).scheduler).now,`case ${caseIndex} control ${index} original clock`);
      exact(control.before_profile,activeProfile,`case ${caseIndex} control ${index} original profile`);
      const action = readRecord(readRecord(control.input).action);
      if (action.$ === "expiry_observed_driver.Profile") activeProfile = action.profile;
      exact(control.after_profile,activeProfile,`case ${caseIndex} control ${index} current profile`);
      compareExpiryRuntime(control.before,actual.before,control.before_capsules,`case ${caseIndex} control ${index} before`);
      compareExpiryRuntime(control.after,actual.after,control.after_capsules,`case ${caseIndex} control ${index} after`);
    }
    const boundaries = frames.filter(frame => frame.$ === "expiry_observed_driver.Boundary");
    const actualBoundaries = source.checkpoints.filter(frame => frame.operation === "advance");
    exact(boundaries.length,actualBoundaries.length,`case ${caseIndex} advance count`);
    for (const [index,boundary] of boundaries.entries()) {
      const actual = actualBoundaries[index];
      if (!actual) throw new Error("missing original Notice advance checkpoint");
      const input = readRecord(actual.input), result = readRecord(actual.result);
      exact([boundary.endpoint,boundary.budget,boundary.consumed],[input.untilTime,input.maxEvents,result.events],`case ${caseIndex} advance ${index} original budget/count`);
      compareExpiryRuntime(boundary.runtime,actual.after,boundary.capsules,`case ${caseIndex} advance ${index} full runtime`);
    }
    exact(trace.profile,activeProfile,`case ${caseIndex} retained profile`);
    exact(trace.consumed,source.boundary.eventCount,`case ${caseIndex} consumed accounting`);
    compareExpiryRuntime(trace.runtime,source.endpoint,trace.capsules,`case ${caseIndex} final full runtime`);
  }
}
