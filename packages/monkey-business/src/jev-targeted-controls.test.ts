import { expect, it } from "vitest";
import { createRun, restoreReplay, type Run } from "./index.ts";
import type { JevRequestTarget } from "./jev-interventions.ts";

const edit = { at: 0, kind: "edit" as const, bytes: 10, unitBytes: [5], outcome: "finding" as const };
const issued = (run: Run): JevRequestTarget => {
  for (let step = 0; step < 100; step++) {
    const frame = run.step();
    const command = frame?.commands.find(command => command.kind === "jevRequestIssued");
    if (command?.kind === "jevRequestIssued") return {
      partition: command.partition, lifetime: command.lifetime, round: command.round,
      operation: command.operation, request: command.request,
    };
  }
  throw new Error("request was not issued within 100 transitions");
};
const replayExact = (run: Run): void => {
  expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe());
};

it("targets an issued request before start, preserves its due time and recovers on the same resident", () => {
  const run = createRun({ inputs: [edit], jevDelay: 20 });
  const target = issued(run);
  const due = run.now + 20;
  run.applyControl({ kind: "jevRequest", target, outcome: "neverSent" });
  expect(run.interventions.at(-1)).toMatchObject({ control: { target }, result: "applied", at: run.now });
  run.applyControl({ kind: "jevProfile", delayMs: 1, outcome: "finding" });
  run.advance({ untilTime: due });
  expect(run.observations.filter(frame => frame.event.kind === "jevRequestStarted")).toEqual([]);
  expect(run.observations.filter(frame => frame.event.kind === "jevRequestSettled").map(frame => [frame.time, frame.event])).toEqual([
    [due, { kind: "jevRequestSettled", ...target, outcome: "neverSent", currentWork: true }],
  ]);
  expect(run.projection.dispatch.requests).toEqual([]);
  expect(run.projection.dispatch.running).toEqual([]);
  run.schedule({ ...edit, at: run.now });
  run.advance({ untilTime: run.now + 10 });
  expect(run.observations.flatMap(frame => frame.commands).filter(command => command.kind === "submissionRecorded")).toHaveLength(1);
  expect(run.observations.filter(frame => frame.rejection)).toEqual([]);
  replayExact(run);
});

it("visibly refuses wrong, unknown, started and terminal targets without replacing their healthy callbacks", () => {
  const run = createRun({ inputs: [edit], jevDelay: 20 });
  const target = issued(run);
  run.applyControl({ kind: "jevRequest", target: { ...target, lifetime: target.lifetime + 1 }, outcome: "timeout" });
  run.applyControl({ kind: "jevRequest", target: { ...target, request: target.request + 1 }, outcome: "timeout" });
  while (!run.observations.some(frame => frame.event.kind === "jevRequestStarted")) run.step();
  run.applyControl({ kind: "jevRequest", target, outcome: "neverSent" });
  run.advance({ untilTime: 30 });
  run.applyControl({ kind: "jevRequest", target, outcome: "interrupted" });
  expect(run.interventions.map(report => report.result)).toEqual([
    "requestMissing", "requestMissing", "requestAlreadyStarted", "requestMissing",
  ]);
  expect(run.observations.filter(frame => frame.event.kind === "jevRequestStarted")).toHaveLength(1);
  expect(run.observations.filter(frame => frame.event.kind === "jevRequestSettled").map(frame => frame.event)).toEqual([
    { kind: "jevRequestSettled", ...target, outcome: "finding", currentWork: true },
  ]);
  expect(run.observations.flatMap(frame => frame.commands).filter(command => command.kind === "submissionRecorded")).toHaveLength(1);
  expect(run.observations.filter(frame => frame.rejection)).toEqual([]);
  replayExact(run);
});

it.each(["backendFailure", "timeout", "interrupted"] as const)("replaces only a started request with valid %s facts", outcome => {
  const run = createRun({ inputs: [edit], jevDelay: 20 });
  const target = issued(run);
  while (!run.observations.some(frame => frame.event.kind === "jevRequestStarted")) run.step();
  run.applyControl({ kind: "jevRequest", target, outcome });
  run.advance({ untilTime: 30 });
  expect(run.interventions.at(-1)?.result).toBe("applied");
  expect(run.observations.filter(frame => frame.event.kind === "jevRequestStarted")).toHaveLength(1);
  expect(run.observations.filter(frame => frame.event.kind === "jevRequestInterrupted")).toHaveLength(outcome === "interrupted" ? 1 : 0);
  expect(run.observations.filter(frame => frame.event.kind === "jevRequestSettled").map(frame => frame.event)).toEqual([
    { kind: "jevRequestSettled", ...target, outcome, currentWork: true },
  ]);
  expect(run.observations.filter(frame => frame.rejection)).toEqual([]);
  expect(run.projection.dispatch.requests).toEqual([]);
  expect(run.projection.dispatch.running).toEqual([]);
  replayExact(run);
});

it("restores availability without changing issuance authority, and rotation retires old findings", () => {
  const run = createRun({ inputs: [edit] });
  while (!run.observations.some(frame => frame.event.kind === "jevRequestSettled")) run.step();
  run.applyControl({ kind: "credentials", action: "unavailable" });
  run.advance({ untilTime: 8 });
  expect(run.projection.pendingFindings).toHaveLength(1);
  expect(run.observations.flatMap(frame => frame.commands).filter(command => command.kind === "submissionRecorded")).toEqual([]);
  run.applyControl({ kind: "credentials", action: "restore" });
  run.advance({ untilTime: 9 });
  expect(run.observations.flatMap(frame => frame.commands).filter(command => command.kind === "submissionRecorded")).toHaveLength(1);
  run.schedule({ ...edit, at: 10 });
  while (run.observations.filter(frame => frame.event.kind === "jevRequestSettled").length < 2) run.step();
  run.applyControl({ kind: "credentials", action: "rotate" });
  run.advance({ untilTime: 20 });
  expect(run.projection.pendingFindings).toEqual([]);
  expect(run.observations.flatMap(frame => frame.commands).filter(command => command.kind === "submissionRecorded")).toHaveLength(1);
  expect(run.interventions.map(report => report.result)).toEqual(["applied", "applied", "applied"]);
  run.schedule({ ...edit, at: 21 });
  run.advance({ untilTime: 30 });
  expect(run.observations.flatMap(frame => frame.commands).filter(command => command.kind === "submissionRecorded")).toHaveLength(2);
  expect(run.observations.filter(frame => frame.rejection)).toEqual([]);
  replayExact(run);
});
