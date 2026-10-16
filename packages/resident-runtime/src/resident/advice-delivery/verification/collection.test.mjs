import { it } from "node:test"
import assert from "node:assert/strict"
import core from "../../../../dist/resident/advice-delivery/collection-core.js"

const list = (items) => items.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
const ack = { $: "Ack" }
const handle = (value) => ({ $: "Handle", handle: value })
const truth = (value) => ({ $: "Truth", value })
const content = (value, owned = true) => ({ $: "Content", handle: value, owned })
const route = (value) => ({ $: "Route", disposition: { $: value } })
const run = (candidates, trace, expected) => {
  let step = core.initial(71, list(candidates))
  for (const [command, response, atomic = false] of trace) {
    assert.equal(step.$, "Await")
    assert.deepEqual(step.request.command, command)
    assert.equal(core.atomic(step), atomic)
    const before = JSON.stringify(step),
      request = step.request
    const reply = { $: "Reply", invocation: request.invocation, id: request.id, response }
    assert.deepEqual(core.resume(step, { ...reply, invocation: 72 }), { $: "Rejected" })
    assert.deepEqual(core.resume(step, { ...reply, id: request.id + 1 }), { $: "Rejected" })
    assert.deepEqual(core.resume(step, { ...reply, response: response.$ === "Route" ? ack : route("Other") }), {
      $: "Rejected"
    })
    assert.equal(JSON.stringify(step), before)
    step = core.resume(step, reply)
  }
  assert.deepEqual(step, expected)
  assert.deepEqual(core.resume(step, { $: "Reply", invocation: 71, id: 1, response: ack }), { $: "Rejected" })
}
const opening = [
  [{ $: "AllocateToken" }, handle(42)],
  [{ $: "OpenFresh", candidate: 7 }, handle(100)],
  [
    { $: "PullFresh", stream: 100, candidate: 7 },
    { $: "Fresh", advice: 8, same_id: false, unleased: false }
  ],
  [
    { $: "PullFresh", stream: 100, candidate: 7 },
    { $: "Fresh", advice: 9, same_id: true, unleased: false }
  ],
  [
    { $: "PullFresh", stream: 100, candidate: 7 },
    { $: "Fresh", advice: 7, same_id: true, unleased: true }
  ],
  [{ $: "CloseStream", stream: 100 }, ack],
  [{ $: "Reserve", advice: 7, token: 42 }, truth(true)]
]
const selectedPass = (final) => [
  [{ $: "Barrier", advice: 7, final }, ack],
  [{ $: "OpenRetained", advice: 7 }, handle(101)],
  [
    { $: "PullRetained", stream: 101, advice: 7 },
    { $: "Owner", same_id: false, same_pointer: false }
  ],
  [
    { $: "PullRetained", stream: 101, advice: 7 },
    { $: "Owner", same_id: true, same_pointer: true }
  ],
  [{ $: "CloseStream", stream: 101 }, ack],
  [{ $: "ReadDelivery", advice: 7, token: 42 }, content(201)],
  [{ $: "CheckWork", advice: 7 }, truth(true)],
  [{ $: "OpenFindings", advice: 7, content: 201 }, handle(102)],
  [{ $: "PullFinding", stream: 102 }, handle(301)],
  [{ $: "Suppressed", advice: 7, stream: 102, finding: 301 }, truth(false)],
  [{ $: "PullFinding", stream: 102 }, handle(302)],
  [{ $: "Suppressed", advice: 7, stream: 102, finding: 302 }, truth(true)],
  [{ $: "ObserveSuppressed", advice: 7, finding: 302 }, ack],
  [{ $: "PullFinding", stream: 102 }, { $: "Exhausted" }],
  [{ $: "CloseStream", stream: 102 }, ack],
  [
    { $: "Fit", advice: 7, retained: list([]), candidates: list([301]) },
    { $: "Fitting", findings: list([401]), limited: 2 },
    true
  ],
  [{ $: "RecordLimited", advice: 7 }, ack, true],
  [{ $: "RecordLimited", advice: 7 }, ack, true],
  [{ $: "PostCheck", has_fitting: true }, route("Retain")]
]
const update = [{ $: "Update", advice: 7, token: 42, findings: list([401]) }, ack]
it("allocates the original token even when eligibility is empty", () => {
  run([], [[{ $: "AllocateToken" }, handle(42)]], { $: "Empty" })
})
it("owns both complete passes, lazy matching, suppression, fitting reports and the final token reread", () => {
  run(
    [7],
    [
      ...opening,
      ...selectedPass(false),
      update,
      ...selectedPass(true),
      [{ $: "ReadDelivery", advice: 7, token: 42 }, content(202)],
      update
    ],
    { $: "Selected", token: 42, advice: list([7]) }
  )
})
it("same advice ID with a replaced capability cannot pass identity validation", () => {
  run(
    [7],
    [
      ...opening,
      [{ $: "Barrier", advice: 7, final: false }, ack],
      [{ $: "OpenRetained", advice: 7 }, handle(101)],
      [
        { $: "PullRetained", stream: 101, advice: 7 },
        { $: "Owner", same_id: true, same_pointer: false }
      ],
      [{ $: "CloseStream", stream: 101 }, ack]
    ],
    { $: "Empty" }
  )
})
it("a lost final token stops before updating delivery", () => {
  run(
    [7],
    [
      ...opening,
      ...selectedPass(false),
      update,
      ...selectedPass(true),
      [{ $: "ReadDelivery", advice: 7, token: 42 }, content(202, false)]
    ],
    { $: "Empty" }
  )
})
for (const disposition of ["Retire", "ReleaseCandidate", "Other"])
  it(`executes the Canonical ${disposition} disposition`, () => {
    const pass = selectedPass(false)
    pass[pass.length - 1] = [{ $: "PostCheck", has_fitting: true }, route(disposition)]
    run(
      [7],
      [
        ...opening,
        ...pass,
        [disposition === "Retire" ? { $: "Remove", advice: 7, token: 42 } : { $: "Release", advice: 7 }, ack]
      ],
      { $: "Empty" }
    )
  })
