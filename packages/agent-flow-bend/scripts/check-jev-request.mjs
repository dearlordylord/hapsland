import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initialCanonical, projectCanonical, stepCanonical } from "../../../src/canonical/adapter.ts";

const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname,
  "../../../conformance/canonical-jev-request-v1.json"), "utf8"));

for (const trace of fixture.traces) {
  let state = initialCanonical(fixture.limits);
  for (const step of trace.events) {
    const { expect: expected, issuedRequest, requestCount, ...event } = step;
    const result = stepCanonical(state, event);
    state = result.state;
    const actual = result.rejection === undefined
      ? result.commands.map((command) => command.kind).join(",")
      : `rejected:${result.rejection}`;
    assert.equal(actual, expected, `${trace.name}: ${event.kind} operation ${event.operation ?? "-"}`);
    const issued = result.commands.filter((command) => command.kind === "jevRequestIssued");
    assert.deepEqual(issued, issuedRequest === undefined ? [] : [issuedRequest],
      `${trace.name}: exact issued request identity`);
    if (requestCount != null) {
      assert.equal(projectCanonical(state).dispatch.requests.length, requestCount,
        `${trace.name}: request permits`);
    }
  }
}

const initial = initialCanonical(fixture.limits);
assert.throws(() => stepCanonical(initial, { kind: "jevRequestSettled", partition: 1,
  lifetime: 1, round: 1, operation: 2, request: 3,
  outcome: "not-a-result", currentWork: true }), TypeError);
assert.throws(() => stepCanonical(initial, { kind: "jevRequestReady", partition: 1,
  lifetime: 1, round: 1, operation: 2, rootValid: true,
  configurationValid: true, credentialReady: true, selected: true,
  currentWork: true, physicalAvailable: true, source: "forbidden" }), TypeError);
console.log(`checked ${fixture.traces.length} independent Jev request traces`);
