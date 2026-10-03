import {expect,it} from "vitest";
import {createRun,restoreReplay,DEFAULT_FILE_TREE_PROFILE,type RunInput} from "./index.ts";
import {runWorkloadNative} from "../../monkey-business-bend/conformance/workload-native-runner.mjs";
import {validateSharingControl,type SharingControl} from "./sharing-controls.ts";

// Directed finite source-only boundary intent. The original native source
// invokes missing central sharing ABI, not JavaScript or captured JS rows.
it("requires native original sharing inputs, one physical request and exact public logical ownership",()=>{
 const native=runWorkloadNative(new URL("../../monkey-business-bend/conformance/sharing-native.bend",import.meta.url)) as number[][][];
 expect(native).toHaveLength(6);
 for(const [mode,trace] of native.entries()){
  expect(trace.some(row=>row[0]===97||row[0]===98)).toBe(false);
  const edit=(agent:string,at:number):RunInput=>({at,kind:"edit",agent,bytes:10,unitBytes:[5],evaluationInputs:["same-prepared-identity"],revisionSubject:"same-subject",revisionInput:"same-input"});
  const inputs=[edit("a",0),edit("a",mode===5?10:0)];if(mode===3)inputs.push(edit("b",0));
  const run=createRun({seed:7,retention:3000,inputs,preparationDelay:2,jevDelay:mode===5?5:30,outcome:"finding",
   sessions:[{agent:"a",seed:11,editIntervalMs:1000,variationMs:0,editsPerTask:100,taskPauseMs:1000,adviceResponse:"ignore"},
    {agent:"b",seed:12,editIntervalMs:1000,variationMs:0,editsPerTask:100,taskPauseMs:1000,adviceResponse:"ignore"}],
   fileTrees:{...DEFAULT_FILE_TREE_PROFILE,minFiles:1,maxFiles:1,maxImports:0,minSourceBytes:100,maxSourceBytes:100,minTreeBytes:20,maxTreeBytes:20},
   graphLimits:{version:1,sourceBytes:262144,treeBytes:20480,files:8,readBytes:1572864,outgoingEdges:16,depth:4,work:128},
   lifecycles:{reuse:{entryLimit:8,byteLimit:1}}});
  run.advance({untilTime:2,maxEvents:600});
  expect(run.projection.global).toEqual({items:mode===3?2:1,bytes:mode===3?10:5});
  expect(run.projection.dispatch.requests).toHaveLength(mode===3?2:1);
  const original=run.projection.dispatch.requests.map(request=>({...request}));
  const apply=(value:SharingControl)=>run.applyControl(validateSharingControl(value) as Parameters<typeof run.applyControl>[0]);
  const memberFrames=run.observations.filter(frame=>frame.event.kind==="beginObservedPreparation" && frame.partition===1);
  if(mode===1||mode===2){
   const event=memberFrames[mode===1?1:0]?.event;if(event?.kind!=="beginObservedPreparation")throw new Error("missing original member");
   apply({kind:"sharingMember",action:"leave",agent:"a",target:{partition:event.partition,lifetime:event.lifetime,round:event.round,operation:event.observation}});
  }
  if(mode===3||mode===4)apply({kind:"sharingMember",action:"leaveAll",agent:"a",partition:1,lifetime:1});
  run.advance({untilTime:3,maxEvents:200});
  expect(run.projection.dispatch.requests).toEqual(original);
  expect(run.projection.global).toEqual({items:mode===4?0:1,bytes:mode===4?0:5});
  run.advance({untilTime:33,maxEvents:1000});
  const started=run.observations.filter(f=>f.event.kind==="jevRequestStarted");
  expect(started).toHaveLength(mode===3?2:1);expect(trace.filter(row=>row[0]===11)).toHaveLength(started.length);
  const terminals=run.observations.filter(f=>f.event.kind==="submissionTerminal");
  expect(terminals).toHaveLength(mode===4?0:1);expect(trace.filter(row=>row[0]===18)).toHaveLength(terminals.length);
  expect(run.projection.dispatch.requests).toEqual([]);
  const endpoint=trace.at(-1);expect(endpoint?.[0]).toBe(90);
  // Source-owned terminal snapshot is actual Canonical global/partition ledger
  // and request ownership, not a recalc of a host equivalence cache.
  expect(endpoint?.slice(1)).toEqual([run.projection.global.items,run.projection.global.bytes,
   run.projection.partitions.find(p=>p.partition===1)?.items??0,run.projection.partitions.find(p=>p.partition===1)?.bytes??0,
   run.projection.partitions.find(p=>p.partition===2)?.items??0,run.projection.partitions.find(p=>p.partition===2)?.bytes??0,0,0]);
  if(mode===5)expect(run.observations.some(f=>f.commands.some(c=>c.kind==="reuseJoinAdvice"))).toBe(true);
  expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe());
 }
 // Full new reuse/member/control row coding and raw before/after agreement
 // remain central adapter requirements. These named endpoint/milestone checks
 // are not a complete native public-boundary validation claim.
},30000);
