import { describe, expect, it } from "vitest";
import { createRun, replayRun } from "./index.ts";
describe("scripted public run", () => {
  it("follows a synthetic edit through checked Jev finding and advice submission", () => {
    const run = createRun();
    run.advance({ maxEvents: 100 });
    const commands = run.observations.flatMap((x) =>
      x.commands.map((c) => c.kind),
    );
    expect(commands).toContain("prepare");
    expect(commands).toContain("jevRequestIssued");
    expect(commands).toContain("retainFinding");
    expect(commands).toContain("submissionRecorded");
    expect(run.observations.some((x) => x.event.kind === "stopPolled")).toBe(
      true,
    );
    expect(run.observations.filter((x) => x.rejection)).toEqual([]);
  });
});

describe("deterministic driver and replay", () => {
  it("a driver bound preserves unfinished work without an agent finish attempt", () => {
    const run = createRun({
      inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5] }],
    });
    expect(run.advance({ maxEvents: 2 }).reason).toBe("eventLimit");
    expect(run.projection.work[0]?.kind).toBe("preparing");
    expect(run.observations.some((x) => x.event.kind === "stopPolled")).toBe(
      false,
    );
    expect(run.advance({ maxEvents: 100 }).reason).toBe("idle");
    expect(run.projection.rounds).toHaveLength(1);
  });
  it("single stepping equals batched advancement including replayed delay controls", () => {
    const config = {
      inputs: [
        { at: 0, kind: "edit" as const, bytes: 10, unitBytes: [5] },
        { at: 30, kind: "edit" as const, bytes: 10, unitBytes: [5] },
      ],
    };
    const run = createRun(config);
    run.advance({ maxEvents: 6 });
    run.applyControl({ kind: "jevProfile", delayMs: 12, outcome: "clear" });
    run.advance();
    const replay = replayRun(run.exportReplay());
    while (replay.step());
    expect(replay.observations).toEqual(run.observations);
    const settled = run.observations.filter(
      (x) => x.event.kind === "jevRequestSettled",
    );
    expect(settled.map((x) => x.time)).toEqual([7, 44]);
  });
  it("streams independently of retention and refuses incompatible identities", () => {
    const run = createRun({ retention: 0 });
    let count = 0;
    run.subscribe(() => count++);
    run.advance();
    expect(count).toBeGreaterThan(10);
    expect(run.observations).toEqual([]);
    const replay = replayRun({
      ...run.exportReplay(),
      config: { ...run.exportReplay().config, retention: 100 },
    });
    replay.advance();
    expect(replay.observations).toHaveLength(count);
    expect(() =>
      replayRun({ ...run.exportReplay(), logicIdentity: "different" as never }),
    ).toThrow("incompatible replay identity");
  });
  it("reports mismatched callback identities and missing required synthetic effects", () => {
    const wrong = createRun({
      inputs: [
        {
          at: 0,
          event: {
            kind: "jevRequestSettled",
            partition: 1,
            lifetime: 1,
            round: 1,
            operation: 1,
            request: 99,
            outcome: "clear",
            currentWork: true,
          },
        },
      ],
    });
    expect(() => wrong.step()).toThrow("mismatched completion identity");
    const unhandled = createRun({
      inputs: [
        { at: 0, event: { kind: "openRound", partition: 1, lifetime: 1 } },
        {
          at: 1,
          event: {
            kind: "beginPreparation",
            partition: 1,
            lifetime: 1,
            round: 1,
            bytes: 10,
          },
        },
      ],
    });
    expect(() => unhandled.advance()).toThrow("unhandled required command");
  });
});

it("time advancement never crosses a workload metadata boundary", () => {
  const run = createRun({
    session: { editIntervalMs: 100, variationMs: 0 },
    inputs: [],
  });
  expect(run.advance({ untilTime: 50, maxEvents: 100 }).reason).toBe(
    "timeLimit",
  );
  expect(run.observations).toEqual([]);
  expect(run.now).toBe(0);
  run.advance({ untilTime: 100, maxEvents: 100 });
  expect(run.observations.map((x) => x.time)).toEqual([100, 100]);
});
it("ordinary capacity refusals remain observable successful transitions", () => {
  const run = createRun({
    limits: {
      globalItems: 1,
      partitionItems: 1,
      globalBytes: 10,
      partitionBytes: 10,
    },
    inputs: [{ at: 0, kind: "edit", bytes: 11, unitBytes: [1] }],
  });
  expect(run.advance().reason).toBe("idle");
  expect(
    run.observations.flatMap((x) => x.commands.map((c) => c.kind)),
  ).toContain("preparationRefused");
  expect(run.observations.filter((x) => x.rejection)).toEqual([]);
});
