import { isDeepStrictEqual } from "node:util";
import { readBendList, readBool, readNat, readRecord } from "../../../src/canonical/boundary-schema.ts";
import { decodeTrustedCanonicalStep, projectTrustedCanonical } from "../../../src/canonical/canonical-boundary.ts";
import { decodeImportGraphStep, projectImportGraph } from "../../../src/canonical/graph-adapter.ts";
import { freezeCanonicalData } from "../../../src/canonical/immutable.ts";
import { decodeAdviceeLifecycles } from "./advicee-lifecycle.ts";
import { decodeCallbackTarget, type CallbackTarget } from "./callback-controls.ts";
import { decodePrefixCanonicalEvent, decodePrefixGraphEvent } from "./callback-native-codec.ts";
import { validateSharingControl } from "./sharing-controls.ts";

const list = (value: unknown) => readBendList(value, value => value, 2048);
function tagged(value: unknown, expected: string) {
  const record = readRecord(value);
  if (record.$ !== expected) throw new TypeError(`expected ${expected}`);
  return record;
}
function single(value: unknown) {
  const values = list(value);
  if (values.length !== 1) throw new TypeError("malformed private singleton box");
  return values[0];
}
function optional(value: unknown): unknown | null {
  const record = readRecord(value);
  if (record.$ === "None") return null;
  if (record.$ !== "Some") throw new TypeError("malformed private Maybe");
  return record.value;
}
export function decodeObservedState(value: unknown) {
  const record = tagged(single(value), "Types.State");
  // Every retained graph is also validated by its production representation
  // owner, including entries not present in the final observation history.
  for (const entry of list(record.graphs)) projectImportGraph(tagged(entry, "Types.GraphEntry").graph);
  projectTrustedCanonical(record.canonical);
  return record;
}
function targets(record: Record<string, unknown>, receipts: readonly CallbackTarget[]) {
  const scenarios = tagged(record.scenarios, "RuntimeScenarios.State");
  const callbacks = tagged(scenarios.callbacks, "Callbacks.State");
  const targets = list(callbacks.originals).map(original => {
    const fact = tagged(tagged(original, "Callbacks.Original").fact, "Callbacks.Fact");
    return decodeCallbackTarget(fact.target);
  });
  for (const receipt of receipts) if (!targets.some(target => isDeepStrictEqual(target, receipt))) targets.push(receipt);
  return targets;
}
export function stateEndpoint(record: Record<string, unknown>, receipts: readonly CallbackTarget[]) {
  return { time: readNat(tagged(record.scheduler, "Scheduler.State").now),
    projection: projectTrustedCanonical(record.canonical), targets: targets(record, receipts),
    lifecycles: decodeAdviceeLifecycles(record.lifecycles) };
}
function scopes(value: unknown) {
  const captured = optional(value);
  if (captured === null) throw new TypeError("missing actual command scope capture");
  return list(captured).map(value => {
    const scope = optional(value);
    return scope === null ? null : readNat(scope);
  });
}

/** Common factual Edge projection; owner codecs validate every complete frame. */
export function decodeObservedFrame(value: unknown, receipts: CallbackTarget[]) {
  const frame = readRecord(value);
  const observed = readRecord(frame.frame);
  const beforeState = decodeObservedState(observed.before), afterState = decodeObservedState(observed.after);
  // Physical and owner snapshots come from distinct real scheduler boundaries.
  // Compare their full business state, without coupling private scheduler clocks.
  const runtimeBefore = tagged(single(observed.runtime_before), "advicee_lifecycle_driver.Runtime");
  const runtimeAfter = tagged(single(observed.runtime_after), "advicee_lifecycle_driver.Runtime");
  if (!isDeepStrictEqual(projectTrustedCanonical(readRecord(runtimeBefore.state).canonical),projectTrustedCanonical(beforeState.canonical))
    || !isDeepStrictEqual(projectTrustedCanonical(readRecord(runtimeAfter.state).canonical),projectTrustedCanonical(afterState.canonical)))
    throw new TypeError("observed runtime and owner Canonical business state disagree");
  const before = projectTrustedCanonical(beforeState.canonical), after = projectTrustedCanonical(afterState.canonical);
  const time = readNat(observed.time);
  readNat(observed.order);
  if (observed.$ === "advicee_lifecycle_driver.CanonicalFrame" || observed.$ === "advicee_lifecycle_driver.CacheFrame") {
    const rawResult = single(observed.result);
    const result = decodeTrustedCanonicalStep(rawResult);
    if (!isDeepStrictEqual(projectTrustedCanonical(result.state), after)) throw new TypeError("result and after state disagree");
    const commandScopes = list(observed.command_scopes).map(value => {
      const captured = optional(value);
      return captured === null ? null : readNat(captured);
    });
    if (!isDeepStrictEqual(commandScopes,scopes(frame.scopes))) throw new TypeError("outer scopes differ from actual observer capture");
    if (commandScopes.length !== result.commands.length) throw new TypeError("command scope count differs");
    const rawReceipt = optional(frame.receipt);
    const receipt = rawReceipt === null ? null : decodeCallbackTarget(rawReceipt);
    const physicalReceipt = optional(observed.receipt);
    const actualReceipt = physicalReceipt === null ? null : decodeCallbackTarget(tagged(physicalReceipt,"Callbacks.Fact").target);
    if (!isDeepStrictEqual(receipt,actualReceipt)) throw new TypeError("outer receipt differs from actual observer capture");
    if (receipt) receipts.push(receipt);
    if (observed.$ === "advicee_lifecycle_driver.CacheFrame") {
      const fact = tagged(observed.fact, "CacheRuntime.Fact");
      if (!isDeepStrictEqual(decodePrefixCanonicalEvent(fact.event), decodePrefixCanonicalEvent(observed.event)))
        throw new TypeError("cache event lost its original capsule");
    }
    return { kind: "canonical", time, before, after, event: decodePrefixCanonicalEvent(observed.event),
      commands: result.commands, commandScopes, rejection: result.rejection ?? null, receipt };
  } else if (observed.$ === "advicee_lifecycle_driver.GraphFrame") {
    const transition = tagged(single(observed.result), "Types.GraphTransition");
    const result = decodeImportGraphStep(transition.result);
    const key = tagged(observed.key, "Types.GraphKey");
    const scope = { partition: readNat(key.partition), lifetime: readNat(key.lifetime), round: readNat(key.round),
      operation: readNat(key.operation), unit: readNat(key.unit) };
    return { kind: "graph", time, before, after, scope, position: readNat(observed.position),
      event: decodePrefixGraphEvent(observed.event), graph: { before: projectImportGraph(transition.before),
        after: projectImportGraph(result.state), command: result.command } };
  } else throw new TypeError("unexpected sharing observer frame");
}

/** Full raw owner DTOs are compared separately between native and emitted JS.
 * This projection uses the same exact production codecs as the public Run; it
 * contains no routing, sharing, cache eligibility or reservation calculation. */
export function decodeSharingNativeBoundary(value: unknown) {
  const envelope = tagged(value, "sharing_observed_wire.Envelope");
  const trace = tagged(envelope.trace, "sharing_observed_driver.Trace");
  if (!readBool(trace.valid)) throw new TypeError("invalid sharing factual transport");
  const frames: unknown[] = [], controls: unknown[] = [], boundaries: unknown[] = [];
  const receipts: CallbackTarget[] = [];
  for (const input of list(trace.frames)) {
    const frame = readRecord(input);
    if (frame.$ === "sharing_observed_driver.Observed") {
      frames.push(decodeObservedFrame(frame, receipts));
    } else if (frame.$ === "sharing_observed_driver.Control") {
      if (!readBool(frame.applied)) throw new TypeError("original sharing control refused");
      const input = readRecord(frame.input);
      if (typeof input.agent !== "string") throw new TypeError("original control agent missing");
      const beforeState = decodeObservedState(frame.before), afterState = decodeObservedState(frame.after);
      const original = optional(frame.target);
      let control;
      if (input.$ === "sharing_original_inputs.Leave" && original !== null) {
        const scope = tagged(original, "FreshnessScenario.Scope");
        control = validateSharingControl({ kind: "sharingMember", action: "leave", agent: input.agent,
          target: { partition: readNat(scope.partition), lifetime: readNat(scope.lifetime), round: readNat(scope.round), operation: readNat(scope.operation) } });
      } else if (input.$ === "sharing_original_inputs.LeaveAll" && original === null) {
        const agents = list(trace.agents).map(value => tagged(value, "sharing_observed_initial.Agent"));
        const agent = agents.find(agent => agent.agent === input.agent);
        if (!agent) throw new TypeError("original advicee missing");
        control = validateSharingControl({ kind: "sharingMember", action: "leaveAll", agent: input.agent,
          partition: readNat(agent.partition), lifetime: readNat(agent.lifetime) });
      } else throw new TypeError("sharing control capture differs");
      for (const event of list(frame.events)) decodePrefixCanonicalEvent(event);
      controls.push({ time: readNat(frame.time), before: projectTrustedCanonical(beforeState.canonical),
        after: projectTrustedCanonical(afterState.canonical), control, applied: true });
    } else if (frame.$ === "sharing_observed_driver.Boundary") {
      boundaries.push({ endpoint: readNat(frame.endpoint), budget: readNat(frame.budget), consumed: readNat(frame.consumed),
        state: stateEndpoint(decodeObservedState(frame.state), receipts) });
    } else throw new TypeError("invalid sharing trace frame");
  }
  const runtime = tagged(single(trace.runtime), "advicee_lifecycle_driver.Runtime");
  const finalState = tagged(runtime.state, "Types.State");
  if (readNat(trace.consumed) !== frames.length) throw new TypeError("observation budget accounting differs");
  return freezeCanonicalData({ frames, controls, sources: [], boundaries,
    endpoint: stateEndpoint(finalState, receipts), eventCount: readNat(trace.consumed) });
}
