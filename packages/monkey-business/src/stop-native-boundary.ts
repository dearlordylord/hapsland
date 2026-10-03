import { isDeepStrictEqual } from "node:util";
import { encodeCanonicalEvent } from "../../../src/canonical/canonical-boundary.ts";
import { readBendList, readRecord, readNat, readBool } from "../../../src/canonical/boundary-schema.ts";
import { decodePrefixCanonicalEvent, decodePrefixGraphEvent } from "./callback-native-codec.ts";
import { decodeStopFound } from "./stop-codec.ts";
import { decodeDriver, encodeDriverOutcome } from "./driver-codec.ts";
import type { originalWaitingStopPublic } from "./stop-original-public.fixture.ts";
import type { RunRuntimeSnapshot, RunStructuralFrame } from "./index.ts";

const list = (value: unknown) => readBendList(value, value => value, 2048);
function single(value: unknown): Record<string, unknown> {
  const values = list(value);
  if (values.length !== 1) throw new TypeError("Stop observer requires an actual singleton snapshot");
  return readRecord(values[0]);
}
function same(actual: unknown, expected: unknown, field: string): void {
  if (!isDeepStrictEqual(actual, expected)) throw new Error(`Stop observer differs at ${field}`);
}
function optional(value: unknown): unknown {
  const record = readRecord(value);
  if (record.$ === "None") return undefined;
  if (record.$ !== "Some") throw new TypeError("malformed original receipt");
  return record.value;
}

function nativeAction(value: unknown) {
  return decodeDriver({ handled: true, actions: { $: "Con", head: value, tail: { $: "Nil" } } }).actions[0];
}
function compareJob(value: unknown, source: RunRuntimeSnapshot["jobs"][number][1] | undefined,
    context: unknown, field: string, captured?: RunRuntimeSnapshot["queue"][number]["driverSourceJob"]): void {
  const job = readRecord(value);
  if (job.$ !== "advicee_lifecycle_driver.Job") throw new TypeError("missing actual native source job");
  if (captured) {
    same([readNat(job.partition),readNat(job.lifetime),readNat(job.bytes),list(job.units),job.outcome],
      [captured.partition,captured.lifetime,captured.bytes,captured.units,captured.outcome], `${field} full captured source job`);
    return;
  }
  const facts = readRecord(context);
  same(readNat(job.partition), facts.partition, `${field} partition`);
  same(readNat(job.lifetime), facts.lifetime, `${field} lifetime`);
  same(readNat(job.bytes), source?.bytes ?? facts.bytes, `${field} bytes`);
  same(list(job.units), source?.unitBytes ?? [], `${field} units`);
  same(job.outcome, facts.outcome, `${field} captured outcome`);
}

/** Transport representations differ, but every pending native item must match
 * an actual public slot. Relative delays and inactive candidates come from
 * enqueue metadata, never subtraction from a later endpoint. */
function compareRuntime(value: unknown, source: RunRuntimeSnapshot, field: string): void {
  const runtime = single(value), queue = readRecord(runtime.queue);
  same(runtime.state, source.engine, `${field} full engine`);
  same(readNat(runtime.delay), source.jevDelay, `${field} original Jev delay`);
  same(readNat(queue.sequence), source.order, `${field} next queued identity`);
  const pending = list(queue.items).map(readRecord);
  same(pending.length, source.queue.length, `${field} pending item count`);
  const seen = new Set<number>();
  for (const item of pending) {
    const order = readNat(item.order);
    if (seen.has(order)) throw new TypeError("duplicate native queued order");
    seen.add(order);
    const publicItem = source.queue.find(candidate => candidate.order === order);
    if (!publicItem) throw new Error(`${field} loses queued order ${order}`);
    same(readNat(item.at), publicItem.at, `${field} item ${order} original time`);
    const input = readRecord(item.input);
    if (input.$ === "advicee_lifecycle_driver.Event" || input.$ === "advicee_lifecycle_driver.FitEvent") {
      if (publicItem.input.kind !== "canonical") throw new Error("queued Driver action changed input kind");
      if (publicItem.stopFact && publicItem.stopCapture) {
        // Checked Stop.Fact is the original enqueue source; this is the same
        // factual immediate-action representation used by stop_fact_queue.
        same(nativeAction(input.action), { event: publicItem.stopFact.event, delay: 0, job: false }, `${field} item ${order} original Stop fact action`);
        const job = readRecord(input.job), capture = publicItem.stopCapture;
        same([job.partition,job.lifetime,job.bytes,list(job.units),job.outcome],
          [capture.partition,capture.lifetime,0,[],encodeDriverOutcome("neverSent")], `${field} item ${order} original Stop source tuple`);
        same(readNat(publicItem.stopFact.at), publicItem.at, `${field} item ${order} checked Stop fact time`);
      } else {
        if (!publicItem.driverAction) throw new Error("missing actual public queued Driver action");
        same(nativeAction(input.action), publicItem.driverAction, `${field} item ${order} full action`);
        compareJob(input.job, publicItem.job, publicItem.driverContext, `${field} item ${order} source job`, publicItem.driverSourceJob);
      }
      same(input.$ === "advicee_lifecycle_driver.FitEvent" ? readNat(input.attempt) : undefined,
        publicItem.fitFinish, `${field} item ${order} original fit attempt`);
    } else if (input.$ === "advicee_lifecycle_driver.Fact") {
      if (publicItem.input.kind !== "preparationGraph") throw new Error("native graph fact changed public input kind");
      const event = publicItem.input.event;
      same([input.partition,input.lifetime,input.round,input.operation,input.position],
        [event.partition,event.lifetime,event.round,event.operation,event.step], `${field} item ${order} graph tuple`);
      same(decodePrefixGraphEvent(input.event), event.fact, `${field} item ${order} full graph event`);
    } else if (input.$ === "advicee_lifecycle_driver.FinishIntent") {
      if (publicItem.input.kind !== "finish") throw new Error("native Finish intent changed public input kind");
      const lifecycle = list(readRecord(source.engine).lifecycles).map(readRecord).find(entry => entry.partition === input.partition);
      if (!lifecycle) throw new Error("original Stop intent has no actual advicee allocation");
      same(readNat(input.started), publicItem.input.at, `${field} item ${order} original Stop start`);
      same(readBool(input.recurring), ("recurring" in publicItem.input ? publicItem.input.recurring : false), `${field} item ${order} original recurrence`);
      // Cutoff is compared against the separately frozen original input;
      // full registration/capture comparisons preserve its actual owner value.
      same(readNat(input.cutoff), publicItem.input.at + 8, `${field} item ${order} original cutoff`);
    } else if (input.$ === "advicee_lifecycle_driver.Edit") {
      if (publicItem.input.kind !== "edit") throw new Error("native original edit changed public input kind");
      const job = readRecord(input.job);
      const lifecycle = list(readRecord(source.engine).lifecycles).map(readRecord).find(entry => entry.partition === job.partition);
      if (!lifecycle) throw new Error("original edit has no actual advicee allocation");
      same(job.lifetime, lifecycle.lifetime, `${field} item ${order} original lifetime`);
      same(job.bytes, publicItem.input.bytes, `${field} item ${order} original bytes`);
      same(list(job.units), publicItem.input.unitBytes, `${field} item ${order} original units`);
      same(job.outcome, encodeDriverOutcome("clear"), `${field} item ${order} frozen original outcome`);
    } else throw new TypeError(`uncompared Stop queued input ${String(input.$)}`);
  }
  const lifecycles = list(readRecord(source.engine).lifecycles).map(readRecord);
  const jobs = list(runtime.jobs).map(readRecord);
  same(jobs.length, source.jobs.length, `${field} retained source job count`);
  for (const retained of jobs) {
    const operation = readNat(retained.operation);
    const original = source.jobs.find(([id]) => id === operation)?.[1];
    if (!original) throw new Error(`${field} loses original job ${operation}`);
    const job = readRecord(retained.job);
    const lifecycle = lifecycles.find(entry => entry.partition === job.partition);
    if (!lifecycle) throw new Error(`${field} retained source job has no actual advicee`);
    same(job.lifetime, lifecycle.lifetime, `${field} job ${operation} lifetime`);
    same(job.bytes, original.bytes, `${field} job ${operation} bytes`);
    same(list(job.units), original.unitBytes, `${field} job ${operation} units`);
    same(job.outcome, encodeDriverOutcome("clear"), `${field} job ${operation} original outcome`);
  }
}

/** Compare actual observer owner midpoints. Queue/job transport and boundary
 * accounting are separate required comparisons; this function alone is not
 * a full Stop conformance gate. No midpoint is reconstructed from endpoints. */
export function compareStopObservedOwners(nativeFrames: readonly unknown[], publicFrames: readonly RunStructuralFrame[]): void {
  const observed = nativeFrames.map(readRecord).filter(frame => frame.$ === "stop_observed_wire.Observed");
  const actual = publicFrames.filter(frame => frame.kind !== "callbackDelivery");
  same(observed.length, actual.length, "observed frame count");
  for (const [index, wire] of observed.entries()) {
    const source = actual[index];
    if (!source) throw new Error("missing actual public Stop frame");
    const frame = readRecord(wire.frame);
    const before = single(frame.runtime_before), after = single(frame.runtime_after);
    compareRuntime(frame.runtime_before, source.before, `frame ${index} runtime before`);
    compareRuntime(frame.runtime_after, source.after, `frame ${index} runtime after`);
    same(before.state, source.before.engine, `frame ${index} full engine before`);
    same(after.state, source.after.engine, `frame ${index} full engine after`);
    same(single(frame.before), source.before.engine, `frame ${index} original before`);
    same(single(frame.after), source.after.engine, `frame ${index} original after`);
    same(readNat(frame.time), source.time, `frame ${index} time`);
    same(readNat(frame.order), source.scheduled.order, `frame ${index} original order`);
    const physical = publicFrames.filter(value => value.kind === "callbackDelivery" && value.scheduled.order === source.scheduled.order);
    if (physical.length > 1) throw new Error("duplicate original physical delivery record");
    const delivered = physical[0];
    same(optional(frame.receipt), delivered?.kind === "callbackDelivery" ? delivered.fact : undefined, `frame ${index} original selected fact`);
    const deliveries = list(frame.physical);
    same(deliveries.length, physical.length, `frame ${index} physical delivery count`);
    if (delivered?.kind === "callbackDelivery") {
      const delivery = readRecord(deliveries[0]);
      if (delivery.$ !== "advicee_lifecycle_driver.PhysicalDelivery") throw new TypeError("missing actual native physical transition");
      compareRuntime(delivery.before, delivered.before, `frame ${index} physical before`);
      compareRuntime(delivery.after, delivered.after, `frame ${index} physical after`);
      same(delivery.action, delivered.delivery, `frame ${index} actual output delivery action`);
      same(delivered.scheduled.order, source.scheduled.order, `frame ${index} physical selected order`);
      same(delivered.scheduled.at, source.scheduled.at, `frame ${index} physical original timestamp`);
    }
    if (frame.$ === "advicee_lifecycle_driver.FinishFrame") {
      if (source.kind !== "finishRegistration") throw new Error("Stop registration changed observation kind");
      same(decodeStopFound(frame.finish), source.registration.finish, `frame ${index} registered capture`);
      same(readBool(frame.created), source.registration.created, `frame ${index} registration result`);
      continue;
    }
    if (source.kind === "finishRegistration") throw new Error("canonical observation became registration");
    const transition = readRecord(source.transition);
    if (frame.$ === "advicee_lifecycle_driver.GraphFrame") {
      same(single(frame.result), transition, `frame ${index} full graph transition`);
    } else if (frame.$ === "advicee_lifecycle_driver.CanonicalFrame" || frame.$ === "advicee_lifecycle_driver.CacheFrame") {
      if (source.observation.event.kind === "preparationGraph") throw new Error("canonical frame changed original graph event kind");
      same(single(frame.result), transition.result, `frame ${index} full canonical result`);
      same(decodePrefixCanonicalEvent(frame.event), encodeCanonicalEvent(source.observation.event), `frame ${index} original event`);
      same(list(frame.command_scopes).map(optional), source.observation.commandScopes, `frame ${index} actual command scopes`);
      if (frame.$ === "advicee_lifecycle_driver.CacheFrame") same(frame.fact, source.source, `frame ${index} original cache fact`);
    } else throw new TypeError("unsupported full Stop observer constructor");
  }
}


export function compareOriginalWaitingStopTrace(value: unknown,
    expected: ReturnType<typeof originalWaitingStopPublic>): void {
  const envelope = single(value);
  if (envelope.$ !== "stop_observed_wire.Envelope") throw new TypeError("wrong Stop family envelope");
  const traces = list(envelope.traces);
  if (traces.length !== 1) throw new TypeError("original Stop root changed scenario count");
  const trace = readRecord(traces[0]);
  if (trace.$ !== "stop_observed_wire.Trace" || !readBool(trace.valid)) throw new TypeError("invalid original Stop factual transport");
  const frames = list(trace.frames).map(readRecord);
  for (const frame of frames) if (!["stop_observed_wire.Observed", "stop_observed_wire.Boundary"].includes(String(frame.$)))
    throw new TypeError("uncompared Stop transport frame");
  compareStopObservedOwners(frames, expected.frames);
  const boundaries = frames.filter(frame => frame.$ === "stop_observed_wire.Boundary");
  same(boundaries.length, expected.boundaries.length, "original Stop boundary count");
  for (const [index, frame] of boundaries.entries()) {
    const input = readRecord(frame.input), original = expected.boundaries[index];
    if (!original || input.$ !== "stop_original_inputs.Advance") throw new TypeError("wrong original Stop boundary");
    same([input.endpoint,input.budget,frame.consumed], [original.endpoint,original.budget,original.consumed], `boundary ${index} original budget/count`);
    compareRuntime(frame.runtime, original.runtime, `boundary ${index} full runtime`);
  }
  compareRuntime(trace.endpoint, expected.endpoint, "final actual Stop runtime");
}
