import { expect, it } from "vitest"
import { collectionResponseAction } from "./collection-response-controls"
it("decodes actual response opening facts and refuses caller-chosen capabilities", () => {
  const control = {
    kind: "collectionResponse",
    action: "open",
    agent: "opaque",
    response: { partition: 1, lifetime: 2, round: 3, started: 7, deadline: 17, admittedBlock: false }
  }
  expect(collectionResponseAction(`response:${encodeURIComponent(JSON.stringify(control))}`)).toEqual(control)
  expect(collectionResponseAction("completion:unrelated")).toBeUndefined()
  expect(() =>
    collectionResponseAction(
      `response:${encodeURIComponent(JSON.stringify({ ...control, response: { ...control.response, id: 41 } }))}`
    )
  ).toThrow()
})
it("keeps the originally minted response tuple on retry or close", () => {
  const control = {
    kind: "collectionResponse",
    action: "attempt",
    agent: "opaque",
    target: { id: 1, partition: 1, lifetime: 2, round: 3 },
    currentBlock: false
  }
  expect(collectionResponseAction(`response:${encodeURIComponent(JSON.stringify(control))}`)).toEqual(control)
  expect(() =>
    collectionResponseAction(
      `response:${encodeURIComponent(JSON.stringify({ ...control, target: { ...control.target, lifetime: 0 } }))}`
    )
  ).toThrow()
})
