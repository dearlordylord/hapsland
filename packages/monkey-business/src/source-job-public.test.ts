import { expect, it } from "vitest";
import { createRun } from "./index.ts";

it("retains the original SourceJob on collector-after public emissions", () => {
  const run = createRun({
    outcome: "finding",
    preparationDelay: 2,
    jevDelay: 5,
    retention: 1000,
    lifecycles: { collectors: { capacity: 1, lifetimeMs: 20 } },
    inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5] }],
  });
  let sourceJob: unknown;
  run.subscribeStructural(frame => {
    const release = frame.after.queue.find(item =>
      item.input.kind === "canonical" && item.input.event.kind === "collectionReleaseBackground");
    if (release) sourceJob = release.driverSourceJob;
  });

  run.advance({ untilTime: 7, maxEvents: 200 });

  expect(sourceJob).toEqual({
    partition: 1,
    lifetime: 1,
    bytes: 10,
    units: [5],
    outcome: { $: "None" },
  });
});
