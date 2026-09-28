import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initialCanonical, projectCanonical, stepCanonical } from "../canonical-adapter.ts";

const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-v1.json"), "utf8"));
const format = (commands) => commands.map((item) => {
  switch (item.kind) {
    case "prepare": case "unitAdmitted": return `${item.kind}:${item.operation}:${item.reservation}`;
    case "roundStarted": case "reservationReleased": return `${item.kind}:${item.id}`;
    case "partitionRetired": return `${item.kind}:${item.round}`;
    case "writeAuthorized": case "cancelWork": return `${item.kind}:${item.operation}`;
    case "reviewRecorded": case "writeRecorded": return `${item.kind}:${item.outcome}`;
    default: return item.kind;
  }
}).join(",");
for (const trace of fixture.traces) {
  let state = initialCanonical(fixture.limits);
  const commands = [];
  for (const event of trace.events) {
    const result = stepCanonical(state, event);
    state = result.state;
    commands.push(result.rejection ? `rejected:${result.rejection}` : format(result.commands));
  }
  assert.deepEqual(commands, trace.commands, trace.name);
  assert.deepEqual(projectCanonical(state).global, trace.global, `${trace.name}: ledger`);
  assert.deepEqual(projectCanonical(state).partitions, trace.partitions, `${trace.name}: advicee usage`);
  if (trace.charges) assert.deepEqual(projectCanonical(state).charges, trace.charges, `${trace.name}: reservations`);
  if (trace.expectedDecisionPending) {
    assert.equal(projectCanonical(state).rounds[0]?.deciding, true, `${trace.name}: decision fence`);
  }
}
const state = initialCanonical(fixture.limits);
assert.throws(() => stepCanonical(state, { kind: "openRound", partition: -1, lifetime: 1 }), TypeError);
assert.throws(() => stepCanonical(state, { kind: "openRound", partition: 1, lifetime: 1, extra: true }), TypeError);
assert.throws(() => stepCanonical(state, { kind: "openRound", partition: 2 ** 48, lifetime: 1 }), TypeError);
assert.throws(() => initialCanonical({ ...fixture.limits, globalBytes: 2 ** 47 }), TypeError);
assert.throws(() => initialCanonical({ ...fixture.limits, globalItems: 257 }), TypeError);
assert.throws(() => stepCanonical(state, { kind: "beginPreparation", partition: 1, lifetime: 1, round: 1, bytes: 2 ** 47 }), TypeError);
assert.throws(() => stepCanonical(state, { kind: "preparationCompleted", partition: 1, lifetime: 1, round: 1, operation: 1, unitBytes: new Array(17).fill(1) }), TypeError);
assert.throws(() => stepCanonical(state, { kind: "reviewCompleted", partition: 1, lifetime: 1, round: 1, operation: 1, outcome: "unexpected" }), TypeError);
assert.throws(() => stepCanonical({ $: "Canonical.State" }, { kind: "openRound", partition: 1, lifetime: 1 }), TypeError);
let edge = initialCanonical({ globalItems: 2, globalBytes: 2 ** 47 - 1, partitionItems: 2, partitionBytes: 2 ** 47 - 1 });
edge = stepCanonical(edge, { kind: "openRound", partition: 1, lifetime: 1 }).state;
edge = stepCanonical(edge, { kind: "beginPreparation", partition: 1, lifetime: 1, round: 1, bytes: 1 }).state;
const nearLimit = stepCanonical(edge, { kind: "preparationCompleted", partition: 1, lifetime: 1, round: 1, operation: 1, unitBytes: [2 ** 47 - 1, 2 ** 47 - 1] });
assert.deepEqual(nearLimit.commands.map((command) => command.kind), ["reservationReleased", "unitAdmitted", "unitRefused"]);
assert.equal(projectCanonical(nearLimit.state).global.bytes, 2 ** 47 - 1);
console.log(`checked ${fixture.traces.length} independent source-free canonical traces`);
