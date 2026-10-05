import { expect } from "vitest"
import { createRun, restoreReplay, type Run } from "./index.ts"
import { validateCollectionResponseControl, type CollectionResponseControl } from "./collection-scenario.ts"

export const agent = "agent-1"
export const target: { id: number; partition: number; lifetime: number; round: number } = {
  id: 1,
  partition: 1,
  lifetime: 1,
  round: 1
}
export const control = (run: Run, value: CollectionResponseControl) =>
  run.applyControl(validateCollectionResponseControl(value))
export const opened = (deadline = 20, admittedBlock = false) => {
  const run = createRun({
    retention: 1000,
    preparationDelay: 2,
    jevDelay: 5,
    inputs: [{ at: 0, kind: "edit", agent, bytes: 10, unitBytes: [5], outcome: "finding" }]
  })
  expect(run.observe().agentScopes).toEqual([{ agent: "agent-1", partition: 1, seed: 1 }])
  run.advance({ untilTime: 0 })
  expect(run.observations.every((frame) => frame.agent === undefined || frame.agent === "agent-1")).toBe(true)
  control(run, {
    kind: "collectionResponse",
    action: "open",
    agent,
    response: {
      partition: target.partition,
      lifetime: target.lifetime,
      round: target.round,
      started: 0,
      deadline,
      admittedBlock
    }
  })
  return run
}
export const attempt = (run: Run, currentBlock = false, identity = target) =>
  control(run, { kind: "collectionResponse", action: "attempt", agent, target: identity, currentBlock })
export const terminal = (run: Run) => run.observations.filter((frame) => frame.event.kind === "submissionTerminal")
export const replayExact = (run: Run) =>
  expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe())
