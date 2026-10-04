import { decodeOutputCapture } from "./output-controls.ts";
import { encodeImportGraphEvent } from "../../../src/canonical/graph-adapter.ts";
import { isDeepStrictEqual } from "node:util";
import { encodeCanonicalEvent } from "../../../src/canonical/canonical-boundary.ts";
import { readBendList, readRecord, readNat, readBool } from "../../../src/canonical/boundary-schema.ts";
import { decodePrefixCanonicalEvent, decodePrefixGraphEvent } from "./callback-native-codec.ts";
import { decodeStopFound } from "./stop-codec.ts";
import { decodeDriver, decodePreparedDriverContext, encodeDriverAction, encodeDriverOutcome, type DriverAction } from "./driver-codec.ts";
import SharedEngine from "../../monkey-business-bend/engine.mjs";
import type { originalWaitingStopPublic, originalStopPublicCases, originalStopOutputPublicCases } from "./stop-original-public.fixture.ts";
import type { RunRuntimeSnapshot, RunStructuralFrame, RunConfig } from "./index.ts";

const list = (value: unknown) => readBendList(value, value => value, 2048);
type StopRuntimePremise = {
  readonly input: RunConfig;
  readonly agentScopes: ReturnType<typeof originalWaitingStopPublic>["agentScopes"];
  readonly frozenInput?: unknown;
};
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

function originalFinishWait(config: RunConfig): number {
  if (config.finishDeadline === undefined) throw new TypeError("original Stop input must declare its finish wait");
  return config.finishDeadline;
}

function nativeAction(value: unknown) {
  return decodeDriver({ handled: true, actions: { $: "Con", head: value, tail: { $: "Nil" } } }).actions[0];
}
function compareRawInputJob(value: unknown, publicItem: RunRuntimeSnapshot["queue"][number],
    premise: StopRuntimePremise, field: string): void {
  const job = readRecord(value);
  if (job.$ !== "advicee_lifecycle_driver.NoJob") throw new TypeError(`${field} raw input has a genuine source job`);
  same(Object.keys(job).sort(), ["$", "lifetime", "partition"], `${field} exact RawInput no-job shape`);

  if (premise.frozenInput === undefined) throw new TypeError(`${field} lacks the exact frozen RawInput declaration`);
  const scenario = readRecord(premise.frozenInput);
  const event = publicItem.input.kind === "canonical" ? publicItem.input.event : undefined;
  if (!event) throw new TypeError(`${field} public input is not the frozen canonical schedule`);
  const encodedEvent = encodeCanonicalEvent(event);
  const matchingSchedules = list(scenario.boundaries).map(readRecord).filter(boundary => {
    if (boundary.$ !== "stop_original_inputs.Schedule") return false;
    const scheduled = readRecord(boundary.input);
    return scheduled.$ === "stop_original_inputs.CanonicalInput"
      && readNat(scheduled.at) === publicItem.at
      && isDeepStrictEqual(decodePrefixCanonicalEvent(scheduled.event), encodedEvent);
  });
  if (matchingSchedules.length !== 1) throw new TypeError(`${field} lacks one exact frozen original Schedule declaration`);

  // Initial's raw Schedule path uses the Driver owner's direct event scope;
  // StopGroupPolled/Ended name that owner by group. This is grounded in the
  // original scheduled event and the startup registry, never a later runtime.
  const partition = event.kind === "stopGroupPolled" || event.kind === "stopGroupEnded"
    ? event.group
    : "partition" in event ? event.partition : undefined;
  const declaredOwners = partition === undefined ? [] : premise.agentScopes.filter(scope => scope.partition === partition);
  if (partition === undefined || declaredOwners.length !== 1)
    throw new TypeError(`${field} frozen RawInput has no uniquely declared direct owner scope`);
  if (!("lifetime" in event)) throw new TypeError(`${field} frozen RawInput has no original lifetime`);
  same([readNat(job.partition), readNat(job.lifetime)], [partition, event.lifetime], `${field} frozen RawInput owner scope`);
}
function compareJob(value: unknown, captured: RunRuntimeSnapshot["queue"][number]["driverSourceJob"], field: string): void {
  const job = readRecord(value);
  if (job.$ !== "advicee_lifecycle_driver.Job" || captured === undefined) throw new TypeError(`${field} lacks genuine source job`);
  same([readNat(job.partition),readNat(job.lifetime),readNat(job.bytes),list(job.units),job.outcome],
    [captured.partition,captured.lifetime,captured.bytes,captured.units,captured.outcome], `${field} full original source job`);
}
function compareEmission(value: unknown, source: RunRuntimeSnapshot["queue"][number], field: string): void {
  const emission = optional(value);
  if (emission === undefined) {
    same(source.driverContext,undefined,`${field} unprepared context`);
    same(source.driverOutcomeReceipt,undefined,`${field} unprepared outcome receipt`);
    return;
  }
  const raw = readRecord(emission);
  if (raw.$ !== "advicee_lifecycle_driver.EmissionContext") throw new TypeError("invalid genuine Driver emission capsule");
  const decoded=decodePreparedDriverContext(raw.context,raw.receipt);
  same(decoded.context,source.driverContext,`${field} actual command context`);
  same(decoded.receipt,source.driverOutcomeReceipt,`${field} actual selected outcome receipt`);
}

/** A failed individual release has a real public scheduled action but may carry
 * no public Driver context or source job. Its routing scope comes from that
 * same detached engine snapshot and the matching live release lease. */
function failedIndividualReleaseScope(event: DriverAction["event"],
    source: RunRuntimeSnapshot, publicItem: RunRuntimeSnapshot["queue"][number], premise: StopRuntimePremise,
    field: string): { readonly partition: number; readonly lifetime: number } | undefined {
  const failedProfile = premise.input.outputProfile?.outcome === "failed" || source.outputProfile.outcome === "failed";
  const publicEvent = publicItem.input.kind === "canonical" ? publicItem.input.event : undefined;
  if (event.kind !== "submissionRelease" && event.kind !== "collectionReleaseLease") return undefined;
  if (!failedProfile || !publicEvent || publicEvent.kind !== event.kind ||
      publicItem.driverContext !== undefined ||
      publicItem.driverSourceJob !== undefined || publicItem.driverOutcomeReceipt !== undefined ||
      publicItem.callbackReceipt !== undefined || publicItem.generated !== true || !publicItem.driverAction ||
      publicItem.driverAction.job !== false || publicItem.driverAction.event.kind !== event.kind) return undefined;

  const partition = publicItem.partition;
  if (partition === undefined || !Number.isSafeInteger(partition) || partition < 0)
    throw new TypeError(`${field} failed individual release has no actual public owner partition`);
  const owners = premise.agentScopes.filter(scope => scope.partition === partition);
  same(owners.length, 1, `${field} failed individual release unique declared owner`);

  const encodedActivity = optional(SharedEngine.activity_scope(source.engine, BigInt(partition)));
  if (encodedActivity === undefined || publicItem.activityScope === undefined)
    throw new TypeError(`${field} failed individual release lacks its actual activity fence`);
  same(readNat(encodedActivity), publicItem.activityScope, `${field} failed individual release actual activity fence`);

  const advice = readNat(event.advice), token = readNat(event.token);
  const canonical = readRecord(SharedEngine.canonical(source.engine));
  const rounds = list(canonical.rounds).map(readRecord).filter(round => readNat(round.partition) === partition);
  same(rounds.length, 1, `${field} failed individual release active owner round`);
  const round = rounds[0]!;
  const lifetime = SharedEngine.activity_lifetime(source.engine, BigInt(partition));
  same(readNat(round.lifetime), lifetime, `${field} failed individual release core lifetime`);

  const collection = readRecord(canonical.collection);
  const collectionLeases = list(collection.leases).map(readRecord).filter(lease => readNat(lease.advice) === advice);
  same(collectionLeases.length, 1, `${field} failed individual release collection lease owner`);
  same(readNat(collectionLeases[0]!.owner), token, `${field} failed individual release collection lease token`);

  const delivery = readRecord(collection.delivery);
  const submissions = readRecord(delivery.submissions);
  const batches = list(submissions.batches).map(readRecord)
    .filter(batch => readNat(batch.advice) === advice && readNat(batch.token) === token);
  const submissionLeases = list(submissions.leases).map(readRecord)
    .filter(lease => readNat(lease.advice) === advice);
  const verifyActiveStopBatch = () => {
    same(batches.length, 1, `${field} failed individual release active Stop batch`);
    const batch = batches[0]!;
    same(batch.surface, { $: "Handoff.Stop" }, `${field} failed individual release Stop surface`);
    same(readNat(batch.round), readNat(round.id), `${field} failed individual release batch round`);
    same(readRecord(batch.phase).$, "Delivery.Reserved", `${field} failed individual release active batch phase`);
    same(submissionLeases.length, 1, `${field} failed individual release submission lease`);
    const current = readRecord(submissionLeases[0]!.current);
    same([readNat(current.round), current.closed], [readNat(round.id), false], `${field} failed individual release current lease round`);
    const phase = readRecord(current.phase);
    same([phase.$, readNat(phase.token), phase.surface], ["Handoff.Reserved", token, { $: "Handoff.Stop" }],
      `${field} failed individual release current Stop lease`);
  };
  if (event.kind === "submissionRelease") verifyActiveStopBatch();
  else if (batches.length === 0)
    same(submissionLeases.length, 0, `${field} collection release follows consumed Stop batch`);
  else verifyActiveStopBatch();
  return { partition, lifetime };
}

/** No complete public capsule exists for these authentic emitted actions.
 * Compare only the native routing identity used by the release and grounded
 * in the matching public source snapshot; other private context fields have
 * no public counterpart and are not claimed as parity. */
function compareFailedIndividualReleaseEmission(value: unknown, source: RunRuntimeSnapshot["queue"][number],
    scope: { readonly partition: number; readonly lifetime: number }, field: string): void {
  same(source.driverContext, undefined, `${field} absent original public Driver context`);
  const emission = optional(value);
  if (emission === undefined) return;
  const raw = readRecord(emission);
  if (raw.$ !== "advicee_lifecycle_driver.EmissionContext") throw new TypeError("invalid genuine Driver emission capsule");
  const decoded = decodePreparedDriverContext(raw.context, raw.receipt);
  same([decoded.context.partition, decoded.context.lifetime], [scope.partition, scope.lifetime],
    `${field} failed individual release native routing identity`);
}

/** Transport representations differ, but every pending native item must match
 * an actual public slot. Relative delays and inactive candidates come from
 * enqueue metadata, never subtraction from a later endpoint. */
function compareRuntime(value: unknown, source: RunRuntimeSnapshot, field: string, premise: StopRuntimePremise): void {
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
      let failedReleaseScope: { readonly partition: number; readonly lifetime: number } | undefined;
      const issuance = readRecord(input.issuance);
      if (issuance.$ === "advicee_lifecycle_driver.RawInput") {
        if (input.$ !== "advicee_lifecycle_driver.Event") throw new TypeError(`${field} RawInput must remain an initial Event`);
        const expectedAction: DriverAction = { event: publicItem.input.event, delay: 0, job: false };
        same(nativeAction(input.action), expectedAction, `${field} item ${order} exact immediate RawInput action`);
        same(input.action, encodeDriverAction(expectedAction), `${field} item ${order} exact RawInput Driver transport`);
        same(issuance, { $: "advicee_lifecycle_driver.RawInput" }, `${field} item ${order} exact RawInput provenance`);
        same(input.context, { $: "None" }, `${field} item ${order} absent RawInput emission context`);
        compareRawInputJob(input.job, publicItem, premise, `${field} item ${order}`);
        same(publicItem.input.at, publicItem.at, `${field} item ${order} frozen schedule time`);
        same(Object.keys(publicItem).filter(key => ["driverAction", "driverContext", "driverOutcomeReceipt", "driverSourceJob",
          "callbackReceipt", "job", "stopFact", "stopCapture", "fitFinish", "expiryAdvice", "candidate", "generated"]
          .includes(key)), [], `${field} item ${order} absent public Driver/callback metadata`);
      } else if (publicItem.stopFact && publicItem.stopCapture) {
        // Checked Stop.Fact is the original enqueue source; this is the same
        // factual immediate-action representation used by stop_fact_queue.
        same(nativeAction(input.action), { event: publicItem.stopFact.event, delay: 0, job: false }, `${field} item ${order} original Stop fact action`);
        const job = readRecord(input.job), capture = publicItem.stopCapture;
        same(job.$,"advicee_lifecycle_driver.NoJob",`${field} item ${order} absent Stop job`);
        same([job.partition,job.lifetime],[capture.partition,capture.lifetime],`${field} item ${order} original Stop source scope`);
        same(publicItem.driverSourceJob,undefined,`${field} item ${order} absent original source job`);
        same(readNat(publicItem.stopFact.at), publicItem.at, `${field} item ${order} checked Stop fact time`);
      } else {
        if (!publicItem.driverAction) throw new Error("missing actual public queued Driver action");
        same(nativeAction(input.action), publicItem.driverAction, `${field} item ${order} full action`);
        const job=readRecord(input.job);
        if (job.$ === "advicee_lifecycle_driver.NoJob") {
          same(publicItem.driverSourceJob,undefined,`${field} item ${order} absent original source job`);
          const event=publicItem.driverAction.event;
          const context=publicItem.driverContext === undefined ? undefined : readRecord(publicItem.driverContext);
          if (context) same([job.partition,job.lifetime],[readNat(context.partition),readNat(context.lifetime)],`${field} item ${order} captured no-job command scope`);
          else if ("partition" in event && "lifetime" in event)
            same([job.partition,job.lifetime],[event.partition,event.lifetime],`${field} item ${order} original no-job scope`);
          else {
            failedReleaseScope = failedIndividualReleaseScope(event, source, publicItem, premise, `${field} item ${order}`);
            if (failedReleaseScope)
              same([readNat(job.partition),readNat(job.lifetime)], [failedReleaseScope.partition,failedReleaseScope.lifetime],
                `${field} item ${order} failed individual release core scope`);
            else throw new TypeError("NoJob original scope lacks genuine action or captured command context");
          }
        } else if (job.$ === "advicee_lifecycle_driver.Unbound") {
          same(publicItem.job,undefined,`${field} item ${order} absent active source binding`);
          const original=readRecord(job.source);
          same(original.$,"Driver.SourceJob",`${field} item ${order} original source constructor`);
          if (!publicItem.driverSourceJob) throw new TypeError("unbound action lost its genuine original source job");
          same({partition:original.partition,lifetime:original.lifetime,bytes:original.bytes,units:list(original.units),outcome:original.outcome},publicItem.driverSourceJob,`${field} item ${order} complete immutable unbound source`);
        } else compareJob(input.job, publicItem.driverSourceJob, `${field} item ${order} source job`);
      }
      if (issuance.$ === "advicee_lifecycle_driver.Environmental") {
        const capture=optional(issuance.output);
        same(capture===undefined?undefined:decodeOutputCapture(capture),publicItem.callbackReceipt?.outputCapture,`${field} item ${order} complete original environmental output capture`);
      } else if (issuance.$ === "advicee_lifecycle_driver.RawInput" || issuance.$ === "advicee_lifecycle_driver.CanonicalFeedback") {
        same(publicItem.callbackReceipt,undefined,`${field} item ${order} nonenvironmental callback provenance`);
      } else throw new TypeError("unrecognized original queued issuance provenance");
      if (failedReleaseScope)
        compareFailedIndividualReleaseEmission(input.context,publicItem,failedReleaseScope,`${field} item ${order}`);
      else compareEmission(input.context,publicItem,`${field} item ${order}`);
      same(input.$ === "advicee_lifecycle_driver.FitEvent" ? readNat(input.attempt) : undefined,
        publicItem.fitFinish, `${field} item ${order} original fit attempt`);
    } else if (input.$ === "advicee_lifecycle_driver.Fact") {
      if (publicItem.input.kind !== "preparationGraph") throw new Error("native graph fact changed public input kind");
      const event = publicItem.input.event;
      same([input.partition,input.lifetime,input.round,input.operation,input.position],
        [event.partition,event.lifetime,event.round,event.operation,event.step], `${field} item ${order} graph tuple`);
      same(decodePrefixGraphEvent(input.event), encodeImportGraphEvent(event.fact), `${field} item ${order} full graph event`);
    } else if (input.$ === "advicee_lifecycle_driver.FinishIntent") {
      if (publicItem.input.kind !== "finish") throw new Error("native Finish intent changed public input kind");
      const agent = "agent" in publicItem.input ? publicItem.input.agent : "agent-1";
      const scope = premise.agentScopes.find(scope => scope.agent === agent);
      if (!scope) throw new Error("original Finish has no actual declared advicee scope");
      same(input.partition,scope.partition,`${field} item ${order} original Finish advicee`);
      same(readNat(input.started), publicItem.input.at, `${field} item ${order} original Stop start`);
      same(readBool(input.recurring), ("recurring" in publicItem.input ? publicItem.input.recurring : false), `${field} item ${order} original recurrence`);
      // Cutoff is compared against the separately frozen original input;
      // full registration/capture comparisons preserve its actual owner value.
      same(readNat(input.cutoff), publicItem.input.at + originalFinishWait(premise.input), `${field} item ${order} original cutoff`);
    } else if (input.$ === "advicee_lifecycle_driver.Arrival") {
      if (!publicItem.workloadSource) throw new TypeError("original Arrival lacks genuine public Workload source");
      const emission = publicItem.workloadSource;
      const units = emission.units.reduceRight<unknown>((tail,head) => ({ $: "Con", head, tail }),{ $: "Nil" });
      same(input.event,{ ...emission, units },`${field} item ${order} complete original Workload emission`);
      same(input.lifetime,publicItem.activityScope ?? 1,`${field} item ${order} original Arrival activity fence`);
    } else if (input.$ === "advicee_lifecycle_driver.Edit") {
      if (publicItem.input.kind !== "edit") throw new TypeError("native Edit retry changed original public input kind");
      compareJob(input.job,publicItem.driverSourceJob,`${field} item ${order} original retry job`);
    } else if (input.$ === "advicee_lifecycle_driver.SourceEdit") {
      if (publicItem.input.kind !== "edit") throw new Error("native original edit changed public input kind");
      const job = input;
      if (job.$ !== "advicee_lifecycle_driver.SourceEdit") throw new TypeError("original Edit lost its arrival source fence");
      const agent = "agent" in publicItem.input ? publicItem.input.agent : "agent-1";
      const scope = premise.agentScopes.find(scope => scope.agent === agent);
      if (!scope) throw new Error("original Edit has no actual declared advicee scope");
      same(job.partition, scope.partition, `${field} item ${order} original advicee`);
      same(job.activity, publicItem.activityScope ?? 1, `${field} item ${order} captured activity incarnation`);
      same(job.bytes, publicItem.input.bytes, `${field} item ${order} original bytes`);
      same(list(job.units), publicItem.input.unitBytes, `${field} item ${order} original units`);
      const override = publicItem.input.outcome === undefined ? { $: "None" } : { $: "Some", value: encodeDriverOutcome(publicItem.input.outcome) };
      same(job.outcome, override, `${field} item ${order} original optional override`);
    } else throw new TypeError(`uncompared Stop queued input ${String(input.$)}`);
  }
  const jobs = list(runtime.jobs).map(readRecord);
  same(jobs.length, source.jobs.length, `${field} retained source job count`);
  same(jobs.map(job => readNat(job.operation)),source.jobs.map(([operation]) => operation),`${field} retained source job insertion order`);
  for (const retained of jobs) {
    const operation = readNat(retained.operation);
    const original = source.jobs.find(([id]) => id === operation)?.[1];
    if (!original) throw new Error(`${field} loses original job ${operation}`);
    compareJob(retained.job,original.driverSourceJob,`${field} job ${operation}`);
  }
}

/** Compare actual observer owner midpoints. Queue/job transport and boundary
 * accounting are separate required comparisons; this function alone is not
 * a full Stop conformance gate. No midpoint is reconstructed from endpoints. */
export function compareStopObservedOwners(nativeFrames: readonly unknown[], publicFrames: readonly RunStructuralFrame[], premise: StopRuntimePremise): void {
  const observed = nativeFrames.map(readRecord).filter(frame => frame.$ === "stop_observed_wire.Observed");
  const actual = publicFrames.filter(frame => frame.kind !== "callbackDelivery");
  same(observed.length, actual.length, "observed frame count");
  for (const [index, wire] of observed.entries()) {
    const source = actual[index];
    if (!source) throw new Error("missing actual public Stop frame");
    const frame = readRecord(wire.frame);
    const before = single(frame.runtime_before), after = single(frame.runtime_after);
    compareRuntime(frame.runtime_before, source.before, `frame ${index} runtime before`, premise);
    compareRuntime(frame.runtime_after, source.after, `frame ${index} runtime after`, premise);
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
      compareRuntime(delivery.before, delivered.before, `frame ${index} physical before`, premise);
      compareRuntime(delivery.after, delivered.after, `frame ${index} physical after`, premise);
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
  compareStopObservedOwners(frames, expected.frames, expected);
  const boundaries = frames.filter(frame => frame.$ === "stop_observed_wire.Boundary" || frame.$ === "stop_observed_wire.Control");
  same(boundaries.length, expected.boundaries.length, "original Stop boundary count");
  for (const [index, frame] of boundaries.entries()) {
    const input = readRecord(frame.input), original = expected.boundaries[index];
    if (!original || input.$ !== "stop_original_inputs.Advance") throw new TypeError("wrong original Stop boundary");
    same([input.endpoint,input.budget,frame.consumed], [original.endpoint,original.budget,original.consumed], `boundary ${index} original budget/count`);
    compareRuntime(frame.runtime, original.runtime, `boundary ${index} full runtime`, expected);
  }
  compareRuntime(trace.endpoint, expected.endpoint, "final actual Stop runtime", expected);
}

/** All original cases retain the same complete observer contract as waiting. */
export function compareOriginalStopFamilyTrace(value: unknown, expected: ReturnType<typeof originalStopPublicCases>, frozenInputs: readonly unknown[]): void {
  const envelope = single(value);
  if (envelope.$ !== "stop_observed_wire.Envelope") throw new TypeError("wrong original Stop family envelope");
  const traces = list(envelope.traces);
  same(traces.length,11,"full original Stop scenario count");
  same(expected.length,11,"independent public original scenario count");
  same(frozenInputs.length,11,"independent frozen original declaration count");
  for (const [caseIndex, value] of traces.entries()) compareOriginalStopCaseTrace(value,expected[caseIndex],frozenInputs[caseIndex],caseIndex);
}

export function compareOriginalStopCaseTrace(value: unknown, original: ReturnType<typeof originalStopPublicCases>[number] | undefined, frozenInput: unknown, caseIndex: number): void {
  try {
    const trace = readRecord(value);
    if (!original || trace.$ !== "stop_observed_wire.Trace" || !readBool(trace.valid)) throw new TypeError(`invalid full original Stop trace at case ${caseIndex}`);
    same(trace.input,frozenInput,`case ${caseIndex} complete original input`);
    const premise: StopRuntimePremise = { input: original.input, agentScopes: original.agentScopes, frozenInput };
    const frames = list(trace.frames).map(readRecord);
    for (const frame of frames) if (!["stop_observed_wire.Observed","stop_observed_wire.Boundary","stop_observed_wire.Control"].includes(String(frame.$))) throw new TypeError("uncompared original Stop frame");
    compareStopObservedOwners(frames,original.frames,premise);
    const boundaries = frames.filter(frame => frame.$ === "stop_observed_wire.Boundary" || frame.$ === "stop_observed_wire.Control");
    same(boundaries.length,original.boundaries.length,`case ${caseIndex} boundary count`);
    for (const [index, frame] of boundaries.entries()) {
      const boundary = original.boundaries[index], input = readRecord(frame.input);
      if (!boundary) throw new TypeError("missing independent original boundary");
      if ("outputProfile" in boundary.input) {
        if (frame.$ !== "stop_observed_wire.Control" || input.$ !== "stop_original_inputs.OutputProfile") throw new TypeError("original output profile lost genuine control frame");
        const profile=boundary.input.outputProfile;
        const outcome={$:`OutputScenario.${profile.outcome[0]!.toUpperCase()}${profile.outcome.slice(1)}`};
        same(input,{ $:"stop_original_inputs.OutputProfile",outcome,delay:profile.delayMs,lease:profile.leaseMs },`case ${caseIndex} complete future output control`);
        const config=readRecord(readRecord(frozenInput).configuration);
        const environment=(snapshot:typeof boundary.runtime)=>({$:"advicee_lifecycle_driver.Environment",seed:config.seed,tree:config.tree,graph:config.graph,preparation_delay:config.preparation_delay,output_delay:snapshot.outputProfile.delayMs,output_lease:snapshot.outputProfile.leaseMs,stop_profile:{$:"Some",value:{$:"advicee_lifecycle_driver.StopProfile",outcome:{$:`OutputScenario.${snapshot.outputProfile.outcome[0]!.toUpperCase()}${snapshot.outputProfile.outcome.slice(1)}`},bytes:config.candidate_bytes}},outcomes:config.outcomes});
        same(frame.before_environment,environment(boundary.before),`case ${caseIndex} complete original environment before control`);
        same(frame.after_environment,environment(boundary.runtime),`case ${caseIndex} complete original environment after control`);
        compareRuntime(frame.before,boundary.before,`case ${caseIndex} genuine control runtime before`,premise);
        compareRuntime(frame.after,boundary.runtime,`case ${caseIndex} genuine control runtime after`,premise);
        same(boundary.consumed,0,`case ${caseIndex} control consumes no observation`);
        continue;
      } else if ("input" in boundary.input) {
        if (input.$ !== "stop_original_inputs.Schedule") throw new TypeError("original Schedule changed boundary kind");
        const scheduled = boundary.input.input;
        if (scheduled.kind !== "canonical") throw new TypeError("original scheduled boundary must be canonical");
        same(input.input,{ $: "stop_original_inputs.CanonicalInput", at: scheduled.at, event: encodeCanonicalEvent(scheduled.event) },`case ${caseIndex} scheduled full input`);
        same(frame.consumed,0,`case ${caseIndex} scheduling consumes no observation`);
      } else if ("endpoint" in boundary.input) {
        if (input.$ !== "stop_original_inputs.Advance") throw new TypeError("original Advance changed boundary kind");
        same([input.endpoint,input.budget,frame.consumed],[boundary.input.endpoint,boundary.input.budget,boundary.consumed],`case ${caseIndex} boundary ${index} exact budget/count`);
      }
      else throw new TypeError("unresolved original boundary declaration");
      compareRuntime(frame.runtime,boundary.runtime,`case ${caseIndex} boundary ${index} complete runtime`,premise);
    }
    compareRuntime(trace.endpoint,original.endpoint,`case ${caseIndex} complete endpoint`,premise);

  } catch (error) {
    throw new Error(`original Stop case ${caseIndex}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

export function compareOriginalStopOutputFamilyTrace(value: unknown, expected: ReturnType<typeof originalStopOutputPublicCases>, frozenInputs: readonly unknown[]): void {
  const envelope=single(value);
  same(envelope.$,"stop_observed_wire.Envelope","original output family envelope");
  const traces=list(envelope.traces);
  same(traces.length,12,"all original output scenario count");
  same(expected.length,12,"independent original output scenario count");
  same(frozenInputs.length,12,"independent frozen output declaration count");
  for(const [index,trace] of traces.entries()) compareOriginalStopCaseTrace(trace,expected[index],frozenInputs[index],index);
}
