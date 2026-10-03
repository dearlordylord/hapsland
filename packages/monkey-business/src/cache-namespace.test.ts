import { semanticIdentity, type ReviewInput } from "../../../src/direct-event/model.ts";
import { TYPE_INPUT_CONTRACT } from "../../../src/rules/targets.ts";
import {expect,it} from "vitest";
import {initialCanonical,stepCanonical,projectCanonical,type CanonicalEvent} from "../../../src/canonical/adapter.ts";
import {sharingIdentityLabel,captureSharingIdentityFacts,type SharingIdentityFacts} from "./sharing-controls.ts";
import {runWorkloadNative} from "../../monkey-business-bend/conformance/workload-native-runner.mjs";

// Independent original source-free captures. Production source owners:
// server.ts:628 / capacity.ts:194–196 create a WorkCohort; round-records.ts:37–40
// keeps it for the same binding. server.ts:1468 replaces it only at real cutoff.
// server.ts:1693 uses dispatch.credential.generation or the controlled sentinel;
// model.ts:231 excludes credentials/work from prepared semantic identity.
const original=captureSharingIdentityFacts({partition:"advicee/root",workId:"cohort-A",credentialGeneration:3,preparedIdentity:"semantic-A"});
const controlled=captureSharingIdentityFacts({...original,credentialGeneration:null});
const cases:ReadonlyArray<{name:string;stored:SharingIdentityFacts;next:SharingIdentityFacts;id:number;command:"reuseCached"|"reuseOwn"}>=[
 {name:"SameNamespaceHit",stored:original,next:{...original},id:11,command:"reuseCached"},
 {name:"ChangedWorkMiss",stored:original,next:{...original,workId:"cohort-B"},id:22,command:"reuseOwn"},
 {name:"AuthenticatedGenerationChangedMiss",stored:original,next:{...original,credentialGeneration:4},id:33,command:"reuseOwn"},
 {name:"ControlledNullSameNamespaceHit",stored:controlled,next:{...controlled},id:11,command:"reuseCached"},
 {name:"ControlledWithConfiguredCredentialMiss",stored:controlled,next:{...controlled,credentialGeneration:3},id:44,command:"reuseOwn"},
];
// Ids are fixture-local bijective intern labels supplied at the public boundary,
// not a host equality cache. The previous scope always has label 11.
it.each(cases)("$name observes actual Canonical without changing original payload ownership",({stored,next,id,command})=>{
 expect(next.preparedIdentity).toBe(stored.preparedIdentity);
 if(command==="reuseCached")expect(sharingIdentityLabel(next)).toBe(sharingIdentityLabel(stored));
 else expect(sharingIdentityLabel(next)).not.toBe(sharingIdentityLabel(stored));
 let state=initialCanonical({globalItems:512,globalBytes:1048576,partitionItems:16,partitionBytes:65536});
 const send=(event:CanonicalEvent)=>{const result=stepCanonical(state,event);expect(result.rejection).toBeUndefined();state=result.state;return result.commands;};
 send({kind:"reserveCapacity",partition:1,bytes:5,purpose:"storedResult"});
 expect(send({kind:"cacheCommit",id:11,partition:1,bytes:5,reservation:1,entryLimit:8,byteLimit:128*1024})).toContainEqual({kind:"cacheCommitted"});
 const before=projectCanonical(state);expect(send({kind:"reuseRoute",id,liveAdvice:false})).toContainEqual({kind:command});
 const after=projectCanonical(state);expect(after.reuse.cache).toEqual(before.reuse.cache);expect(after.charges).toEqual(before.charges);
 expect(after.global).toEqual({items:1,bytes:5});expect(after.reuse.claims.map(claim=>claim.id)).toEqual(command==="reuseOwn"?[id]:[]);
});
it("compares native original namespace routes to the emitted public Canonical boundary",()=>{
 const native=runWorkloadNative(new URL("../../monkey-business-bend/conformance/cache-namespace-native.bend",import.meta.url)) as number[][];
 const rows=cases.map(({id})=>{
  let state=initialCanonical({globalItems:512,globalBytes:1048576,partitionItems:16,partitionBytes:65536});
  const send=(event:CanonicalEvent)=>{const result=stepCanonical(state,event);expect(result.rejection).toBeUndefined();state=result.state;return result.commands;};
  send({kind:"reserveCapacity",partition:1,bytes:5,purpose:"storedResult"});send({kind:"cacheCommit",id:11,partition:1,bytes:5,reservation:1,entryLimit:8,byteLimit:128*1024});
  const commands=send({kind:"reuseRoute",id,liveAdvice:false}),p=projectCanonical(state);
  const code=commands.some(c=>c.kind==="reuseCached")?1:commands.some(c=>c.kind==="reuseOwn")?2:99;
  return [code,p.global.items,p.global.bytes,p.reuse.claims.length,p.reuse.cache.length,p.reuse.cache[0]!.id,p.reuse.cache[0]!.reservation];
 });
 expect(native).toEqual(rows);
 // This is finite exact namespace routing/owner evidence, not a full Driver
 // graph/request/output agreement claim. Original capture acquisition remains
 // central #188/#189 wiring, never inferred from an unrelated global counter.
},30000);

// Production semantic identity contains provider/model/full destination. The
// work cohort and credentials remain separately captured resident namespaces.
it("captures provider destination independently from work and credential namespace", () => {
 const declaration = { id: "type.ts::Count", kind: "type-alias" as const, name: "Count",
  source: "type Count = number", sourceHash: "count-number" };
 const input: ReviewInput = { providerIdentity: { provider: "jev", model: "jev-latest", destination: "https://review.example/one" },
  contract: TYPE_INPUT_CONTRACT, completeness: "complete", path: "type.ts", declaration,
  unit: { root: { artifact: declaration, references: [] } }, rules: [],
  interpretation: "probability-strictly-greater-than-threshold" };
 const preparedIdentity = semanticIdentity(input);
 const captured = captureSharingIdentityFacts({ ...original, preparedIdentity });
 for (const providerIdentity of [
  { ...input.providerIdentity, provider: "cloudflare" as const },
  { ...input.providerIdentity, model: "clef" as const },
  { ...input.providerIdentity, destination: "https://review.example/two" },
 ]) {
  const changed = captureSharingIdentityFacts({ ...captured, preparedIdentity: semanticIdentity({ ...input, providerIdentity }) });
  expect(changed.workId).toBe("cohort-A");
  expect(changed.credentialGeneration).toBe(3);
  expect(changed.preparedIdentity).not.toBe(captured.preparedIdentity);
  expect(sharingIdentityLabel(changed)).not.toBe(sharingIdentityLabel(captured));
 }
 const snapshot = { ...input, sourceFingerprints: [{ path: "type.ts", contentHash: "fresh", byteLength: 19 }] };
 expect(semanticIdentity(snapshot)).toBe(preparedIdentity);
 expect(captured).toEqual({ ...original, preparedIdentity });
});
