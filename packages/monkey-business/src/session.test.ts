import { describe, expect, it } from "vitest";
import { createRun, replayRun, restoreReplay } from "./index.ts";

const config = {
  seed: 7,
  session: { editIntervalMs: 10, variationMs: 0, editsPerTask: 2, taskPauseMs: 20, adviceResponse: "ignore" as const },
  inputs: [],
  jevDelay: 5,
};

describe("ongoing public sessions", () => {
  it("task arrivals open no round; fresh work, finish attempts and later tasks continue", () => {
    const run = createRun(config);
    run.advance({ untilTime: 80, maxEvents: 500 });
    const events = run.observations.map(observation => observation.event.kind);
    expect(events.filter(kind => kind === "beginObservedPreparation").length).toBeGreaterThanOrEqual(4);
    expect(events).toContain("stopPolled");
    expect(run.observations.find(observation => observation.event.kind === "openRound")?.time).toBe(10);
    expect(run.observations.some(observation => observation.time >= 60 && observation.event.kind === "beginObservedPreparation")).toBe(true);
  });

  it("records pace, burst, suspension and Jev changes and reproduces ordered checked observations", () => {
    const run = createRun(config);
    run.advance({ untilTime: 20 });
    run.applyControl({ kind: "editPace", intervalMs: 5 });
    run.applyControl({ kind: "burst", count: 3 });
    run.applyControl({ kind: "jevProfile", delayMs: 40, outcome: "clear" });
    run.advance({ untilTime: 45 });
    run.applyControl({ kind: "suspendArrivals", suspended: true });
    run.advance({ untilTime: 200 });
    const replay = replayRun(run.exportReplay());
    replay.advance({ untilTime: 200 });
    expect(replay.observations).toEqual(run.observations);
    const stepped = replayRun(run.exportReplay());
    for (let index = 0; index < run.eventCount; index++) stepped.step();
    expect(stepped.observations).toEqual(run.observations);
    expect(run.exportReplay().controls.map(record => record.control.kind)).toEqual(["editPace", "burst", "jevProfile", "suspendArrivals"]);
  });
  it.each(["ignore", "noAction", "promptRepair", "delayedRepair"] as const)("keeps %s advice behavior reproducible without claiming repair success", adviceResponse => {
    const run = createRun({ ...config, session: { ...config.session, editsPerTask: 1, taskPauseMs: 1000, adviceResponse, repairDelayMs: 30 }, outcome: "finding" });
    run.advance({ untilTime: 55, maxEvents: 500 });
    const preparations = run.observations.filter(observation => observation.event.kind === "beginObservedPreparation");
    expect(preparations[0]?.time).toBe(10);
    if (adviceResponse === "ignore" || adviceResponse === "noAction") expect(preparations).toHaveLength(1);
    else if (adviceResponse === "promptRepair") expect(preparations[1]?.time).toBe(18);
    else expect(preparations[1]?.time).toBe(47);
    const replay = replayRun(run.exportReplay());
    replay.advance({ untilTime: 55, maxEvents: 500 });
    expect(replay.observations).toEqual(run.observations);
  });

  it("already started requests keep due times while new requests sample the changed profile", () => {
    const run = createRun({ inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5], outcome: "clear" }], jevDelay: 20 });
    run.advance({ untilTime: 2 });
    run.applyControl({ kind: "jevProfile", delayMs: 40, outcome: "backendFailure" });
    run.schedule({ at: 3, kind: "edit", bytes: 10, unitBytes: [5] });
    run.advance({ untilTime: 100 });
    const started = run.observations.flatMap(observation => observation.effects.filter(effect => effect.kind === "jev" && effect.phase === "started"));
    expect(started.map(effect => effect.due)).toEqual([22, 45]);
    const outcomes = run.observations.flatMap(observation => observation.event.kind === "jevRequestSettled" ? [observation.event.outcome] : []);
    expect(outcomes).toEqual(["clear", "backendFailure"]);
  });

  it("replaces obsolete future arrivals and resumes the same pending work after suspension", () => {
    const run = createRun({ ...config, outcome: "clear" });
    run.advance({ untilTime: 10 });
    run.applyControl({ kind: "editPace", intervalMs: 3 });
    run.advance({ untilTime: 13 });
    run.applyControl({ kind: "suspendArrivals", suspended: true });
    run.advance({ untilTime: 100 });
    expect(run.observations.filter(observation => observation.event.kind === "beginObservedPreparation").map(observation => observation.time)).toEqual([10, 13]);
    expect(run.observations.filter(observation => observation.event.kind === "stopPolled")).toHaveLength(0);
    run.applyControl({ kind: "suspendArrivals", suspended: false });
    run.advance({ untilTime: run.now + 3 });
    expect(run.observations.filter(observation => observation.event.kind === "stopPolled")).toHaveLength(1);
  });

  it("suspended arrivals drain finite clear effects without deleting historical round records", () => {
    const run = createRun({ ...config, jevDelay: 30, outcome: "clear" });
    run.advance({ untilTime: 12 });
    run.applyControl({ kind: "suspendArrivals", suspended: true });
    expect(run.advance({ maxEvents: 1000 }).reason).toBe("idle");
    expect(run.projection.dispatch.requests.length === 0).toBe(true);
    expect(run.observations.some(observation => observation.event.kind === "jevRequestSettled")).toBe(true);
  });

  it("keeps submitted composed advice reofferable until checked expiry, then drains retained records", () => {
    const run = createRun({ ...config, adviceLifetime: 100, retention: 5000 });
    run.advance({ untilTime: 18, maxEvents: 1000 });
    expect(run.projection.delivery.submissions.batches.some(batch => batch.phase === "submitted")).toBe(true);
    expect(run.observations.some(frame => frame.event.kind === "collectionRetireAdvice")).toBe(false);
    run.applyControl({ kind: "suspendArrivals", suspended: true });
    expect(run.advance({ maxEvents: 5000 }).reason).toBe("idle");
    expect(run.projection.delivery.submissions.batches).toEqual([]);
    expect(run.projection.pendingFindings).toEqual([]);
    expect(run.observations.some(frame => frame.event.kind === "collectionExpiryCheck" &&
      frame.commands.some(command => command.kind === "collectionExpired"))).toBe(true);
    expect(run.observations.some(frame => frame.event.kind === "collectionRetireAdvice")).toBe(true);
    expect(run.observations.some(frame => frame.event.kind === "retireReview" && frame.rejection)).toBe(false);
    const replay = replayRun(run.exportReplay());
    replay.advance({ maxEvents: 5000 });
    expect(replay.observations).toEqual(run.observations);
  });

  it("retires a closed round’s advice and cancels obsolete expiry timers", () => {
    const run = createRun({ ...config, adviceLifetime: 600000 });
    run.advance({ untilTime: 55, maxEvents: 1000 });
    expect(run.observations.some(frame => frame.event.kind === "collectionRetireAdvice")).toBe(true);
    run.applyControl({ kind: "suspendArrivals", suspended: true });
    run.advance({ maxEvents: 1000 });
    expect(run.projection.collection.ready).toEqual([]);
    expect(run.projection.pendingFindings).toEqual([]);
    expect(run.now).toBeLessThan(600000);
  });

  it("expires at equality with the resident default and streams full replay despite bounded history", () => {
    const run = createRun({ retention: 1, inputs: [{ kind: "edit", at: 0, bytes: 10, unitBytes: [5] }] });
    run.advance({ untilTime: 600006, maxEvents: 1000 });
    expect(run.projection.pendingFindings).toHaveLength(1);
    run.advance({ untilTime: 600007, maxEvents: 1000 });
    expect(run.projection.pendingFindings).toEqual([]);
    const frames: string[] = [];
    const restored = restoreReplay(run.exportReplay(), frame => frames.push(frame.event.kind));
    expect(frames).toHaveLength(run.eventCount);
    expect(restored.projection).toEqual(run.projection);
    expect(restored.observations).toHaveLength(1);
  });

  it("rejects invalid control bounds before recording changes", () => {
    const run = createRun(config);
    expect(() => run.applyControl({ kind: "editPace", intervalMs: 0 })).toThrow();
    expect(() => run.applyControl({ kind: "burst", count: 1025 })).toThrow();
    expect(() => run.applyControl({ kind: "jevProfile", delayMs: -1 })).toThrow();
    expect(run.exportReplay().controls).toEqual([]);
  });

});
