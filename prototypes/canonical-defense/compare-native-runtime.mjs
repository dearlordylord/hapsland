import assert from "node:assert/strict";
import { readBendList, readRecord, readNat } from "../../src/canonical/boundary-schema.ts";
import { decodeDriver, decodePreparedDriverContext, encodeDriverOutcome } from "../../packages/monkey-business/src/driver-codec.ts";
import { decodePrefixGraphEvent } from "../../packages/monkey-business/src/callback-native-codec.ts";
import { encodeCanonicalEvent } from "../../src/canonical/canonical-boundary.ts";
import { encodeImportGraphEvent } from "../../src/canonical/graph-adapter.ts";
import { doubleWords } from "../../packages/monkey-business/src/numeric-codec.ts";
import { JEV_OUTCOME_ORDER } from "../../packages/monkey-business/src/outcomes.ts";

const list = value => readBendList(value, value => value, 2048);
const one = value => { const values = list(value); assert.equal(values.length, 1); return readRecord(values[0]); };
const option = value => {
  const record = readRecord(value);
  if (record.$ === "None") return undefined;
  assert.equal(record.$, "Some");
  return record.value;
};
const sourceJob = value => {
  const job = readRecord(value);
  assert.equal(job.$, "Driver.SourceJob");
  return { partition: readNat(job.partition), lifetime: readNat(job.lifetime), bytes: readNat(job.bytes),
    units: list(job.units).map(readNat), outcome: job.outcome };
};
function compareJob(value, original, field) {
  const job = readRecord(value);
  assert.equal(job.$, "NativeRunTypes.Job");
  assert.ok(original, `${field} missing original active job`);
  assert.deepEqual([job.bytes,list(job.units),job.revision,job.repair,option(job.duration)],
    [original.bytes,original.unitBytes,original.revision ?? 0,original.repair ?? false,original.durationMs], `${field} full active input`);
  const source = option(job.source_job);
  assert.deepEqual(source === undefined ? undefined : sourceJob(source), original.driverSourceJob, `${field} immutable source`);
}
function compareContext(value, original, field) {
  const capsule = option(value);
  if (capsule === undefined) {
    assert.equal(original.driverContext, undefined, `${field} absent context`);
    assert.equal(original.driverOutcomeReceipt, undefined, `${field} absent outcome receipt`);
    return;
  }
  const record = readRecord(capsule);
  assert.equal(record.$, "NativeRunTypes.EmissionContext");
  decodePreparedDriverContext(record.context,record.receipt);
  assert.deepEqual(record.context,original.driverContext,`${field} prepared original context`);
  assert.deepEqual(record.receipt,original.driverOutcomeReceipt,`${field} prepared original receipt`);
}

/** Compare actual transport facts. Missing host-owned registries remain an error. */
export function compareNativeRuntime(value, original, field) {
  const runtime = readRecord(value), core = one(runtime.core), environment = readRecord(runtime.environment);
  assert.equal(runtime.valid,true,`${field} native validity`);
  assert.deepEqual(core,original.engine,`${field} entire Engine state`);
  assert.equal(runtime.next,original.order,`${field} next queue order`);
  assert.equal(runtime.count,original.eventCount,`${field} observation count`);
  assert.equal(environment.jev_delay,original.jevDelay,`${field} live Jev delay`);
  assert.deepEqual(environment.outcome,original.outcome === undefined ? { $: "None" } : { $: "Some", value: encodeDriverOutcome(original.outcome) },`${field} live outcome`);
  assert.deepEqual(list(environment.weights),JEV_OUTCOME_ORDER.map(kind => doubleWords(original.outcomeWeights[kind])),`${field} full outcome weights`);
  assert.deepEqual([environment.current_work,environment.credential_ready,environment.credential_generation,environment.source_readable],
    [original.environment.currentWork,original.environment.credentialReady,original.environment.credentialGeneration ?? 1,original.environment.sourceReadable ?? true],`${field} live environment`);
  assert.deepEqual([environment.output_delay,environment.output_lease],[original.outputProfile.delayMs,original.outputProfile.leaseMs],`${field} original output timing`);
  assert.equal(original.outputProfile.outcome,"certain",`${field} supported original output outcome`);
  const items = list(runtime.items).map(readRecord), scheduled = list(readRecord(core.scheduler).queue).map(readRecord);
  assert.equal(items.length,original.queue.length,`${field} full pending payload count`);
  const orders = new Set();
  for (const item of items) {
    const order = readNat(item.order);
    assert.ok(!orders.has(order),`${field} duplicate queue order`); orders.add(order);
    const publicItem = original.queue.find(value => value.order === order);
    assert.ok(publicItem,`${field} original queued payload ${order}`);
    const times = scheduled.filter(value => value.order === order);
    assert.equal(times.length,1,`${field} scheduler ownership ${order}`);
    assert.equal(times[0].at,publicItem.at,`${field} actual scheduled time ${order}`);
    const input = readRecord(item.input);
    if (input.$ === "NativeRunTypes.Event" || input.$ === "NativeRunTypes.FinishInput") {
      assert.ok(publicItem.driverAction,`${field} actual action ${order}`);
      assert.deepEqual(decodeDriver({ handled: true, actions: { $: "Con", head: input.action, tail: { $: "Nil" } } }).actions[0],publicItem.driverAction,`${field} complete action ${order}`);
      const active = option(input.job);
      if (active === undefined) assert.equal(publicItem.job,undefined,`${field} no active binding ${order}`);
      else compareJob(active,publicItem.job,`${field} active binding ${order}`);
      const source = input.$ === "NativeRunTypes.Event" ? option(input.source_job) : undefined;
      assert.deepEqual(source === undefined ? undefined : sourceJob(source),publicItem.driverSourceJob,`${field} source binding ${order}`);
      compareContext(input.context,publicItem,`${field} item ${order}`);
      assert.equal(input.$ === "NativeRunTypes.FinishInput" ? input.attempt : undefined,publicItem.finishAttempt,`${field} Finish attempt ${order}`);
    } else if (input.$ === "NativeRunTypes.Arrival") {
      assert.ok(publicItem.workloadSource,`${field} actual Workload emission ${order}`);
      const emission = readRecord(input.emission);
      assert.deepEqual({ ...emission, units: list(emission.units) },{ $: "Workload.Emission", ...publicItem.workloadSource },`${field} full arrival ${order}`);
      assert.equal(input.activity,publicItem.activityScope,`${field} original activity fence ${order}`);
    } else if (input.$ === "NativeRunTypes.GraphFact") {
      assert.equal(publicItem.input.kind,"preparationGraph",`${field} graph input kind ${order}`);
      const event = publicItem.input.event, key = readRecord(input.key);
      assert.deepEqual([key.partition,key.lifetime,key.round,key.operation,key.unit,input.position],
        [event.partition,event.lifetime,event.round,event.operation,event.unit,event.step],`${field} exact graph tuple ${order}`);
      assert.deepEqual(decodePrefixGraphEvent(input.fact),encodeImportGraphEvent(event.fact),`${field} complete graph fact ${order}`);
      assert.deepEqual(input.limits,event.graphLimits,`${field} graph limits ${order}`);
    } else if (input.$ === "NativeRunTypes.Edit") {
      assert.equal(publicItem.input.kind,"edit",`${field} retry kind ${order}`);
      compareJob(input.job,{ ...publicItem.input,driverSourceJob:publicItem.driverSourceJob },`${field} retry ${order}`);
    } else throw new Error(`${field} unsupported genuine queued family ${String(input.$)}; comparison must be implemented`);
  }
  const jobs = list(runtime.jobs).map(readRecord);
  assert.equal(jobs.length,original.jobs.length,`${field} full retained job count`);
  const operations = new Set();
  for (const stored of jobs) {
    assert.ok(!operations.has(stored.operation),`${field} duplicate retained job`); operations.add(stored.operation);
    compareJob(stored.job,original.jobs.find(([id]) => id === stored.operation)?.[1],`${field} retained ${stored.operation}`);
  }
  // The owner is adding these exact factual registries. Core Dispatch requests
  // are not host issuedRequests, and original callback facts alone omit payloads.
  for (const name of ["issuedRequests","retainedCallbacks","generatorPartitions"]) {
    assert.ok(Object.hasOwn(runtime,name),`${field} pending actual native ${name} owner registry`);
    assert.deepEqual(runtime[name],original[name],`${field} entire ${name}`);
  }
}

export function compareNativeFrames(values, publicFrames, field) {
  const frames = list(values).map(readRecord);
  const observed = publicFrames.filter(frame => frame.kind !== "callbackDelivery");
  assert.equal(frames.length,observed.length,`${field} all canonical/graph/registration observations`);
  for (const [index,frame] of frames.entries()) {
    const actual = observed[index], details = readRecord(frame.details), transition = readRecord(actual.transition);
    compareNativeRuntime(details.before,actual.before,`${field} frame ${index} before`);
    compareNativeRuntime(details.after,actual.after,`${field} frame ${index} after`);
    assert.equal(frame.time,actual.time,`${field} frame ${index} exact clock`);
    assert.equal(frame.sequence,actual.observation.sequence,`${field} frame ${index} sequence`);
    assert.deepEqual(one(details.transition_after),transition.state,`${field} frame ${index} raw transition Engine state`);
    assert.equal(option(details.provided),actual.scheduled.partition,`${field} frame ${index} original provided owner`);
    compareContext(details.source,actual.scheduled,`${field} frame ${index} original emitted context`);
    for (const prepared of list(details.prepared)) {
      const capsule = readRecord(prepared);
      decodePreparedDriverContext(capsule.context,capsule.receipt);
    }
    const physical = publicFrames.filter(value => value.kind === "callbackDelivery" && value.scheduled.order === actual.scheduled.order);
    assert.ok(physical.length <= 1,`${field} duplicate original delivery`);
    assert.deepEqual(option(details.receipt),physical[0]?.fact,`${field} exact original selected receipt`);
    assert.equal(list(details.physical).length,physical.length,`${field} attached physical count`);
    if (frame.$ === "NativeRunTypes.ProductFrame") {
      assert.equal(actual.kind,"canonical",`${field} original product observation family`);
      assert.deepEqual(one(frame.before),actual.before.engine.canonical,`${field} raw canonical before`);
      const result = readRecord(transition.result);
      assert.deepEqual(one(frame.after),result.state,`${field} raw canonical result`);
      assert.deepEqual(frame.event,actual.scheduled.input.kind === "canonical" ? encodeCanonicalEvent(actual.observation.event) : undefined,`${field} actual source event`);
      assert.deepEqual(list(frame.commands),result.$ === "Canonical.Advanced" ? list(result.commands) : [],`${field} entire original commands`);
      assert.deepEqual(option(frame.rejection),result.$ === "Canonical.Rejected" ? result.reason : undefined,`${field} exact rejection`);
      assert.deepEqual(list(details.command_scopes).map(value => option(value) ?? null),actual.observation.commandScopes,`${field} actual command scopes`);
    } else if (frame.$ === "NativeRunTypes.GraphFrame") {
      assert.equal(actual.kind,"preparation",`${field} original graph observation family`);
      const event = actual.observation.event, key = readRecord(frame.key), result = readRecord(transition.result);
      assert.deepEqual([key.partition,key.lifetime,key.round,key.operation,key.unit,frame.position],
        [event.partition,event.lifetime,event.round,event.operation,event.unit,event.step],`${field} full graph tuple`);
      assert.deepEqual(decodePrefixGraphEvent(frame.fact),encodeImportGraphEvent(event.fact),`${field} original graph event`);
      assert.deepEqual(one(frame.before),transition.before,`${field} raw graph before`);
      assert.deepEqual(one(frame.after),result.state,`${field} raw graph after`);
      assert.deepEqual(frame.command,result.command,`${field} complete graph command`);
      assert.deepEqual(list(details.command_scopes),[],`${field} graph emits no canonical scopes`);
    } else throw new Error(`${field} uncompared actual frame ${String(frame.$)}`);
  }
}
