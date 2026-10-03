import {expect,it} from "vitest";
import {encodeSharingKey,encodeSharingMember,encodeSharingPhysical,validateSharingControl} from "./sharing-controls.ts";
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
