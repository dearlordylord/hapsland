import { expect, it } from "vitest"
import Engine from "../../monkey-business-bend/engine.mjs"
import { encodeSharedValue } from "../../../src/canonical/simulation-codec.ts"
import { readRecord } from "../../../src/canonical/boundary-schema.ts"

it("refuses an original output receipt without actual queued delivery provenance atomically", () => {
  const state = Engine.initial(
    encodeSharedValue({
      $: "Canonical.Limits",
      global_items: 32,
      global_bytes: 4096,
      partition_items: 16,
      partition_bytes: 2048
    })
  )
  const owner = { $: "Callbacks.Owner", partition: 1, lifetime: 2, round: 3, operation: 4 }
  const capture = {
    $: "OutputScenario.Capture",
    attempt: { $: "OutputScenario.Individual", advice: 7, token: 9 },
    started: 7,
    outcome: { $: "OutputScenario.Certain" },
    delay: 5,
    lease: 10
  }
  const issued = Engine.callback_issue_output(
    state,
    encodeSharedValue(owner),
    17n,
    12n,
    encodeSharedValue({
      $: "Driver.Action",
      event: { $: "Canonical.SubmissionTerminal", advice: 7, token: 9, certain: true },
      delay: 5,
      candidate: { $: "None" },
      job: false,
      expiry_advice: { $: "None" }
    }),
    encodeSharedValue(capture)
  )
  const receipt = readRecord(issued.receipt)
  expect(receipt.$).toBe("Some")
  const fact = readRecord(receipt.value)
  const result = Engine.output_intervene(
    issued.state,
    fact.target,
    encodeSharedValue({ $: "OutputScenario.Certain" }),
    issued.receipt
  )
  expect(result.state).toBe(issued.state)
  expect(result.result).toEqual({ $: "Callbacks.NotQueued" })
  expect(result.cancel).toEqual({ $: "Nil" })
  expect(result.schedule).toEqual({ $: "Nil" })
  expect(result.receipt).toEqual({ $: "None" })
})
