import { expect, it } from "vitest";
import { initialCanonical, projectCanonical, stepCanonical, type CanonicalEvent } from "../../../src/canonical/adapter.ts";
import { ResourceScenarios } from "./resource-scenarios.ts";

const exercise = (config: ConstructorParameters<typeof ResourceScenarios>[0]) => {
  const scenario = new ResourceScenarios(config);
  let state = initialCanonical({globalItems:512,globalBytes:1048576,partitionItems:16,partitionBytes:65536});
  const frames: { event: CanonicalEvent; commands: ReturnType<typeof stepCanonical>["commands"]; after: ReturnType<typeof projectCanonical> }[] = [];
  const send = (event: CanonicalEvent): void => {
    const before = projectCanonical(state);
    const result = stepCanonical(state, event);
    expect(result.rejection).toBeUndefined();
    state = result.state;
    frames.push({ event, commands: result.commands, after: projectCanonical(state) });
    for (const follow of scenario.handle(event, result.commands, before)) send(follow);
  };
  for (const input of scenario.inputs()) send(input.event);
  return frames;
};
it("retains bounded ticket statuses, evicts oldest and gates invalid/expired collection", () => {
  const frames = exercise({ tickets: true, ticketRetention: 2 });
  expect(frames.find(f => f.event.kind === "ticketCollectGateCheck")!.after.tickets.map(t => t.id)).toEqual([900002, 900001]);
  expect(frames.find(f => f.event.kind === "ticketCollectGateCheck")!.after.tickets.flatMap(t => t.units.map(u => u.stage))).toEqual(["finding", "unavailable"]);
  expect(frames.flatMap(f => f.commands)).toContainEqual({ kind: "ticketEvicted", id: 900000 });
  expect(frames.flatMap(f => f.commands)).toContainEqual({ kind: "ticketCollectProceed" });
  expect(frames.at(-1)!.after.tickets).toEqual([]);
  expect(frames.flatMap(f => f.commands)).toContainEqual({ kind: "ticketCollectUnavailable", reason: "credential" });
});
it("accumulates suppressed failures, preserves leased notice, bounds keys and frees storage for recovery", () => {
  const frames = exercise({ notices: true });
  const suppressed = frames.find(f => f.commands.some(c => c.kind === "noticeSuppressed"))!;
  expect(suppressed.after.notices[0]!.suppressed).toBe(1);
  const merged = frames.find(f => f.commands.some(c => c.kind === "noticeMergePending"))!;
  expect(merged.after.notices[0]!.pending!.count).toBe(1);
  const leased = frames.find(f => f.commands.some(c => c.kind === "noticeKeepLeased"))!;
  expect(leased.after.notices[0]!.pending!.leased).toBe(true);
  expect(frames.flatMap(f => f.commands)).toContainEqual({ kind: "noticeRejectedFull" });
  expect(frames.filter(f => f.commands.some(c => c.kind === "noticeCommitted"))).toHaveLength(2);
  expect(frames.at(-1)!.after.notices).toEqual([]);
  expect(frames.at(-1)!.after.global.bytes).toBe(0);
});
it("checks the explicit encoded-byte boundary and oversized candidate through Bend", () => {
  const frames = exercise({ outputFit: true });
  expect(frames[0]!.commands).not.toEqual(frames[2]!.commands);
  expect(frames[0]!.after).toEqual(frames[2]!.after);
  expect(frames[0]!.event).toEqual({ kind: "collectionFitCheck", items: 1, bytes: 10240 });
});

it("replays optional exercises through one resident with exact ordered observations", async () => {
  const { createRun, replayRun } = await import("./index.ts");
  const run = createRun({ inputs: [], resourceScenarios: { tickets: true, notices: true, outputFit: true } });
  run.advance({ untilTime: 180010, maxEvents: 1000 });
  const replay = replayRun(run.exportReplay());
  replay.advance({ untilTime: 180010, maxEvents: 1000 });
  expect(replay.observations).toEqual(run.observations);
  expect(run.projection.notices).toEqual([]);
  expect(run.projection.global.bytes).toBe(0);
  expect(run.observations.filter(f => f.event.kind === "noticeCommit")).toHaveLength(2);
});

it.each([10240, 10241])("gates generated advice handoff on %i explicit synthetic encoded bytes", async bytes => {
  const { createRun, replayRun } = await import("./index.ts");
  const run = createRun({ outcome: "finding", inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5] }, { at: 20, kind: "finish" }], resourceScenarios: { outputFit: true, outputBytes: bytes } });
  run.advance({ untilTime: 100, maxEvents: 1000 });
  const fits = run.observations.filter(f => f.event.kind === "collectionFitCheck" && f.event.bytes === bytes);
  expect(fits.length).toBeGreaterThan(0);
  const handedOff = run.observations.some(f => f.commands.some(c => c.kind === "submissionBegun"));
  expect(handedOff).toBe(bytes === 10240);
  if (bytes === 10241) expect(run.observations.some(f => f.commands.some(c => c.kind === "submissionAuthorized"))).toBe(false);
  const replay = replayRun(run.exportReplay()); replay.advance({untilTime:100,maxEvents:1000});
  expect(replay.observations).toEqual(run.observations);
});
