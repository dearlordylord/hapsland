import {Schema} from "effect";
import {decoder,PositiveNat,readBendList} from "../../../src/canonical/boundary-schema.ts";
import {decodeDriverEvent} from "./driver-codec.ts";

/** A member names its original admission/scope, not the current owner lookup. */
export const SharingScopeSchema=Schema.Struct({partition:PositiveNat,lifetime:PositiveNat,round:PositiveNat,operation:PositiveNat});
export const SharingMemberSchema=Schema.Struct({scope:SharingScopeSchema,subject:PositiveNat,input:PositiveNat,generation:PositiveNat});
export const SharingKeySchema=Schema.Struct({partition:PositiveNat,prepared:PositiveNat});
export const SharingPhysicalSchema=Schema.Struct({...SharingScopeSchema.fields,request:PositiveNat});
const Agent=Schema.String.check(Schema.isMinLength(1),Schema.isMaxLength(2048));
export const SharingControlSchema=Schema.Union([
 Schema.Struct({kind:Schema.Literal("sharingMember"),action:Schema.Literal("leave"),agent:Agent,target:SharingScopeSchema}),
 Schema.Struct({kind:Schema.Literal("sharingMember"),action:Schema.Literal("leaveAll"),agent:Agent,partition:PositiveNat,lifetime:PositiveNat}),
]);
export type SharingScope=typeof SharingScopeSchema.Type;
export type SharingMember=typeof SharingMemberSchema.Type;
export type SharingKey=typeof SharingKeySchema.Type;
export type SharingPhysical=typeof SharingPhysicalSchema.Type;
export type SharingControl=typeof SharingControlSchema.Type;
const readMember=decoder(SharingMemberSchema),readKey=decoder(SharingKeySchema),readPhysical=decoder(SharingPhysicalSchema),readControl=decoder(SharingControlSchema);
export const encodeSharingMember=(value:unknown)=>{
 const member=readMember(value);
 return Object.freeze({$:"SharingScenario.Member",scope:Object.freeze({$:"FreshnessScenario.Scope",...member.scope}),
  source:Object.freeze({$:"FreshnessScenario.Source",subject:member.subject,input:member.input}),generation:member.generation});
};
export const encodeSharingKey=(value:unknown)=>Object.freeze({$:"SharingScenario.Key",...readKey(value)});
export const encodeSharingPhysical=(value:unknown)=>Object.freeze({$:"SharingScenario.Physical",...readPhysical(value)});
export const validateSharingControl=(value:unknown):SharingControl=>{
 const control=readControl(value);return Object.freeze(control.action==="leave"?{...control,target:Object.freeze(control.target)}:control);
};
/** Scenario controls cannot manufacture a result, a claim or current authority. */
export const decodeSharingEvents=(value:unknown)=>Object.freeze(readBendList(value,decodeDriverEvent,2048));
