import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRun, restoreReplay, projectAgent, DEFAULT_FILE_TREE_PROFILE, type Observation } from "./index.ts";

import { runWorkloadNative } from "../../monkey-business-bend/conformance/workload-native-runner.mjs";

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
  expect(run.projection.partitions.map(scope => [scope.partition, scope.items, scope.bytes]).sort((a, b) => a[0]! - b[0]!))
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

const residentEventCodes: Record<string, number> = { openRound: 1, admitObservation: 2, queueDispatch: 3,
  startObservation: 4, beginObservedPreparation: 5, preparationCompleted: 6, completeObservation: 7,
  dispatchSettled: 8, startReview: 9, jevRequestReady: 10, jevRequestStarted: 11, jevRequestSettled: 12,
  collectionReady: 13, finalCandidateCheck: 14, submissionSuppressCheck: 15, collectionReserveLease: 16,
  submissionBegin: 17, submissionTerminal: 18, collectionLeaseCheck: 19, collectionReleaseLease: 20,
  collectionRetireAdvice: 22, submissionForget: 23, retireReview: 24, jevRequestInterrupted: 25 };
const residentCommandCodes: Record<string, number> = { roundStarted: 1, observationAdmitted: 2,
  dispatchStarted: 3, prepare: 4, unitAdmitted: 5, jevRequestIssued: 6, retainFinding: 7,
  collectionEligible: 8, retainCandidate: 9, submissionUnsuppressed: 10, collectionLeaseReserved: 11,
  submissionBegun: 12, submissionRecorded: 13, observationStarted: 14, preparationReleased: 15,
  observationCompleted: 16, reviewStarted: 17, jevRequestStartRecorded: 18, jevRequestOutcomeRecorded: 19,
  reservationReleased: 20, collectionLeaseKept: 21, collectionLeaseReleased: 22, settleClear: 23,
  reviewRecorded: 24, retireCandidate: 25, releaseCandidate: 26, collectionAdviceRetired: 27,
  submissionForgotten: 28, jevRequestUnavailable: 29, jevInterruptionRecorded: 30 };
const residentGraphCodes: Record<string, number> = { none: 0, resolveEdge: 1, checkPath: 2, readSource: 3, unitComplete: 4 };
function residentRow(frame: Observation): number[] {
  const p = frame.after;
  const counts = [p.global.items, p.global.bytes,
    ...[1, 2].flatMap(owner => { const usage = p.partitions.find(item => item.partition === owner); return [usage?.items ?? 0, usage?.bytes ?? 0]; }),
    p.dispatch.running.filter(item => item.preparation).length, p.dispatch.requests.length];
  if (frame.preparation) {
    const { after, command, event } = frame.preparation;
    return [21, frame.time, frame.partition ?? 0, event.operation, 21, 0,
      residentGraphCodes[command.kind] ?? 99, after.files, after.readBytes, after.treeBytes, ...counts];
  }
  const event = frame.event as unknown as Record<string, unknown>;
  const identity = ["partition", "lifetime", "round", "operation", "request", "advice", "token"].map(key =>
    Number(event[key] ?? (key === "operation" ? event.observation : key === "partition" ? event.group : key === "token" ? event.fingerprint : undefined) ?? 0));
  const facts = event.kind === "jevRequestReady"
    ? [event.rootValid, event.configurationValid, event.credentialReady, event.selected, event.currentWork, event.physicalAvailable].map(Number)
    : event.kind === "jevRequestSettled" ? [Number(event.currentWork), { neverSent: 1, finding: 2, clear: 3, backendFailure: 4, timeout: 5, interrupted: 6 }[event.outcome as "clear"], 0, 0, 0, 0]
      : event.kind === "beginObservedPreparation" ? [Number(event.bytes), 0, 0, 0, 0, 0]
        : event.kind === "preparationCompleted" ? [(event.unitBytes as number[]).length, (event.unitBytes as number[])[0] ?? 0, 0, 0, 0, 0] : [0, 0, 0, 0, 0, 0];
  const commands = frame.commands.flatMap((command, index) => {
    const value = command as unknown as Record<string, unknown>;
    const id = ["roundStarted", "observationAdmitted", "preparationReleased", "reservationReleased"].includes(command.kind) ? value.id
      : ["dispatchStarted", "prepare", "unitAdmitted"].includes(command.kind) ? value.operation
        : command.kind === "jevRequestIssued" ? value.request : 0;
    if (residentCommandCodes[command.kind] === undefined) throw new Error(`Unmapped resident command ${command.kind}`);
    return [residentCommandCodes[command.kind]!, frame.commandScopes?.[index] ?? 0, Number(id ?? 0)];
  });
  return [residentEventCodes[frame.event.kind] ?? 99, frame.time, frame.partition ?? 0, ...identity, ...facts, ...counts,
    Number(!!frame.rejection), ...commands];
}

it("compares original shared contention and recovery inputs with the compiled native resident", () => {
  const rows = runWorkloadNative(new URL("../../monkey-business-bend/conformance/shared-resident.bend", import.meta.url)) as number[][];
  expect(rows.slice(0, 3)).toEqual([[90, 4294967313, 1, 11], [90, 99, 2, 12], [91, 0, 4294967313, 1, 11]]);
  const native = rows.slice(3);
  const run = createRun(contentionConfig);
  run.advance({ untilTime: 25, maxEvents: 2000 });
  const boundary = run.now;
  const before = run.observations.map(residentRow);
  run.applyControl({ kind: "jevProfile", delayMs: 5, outcome: "clear" });
  run.applyControl({ kind: "suspendArrivals", agent: opaqueAdvicees[0], suspended: true });
  const restored = restoreReplay(JSON.parse(JSON.stringify(run.exportReplay())));
  run.advance({ untilTime: 40, maxEvents: 1000 });
  restored.advance({ untilTime: 40, maxEvents: 1000 });
  expect(restored.observe()).toEqual(run.observe());
  expect(native).toEqual([...before, [80, boundary, 5], ...run.observations.slice(before.length).map(residentRow)]);
  expect(native.some(row => [97, 98, 99].includes(row[0]!))).toBe(false);
  const canonical = native.filter(row => row[0] !== 21 && row[0] !== 80);
  expect(Math.max(...canonical.map(row => row[22]!))).toBe(8);
  expect(Math.max(...canonical.map(row => row[23]!))).toBe(8);
  expect(canonical.filter(row => row.slice(25).some((code, index) => index % 3 === 0 && code === 29)).map(row => [row[1], row[2]]))
    .toEqual([[4, 1]]);
  expect(canonical.filter(row => row[0] === 25).map(row => [row[1], row[2]])).toEqual([[22, 1]]);
  expect(canonical.filter(row => row[0] === 12 && row[1]! > 25).map(row => [row[1], row[2]])).toEqual([[37, 1], [37, 2]]);
  expect(canonical.at(-1)!.slice(16, 24)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  const graph = native.filter(row => row[0] === 21);
  expect(graph).toHaveLength(22);
  for (const row of graph) expect(row.slice(7, 10)).toEqual([1, 100, 20]);
}, 30000);

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
