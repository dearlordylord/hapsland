import assert from "node:assert/strict";
import { bendInitial, bendStep, bendChanges } from "../flow.generated.js";
import { initialFlow, stepFlow } from "../../agent-flow-viz/src/flow.ts";
import { TRACES } from "../../agent-flow-viz/src/scenarios.ts";

const list = (value) => {
  const result = [];
  for (let current = value; current.$ === "Con"; current = current.tail) result.push(current.head);
  return result;
};
const maybe = (value) => value.$ === "None" ? null : value.value;
const surface = (value) => value === null ? null : value.$ === "Background" ? "background" : "stop";
const capacity = (value) => Number((value.high << 48n) + value.low);
const place = {
  EditQueue: ["editQueue", "capture job"], Preparation: ["preparation", "capture job"],
  ReviewQueue: ["reviewQueue", "review work item"], Jev: ["jev", "network request"],
  AdviceStore: ["adviceStore", "advice"], AdvicePolicy: ["advicePolicy", "leased batch"],
};
const project = (state) => ({
  packets: list(state.packets).map((packet) => ({ id: Number(packet.id), at: place[packet.at.$][0], flavor: place[packet.at.$][1] })),
  nextItemId: Number(state.next_id), sourceCapacity: capacity(state.source_capacity), reviewCapacity: capacity(state.review_capacity),
  virtualRoundId: Number(state.round_id), virtualRoundActive: state.active, stopContinuations: Number(state.continuations),
  stopWaiting: state.waiting, backgroundAvailable: state.background_available,
  leaseSurface: surface(maybe(state.lease)), leasedItemId: maybe(state.leased_id) === null ? null : Number(maybe(state.leased_id)),
  lastSubmissionSurface: surface(maybe(state.last_surface)),
  lastSubmissionItemId: maybe(state.last_id) === null ? null : Number(maybe(state.last_id)),
  backgroundSubmittedIds: list(state.background_submitted).map(Number),
});
const normalizedSidecar = (state) => state;
const encode = (event) => typeof event === "string" ? { $: event } : {
  $: event.type, capacity: event.capacity,
};
const rejections = {
  VirtualRoundClosed: "virtualRoundClosed", StopNotWaiting: "stopNotWaiting", UnexpectedControl: "unexpectedControl",
  BackgroundAlreadySubmitted: "backgroundAlreadySubmitted", BackgroundNotRequested: "backgroundNotRequested",
  StopNotRequested: "stopNotRequested", FinishDecisionAlreadyOpen: "finishDecisionAlreadyOpen",
  ContinuationBudgetExhausted: "continuationBudgetExhausted", ReofferNeedsBackground: "reofferNeedsBackground",
  StopNeedsFreshAdvice: "stopNeedsFreshAdvice", LeaseBusy: "leaseBusy", NoLease: "noLease", MissingPacket: "missingPacket",
  DispatchCapacityReached: "dispatchCapacityReached", QueueOrder: "queueOrder", InvalidCapacity: "invalidCapacity",
  InternalEvent: "internalEvent", WorkStillPending: "workStillPending",
};
const nodes = {
  AgentEditNode: "agentEdit", EditQueueNode: "editQueue", PreparationNode: "preparation",
  ReviewQueueNode: "reviewQueue", JevDispatchNode: "jevDispatch", JevNode: "jev",
  AdviceStoreNode: "adviceStore", AdvicePolicyNode: "advicePolicy", ResponseCommandNode: "responseCommand",
  ObservedWriteNode: "observedWrite", DeliveryStateNode: "deliveryState", OutcomeStoreNode: "outcomeStore",
};
const flavors = {
  EditObservation: "edit observation", CaptureJob: "capture job", ReviewWorkItem: "review work item",
  DecisionRequest: "decision request", NetworkRequest: "network request", Advice: "advice",
  LeasedBatch: "leased batch", RuntimeSubmission: "runtime submission", ReviewStatus: "review status",
};
const signals = {
  BackgroundSignal: "background", StopSignal: "stop", SettledSignal: "settled",
  DeadlineSignal: "deadline", AllowSignal: "allow", ResponseSignal: "response",
};
const routeFromBend = (route) => route.$ === "DataRoute"
  ? { kind: "data", from: nodes[route.from.$], to: nodes[route.to.$], input: flavors[route.input.$],
      output: flavors[route.output.$], movement: route.copy ? "copy" : "move" }
  : { kind: "control", from: nodes[route.from.$], to: nodes[route.to.$], signal: signals[route.signal.$] };
const changeFromBend = (change) => {
  switch (change.$) {
    case "Transition": return { kind: "transition", event: change.event.$, route: routeFromBend(change.route), itemId: maybe(change.item) === null ? null : Number(maybe(change.item)) };
    case "CapacityChanged": return { kind: "capacityChanged", capacity: change.source ? "source" : "jev", before: capacity(change.before), after: capacity(change.after) };
    case "RoundOpened": return { kind: "virtualRoundOpened", id: Number(change.id) };
    case "RoundClosed": return { kind: "virtualRoundClosed", id: Number(change.id), discardedItems: Number(change.discarded) };
    case "Emitted": return { kind: "emitted", event: change.event.$, at: nodes[change.at.$], itemId: Number(change.item) };
    case "FinishDecision": {
      const decision = change.decision;
      return { kind: "finishDecision", response: decision.$ === "ContinueWithAdvice" ? "continueWithAdvice" : "allowFinish",
        adviceItemIds: decision.$ === "ContinueWithAdvice" ? list(decision.ids).map(Number) : [],
        discardedItemIds: list(decision.discarded).map(Number),
        cancelledSourceReadingIds: list(decision.cancelled_source).map(Number),
        cancelledJevRequestIds: list(decision.cancelled_jev).map(Number) };
    }
    default: throw new Error(`unknown Bend change ${change.$}`);
  }
};
const changeFromSidecar = (change) => change;
const describe = (value) => JSON.stringify(value, (_, item) => typeof item === "bigint" ? `${item}n` : item);
const run = (label, events) => {
  let sidecar = initialFlow();
  let bend = bendInitial();
  for (const input of events) {
    const [event, itemId] = Array.isArray(input) ? input : [input, undefined];
    const a = stepFlow(sidecar, event, itemId);
    const b = bendStep(bend, encode(event), itemId === undefined ? { $: "None" } : { $: "Some", value: BigInt(itemId) });
    assert.equal(b.$ === "Accepted", a.accepted, `${label}: acceptance for ${describe(input)}`);
    if (!a.accepted) assert.equal(rejections[b.reason.$], a.reason, `${label}: rejection for ${describe(input)}`);
    if (a.accepted && b.$ === "Accepted" && b.decision.$ !== "NoDecision") {
      const decision = a.changes.find((change) => change.kind === "finishDecision");
      assert.ok(decision, `${label}: missing sidecar finish decision`);
      assert.equal(b.decision.$ === "ContinueWithAdvice" ? "continueWithAdvice" : "allowFinish", decision.response);
      assert.deepEqual(b.decision.$ === "ContinueWithAdvice" ? list(b.decision.ids).map(Number) : [], decision.adviceItemIds);
      assert.deepEqual(list(b.decision.discarded).map(Number), decision.discardedItemIds);
      assert.deepEqual(list(b.decision.cancelled_source).map(Number), decision.cancelledSourceReadingIds);
      assert.deepEqual(list(b.decision.cancelled_jev).map(Number), decision.cancelledJevRequestIds);
    }
    const item = itemId === undefined ? { $: "None" } : { $: "Some", value: BigInt(itemId) };
    assert.deepEqual(list(bendChanges(bend, encode(event), item, b)).map(changeFromBend),
      a.changes.map(changeFromSidecar), `${label}: changes after ${describe(input)}`);
    sidecar = a.state;
    bend = b.state;
    assert.deepEqual(project(bend), normalizedSidecar(sidecar), `${label}: state after ${describe(input)}`);
  }
};
for (const trace of TRACES) run(trace.name, trace.events);
run("background submit", ["EditObserved", "ReviewUnitPrepared", "JevFindingReceived", "AdviceLeasedByBackground", "HostOutputSubmitted", "StopHookFired"]);
run("capacity", [{ type: "SourceCapacitySet", capacity: 1 }, "EditObserved", "EditObserved", "ReviewUnitPrepared", { type: "ReviewCapacitySet", capacity: 1 }, "ReviewUnitPrepared", "JevFindingReceived", "ReviewUnitPrepared"]);
run("rejections", ["StopHookFired", "EditObserved", "AdviceLeasedByBackground", "StopHookFired", "StopHookFired", "JevFindingReceived", "FinishDecisionDeadlineReached"]);
run("capacity boundaries", [
  { type: "SourceCapacitySet", capacity: -1 }, { type: "ReviewCapacitySet", capacity: 0 },
  { type: "SourceCapacitySet", capacity: 1n },
  { type: "SourceCapacitySet", capacity: Number.NaN }, { type: "ReviewCapacitySet", capacity: Number.POSITIVE_INFINITY },
  { type: "SourceCapacitySet", capacity: 1.5 }, { type: "ReviewCapacitySet", capacity: 2 ** 48 },
  { type: "SourceCapacitySet", capacity: Number.MAX_SAFE_INTEGER },
  { type: "ReviewCapacitySet", capacity: Number.MAX_SAFE_INTEGER + 1 },
  "EditObserved", "ReviewUnitPrepared", "JevClearReceived",
]);
const randomEvents = ["EditObserved", "ReviewUnitPrepared", "JevFindingReceived", "JevClearReceived", "JevUnavailable", "StopHookFired", "FinishDecisionDeadlineReached", "FinishDecisionAllWorkSettled", "FinishDecisionBudgetExhausted", "AdviceLeasedByBackground", "HostOutputSubmitted", "AdviceLeasedByStop", "AdviceReofferedAtStop"];
let seed = 0x523af1;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0));
let acceptedGeneratedSteps = 0;
for (let trace = 0; trace < 100; trace++) {
  const events = ["EditObserved"];
  let oracle = stepFlow(initialFlow(), "EditObserved").state;
  for (let step = 0; step < 60; step++) {
    const candidates = ["EditObserved", "StopHookFired", "FinishDecisionDeadlineReached",
      "FinishDecisionAllWorkSettled", "FinishDecisionBudgetExhausted", "HostOutputSubmitted",
      { type: "SourceCapacitySet", capacity: 1 + random() % 5 },
      { type: "ReviewCapacitySet", capacity: 1 + random() % 5 }];
    for (const packet of oracle.packets) {
      for (const event of ["ReviewUnitPrepared", "JevFindingReceived", "JevClearReceived", "JevUnavailable",
        "AdviceLeasedByBackground", "AdviceLeasedByStop", "AdviceReofferedAtStop"]) {
        candidates.push([event, packet.id]);
      }
    }
    const accepted = candidates.filter((input) => {
      const [event, id] = Array.isArray(input) ? input : [input, undefined];
      return stepFlow(oracle, event, id).accepted;
    });
    const input = random() % 5 === 0 ? candidates[random() % candidates.length] : accepted[random() % accepted.length];
    const [event, id] = Array.isArray(input) ? input : [input, undefined];
    const result = stepFlow(oracle, event, id);
    if (result.accepted) acceptedGeneratedSteps++;
    oracle = result.state;
    events.push(input);
  }
  run(`generated ${trace}`, events);
}
assert.ok(acceptedGeneratedSteps > 3000, `too few accepted generated steps: ${acceptedGeneratedSteps}`);
console.log(`Bend state, decisions, and ordered changes match ${TRACES.length + 104} sidecar traces (${acceptedGeneratedSteps} accepted generated steps)`);
