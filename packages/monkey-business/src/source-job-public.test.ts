import { expect, it } from "vitest"
import { createRun, DEFAULT_FILE_TREE_PROFILE, type RunStructuralFrame } from "./index.ts"

it("retains the original SourceJob on collector-after public emissions", () => {
  const run = createRun({
    outcome: "finding",
    preparationDelay: 2,
    jevDelay: 5,
    retention: 1000,
    lifecycles: { collectors: { capacity: 1, lifetimeMs: 20 } },
    inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5] }]
  })
  let sourceJob: unknown
  run.subscribeStructural((frame) => {
    const release = frame.after.queue.find(
      (item) => item.input.kind === "canonical" && item.input.event.kind === "collectionReleaseBackground"
    )
    if (release) sourceJob = release.driverSourceJob
  })

  run.advance({ untilTime: 7, maxEvents: 200 })

  expect(sourceJob).toEqual({ partition: 1, lifetime: 1, bytes: 10, units: [5], outcome: { $: "None" } })
})

it("retains the original SourceJob when a second edit enters an active round", () => {
  const run = createRun({
    outcome: "finding",
    preparationDelay: 2,
    jevDelay: 5,
    retention: 1000,
    fileTrees: {
      ...DEFAULT_FILE_TREE_PROFILE,
      minFiles: 1,
      maxFiles: 1,
      maxImports: 0,
      minSourceBytes: 100,
      maxSourceBytes: 100,
      minTreeBytes: 20,
      maxTreeBytes: 20
    },
    inputs: [
      { at: 0, kind: "edit", bytes: 10, unitBytes: [5] },
      { at: 40, kind: "edit", bytes: 10, unitBytes: [5] }
    ]
  })
  const structural: RunStructuralFrame[] = []
  run.subscribeStructural((frame) => structural.push(frame))

  run.advance({ untilTime: 42, maxEvents: 200 })

  const expected = { partition: 1, lifetime: 1, bytes: 10, units: [5], outcome: { $: "None" } }
  const admitted = structural.find(
    (frame) =>
      frame.kind === "canonical" &&
      frame.observation.event.kind === "admitObservation" &&
      frame.scheduled.job?.at === 40
  )
  expect(admitted?.scheduled.driverSourceJob).toEqual(expected)
  if (!admitted || admitted.observation.event.kind !== "admitObservation")
    throw new Error("active-round edit was not admitted")
  const operation = admitted.observation.commands.find((command) => command.kind === "observationAdmitted")?.id
  expect(operation).toBeDefined()
  expect(admitted.after.jobs.find(([id]) => id === operation)?.[1].driverSourceJob).toEqual(expected)

  const dispatch = structural.find(
    (frame) =>
      frame.kind === "canonical" &&
      frame.observation.event.kind === "queueDispatch" &&
      frame.observation.event.operation === operation
  )
  expect(dispatch?.scheduled.driverSourceJob).toEqual(expected)
})
