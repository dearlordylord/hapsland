import {expect,it} from "vitest";
import {initialCanonical,stepCanonical,projectCanonical,type CanonicalEvent} from "../../../src/canonical/adapter.ts";
import {runWorkloadNative, WORKLOAD_CONFORMANCE_TIMEOUT_MS } from "../../monkey-business-bend/conformance/workload-native-runner.mjs";

// Independent ORIGINAL finite command script. Release facts below name the
// original pre-command owners explicitly. Native uses real shared feedback.
it("compares original native cache pressure and refusal to emitted public Canonical owners",()=>{
 const native=runWorkloadNative(new URL("../../monkey-business-bend/conformance/cache-native.bend",import.meta.url)) as number[][][];
 let state=initialCanonical({globalItems:512,globalBytes:1048576,partitionItems:16,partitionBytes:65536});
 const send=(event:CanonicalEvent)=>{const result=stepCanonical(state,event);expect(result.rejection).toBeUndefined();state=result.state;return result.commands;};
 const row=(payloads:number)=>{const p=projectCanonical(state);return [[p.global.items,p.global.bytes,payloads,p.reuse.claims.length],p.reuse.cache.flatMap(e=>[e.id,e.partition,e.bytes,e.reservation]),p.charges.flatMap(c=>[c.id,c.partition,c.bytes])];};
 const prepare=(id:number,entryLimit:number)=>send({kind:"cachePrepare",id,bytes:5,entryLimit,byteLimit:20});
 const reserve=(partition:number)=>send({kind:"reserveCapacity",partition,bytes:5,purpose:"storedResult"});
 const commit=(id:number,partition:number,reservation:number,entryLimit:number)=>send({kind:"cacheCommit",id,partition,bytes:5,reservation,entryLimit,byteLimit:20});
 const add=(id:number,partition:number,reservation:number,entryLimit:number)=>{prepare(id,entryLimit);reserve(partition);expect(commit(id,partition,reservation,entryLimit).some(c=>c.kind==="cacheCommitted")).toBe(true);};
 const rows:number[][][]=[];
 add(11,1,1,2);rows.push(row(1));add(22,2,2,2);rows.push(row(2));
 expect(send({kind:"reuseTouch",id:11}).some(c=>c.kind==="reuseCached")).toBe(true);rows.push(row(2));
 expect(prepare(33,2)).toContainEqual({kind:"cachePrepared",evicted:[22]});send({kind:"releaseCapacity",reservation:2});rows.push(row(1));
 reserve(1);commit(33,1,3,2);rows.push(row(2));add(44,2,4,3);rows.push(row(3));
 expect(send({kind:"cacheDiscardPartition",partition:1})).toContainEqual({kind:"cacheDiscarded",ids:[11,33]});
 send({kind:"releaseCapacity",reservation:1});send({kind:"releaseCapacity",reservation:3});rows.push(row(1));
 expect(send({kind:"cacheClear"})).toContainEqual({kind:"cacheDiscarded",ids:[44]});send({kind:"releaseCapacity",reservation:4});rows.push(row(0));
 state=initialCanonical({globalItems:512,globalBytes:1048576,partitionItems:16,partitionBytes:65536});
 reserve(1);reserve(2);prepare(11,1);prepare(22,1);commit(11,1,1,1);rows.push(row(1));
 expect(commit(22,2,2,1)).toContainEqual({kind:"reuseRefused"});send({kind:"releaseCapacity",reservation:2});rows.push(row(1));
 send({kind:"cacheClear"});send({kind:"releaseCapacity",reservation:1});rows.push(row(0));
 state=initialCanonical({globalItems:512,globalBytes:1048576,partitionItems:16,partitionBytes:65536});add(11,1,1,1);rows.push(row(1));
 expect(send({kind:"cachePrepare",id:22,bytes:21,entryLimit:1,byteLimit:20})).toContainEqual({kind:"cacheRejected"});rows.push(row(1));
 expect(native).toEqual(rows);
 // Exact cache and logical-charge rows are finite evidence. This does not claim
 // full Driver graph/request/output trace agreement or prepared credential and
 // configuration changes; those require the central #187/#188/#189 ABI gate.
}, WORKLOAD_CONFORMANCE_TIMEOUT_MS);
