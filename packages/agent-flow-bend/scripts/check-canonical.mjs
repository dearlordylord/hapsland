import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initialCanonical, projectCanonical, stepCanonical } from "../../../src/canonical/adapter.ts";

const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-v1.json"), "utf8"));
const format = (commands) => commands.map((item) => {
  switch (item.kind) {
    case "prepare": case "unitAdmitted": return `${item.kind}:${item.operation}:${item.reservation}`;
    case "roundStarted": case "reservationReleased": return `${item.kind}:${item.id}`;
    case "preparationReleased": return `reservationReleased:${item.id}`;
    case "partitionRetired": return `${item.kind}:${item.round}`;
    case "writeAuthorized": case "cancelWork": return `${item.kind}:${item.operation}`;
    case "reviewRecorded": case "writeRecorded": return `${item.kind}:${item.outcome}`;
    default: return item.kind;
  }
}).join(",");
for (const trace of fixture.traces) {
  let state = initialCanonical(fixture.limits);
  const commands = [];
  const capacity = [];
  for (const event of trace.events) {
    const result = stepCanonical(state, event);
    state = result.state;
    commands.push(result.rejection ? `rejected:${result.rejection}` : format(result.commands));
    if (event.kind === "preparationCompleted") capacity.push(result.commands
      .filter((command) => "after" in command)
      .map((command) => ({ kind: command.kind, ...("position" in command ? { position: command.position, bytes: command.bytes } : {}),
        ...("reason" in command ? { reason: command.reason } : {}),
        global: command.after.global, local: command.after.local, charges: command.after.charges })));
  }
  assert.deepEqual(commands, trace.commands, trace.name);
  assert.deepEqual(projectCanonical(state).global, trace.global, `${trace.name}: ledger`);
  assert.deepEqual(projectCanonical(state).partitions, trace.partitions, `${trace.name}: advicee usage`);
  if (trace.charges) assert.deepEqual(projectCanonical(state).charges, trace.charges, `${trace.name}: reservations`);
  if (trace.capacity) assert.deepEqual(capacity, trace.capacity, `${trace.name}: ordered capacity decisions`);
  if (trace.expectedDecisionPending) {
    assert.equal(projectCanonical(state).rounds[0]?.deciding, true, `${trace.name}: decision fence`);
  }
}
const state = initialCanonical(fixture.limits);
assert.deepEqual(projectCanonical(state).inventory, [
  "observationDispatch", "preparation", "reviewUnit", "storedResult", "operationalNotice", "adviceRecheck",
].map((purpose) => ({ purpose, limits: fixture.limits })));
assert.throws(() => stepCanonical(state, { kind: "openRound", partition: -1, lifetime: 1 }), TypeError);
assert.throws(() => stepCanonical(state, { kind: "openRound", partition: 1, lifetime: 1, extra: true }), TypeError);
assert.throws(() => stepCanonical(state, { kind: "openRound", partition: 2 ** 48, lifetime: 1 }), TypeError);
assert.throws(() => initialCanonical({ ...fixture.limits, globalBytes: 2 ** 47 }), TypeError);
assert.throws(() => initialCanonical({ ...fixture.limits, globalItems: 257 }), TypeError);
assert.throws(() => stepCanonical(state, { kind: "beginPreparation", partition: 1, lifetime: 1, round: 1, bytes: 2 ** 47 }), TypeError);
assert.throws(() => stepCanonical(state, { kind: "preparationCompleted", partition: 1, lifetime: 1, round: 1, operation: 1, unitBytes: new Array(1025).fill(1) }), TypeError);
assert.throws(() => stepCanonical(state, { kind: "reviewCompleted", partition: 1, lifetime: 1, round: 1, operation: 1, outcome: "unexpected" }), TypeError);
assert.throws(() => stepCanonical(state, { kind: "reserveCapacity", partition: 1, bytes: 1, purpose: "unknown" }), TypeError);
assert.throws(() => stepCanonical(state, { kind: "reserveCapacity", partition: 1, bytes: 2 ** 47, purpose: "preparation" }), TypeError);
assert.throws(() => stepCanonical(state, { kind: "resizeCapacity", reservation: 1, bytes: 1, purpose: "unknown" }), TypeError);
assert.throws(() => stepCanonical({ $: "Canonical.State" }, { kind: "openRound", partition: 1, lifetime: 1 }), TypeError);
let edge = initialCanonical({ globalItems: 2, globalBytes: 2 ** 47 - 1, partitionItems: 2, partitionBytes: 2 ** 47 - 1 });
edge = stepCanonical(edge, { kind: "openRound", partition: 1, lifetime: 1 }).state;
edge = stepCanonical(edge, { kind: "beginPreparation", partition: 1, lifetime: 1, round: 1, bytes: 1 }).state;
const nearLimit = stepCanonical(edge, { kind: "preparationCompleted", partition: 1, lifetime: 1, round: 1, operation: 1, unitBytes: [2 ** 47 - 1, 2 ** 47 - 1] });
assert.deepEqual(nearLimit.commands.map((command) => command.kind), ["preparationReleased", "unitAdmitted", "unitRefused"]);
assert.equal(projectCanonical(nearLimit.state).global.bytes, 2 ** 47 - 1);
const usageText = (usage) => `${usage.items}/${usage.bytes}`;
const capacityCommand = (command) => {
  const after = "after" in command ? `:${usageText(command.after.global)}:${usageText(command.after.local)}` : "";
  switch (command.kind) {
    case "capacityGranted": case "capacityResized": return `${command.kind}:${command.id}${after}`;
    case "preparationReleased": return `${command.kind}:${command.id}${after}`;
    case "capacityUnitAdmitted": return `${command.kind}:${command.position}:${command.reservation}${after}`;
    case "capacityUnitRefused": return `${command.kind}:${command.position}:${command.reason}${after}`;
    case "reservationReleased": return `${command.kind}:${command.id}`;
    default: throw new Error(`unexpected capacity trace command ${command.kind}`);
  }
};
let capacityState = initialCanonical(fixture.limits);
const capacityCommands = [];
for (const [index, event] of fixture.capacityTrace.events.entries()) {
  const result = stepCanonical(capacityState, event);
  capacityState = result.state;
  capacityCommands.push(result.rejection ? `rejected:${result.rejection}` :
    result.commands.map(capacityCommand).join(","));
  if (index === 7) assert.deepEqual(projectCanonical(capacityState).charges,
    fixture.capacityTrace.afterResizeCharges, "purpose change and competing ownership");
}
assert.deepEqual(capacityCommands, fixture.capacityTrace.commands, "resident capacity transition contract");
assert.deepEqual(projectCanonical(capacityState).global, fixture.capacityTrace.finalGlobal, "exact capacity release");
const permitFixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-permits-v1.json"), "utf8"));
for (const trace of permitFixture.traces) {
  let current = initialCanonical(fixture.limits);
  for (const item of trace.events) {
    const { expect: expected, kind, ...input } = item;
    const partition = input.partition;
    const lifetime = input.lifetime ?? 1;
    let event;
    if (kind === "issue") event = { kind: "issuePermit", partition, lifetime,
      tool: input.tool, started: input.started, now: input.now, deadline: input.deadline,
      facts: { clockValid: true, withinHookWindow: true, startedAfterClosure: input.afterClosure ?? true,
        duplicateEvent: false, permitCount: 0, permitLimit: 1024,
        roundCount: 0, roundLimit: 64, newRound: true, eventCount: 0, eventLimit: 4096 } };
    else if (kind === "consume") event = { kind: "consumePermit", partition, lifetime,
      token: input.token, tool: input.tool, now: input.now };
    else if (kind === "expire") event = { kind: "expirePermit", partition, lifetime,
      token: input.token, deadlineReached: input.due };
    else if (kind === "close") event = { kind: "closePermitRound", partition, lifetime,
      round: input.round, at: input.at, prospective: input.prospective };
    else throw new Error(`unknown permit fixture event ${kind}`);
    const result = stepCanonical(current, event);
    current = result.state;
    const actual = result.rejection ? `rejected:${result.rejection}` : result.commands.map((command) => {
      if (command.kind === "permitIssued") return `permitIssued:${command.token}:${command.round}`;
      if (command.kind === "permitConsumed" || command.kind === "permitRoundClosed") return `${command.kind}:${command.round}`;
      return command.kind;
    }).join(",");
    assert.equal(actual, expected, `${trace.name}: ${kind}`);
  }
  assert.deepEqual(projectCanonical(current).admissions.map((entry) => ({
    partition: entry.partition, round: entry.round, active: entry.active,
    permits: entry.permits.length, used: entry.used.length,
  })), trace.rounds, trace.name);
}
console.log(`checked ${fixture.traces.length + permitFixture.traces.length} independent source-free canonical traces`);
