import {expect,it} from "vitest";
import {captureSharingIdentityFacts,sharingIdentityLabel,encodeSharingKey,encodeSharingMember,encodeSharingPhysical,validateSharingControl} from "./sharing-controls.ts";
it("encodes a complete scoped identity without a host equivalence or evaluation cache",()=>{
 expect(encodeSharingKey({partition:1,prepared:7})).toEqual({$:"SharingScenario.Key",partition:1,prepared:7});
 expect(encodeSharingKey({partition:2,prepared:7})).toEqual({$:"SharingScenario.Key",partition:2,prepared:7});
 const member=encodeSharingMember({scope:{partition:1,lifetime:3,round:5,operation:9},subject:11,input:13,generation:17});
 expect(member.scope).toEqual({$:"FreshnessScenario.Scope",partition:1,lifetime:3,round:5,operation:9});
 expect(Object.isFrozen(member.scope)).toBe(true);expect(Object.isFrozen(member.source)).toBe(true);
 expect(encodeSharingPhysical({partition:1,lifetime:3,round:5,operation:7,request:19})).toEqual({$:"SharingScenario.Physical",partition:1,lifetime:3,round:5,operation:7,request:19});
});
it("requires original leave scope and rejects manufactured result/authority facts",()=>{
 const target={partition:1,lifetime:3,round:5,operation:9};
 expect(validateSharingControl({kind:"sharingMember",action:"leave",agent:"a",target})).toEqual({kind:"sharingMember",action:"leave",agent:"a",target});
 expect(()=>validateSharingControl({kind:"sharingMember",action:"leave",agent:"a",target:{...target,outcome:"finding"}})).toThrow();
 expect(()=>validateSharingControl({kind:"sharingMember",action:"leaveAll",agent:"a",partition:1,lifetime:0})).toThrow();
 expect(()=>encodeSharingKey({partition:0,prepared:7})).toThrow();
});

// Scope and semantic input are independent axes. Captures come from production
// WorkCohort/dispatch owners, not a current global credential counter.
it("captures original work cohort and credential scope without changing semantic input",()=>{
 const original={partition:"advicee/root",workId:"cohort-original",credentialGeneration:3,preparedIdentity:"semantic-A"};
 const capture=captureSharingIdentityFacts(original);original.workId="cohort-successor";original.credentialGeneration=4;
 expect(capture).toEqual({partition:"advicee/root",workId:"cohort-original",credentialGeneration:3,preparedIdentity:"semantic-A"});
 expect(sharingIdentityLabel(capture)).toBe('{"input":"semantic-A","partition":"advicee/root\\u0000work:cohort-original\\u0000credential-generation:3"}');
 expect(sharingIdentityLabel({...capture,workId:"cohort-successor"})).not.toBe(sharingIdentityLabel(capture));
 expect(sharingIdentityLabel({...capture,credentialGeneration:4})).not.toBe(sharingIdentityLabel(capture));
});
it("keeps actual controlled-null namespace stable and distinguishes configured credential capture",()=>{
 const controlled={partition:"advicee/root",workId:null,credentialGeneration:null,preparedIdentity:"semantic-A"};
 const original=sharingIdentityLabel(controlled);
 expect(original).toBe('{"input":"semantic-A","partition":"advicee/root\\u0000work:standalone\\u0000credential-generation:controlled"}');
 expect(sharingIdentityLabel({...controlled})).toBe(original);
 expect(sharingIdentityLabel({...controlled,credentialGeneration:3})).not.toBe(original);
 // 'controlled provider with requireCredential' is numeric when the actual
 // dispatch credential exists. No provider-mode boolean is part of this codec.
});
