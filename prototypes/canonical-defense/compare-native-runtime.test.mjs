import assert from "node:assert/strict";
import { test } from "node:test";
import { compareNativeQueuedPayload, compareCanonicalOwner, compareNativeInputContext, compareNativeRuntime, resolvedGameOutputScopes, resolvedGameProvidedOwner, compareGameOutputScopes } from "./compare-native-runtime.mjs";

const owner = canonical => ({ $: "Types.State", canonical });
test("public contract permits different private scheduler and scenario representation", () => {
  compareCanonicalOwner({ ...owner({ round: 7 }), scheduler: { private: "native" }, scenarios: { capsule: 1 } },
    { ...owner({ round: 7 }), scheduler: { private: "public" }, scenarios: { capsule: 2 } }, "campaign 0 tick 1");
});
test("public contract refuses a changed Canonical owner", () => {
  assert.throws(() => compareCanonicalOwner(owner({ round: 7 }), owner({ round: 8 }), "campaign 0 tick 1"),
    /campaign 0 tick 1 complete Canonical state/);
});
test("public contract still refuses changed observable queue order", () => {
  const runtime = { valid: true, core: { $: "Con", head: owner({ round: 7 }), tail: { $: "Nil" } },
    environment: {}, next: 4 };
  assert.throws(() => compareNativeRuntime(runtime, { engine: owner({ round: 7 }), order: 5 }, "campaign 0 item 4"),
    /campaign 0 item 4 next queue order/);
});

const linked = values => values.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" });
test("external finding-count acknowledgement resolves only its missing event owner", () => {
  const event = { $: "Canonical.FindingCountUpdated", partition: 3 };
  const outputs = linked([{ $: "Canonical.EventEstablished", event: { $: "Canonical.FindingCountRecorded" } }]);
  assert.deepEqual(resolvedGameOutputScopes(linked([{ $: "None" }]), event, outputs), [3]);
  assert.deepEqual(resolvedGameOutputScopes(linked([{ $: "Some", value: 8 }]), event, outputs), [8]);
  assert.deepEqual(resolvedGameOutputScopes(linked([{ $: "None" }]), { $: "Canonical.StartReview", partition: 3 }, outputs), [null]);
  assert.deepEqual(resolvedGameOutputScopes(linked([{ $: "None" }]), event, linked([{ $: "Canonical.EventEstablished", event: { $: "Canonical.ReviewServiceRequestIssued" } }])), [null]);
});

test("native input context requires exactly one optional capsule", () => {
  compareNativeInputContext(linked([{ $: "None" }]),{},"input context");
  assert.throws(() => compareNativeInputContext(linked([]),{},"empty context"));
  assert.throws(() => compareNativeInputContext(linked([{ $: "None" },{ $: "None" }]),{},"duplicate context"));
  assert.throws(() => compareNativeInputContext({ $: "None" },{},"unboxed context"));
  assert.throws(() => compareNativeInputContext(linked([{ $: "None" }]),{ driverContext: {} },"lost context"), /lost context absent context/);
});


test("captured edit keeps its original activity fence and complete source job", () => {
  const source = { $: "Driver.SourceJob", partition: 2, lifetime: 3, bytes: 10, units: linked([5]), outcome: { $: "None" } };
  const job = { $: "NativeRunTypes.Job", partition: 2, lifetime: 3, round: 0, bytes: 10, units: linked([5]), revision: 7, repair: false,
    duration: { $: "None" }, source_job: { $: "Some", value: source }, facts: linked([{ $: "None" }]) };
  const input = { $: "NativeRunTypes.CapturedEdit", job, activity: 9 };
  const original = { at: 20, order: 4, activityScope: 9, input: { kind: "edit", at: 20, bytes: 10, unitBytes: [5], revision: 7 },
    driverSourceJob: { partition: 2, lifetime: 3, bytes: 10, units: [5], outcome: { $: "None" } } };
  compareNativeQueuedPayload(input,original,"captured",4,{});
  assert.throws(() => compareNativeQueuedPayload({ ...input, activity: 8 },original,"captured",4,{}), /original captured edit activity/);
  assert.throws(() => compareNativeQueuedPayload({ ...input, job: { ...job, bytes: 11 } },original,"captured",4,{}), /full active input/);
  assert.throws(() => compareNativeQueuedPayload({ ...input, job: { ...job, source_job: { $: "Some", value: { ...source, lifetime: 4 } } } },original,"captured",4,{}), /immutable source/);
  assert.throws(() => compareNativeQueuedPayload({ ...input, $: "NativeRunTypes.Edit" },original,"captured",4,{}), /unsupported genuine queued family/);
});

test("cache facts preserve independent target and emitter partitions", () => {
  const event = { kind: "cachePrepare", id: 1, bytes: 5, entryLimit: 8, byteLimit: 100 };
  const input = { $: "NativeRunTypes.CacheFact", source_partition: 3,
    fact: { event: { $: "Canonical.CachePrepare", id: 1, bytes: 5, entry_limit: 8, byte_limit: 100 }, offer: { key: { partition: 2 } } } };
  const original = { at: 20, order: 4, partition: 3, input: { at: 20, kind: "canonical", event }, cacheFact: { event, partition: 2 } };
  compareNativeQueuedPayload(input,original,"cache",4,{});
  assert.throws(() => compareNativeQueuedPayload({ ...input, source_partition: 2 },original,"cache",4,{}), /cache fact emitter/);
  assert.throws(() => compareNativeQueuedPayload({ ...input, fact: { ...input.fact, offer: { key: { partition: 3 } } } },original,"cache",4,{}), /cache fact target/);
});

test("NativeRunHost absolute Stop wakes retain their public event, attempt and full active job", () => {
  const job={ $:"NativeRunTypes.Job",partition:2,lifetime:3,round:4,bytes:0,units:linked([]),revision:0,repair:false,
    duration:{$:"None"},source_job:{$:"None"},facts:linked([{$:"None"}]) };
  const event={kind:"stopPolled",partition:2,lifetime:3,round:4,deadline:false};
  const input={$:"NativeRunTypes.FinishInput",action:{event:{$:"Canonical.StopPolled",partition:2,lifetime:3,round:4,deadline:false},
    delay:0,candidate:{$:"None"},job:false,expiry_advice:{$:"None"}},job,attempt:9,context:linked([{$:"None"}])};
  const original={at:20,order:5,partition:2,generated:true,finishAttempt:9,
    job:{partition:2,lifetime:3,round:4,bytes:0,unitBytes:[],revision:0,repair:false},input:{kind:"canonical",at:20,event}};
  const core={scenarios:{stop:{finishes:linked([{$:"StopScenario.Finish",partition:2,lifetime:3,round:4,attempt:9,token:9,
    started:0,deadline:100,recurring:false,selected:linked([]),waiting:false,validating:0,fit_pending:false,output:linked([])}])}}};
  compareNativeQueuedPayload(input,original,"Stop wake",5,core);
  assert.throws(()=>compareNativeQueuedPayload({...input,action:{...input.action,expiry_advice:{$:"Some",value:5}}},original,"Stop wake",5,core),/complete Stop action/);
  assert.throws(()=>compareNativeQueuedPayload({...input,action:{...input.action,delay:1}},original,"Stop wake",5,core),/Stop source delay/);
  assert.throws(()=>compareNativeQueuedPayload(input,{...original,candidate:7},"Stop wake",5,core),/unexpected Stop metadata/);
  assert.throws(()=>compareNativeQueuedPayload({...input,attempt:10},original,"Stop wake",5,core),/Stop attempt/);
  assert.throws(()=>compareNativeQueuedPayload({...input,job:{...job,lifetime:4}},original,"Stop wake",5,core),/full active input/);
  assert.throws(()=>compareNativeQueuedPayload({...input,action:{...input.action,event:{...input.action.event,deadline:true}}},original,"Stop wake",5,core),/complete Stop action/);
});

 test("original Stop keeps its input time, scope, activity and non-recurring provenance",()=>{
  const input={$:"NativeRunTypes.StartFinish",partition:2,activity:9,recurring:false};
  const source={at:200,order:3,partition:2,activityScope:9,input:{kind:"finish",at:200}};
  compareNativeQueuedPayload(input,source,"original Stop",3,{});
  for(const changed of [{...input,partition:3},{...input,activity:8},{...input,recurring:true}])
    assert.throws(()=>compareNativeQueuedPayload(changed,source,"original Stop",3,{}));
  assert.throws(()=>compareNativeQueuedPayload(input,{...source,input:{kind:"finish",at:201}},"original Stop",3,{}));
  assert.throws(()=>compareNativeQueuedPayload(input,{...source,generated:true},"original Stop",3,{}));
 });


test("queued emissions retain exact captured context after business ownership ends",()=>{
  const event={$:"Canonical.CollectionLeaseCheck",advice:3,token:3,expired:false,stop_collector:false,same_group:true,reofferable:false};
  const context={partition:1,lifetime:2,round:3},scheduled={driverContext:context};
  const input={$:"NativeRunTypes.Event",action:{event},context:linked([{$:"Some",value:{$:"NativeRunTypes.EmissionContext",context}}])};
  const details={provided:{$:"None"},consumed:{$:"Some",value:{$:"NativeRunTypes.ConsumedInput",input}}};
  assert.equal(resolvedGameProvidedOwner(details,event,{},"emission",scheduled),1);
  assert.equal(resolvedGameProvidedOwner({...details,provided:{$:"Some",value:8}},event,{},"emission",scheduled),8);
  assert.throws(()=>resolvedGameProvidedOwner(details,event,{partition:1},"emission",scheduled),/no business owner/);
  assert.throws(()=>resolvedGameProvidedOwner(details,{...event,token:4},{},"emission",scheduled),/exact original emitted event/);
  assert.equal(resolvedGameProvidedOwner({...details,consumed:{$:"None"}},event,{},"emission",scheduled),undefined);
  assert.equal(resolvedGameProvidedOwner({...details,consumed:{$:"Some",value:{$:"NativeRunTypes.ConsumedInput",input:{...input,context:linked([{$:"None"}])}}}},event,{},"emission",scheduled),undefined);
  assert.throws(()=>resolvedGameProvidedOwner(details,event,{},"emission",{driverContext:{...context,partition:2}}),/entire original emitter context/);
  assert.throws(()=>resolvedGameProvidedOwner(details,event,{},"emission",{driverContext:{...context,round:4}}),/entire original emitter context/);
  assert.throws(()=>resolvedGameProvidedOwner(details,event,{},"emission",{}),/entire original emitter context/);
  assert.throws(()=>assert.equal(resolvedGameProvidedOwner(details,event,{},"emission",scheduled),2));
});

test("output scope absence normalizes without accepting a changed explicit owner",()=>{
  const event={$:"Canonical.CollectionLeaseCheck"},outputs=linked([{$:"Canonical.PolicyDecided",decision:{$:"Canonical.CollectionRefused"}}]);
  compareGameOutputScopes(linked([{$:"None"}]),event,outputs,[undefined],"absent");
  assert.throws(()=>compareGameOutputScopes(linked([{$:"Some",value:1}]),event,outputs,[undefined],"lost"));
  assert.throws(()=>compareGameOutputScopes(linked([{$:"None"}]),event,outputs,[1],"invented"));
  assert.throws(()=>compareGameOutputScopes(linked([{$:"Some",value:1}]),event,outputs,[2],"changed"));
});
