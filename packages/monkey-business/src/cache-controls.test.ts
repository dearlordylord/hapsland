import {expect,it} from "vitest";
import {captureCacheOffer,encodeCacheOffer} from "./cache-controls.ts";
const original={partition:1,lifetime:2,round:3,operation:4};
const offer={id:7,key:{partition:1,prepared:23},original,bytes:5,outcome:"finding"};
it("captures original cache provenance without rewriting it after supersession",()=>{
 const held=captureCacheOffer(offer);original.round=99;
 expect(held.original.round).toBe(3);expect(Object.isFrozen(held.original)).toBe(true);expect(Object.isFrozen(held.key)).toBe(true);
 expect(encodeCacheOffer({...offer,original:{...original,round:3}})).toEqual({$:"CacheScenario.Offer",id:7,key:{$:"SharingScenario.SharingKey",partition:1,prepared:23},
  original:{$:"FreshnessScenario.Scope",partition:1,lifetime:2,round:3,operation:4},bytes:5,outcome:{$:"Canonical.RequestFinding"}});
});
it("rejects cross-partition attribution, unsupported result sources and extra fields",()=>{
 expect(()=>captureCacheOffer({...offer,key:{partition:2,prepared:23}})).toThrow();
 expect(()=>captureCacheOffer({...offer,outcome:"timeout"})).toThrow();
 expect(()=>captureCacheOffer({...offer,ttl:10})).toThrow();
 expect(()=>captureCacheOffer({...offer,bytes:2**47})).toThrow();
});
