import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRun, restoreReplay, projectAgent, DEFAULT_FILE_TREE_PROFILE } from "./index.ts";

const opaqueAdvicees = ["runtime/subagent:7", "unrelated:session/2"] as const;
const contentionConfig = {
  seed: 7, retention: 10000, outcome: "clear" as const, jevDelay: 20, preparationDelay: 2,
  sessions: opaqueAdvicees.map((agent, index) => ({ agent, seed: index + 11,
    editIntervalMs: 1000000, variationMs: 0, editsPerTask: 1000, bytes: index ? 20 : 10,
    unitBytes: [index ? 7 : 5] })),
  fileTrees: { ...DEFAULT_FILE_TREE_PROFILE, minFiles: 1, maxFiles: 1, maxImports: 0,
    minSourceBytes: 100, maxSourceBytes: 100, minTreeBytes: 20, maxTreeBytes: 20 },
  inputs: [
    ...Array.from({ length: 9 }, (_, index) => ({ at: 0, kind: "edit" as const,
      agent: opaqueAdvicees[index % 2]!, revision: index + 1, generation: 0, recurring: false,
      bytes: index % 2 ? 20 : 10, unitBytes: [index % 2 ? 7 : 5],
      outcome: index === 0 ? "interrupted" as const : "clear" as const })),
    ...opaqueAdvicees.map((agent, index) => ({ at: 30, kind: "edit" as const,
      agent, revision: 10 + index, generation: 0, recurring: false,
      bytes: index ? 20 : 10, unitBytes: [index ? 7 : 5], outcome: "clear" as const })),
  ],
};

it("attributes contention, interruption, refusal and recovery to opaque advicees in one resident", () => {
  const run = createRun(contentionConfig);
  run.advance({ untilTime: 5, maxEvents: 2000 });
  expect(run.agentScopes.map(scope => scope.agent)).toEqual(opaqueAdvicees);
  expect(run.projection.dispatch.requests).toHaveLength(8);
  expect(run.projection.global).toEqual({ items: 8, bytes: 48 });
  expect(run.projection.partitions.map(scope => [scope.partition, scope.items, scope.bytes]))
    .toEqual([[1, 4, 20], [2, 4, 28]]);
  const refused = run.observations.filter(frame => frame.commands.some(command => command.kind === "jevRequestUnavailable"));
  expect(refused).toHaveLength(1);
  expect(refused[0]).toMatchObject({ partition: 1, agent: opaqueAdvicees[0], time: 4 });
  expect(Math.max(...run.observations.map(frame => frame.after.dispatch.running.filter(item => item.preparation).length))).toBe(8);
  run.advance({ untilTime: 25, maxEvents: 2000 });
  const interrupted = run.observations.filter(frame => frame.event.kind === "jevRequestInterrupted");
  expect(interrupted).toHaveLength(1);
  expect(interrupted[0]).toMatchObject({ partition: 1, agent: opaqueAdvicees[0], time: 22 });
  expect(run.projection.global).toEqual({ items: 0, bytes: 0 });
  expect(run.projection.dispatch.requests).toEqual([]);
  run.applyControl({ kind: "jevProfile", delayMs: 5, outcome: "clear" });
  run.applyControl({ kind: "suspendArrivals", agent: opaqueAdvicees[0], suspended: true });
  const endpoint = restoreReplay(JSON.parse(JSON.stringify(run.exportReplay())));
  expect(endpoint.observe()).toEqual(run.observe());
  expect(endpoint.exportReplay()).toEqual(run.exportReplay());
  for (const candidate of [run, endpoint]) candidate.advance({ untilTime: 40, maxEvents: 1000 });
  const healthy = run.observations.filter(frame => frame.event.kind === "jevRequestSettled" && frame.time > 25);
  expect(healthy.map(frame => [frame.time, frame.partition])).toEqual([[37, 1], [37, 2]]);
  expect(run.projection.global).toEqual({ items: 0, bytes: 0 });
  expect(run.projection.dispatch.running).toEqual([]);
  expect(run.projection.dispatch.requests).toEqual([]);
  expect(endpoint.observe()).toEqual(run.observe());
  for (const frame of run.observations) {
    expect(frame.after.dispatch.requests.length).toBeLessThanOrEqual(8);
    expect(frame.after.global.bytes).toBe(frame.after.partitions.reduce((sum, owner) => sum + owner.bytes, 0));
    const local = projectAgent(frame.after, frame.partition ?? 0);
    expect(local.global).toEqual(frame.after.global);
    if (frame.partition !== undefined) expect(local.work.every(work => work.partition === frame.partition)).toBe(true);
  }
});

const config = {
  seed: 7,
  sessions: [
    { agent: "alpha", seed: 11, editIntervalMs: 10, variationMs: 0, editsPerTask: 1000, bytes: 10, unitBytes: [5] },
    { agent: "beta", seed: 29, editIntervalMs: 10, variationMs: 0, editsPerTask: 1000, bytes: 10, unitBytes: [5] },
  ],
  limits: { globalItems: 128, globalBytes: 100000, partitionItems: 16, partitionBytes: 50000 },
  fileTrees: { ...DEFAULT_FILE_TREE_PROFILE, minFiles: 1, maxFiles: 1, maxImports: 0 },
  outcome: "clear" as const,
  jevDelay: 1000,
  retention: 10000,
};

describe("one resident with independent agent generators", () => {
  it("shares eight Jev permits across agents and denies overflow before requests start", () => {
    const run = createRun(config);
    run.advance({ untilTime: 200, maxEvents: 10000 });
    expect(run.agentScopes).toEqual([{ agent: "alpha", partition: 1, seed: 11 }, { agent: "beta", partition: 2, seed: 29 }]);
    expect(run.projection.dispatch.requests).toHaveLength(8);
    expect(new Set(run.projection.dispatch.requests.map(item => item.partition))).toEqual(new Set([1, 2]));
    expect(run.observations.some(frame => frame.commands.some(command => command.kind === "jevRequestUnavailable"))).toBe(true);
    for (const frame of run.observations) {
      expect(frame.after.dispatch.requests.length).toBeLessThanOrEqual(8);
      expect(frame.after.global.items).toBe(frame.after.partitions.reduce((sum, item) => sum + item.items, 0));
      expect(frame.after.global.bytes).toBe(frame.after.partitions.reduce((sum, item) => sum + item.bytes, 0));
    }
    const issued = run.observations.flatMap(frame => frame.commands.filter(command => command.kind === "jevRequestIssued"));
    expect(issued).toHaveLength(8);
    run.advance({ untilTime: 1100, maxEvents: 10000 });
    expect(run.observations.some(frame => frame.event.kind === "jevRequestSettled")).toBe(true);
    expect(run.observations.flatMap(frame => frame.commands.filter(command => command.kind === "jevRequestIssued")).length).toBeGreaterThan(8);
    expect(Math.max(...run.observations.map(frame => frame.after.dispatch.requests.length))).toBe(8);
  });

  it("applies a generator control only to its owner and restores the entire resident deterministically", () => {
    const run = createRun(config);
    run.advance({ untilTime: 80, maxEvents: 10000 });
    run.applyControl({ kind: "editPace", intervalMs: 731, agent: "alpha" });
    run.advance({ untilTime: 200, maxEvents: 10000 });
    const edits = run.observations.filter(frame => frame.event.kind === "admitObservation" && frame.time > 80);
    expect(edits.some(frame => frame.agent === "beta")).toBe(true);
    expect(edits.some(frame => frame.agent === "alpha")).toBe(false);
    const replay = run.exportReplay();
    const restored = restoreReplay(replay);
    expect(restored.projection).toEqual(run.projection);
    expect(restored.observations).toEqual(run.observations);
    expect(restored.agentScopes).toEqual(run.agentScopes);
    expect(restored.exportReplay()).toEqual(replay);
    const alpha = projectAgent(run.projection, 1);
    const beta = projectAgent(run.projection, 2);
    expect(alpha.global).toEqual(beta.global);
    expect(alpha.global).toEqual(run.projection.global);
    expect(alpha.work.every(item => item.partition === 1)).toBe(true);
    expect(beta.work.every(item => item.partition === 2)).toBe(true);
    expect(alpha.dispatch.requests.length + beta.dispatch.requests.length).toBe(run.projection.dispatch.requests.length);
    expect(() => run.applyControl({ kind: "burst", count: 1, agent: "missing" })).toThrow("unknown agent");
    expect(() => run.applyControl({ kind: "jevProfile", delayMs: 1, agent: "alpha" })).toThrow("resident controls");
  });

  it("uses one global capacity budget instead of multiplying it by the agent count", () => {
    const run = createRun({ ...config, limits: { ...config.limits, globalItems: 4 } });
    run.advance({ untilTime: 100, maxEvents: 10000 });
    expect(run.observations.some(frame => frame.commands.some(command => command.kind === "preparationRefused" || command.kind === "unitRefused"))).toBe(true);
    expect(Math.max(...run.observations.map(frame => frame.after.global.items))).toBeLessThanOrEqual(4);
    expect(new Set(run.observations.map(frame => frame.partition))).toEqual(new Set([1, 2]));
  });

  it("preserves shared accounting and replay under varied interleaved workloads", () => {
    fc.assert(fc.property(fc.record({
      seed: fc.integer({ min: 0, max: 0xffffffff }),
      count: fc.integer({ min: 1, max: 6 }),
      interval: fc.integer({ min: 5, max: 40 }),
      delay: fc.integer({ min: 1, max: 150 }),
      outcome: fc.constantFrom("finding" as const, "clear" as const, "interrupted" as const),
    }), ({ seed, count, interval, delay, outcome }) => {
      const run = createRun({ ...config, seed, jevDelay: delay, outcome,
        sessions: Array.from({ length: count }, (_, index) => ({
          agent: `agent-${index + 1}`, seed: (seed + index) >>> 0,
          editIntervalMs: interval + index, variationMs: 3, editsPerTask: 3,
          taskPauseMs: 10, bytes: 10, unitBytes: [5],
        })),
      });
      run.advance({ untilTime: 120, maxEvents: 2000 });
      run.applyControl({ kind: "suspendArrivals", suspended: true, agent: "agent-1" });
      run.advance({ untilTime: 180, maxEvents: 2000 });
      for (const frame of run.observations) {
        expect(frame.after.dispatch.requests.length).toBeLessThanOrEqual(8);
        expect(frame.after.global.items).toBe(frame.after.partitions.reduce((sum, item) => sum + item.items, 0));
        expect(frame.after.global.bytes).toBe(frame.after.partitions.reduce((sum, item) => sum + item.bytes, 0));
      }
      expect(run.observations.filter(frame => frame.rejection)).toEqual([]);
      const replay = JSON.parse(JSON.stringify(run.exportReplay()));
      const restored = restoreReplay(replay);
      expect(restored.projection).toEqual(run.projection);
      expect(restored.observations).toEqual(run.observations);
    }), { seed: 91001, numRuns: 16 });
  }, 15000);

  it("keeps finish rounds and repair feedback independent within the shared resident", () => {
    const run = createRun({ ...config, jevDelay: 5, outcome: "finding", sessions: config.sessions.map(session => ({ ...session, editIntervalMs: 20, editsPerTask: 2, taskPauseMs: 30, adviceResponse: "promptRepair" as const })) });
    run.advance({ untilTime: 150, maxEvents: 3000 });
    const polled = run.observations.filter(frame => frame.event.kind === "stopPolled");
    expect(new Set(polled.map(frame => frame.partition))).toEqual(new Set([1, 2]));
    const completed = run.observations.filter(frame => frame.commands.some(command => command.kind === "finishRecorded"));
    expect(new Set(completed.map(frame => frame.partition))).toEqual(new Set([1, 2]));
    expect(run.observations.filter(frame => frame.rejection)).toEqual([]);
    expect(new Set(run.observations.filter(frame => frame.workload?.repair).map(frame => frame.workload?.agent))).toEqual(new Set(["alpha", "beta"]));
    expect(restoreReplay(run.exportReplay()).projection).toEqual(run.projection);
  });
});
