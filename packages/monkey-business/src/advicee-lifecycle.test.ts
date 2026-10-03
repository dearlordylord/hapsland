import { expect, it } from "vitest";
import fc from "fast-check";
import { runWorkloadNative } from "../../monkey-business-bend/conformance/workload-native-runner.mjs";
import { createRun, restoreReplay, DEFAULT_FILE_TREE_PROFILE, type RunConfig, type Run, type Observation } from "./index.ts";

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

it("resumes after an accepted explicit lifetime without reparenting prequeued activity", () => {
  const original = scenario();
  const run = createRun({ ...original, inputs: [
    { at: 0, kind: "canonical", event: { kind: "openRound", partition: 1, lifetime: 2 } },
    ...(original.inputs ?? []),
  ] });
  advance(run, 2);
  const opened = run.observations.find(frame => frame.event.kind === "openRound" && frame.event.partition === 1)!;
  expect(opened.event).toEqual({ kind: "openRound", partition: 1, lifetime: 2 });
  expect(opened.rejection).toBeUndefined();
  expect(run.observe().adviceeLifecycles).toEqual([
    { partition: 1, lifetime: 2, status: "active" }, { partition: 2, lifetime: 1, status: "active" },
  ]);
  const old = run.projection.dispatch.requests.find(request => request.partition === 1)!;
  expect(old).toMatchObject({ partition: 1, lifetime: 2, round: 1, started: true });
  run.applyControl({ kind: "adviceeLifecycle", agent: advicees[0], action: "disconnect" });
  advance(run, 2, 32);
  expect(run.observe().adviceeLifecycles[0]).toEqual({ partition: 1, lifetime: 2, status: "departed" });
  expect(run.projection.global).toEqual({ items: 1, bytes: 7 });
  expect(run.projection.dispatch.requests.find(request => request.request === old.request)).toEqual(old);
  const retirement = run.observations.find(frame => frame.event.kind === "retirePartition")!;
  expect(retirement.event).toEqual({ kind: "retirePartition", partition: 1, lifetime: 2, round: 1 });
  expect(retirement.commands.filter(command => command.kind === "cancelWork"))
    .toEqual([{ kind: "cancelWork", operation: old.operation }]);
  const restored = restoreReplay(JSON.parse(JSON.stringify(run.exportReplay())));
  expect(restored.observe()).toEqual(run.observe());
  for (const candidate of [run, restored]) {
    candidate.applyControl({ kind: "adviceeLifecycle", agent: advicees[0], action: "resume" });
    expect(candidate.observe().adviceeLifecycles[0]).toEqual({ partition: 1, lifetime: 3, status: "active" });
    candidate.schedule({ at: 3, kind: "edit", agent: advicees[0], generation: 0, recurring: false,
      revision: 3, bytes: 10, unitBytes: [5], outcome: "finding" });
    advance(candidate, 30);
  }
  expect(restored.observe()).toEqual(run.observe());
  const oldCallback = run.observations.find(frame => frame.event.kind === "jevRequestSettled"
    && frame.event.request === old.request)!;
  expect(oldCallback.event).toMatchObject({ partition: 1, lifetime: 2, round: 1,
    operation: old.operation, request: old.request, outcome: "finding" });
  expect(oldCallback.commands).toEqual([{ kind: "jevObservationIgnored" }]);
  expect(oldCallback.partition).toBe(1);
  expect(run.observations.flatMap(frame => frame.commands).filter(command => command.kind === "jevRequestIssued"))
    .toContainEqual(expect.objectContaining({ partition: 1, lifetime: 3, round: 3 }));
  expect(run.observations.some(frame => frame.workload?.revision === 90)).toBe(false);
  expect(run.observations.filter(frame => frame.event.kind === "submissionTerminal")
    .map(frame => [frame.time, frame.partition])).toEqual([[22, 2], [25, 1]]);
  expect(run.projection.global).toEqual({ items: 2, bytes: 12 });
  expect(run.projection.dispatch.requests).toEqual([]);
  expect(run.projection.dispatch.running).toEqual([]);
  expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe());
});

it("preserves unaffected and fresh advicee progress in finite healthy departure campaigns", () => {
  fc.assert(fc.property(fc.integer({ min: 1, max: 0xffffffff }), fc.integer({ min: 6, max: 25 }),
    fc.constantFrom("disconnect" as const, "remove" as const), (seed, delay, action) => {
      departAndResume(action, seed, delay);
    }), { seed: 185, numRuns: 8 });
}, 15000);

function preparationDeparture(): Run {
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
  return run;
}

it("releases a departed preparation's physical parent only when its original completion arrives", () => {
  preparationDeparture();
});

const lifecycleEventCodes: Record<string, number> = { openRound: 1, admitObservation: 2, queueDispatch: 3,
  startObservation: 4, beginObservedPreparation: 5, preparationCompleted: 6, completeObservation: 7,
  dispatchSettled: 8, startReview: 9, jevRequestReady: 10, jevRequestStarted: 11, jevRequestSettled: 12,
  collectionReady: 13, finalCandidateCheck: 14, submissionSuppressCheck: 15, collectionReserveLease: 16,
  submissionBegin: 17, submissionTerminal: 18, collectionLeaseCheck: 19, collectionReleaseLease: 20,
  collectionRetireAdvice: 22, submissionForget: 23, retireReview: 24, jevRequestInterrupted: 25, stopPolled: 26, retirePartition: 27, discardDispatch: 28, closePermitRound: 29, forgetAdmission: 30 };
const lifecycleCommandCodes: Record<string, number> = { roundStarted: 1, observationAdmitted: 2,
  dispatchStarted: 3, prepare: 4, unitAdmitted: 5, jevRequestIssued: 6, retainFinding: 7,
  collectionEligible: 8, retainCandidate: 9, submissionUnsuppressed: 10, collectionLeaseReserved: 11,
  submissionBegun: 12, submissionRecorded: 13, observationStarted: 14, preparationReleased: 15,
  observationCompleted: 16, reviewStarted: 17, jevRequestStartRecorded: 18, jevRequestOutcomeRecorded: 19,
  reservationReleased: 20, collectionLeaseKept: 21, collectionLeaseReleased: 22, settleClear: 23,
  reviewRecorded: 24, retireCandidate: 25, releaseCandidate: 26, collectionAdviceRetired: 27,
  submissionForgotten: 28, jevRequestUnavailable: 29, jevInterruptionRecorded: 30, jevObservationIgnored: 31, finishReady: 32, cancelWork: 33, partitionRetired: 34, dispatchDiscarded: 35, permitRoundClosed: 36, permitReleased: 37, admissionForgotten: 38 };
const lifecycleGraphCodes: Record<string, number> = { none: 0, resolveEdge: 1, checkPath: 2, readSource: 3, unitComplete: 4 };
function lifecycleRow(frame: Observation): number[] {
  const p = frame.after;
  const counts = [p.global.items, p.global.bytes,
    ...[1, 2].flatMap(owner => { const usage = p.partitions.find(item => item.partition === owner); return [usage?.items ?? 0, usage?.bytes ?? 0]; }),
    p.dispatch.running.filter(item => item.preparation).length, p.dispatch.requests.length];
  if (frame.preparation) {
    const { after, command, event } = frame.preparation;
    return [21, frame.time, frame.partition ?? 0, event.operation, 21, 0,
      lifecycleGraphCodes[command.kind] ?? 99, after.files, after.readBytes, after.treeBytes, ...counts];
  }
  const event = frame.event as unknown as Record<string, unknown>;
  const identity = ["partition", "lifetime", "round", "operation", "request", "advice", "token"].map(key =>
    Number(event[key] ?? (key === "operation" ? event.observation : key === "partition" ? event.group : key === "token" ? event.fingerprint : undefined) ?? 0));
  const facts = event.kind === "stopPolled" ? [Number(event.deadline), 0, 0, 0, 0, 0]
    : event.kind === "finalCandidateCheck" ? [event.ownerCurrent, event.credentialGeneration, event.credentialAuthorized, event.expired, event.workCurrent, event.hasFindings].map(Number)
    : event.kind === "submissionTerminal" ? [Number(event.certain), 0, 0, 0, 0, 0]
    : event.kind === "submissionBegin" ? [Number(event.authorizeNow), (event.fingerprints as number[]).length, (event.fingerprints as number[])[0] ?? 0, (event.units as number[]).length, (event.units as number[])[0] ?? 0, 0]
    : event.kind === "collectionLeaseCheck" ? [Number(event.expired), Number(event.stopCollector), Number(event.sameGroup), Number(event.reofferable), 0, 0]
    : event.kind === "jevRequestReady"
    ? [event.rootValid, event.configurationValid, event.credentialReady, event.selected, event.currentWork, event.physicalAvailable].map(Number)
    : event.kind === "jevRequestSettled" ? [Number(event.currentWork), { neverSent: 1, finding: 2, clear: 3, backendFailure: 4, timeout: 5, interrupted: 6 }[event.outcome as "clear"], 0, 0, 0, 0]
      : event.kind === "beginObservedPreparation" ? [Number(event.bytes), 0, 0, 0, 0, 0]
        : event.kind === "preparationCompleted" ? [(event.unitBytes as number[]).length, (event.unitBytes as number[])[0] ?? 0, 0, 0, 0, 0] : [0, 0, 0, 0, 0, 0];
  const commands = frame.commands.flatMap((command, index) => {
    const value = command as unknown as Record<string, unknown>;
    const id = ["roundStarted", "observationAdmitted", "preparationReleased", "reservationReleased", "partitionRetired"].includes(command.kind) ? value.id
      : ["dispatchStarted", "prepare", "unitAdmitted", "cancelWork", "dispatchDiscarded"].includes(command.kind) ? value.operation
        : command.kind === "jevRequestIssued" ? value.request : command.kind === "permitRoundClosed" ? value.round : 0;
    if (lifecycleCommandCodes[command.kind] === undefined) throw new Error(`Unmapped resident command ${command.kind}`);
    return [lifecycleCommandCodes[command.kind]!, frame.commandScopes?.[index] ?? 0, Number(id ?? 0)];
  });
  return [lifecycleEventCodes[frame.event.kind] ?? 99, frame.time, frame.partition ?? 0, ...identity, ...facts, ...counts,
    Number(!!frame.rejection), ...commands];
}

function lifecycleTrace(run: Run): number[][] {
  const controls = run.exportReplay().controls;
  const rows: number[][] = [];
  for (let index = 0; index <= run.observations.length; index++) {
    for (const record of controls.filter(record => record.boundary === index)) {
      if (record.control.kind !== "adviceeLifecycle") throw new Error("unexpected lifecycle scenario control");
      const resumed = record.control.action === "resume";
      rows.push([80, record.time, 1, 1, resumed ? 2 : 1, resumed ? 0 : record.control.action === "remove" ? 2 : 1]);
    }
    if (index < run.observations.length) rows.push(lifecycleRow(run.observations[index]!));
  }
  return rows;
}

it.each([
  ["disconnect", "advicee-departure.bend"], ["remove", "advicee-removal.bend"],
] as const)("native shared driver agrees on original %s and fresh activity inputs", (action, fixture) => {
  const native = runWorkloadNative(new URL(`../../monkey-business-bend/conformance/${fixture}`, import.meta.url)) as number[][];
  expect(native.some(row => [97, 98, 99].includes(row[0]!))).toBe(false);
  expect(native.length).toBeLessThan(120);
  expect(native.at(-1)!.slice(16, 24)).toEqual([2, 12, 1, 5, 1, 7, 0, 0]);
  expect(native).toEqual(lifecycleTrace(departAndResume(action)));
}, 30000);

it("native shared driver agrees on original preparation completion after departure", () => {
  const native = runWorkloadNative(new URL("../../monkey-business-bend/conformance/advicee-preparation-departure.bend", import.meta.url)) as number[][];
  expect(native.some(row => [97, 98, 99].includes(row[0]!))).toBe(false);
  expect(native.length).toBeLessThan(120);
  expect(native.at(-1)!.slice(16, 24)).toEqual([2, 12, 1, 5, 1, 7, 0, 0]);
  expect(native.filter(row => row[0] === 6 && row[4] === 1 && row[24] === 1)).toHaveLength(1);
  expect(native).toEqual(lifecycleTrace(preparationDeparture()));
}, 30000);
