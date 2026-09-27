import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initialImportGraph, projectImportGraph, stepImportGraph } from "../import-graph-adapter.ts";

const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../conformance/import-graph-v1.json"), "utf8"));
for (const trace of fixture.traces) {
  let state = initialImportGraph();
  const commands = [];
  const phases = [];
  for (const event of trace.events) {
    const result = stepImportGraph(state, event);
    state = result.state;
    phases.push(projectImportGraph(state).phase);
    const command = result.command;
    commands.push(command.kind + ("edge" in command ? `:${command.edge}` : "target" in command ? `:${command.target}` : "reason" in command ? `:${command.reason}` : ""));
  }
  assert.deepEqual(commands, trace.commands, `${trace.name}: command sequence`);
  assert.deepEqual(phases, trace.phases, `${trace.name}: phase sequence`);
  const projected = projectImportGraph(state);
  for (const [key, expected] of Object.entries(trace.expected)) {
    assert.deepEqual(projected[key], expected, `${trace.name}: ${key}`);
  }
  assert.equal(commands.some((item) => item === "readSource:3"), false, `${trace.name}: excluded C read`);
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
console.log(`checked ${fixture.traces.length} independent source-free import graph traces`);
