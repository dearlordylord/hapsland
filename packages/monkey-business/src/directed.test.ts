import { expect, it } from "vitest";
import { createRun } from "./index.ts";

it("refuses saturated Jev requests immediately and admits fresh work after a permit settles", () => {
  const inputs = [
    ...Array.from({ length: 20 }, (_, index) => ({ at: index, kind: "edit" as const, bytes: 10, unitBytes: [5] })),
    { at: 1003, kind: "edit" as const, bytes: 10, unitBytes: [5] },
  ];
  const run = createRun({ inputs, jevDelay: 1000 });
  expect(run.advance({ maxEvents: 1000 }).reason).toBe("idle");

  const issued = run.observations.filter((item) => item.commands.some((command) => command.kind === "jevRequestIssued"));
  const unavailable = run.observations.filter((item) => item.commands.some((command) => command.kind === "jevRequestUnavailable"));
  expect(issued.filter((item) => item.time < 1000)).toHaveLength(8);
  expect(unavailable).toHaveLength(12);
  expect(issued.at(-1)?.time).toBe(1005);
  const refusedOperations = new Set(unavailable.map((item) => item.event).filter((event) => "operation" in event).map((event) => event.operation));
  expect(run.observations.flatMap((item) => item.effects).filter((effect) => effect.kind === "jev" && effect.phase === "started" && refusedOperations.has(effect.operation!))).toEqual([]);
});

it("a finish attempt waits for both requests, then a deadline cancels their exact work", () => {
  const run = createRun({
    inputs: [
      { at: 0, kind: "edit", bytes: 10, unitBytes: [5] },
      { at: 1, kind: "edit", bytes: 10, unitBytes: [5] },
      { at: 5, kind: "finish" },
      { at: 6, event: { kind: "stopPolled", partition: 1, lifetime: 1, round: 1, deadline: true } },
    ],
    jevDelay: 1000,
  });
  expect(run.advance({ untilTime: 6, maxEvents: 100 }).reason).toBe("timeLimit");
  const waiting = run.observations.find((item) => item.event.kind === "stopPolled" && item.time === 5);
  expect(waiting?.commands.map((command) => command.kind)).toEqual(["waitForWork"]);
  const deadline = run.observations.find((item) => item.event.kind === "stopPolled" && item.time === 6);
  expect(deadline?.commands.map((command) => command.kind)).toEqual([
    "reservationReleased", "reservationReleased", "cancelWork", "cancelWork", "finishReady",
  ]);
  const started = run.observations.flatMap((item) => item.effects).filter((effect) => effect.kind === "jev" && effect.phase === "started").map((effect) => effect.operation).sort();
  const cancelled = deadline?.commands.filter((command) => command.kind === "cancelWork").map((command) => command.operation).sort();
  expect(cancelled).toEqual(started);
  expect(run.advance({ maxEvents: 100 }).reason).toBe("idle");
  const late = run.observations.filter((item) => item.event.kind === "jevRequestSettled");
  expect(late.map((item) => item.commands.map((command) => command.kind))).toEqual([
    ["jevObservationIgnored"], ["jevObservationIgnored"],
  ]);
  expect(late.map((item) => "request" in item.event ? item.event.request : null)).toEqual([4, 6]);
});

it("same-time completion and deadline follow recorded insertion order", () => {
  const edit = { at: 0, kind: "edit" as const, bytes: 10, unitBytes: [5] };
  const deadline = { at: 7, event: { kind: "stopPolled" as const, partition: 1, lifetime: 1, round: 1, deadline: true } };
  const beforeCompletion = createRun({ inputs: [edit, deadline], jevDelay: 5 });
  beforeCompletion.advance();
  expect(beforeCompletion.observations.filter((item) => item.time === 7).slice(0, 2).map((item) => item.event.kind)).toEqual([
    "stopPolled", "jevRequestSettled",
  ]);
  expect(beforeCompletion.observations.find((item) => item.event.kind === "jevRequestSettled")?.commands.map((command) => command.kind)).toEqual(["jevObservationIgnored"]);

  const afterCompletion = createRun({ inputs: [edit], jevDelay: 5 });
  afterCompletion.advance({ untilTime: 2 });
  afterCompletion.schedule(deadline);
  afterCompletion.advance();
  expect(afterCompletion.observations.filter((item) => item.time === 7).slice(0, 2).map((item) => item.event.kind)).toEqual([
    "jevRequestSettled", "stopPolled",
  ]);
  expect(afterCompletion.observations.find((item) => item.event.kind === "jevRequestSettled")?.commands.map((command) => command.kind)).toContain("retainFinding");
});
