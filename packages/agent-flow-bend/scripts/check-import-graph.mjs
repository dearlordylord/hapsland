import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initialImportGraph, permitLocalGraphFacts, projectImportGraph, stepImportGraph } from "../import-graph-adapter.ts";

const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../conformance/import-graph-v1.json"), "utf8"));
for (const trace of fixture.traces) {
  let state = initialImportGraph(trace.limits);
  const commands = [];
  const phases = [];
  for (const event of trace.events) {
    const result = stepImportGraph(state, event);
    state = result.state;
    phases.push(projectImportGraph(state).phase);
    const command = result.command;
    commands.push(command.kind + ("edge" in command ? `:${command.edge}` : "target" in command ? `:${command.target}` : "") + ("reason" in command ? `:${command.reason}` : ""));
  }
  assert.deepEqual(commands, trace.commands, `${trace.name}: command sequence`);
  assert.deepEqual(phases, trace.phases, `${trace.name}: phase sequence`);
  const projected = projectImportGraph(state);
  assert.deepEqual(projected.limits, trace.limits ?? projectImportGraph(initialImportGraph()).limits, `${trace.name}: effective limits snapshot`);
  for (const [key, expected] of Object.entries(trace.expected)) {
    assert.deepEqual(projected[key], expected, `${trace.name}: ${key}`);
  }
  if (trace.name === "A to B to excluded C") {
    assert.equal(commands.some((item) => item === "readSource:3"), false, `${trace.name}: excluded C read`);
  }
  const afterDeadline = stepImportGraph(state, { kind: "deadlineReached" });
  assert.deepEqual(projectImportGraph(afterDeadline.state), projected, `${trace.name}: terminal result is stable`);
  assert.equal(afterDeadline.command.kind, "none", `${trace.name}: terminal deadline has no command`);
}
let deadlineState = initialImportGraph();
deadlineState = stepImportGraph(deadlineState, { kind: "root", target: 1, sourceBytes: 1, treeBytes: 1, edges: [10] }).state;
const deadline = stepImportGraph(deadlineState, { kind: "deadlineReached" });
assert.equal(deadline.command.kind, "unitIncomplete");
assert.equal(deadline.command.reason, "Deadline");
assert.equal(projectImportGraph(deadline.state).phase, "incomplete");
assert.throws(() => stepImportGraph(initialImportGraph(), { kind: "root", target: -1, sourceBytes: 1, treeBytes: 1, edges: [] }), TypeError);
assert.throws(() => initialImportGraph({ ...projectImportGraph(initialImportGraph()).limits, sourceBytes: 0 }), /graphLimits.sourceBytes/);
assert.throws(() => initialImportGraph({ ...projectImportGraph(initialImportGraph()).limits, readBytes: 1 }), /graphLimits.readBytes/);
const defaults = projectImportGraph(initialImportGraph()).limits;
const charged = { ...defaults, work: 3 };
let combined = initialImportGraph(charged);
const combinedEvents = [
  { kind: "root", target: 1, sourceBytes: 1, treeBytes: 1, localWork: 0, edges: [10] },
  { kind: "next" },
  { kind: "resolved", target: 2, result: "found" },
  { kind: "pathChecked", allowed: true },
  { kind: "captured", sourceBytes: 1, treeBytes: 1, localWork: 1, edges: [11] },
  { kind: "next" },
  { kind: "resolved", target: 3, result: "found" },
  { kind: "pathChecked", allowed: true },
  { kind: "captured", sourceBytes: 1, treeBytes: 1, localWork: 0, edges: [12] },
  { kind: "next" },
];
let lastCombined;
for (const event of combinedEvents) {
  lastCombined = stepImportGraph(combined, event);
  combined = lastCombined.state;
}
assert.equal(lastCombined.command.kind, "unitIncomplete");
assert.equal(lastCombined.command.reason, "WorkLimit");
assert.equal(projectImportGraph(combined).work, 3);
assert.deepEqual(projectImportGraph(combined).pending, [12]);
assert.equal(permitLocalGraphFacts(defaults, 4, 4, 16, 124), true);
assert.equal(permitLocalGraphFacts(defaults, 5, 4, 16, 124), false);
assert.equal(permitLocalGraphFacts(defaults, 4, 5, 16, 0), false);
assert.equal(permitLocalGraphFacts(defaults, 4, 4, 17, 0), false);
const rootAt = (overrides, sourceBytes, treeBytes, edges = []) => {
  const state = initialImportGraph({ ...defaults, ...overrides });
  return stepImportGraph(state, { kind: "root", target: 1, sourceBytes, treeBytes, edges });
};
assert.equal(projectImportGraph(rootAt({}, defaults.sourceBytes, defaults.treeBytes, Array.from({ length: 16 }, (_, i) => i + 1)).state).phase, "ready");
assert.equal(rootAt({}, defaults.sourceBytes + 1, 1).command.reason, "ReadLimit");
assert.equal(rootAt({}, 1, defaults.treeBytes + 1).command.reason, "TreeLimit");
assert.equal(rootAt({}, 1, 1, Array.from({ length: 17 }, (_, i) => i + 1)).command.reason, "WorkLimit");
const fileRoot = rootAt({ files: 1 }, 1, 1, [10]).state;
const fileNext = stepImportGraph(fileRoot, { kind: "next" }).state;
const fileResolved = stepImportGraph(fileNext, { kind: "resolved", target: 2, result: "found" }).state;
assert.equal(stepImportGraph(fileResolved, { kind: "pathChecked", allowed: true }).command.reason, "FileLimit");
const readRoot = rootAt({ sourceBytes: 100, readBytes: 100 }, 100, 1, [10]).state;
const readNext = stepImportGraph(readRoot, { kind: "next" }).state;
const readResolved = stepImportGraph(readNext, { kind: "resolved", target: 2, result: "found" }).state;
assert.equal(stepImportGraph(readResolved, { kind: "pathChecked", allowed: true }).command.reason, "ReadLimit");
assert.equal(projectImportGraph(readResolved).readBytes, 100);
const badEvent = stepImportGraph(initialImportGraph(), { kind: "next" });
assert.equal(badEvent.command.reason, "ProtocolViolation");
const noFuel = structuredClone(initialImportGraph());
noFuel.remaining = 0;
assert.equal(stepImportGraph(noFuel, { kind: "next" }).command.reason, "WorkLimit");
assert.equal(Object.isFrozen(initialImportGraph()), true);
console.log(`checked ${fixture.traces.length} independent source-free import graph traces`);
