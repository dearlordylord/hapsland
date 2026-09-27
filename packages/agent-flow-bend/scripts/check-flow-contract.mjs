import assert from "node:assert/strict";
import { initialBend, projectBend, stepBend } from "../../agent-flow-viz/src/bend-flow.ts";

// Independent expectations for the abstract Flow.bend contract. These do not
// consult the TypeScript reference reducer or its scenario acceptance choices.
const input = (event, itemId) => ({ event, itemId });
const primaryIds = (state) => state.packets.filter((packet) => packet.at !== "advicePolicy").map((packet) => packet.id);
const sameIds = (actual, expected, label) => assert.deepEqual([...actual].sort((a, b) => a - b), [...expected].sort((a, b) => a - b), label);

const assertState = (state, label) => {
  const primary = primaryIds(state);
  assert.equal(new Set(primary).size, primary.length, `${label}: duplicate primary item`);
  const leased = state.packets.filter((packet) => packet.at === "advicePolicy");
  assert.equal(leased.length, state.leaseSurface === null ? 0 : 1, `${label}: lease count`);
  assert.equal(leased[0]?.id ?? null, state.leasedItemId, `${label}: lease item`);
  if (!state.virtualRoundActive) {
    assert.equal(state.packets.length, 0, `${label}: closed round kept packets`);
    assert.equal(state.backgroundAvailable, false, `${label}: closed round kept background wait`);
    assert.equal(state.stopWaiting, false, `${label}: closed round kept finish wait`);
  }
};

let acceptedSteps = 0;
let rejectedSteps = 0;
const apply = (before, { event, itemId }, label) => {
  const result = stepBend(before.bend, event, itemId);
  assertState(result.state, label);
  if (!result.accepted) {
    rejectedSteps++;
    assert.deepEqual(result.state, before.state, `${label}: rejection changed state`);
    assert.deepEqual(result.changes, [], `${label}: rejection emitted changes`);
    return result;
  }
  acceptedSteps++;
  const expected = new Set(primaryIds(before.state));
  const name = typeof event === "string" ? event : event.type;
  if (name === "EditObserved") expected.add(before.state.nextItemId);
  if (name === "JevClearReceived" || name === "JevUnavailable") {
    const transition = result.changes.find((change) => change.kind === "transition" && change.event === name);
    expected.delete(transition?.itemId);
  }
  if (name === "HostOutputSubmitted" && before.state.leaseSurface === "stop") expected.delete(before.state.leasedItemId);
  if (name === "StopAllowed" || result.changes.some((change) => change.kind === "finishDecision")) expected.clear();
  sameIds(primaryIds(result.state), expected, `${label}: item conservation`);
  return result;
};
const run = (label, events) => {
  const bend = initialBend();
  let result = { bend, state: projectBend(bend) };
  assertState(result.state, `${label}: initial`);
  for (const [index, event] of events.entries()) result = apply(result, event, `${label} step ${index + 1}`);
  return result;
};

const closed = run("closed rejection", [input("StopHookFired")]);
assert.equal(closed.reason, "virtualRoundClosed");
const invalid = run("invalid capacity", [input({ type: "SourceCapacitySet", capacity: 0 })]);
assert.equal(invalid.reason, "invalidCapacity");
const opened = run("edit admission", [input("EditObserved")]);
assert.deepEqual(opened.changes.filter((change) => change.kind === "transition").map((change) => change.event),
  ["EditObserved", "IngressStarted", "BackgroundWaitStarted"]);
const continued = run("settled advice", [input("EditObserved"), input("ReviewUnitPrepared"),
  input("JevFindingReceived"), input("StopHookFired")]);
assert.deepEqual(continued.changes.find((change) => change.kind === "finishDecision"), {
  kind: "finishDecision", response: "continueWithAdvice", adviceItemIds: [1],
  discardedItemIds: [], cancelledSourceReadingIds: [], cancelledJevRequestIds: [],
});
const allowed = run("deadline allow", [input("EditObserved"), input("ReviewUnitPrepared"),
  input("StopHookFired"), input("FinishDecisionDeadlineReached")]);
assert.deepEqual(allowed.changes.find((change) => change.kind === "finishDecision"), {
  kind: "finishDecision", response: "allowFinish", adviceItemIds: [],
  discardedItemIds: [1], cancelledSourceReadingIds: [], cancelledJevRequestIds: [1],
});
assert.equal(allowed.state.virtualRoundActive, false);

// Seeded, bounded exploration checks structural properties across accepted and
// rejected histories. Each trace starts fresh; accepted options are discovered
// from Bend itself, while the assertions above are independent of its rules.
const events = ["EditObserved", "ReviewUnitPrepared", "JevFindingReceived", "JevClearReceived",
  "JevUnavailable", "StopHookFired", "FinishDecisionDeadlineReached", "FinishDecisionAllWorkSettled",
  "AdviceLeasedByBackground", "HostOutputSubmitted"];
let seed = 0x115b3e;
const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
for (let trace = 0; trace < 100; trace++) {
  const bend = initialBend();
  let result = { bend, state: projectBend(bend) };
  for (let index = 0; index < 60; index++) {
    const candidates = [
      ...events.map((event) => input(event)),
      input({ type: "SourceCapacitySet", capacity: 1 + random() % 5 }),
      input({ type: "ReviewCapacitySet", capacity: 1 + random() % 5 }),
      ...result.state.packets.flatMap((packet) => events.map((event) => input(event, packet.id))),
    ];
    const accepted = candidates.filter(({ event, itemId }) => stepBend(result.bend, event, itemId).accepted);
    assert.ok(accepted.length > 0, `trace ${trace}: no accepted candidate`);
    const pool = random() % 5 === 0 ? candidates : accepted;
    result = apply(result, pool[random() % pool.length], `generated trace ${trace} step ${index + 1}`);
  }
}
assert.ok(acceptedSteps > 3000, `too few accepted contract steps: ${acceptedSteps}`);
assert.ok(rejectedSteps > 100, `too few rejected contract steps: ${rejectedSteps}`);
console.log(`Flow.bend contract passed: ${acceptedSteps} accepted and ${rejectedSteps} rejected steps across 100 generated traces and fixed cases`);
