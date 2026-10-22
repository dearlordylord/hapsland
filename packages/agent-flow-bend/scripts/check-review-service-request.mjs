import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { initialCanonical, projectCanonical, stepCanonical } from "@hapsland/canonical-policy/canonical/adapter"

const fixture = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-review-service-request-v1.json"), "utf8")
)

for (const trace of fixture.traces) {
  let state = initialCanonical(fixture.limits)
  for (const step of trace.events) {
    const { expect: expected, issuedReviewServiceRequestId, requestCount, ...event } = step
    const result = stepCanonical(state, event)
    state = result.state
    const actual =
      result.rejection === undefined
        ? result.outputs.map((command) => command.kind).join(",")
        : `rejected:${result.rejection}`
    assert.equal(actual, expected, `${trace.name}: ${event.kind} operation ${event.operation ?? "-"}`)
    const issued = result.outputs.filter((command) => command.kind === "reviewServiceRequestIssued")
    assert.deepEqual(
      issued,
      issuedReviewServiceRequestId === undefined ? [] : [issuedReviewServiceRequestId],
      `${trace.name}: exact issued request identity`
    )
    if (requestCount != null) {
      assert.equal(
        projectCanonical(state).dispatch.reviewServiceRequests.length,
        requestCount,
        `${trace.name}: request permits`
      )
    }
  }
}

const initial = initialCanonical(fixture.limits)
assert.throws(
  () =>
    stepCanonical(initial, {
      kind: "reviewServiceRequestSettled",
      partition: 1,
      lifetime: 1,
      round: 1,
      operation: 2,
      request: 3,
      outcome: "not-a-result",
      currentWork: true
    }),
  TypeError
)
assert.throws(
  () =>
    stepCanonical(initial, {
      kind: "reviewServiceRequestReady",
      partition: 1,
      lifetime: 1,
      round: 1,
      operation: 2,
      rootValid: true,
      configurationValid: true,
      credentialReady: true,
      selected: true,
      currentWork: true,
      physicalAvailable: true,
      source: "forbidden"
    }),
  TypeError
)
console.log(`checked ${fixture.traces.length} independent Jev request traces`)
