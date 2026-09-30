import { expect, it } from "vitest";
import { createRun, restoreReplay, type OutcomeWeights } from "./index.ts";

const failures = ["neverSent", "backendFailure", "timeout", "interrupted"] as const;
const weights = (outcome: keyof OutcomeWeights): OutcomeWeights => ({
  neverSent: 0, finding: 0, clear: 0, backendFailure: 0, timeout: 0, interrupted: 0, [outcome]: 100,
});

// Bounded liveness under continued edits, available credentials/current sources,
// finite Jev delay, available capacity and certain output. This does not assert
// eventual delivery for suspended arrivals, stale work or arbitrary fair schedules.
it.each(failures.flatMap(outcome => [1, 7, 42].map(seed => ({ outcome, seed }))))(
  "recovers delivery repeatedly after $outcome at seed $seed",
  ({ outcome, seed }) => {
    const run = createRun({ seed, outcomeWeights: weights(outcome),
      session: { editIntervalMs: 100, variationMs: 15 }, retention: 10000 });
    for (let cycle = 0; cycle < 2; cycle++) {
      run.applyControl({ kind: "jevProfile", delayMs: 5, outcomeWeights: weights(outcome) });
      run.advance({ untilTime: run.now + 5000, maxEvents: 10000 });
      const start = run.eventCount;
      run.applyControl({ kind: "jevProfile", delayMs: 5, outcomeWeights: weights("finding") });
      const recovery = run.advance({ untilTime: run.now + 2000, maxEvents: 10000 });
      expect(recovery.reason).toBe("timeLimit");
      const later = run.observations.filter(frame => frame.sequence >= start);
      expect(later.some(frame => frame.event.kind === "jevRequestSettled" && frame.event.outcome === "finding")).toBe(true);
      expect(later.some(frame => frame.after.pendingFindings.length > 0)).toBe(true);
      expect(later.some(frame => frame.after.collection.ready.length > 0)).toBe(true);
      expect(later.some(frame => frame.commands.some(command => command.kind === "submissionRecorded"))).toBe(true);
    }
    expect(run.observations.filter(frame => frame.rejection)).toEqual([]);
    const settlements = run.observations.filter(frame => frame.event.kind === "jevRequestSettled" && frame.event.outcome === outcome);
    expect(settlements.length).toBeGreaterThan(8); // Exceeds the request concurrency bound.
    for (const frame of settlements) {
      if (frame.event.kind !== "jevRequestSettled") continue;
      const requestId = frame.event.request;
      const request = frame.before.dispatch.requests.find(request => request.request === requestId);
      expect(request).toMatchObject({ started: outcome !== "neverSent", interrupted: outcome === "interrupted" });
      expect(frame.after.dispatch.requests.some(request => request.request === requestId)).toBe(false);
    }
    run.applyControl({ kind: "suspendArrivals", suspended: true });
    expect(run.advance({ maxEvents: 10000 }).reason).toBe("idle");
    expect(run.projection.dispatch.requests).toEqual([]);
    expect(run.projection.dispatch.running).toEqual([]);
    expect(restoreReplay(run.exportReplay()).projection).toEqual(run.projection);
  },
);
