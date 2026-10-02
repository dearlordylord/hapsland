import SharedEngine, { type EngineState } from "../../packages/monkey-business-bend/engine.mjs";
import { Schema } from "effect";
import { decoder, readRecord, readBendList, readNat, Nat } from "./boundary-schema.ts";
import { CanonicalLimitsSchema, type CanonicalEvent, type CanonicalProjection } from "./models.ts";
import { freezeCanonicalData } from "./immutable.ts";
import { encodeCanonicalEvent, projectCanonical, decodeTrustedCanonicalStep, projectTrustedCanonical } from "./canonical-boundary.ts";
import { encodeSharedValue, decodeSharedValue } from "./simulation-codec.ts";
import { projectImportGraph, decodeImportGraphStep } from "./graph-adapter.ts";
const graphKey = decoder(Schema.Struct({ $: Schema.Literal("Types.GraphKey"), partition: Nat, lifetime: Nat, round: Nat, operation: Nat, unit: Nat }));
const decodeLimits = decoder(CanonicalLimitsSchema);
const readList = <T>(value: unknown, decode: (value: unknown) => T): T[] => readBendList(value, decode, 2048);
const projectionOf = (state: EngineState): CanonicalProjection => {
  const projection = sharedProjections.get(state);
  if (projection === undefined) throw new TypeError("missing shared projection");
  return projection;
};
// This composition bridge accepts only original states issued by the shared Bend engine.
const sharedStates = new WeakSet<object>();
const sharedRegister = (state: EngineState): EngineState => {
  freezeCanonicalData(state);
  sharedStates.add(state);
  return state;
};
const sharedCheck = (state: EngineState): void => {
  if (!sharedStates.has(state)) throw new TypeError("foreign shared engine state");
};
const sharedProjections = new WeakMap<object, CanonicalProjection>();
const sharedCommands = new WeakMap<object, readonly unknown[]>();
const sharedProjection = (state: EngineState): CanonicalProjection => {
  const raw = decodeSharedValue(SharedEngine.canonical(state));
  return projectTrustedCanonical(raw);
};
export const initialSharedCanonical = (input: typeof CanonicalLimitsSchema.Type): EngineState => {
  const limits = decodeLimits(input);
  const state = SharedEngine.initial(encodeSharedValue({ $: "Ledger.Limits", global_items: limits.globalItems,
    global_bytes: limits.globalBytes, partition_items: limits.partitionItems, partition_bytes: limits.partitionBytes }));
  sharedProjections.set(state, sharedProjection(state));
  return sharedRegister(state);
};
export const projectSharedCanonical = (state: EngineState): CanonicalProjection => {
  sharedCheck(state);
  return projectionOf(state);
};
export const stepSharedCanonical = (state: EngineState, event: CanonicalEvent) => {
  sharedCheck(state);
  const transition = SharedEngine.step(state, encodeSharedValue(encodeCanonicalEvent(event)));
  const result = decodeTrustedCanonicalStep(decodeSharedValue(transition.result));
  const projection = projectCanonical(result.state);
  const afterActions = decodeSharedValue(SharedEngine.after(state, transition.state, encodeSharedValue(encodeCanonicalEvent(event))));
  const raw = readRecord(transition.result);
  const commands = raw.$ === "../agent-flow-bend/Canonical.Advanced" ? readList(raw.commands, x => x) : [];
  sharedRegister(transition.state);
  sharedProjections.set(transition.state, projection);
  sharedCommands.set(transition.state, commands);
  return { state: transition.state, result, afterActions };
};
export const stepSharedGraph = (state: EngineState, key: unknown, position: bigint, limits: unknown, event: unknown) => {
  sharedCheck(state);
  const transition = SharedEngine.graph_step(state, encodeSharedValue(graphKey(decodeSharedValue(key))), BigInt(readNat(decodeSharedValue(position))), encodeSharedValue(limits), encodeSharedValue(event));
  const before = decodeSharedValue(transition.before);
  const result = decodeSharedValue(transition.result);
  projectImportGraph(before);
  decodeImportGraphStep(result);
  return { state: retain(state, transition.state), before, result };
};
export const retireSharedGraph = (state: EngineState, operation: number): EngineState => {
  sharedCheck(state);
  const next = SharedEngine.retire(state, BigInt(readNat(operation)));
  return retain(state, next);
};

export const driveSharedCommand = (state: EngineState, event: CanonicalEvent, index: number, context: unknown): unknown => {
  sharedCheck(state);
  const command = sharedCommands.get(state)?.[index];
  if (!command) throw new RangeError("missing shared command");
  return decodeSharedValue(SharedEngine.handle(state, encodeSharedValue(encodeCanonicalEvent(event)), command, encodeSharedValue(context)));
};

export const editSharedCanonical = (state: EngineState, partition: number, lifetime: number): unknown => {
  sharedCheck(state);
  return decodeSharedValue(SharedEngine.edit(state, BigInt(readNat(partition)), BigInt(readNat(lifetime))));
};

const schedulerEntry = decoder(Schema.Struct({ $: Schema.Literal("Scheduler.Entry"), at: Schema.Number, order: Schema.Number }));
const decodeEntry = (value: unknown): { readonly at: number; readonly order: number } => {
  const entry = schedulerEntry(decodeSharedValue(value));
  return freezeCanonicalData({ at: readNat(entry.at), order: readNat(entry.order) });
};
const retain = (before: EngineState, next: EngineState): EngineState => {
  const projection = projectionOf(before);
  const commands = sharedCommands.get(before);
  sharedRegister(next);
  sharedProjections.set(next, projection);
  if (commands !== undefined) sharedCommands.set(next, commands);
  return next;
};
export const enqueueShared = (state: EngineState, at: number, order: number): EngineState => {
  sharedCheck(state);
  return retain(state, SharedEngine.enqueue(state, BigInt(readNat(at)), BigInt(readNat(order))));
};
export const cancelShared = (state: EngineState, order: number): EngineState => {
  sharedCheck(state);
  return retain(state, SharedEngine.cancel(state, BigInt(readNat(order))));
};
export const queuedShared = (state: EngineState): readonly { readonly at: number; readonly order: number }[] => {
  sharedCheck(state);
  return freezeCanonicalData(readList(SharedEngine.queued(state), decodeEntry));
};
const decodeOption = decoder(Schema.Union([
  Schema.Struct({ $: Schema.Literal("None") }),
  Schema.Struct({ $: Schema.Literal("Some"), value: Schema.Unknown }),
]));
export const takeShared = (state: EngineState): { readonly state: EngineState; readonly entry: { readonly at: number; readonly order: number } | undefined } => {
  sharedCheck(state);
  const taken = SharedEngine.take(state);
  const option = decodeOption(taken.entry);
  const entry = option.$ === "Some" ? decodeEntry(option.value) : undefined;
  return { state: retain(state, taken.state), entry };
};

export const fenceSharedCanonical = (state: EngineState, event: CanonicalEvent, generated: boolean, context: unknown): unknown => {
  sharedCheck(state);
  return decodeSharedValue(SharedEngine.fence(state, encodeSharedValue(encodeCanonicalEvent(event)), generated, encodeSharedValue(context)));
};

export const preparationFactTime = (delay: number, index: number, count: number): number =>
  readNat(decodeSharedValue(SharedEngine.preparation_fact_time(BigInt(readNat(delay)), BigInt(readNat(index)), BigInt(readNat(count)))));
export const preparationCompletedAction = (binding: { readonly partition: number; readonly lifetime: number; readonly round: number; readonly operation: number }, units: readonly number[], delay: number): unknown => {
  const list = units.reduceRight<unknown>((tail, head) => ({ $: "Con", head: readNat(head), tail }), { $: "Nil" });
  return decodeSharedValue(SharedEngine.preparation_completed(BigInt(readNat(binding.partition)), BigInt(readNat(binding.lifetime)), BigInt(readNat(binding.round)), BigInt(readNat(binding.operation)), encodeSharedValue(list), BigInt(readNat(delay))));
};
