import assert from "node:assert/strict";
import { readBendList, readRecord, readNat } from "../../src/canonical/boundary-schema.ts";
import { decodeDriver, decodePreparedDriverContext, encodeDriverOutcome } from "../../packages/monkey-business/src/driver-codec.ts";
import { decodePrefixGraphEvent } from "../../packages/monkey-business/src/callback-native-codec.ts";
import { encodeCanonicalEvent } from "../../src/canonical/canonical-boundary.ts";
import { encodeImportGraphEvent } from "../../src/canonical/graph-adapter.ts";
import { encodePreparationGraphLimits } from "../../packages/monkey-business/src/file-trees.ts";
import { doubleWords } from "../../packages/monkey-business/src/numeric-codec.ts";
import { decodeCallbackTarget } from "../../packages/monkey-business/src/callback-controls.ts";
import { decodeOutputCapture } from "../../packages/monkey-business/src/output-controls.ts";
import { decodeStopFound } from "../../packages/monkey-business/src/stop-codec.ts";
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

function nativeStopFinish(core, partition) {
  const state = readRecord(core), scenarios = readRecord(state.scenarios), stop = readRecord(scenarios.stop);
  const finish = list(stop.finishes).map(readRecord).find(value => value.partition === partition);
  return finish === undefined ? undefined : decodeStopFound({ $: "Some", value: finish });
}

function compareStopPayload(value, publicItem, core, field, order) {
    const input = readRecord(value), stopFact = publicItem.stopFact, capture = publicItem.stopCapture;
    assert.equal(input.$,"NativeRunTypes.FinishInput",`${field} Stop fact input ${order}`);
    assert.ok(stopFact,`${field} missing original Stop fact ${order}`);
    assert.ok(capture,`${field} missing original Stop capture ${order}`);
    assert.equal(publicItem.input.kind,"canonical",`${field} original Stop input kind ${order}`);
    assert.deepEqual(publicItem.input.event,stopFact.event,`${field} original Stop input event ${order}`);
    assert.equal(publicItem.input.at,stopFact.at,`${field} original Stop input time ${order}`);
    assert.equal(publicItem.at,stopFact.at,`${field} original Stop fact time ${order}`);
    assert.equal(publicItem.partition,capture.partition,`${field} original Stop partition ${order}`);
    assert.equal(publicItem.activityScope,capture.lifetime,`${field} original Stop activity scope ${order}`);
    assert.equal(publicItem.finishAttempt,capture.attempt,`${field} original Stop attempt ${order}`);
    for (const key of ["driverAction","driverContext","driverOutcomeReceipt","driverSourceJob","candidate","callbackReceipt","expiryAdvice","fitFinish","generated"])
      assert.equal(publicItem[key],undefined,`${field} unexpected Stop payload metadata ${key} ${order}`);

    const finish = nativeStopFinish(core,capture.partition);
    assert.ok(finish,`${field} native Stop registry lost original finish ${order}`);
    assert.deepEqual({ partition:capture.partition, lifetime:capture.lifetime, round:capture.round,
      attempt:capture.attempt, token:capture.token, started:capture.started, deadline:capture.cutoff },
      { partition:finish.partition, lifetime:finish.lifetime, round:finish.round,
        attempt:finish.attempt, token:finish.token, started:finish.started, deadline:finish.deadline },
      `${field} full original Stop capture ${order}`);

    const action = decodeDriver({ handled: true, actions: { $: "Con", head: input.action, tail: { $: "Nil" } } }).actions[0];
    const cutoffDelay = finish.deadline - finish.started;
    assert.ok(action.delay === 0 || action.delay === cutoffDelay,
      `${field} native Stop source delay ${order}`);
    if (action.delay === 0) assert.ok(publicItem.at >= finish.started,
      `${field} native Stop wake time ${order}`);
    else assert.equal(publicItem.at,finish.deadline,
      `${field} native Stop cutoff time ${order}`);
    assert.deepEqual(action,{ event:stopFact.event, delay:action.delay, job:false },
      `${field} original Stop source action ${order}`);
    const job = readRecord(input.job);
    assert.equal(job.$,"NativeRunTypes.Job",`${field} original Stop job ${order}`);
    assert.deepEqual([job.partition,job.lifetime,job.round,job.bytes,list(job.units),job.revision,job.repair,option(job.duration),option(job.source_job)],
      [capture.partition,capture.lifetime,capture.round,0,[],0,false,undefined,undefined],
      `${field} original Stop source job ${order}`);
    assert.equal(input.attempt,capture.attempt,`${field} original Stop input attempt ${order}`);
    compareContext(input.context,publicItem,`${field} Stop item ${order}`);
}

function compareFinishRegistration(frame, source, field) {
  assert.equal(source.kind,"finishRegistration",`${field} original registration kind`);
  assert.equal(source.registration.created,true,`${field} original registration created`);
  const finish = source.registration.finish;
  assert.ok(finish,`${field} original registration finish`);
  assert.equal(source.time,finish.started,`${field} original registration time`);

  assert.equal(frame.$,"NativeRunTypes.ProductFrame",`${field} native registration anchor family`);
  assert.equal(frame.time,source.time,`${field} native registration anchor time`);
  const details = readRecord(frame.details), core = one(details.before.core), consumed = option(details.consumed);
  const polls = source.after.queue.filter(item => item.partition === finish.partition &&
    item.finishAttempt === finish.attempt && item.input.kind === "canonical" &&
    item.input.event.kind === "stopPolled");
  const pollTimes = [...new Set([finish.started,finish.deadline])];
  assert.equal(polls.length,pollTimes.length,`${field} original registration poll count`);
  for (const at of pollTimes) {
    const matches = polls.filter(item => item.at === at);
    assert.equal(matches.length,1,`${field} original registration poll time ${at}`);
    const item = matches[0];
    assert.deepEqual(item.stopFact,{ at:item.at, event:item.input.event },`${field} original registration Stop fact ${at}`);
    assert.deepEqual(item.stopCapture,{ partition:finish.partition, lifetime:finish.lifetime, round:finish.round,
      attempt:finish.attempt, token:finish.token, started:finish.started, cutoff:finish.deadline },
      `${field} original registration Stop capture ${at}`);
    if (at === source.time) assert.deepEqual(frame.event,encodeCanonicalEvent(item.input.event),
      `${field} native registration first poll event`);
  }

  const firstPoll = polls.find(item => item.at === source.time);
  assert.ok(firstPoll,`${field} original registration first poll source`);
  assert.ok(consumed,`${field} native registration consumed source`);
  compareConsumed(consumed,firstPoll,`${field} native registration`,firstPoll.order,core);
  assert.deepEqual(nativeStopFinish(core,finish.partition),finish,
    `${field} native registered Stop`);
}

function compareFinishInputJob(value, publicItem, core, field, order, attempt) {
  const job = readRecord(value);
  assert.equal(job.$,"NativeRunTypes.Job",`${field} native Stop-owned active job ${order}`);
  const finish = nativeStopFinish(core,job.partition);
  assert.ok(finish,`${field} native Stop-owned active finish ${order}`);
  assert.equal(publicItem.partition,finish.partition,`${field} public Stop-owned active partition ${order}`);
  assert.equal(attempt,finish.attempt,`${field} public Stop-owned active attempt ${order}`);
  if (publicItem.finishAttempt !== undefined)
    assert.equal(publicItem.finishAttempt,finish.attempt,`${field} public Stop-owned finish attempt ${order}`);
  assert.equal(publicItem.job,undefined,`${field} unexpected public active job ${order}`);
  assert.deepEqual([job.partition,job.lifetime,job.round,job.bytes,list(job.units),job.revision,job.repair,option(job.duration),option(job.source_job)],
    [finish.partition,finish.lifetime,finish.round,0,[],0,false,undefined,undefined],
    `${field} native Stop-owned active job ${order}`);
}

function comparePayload(value, publicItem, field, order, core) {
    const input = readRecord(value);
    const supported = new Set(["input","at","order","driverAction","driverContext","driverOutcomeReceipt","driverSourceJob","stopFact","stopCapture","callbackReceipt","job","finishAttempt","expiryAdvice","generated","partition","candidate","activityScope","workloadSource"]);
    for (const key of Object.keys(publicItem)) assert.ok(supported.has(key),`${field} unimplemented original payload metadata ${key}`);
    if (input.$ === "NativeRunTypes.Event" || input.$ === "NativeRunTypes.FinishInput") {
      if (publicItem.stopFact) {
        compareStopPayload(value,publicItem,core,field,order);
        return;
      }
      assert.ok(publicItem.driverAction,`${field} actual action ${order}`);
      const actualAction = decodeDriver({ handled: true, actions: { $: "Con", head: input.action, tail: { $: "Nil" } } }).actions[0];
      assert.deepEqual(actualAction,publicItem.driverAction,`${field} complete action ${order}`);
      assert.equal(publicItem.input.kind,"canonical",`${field} original canonical input`);
      assert.deepEqual(input.action.event,encodeCanonicalEvent(publicItem.input.event),`${field} entire original event`);
      assert.equal(publicItem.input.at,publicItem.at,`${field} input time`);
      assert.equal(option(input.action.expiry_advice),publicItem.expiryAdvice,`${field} original expiry owner`);
      assert.equal(publicItem.generated,true,`${field} generated provenance`);
      const candidate = actualAction.candidate;
      assert.deepEqual(candidate,publicItem.candidate,`${field} entire candidate`);
      const context = option(input.context);
      const owner = candidate?.partition ?? (context === undefined
        ? actualAction.event.partition
        : readRecord(readRecord(context).context).partition);
      assert.ok(owner !== undefined,`${field} missing factual payload owner ${order}`);
      assert.equal(publicItem.partition,owner,`${field} original payload owner`);
      const active = input.$ === "NativeRunTypes.FinishInput" ? input.job : option(input.job);
      if (active === undefined) assert.equal(publicItem.job,undefined,`${field} no active binding ${order}`);
      else if (input.$ === "NativeRunTypes.FinishInput" && publicItem.job === undefined)
        compareFinishInputJob(active,publicItem,core,field,order,input.attempt);
      else compareJob(active,publicItem.job === undefined ? undefined : {
        ...publicItem.job,
        driverSourceJob: publicItem.job.driverSourceJob ?? publicItem.driverSourceJob,
      },`${field} active binding ${order}`);
      const source = input.$ === "NativeRunTypes.Event" ? option(input.source_job) : undefined;
      assert.deepEqual(source === undefined ? undefined : sourceJob(source),publicItem.driverSourceJob,`${field} source binding ${order}`);
      compareContext(input.context,publicItem,`${field} item ${order}`);
      if (input.$ === "NativeRunTypes.FinishInput" && publicItem.finishAttempt !== undefined)
        assert.equal(input.attempt,publicItem.finishAttempt,`${field} Finish attempt ${order}`);
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
      assert.deepEqual(input.limits,encodePreparationGraphLimits(event.graphLimits),`${field} graph limits ${order}`);
    } else if (input.$ === "NativeRunTypes.Edit") {
      assert.equal(publicItem.input.kind,"edit",`${field} retry kind ${order}`);
      compareJob(input.job,{ ...publicItem.input,driverSourceJob:publicItem.driverSourceJob },`${field} retry ${order}`);
    } else if (input.$ === "NativeRunTypes.CacheFact") {
      const fact = readRecord(input.fact);
      assert.ok(publicItem.cacheFact,`${field} actual cache fact ${order}`);
      assert.equal(publicItem.input.kind,"canonical",`${field} cache fact input ${order}`);
      assert.deepEqual(fact.event,encodeCanonicalEvent(publicItem.cacheFact.event),`${field} complete cache fact event ${order}`);
      assert.equal(publicItem.cacheFact.partition,publicItem.partition,`${field} cache fact owner ${order}`);
    } else throw new Error(`${field} unsupported genuine queued family ${String(input.$)}; comparison must be implemented`);
}

function compareConsumed(value, publicItem, field, order, core) {
  const consumed = readRecord(value);
  assert.equal(consumed.$,"NativeRunTypes.ConsumedInput",`${field} consumed source family`);
  assert.equal(consumed.order,publicItem.order,`${field} consumed source order`);
  const input = readRecord(consumed.input), delay = option(consumed.action_delay);
  if (input.$ === "NativeRunTypes.Event" || input.$ === "NativeRunTypes.FinishInput") {
    const action = decodeDriver({ handled: true, actions: { $: "Con", head: input.action, tail: { $: "Nil" } } }).actions[0];
    assert.equal(delay,action.delay,`${field} consumed source action delay`);
    if (publicItem.driverAction !== undefined)
      assert.equal(delay,publicItem.driverAction.delay,`${field} public source action delay`);
  } else {
    assert.equal(delay,undefined,`${field} non-action consumed source delay`);
  }
  comparePayload(consumed.input,publicItem,`${field} consumed source`,order,core);
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
  const profile = readRecord(environment.output_profile);
  assert.equal(profile.outcome.$,`OutputScenario.${original.outputProfile.outcome[0].toUpperCase()}${original.outputProfile.outcome.slice(1)}`,`${field} live output outcome`);
  assert.equal(option(profile.candidate_bytes),undefined,`${field} original candidate byte profile`);
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
    comparePayload(item.input,publicItem,`${field} item ${order}`,order,core);
  }
  const jobs = list(runtime.jobs).map(readRecord);
  assert.equal(jobs.length,original.jobs.length,`${field} full retained job count`);
  const operations = new Set();
  for (const stored of jobs) {
    assert.ok(!operations.has(stored.operation),`${field} duplicate retained job`); operations.add(stored.operation);
    compareJob(stored.job,original.jobs.find(([id]) => id === stored.operation)?.[1],`${field} retained ${stored.operation}`);
  }
  const host = readRecord(runtime.host);
  assert.equal(host.$,"NativeRunTypes.HostFacts");
  assert.deepEqual(list(host.generator_partitions),original.generatorPartitions,`${field} original generator registry`);
  const issued = list(host.issued_requests).map(readRecord);
  assert.equal(issued.length,original.issuedRequests.length,`${field} issued request count`);
  assert.deepEqual(issued.map(entry => {
    const command = readRecord(entry.command);
    assert.equal(command.$,"Canonical.JevRequestIssued");
    assert.equal(entry.request,command.request);
    return [entry.request,{ kind:"jevRequestIssued",partition:command.partition,lifetime:command.lifetime,
      round:command.round,operation:command.operation,request:command.request }];
  }),original.issuedRequests,`${field} entire original issued requests`);
  const retained = list(host.retained_callbacks).map(readRecord);
  assert.equal(retained.length,original.retainedCallbacks.length,`${field} retained callback count`);
  const retainedOrders = new Set();
  for (const callback of retained) {
    assert.ok(!retainedOrders.has(callback.order),`${field} duplicate retained callback`);
    retainedOrders.add(callback.order);
    const originalCallback = original.retainedCallbacks.find(value => value.order === callback.order);
    assert.ok(originalCallback,`${field} original retained callback ${callback.order}`);
    assert.deepEqual(callback.fact,originalCallback.fact,`${field} entire retained fact ${callback.order}`);
    const fact = readRecord(callback.fact), completion = option(fact.completion);
    assert.deepEqual({ target:decodeCallbackTarget(fact.target),issuedAt:callback.issued_at,dueAt:callback.due_at,
      ...(completion === undefined ? {} : { outputCapture:decodeOutputCapture(completion) }) },
      originalCallback.receipt,`${field} original retained receipt ${callback.order}`);
    assert.equal(originalCallback.payload.order,callback.order);
    assert.equal(originalCallback.payload.at,callback.due_at);
    assert.deepEqual(originalCallback.payload.callbackReceipt,originalCallback.receipt);
    comparePayload(callback.payload,originalCallback.payload,`${field} retained payload ${callback.order}`,callback.order,core);
  }
}

export function compareNativeFrames(values, publicFrames, field) {
  const frames = list(values).map(readRecord);
  const observed = publicFrames.filter(frame => frame.kind !== "callbackDelivery");
  const comparable = observed.filter(frame => frame.kind !== "finishRegistration");
  assert.equal(frames.length,comparable.length,`${field} all canonical/graph observations`);
  const nativeByPublic = new Map(comparable.map((frame,index) => [frame,frames[index]]));
  for (const [index,frame] of frames.entries()) {
    const actual = comparable[index], details = readRecord(frame.details), transition = readRecord(actual.transition), core = one(details.before.core);
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
    const attached = list(details.physical).map(readRecord);
    assert.equal(attached.length,physical.length,`${field} attached physical count`);
    for (const [deliveryIndex,delivery] of attached.entries()) {
      assert.equal(delivery.$,"NativeRunTypes.PhysicalDelivery");
      const original = physical[deliveryIndex];
      compareNativeRuntime(delivery.before,original.before,`${field} frame ${index} physical ${deliveryIndex} before`);
      compareNativeRuntime(delivery.after,original.after,`${field} frame ${index} physical ${deliveryIndex} after`);
      assert.deepEqual(delivery.action,original.delivery,`${field} frame ${index} physical ${deliveryIndex} entire original action`);
    }
    const consumed = option(details.consumed);
    if (actual.kind === "sharing") {
      assert.equal(consumed,undefined,`${field} frame ${index} sharing leaves source queued`);
    } else {
      assert.ok(consumed,`${field} frame ${index} missing consumed source`);
      compareConsumed(consumed,physical[0]?.scheduled ?? actual.scheduled,`${field} frame ${index}`,actual.scheduled.order,core);
    }
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
  for (const [index,actual] of observed.entries()) {
    if (actual.kind !== "finishRegistration") continue;
    const next = observed[index + 1];
    assert.equal(next?.kind,"canonical",`${field} registration ${index} immediate Stop observation`);
    const anchor = nativeByPublic.get(next);
    assert.ok(anchor,`${field} registration ${index} native anchor`);
    compareFinishRegistration(anchor,actual,`${field} registration ${index}`);
  }
}
