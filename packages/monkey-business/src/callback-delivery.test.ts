import { expect, it } from "vitest";
import { createRun, restoreReplay, type Run } from "./index.ts";
import type { CallbackControl, CallbackReport, CallbackTarget } from "./callback-controls.ts";

// TDD seam awaiting the integrator-owned public control/observe union. These
// exercise actual public transitions, never mutate Canonical or its projection.
const callbacks = (run: Run) => run.observe() as ReturnType<Run["observe"]> & {
  readonly callbackTargets: readonly CallbackTarget[]; readonly callbackReports: readonly CallbackReport[];
};
const apply = (run: Run, target: CallbackTarget, action: CallbackControl["action"]) =>
  run.applyControl({ kind: "callback", target, action } as never);
const edit = { at: 0, kind: "edit" as const, bytes: 10, unitBytes: [5], outcome: "clear" as const };
const reach = (run: Run, condition: () => boolean) => {
  for (let fuel = 0; fuel < 100 && !condition(); fuel++) run.step();
  expect(condition()).toBe(true);
};
const issued = (run: Run): CallbackTarget => {
  reach(run, () => callbacks(run).callbackTargets.some(target => target.effect.kind === "jevSettled"));
  return callbacks(run).callbackTargets.find(target => target.effect.kind === "jevSettled")!;
};
const replay = (run: Run) => expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe());

it("repeats a settled original after the queue drains and reaches the Canonical stale fence", () => {
  const run = createRun({ inputs: [edit], jevDelay: 20 });
  const target = issued(run);
  run.advance({ untilTime: 30 });
  expect(run.projection.dispatch.requests).toEqual([]);
  expect(run.projection.global).toEqual({ items: 0, bytes: 0 });
  const settled = run.projection;
  apply(run, target, "duplicate");
  run.advance({ untilTime: run.now });
  expect(callbacks(run).callbackReports.at(-1)?.result).toBe("applied");
  const duplicate = run.observations.filter(frame => frame.event.kind === "jevRequestSettled").at(-1)!;
  expect(duplicate.rejection).toBe("StaleOperation");
  expect(duplicate.commands).toEqual([]);
  expect(run.projection).toEqual(settled);
  replay(run);
});

it("held physical completion survives cancellation, then releases exactly once and repeats as stale", () => {
  const run = createRun({ inputs: [edit], jevDelay: 20 });
  const target = issued(run);
  apply(run, target, "hold");
  run.schedule({ kind: "canonical", at: 5, event: { kind: "stopPolled", partition: target.owner.partition,
    lifetime: target.owner.lifetime, round: target.owner.round, deadline: true } });
  run.advance({ untilTime: 30 });
  expect(run.projection.global).toEqual({ items: 0, bytes: 0 });
  expect(run.projection.dispatch.requests).toHaveLength(1);
  expect(run.observations.filter(frame => frame.event.kind === "jevRequestSettled")).toEqual([]);
  apply(run, target, "release");
  run.advance({ untilTime: run.now });
  expect(run.observations.filter(frame => frame.event.kind === "jevRequestSettled").at(-1)?.commands.map(command => command.kind)).toEqual(["jevObservationIgnored"]);
  expect(run.projection.dispatch.requests).toEqual([]);
  const released = run.projection;
  apply(run, target, "duplicate");
  run.advance({ untilTime: run.now });
  expect(run.observations.filter(frame => frame.event.kind === "jevRequestSettled").at(-1)?.rejection).toBe("StaleOperation");
  expect(run.projection).toEqual(released);
  replay(run);
});

it("refuses an invented target atomically, and dropping delivery does not fabricate settlement", () => {
  const run = createRun({ inputs: [edit], jevDelay: 20 });
  const target = issued(run);
  const before = run.projection;
  apply(run, { ...target, originalOrder: target.originalOrder + 1000 }, "duplicate");
  expect(callbacks(run).callbackReports.at(-1)?.result).toBe("missing");
  expect(run.projection).toEqual(before);
  apply(run, target, "drop");
  run.advance({ untilTime: 30 });
  expect(run.observations.filter(frame => frame.event.kind === "jevRequestSettled")).toEqual([]);
  expect(run.projection.dispatch.requests).toHaveLength(1);
  expect(run.projection.global).toEqual({ items: 1, bytes: 5 });
  replay(run);
});

it("reorders the original completion ahead of a held start, exposes WrongStage, then recovers using the same receipts", () => {
  const run = createRun({ inputs: [edit], jevDelay: 20 });
  const target = issued(run);
  const started = callbacks(run).callbackTargets.find(value => value.effect.kind === "jevStarted")!;
  expect(started).toBeDefined();
  apply(run, started, "hold");
  apply(run, target, "reorder");
  run.advance({ untilTime: run.now });
  const early = run.observations.filter(frame => frame.event.kind === "jevRequestSettled").at(-1)!;
  expect(early.rejection).toBe("WrongStage");
  expect(early.commands).toEqual([]);
  expect(run.projection.dispatch.requests).toHaveLength(1);
  expect(run.projection.global).toEqual({ items: 1, bytes: 5 });
  apply(run, started, "release");
  run.advance({ untilTime: run.now });
  apply(run, target, "duplicate");
  run.advance({ untilTime: run.now });
  expect(run.observations.filter(frame => frame.event.kind === "jevRequestSettled").at(-1)?.rejection).toBeUndefined();
  expect(run.projection.dispatch.requests).toEqual([]);
  expect(run.projection.global).toEqual({ items: 0, bytes: 0 });
  expect(run.observations.filter(frame => frame.commands.some(command => command.kind === "releaseCapacity"))).toHaveLength(1);
  replay(run);
});
