import { expect, it } from "vitest";
import { createRun, restoreReplay, DEFAULT_FILE_TREE_PROFILE, type Observation } from "./index.ts";
import { runWorkloadNative } from "../../monkey-business-bend/conformance/workload-native-runner.mjs";

// Boundary milestones only. These projections never drive execution.
const codes: Record<string, number> = { admitObservation: 2, queueDispatch: 3, startObservation: 4,
  beginObservedPreparation: 5, preparationCompleted: 6, completeObservation: 7, dispatchSettled: 8,
  startReview: 9, jevRequestReady: 10, jevRequestStarted: 11, jevRequestSettled: 12,
  collectionReady: 13, finalCandidateCheck: 14, submissionSuppressCheck: 15, collectionReserveLease: 16,
  submissionBegin: 17, submissionTerminal: 18, collectionLeaseCheck: 19, collectionReleaseLease: 20,
  collectionRetireAdvice: 22, submissionForget: 23, retireReview: 24 };
const permitCodes = { issuePermit: 90, consumePermit: 91, releasePermit: 92, expirePermit: 93 };
function publicRow(frame: Observation): number[] | undefined {
  const event = frame.event as unknown as Record<string, unknown>;
  const permitCode = permitCodes[frame.event.kind as keyof typeof permitCodes];
  const p = frame.after;
  if (permitCode !== undefined) {
    const issued = frame.commands.find(command => command.kind === "permitIssued");
    const consumed = frame.commands.find(command => command.kind === "permitConsumed");
    return [permitCode, frame.time, Number(event.partition), Number(event.lifetime),
      issued?.kind === "permitIssued" ? issued.token : Number(event.token),
      permitCode === 90 ? Number(event.tool) : consumed?.kind === "permitConsumed" ? consumed.round : 0,
      permitCode === 90 ? Number(event.started) : permitCode === 91 ? p.rounds.find(round => round.partition === event.partition)?.id ?? 0 : 0,
      permitCode === 90 ? Number(event.deadline) : 0, Number(!!frame.rejection),
      p.admissions.reduce((sum, owner) => sum + owner.permits.length, 0), p.global.items, p.global.bytes];
  }
  if (frame.preparation) return [21, frame.time, frame.partition ?? 0, frame.preparation.event.operation,
    frame.preparation.after.files, frame.preparation.after.readBytes, frame.preparation.after.treeBytes];
  const code = codes[frame.event.kind];
  if (code === undefined) return undefined;
  return [code, frame.time, Number(event.partition ?? event.group ?? 0), Number(event.lifetime ?? 0), Number(event.round ?? 0),
    p.global.items, p.global.bytes, p.dispatch.running.filter(work => work.preparation).length, p.dispatch.requests.length, Number(!!frame.rejection)];
}
function nativeRow(row: number[]): number[] {
  if (row[0]! >= 90) return row.slice(0, 12);
  if (row[0] === 21) return [21, row[1]!, row[2]!, row[3]!, row[7]!, row[8]!, row[9]!];
  return [row[0]!, row[1]!, row[3]!, row[4]!, row[5]!, row[16]!, row[17]!, row[22]!, row[23]!, row[24]!];
}

it("compares original generated PRE scripts through actual native preparation, Jev, public replay and captured controls", () => {
  const native = runWorkloadNative(new URL("../../monkey-business-bend/conformance/permit-generated-native.bend", import.meta.url)) as number[][][];
  const cases = [
    { outcome: "success", durationMs: 5, review: "finding" },
    { outcome: "success", durationMs: 5, review: "clear" },
    { outcome: "failure", durationMs: 5, review: "finding" },
    { outcome: "success", durationMs: 11, review: "finding" },
  ] as const;
  for (const [index, scenario] of cases.entries()) {
    const run = createRun({ seed: 7, retention: 1000, preparationDelay: 2, jevDelay: 5,
      editPermitLimits: { perAdvicee: 32, resident: 4096 },
      permitProfile: { outcome: scenario.outcome, durationMs: scenario.durationMs, lifetimeMs: 10 },
      fileTrees: { ...DEFAULT_FILE_TREE_PROFILE, minFiles: 1, maxFiles: 1, maxImports: 0,
        minSourceBytes: 100, maxSourceBytes: 100, minTreeBytes: 20, maxTreeBytes: 20 },
      inputs: [{ at: 0, kind: "canonical", event: { kind: "openRound", partition: 2, lifetime: 1 } },
        { at: 1, kind: "edit", bytes: 10, unitBytes: [5], outcome: scenario.review }],
    });
    run.advance({ untilTime: 1, maxEvents: 10 });
    const pre = run.observations.find(frame => frame.event.kind === "issuePermit");
    expect(pre?.event).toMatchObject({ started: 1, deadline: 11, facts: { adviceePermitLimit: 32, residentPermitLimit: 4096 } });
    expect(pre?.after.admissions.flatMap(owner => owner.permits)).toHaveLength(1);
    expect(pre?.after.global).toEqual({ items: 0, bytes: 0 });
    run.applyControl({ kind: "permitProfile", profile: { outcome: "absent", durationMs: 0, lifetimeMs: 1 } });
    run.applyControl({ kind: "editPermitLimits", limits: { perAdvicee: 2, resident: 2 } });
    run.advance({ untilTime: 30, maxEvents: 150 });
    const rows = run.observations.flatMap(frame => { const row = publicRow(frame); return row ? [row] : []; });
    expect(native[index]?.map(nativeRow)).toEqual(rows);
    const consumed = run.observations.find(frame => frame.event.kind === "consumePermit");
    if (scenario.outcome === "success" && scenario.durationMs === 5) {
      expect(consumed?.time).toBe(6);
      expect(consumed?.commands).toContainEqual({ kind: "permitConsumed", round: 1 });
      expect(consumed?.after.rounds.find(round => round.partition === 1)?.id).toBe(2);
      const started = run.observations.filter(frame => frame.event.kind === "jevRequestStarted");
      expect(started).toHaveLength(1);
      expect(started[0]?.after.dispatch.running.filter(work => !work.preparation)).toHaveLength(1);
      expect(run.observations.filter(frame => frame.event.kind === "submissionTerminal")).toHaveLength(scenario.review === "finding" ? 1 : 0);
      expect(run.observations.some(frame => frame.preparation)).toBe(true);
    } else {
      expect(run.observations.filter(frame => frame.event.kind === "jevRequestStarted")).toEqual([]);
      expect(run.observations.some(frame => frame.preparation)).toBe(false);
      if (scenario.durationMs === 11) expect(consumed?.rejection).toBeDefined();
    }
    expect(run.projection.admissions.flatMap(owner => owner.permits)).toEqual([]);
    expect(run.projection.global).toEqual({ items: 0, bytes: 0 });
    expect(run.projection.dispatch.running).toEqual([]);
    expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe());
  }
}, 30_000);
