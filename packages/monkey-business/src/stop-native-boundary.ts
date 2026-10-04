import { isDeepStrictEqual } from "node:util";
import { encodeCanonicalEvent, decodeTrustedCanonicalStep, projectTrustedCanonical } from "../../../src/canonical/canonical-boundary.ts";
import { encodeImportGraphEvent, projectImportGraph } from "../../../src/canonical/graph-adapter.ts";
import { readBendList, readRecord, readNat, readBool } from "../../../src/canonical/boundary-schema.ts";
import { decodePrefixCanonicalEvent, decodePrefixGraphEvent } from "./callback-native-codec.ts";
import { decodeDriver, encodeDriverOutcome } from "./driver-codec.ts";
import { decodeOutputCapture } from "./output-controls.ts";
import { decodeStopFound, decodeStopRegistry } from "./stop-codec.ts";
import { originalStopOutputCases } from "./stop-original-public.fixture.ts";
import type { originalWaitingStopPublic, originalStopPublicCases, originalStopOutputPublicCases } from "./stop-original-public.fixture.ts";
import type { RunConfig, RunRuntimeSnapshot, RunStructuralFrame } from "./index.ts";

const list = (value: unknown) => readBendList(value, value => value, 2048);
function same(actual: unknown, expected: unknown, field: string): void {
  if (!isDeepStrictEqual(actual, expected)) throw new Error(`Stop public business layer differs at ${field}`);
}
function tagged(value: unknown, tag: string): Record<string, unknown> {
  const record = readRecord(value);
  if (record.$ !== `stop_observed_wire.${tag}`) throw new TypeError(`invalid Stop ${tag}`);
  return record;
}
function single(value: unknown): Record<string, unknown> {
  const values = list(value);
  if (values.length !== 1) throw new TypeError("Stop business snapshot requires one actual owner projection");
  return readRecord(values[0]);
}
function optional(value: unknown): unknown {
  const record = readRecord(value);
  if (record.$ === "None") return undefined;
  if (record.$ !== "Some") throw new TypeError("invalid Stop optional fact");
  return record.value;
}
/** Compare genuine owner facts; never reconstruct a private Runtime or queue. */
export function compareStopBusiness(value: unknown, source: RunRuntimeSnapshot, field: string): void {
  const business = tagged(single(value), "BusinessState");
  const engine = readRecord(source.engine);
  same(projectTrustedCanonical(business.canonical), projectTrustedCanonical(engine.canonical), `${field} Canonical accounting`);
  const registry = readRecord(readRecord(engine.scenarios).stop);
  same(decodeStopRegistry(business.finishes), decodeStopRegistry(registry.finishes), `${field} original Finish registry`);
}
function compareEndpoint(value: unknown, source: RunRuntimeSnapshot, field: string): void {
  const endpoint = tagged(value,"Endpoint");
  same(readNat(endpoint.time), readNat(readRecord(readRecord(source.engine).scheduler).now), `${field} actual clock`);
  compareStopBusiness(endpoint.projection,source,field);
}
function compareObservation(value: unknown, source: RunStructuralFrame, field: string): void {
  const observation = readRecord(value);
  same(readNat(observation.time), source.time, `${field} actual time`);
  same(readNat(observation.order), source.scheduled.order, `${field} original selected order`);
  compareStopBusiness(observation.before,source.before,`${field} before`);
  compareStopBusiness(observation.after,source.after,`${field} after`);
  // Graph carries its complete source scope in key, not a supplied Canonical scope.
  same(optional(observation.provided),source.kind !== "callbackDelivery" && source.kind !== "finishRegistration" && source.observation.preparation
    ? undefined : source.kind === "finishRegistration" ? source.registration.finish?.partition
      : source.scheduled.partition,`${field} original provided scope`);
  if (source.kind === "callbackDelivery") throw new Error(`${field} physical delivery became product observation`);
  if (source.kind === "finishRegistration") {
    tagged(observation,"Finish");
    same(decodeStopFound(observation.finish),source.registration.finish,`${field} actual registered capture`);
    same(readBool(observation.created),source.registration.created,`${field} actual registration result`);
    const input=readRecord(observation.input), finish=source.registration.finish;
    if (!finish) throw new Error(`${field} missing actual registered original Finish`);
    same([input.partition,input.lifetime,input.round,input.started,input.cutoff,input.recurring],
      [finish.partition,finish.lifetime,finish.round,finish.started,finish.deadline,finish.recurring],`${field} original registration input`);
    same(list(observation.command_scopes),[],`${field} registration has no command scopes`);
    return;
  }
  same(list(observation.command_scopes).map(optional),source.observation.commandScopes ?? [],`${field} command scopes`);
  const transition = readRecord(source.transition);
  if (source.observation.preparation) {
    tagged(observation,"Graph");
    const event=source.observation.preparation.event, key=readRecord(observation.key);
    same([key.partition,key.lifetime,key.round,key.operation,key.unit,observation.position],
      [event.partition,event.lifetime,event.round,event.operation,event.unit,event.step],`${field} original graph identity`);
    same(decodePrefixGraphEvent(observation.event),encodeImportGraphEvent(event.fact),`${field} original graph event`);
    const result=single(observation.result);
    if (result.$ === "stop_observed_wire.GraphRejected") {
      same(transition.$,"Types.GraphRejected",`${field} original graph rejection`);
    } else {
      tagged(result,"GraphAdvanced");
      same(projectImportGraph(result.before),source.observation.preparation.before,`${field} graph before`);
      same(projectImportGraph(result.after),source.observation.preparation.after,`${field} graph after`);
      same(result.command,readRecord(transition.result).command,`${field} actual graph command`);
    }
    return;
  }
  if (!["stop_observed_wire.Canonical","stop_observed_wire.Cache"].includes(String(observation.$))) throw new TypeError(`${field} unknown business observation`);
  if (source.observation.event.kind === "preparationGraph") throw new Error(`${field} graph became canonical event`);
  same(decodePrefixCanonicalEvent(observation.event),encodeCanonicalEvent(source.observation.event),`${field} original event`);
  const outcome=single(observation.result), state=single(observation.after).canonical;
  const decoded=outcome.$ === "stop_observed_wire.Advanced"
    ? decodeTrustedCanonicalStep({$:"Canonical.Advanced",state,commands:outcome.commands})
    : outcome.$ === "stop_observed_wire.Rejected"
      ? decodeTrustedCanonicalStep({$:"Canonical.Rejected",state,reason:outcome.reason})
      : (()=>{throw new TypeError(`${field} invalid original outcome`);})();
  same(decoded.commands,source.observation.commands,`${field} ordered commands`);
  same(decoded.rejection,source.observation.rejection,`${field} rejection`);
  if (observation.$ === "stop_observed_wire.Cache") same(observation.fact,source.source,`${field} actual cache fact`);
}
function comparePhysical(value: unknown, source: RunStructuralFrame, field: string): void {
  const physical=tagged(value,"Physical");
  if (source.kind !== "callbackDelivery") throw new Error(`${field} missing original physical delivery`);
  same(readNat(physical.time),source.time,`${field} time`);
  same(readNat(physical.order),source.scheduled.order,`${field} original order`);
  compareStopBusiness(physical.before,source.before,`${field} before`);
  compareStopBusiness(physical.after,source.after,`${field} after`);
  same(physical.action,source.delivery,`${field} actual action`);
}
function compareSourceJob(value: unknown, expected: RunRuntimeSnapshot["queue"][number]["driverSourceJob"], field: string): void {
  const raw=optional(value);
  if (raw === undefined) same(expected,undefined,`${field} absent source job`);
  else {
    const job=readRecord(raw);
    same({partition:readNat(job.partition),lifetime:readNat(job.lifetime),bytes:readNat(job.bytes),
      units:list(job.units).map(readNat),outcome:job.outcome},expected,`${field} original source identity`);
  }
}
function compareIssuedFacts(raw: unknown, source: RunRuntimeSnapshot["queue"][number], field: string): void {
  const job=source.driverSourceJob, receipt=source.driverOutcomeReceipt === undefined ? undefined : optional(source.driverOutcomeReceipt),
    output=source.callbackReceipt?.outputCapture;
  if (raw === undefined) {
    same([job,receipt,output],[undefined,undefined,undefined],`${field} absent original issuance`);
    return;
  }
  const issued=tagged(raw,"IssuedFacts");
  const origin=readRecord(issued.origin);
  if (!["stop_observed_wire.Environmental","stop_observed_wire.CanonicalFeedback","stop_observed_wire.RawInput"].includes(String(origin.$)) || Object.keys(origin).length !== 1)
    throw new TypeError(`${field} invalid actual issuance origin`);
  // Public Scheduled does not retain origin; complete native/emitted wire equality still checks it.
  const capture=optional(issued.output_capture);
  compareSourceJob(issued.source_job,job,field);
  same(optional(issued.outcome_receipt),receipt,`${field} immutable outcome receipt`);
  same(capture === undefined ? undefined : decodeOutputCapture(capture),output,`${field} immutable output capture`);
}
function compareIssuance(value: unknown, source: RunStructuralFrame, field: string): void {
  compareIssuedFacts(optional(value),source.scheduled,field);
}
function compareEmissions(value: unknown, source: RunStructuralFrame, config: RunConfig, field: string): void {
  const emissions=list(value).map(readRecord), appended=source.after.queue.filter(item=>item.order >= source.before.order);
  same(emissions.length,appended.length,`${field} actual appended effects count`);
  for (const [index,emission] of emissions.entries()) {
    const item=appended[index]!, at=`${field} emission ${index}`;
    same([readNat(emission.time),readNat(emission.order)],[item.at,item.order],`${at} scheduled time/order`);
    if (emission.$ === "stop_observed_wire.Action") {
      if (item.input.kind !== "canonical") throw new Error(`${at} action changed public input kind`);
      const action=decodeDriver({handled:true,actions:{$:"Con",head:emission.action,tail:{$:"Nil"}}}).actions[0]!;
      same(readRecord(emission.action).event,encodeCanonicalEvent(item.input.event),`${at} actual effect event`);
      // Stop wake facts already carry an absolute producer time; only ordinary
      // driver emissions expose a captured relative Driver.Action delay publicly.
      if (item.driverAction) same(action.delay,item.driverAction.delay,`${at} captured effect delay`);
      same(action.expiryAdvice,item.expiryAdvice,`${at} expiry identity`);
      same(action.candidate,item.candidate,`${at} actual candidate`);
      same(optional(emission.attempt),item.fitFinish,`${at} original Finish attempt`);
      compareIssuedFacts(emission.issued,item,at);
    } else if (emission.$ === "stop_observed_wire.Arrival") {
      if (!item.workloadSource) throw new Error(`${at} missing actual Workload emission`);
      const event=readRecord(emission.event);
      same({...event,units:list(event.units)},{$:"Workload.Emission",...item.workloadSource},`${at} actual arrival`);
      same(readNat(emission.activity),item.activityScope,`${at} activity identity`);
    } else if (emission.$ === "stop_observed_wire.GraphInput") {
      if (item.input.kind !== "preparationGraph") throw new Error(`${at} graph input changed kind`);
      const event=item.input.event;
      same([emission.partition,emission.lifetime,emission.round,emission.operation,emission.position],
        [event.partition,event.lifetime,event.round,event.operation,event.step],`${at} graph identity`);
      same(decodePrefixGraphEvent(emission.event),encodeImportGraphEvent(event.fact),`${at} graph fact`);
    } else if (emission.$ === "stop_observed_wire.SourceEdit") {
      if (item.input.kind !== "edit") throw new Error(`${at} source edit changed kind`);
      same([emission.partition,emission.activity,emission.bytes,list(emission.units),emission.outcome],
        [item.partition,item.activityScope,item.input.bytes,item.input.unitBytes,item.input.outcome === undefined ? {$:"None"} : {$:"Some",value:encodeDriverOutcome(item.input.outcome)}],`${at} original edit facts`);
    } else if (emission.$ === "stop_observed_wire.Edit") {
      if (item.input.kind !== "edit") throw new Error(`${at} retry changed kind`);
      compareSourceJob(emission.source_job,item.driverSourceJob,at);
    } else if (emission.$ === "stop_observed_wire.FinishInput" || emission.$ === "stop_observed_wire.FinishIntent") {
      if (item.input.kind !== "finish") throw new Error(`${at} original Finish input changed kind`);
      const input=emission.$ === "stop_observed_wire.FinishInput" ? readRecord(emission.input) : emission;
      const recurring="recurring" in item.input && item.input.recurring === true;
      same([input.partition,input.started,input.cutoff,input.recurring],
        [item.partition,item.at,item.at+(config.finishDeadline ?? 200),recurring],`${at} original Finish intent`);
      if (emission.$ === "stop_observed_wire.FinishInput") {
        const rounds=projectTrustedCanonical(readRecord(source.after.engine).canonical).rounds;
        const round=rounds.find(round=>round.partition === item.partition);
        if (!round) throw new Error(`${at} registered Finish has no actual round`);
        same([input.lifetime,input.round],[round.lifetime,round.id],`${at} original Finish scope`);
      }
    } else if (emission.$ === "stop_observed_wire.CacheInput") {
      if (!item.cacheFact || item.input.kind !== "canonical") throw new Error(`${at} missing actual cache effect`);
      const fact=readRecord(emission.fact), key=readRecord(readRecord(fact.offer).key);
      same([fact.event,key.partition],[encodeCanonicalEvent(item.cacheFact.event),item.cacheFact.partition],`${at} actual cache effect`);
      compareSourceJob(emission.source_job,item.driverSourceJob,at);
    } else throw new TypeError(`${at} missing or unsupported actual emitted effect`);
  }
}
function compareObserved(values: readonly unknown[], sources: readonly RunStructuralFrame[], config: RunConfig, field: string): void {
  const observed=values.map(readRecord).filter(frame=>["stop_observed_wire.Observed","stop_observed_wire.PhysicalOnly"].includes(String(frame.$)));
  const publicObserved=sources.filter(frame=>frame.kind !== "callbackDelivery" || !sources.some(other=>other.kind !== "callbackDelivery" && other.scheduled.order === frame.scheduled.order));
  same(observed.length,publicObserved.length,`${field} ordered observation/physical count`);
  for (const [index,wire] of observed.entries()) {
    const source=publicObserved[index]!,at=`${field} observation ${index}`;
    if (wire.$ === "stop_observed_wire.PhysicalOnly") {
      if (source.kind !== "callbackDelivery") throw new Error(`${at} physical-only became product observation`);
      comparePhysical(wire.physical,source,at);
      same(wire.receipt,source.fact,`${at} original selected fact`);
    } else {
      compareObservation(wire.observation,source,at);
      const originalFinish=source.kind === "finishRegistration" ? source.registration.finish
        : source.kind !== "callbackDelivery" && source.observation.preparation ? undefined
        : decodeStopRegistry(readRecord(readRecord(readRecord(source.before.engine).scenarios).stop).finishes)
          .find(finish=>finish.partition === source.scheduled.partition);
      same(decodeStopFound(wire.original_finish),originalFinish,`${at} original selected Finish`);
      const physical=sources.filter(frame=>frame.kind === "callbackDelivery" && frame.scheduled.order === source.scheduled.order);
      same(list(wire.physical).length,physical.length,`${at} physical count`);
      list(wire.physical).forEach((value,i)=>comparePhysical(value,physical[i]!,`${at} physical ${i}`));
      same(optional(wire.receipt),physical[0]?.kind === "callbackDelivery" ? physical[0].fact : undefined,`${at} original receipt`);
    }
    compareIssuance(wire.issuance,source,at);
    compareEmissions(wire.emissions,source,config,at);
  }
}

type PublicCase=ReturnType<typeof originalStopPublicCases>[number];
function compareCase(value: unknown, original: PublicCase | undefined, frozenInput: unknown, caseIndex: number): void {
  const field=`case ${caseIndex}`;
  try {
    const trace=tagged(value,"Trace");
    if (!original || !readBool(trace.valid)) throw new TypeError("invalid actual Stop transport");
    same(trace.input,frozenInput,`${field} complete original input`);
    const frames=list(trace.frames).map(readRecord);
    for (const frame of frames) if (!["stop_observed_wire.Observed","stop_observed_wire.PhysicalOnly","stop_observed_wire.Boundary","stop_observed_wire.Control"].includes(String(frame.$))) throw new TypeError("uncompared Stop business frame");
    compareObserved(frames,original.frames,original.input,field);
    const boundaries=frames.filter(frame=>["stop_observed_wire.Boundary","stop_observed_wire.Control"].includes(String(frame.$)));
    same(boundaries.length,original.boundaries.length,`${field} boundary count`);
    for (const [index,frame] of boundaries.entries()) {
      const source=original.boundaries[index]!,input=readRecord(frame.input),at=`${field} boundary ${index}`;
      if ("outputProfile" in source.input) {
        tagged(frame,"Control");
        const profile=source.input.outputProfile;
        same(input,{$:"stop_original_inputs.OutputProfile",outcome:{$:`OutputScenario.${profile.outcome[0]!.toUpperCase()}${profile.outcome.slice(1)}`},delay:profile.delayMs,lease:profile.leaseMs},`${at} original future profile`);
        for (const [value,snapshot,label] of [[frame.before_environment,source.before,"before"],[frame.after_environment,source.runtime,"after"]] as const) {
          const environment=readRecord(value), stopProfile=readRecord(optional(environment.stop_profile));
          same([environment.output_delay,environment.output_lease,stopProfile.outcome],
            [snapshot.outputProfile.delayMs,snapshot.outputProfile.leaseMs,{$:`OutputScenario.${snapshot.outputProfile.outcome[0]!.toUpperCase()}${snapshot.outputProfile.outcome.slice(1)}`}],`${at} ${label} profile`);
        }
        compareEndpoint(frame.before,source.before,`${at} before`);
        compareEndpoint(frame.after,source.runtime,`${at} after`);
        same(source.consumed,0,`${at} profile consumes no observations`);
      } else {
        tagged(frame,"Boundary");
        if ("input" in source.input) {
          const scheduled=source.input.input;
          if (scheduled.kind !== "canonical") throw new TypeError("original Schedule must be canonical");
          same(input,{$:"stop_original_inputs.Schedule",input:{$:"stop_original_inputs.CanonicalInput",at:scheduled.at,event:encodeCanonicalEvent(scheduled.event)}},`${at} original scheduled input`);
          same(readNat(frame.consumed),0,`${at} schedule consumes no observation`);
        } else if ("endpoint" in source.input) {
          same(input,{$:"stop_original_inputs.Advance",endpoint:source.input.endpoint,budget:source.input.budget},`${at} original advancement`);
          same(readNat(frame.consumed),source.consumed,`${at} consumed budget`);
        } else throw new TypeError("unresolved original boundary");
        compareEndpoint(frame.endpoint,source.runtime,at);
      }
    }
    compareEndpoint(trace.endpoint,original.endpoint,`${field} endpoint`);
  } catch(error) { throw new Error(`original Stop ${field}: ${error instanceof Error ? error.message : String(error)}`,{cause:error}); }
}
export function compareOriginalStopCaseTrace(value: unknown, original: PublicCase | undefined,frozenInput: unknown,caseIndex: number): void {
  compareCase(value,original,frozenInput,caseIndex);
}
function family(value: unknown,count: number): unknown[] {
  const envelope=tagged(single(value),"Envelope"), traces=list(envelope.traces);
  same(traces.length,count,"original Stop family count");
  return traces;
}
export function compareOriginalWaitingStopTrace(value: unknown,expected: ReturnType<typeof originalWaitingStopPublic>): void {
  const traces=family(value,1),trace=tagged(traces[0],"Trace");
  if (!readBool(trace.valid)) throw new TypeError("invalid waiting Stop transport");
  const frames=list(trace.frames).map(readRecord);
  for (const frame of frames) if (!["stop_observed_wire.Observed","stop_observed_wire.PhysicalOnly","stop_observed_wire.Boundary"].includes(String(frame.$)))
    throw new TypeError("uncompared waiting Stop business frame");
  compareObserved(frames,expected.frames,expected.input,"waiting case");
  const boundaries=frames.filter(frame=>frame.$ === "stop_observed_wire.Boundary");
  same(boundaries.length,expected.boundaries.length,"waiting boundary count");
  for (const [index,frame] of boundaries.entries()) {
    const source=expected.boundaries[index]!;
    same(frame.input,{$:"stop_original_inputs.Advance",endpoint:source.endpoint,budget:source.budget},`waiting boundary ${index} original input`);
    same(readNat(frame.consumed),source.consumed,`waiting boundary ${index} consumed budget`);
    compareEndpoint(frame.endpoint,source.runtime,`waiting boundary ${index}`);
  }
  compareEndpoint(trace.endpoint,expected.endpoint,"waiting endpoint");
}
export function compareOriginalStopFamilyTrace(value: unknown,expected: ReturnType<typeof originalStopPublicCases>,frozenInputs: readonly unknown[]): void {
  same(expected.length,11,"independent original Stop cases");same(frozenInputs.length,11,"frozen original Stop cases");
  family(value,11).forEach((trace,index)=>compareCase(trace,expected[index],frozenInputs[index],index));
}
export function compareOriginalStopOutputFamilyTrace(value: unknown,expected: ReturnType<typeof originalStopOutputPublicCases>,frozenInputs: readonly unknown[]): void {
  same(expected.length,12,"independent output Stop cases");same(frozenInputs.length,12,"frozen output Stop cases");
  same(originalStopOutputCases.length,12,"original output declaration cases");
  family(value,12).forEach((trace,index)=>compareCase(trace,expected[index],frozenInputs[index],index));
}
