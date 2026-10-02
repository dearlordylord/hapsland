import { expect, it } from "vitest";
import { createRun, restoreReplay } from "./index.ts";

it.each(["neverSent", "backendFailure", "timeout", "interrupted"] as const)(
  "releases each request and restores delivery through twelve %s cycles without reset",
  outcome => {
    const run = createRun({ inputs: [], outcome: "finding", jevDelay: 5, retention: 10000 });
    for (let cycle = 0; cycle < 12; cycle++) {
      for (const selected of [outcome, "finding"] as const) {
        run.applyControl({ kind: "jevProfile", delayMs: 5, outcome: selected });
        const start = run.eventCount;
        run.schedule({ at: run.now, kind: "edit", bytes: 10, unitBytes: [5] });
        run.advance({ untilTime: run.now + 20, maxEvents: 100 });
        const frames = run.observations.filter(frame => frame.sequence >= start);
        const settled = frames.filter(frame => frame.event.kind === "jevRequestSettled");
        expect(settled).toHaveLength(1);
        expect(settled[0]?.event).toMatchObject({ outcome: selected });
        expect(frames.filter(frame => frame.event.kind === "jevRequestStarted")).toHaveLength(selected === "neverSent" ? 0 : 1);
        expect(frames.filter(frame => frame.event.kind === "jevRequestInterrupted")).toHaveLength(selected === "interrupted" ? 1 : 0);
        expect(frames.filter(frame => frame.rejection)).toEqual([]);
        expect(run.projection.dispatch.requests).toEqual([]);
        expect(run.projection.dispatch.running).toEqual([]);
        expect(frames.flatMap(frame => frame.commands).filter(command => command.kind === "submissionRecorded")).toHaveLength(selected === "finding" ? 1 : 0);
        if (selected === "finding") expect(frames.some(frame => frame.after.collection.ready.length > 0)).toBe(true);
      }
    }
    const replay = restoreReplay(run.exportReplay());
    expect(replay.observations).toEqual(run.observations);
    expect(replay.projection).toEqual(run.projection);
  },
);
