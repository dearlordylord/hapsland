import { describe, it } from "node:test"
import assert from "node:assert/strict"
import core from "../../../../dist/resident/advice-delivery/batch-fitting-core.js"

const indices = (list) => {
  const result = []
  while (list.$ === "Con") {
    result.push(list.head)
    list = list.tail
  }
  return result
}

const observation = (command) => {
  switch (command.$) {
    case "BeginCurrent":
      return "begin"
    case "Pull":
      return `pull:${command.stream.$}`
    case "MeasureProspective":
      return `prospective:${indices(command.staged).join(",")}:${command.index}`
    case "MeasureSolo":
      return `solo:${command.index}`
    case "OfferFinding":
      return `finding:${command.index}:${command.retained}:${command.selected_count}:${command.prospective}:${command.solo}`
    case "NotifyLimited":
      return `limited:${command.index}`
    case "OfferNotice":
      return `notice:${command.index}:${command.prospective}:${command.skip_unfitting}`
    default: {
      const exhaustive = command
      throw new Error(`Unknown fitting command: ${exhaustive}`)
    }
  }
}

const scenario = (mode, script, selected) => {
  let step = core.initial(23, mode)
  for (const [expected, response] of script) {
    if (step.$ !== "Await") throw new Error(`Fitting stopped before ${expected}`)
    assert.equal(observation(step.request.command), expected)
    const request = step.request
    const before = structuredClone(step)
    assert.deepEqual(core.resume(step, { $: "Reply", invocation: 24, id: request.id, response }), { $: "Rejected" })
    assert.deepEqual(core.resume(step, { $: "Reply", invocation: 23, id: request.id + 1, response }), { $: "Rejected" })
    assert.deepEqual(
      core.resume(step, {
        $: "Reply",
        invocation: 23,
        id: request.id,
        response: { $: request.command.$ === "NotifyLimited" ? "Selected" : "Ack" }
      }),
      { $: "Rejected" }
    )
    assert.deepEqual(core.resume(step, { $: "Reply", invocation: 23, id: request.id, response: { $: "Failed" } }), {
      $: "Finished",
      selected: { $: "Nil" }
    })
    assert.deepEqual(step, before)
    step = core.resume(step, { $: "Reply", invocation: 23, id: request.id, response })
  }
  if (step.$ !== "Finished") throw new Error("Fitting requested effects after the expected terminal")
  assert.deepEqual(indices(step.selected), selected)
  assert.deepEqual(core.resume(step, { $: "Reply", invocation: 23, id: 0, response: { $: "Ack" } }), { $: "Rejected" })
}

describe("compiled delivery batch fitting protocol", () => {
  it("finishes both empty finding streams without measurements", () => {
    scenario(
      { $: "Findings" },
      [
        ["pull:Retained", { $: "Exhausted" }],
        ["pull:Candidates", { $: "Exhausted" }]
      ],
      []
    )
  })

  it("refuses retained findings before pulling candidates or reporting a limit", () => {
    scenario(
      { $: "Findings" },
      [
        ["pull:Retained", { $: "Found", index: 7 }],
        ["prospective::7", { $: "Measured", handle: 41 }],
        ["solo:7", { $: "Measured", handle: 43 }],
        ["finding:7:true:0:41:43", { $: "Limited" }]
      ],
      []
    )
  })

  it("retains staging while skipping limited candidates and notifying once", () => {
    scenario(
      { $: "Findings" },
      [
        ["pull:Retained", { $: "Found", index: 7 }],
        ["prospective::7", { $: "Measured", handle: 41 }],
        ["solo:7", { $: "Measured", handle: 43 }],
        ["finding:7:true:0:41:43", { $: "Selected" }],
        ["pull:Retained", { $: "Exhausted" }],
        ["pull:Candidates", { $: "Found", index: 8 }],
        ["prospective:7:8", { $: "Measured", handle: 47 }],
        ["solo:8", { $: "Measured", handle: 53 }],
        ["finding:8:false:1:47:53", { $: "Limited" }],
        ["limited:8", { $: "Ack" }],
        ["pull:Candidates", { $: "Found", index: 9 }],
        ["prospective:7:9", { $: "Measured", handle: 59 }],
        ["solo:9", { $: "Measured", handle: 61 }],
        ["finding:9:false:1:59:61", { $: "Selected" }],
        ["pull:Candidates", { $: "Exhausted" }]
      ],
      [9]
    )
  })

  it("does not open an empty current-offer stream", () => {
    scenario({ $: "CurrentFindings" }, [["begin", { $: "Exhausted" }]], [])
  })

  it("stops a notice prefix and forwards the surface-specific offer flag", () => {
    for (const skip_unfitting of [true, false]) {
      scenario(
        { $: "Notices", skip_unfitting },
        [
          ["pull:NoticeOffers", { $: "Found", index: 4 }],
          ["prospective::4", { $: "Measured", handle: 67 }],
          [`notice:4:67:${skip_unfitting}`, { $: "Included" }],
          ["pull:NoticeOffers", { $: "Found", index: 5 }],
          ["prospective:4:5", { $: "Measured", handle: 71 }],
          [`notice:5:71:${skip_unfitting}`, { $: "Skipped" }],
          ["pull:NoticeOffers", { $: "Found", index: 6 }],
          ["prospective:4:6", { $: "Measured", handle: 73 }],
          [`notice:6:73:${skip_unfitting}`, { $: "Stopped" }]
        ],
        [4]
      )
    }
  })

  it("discards prior notice selection on an invalid offer", () => {
    scenario(
      { $: "Notices", skip_unfitting: true },
      [
        ["pull:NoticeOffers", { $: "Found", index: 4 }],
        ["prospective::4", { $: "Measured", handle: 67 }],
        ["notice:4:67:true", { $: "Included" }],
        ["pull:NoticeOffers", { $: "Found", index: 5 }],
        ["prospective:4:5", { $: "Measured", handle: 71 }],
        ["notice:5:71:true", { $: "InvalidNotice" }]
      ],
      []
    )
  })
})
