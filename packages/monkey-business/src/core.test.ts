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
    expect(run.advance({ maxEvents: 4 }).reason).toBe("eventLimit");
    expect(run.projection.work.some((work) => work.kind === "preparing")).toBe(
      true,
    );
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
    run.advance({ maxEvents: 9 });
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
          kind: "canonical",
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
        {
          at: 0,
          kind: "canonical",
          event: { kind: "openRound", partition: 1, lifetime: 1 },
        },
        {
          at: 1,
          kind: "canonical",
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
  expect(run.observations.map((x) => x.time)).toEqual([100, 100, 100, 100]);
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

it("waits for checked finish allowance before generating a later task", () => {
  const run = createRun({
    session: {
      editIntervalMs: 10,
      variationMs: 0,
      editsPerTask: 1,
      taskPauseMs: 1,
    },
    jevDelay: 100,
    finishDeadline: 500,
  });
  run.advance({ untilTime: 50, maxEvents: 100 });
  expect(
    run.observations.flatMap((x) => x.commands.map((c) => c.kind)),
  ).toContain("waitForWork");
  expect(
    run.observations.filter((x) => x.event.kind === "beginObservedPreparation"),
  ).toHaveLength(1);
  run.advance({ untilTime: 140, maxEvents: 100 });
  const commands = run.observations.flatMap((x) =>
    x.commands.map((c) => c.kind),
  );
  expect(commands).toContain("finishReserved");
  expect(commands).toContain("finishAuthorized");
  expect(commands).toContain("finishRecorded");
  expect(commands).toContain("continuationConsumed");
  expect(commands).toContain("finishEnded");
  expect(run.observations.filter((x) => x.rejection)).toEqual([]);
  expect(
    run.observations.filter((x) => x.event.kind === "beginObservedPreparation")
      .length,
  ).toBeGreaterThan(1);
});
it("ends an allowed finish and opens a fresh round for later generated work", () => {
  const run = createRun({
    session: {
      editIntervalMs: 10,
      variationMs: 0,
      editsPerTask: 1,
      taskPauseMs: 1,
    },
    outcome: "clear",
  });
  run.advance({ untilTime: 45, maxEvents: 100 });
  const commands = run.observations.flatMap((x) =>
    x.commands.map((c) => c.kind),
  );
  expect(commands).toContain("finishAllowedNoAdvice");
  expect(
    run.observations.filter((x) => x.event.kind === "openRound"),
  ).toHaveLength(2);
  expect(run.observations.filter((x) => x.rejection)).toEqual([]);
});
it("preserves global ordering between controls and explicit scheduled inputs in replay", () => {
  const run = createRun({ session: { bytes: 100 } });
  run.applyControl({ kind: "burst", count: 1 });
  run.schedule({ at: 0, kind: "edit", bytes: 9, unitBytes: [9] });
  run.advance({ maxEvents: 20 });
  const replay = replayRun(run.exportReplay());
  replay.advance({ maxEvents: 20 });
  expect(replay.observations).toEqual(run.observations);
});
it("a virtual finish deadline cancels unfinished requests and permits later work", () => {
  const run = createRun({
    session: {
      editIntervalMs: 10,
      variationMs: 0,
      editsPerTask: 1,
      taskPauseMs: 1,
    },
    jevDelay: 1000,
    finishDeadline: 5,
  });
  run.advance({ untilTime: 60, maxEvents: 100 });
  const commands = run.observations.flatMap((x) =>
    x.commands.map((c) => c.kind),
  );
  expect(commands).toContain("cancelWork");
  expect(commands).toContain("finishAllowedDeadline");
  expect(
    run.observations.filter((x) => x.event.kind === "openRound"),
  ).toHaveLength(2);
  expect(run.observations.filter((x) => x.rejection)).toEqual([]);
});
it("uses checked continuation exhaustion to allow finish instead of inventing another continuation", () => {
  const run = createRun({
    session: {
      editIntervalMs: 10,
      variationMs: 0,
      editsPerTask: 1,
      taskPauseMs: 1,
    },
    jevDelay: 30,
    finishDeadline: 100,
  });
  run.advance({ untilTime: 300, maxEvents: 1000 });
  expect(
    run.observations.flatMap((frame) =>
      frame.commands.map((command) => command.kind),
    ),
  ).toContain("roundContinuationExhausted");
  expect(
    run.observations.flatMap((frame) =>
      frame.commands.map((command) => command.kind),
    ),
  ).not.toContain("continuationRefused");
  expect(
    run.observations.filter((frame) => frame.event.kind === "openRound").length,
  ).toBeGreaterThan(1);
});
