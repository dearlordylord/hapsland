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
const sharedPredecessors = new WeakMap<object, EngineState>();
const sharedProjection = (state: EngineState): CanonicalProjection => {
  const raw = SharedEngine.canonical(state);
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
  const result = decodeTrustedCanonicalStep(transition.result);
  const projection = projectCanonical(result.state);
  const afterActions = decodeSharedValue(SharedEngine.after(state, transition.state, encodeSharedValue(encodeCanonicalEvent(event))));
  const raw = readRecord(transition.result);
  const commands = raw.$ === "Canonical.Advanced" ? readList(raw.commands, x => x) : [];
  sharedRegister(transition.state);
  sharedProjections.set(transition.state, projection);
  sharedCommands.set(transition.state, commands);
  sharedPredecessors.set(transition.state, state);
  return { state: transition.state, result, afterActions };
};
export const stepSharedGraph = (state: EngineState, key: unknown, position: bigint, limits: unknown, event: unknown) => {
  sharedCheck(state);
  const transition = SharedEngine.graph_step(state, encodeSharedValue(graphKey(decodeSharedValue(key))), BigInt(readNat(decodeSharedValue(position))), encodeSharedValue(limits), encodeSharedValue(event));
  if (transition.$ === "Types.GraphRejected") throw new Error("preparation graph step is out of order");
  const before = transition.before;
  const result = transition.result;
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

export const editSharedCanonical = (state: EngineState, partition: number, lifetime: number) => {
  sharedCheck(state);
  const transition = SharedEngine.edit_attempt(state, BigInt(readNat(partition)), BigInt(readNat(lifetime)));
  return { state: retain(state, transition.state), plan: decodeSharedValue(transition.plan) };
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
  const predecessor = sharedPredecessors.get(before);
  if (predecessor) sharedPredecessors.set(next, predecessor);
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

export const revalidateSharedCanonical = (state: EngineState, context: unknown): unknown => {
  sharedCheck(state);
  return decodeSharedValue(SharedEngine.revalidate(state, encodeSharedValue(context)));
};

export const configureSharedSeed = (state: EngineState, seed: number): EngineState => {
  sharedCheck(state);
  return retain(state, SharedEngine.configure_seed(state, BigInt(readNat(seed))));
};
export const sharedClock = (state: EngineState): number => {
  sharedCheck(state); return readNat(SharedEngine.clock(state));
};
export const configureSharedWorkload = (state: EngineState, partition: number, profile: unknown): EngineState => {
  sharedCheck(state);
  return retain(state, SharedEngine.configure_workload(state, BigInt(readNat(partition)), encodeSharedValue(profile)));
};
const workloadEvent = decoder(Schema.Struct({
  $: Schema.Literal("Workload.Emission"), at: Nat, partition: Nat, generation: Nat,
  kind: Nat, task: Nat, revision: Nat, bytes: Nat, units: Schema.Unknown,
  repair: Schema.Boolean, recurring: Schema.Boolean,
}));
export const actSharedWorkload = (state: EngineState, partition: number, action: unknown) => {
  sharedCheck(state);
  const transition = SharedEngine.workload_action(state, BigInt(readNat(partition)), encodeSharedValue(action));
  if (!transition.valid) throw new RangeError("workload due time outside u48 clock");
  const events = readList(transition.events, event => {
    const item = workloadEvent(decodeSharedValue(event));
    return { ...item, units: readBendList(item.units, readNat, 1024) };
  });
  return { state: retain(state, transition.state), events };
};
export const validSharedWorkload = (state: EngineState, partition: number, generation: number, recurring: boolean): boolean => {
  sharedCheck(state);
  return SharedEngine.workload_valid(state, BigInt(readNat(partition)), BigInt(readNat(generation)), recurring);
};
const preTiming = decoder(Schema.Struct({ $: Schema.Literal("Workload.PreTiming"), started: Nat, deadline: Nat, post: Nat, duration: Nat, valid: Schema.Boolean }));
export const preSharedTiming = (state: EngineState, partition: number, provided: number | undefined, fallback: number, lifetime: number) => {
  sharedCheck(state);
  const option = provided === undefined ? { $: "None" } : { $: "Some", value: readNat(provided) };
  const timing = preTiming(decodeSharedValue(SharedEngine.pre_timing(state, BigInt(readNat(partition)), encodeSharedValue(option), BigInt(readNat(fallback)), BigInt(readNat(lifetime)))));
  if (!timing.valid) throw new RangeError("PRE due time outside u48 clock");
  return timing;
};
export const sampleSharedOutcome = (state: EngineState, weights: unknown) => {
  sharedCheck(state);
  const transition = SharedEngine.sample_outcome(state, encodeSharedValue(weights));
  const outcome = readNat(transition.outcome);
  if (outcome > 5) throw new TypeError("invalid shared outcome");
  return { state: retain(state, transition.state), outcome };
};

export const issueSharedPre = (state: EngineState, facts: unknown): unknown => {
  sharedCheck(state);
  return decodeSharedValue(SharedEngine.pre_issue(state, encodeSharedValue(facts)));
};
export const capturedSharedPermit = (state: EngineState, capture: unknown): unknown => {
  sharedCheck(state);
  return decodeSharedValue(SharedEngine.permit_actions(state, encodeSharedValue(capture)));
};

const credentialFacts = decoder(Schema.Struct({ $: Schema.Literal("CredentialFacts.State"), available: Schema.Boolean, generation: Nat, issued: Schema.Unknown }));
export const sharedCredentialFacts = (state: EngineState) => {
  sharedCheck(state);
  return credentialFacts(decodeSharedValue(SharedEngine.credentials(state)));
};
export const configureSharedCredentials = (state: EngineState, available: boolean, generation: number): EngineState => {
  sharedCheck(state);
  const checked = credentialFacts({ $: "CredentialFacts.State", available, generation, issued: { $: "Nil" } });
  return retain(state, SharedEngine.configure_credentials(state, checked.available, BigInt(checked.generation)));
};
export const actSharedCredentials = (state: EngineState, action: "unavailable" | "restore" | "rotate"): EngineState => {
  sharedCheck(state);
  if (action === "rotate" && sharedCredentialFacts(state).generation === 281474976710655)
    throw new RangeError("credential generation outside u48 range");
  return retain(state, SharedEngine.credential_action(state, action === "restore", action === "rotate"));
};
export const interveneSharedRequest = (state: EngineState, target: { readonly partition: number; readonly lifetime: number; readonly round: number; readonly operation: number; readonly request: number }, outcome: unknown, delay: number): unknown => {
  sharedCheck(state);
  const binding = { $: "FaultTargets.Target", partition: readNat(target.partition), lifetime: readNat(target.lifetime), round: readNat(target.round), operation: readNat(target.operation), request: readNat(target.request) };
  return decodeSharedValue(SharedEngine.intervene_request(state, encodeSharedValue(binding), encodeSharedValue(outcome), BigInt(readNat(delay))));
};

const adviceeScope = decoder(Schema.Struct({ $: Schema.Literal("Advicees.Scope"), identity: Nat, partition: Nat, seed: Nat }));
const adviceeOption = decoder(Schema.Union([Schema.Struct({ $: Schema.Literal("None") }), Schema.Struct({ $: Schema.Literal("Some"), value: Schema.Unknown })]));
export const declareSharedAdvicee = (state: EngineState, identity: number, seed: number) => {
  sharedCheck(state);
  const result = SharedEngine.declare_advicee(state, BigInt(readNat(identity)), readNat(seed));
  if (!result.valid) throw new RangeError("invalid advicee declaration");
  const option = adviceeOption(decodeSharedValue(result.scope));
  if (option.$ !== "Some") throw new TypeError("missing declared advicee scope");
  return { state: retain(state, result.state), scope: adviceeScope(option.value) };
};
const scopeOption = decoder(Schema.Union([Schema.Struct({ $: Schema.Literal("None") }), Schema.Struct({ $: Schema.Literal("Some"), value: Nat })]));
export const sharedEventScope = (state: EngineState, event: CanonicalEvent, provided?: number): number | undefined => {
  sharedCheck(state);
  const option = provided === undefined ? { $: "None" } : { $: "Some", value: readNat(provided) };
  const result = scopeOption(decodeSharedValue(SharedEngine.scope_event(state, state, encodeSharedValue(encodeCanonicalEvent(event)), encodeSharedValue(option))));
  return result.$ === "Some" ? result.value : undefined;
};

export const sharedCommandScope = (state: EngineState, index: number, provided?: number): number | undefined => {
  sharedCheck(state);
  const command = sharedCommands.get(state)?.[index];
  const before = sharedPredecessors.get(state);
  if (command === undefined || before === undefined) throw new RangeError("missing shared command attribution");
  const option = provided === undefined ? { $: "None" } : { $: "Some", value: readNat(provided) };
  const result = scopeOption(decodeSharedValue(SharedEngine.scope_command(before, state, command, encodeSharedValue(option))));
  return result.$ === "Some" ? result.value : undefined;
};

export const issueSharedActions = (state: EngineState, actions: unknown) => {
  sharedCheck(state);
  const transition = SharedEngine.issue_actions(state, encodeSharedValue(actions));
  return { state: retain(state, transition.state), actions: decodeSharedValue(transition.actions) };
};

export const sharedCapturedCredential = (state: EngineState, operation: number): number | undefined => {
  sharedCheck(state);
  const value = scopeOption(decodeSharedValue(SharedEngine.credential_captured(state, BigInt(readNat(operation)))));
  return value.$ === "Some" ? value.value : undefined;
};
export const sharedCredentialMatches = (state: EngineState, operation: number): boolean => {
  sharedCheck(state);
  return SharedEngine.credential_matches(state, BigInt(readNat(operation)));
};
export const sharedCallbackMatches = (event: CanonicalEvent, target: { readonly partition: number; readonly lifetime: number; readonly round: number; readonly operation: number; readonly request: number }): boolean =>
  SharedEngine.callback_matches(encodeSharedValue(encodeCanonicalEvent(event)), encodeSharedValue({ $: "FaultTargets.Target", ...target }));
