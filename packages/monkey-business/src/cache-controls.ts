import {Schema} from "effect";
import {decoder,PositiveNat,ByteCount} from "../../../src/canonical/boundary-schema.ts";
import {encodeDriverOutcome} from "./driver-codec.ts";
import {SharingKeySchema,SharingScopeSchema} from "./sharing-controls.ts";

/** The complete production reuse namespace plus prepared.identity is interned
 * bijectively by the edge; the key partition remains the logical ledger owner. This codec
 * captures original provenance and contains no cache eligibility policy. */
export const CacheOfferSchema=Schema.Struct({id:PositiveNat,key:SharingKeySchema,original:SharingScopeSchema,
 bytes:ByteCount,outcome:Schema.Literal("clear","finding")}).check(Schema.makeFilter(value=>value.key.partition===value.original.partition));
export type CacheOffer=typeof CacheOfferSchema.Type;
const readOffer=decoder(CacheOfferSchema);
export const captureCacheOffer=(value:unknown):CacheOffer=>{
 const offer=readOffer(value);return Object.freeze({...offer,key:Object.freeze(offer.key),original:Object.freeze(offer.original)});
};
export const encodeCacheOffer=(value:unknown)=>{
 const offer=captureCacheOffer(value);
 return Object.freeze({$:"CacheScenario.Offer",id:offer.id,key:Object.freeze({$:"SharingScenario.Key",...offer.key}),
 original:Object.freeze({$:"FreshnessScenario.Scope",...offer.original}),bytes:offer.bytes,outcome:encodeDriverOutcome(offer.outcome)});
};
// No new cache capacity setting, TTL or result-injection control is introduced.
