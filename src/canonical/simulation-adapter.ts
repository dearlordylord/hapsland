import { encodeWriterCapture, encodeWriterTarget, decodeWriterPending, decodeWriterIssuedCapture, type WriterCapture, type WriterTarget } from "../../packages/monkey-business/src/writer-controls.ts";
import { encodeStopInput, encodeStopProgress, decodeStopFound, decodeStopRegistry, encodeStopCommandFacts, decodeStopCommand, type StopCommandFacts, type StopProgress } from "../../packages/monkey-business/src/stop-codec.ts";
import { encodeCollectorProfile } from "../../packages/monkey-business/src/collector-codec.ts";
import { validateCollectionResponseControl, encodeCollectionResponse, encodeCollectionResponseIdentity, decodeCollectionResponseIdentity, type CollectionResponseIdentity, type CollectionResponseControl } from "../../packages/monkey-business/src/collection-scenario.ts";
import { validateOutputCapture, encodeOutputCapture, validateOutputAttemptControl } from "../../packages/monkey-business/src/output-controls.ts";
import { encodeCallbackTarget } from "../../packages/monkey-business/src/callback-controls.ts";
import { decodeDriver, decodeDriverEvent } from "../../packages/monkey-business/src/driver-codec.ts";
import SharedEngine, { type EngineState } from "../../packages/monkey-business-bend/engine.mjs";
import { Schema } from "effect";
import { decoder, readRecord, readBendList, readNat, readBool, Nat } from "./boundary-schema.ts";
import { CanonicalLimitsSchema, type CanonicalEvent, type CanonicalProjection } from "./models.ts";
import { freezeCanonicalData } from "./immutable.ts";
import { encodeCanonicalEvent, projectCanonical, decodeTrustedCanonicalStep, projectTrustedCanonical } from "./canonical-boundary.ts";
import { encodeSharedValue, decodeSharedValue } from "./simulation-codec.ts";
import { projectImportGraph, decodeImportGraphStep } from "./graph-adapter.ts";
const graphKey = decoder(Schema.Struct({ $: Schema.Literal("Types.GraphKey"), partition: Nat, lifetime: Nat, round: Nat, operation: Nat, unit: Nat }));
const decodeLimits = decoder(CanonicalLimitsSchema);
const readList = <T>(value: unknown, decode: (value: unknown) => T): T[] => readBendList(value, decode, 2048);
const originalCommandList = (commands: readonly unknown[]): unknown => commands.reduceRight<unknown>((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" });
const projectionOf = (state: EngineState): CanonicalProjection => {
  const projection = sharedProjections.get(state);
  if (projection === undefined) throw new TypeError("missing shared projection");
  return projection;
};
// This composition bridge accepts only original states issued by the shared Bend engine.
const sharedStates = new WeakSet<object>();
const sharedResidents = new WeakMap<object, object>();
const sharedRegister = (state: EngineState): EngineState => {
  freezeCanonicalData(state);
  sharedStates.add(state);
  if (!sharedResidents.has(state)) sharedResidents.set(state, {});
  return state;
};
const sharedCheck = (state: EngineState): void => {
  if (!sharedStates.has(state)) throw new TypeError("foreign shared engine state");
};
const residentOf = (state: EngineState): object => {
  const resident = sharedResidents.get(state);
  if (resident === undefined) throw new TypeError("missing shared resident provenance");
  return resident;
};
const sharedProjections = new WeakMap<object, CanonicalProjection>();
const sharedCommands = new WeakMap<object, readonly unknown[]>();
const sharedSourceEvents = new WeakMap<object, CanonicalEvent>();
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
  decodeDriver({handled:true,actions:afterActions});
  const departureFacts = readList(SharedEngine.writer_departures(state,transition.state,encodeSharedValue(encodeCanonicalEvent(event))),value=>{
    const raw=decoder(Schema.Struct({$:Schema.Literal("WriterScenario.PhysicalRelease"),capture:Schema.Unknown,event:Schema.Unknown}))(decodeSharedValue(value));
    return {capture:decodeWriterIssuedCapture(raw.capture),event:decodeDriverEvent(raw.event)};
  });
  const raw = readRecord(transition.result);
  const commands = raw.$ === "Canonical.Advanced" ? readList(raw.commands, x => x) : [];
  const cacheReleases = readList(SharedEngine.cache_removed(state, originalCommandList(commands)), value => decodeDriverEvent(decodeSharedValue(value)));
  sharedRegister(transition.state);
  sharedResidents.set(transition.state, residentOf(state));
  sharedProjections.set(transition.state, projection);
  sharedCommands.set(transition.state, commands);
  sharedSourceEvents.set(transition.state, freezeCanonicalData(event));
  // A detached root carries immediate transition facts without retaining the
  // bridge key and its predecessor metadata from earlier transitions.
  sharedPredecessors.set(transition.state, Object.freeze({ ...state }));
  const cacheFacts: readonly SharedCacheFact[] = [];
  return { state: transition.state, result, afterActions, cacheReleases, cacheFacts, writerReleases, structural: transition, structuralSource: undefined };
};
export const stepSharedGraph = (state: EngineState, key: unknown, position: bigint, limits: unknown, event: unknown) => {
  sharedCheck(state);
  const transition = SharedEngine.graph_step(state, encodeSharedValue(graphKey(decodeSharedValue(key))), BigInt(readNat(decodeSharedValue(position))), encodeSharedValue(limits), encodeSharedValue(event));
  if (transition.$ === "Types.GraphRejected") throw new Error("preparation graph step is out of order");
  const before = transition.before;
  const result = transition.result;
  projectImportGraph(before);
  decodeImportGraphStep(result);
  return { state: retain(state, transition.state), before, result, structural: transition };
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

export const editSharedActivity = (state: EngineState, partition: number, incarnation: number) => {
  sharedCheck(state);
  const transition = SharedEngine.activity_edit(state, BigInt(readNat(partition)), BigInt(readNat(incarnation)));
  return { state: retain(state, transition.state), plan: decodeSharedValue(transition.plan) };
};

export const sharedActivityScope = (state: EngineState, partition: number): number | undefined => {
  sharedCheck(state);
  const option = decodeOption(decodeSharedValue(SharedEngine.activity_scope(state, BigInt(readNat(partition)))));
  return option.$ === "Some" ? readNat(option.value) : undefined;
};

export const sharedActivityValid = (state: EngineState, partition: number, incarnation: number): boolean => {
  sharedCheck(state);
  return SharedEngine.activity_valid(state, BigInt(readNat(partition)), BigInt(readNat(incarnation)));
};

export const sharedActivityEventValid = (state: EngineState, event: CanonicalEvent, partition: number, incarnation: number): boolean => {
  sharedCheck(state);
  return SharedEngine.activity_event_valid(state, encodeSharedValue(encodeCanonicalEvent(event)), BigInt(readNat(partition)), BigInt(readNat(incarnation)));
};

export const sharedActivityLifetime = (state: EngineState, partition: number): number => {
  sharedCheck(state);
  return readNat(SharedEngine.activity_lifetime(state, BigInt(readNat(partition))));
};

export const sharedLifecycleEntries = (state: EngineState): unknown => {
  sharedCheck(state);
  return decodeSharedValue(SharedEngine.lifecycle_entries(state));
};

export const actSharedLifecycle = (state: EngineState, partition: number, action: unknown) => {
  sharedCheck(state);
  const transition = SharedEngine.lifecycle_action(state, BigInt(readNat(partition)), encodeSharedValue(action));
  return { state: retain(state, transition.state), changed: decodeSharedValue(transition.changed), cleanup: decodeSharedValue(transition.cleanup), events: readList(transition.events, event => {
    const item = workloadEvent(decodeSharedValue(event));
    return { ...item, units: readBendList(item.units, readNat, 1024) };
  }) };
};

export const issueSharedPermit = (state: EngineState, capture: unknown, issuanceNow: number): unknown => {
  sharedCheck(state);
  return decodeSharedValue(SharedEngine.permit_issue(encodeSharedValue(capture), BigInt(readNat(issuanceNow))));
};

export const issuedSharedPermit = (state: EngineState, capture: unknown, token: number): unknown => {
  sharedCheck(state);
  return decodeSharedValue(SharedEngine.permit_issued(encodeSharedValue(capture), BigInt(readNat(token))));
};

export const consumedSharedPermit = (state: EngineState, index: number, partition: number, lifetime: number): unknown => {
  sharedCheck(state);
  const command = sharedCommands.get(state)?.[index];
  if (!command) throw new RangeError("missing shared permit command");
  return decodeSharedValue(SharedEngine.permit_consumed(state, command, BigInt(readNat(partition)), BigInt(readNat(lifetime))));
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
  sharedResidents.set(next, residentOf(before));
  sharedProjections.set(next, projection);
  if (commands !== undefined) sharedCommands.set(next, commands);
  const event = sharedSourceEvents.get(before);
  if (event !== undefined) sharedSourceEvents.set(next, event);
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

export const sharedPreparationActive = (state: EngineState, partition: number, lifetime: number, round: number, operation: number): boolean => {
  sharedCheck(state);
  return SharedEngine.preparation_active(state, BigInt(readNat(partition)), BigInt(readNat(lifetime)), BigInt(readNat(round)), BigInt(readNat(operation)));
};

// Only original shared issuance can mint a receipt. Retained observations own
// these small immutable facts; no state ancestry or completed-callback archive.
const callbackReceipts = new WeakSet<object>();
const callbackReceiptResidents = new WeakMap<object, object>();
export const issueSharedCallback = (state: EngineState, event: CanonicalEvent, order: number, at: number, capture?: unknown) => {
  sharedCheck(state);
  const checkedCapture = capture === undefined ? undefined : validateOutputCapture(capture);
  const encoded = encodeSharedValue(encodeCanonicalEvent(event));
  const owner = SharedEngine.callback_owner(state, encoded);
  if (readRecord(owner).$ === "None") return { state, receipt: undefined };
  const action = { $: "Driver.Action", event: encodeCanonicalEvent(event), delay: 0, candidate: { $: "None" }, job: false, expiry_advice: { $: "None" } };
  const issued = checkedCapture === undefined
    ? SharedEngine.callback_issue(state, readRecord(owner).value, BigInt(readNat(order)), BigInt(readNat(at)), encodeSharedValue(action))
    : SharedEngine.callback_issue_output(state, readRecord(owner).value, BigInt(readNat(order)), BigInt(readNat(at)), encodeSharedValue(action), encodeSharedValue(encodeOutputCapture(checkedCapture)));
  const captured = readRecord(issued.receipt);
  if (captured.$ === "None") {
    if (issued.state !== state) throw new TypeError("refused callback issuance changed original state");
    return { state, receipt: undefined };
  }
  if (captured.$ !== "Some") throw new TypeError("invalid callback issuance receipt");
  const next = issued.state;
  const receipt = freezeCanonicalData(readRecord(captured.value));
  const resident = sharedResidents.get(state);
  if (resident === undefined) throw new TypeError("missing receipt resident provenance");
  const published = retain(state, next);
  callbackReceipts.add(receipt);
  callbackReceiptResidents.set(receipt, resident);
  return { state: published, receipt };
};
export const sharedCallbackOriginals = (state: EngineState) => {
  sharedCheck(state);
  return readList(decodeSharedValue(SharedEngine.callback_originals(state)), readRecord);
};
export const deliverSharedCallback = (state: EngineState, order: number) => {
  sharedCheck(state);
  return retain(state, SharedEngine.callback_delivered(state, BigInt(readNat(order))));
};
export const actSharedCallback = (state: EngineState, target: unknown, action: unknown, receipt: object | undefined, at: number, order: number) => {
  sharedCheck(state);
  if (receipt !== undefined && !callbackReceipts.has(receipt)) throw new TypeError("foreign callback receipt");
  const transition = SharedEngine.callback_action(state, encodeSharedValue(target), encodeSharedValue(action),
    receipt === undefined ? { $: "None" } : { $: "Some", value: receipt }, BigInt(readNat(at)), BigInt(readNat(order)));
  return { state: retain(state, transition.state), result: decodeSharedValue(transition.result),
    cancel: readList(decodeSharedValue(transition.cancel), readNat), schedule: readList(decodeSharedValue(transition.schedule), readRecord) };
};

export const interveneSharedOutput = (state: EngineState, target: unknown, outcome: unknown, receipt?: object) => {
  sharedCheck(state);
  const checked = validateOutputAttemptControl({ kind: "outputAttempt", target, outcome });
  if (receipt !== undefined && (!callbackReceipts.has(receipt) || callbackReceiptResidents.get(receipt) !== sharedResidents.get(state)))
    throw new TypeError("foreign output receipt");
  const transition = SharedEngine.output_intervene(state, encodeSharedValue(encodeCallbackTarget(checked.target)),
    { $: `OutputScenario.${checked.outcome === "certain" ? "Certain" : checked.outcome === "uncertain" ? "Uncertain" : "Failed"}` }, receipt === undefined ? { $: "None" } : { $: "Some", value: receipt });
  // Decode every public component before publishing either state or provenance.
  const result = decodeSharedValue(transition.result);
  const cancel = readList(decodeSharedValue(transition.cancel), readNat);
  const scheduled = decoder(Schema.Struct({ $: Schema.Literal("Callbacks.Scheduled"), at: Nat, order: Nat, action: Schema.Unknown }));
  const schedule = readList(decodeSharedValue(transition.schedule), value => {
    const item = scheduled(value);
    decodeDriver({ handled: true, actions: { $: "Con", head: item.action, tail: { $: "Nil" } } });
    return freezeCanonicalData(item);
  });
  const fact = readRecord(transition.receipt);
  if (fact.$ !== "Some" && fact.$ !== "None") throw new TypeError("invalid output intervention receipt");
  const changedReceipt = fact.$ === "Some" ? freezeCanonicalData(readRecord(fact.value)) : undefined;
  const resident = sharedResidents.get(state);
  if (resident === undefined) throw new TypeError("missing receipt resident provenance");
  const next = retain(state, transition.state);
  if (changedReceipt !== undefined) {
    callbackReceipts.add(changedReceipt);
    callbackReceiptResidents.set(changedReceipt, resident);
  }
  return { state: next, result, cancel, schedule, receipt: changedReceipt };
};
export const deliverSharedOutput = (receipt: object, now: number) => {
  if (!callbackReceipts.has(receipt)) throw new TypeError("foreign callback receipt");
  return decodeSharedValue(SharedEngine.output_deliver(receipt, BigInt(readNat(now))));
};

export const sharedNoticeExercise = (scope: unknown) => readList(decodeSharedValue(SharedEngine.notice_exercise(encodeSharedValue(scope))), readRecord);
export const afterSharedNotice = (state: EngineState, scope: unknown, event: CanonicalEvent, now: number) => {
  sharedCheck(state);
  const before = sharedPredecessors.get(state), commands = sharedCommands.get(state);
  if (!before || !commands) throw new TypeError("missing actual notice feedback");
  const transition = SharedEngine.notice_after(before, state, encodeSharedValue(scope), encodeSharedValue(encodeCanonicalEvent(event)),
    originalCommandList(commands), BigInt(readNat(now)));
  return { state: retain(state, transition.state), events: readList(decodeSharedValue(transition.events), x => x) };
};
export const suppliedSharedNotice = (state: EngineState, scope: unknown, now: number, key: number, sequence: number) => {
  sharedCheck(state);
  return decodeSharedValue(SharedEngine.notice_failure(state, encodeSharedValue(scope), BigInt(readNat(now)), BigInt(readNat(key)), BigInt(readNat(sequence))));
};
export const ownedSharedNotice = (state: EngineState, partition: number, group: number, key: number, action: "lease" | "acknowledge") => {
  sharedCheck(state);
  return decodeSharedValue(SharedEngine[action === "lease" ? "notice_lease" : "notice_acknowledge"](state, BigInt(readNat(partition)), BigInt(readNat(group)), BigInt(readNat(key))));
};

export const replaceSharedCallbacks = (state: EngineState, orders: readonly number[]) => {
  sharedCheck(state);
  const encoded = orders.reduceRight<unknown>((tail, order) => ({ $: "Con", head: readNat(order), tail }), { $: "Nil" });
  return retain(state, SharedEngine.callback_replaced(state, encodeSharedValue(encoded)));
};

export const admitSharedFreshness = (state: EngineState, scope: unknown, source: unknown, index: number, sharing = false) => {
  sharedCheck(state);
  const command = sharedCommands.get(state)?.[index];
  if (!command) throw new RangeError("missing shared admission command");
  const transition = (sharing ? SharedEngine.sharing_admitted : SharedEngine.freshness_admitted)(state, encodeSharedValue(scope), encodeSharedValue(source), command);
  return { state: retain(state, transition.state), actions: decodeSharedValue(transition.actions) };
};
export const sharedFreshnessChecks = (state: EngineState, scope: unknown): unknown => {
  sharedCheck(state);
  return decodeSharedValue(SharedEngine.freshness_checks(state, encodeSharedValue(scope)));
};

/** Sharing plans use original scoped facts; command feedback is taken only from
 * this state's authentic reducer result, never supplied by a host caller. */
export const prepareSharedSharing = (state: EngineState, scope: unknown, keys: readonly unknown[], sizes: readonly number[]) => {
  sharedCheck(state);
  const list = (values: readonly unknown[]) => values.reduceRight<unknown>((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" });
  const result = SharedEngine.sharing_prepare(state, encodeSharedValue(scope), encodeSharedValue(list(keys)), encodeSharedValue(list(sizes.map(readNat))));
  return { state: retain(state, result.state), routes: decodeSharedValue(result.routes), valid: decodeSharedValue(result.valid) };
};
export const routeSharedSharing = (state: EngineState, route: unknown): unknown => {
  sharedCheck(state);
  return decodeSharedValue(SharedEngine.sharing_route(state, encodeSharedValue(route)));
};
export const routedSharedSharing = (state: EngineState, route: unknown) => {
  sharedCheck(state);
  const commands = sharedCommands.get(state);
  const event = sharedSourceEvents.get(state);
  const captured = readRecord(route);
  if (!commands || event?.kind !== "reuseRoute" || event.id !== readNat(captured.evaluation)) throw new RangeError("missing original shared route result");
  const list = originalCommandList(commands);
  const result = SharedEngine.sharing_routed(state, encodeSharedValue(route), list);
  return { state: retain(state, result.state), events: decodeSharedValue(result.events) };
};

export const leaveSharedSharing = (state: EngineState, scope: unknown) => {
  sharedCheck(state);
  const result = SharedEngine.sharing_leave(state, encodeSharedValue(scope));
  return { state: retain(state, result.state), events: decodeSharedValue(result.events), valid: decodeSharedValue(result.valid) };
};
export const completeSharedSharing = (state: EngineState, event: CanonicalEvent) => {
  sharedCheck(state);
  return decodeSharedValue(SharedEngine.sharing_completion(state, encodeSharedValue(encodeCanonicalEvent(event))));
};

export const preprocessSharedSharing = (state: EngineState, event: CanonicalEvent, partition: number, order: number, horizon?: number) => {
  sharedCheck(state);
  const end = horizon === undefined ? { $: "None" } : { $: "Some", value: readNat(horizon) };
  const prepared = SharedEngine.sharing_preprocess(state, encodeSharedValue(encodeCanonicalEvent(event)), BigInt(readNat(order)), encodeSharedValue(end));
  const option = readRecord(prepared.frame);
  if (option.$ === "None") return { state, frame: undefined, events: decodeSharedValue(prepared.events), structural: prepared };
  if (option.$ !== "Some") throw new TypeError("invalid sharing preprocessing frame");
  const frame = readRecord(option.value);
  const beforeState = frame.before as EngineState;
  const afterState = frame.after as EngineState;
  const result = decodeTrustedCanonicalStep(frame.result);
  const raw = readRecord(frame.result);
  const commands = raw.$ === "Canonical.Advanced" ? readList(raw.commands, command => command) : [];
  sharedRegister(afterState);
  sharedResidents.set(afterState, residentOf(state));
  sharedProjections.set(afterState, projectCanonical(result.state));
  sharedCommands.set(afterState, commands);
  sharedPredecessors.set(afterState, Object.freeze({ ...beforeState }));
  const provided = encodeSharedValue({ $: "Some", value: readNat(partition) });
  const commandScopes = commands.map(command => {
    const owner = scopeOption(decodeSharedValue(SharedEngine.scope_command(beforeState, afterState, command, provided)));
    return owner.$ === "Some" ? owner.value : undefined;
  });
  sharedRegister(prepared.state);
  sharedResidents.set(prepared.state, residentOf(state));
  sharedProjections.set(prepared.state, projectCanonical(result.state));
  sharedCommands.set(prepared.state, commands);
  sharedPredecessors.set(prepared.state, Object.freeze({ ...beforeState }));
  return { state: prepared.state, frame: { event: decodeSharedValue(frame.event), result,
    before: projectionOf(state), after: projectCanonical(result.state), commandScopes }, events: decodeSharedValue(prepared.events), structural: prepared };
};

export const leaveAllSharedSharing = (state: EngineState, partition: number, lifetime: number) => {
  sharedCheck(state);
  const result = SharedEngine.sharing_leave_all(state, BigInt(readNat(partition)), BigInt(readNat(lifetime)));
  return { state: retain(state, result.state), events: decodeSharedValue(result.events), valid: decodeSharedValue(result.valid) };
};

export type SharedCacheFact = Readonly<{ event: CanonicalEvent; partition: number }>;
const cacheFacts = new WeakMap<object, { owner: object; raw: unknown }>();
const consumedCacheFacts = new WeakSet<object>();
const consumedCacheResults = new WeakSet<object>();
const cacheFactsOf = (state: EngineState, facts: unknown): readonly SharedCacheFact[] => readList(facts, raw => {
  const record = readRecord(decodeSharedValue(raw));
  const offer = readRecord(record.offer);
  const capsule = Object.freeze({ event: decodeDriverEvent(record.event), partition: readNat(readRecord(offer.key).partition) });
  cacheFacts.set(capsule, { owner: residentOf(state), raw });
  return capsule;
});
export const configureSharedCache = (state: EngineState, entries: number, bytes: number): EngineState => {
  sharedCheck(state);
  return retain(state, SharedEngine.configure_cache(state,true,BigInt(readNat(entries)),BigInt(readNat(bytes))));
};
export const beginSharedCache = (state: EngineState, event: CanonicalEvent) => {
  sharedCheck(state);
  const before = sharedPredecessors.get(state);
  const commands = sharedCommands.get(state);
  const source = sharedSourceEvents.get(state);
  if (!before || !commands || source !== event || consumedCacheResults.has(source)) throw new TypeError("missing or consumed actual cache result provenance");
  const published = SharedEngine.cache_begin(before,state,encodeSharedValue(encodeCanonicalEvent(source)),originalCommandList(commands));
  const releases = readList(published.releases,value=>decodeDriverEvent(decodeSharedValue(value)));
  const facts = cacheFactsOf(state,published.facts);
  const next = retain(state,published.state);
  consumedCacheResults.add(source);
  return { state:next, facts, releases };
};
export const stepSharedCache = (state: EngineState, capsule: SharedCacheFact) => {
  sharedCheck(state);
  const provenance = cacheFacts.get(capsule);
  if (!provenance || provenance.owner !== sharedResidents.get(state) || consumedCacheFacts.has(capsule)) throw new TypeError("foreign or consumed cache metadata fact");
  const transition = SharedEngine.cache_apply(state, provenance.raw);
  if (!readBool(transition.valid)) throw new TypeError("stale cache metadata phase");
  const result = decodeTrustedCanonicalStep(transition.result);
  const raw = readRecord(transition.result);
  const commands = raw.$ === "Canonical.Advanced" ? readList(raw.commands,value=>value) : [];
  const projection = projectCanonical(result.state);
  const afterActions = decodeSharedValue(SharedEngine.after(state,transition.state,encodeSharedValue(encodeCanonicalEvent(capsule.event))));
  const cacheReleases = [...readList(transition.releases,value=>decodeDriverEvent(decodeSharedValue(value))),...readList(SharedEngine.cache_removed(state,originalCommandList(commands)),value=>decodeDriverEvent(decodeSharedValue(value)))];
  const nextFacts = cacheFactsOf(state,transition.facts);
  sharedRegister(transition.state);
  sharedResidents.set(transition.state,provenance.owner);
  sharedProjections.set(transition.state,projection);
  sharedCommands.set(transition.state,commands);
  sharedSourceEvents.set(transition.state,capsule.event);
  sharedPredecessors.set(transition.state,Object.freeze({...state}));
  consumedCacheFacts.add(capsule);
  return { state:transition.state,result,afterActions, cacheFacts:nextFacts, cacheReleases, structural: transition, structuralSource: provenance.raw };
};


const responseResult = decoder(Schema.Struct({ $: Schema.Literal("ResponseResult"),
  result: Schema.Union([
    Schema.Struct({ $: Schema.Literal("CollectionScenario.Applied") }),
    Schema.Struct({ $: Schema.Literal("CollectionScenario.Missing") }),
    Schema.Struct({ $: Schema.Literal("CollectionScenario.WrongScope") }),
    Schema.Struct({ $: Schema.Literal("CollectionScenario.AlreadyAttempting") }),
    Schema.Struct({ $: Schema.Literal("CollectionScenario.IdentityExhausted") }),
    Schema.Struct({ $: Schema.Literal("CollectionScenario.ContextBound") }),
  ]), issued: Schema.Union([
    Schema.Struct({ $: Schema.Literal("None") }),
    Schema.Struct({ $: Schema.Literal("Some"), value: Schema.Struct({ $: Schema.Literal("CollectionScenario.Identity"), id: Nat, partition: Nat, lifetime: Nat, round: Nat }) }),
  ]) }));
const responseResults = { "CollectionScenario.Applied": "applied", "CollectionScenario.Missing": "missing",
  "CollectionScenario.WrongScope": "wrongScope", "CollectionScenario.AlreadyAttempting": "alreadyAttempting",
  "CollectionScenario.IdentityExhausted": "identityExhausted", "CollectionScenario.ContextBound": "contextBound" } as const;
const responseTransition = (before: EngineState, transition: ReturnType<typeof SharedEngine.collection_response_open>) => {
  // ResponseResult is a local Engine envelope emitted with its exact bare tag.
  // Its nested facts still pass the strict shared-module constructor decoder.
  const envelope = readRecord(transition.result);
  const raw = responseResult({ ...envelope, result: decodeSharedValue(envelope.result),
    issued: decodeSharedValue(envelope.issued) });
  const issued = raw.issued.$ === "Some" ? decodeCollectionResponseIdentity({ id: raw.issued.value.id,
    partition: raw.issued.value.partition, lifetime: raw.issued.value.lifetime, round: raw.issued.value.round }) : undefined;
  const actions = decodeSharedValue(transition.actions);
  // Decode every action before publishing state or its newly issued capability.
  decodeDriver({ handled: true, actions });
  return { state: retain(before,transition.state), result: responseResults[raw.result.$], issued, actions };
};
export const controlSharedResponse = (state: EngineState, control: CollectionResponseControl, now: number) => {
  sharedCheck(state);
  control = validateCollectionResponseControl(control);
  const changed = control.action === "open" ? SharedEngine.collection_response_open(state,encodeSharedValue(encodeCollectionResponse(control.response)))
    : control.action === "close" ? SharedEngine.collection_response_close(state,BigInt(control.target.id),BigInt(control.target.partition),BigInt(control.target.lifetime),BigInt(control.target.round))
      : SharedEngine.collection_response_attempt(state,BigInt(control.target.id),BigInt(control.target.partition),BigInt(control.target.lifetime),BigInt(control.target.round),BigInt(readNat(now)),control.currentBlock);
  return responseTransition(state,changed);
};
export const afterSharedResponse = (state: EngineState, target: CollectionResponseIdentity) => {
  sharedCheck(state);
  const event = sharedSourceEvents.get(state);
  const commands = sharedCommands.get(state);
  if (!event || !commands) throw new TypeError("missing response source transition");
  return responseTransition(state,SharedEngine.collection_response_after(state,encodeSharedValue(encodeCollectionResponseIdentity(target)),encodeSharedValue(encodeCanonicalEvent(event)),originalCommandList(commands)));
};
export const validSharedResponse = (state: EngineState, target: CollectionResponseIdentity, now: number): boolean => {
  sharedCheck(state);
  return readBool(decodeSharedValue(SharedEngine.collection_response_valid(state,encodeSharedValue(encodeCollectionResponseIdentity(target)),BigInt(readNat(now)))));
};
export const expireSharedResponses = (state: EngineState, now: number) => {
  sharedCheck(state);
  return responseTransition(state,SharedEngine.collection_response_expire(state,BigInt(readNat(now))));
};
export const driveSharedResponse = (state: EngineState, event: CanonicalEvent, index: number, context: unknown, target: CollectionResponseIdentity): unknown => {
  sharedCheck(state);
  const command = sharedCommands.get(state)?.[index];
  if (!command) throw new TypeError("missing response source command");
  return decodeSharedValue(SharedEngine.collection_response_handle(state,encodeSharedValue(encodeCanonicalEvent(event)),command,encodeSharedValue(context),encodeSharedValue(encodeCollectionResponseIdentity(target))));
};

export const deliverySharedResponse = (state: EngineState, target: CollectionResponseIdentity, now: number, event: CanonicalEvent): boolean => {
  sharedCheck(state);
  return readBool(decodeSharedValue(SharedEngine.collection_response_delivery_valid(state,encodeSharedValue(encodeCollectionResponseIdentity(target)),BigInt(readNat(now)),encodeSharedValue(encodeCanonicalEvent(event)))));
};

/** Original shared transition only; decode the whole action batch before queue publication. */
export const afterSharedQuiet = (state: EngineState,event: CanonicalEvent,partition: number,now: number,window: number,nativeIdle: boolean,stopAbsent: boolean) => {
  sharedCheck(state);
  const commands=sharedCommands.get(state);
  if (!commands || sharedSourceEvents.get(state)!==event) throw new TypeError("missing original quiet transition");
  return decodeDriver({handled:true,actions:decodeSharedValue(SharedEngine.quiet_after(state,
    encodeSharedValue(encodeCanonicalEvent(event)),BigInt(readNat(partition)),BigInt(readNat(now)),BigInt(readNat(window)),
    decoder(Schema.Boolean)(nativeIdle),decoder(Schema.Boolean)(stopAbsent)))}).actions;
};
export const generatedSharedQuiet = (state: EngineState,event: CanonicalEvent,nativeIdle: boolean,stopAbsent: boolean) => {
  sharedCheck(state);
  return decodeDriverEvent(decodeSharedValue(SharedEngine.quiet_event(state,encodeSharedValue(encodeCanonicalEvent(event)),
    decoder(Schema.Boolean)(nativeIdle),decoder(Schema.Boolean)(stopAbsent))));
};

export const commandSharedQuiet = (state: EngineState,event: CanonicalEvent,index: number,partition: number,now: number) => {
  sharedCheck(state);
  const command=sharedCommands.get(state)?.[index];
  if (!command || sharedSourceEvents.get(state)!==event) throw new TypeError("missing original quiet command");
  return decodeDriver({handled:true,actions:decodeSharedValue(SharedEngine.quiet_command(state,command,
    encodeSharedValue(encodeCanonicalEvent(event)),BigInt(readNat(partition)),BigInt(readNat(now))))}).actions;
};

/** A source-owned queued trigger, not a caller-created writer ID. */
export interface SharedWriterPending { readonly kind: "writerPending" }
const writerPendingFacts = new WeakMap<SharedWriterPending,{ readonly raw:unknown; readonly owner:object; event?:CanonicalEvent }>();
const consumedWriterPending = new WeakSet<SharedWriterPending>();
const writerPreparedEnvelope = decoder(Schema.Struct({$:Schema.Literal("WriterPrepared"),state:Schema.Unknown,pending:Schema.Unknown,actions:Schema.Unknown}));
const writerPendingOption = decoder(Schema.Union([
  Schema.Struct({$:Schema.Literal("None")}),
  Schema.Struct({$:Schema.Literal("Some"),value:Schema.Unknown}),
]));
const pendingWriterFact = (state:EngineState,capsule:SharedWriterPending) => {
  sharedCheck(state);
  const fact=writerPendingFacts.get(capsule);
  if (!fact || fact.owner!==residentOf(state) || consumedWriterPending.has(capsule)) throw new TypeError("foreign or consumed original writer trigger");
  return fact;
};
export const prepareSharedWriter = (state:EngineState,capture:WriterCapture) => {
  sharedCheck(state);
  const transition=writerPreparedEnvelope(SharedEngine.writer_prepare(state,encodeSharedValue(encodeWriterCapture(capture))));
  const option=writerPendingOption(decodeSharedValue(transition.pending));
  const raw=option.$==="Some" ? decodeWriterPending(option.value) : undefined;
  const actions=decodeSharedValue(transition.actions);
  decodeDriver({handled:true,actions});
  // Entire capsule/action envelope must decode before retaining either state
  // or its once-issued source provenance, including malformed late actions.
  const next=retain(state,transition.state as EngineState);
  const pending:SharedWriterPending|undefined=raw===undefined ? undefined : Object.freeze({kind:"writerPending" as const});
  if (pending && raw) writerPendingFacts.set(pending,{raw:encodeSharedValue(raw),owner:residentOf(next)});
  return {state:next,pending,actions};
};
export const claimSharedWriter = (state:EngineState,pending:SharedWriterPending,now:number):CanonicalEvent => {
  const fact=pendingWriterFact(state,pending);
  const event=freezeCanonicalData(decodeDriverEvent(decodeSharedValue(SharedEngine.writer_claim_event(state,fact.raw,BigInt(readNat(now))))));
  fact.event=event;
  return event;
};
export const afterSharedWriter = (state:EngineState,pending:SharedWriterPending,now:number) => {
  const fact=pendingWriterFact(state,pending),event=sharedSourceEvents.get(state),commands=sharedCommands.get(state);
  if (!event || event!==fact.event || !commands) throw new TypeError("missing original writer source transition");
  const transition=SharedEngine.writer_feedback(state,fact.raw,encodeSharedValue(encodeCanonicalEvent(event)),originalCommandList(commands),BigInt(readNat(now)));
  const originalTarget=readRecord(readRecord(fact.raw).facts).target;
  const captureOption=writerPendingOption(decodeSharedValue(SharedEngine.writer_capture(transition.state,originalTarget)));
  const capture=captureOption.$==="Some" ? decodeWriterIssuedCapture(captureOption.value) : undefined;
  const actions=decodeDriver({handled:true,actions:decodeSharedValue(transition.actions)}).actions;
  const changed=responseTransition(state,transition);
  const writerReleases=actions.filter(action=>action.event.kind==="collectionExpireBackground" || action.event.kind==="collectionReleaseBackground")
    .map(action=>({...writerReleaseFact(state,capture===undefined ? undefined : encodeSharedValue(capture),action.event,capture===undefined ? fact.raw : undefined),delay:action.delay}));
  consumedWriterPending.add(pending);
  return {...changed,writerReleases};
};
export const releaseSharedWriter = (state:EngineState,target:WriterTarget,now?:number) => {
  sharedCheck(state);
  const raw=now===undefined ? SharedEngine.writer_release(state,encodeSharedValue(encodeWriterTarget(target)))
    : SharedEngine.writer_expire(state,encodeSharedValue(encodeWriterTarget(target)),BigInt(readNat(now)));
  const option=writerPendingOption(decodeSharedValue(SharedEngine.writer_capture(state,encodeSharedValue(encodeWriterTarget(target)))));
  const capture=option.$==="Some" ? decodeWriterIssuedCapture(option.value) : undefined;
  const events=readList(raw,event=>decodeDriverEvent(decodeSharedValue(event)));
  if (capture===undefined && events.length) throw new TypeError("missing original writer release capture");
  return capture===undefined ? [] : events.map(event=>writerReleaseFact(state,encodeSharedValue(capture),event));
};

const writerAttemptEnvelope=decoder(Schema.Struct({$:Schema.Literal("WriterAttempt"),changed:Schema.Unknown,target:Schema.Unknown}));
export const attemptSharedWriter=(state:EngineState,target:WriterTarget,now:number,currentBlock:boolean)=>{
  sharedCheck(state);
  const envelope=writerAttemptEnvelope(SharedEngine.writer_attempt(state,encodeSharedValue(encodeWriterTarget(target)),BigInt(readNat(now)),currentBlock));
  const option=writerPendingOption(decodeSharedValue(envelope.target));
  const responseTarget=option.$==="Some" ? decodeCollectionResponseIdentity((()=>{
    const raw=readRecord(option.value);
    const identity=decoder(Schema.Struct({$:Schema.Literal("CollectionScenario.Identity"),id:Nat,partition:Nat,lifetime:Nat,round:Nat}))(raw);
    const {$: _tag,...fields}=identity;
    return fields;
  })()) : undefined;
  const changed=responseTransition(state,envelope.changed as ReturnType<typeof SharedEngine.collection_response_open>);
  return {...changed,target:responseTarget};
};

export interface SharedWriterRelease { readonly kind:"writerRelease" }
const writerReleaseFacts=new WeakMap<SharedWriterRelease,{readonly capture:unknown;readonly pending:unknown;readonly event:CanonicalEvent;readonly owner:object}>();
const consumedWriterReleases=new WeakSet<SharedWriterRelease>();
const writerReleaseFact=(state:EngineState,capture:unknown,event:CanonicalEvent,pending:unknown=undefined)=>{
  const receipt:SharedWriterRelease=Object.freeze({kind:"writerRelease" as const});
  const frozen=freezeCanonicalData(event);
  writerReleaseFacts.set(receipt,{capture,pending,event:frozen,owner:residentOf(state)});
  return {event:frozen,receipt};
};
/** Read the original receipt's owner decision without consuming its custody. */
export const peekSharedWriterRelease=(state:EngineState,receipt:SharedWriterRelease,now:number):CanonicalEvent|undefined=>{
  sharedCheck(state);
  const fact=writerReleaseFacts.get(receipt);
  if (!fact || fact.owner!==residentOf(state) || consumedWriterReleases.has(receipt)) throw new TypeError("foreign or consumed original writer release");
  const raw=fact.pending===undefined ? SharedEngine.writer_release_delivery(state,fact.capture,encodeSharedValue(encodeCanonicalEvent(fact.event)),BigInt(readNat(now)))
    : SharedEngine.writer_unissued_release_delivery(state,fact.pending,BigInt(readNat(now)));
  const option=writerPendingOption(decodeSharedValue(raw));
  return option.$==="Some" ? decodeDriverEvent(option.value) : undefined;
};
export const deliverSharedWriterRelease=(state:EngineState,receipt:SharedWriterRelease,now:number):CanonicalEvent|undefined=>{
  const event=peekSharedWriterRelease(state,receipt,now);
  consumedWriterReleases.add(receipt);
  return event;
export const configureSharedCollector = (state: EngineState, profile: Parameters<typeof encodeCollectorProfile>[0]): EngineState => {
  sharedCheck(state);
  return retain(state, SharedEngine.collector_configure(state, encodeSharedValue(encodeCollectorProfile(profile))));
};
export const driveSharedCollector = (state: EngineState, index: number, context: unknown) => {
  sharedCheck(state);
  const command = sharedCommands.get(state)?.[index];
  const source = sharedSourceEvents.get(state);
  if (!command || !source) throw new TypeError("missing original collector command facts");
  const changed = SharedEngine.collector_command(state, encodeSharedValue(encodeCanonicalEvent(source)), command,
    encodeSharedValue(context));
  // All actions are decoded before publishing either state or queued effects.
  const handled = decodeDriver(decodeSharedValue(changed.handled));
  return { state: retain(state, changed.state), handled };
};
export const afterSharedCollector = (state: EngineState) => {
  sharedCheck(state);
  const source = sharedSourceEvents.get(state);
  if (!source) throw new TypeError("missing original collector completion facts");
  const changed = SharedEngine.collector_after(state, encodeSharedValue(encodeCanonicalEvent(source)));
  const handled = decodeDriver(decodeSharedValue(changed.handled));
  return { state: retain(state, changed.state), handled };
};


export const sharedStopFinish = (state: EngineState, partition: number) =>
  decodeStopFound(decodeSharedValue(SharedEngine.stop_find(state,BigInt(readNat(partition)))));
export const sharedStopFinishes = (state: EngineState) =>
  decodeStopRegistry(decodeSharedValue(SharedEngine.stop_entries(state)));
export const registerSharedStop = (state: EngineState, input: unknown) => {
  sharedCheck(state);
  const registered = SharedEngine.stop_register(state,encodeSharedValue(encodeStopInput(input)));
  const finish = decodeStopFound(decodeSharedValue(registered.finish));
  const created = readBool(registered.created);
  return { state: retain(state,registered.state), finish, created };
};
export const progressSharedStop = (state: EngineState, partition: number, attempt: number, change: StopProgress) =>
  retain(state,SharedEngine.stop_progress(state,BigInt(readNat(partition)),BigInt(readNat(attempt)),encodeSharedValue(encodeStopProgress(change))));
export const closeSharedStop = (state: EngineState, partition: number) =>
  retain(state,SharedEngine.stop_close(state,BigInt(readNat(partition))));


export const driveSharedStop = (state: EngineState, index: number, context: unknown, facts: StopCommandFacts) => {
  sharedCheck(state);
  const command = sharedCommands.get(state)?.[index];
  const source = sharedSourceEvents.get(state);
  if (!command || !source) throw new TypeError("missing original Stop command facts");
  const changed = SharedEngine.stop_command(state,encodeSharedValue(encodeCanonicalEvent(source)),command,
    encodeSharedValue(context),encodeSharedValue(encodeStopCommandFacts(facts)));
  const report = decodeStopCommand(decodeSharedValue(changed));
  return { state: retain(state,changed.state), report };
};
