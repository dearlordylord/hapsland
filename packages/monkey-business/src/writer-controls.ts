import { decodeSharedValue } from "../../../src/canonical/simulation-codec.ts";
import type { CollectionResponseIdentity, CollectionResponseReport } from "./collection-scenario.ts";
import { Schema } from "effect";
import { decoder, Nat, PositiveNat, readBendList } from "../../../src/canonical/boundary-schema.ts";
import { CollectionResponseSchema, encodeCollectionResponse } from "./collection-scenario.ts";
import { decodeDriverEvent } from "./driver-codec.ts";

const Agent=Schema.String.check(Schema.isMinLength(1),Schema.isMaxLength(2048));
const Duration=PositiveNat.check(Schema.isLessThanOrEqualTo(1_000_000_000));
export const WriterTargetSchema=Schema.Struct({partition:PositiveNat,lifetime:PositiveNat,round:PositiveNat,token:PositiveNat});
export const WriterCaptureSchema=Schema.Struct({target:WriterTargetSchema,claimStarted:Nat,claimLifetimeMs:Duration,capacity:PositiveNat,response:CollectionResponseSchema})
  .check(Schema.makeFilter(value=>value.claimStarted<=2**48-1-value.claimLifetimeMs));
export const WriterControlSchema=Schema.Union([
  Schema.Struct({kind:Schema.Literal("backgroundWriter"),action:Schema.Literal("claim"),agent:Agent,capture:WriterCaptureSchema}),
  Schema.Struct({kind:Schema.Literal("backgroundWriter"),action:Schema.Literals(["release","expire"]),agent:Agent,target:WriterTargetSchema}),
  Schema.Struct({kind:Schema.Literal("backgroundWriter"),action:Schema.Literal("attempt"),agent:Agent,target:WriterTargetSchema,currentBlock:Schema.Boolean}),
]);
export type WriterTarget=typeof WriterTargetSchema.Type;
export type WriterCapture=typeof WriterCaptureSchema.Type;
export type WriterControl=typeof WriterControlSchema.Type;
const readCapture=decoder(WriterCaptureSchema),readControl=decoder(WriterControlSchema);
export const captureWriter=(value:unknown):WriterCapture=>{
  const capture=readCapture(value);
  return Object.freeze({...capture,target:Object.freeze(capture.target),response:Object.freeze(capture.response)});
};
export const validateWriterControl=(value:unknown):WriterControl=>{
  const control=readControl(value);
  return Object.freeze(control.action==="claim"?{...control,capture:captureWriter(control.capture)}:{...control,target:Object.freeze(control.target)});
};
export const encodeWriterCapture=(value:unknown)=>{
  const capture=captureWriter(value),target=capture.target;
  return Object.freeze({$:"WriterScenario.ClaimFacts",target:Object.freeze({$:"WriterScenario.Target",...target}),
    claim_started:capture.claimStarted,claim_lifetime:capture.claimLifetimeMs,capacity:capture.capacity,
    response:encodeCollectionResponse(capture.response)});
};
/** Actual Canonical events only; no host claim, waiter or response policy. */
export const decodeWriterEvents=(value:unknown)=>Object.freeze(readBendList(value,event=>decodeDriverEvent(decodeSharedValue(event)),2048));

export const encodeWriterTarget=(value:unknown)=>({$:"WriterScenario.Target",...decoder(WriterTargetSchema)(value)});
/** Strict emitted capsule shape; public controls never supply this capability. */
const WriterWireTargetSchema=Schema.Struct({$:Schema.Literal("WriterScenario.Target"),partition:PositiveNat,lifetime:PositiveNat,round:PositiveNat,token:PositiveNat});
const WriterWireResponseSchema=Schema.Struct({$:Schema.Literal("CollectionScenario.Response"),partition:PositiveNat,lifetime:PositiveNat,round:PositiveNat,started:Nat,deadline:Nat,admitted_block:Schema.Boolean});
export const WriterPendingSchema=Schema.Struct({$:Schema.Literal("WriterScenario.Pending"),credential:Nat,
  facts:Schema.Struct({$:Schema.Literal("WriterScenario.ClaimFacts"),
    target:WriterWireTargetSchema,
    claim_started:Nat,claim_lifetime:Duration,capacity:PositiveNat,
    response:WriterWireResponseSchema})});
export const decodeWriterPending=decoder(WriterPendingSchema);

export type WriterReport={ readonly at:number; readonly controlSequence:number; readonly control:WriterControl;
  readonly result:CollectionResponseReport["result"] | "queued"; readonly issued?:CollectionResponseIdentity; readonly target?:CollectionResponseIdentity };
export const WriterIssuedCaptureSchema=Schema.Struct({$:Schema.Literal("WriterScenario.Capture"),
  target:WriterWireTargetSchema,
  claim_started:Nat,claim_lifetime:Duration,capacity:PositiveNat,response_id:PositiveNat,
  response:WriterWireResponseSchema});
export const decodeWriterIssuedCapture=decoder(WriterIssuedCaptureSchema);
