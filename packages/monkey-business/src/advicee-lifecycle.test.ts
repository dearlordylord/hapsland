import { expect, it } from "vitest";
import fc from "fast-check";
import { createRun, restoreReplay, DEFAULT_FILE_TREE_PROFILE, type RunConfig, type Run } from "./index.ts";

const advicees = ["opaque:departing/session", "independent/advicee"] as const;
const scenario = (seed = 7, delay = 20): RunConfig => ({
  seed, retention: 1000, preparationDelay: 2, jevDelay: delay, outcome: "finding",
  sessions: advicees.map((agent, index) => ({ agent, seed: index + 11, editIntervalMs: 1000000,
    variationMs: 0, editsPerTask: 1000, bytes: index ? 20 : 10, unitBytes: [index ? 7 : 5] })),
  fileTrees: { ...DEFAULT_FILE_TREE_PROFILE, minFiles: 1, maxFiles: 1, maxImports: 0,
    minSourceBytes: 100, maxSourceBytes: 100, minTreeBytes: 20, maxTreeBytes: 20 },
  inputs: [
    ...advicees.map((agent, index) => ({ at: 0, kind: "edit" as const, agent, generation: 0, recurring: false,
      revision: index + 1, bytes: index ? 20 : 10, unitBytes: [index ? 7 : 5], outcome: "finding" as const })),
    // This arrival is already owned by the first lifetime when configured. It
    // cannot silently become fresh activity merely because it runs after resume.
    { at: 4, kind: "edit", agent: advicees[0], generation: 0, recurring: false,
      revision: 90, bytes: 90, unitBytes: [90], outcome: "finding" },
  ],
});
function advance(run: Run, untilTime: number, fuel = 120) {
  const result = run.advance({ untilTime, maxEvents: fuel });
  expect(result.reason, `lifecycle did not quiesce at ${untilTime}; last=${run.observations.at(-1)?.event.kind}`).not.toBe("eventLimit");
}

function departAndResume(action: "disconnect" | "remove", seed = 7, delay = 20) {
  // Explicit healthy premises: valid credentials/current inputs, eight shared
  // physical slots, default ledger capacity, finite effects and ordered scheduling.
  const run = createRun(scenario(seed, delay));
  advance(run, 2);
  expect(run.now).toBe(2);
  expect(run.projection.global).toEqual({ items: 2, bytes: 12 });
  const captured = run.projection.dispatch.requests.map(request => ({ ...request }));
  expect(captured).toHaveLength(2);
  expect(captured.every(request => request.started)).toBe(true);
  const old = captured.find(request => request.partition === 1)!;
  const healthy = captured.find(request => request.partition === 2)!;
  expect(old).toMatchObject({ lifetime: 1, round: 1 });
  expect(healthy).toMatchObject({ lifetime: 1, round: 2 });
  run.applyControl({ kind: "adviceeLifecycle", agent: advicees[0], action });
  advance(run, 2, 32);
  expect(run.observe().adviceeLifecycles).toEqual([
    { partition: 1, lifetime: 1, status: action === "remove" ? "removed" : "departed" },
    { partition: 2, lifetime: 1, status: "active" },
  ]);
  const retirement = run.observations.find(frame => frame.event.kind === "retirePartition")!;
  expect(retirement.event).toEqual({ kind: "retirePartition", partition: 1, lifetime: 1, round: 1 });
  expect(retirement.commands.filter(command => command.kind === "cancelWork"))
    .toEqual([{ kind: "cancelWork", operation: old.operation }]);
  expect(run.projection.global).toEqual({ items: 1, bytes: 7 });
  // Cancel intent releases logical authority, not a fabricated physical result.
  expect(run.projection.dispatch.requests).toEqual(captured);
  expect(run.projection.dispatch.running.find(work => work.operation === old.operation)).toMatchObject({ cancelled: true });
  expect(run.projection.work.every(work => work.partition === 2)).toBe(true);
  const restored = restoreReplay(JSON.parse(JSON.stringify(run.exportReplay())));
  expect(restored.observe()).toEqual(run.observe());
  for (const candidate of [run, restored]) {
    candidate.applyControl({ kind: "adviceeLifecycle", agent: advicees[0], action: "resume" });
    candidate.schedule({ at: 3, kind: "edit", agent: advicees[0], generation: 0, recurring: false,
      revision: 3, bytes: 10, unitBytes: [5], outcome: "finding" });
    advance(candidate, delay + 10);
  }
  expect(restored.observe()).toEqual(run.observe());
  expect(run.observe().adviceeLifecycles).toEqual([
    { partition: 1, lifetime: 2, status: "active" }, { partition: 2, lifetime: 1, status: "active" },
  ]);
  const oldCallback = run.observations.find(frame => frame.event.kind === "jevRequestSettled"
    && frame.event.request === old.request)!;
  expect(oldCallback.event).toMatchObject({ partition: 1, lifetime: 1, round: 1, operation: old.operation, request: old.request, outcome: "finding" });
  expect(oldCallback.commands).toEqual([{ kind: "jevObservationIgnored" }]);
  expect(oldCallback.partition).toBe(1);
  expect(oldCallback.time).toBe(delay + 2);
  const newRequest = run.observations.flatMap(frame => frame.commands).find(command => command.kind === "jevRequestIssued" && command.lifetime === 2)!;
  expect(newRequest).toMatchObject({ kind: "jevRequestIssued", partition: 1, lifetime: 2, round: 3 });
  const outputs = run.observations.filter(frame => frame.event.kind === "submissionTerminal");
  expect(outputs.map(frame => [frame.time, frame.partition])).toEqual([[delay + 2, 2], [delay + 5, 1]]);
  expect(run.projection.delivery.submissions.batches.map(batch => [batch.group, batch.round, batch.phase]).sort((a, b) => Number(a[0]) - Number(b[0]))).toEqual([
    [1, 3, "submitted"], [2, 2, "submitted"],
  ]);
  expect(run.observations.some(frame => frame.workload?.revision === 90)).toBe(false);
  expect(run.projection.work.some(work => work.operation === old.operation)).toBe(false);
  expect(run.projection.global).toEqual({ items: 2, bytes: 12 });
  expect(run.projection.partitions.map(owner => [owner.partition, owner.items, owner.bytes]).sort((a, b) => a[0]! - b[0]!))
    .toEqual([[1, 1, 5], [2, 1, 7]]);
  expect(run.projection.dispatch.requests).toEqual([]);
  expect(run.projection.dispatch.running).toEqual([]);
  expect(run.projection.collection.leases).toEqual([]);
  expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe());
  return run;
}

it.each(["disconnect", "remove"] as const)("%s ends only the declared advicee lifetime and fresh work progresses", action => {
  departAndResume(action);
});

it("preserves unaffected and fresh advicee progress in finite healthy departure campaigns", () => {
  fc.assert(fc.property(fc.integer({ min: 1, max: 0xffffffff }), fc.integer({ min: 6, max: 25 }),
    fc.constantFrom("disconnect" as const, "remove" as const), (seed, delay, action) => {
      departAndResume(action, seed, delay);
    }), { seed: 185, numRuns: 8 });
}, 15000);

it("releases a departed preparation's physical parent only when its original completion arrives", () => {
  const run = createRun(scenario());
  advance(run, 0);
  const preparing = run.projection.work.find(work => work.partition === 1 && work.kind === "preparing")!;
  expect(preparing).toMatchObject({ lifetime: 1, round: 1 });
  const parent = preparing.parent;
  expect(parent).toBeGreaterThan(0);
  expect(run.projection.dispatch.running.filter(work => work.preparation)).toHaveLength(2);
  expect(run.projection.global).toEqual({ items: 2, bytes: 30 });
  run.applyControl({ kind: "adviceeLifecycle", agent: advicees[0], action: "disconnect" });
  advance(run, 0, 32);
  expect(run.projection.global).toEqual({ items: 1, bytes: 20 });
  expect(run.projection.dispatch.running.find(work => work.operation === parent)).toMatchObject({
    partition: 1, lifetime: 1, round: 1, cancelled: true, preparation: true,
  });
  const restored = restoreReplay(JSON.parse(JSON.stringify(run.exportReplay())));
  expect(restored.observe()).toEqual(run.observe());
  for (const candidate of [run, restored]) {
    candidate.applyControl({ kind: "adviceeLifecycle", agent: advicees[0], action: "resume" });
    candidate.schedule({ at: 1, kind: "edit", agent: advicees[0], generation: 0, recurring: false,
      revision: 3, bytes: 10, unitBytes: [5], outcome: "finding" });
    advance(candidate, 2);
    const original = candidate.observations.find(frame => frame.event.kind === "preparationCompleted"
      && frame.event.operation === preparing.operation)!;
    expect(original.event).toMatchObject({ partition: 1, lifetime: 1, round: 1, operation: preparing.operation });
    expect(original.rejection).toBeDefined();
    const physical = candidate.observations.find(frame => frame.event.kind === "dispatchSettled"
      && frame.event.operation === parent && frame.event.lifetime === 1)!;
    expect(physical.event).toEqual({ kind: "dispatchSettled", partition: 1, lifetime: 1, round: 1, operation: parent });
    expect(physical.time).toBe(2);
    expect(candidate.projection.dispatch.running.some(work => work.operation === parent)).toBe(false);
    expect(candidate.projection.global).toEqual({ items: 2, bytes: 17 });
    advance(candidate, 30);
    expect(candidate.observations.filter(frame => frame.event.kind === "submissionTerminal").map(frame => [frame.time, frame.partition]))
      .toEqual([[22, 2], [23, 1]]);
    expect(candidate.projection.global).toEqual({ items: 2, bytes: 12 });
    expect(candidate.projection.dispatch.running).toEqual([]);
    expect(candidate.projection.dispatch.requests).toEqual([]);
    expect(candidate.projection.collection.leases).toEqual([]);
  }
  expect(restored.observe()).toEqual(run.observe());
});
