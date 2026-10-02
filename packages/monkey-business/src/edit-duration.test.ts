import { expect, it } from 'vitest';
import { createRun, restoreReplay, type RunConfig } from './index.ts';
const config: RunConfig = { retention:10000,outcome:'clear',sessions:[1,2].map(i=>({agent:`agent-${i}`,seed:i,editIntervalMs:10,variationMs:0,editsPerTask:1,editDurationMs:300,bytes:10})),lifecycles:{permits:{adviceeLimit:4,residentLimit:8,holdMs:1,lifetimeMs:1000}} };
it('captures per-agent PRE-to-POST timing without changing in-flight edits and replays exactly',()=>{
 const run=createRun(config);run.advance({untilTime:11,maxEvents:100});
 expect(run.projection.admissions.flatMap(a=>a.permits)).toHaveLength(2);
 const issued=run.observations.filter(o=>o.event.kind==='issuePermit');expect(issued).toHaveLength(2);
 run.applyControl({kind:'editDuration',agent:'agent-1',durationMs:20});run.applyControl({kind:'burst',agent:'agent-1',count:1});run.advance({untilTime:50,maxEvents:500});
 const early=run.observations.filter(o=>o.commands.some(c=>c.kind==='permitConsumed'));expect(early).toHaveLength(1);expect(early[0]?.partition).toBe(1);
 expect(run.projection.admissions.flatMap(a=>a.permits)).toHaveLength(2);
 for(const agent of ['agent-1','agent-2'])run.applyControl({kind:'suspendArrivals',agent,suspended:true});
 expect(run.advance({untilTime:900,maxEvents:2000}).reason).toBe('idle');
 const consumed=run.observations.filter(o=>o.commands.some(c=>c.kind==='permitConsumed'));expect(consumed).toHaveLength(3);
 for(const first of issued) expect(consumed.some(o=>o.partition===first.partition&&o.time===first.time+300)).toBe(true);
 expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);expect(restoreReplay(run.exportReplay()).projection).toEqual(run.projection);
});
it.each([0,10,11])('handles duration %i against a fixed 10ms deadline without reviving expired authority',duration=>{
 const run=createRun({...config,sessions:[{agent:'agent-1',editIntervalMs:10,variationMs:0,editsPerTask:1,editDurationMs:duration}],lifecycles:{permits:{adviceeLimit:2,residentLimit:2,holdMs:1,lifetimeMs:10}}});run.advance({untilTime:11,maxEvents:100});run.applyControl({kind:'editDuration',agent:'agent-1',durationMs:0});run.applyControl({kind:'suspendArrivals',suspended:true});run.advance({untilTime:100,maxEvents:500});
 expect(run.observations.filter(o=>o.commands.some(c=>c.kind==='permitConsumed'))).toHaveLength(duration<=10?1:0);
 expect(run.projection.admissions.flatMap(a=>a.permits)).toEqual([]);if(duration>10)expect(run.projection.rounds).toEqual([]);
 expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
});
it('rejects invalid duration configuration and controls, including serialized replay',()=>{
 for(const duration of [-1,0.5,Number.NaN,1_000_000_001]){
  expect(()=>createRun({...config,sessions:[{editDurationMs:duration}]})).toThrow();const run=createRun(config);expect(()=>run.applyControl({kind:'editDuration',durationMs:duration})).toThrow();
 }
 const run=createRun(config);run.advance({untilTime:11,maxEvents:100});run.applyControl({kind:'editDuration',agent:'agent-1',durationMs:10});const replay=structuredClone(run.exportReplay());(replay.controls[0]!.control as {durationMs:number}).durationMs=-1;expect(()=>restoreReplay(replay)).toThrow();
});
