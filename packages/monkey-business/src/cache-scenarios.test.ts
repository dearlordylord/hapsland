import {expect,it} from "vitest";
import {createRun,restoreReplay,type RunConfig,type RunInput} from "./index.ts";
const edit=(identity:string,at:number,agent?:string):RunInput=>({at,kind:"edit",...(agent?{agent}:{}),bytes:10,unitBytes:[5],evaluationInputs:[identity]});
const start=(inputs:RunInput[],entryLimit=8,byteLimit=128*1024,extra:Partial<Omit<RunConfig,"outcome" | "outcomeWeights">>={})=>createRun({seed:7,retention:10000,inputs,outcome:"clear",jevDelay:2,lifecycles:{reuse:{entryLimit,byteLimit}},...extra});
const issued=(run:ReturnType<typeof createRun>)=>run.observations.filter(frame=>frame.commands.some(command=>command.kind==="jevRequestIssued"));
const replay=(run:ReturnType<typeof createRun>)=>expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe());
const owners=(run:ReturnType<typeof createRun>)=>{
 const entries=run.projection.reuse.cache,charges=run.projection.charges.filter(charge=>charge.purpose==="storedResult");
 expect(charges.map(c=>[c.id,c.partition,c.bytes]).sort()).toEqual(entries.map(e=>[e.reservation,e.partition,e.bytes]).sort());
};
it("observes intermediate actual hit, identity miss, eviction and a renewed miss",()=>{
 const run=start([edit("A",0),edit("A",10),edit("B",20),edit("A",30)],1,5);
 run.advance({untilTime:9,maxEvents:1000});expect(issued(run)).toHaveLength(1);expect(run.projection.reuse.cache).toHaveLength(1);owners(run);
 const original=run.projection.reuse.cache[0]!;expect(run.projection.global).toEqual({items:1,bytes:5});
 run.advance({untilTime:19,maxEvents:1000});expect(issued(run)).toHaveLength(1);expect(run.observations.some(f=>f.commands.some(c=>c.kind==="reuseCached"))).toBe(true);
 expect(run.projection.reuse.cache[0]!.reservation).toBe(original.reservation);owners(run);
 run.advance({untilTime:29,maxEvents:1000});expect(issued(run)).toHaveLength(2);expect(run.projection.reuse.cache[0]!.id).not.toBe(original.id);
 expect(run.projection.charges.some(c=>c.id===original.reservation)).toBe(false);owners(run);
 expect(run.advance({maxEvents:1000}).reason).toBe("idle");expect(issued(run)).toHaveLength(3);owners(run);replay(run);
});
it.each([4,5,6])("uses the exact declared five-byte admission boundary with ceiling %i",ceiling=>{
 const run=start([edit("A",0),edit("A",10)],8,ceiling);
 expect(run.advance({maxEvents:1000}).reason).toBe("idle");
 expect(issued(run)).toHaveLength(ceiling<5?2:1);expect(run.projection.reuse.cache).toHaveLength(ceiling<5?0:1);
 expect(run.projection.global).toEqual({items:ceiling<5?0:1,bytes:ceiling<5?0:5});owners(run);replay(run);
});
it("clears actual retained ownership before repeating the same identity",()=>{
 const run=start([edit("A",0),{at:10,kind:"canonical",event:{kind:"cacheClear"}},edit("A",20)]);
 run.advance({untilTime:9,maxEvents:1000});const original=run.projection.reuse.cache[0]!;
 run.advance({untilTime:19,maxEvents:1000});expect(run.projection.reuse.cache).toEqual([]);expect(run.projection.global).toEqual({items:0,bytes:0});
 expect(run.advance({maxEvents:1000}).reason).toBe("idle");expect(issued(run)).toHaveLength(2);
 expect(run.projection.charges.some(c=>c.id===original.reservation)).toBe(false);owners(run);replay(run);
});
it("retains healthy other-partition entries after genuine owner invalidation",()=>{
 const run=start([edit("same",0,"a"),edit("same",0,"b"),{at:10,kind:"canonical",event:{kind:"cacheDiscardPartition",partition:1}},edit("same",20,"a"),edit("same",20,"b")],8,128*1024,
 {sessions:[{agent:"a",seed:11,editIntervalMs:1000,variationMs:0,editsPerTask:100,taskPauseMs:1000},{agent:"b",seed:12,editIntervalMs:1000,variationMs:0,editsPerTask:100,taskPauseMs:1000}]});
 run.advance({untilTime:9,maxEvents:1000});expect(issued(run)).toHaveLength(2);const healthy=run.projection.reuse.cache.find(e=>e.partition===2)!;
 run.advance({untilTime:19,maxEvents:1000});expect(run.projection.reuse.cache).toEqual([healthy]);expect(run.projection.global).toEqual({items:1,bytes:5});owners(run);
 run.advance({untilTime:30,maxEvents:1000});expect(issued(run)).toHaveLength(3);expect(run.projection.reuse.cache.some(e=>e.reservation===healthy.reservation)).toBe(true);owners(run);replay(run);
});
it.each([7,31,101,997])("bounded pressure campaign preserves actual owners and replay (seed %i)",seed=>{
 const inputs=Array.from({length:24},(_,index)=>edit(`identity-${(index*17+seed)%5}`,index*10));
 const run=start(inputs,2,10,{seed});expect(run.advance({maxEvents:4000}).reason).toBe("idle");
 expect(run.projection.reuse.cache.length).toBeLessThanOrEqual(2);expect(run.projection.global.bytes).toBeLessThanOrEqual(10);owners(run);replay(run);
});
// Full native shared prepared-input agreement remains the central #188/#189
// ABI gate. These assertions do not claim credential/configuration generation
// changes are represented by merely changing the public evaluationInputs label.

it("requires genuine advicee removal to free that owner's cached payload without consuming another owner's result",()=>{
 const run=start([edit("same",0,"a"),edit("same",0,"b")],8,128*1024,
 {sessions:[{agent:"a",seed:11,editIntervalMs:1000,variationMs:0,editsPerTask:100,taskPauseMs:1000},{agent:"b",seed:12,editIntervalMs:1000,variationMs:0,editsPerTask:100,taskPauseMs:1000}]});
 run.advance({untilTime:9,maxEvents:1000});const healthy={...run.projection.reuse.cache.find(entry=>entry.partition===2)!};
 run.applyControl({kind:"adviceeLifecycle",agent:"a",action:"remove"});run.advance({untilTime:10,maxEvents:1000});
 expect(run.projection.reuse.cache).toEqual([healthy]);expect(run.projection.global).toEqual({items:1,bytes:5});owners(run);replay(run);
});
// Explicit SameNamespaceHit/ChangedWorkMiss and controlled/authenticated capture
// fixtures live in cache-namespace.test.ts. A credentials rotate control alone
// does not establish the production dispatch credential capture or work cohort.
