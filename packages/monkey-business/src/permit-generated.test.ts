import { expect, it } from "vitest";
import { createRun, restoreReplay } from "./index.ts";

const config = (outcome: "success" | "failure" | "duplicate" | "absent", durationMs = 5) => ({
  inputs: [{ at: 1, kind: "edit" as const, bytes: 10, unitBytes: [5], outcome: "clear" as const }],
  editPermitLimits: { perAdvicee: 32, resident: 4096 },
  permitProfile: { outcome, durationMs, lifetimeMs: 10 },
  retention: 1000,
});
it.each(["success", "failure", "duplicate", "absent"] as const)("generates %s POST after captured PRE through the public engine", outcome => {
  const run = createRun(config(outcome)); run.advance({ untilTime: 30, maxEvents: 100 });
  expect(run.observations.filter(frame => frame.commands.some(command => command.kind === "permitIssued"))).toHaveLength(1);
  expect(run.observations.filter(frame => frame.commands.some(command => command.kind === "permitConsumed"))).toHaveLength(outcome === "success" || outcome === "duplicate" ? 1 : 0);
  expect(run.observations.filter(frame => frame.commands.some(command => command.kind === "jevRequestIssued"))).toHaveLength(outcome === "success" || outcome === "duplicate" ? 1 : 0);
  expect(run.projection.admissions.flatMap(admission => admission.permits)).toEqual([]);
  expect(run.observations.filter(frame => frame.rejection)).toHaveLength(outcome === "duplicate" ? 1 : 0);
  expect(run.projection.global).toEqual({ items: 0, bytes: 0 });
  expect(run.projection.dispatch.running).toEqual([]);
  expect(run.projection.dispatch.requests).toEqual([]);
  expect(run.exportReplay().config).toMatchObject({ editPermitLimits: { perAdvicee: 32, resident: 4096 }, permitProfile: config(outcome).permitProfile });
  expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe());
});
it.each([9, 10, 11])("keeps inclusive POST deadline and refuses delayed POST at duration %i", duration => {
  const run = createRun(config("success", duration)); run.advance({ untilTime: 30, maxEvents: 100 });
  expect(run.observations.filter(frame => frame.commands.some(command => command.kind === "permitConsumed"))).toHaveLength(duration <= 10 ? 1 : 0);
  expect(run.projection.admissions.flatMap(admission => admission.permits)).toEqual([]);
  if (duration > 10) {
    expect(run.projection.rounds).toEqual([]);
    expect(run.observations.filter(frame => frame.event.kind === "consumePermit")).toHaveLength(1);
    expect(run.observations.find(frame => frame.event.kind === "consumePermit")?.rejection).toBeDefined();
  }
  expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
});
it("retains explicit dashboard demo limits in replay", () => {
  const settings = { ...config("absent"), editPermitLimits: { perAdvicee: 16, resident: 64 } };
  const run = createRun(settings); run.advance({ maxEvents: 100 });
  expect(run.capacityMetadata.permits).toMatchObject({ adviceeLimit: 16, residentLimit: 64 });
  expect(run.exportReplay().config).toMatchObject({ editPermitLimits: { perAdvicee: 16, resident: 64 } });
  expect(restoreReplay(run.exportReplay()).capacityMetadata).toEqual(run.capacityMetadata);
});
