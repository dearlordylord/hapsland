import { Schema } from "effect";
import { decoder, Nat, PositiveNat } from "../../../src/canonical/boundary-schema.ts";

/** Source-free facts only. Actual Canonical transitions decide selection. */
export const CollectionResponseSchema = Schema.Struct({
  partition: PositiveNat, lifetime: PositiveNat, round: PositiveNat,
  started: Nat, deadline: PositiveNat, admittedBlock: Schema.Boolean,
}).check(Schema.makeFilter(value => value.deadline >= value.started));
export const CollectionFindingFactsSchema = Schema.Struct({
  unit: PositiveNat, partition: PositiveNat, round: PositiveNat,
  snapshot: Nat, currentSnapshot: Nat, credential: Nat, currentCredential: Nat,
  ageMs: Nat, soloBytes: Nat.check(Schema.isLessThan(2 ** 47)), ready: Schema.Boolean,
  selectedCount: Nat, prospectiveBytes: Nat.check(Schema.isLessThan(2 ** 47)),
});
export type CollectionResponse = typeof CollectionResponseSchema.Type;
export type CollectionFindingFacts = typeof CollectionFindingFactsSchema.Type;
const readResponse = decoder(CollectionResponseSchema);
const readFinding = decoder(CollectionFindingFactsSchema);
export const captureCollectionResponse = (value: unknown): CollectionResponse => Object.freeze(readResponse(value));
export const encodeCollectionResponse = (value: unknown) => {
  const response = readResponse(value);
  return Object.freeze({ $: "CollectionScenario.Response", partition: response.partition,
    lifetime: response.lifetime, round: response.round, started: response.started,
    deadline: response.deadline, admitted_block: response.admittedBlock });
};
export const encodeCollectionFindingFacts = (value: unknown) => {
  const facts = readFinding(value);
  return Object.freeze({ $: "CollectionScenario.FindingFacts", unit: facts.unit,
    partition: facts.partition, round: facts.round, snapshot: facts.snapshot,
    current_snapshot: facts.currentSnapshot, credential: facts.credential,
    current_credential: facts.currentCredential, age_ms: facts.ageMs,
    solo_bytes: facts.soloBytes, ready: facts.ready, selected_count: facts.selectedCount,
    prospective_bytes: facts.prospectiveBytes });
};

export const ResponseIdentitySchema = Schema.Struct({
  id: PositiveNat, partition: PositiveNat, lifetime: PositiveNat, round: PositiveNat,
});
const Agent = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2048));
/** The target is always the originally captured response tuple, never latest scope. */
export const CollectionResponseControlSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("collectionResponse"), action: Schema.Literal("open"),
    agent: Agent, response: CollectionResponseSchema }),
  Schema.Struct({ kind: Schema.Literal("collectionResponse"), action: Schema.Literal("close"),
    agent: Agent, target: ResponseIdentitySchema }),
  Schema.Struct({ kind: Schema.Literal("collectionResponse"), action: Schema.Literal("attempt"),
    agent: Agent, target: ResponseIdentitySchema, currentBlock: Schema.Boolean }),
]);
export type CollectionResponseControl = typeof CollectionResponseControlSchema.Type;
const readControl = decoder(CollectionResponseControlSchema);
export const validateCollectionResponseControl = (value: unknown): CollectionResponseControl => {
  const control = readControl(value);
  return Object.freeze(control.action === "open"
    ? { ...control, response: Object.freeze(control.response) }
    : { ...control, target: Object.freeze(control.target) });
};

export type CollectionResponseIdentity = typeof ResponseIdentitySchema.Type;
export type CollectionResponseReport = { readonly at: number; readonly controlSequence: number;
  readonly control: CollectionResponseControl; readonly result: "applied" | "missing" | "wrongScope" | "alreadyAttempting" | "identityExhausted" | "contextBound";
  readonly issued?: CollectionResponseIdentity };
export const decodeCollectionResponseIdentity = decoder(ResponseIdentitySchema);
export const encodeCollectionResponseIdentity = (value: unknown) => {
  const identity = decodeCollectionResponseIdentity(value);
  return Object.freeze({ $: "CollectionScenario.Identity", ...identity });
};
