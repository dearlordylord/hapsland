import { expect, it } from "vitest";
import { createRun, restoreReplay, type Run, type RunConfig } from "./index.ts";
import type { OutcomeWeights } from "./outcomes.ts";

const weights = (selected: Partial<OutcomeWeights>): OutcomeWeights => ({
  neverSent: 0, finding: 0, clear: 0, backendFailure: 0, timeout: 0, interrupted: 0,
  ...selected,
});
const inputs = Array.from({ length: 16 }, (_, index) => ({
  kind: "edit" as const, at: index * 50, bytes: 10, unitBytes: [5],
}));
const outcomes = (run: Run) => run.observations.flatMap(frame =>
  frame.event.kind === "jevRequestSettled" ? [frame.event.outcome] : []);
const drain = (run: Run) => run.advance({ maxEvents: 2000 });
const session: RunConfig = {
  retention: 10000, outcome: "clear",
  session: { agent: "writer", seed: 7, editIntervalMs: 10, variationMs: 0,
    editsPerTask: 1, editDurationMs: 30, bytes: 10, unitBytes: [5] },
  lifecycles: { permits: { adviceeLimit: 4, residentLimit: 4, holdMs: 1, lifetimeMs: 100 } },
};

it("restores controls at an endpoint with no subsequent product event", () => {
  const run = createRun(session);
  run.advance({ untilTime: 11, maxEvents: 100 });
  const eventCount = run.eventCount;
  run.applyControl({ kind: "sizes", agent: "writer", reservationBytes: 25, reviewUnitBytes: [7, 8] });
  run.applyControl({ kind: "editPace", agent: "writer", intervalMs: 70 });
  run.applyControl({ kind: "editDuration", agent: "writer", durationMs: 2 });
  run.applyControl({ kind: "suspendArrivals", agent: "writer", suspended: true });
  expect(run.eventCount).toBe(eventCount);
  const replay = JSON.parse(JSON.stringify(run.exportReplay()));
  const restored = restoreReplay(replay);
  expect(restored.exportReplay()).toEqual(replay);
  expect(restored.observe()).toEqual(run.observe());
  for (const candidate of [run, restored]) {
    candidate.applyControl({ kind: "burst", agent: "writer", count: 1 });
    candidate.advance({ untilTime: 100, maxEvents: 500 });
  }
  expect(restored.observations).toEqual(run.observations);
  expect(restored.projection).toEqual(run.projection);
});

it("pins the outcome stream at the public boundary without a sampler oracle", () => {
  const run = createRun({ seed: 7, inputs });
  drain(run);
  expect(outcomes(run)).toEqual([
    "clear", "finding", "finding", "finding", "clear", "finding", "finding", "finding",
    "finding", "finding", "clear", "finding", "finding", "finding", "clear", "clear",
  ]);
  const stepped = createRun({ seed: 7, inputs });
  for (let count = 0; count < 2000 && stepped.step(); count++);
  expect(stepped.observations).toEqual(run.observations);
  expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe());
});

it.each([
  ["subnormal", weights({ finding: Number.MIN_VALUE }), "finding"],
  ["fractional", weights({ interrupted: 0.125 }), "interrupted"],
] as const)("preserves a sole %s outcome weight", (_name, outcomeWeights, expected) => {
  const run = createRun({ seed: 7, inputs: inputs.slice(0, 4), outcomeWeights });
  drain(run);
  expect(outcomes(run)).toEqual(Array(4).fill(expected));
  expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
});

it("rejects a zero profile before recording controls or consuming the random stream", () => {
  const run = createRun({ seed: 7, inputs });
  const before = run.exportReplay();
  expect(() => run.applyControl({ kind: "jevProfile", delayMs: 1, outcomeWeights: weights({}) })).toThrow();
  expect(run.exportReplay()).toEqual(before);
  drain(run);
  expect(outcomes(run).slice(0, 5)).toEqual(["clear", "finding", "finding", "finding", "clear"]);
});

it.each([9, 10, 11])("retains a PRE-captured duration of %i across suspension and profile changes", duration => {
  const run = createRun({ ...session,
    session: { ...session.session, editDurationMs: duration },
    lifecycles: { permits: { adviceeLimit: 2, residentLimit: 2, holdMs: 1, lifetimeMs: 10 } },
  });
  run.advance({ untilTime: 11, maxEvents: 100 });
  const issued = run.observations.filter(frame => frame.event.kind === "issuePermit");
  expect(issued.map(frame => frame.time)).toEqual([10]);
  run.applyControl({ kind: "editDuration", agent: "writer", durationMs: 0 });
  run.applyControl({ kind: "suspendArrivals", agent: "writer", suspended: true });
  run.advance({ untilTime: 100, maxEvents: 500 });
  const consumed = run.observations.filter(frame => frame.commands.some(command => command.kind === "permitConsumed"));
  expect(consumed.map(frame => frame.time)).toEqual(duration <= 10 ? [10 + duration] : []);
  expect(run.projection.admissions.flatMap(admission => admission.permits)).toEqual([]);
  if (duration > 10) {
    expect(outcomes(run)).toEqual([]);
    expect(run.projection.rounds).toEqual([]);
  }
  expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe());
});

it("keeps an issued request's outcome and deadline across a profile control", () => {
  const run = createRun({ seed: 7, inputs: inputs.slice(0, 2), jevDelay: 20,
    outcomeWeights: weights({ clear: 1 }) });
  for (let count = 0; count < 100; count++) {
    const frame = run.step();
    if (frame?.commands.some(command => command.kind === "jevRequestIssued")) break;
  }
  const started = run.observations.flatMap(frame => frame.effects.flatMap(effect =>
    effect.kind === "jev" && effect.phase === "started" ? [effect.due] : []));
  expect(started).toHaveLength(1);
  run.applyControl({ kind: "jevProfile", delayMs: 1, outcomeWeights: weights({ backendFailure: 1 }) });
  drain(run);
  const settled = run.observations.filter(frame => frame.event.kind === "jevRequestSettled");
  expect(settled.map(frame => frame.time)).toEqual([started[0], 53]);
  expect(outcomes(run)).toEqual(["clear", "backendFailure"]);
  expect(run.projection.dispatch.running).toEqual([]);
  expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe());
});
