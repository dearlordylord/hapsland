import { expect, it } from "vitest"
import { outputAttemptAction } from "./output-attempt-controls"

it("preserves original ordered delivery identity and rejects extra control payload", () => {
  const control = {
    kind: "outputAttempt",
    outcome: "uncertain",
    target: {
      owner: { partition: 1, lifetime: 2, round: 3, operation: 7 },
      originalOrder: 17,
      effect: { kind: "finishTerminal", group: 1, round: 3, attempt: 5, token: 11, selected: [7, 9] }
    }
  }
  const value = `output-attempt:${encodeURIComponent(JSON.stringify(control))}`
  expect(outputAttemptAction(value)).toEqual(control)
  expect(outputAttemptAction("completion:unrelated")).toBeUndefined()
  expect(() =>
    outputAttemptAction(`output-attempt:${encodeURIComponent(JSON.stringify({ ...control, extra: true }))}`)
  ).toThrow()
  expect(() =>
    outputAttemptAction(
      `output-attempt:${encodeURIComponent(JSON.stringify({ ...control, target: { ...control.target, effect: { ...control.target.effect, selected: [7, 7] } } }))}`
    )
  ).toThrow()
})
