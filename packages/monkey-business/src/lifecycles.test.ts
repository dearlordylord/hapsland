import { expect, it } from "vitest";
import { createRun, restoreReplay, type RunConfig } from "./index.ts";
const complete = (config: RunConfig) => { const run = createRun({ retention: 10000, inputs: [], ...config }); expect(run.advance({ maxEvents: 1000 }).reason).toBe("idle"); return run; };
const edits = [0, 0, 4].map(at => ({ at, kind: "edit" as const, bytes: 10, unitBytes: [5] }));
it("permits refuse shared saturation and recover after consumption with exact replay", () => {
 const run = complete({ inputs: edits, outcome: "clear", lifecycles: { permits: { adviceeLimit: 1, residentLimit: 1, holdMs: 2 } } });
 expect(run.observations.filter(o => o.commands.some(c => c.kind === "permitConsumed"))).toHaveLength(2);
 expect(run.observations.some(o => o.rejection)).toBe(true);
 expect(run.projection.admissions.flatMap(a => a.permits)).toEqual([]);
 expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
});
it.each(["release", "expire"] as const)("%s permit never admits an edit", terminal => {
 const run = complete({ inputs: [edits[0]!], lifecycles: { permits: { adviceeLimit: 2, residentLimit: 2, terminal, lifetimeMs: 2 } } });
 expect(run.observations.some(o => o.commands.some(c => c.kind === "observationAdmitted"))).toBe(false);
 expect(run.projection.admissions.flatMap(a => a.permits)).toEqual([]);
 expect(run.projection.rounds).toEqual([]);
 expect(run.observations.every(o => o.after.rounds.length === 0)).toBe(true);
});
it("collector refusal is exclusive and settles ownership", () => {
 const run = complete({ inputs: edits, outcome: "finding", outputProfile: { outcome: "certain", delayMs: 10, leaseMs: 30 }, lifecycles: { collectors: { capacity: 1, lifetimeMs: 30 } } });
 expect(run.observations.some(o => o.commands.some(c => c.kind === "collectionBackgroundRefused"))).toBe(true);
 expect(run.observations.some(o => o.commands.some(c => c.kind === "collectionBackgroundClaimed"))).toBe(true);
 expect(run.projection.collection.claims).toEqual([]);
 expect(restoreReplay(run.exportReplay()).projection).toEqual(run.projection);
});
it("evaluation identities join pending and use cache without extra Jev calls", () => {
 const inputs = [0, 0, 20].map(at => ({ at, kind: "edit" as const, bytes: 10, unitBytes: [5], evaluationInputs: ["exact-prepared-input"] }));
 const run = complete({ inputs, outcome: "clear", lifecycles: { reuse: { entryLimit: 1, byteLimit: 20 } } });
 expect(run.observations.filter(o => o.commands.some(c => c.kind === "jevRequestIssued"))).toHaveLength(1);
 expect(run.observations.some(o => o.commands.some(c => c.kind === "reuseJoinPending" || c.kind === "reuseJoinClaimed"))).toBe(true);
 expect(run.observations.some(o => o.commands.some(c => c.kind === "reuseCached"))).toBe(true);
 expect(run.observations.filter(o => o.rejection)).toEqual([]);
 expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
});
it("synthetic oversized candidate never reserves or starts output", () => {
 const run = complete({ inputs: [edits[0]!], outcome: "finding", lifecycles: { encodedOutputBytes: 10241 } });
 expect(run.observations.some(o => o.commands.some(c => c.kind === "collectionLimited"))).toBe(true);
 expect(run.observations.some(o => o.commands.some(c => c.kind === "collectionLeaseReserved" || c.kind === "submissionAuthorized"))).toBe(false);
});
it("quiet inactivity retires the settled round", () => {
 const run = complete({ inputs: [edits[0]!], outcome: "clear", lifecycles: { permits: { adviceeLimit: 1, residentLimit: 1 }, quietWindowMs: 10 } });
 expect(run.observations.some(o => o.commands.some(c => c.kind === "quietRoundExpired"))).toBe(true);
 expect(run.projection.rounds).toEqual([]);
 expect(restoreReplay(run.exportReplay()).projection).toEqual(run.projection);
});
it("optional resource scenarios execute and replay in the same resident", () => {
 const run = complete({ resourceScenarios: { notices: true, outputFit: true } });
 expect(run.observations.some(o => o.commands.some(c => c.kind === "noticeCommitted"))).toBe(true);
 expect(run.projection.notices).toEqual([]);
 expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
});
it("finding reuse supplies retained advice and eviction releases cached charges", () => {
 const inputs = [0, 0, 20, 40].map((at, index) => ({ at, kind: "edit" as const, bytes: 10, unitBytes: [5], evaluationInputs: [index === 3 ? "changed" : "same"] }));
 const run = complete({ inputs, outcome: "finding", lifecycles: { reuse: { entryLimit: 1, byteLimit: 10 } } });
 expect(run.observations.filter(o => o.commands.some(c => c.kind === "jevRequestIssued"))).toHaveLength(2);
 expect(run.observations.filter(o => o.commands.some(c => c.kind === "retainFinding"))).toHaveLength(4);
 expect(run.projection.reuse.cache).toHaveLength(1);
 expect(run.projection.charges.filter(c => c.purpose === "storedResult")).toHaveLength(1);
 expect(run.observations.filter(o => o.rejection)).toEqual([]);
 expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
});
it("changed revision fences its earlier late result", () => {
 const inputs = [0, 3].map((at, index) => ({ at, kind: "edit" as const, bytes: 10, unitBytes: [5], revisionSubject: "root", revisionInput: `input-${index}` }));
 const run = complete({ inputs, outcome: "finding", jevDelay: 20 });
 expect(run.observations.some(o => o.commands.some(c => c.kind === "revisionStale"))).toBe(true);
 expect(run.observations.filter(o => o.commands.some(c => c.kind === "retainFinding"))).toHaveLength(1);
 expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
});
it("exact boundary output fits before real lease and authorization", () => {
 const run = complete({ inputs: [edits[0]!], outcome: "finding", lifecycles: { encodedOutputBytes: 10240 } });
 const fit = run.observations.findIndex(o => o.commands.some(c => c.kind === "collectionFits"));
 const output = run.observations.findIndex(o => o.commands.some(c => c.kind === "submissionBegun"));
 expect(fit).toBeGreaterThan(-1); expect(output).toBeGreaterThan(fit);
});
it("suppressed cancellation drains without late callback", () => {
 const run = complete({ inputs: [edits[0]!], outcome: "interrupted", lifecycles: { cancellation: "suppressed" } });
 expect(run.observations.some(o => o.effects.some(e => e.kind === "jev" && e.phase === "supplied"))).toBe(false);
 expect(run.projection.dispatch.running).toEqual([]);
 expect(run.projection.dispatch.requests).toEqual([]);
 expect(restoreReplay(run.exportReplay()).projection).toEqual(run.projection);
});
it("configured session generators produce identical and changed evaluation fixtures", () => {
 const run = createRun({ outcome: "clear", retention: 10000, session: { editIntervalMs: 1, variationMs: 0, editsPerTask: 8, taskPauseMs: 100 }, lifecycles: { reuse: { entryLimit: 1, byteLimit: 1000 } }, jevDelay: 10 });
 run.advance({ untilTime: 70, maxEvents: 1000 });
 expect(run.observations.some(o => o.commands.some(c => c.kind === "reuseJoinClaimed" || c.kind === "reuseJoinPending"))).toBe(true);
 expect(run.observations.some(o => o.commands.some(c => c.kind === "revisionReplaced"))).toBe(true);
 expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
});
it("duplicate tool and resident ceilings are checked independently of local ceilings", () => {
 const facts = { clockValid: true, hookWindow: 20, startedUpper: 1, nowLower: 1, adviceePermitLimit: 2, residentPermitLimit: 1 };
 const inputs = [
 { at: 0, kind: "canonical" as const, event: { kind: "openRound" as const, partition: 1, lifetime: 1 } },
 { at: 0, kind: "canonical" as const, event: { kind: "openRound" as const, partition: 2, lifetime: 1 } },
 ...[1, 1, 2].map(partition => ({ at: 1, kind: "canonical" as const, event: { kind: "issuePermit" as const, partition, lifetime: 1, tool: 7, started: 1, deadline: 10, now: 1, minimumStarted: 0, facts } })),
 { at: 2, kind: "canonical" as const, event: { kind: "releasePermit" as const, partition: 1, lifetime: 1, token: 1 } },
 { at: 3, kind: "canonical" as const, event: { kind: "issuePermit" as const, partition: 2, lifetime: 1, tool: 8, started: 3, deadline: 10, now: 3, minimumStarted: 0, facts: { ...facts, startedUpper: 3, nowLower: 3 } } },
 ];
 const run = complete({ inputs });
 expect(run.observations.filter(o => o.commands.some(c => c.kind === "permitIssued"))).toHaveLength(2);
 expect(run.observations.filter(o => o.rejection)).toHaveLength(2);
 expect(run.projection.admissions.find(a => a.partition === 2)?.permits).toHaveLength(1);
 expect(run.observations[0]!.capacityMetadata.permits).toBeUndefined();
 expect(run.observations[0]!.capacityMetadata.deliveryGroups).toBeUndefined();
 expect(run.capacityMetadata.permits).toEqual({ residentLimit: 1, adviceeLimits: [{ partition: 1, limit: 2 }, { partition: 2, limit: 2 }] });
 expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
});
it("wrong-token collector release cannot unlock writer; expiry permits recovery", () => {
 const inputs = [
 { at: 0, kind: "canonical" as const, event: { kind: "collectionClaimBackground" as const, group: 1, token: 1, active: true, capacity: 1 } },
 { at: 1, kind: "canonical" as const, event: { kind: "collectionReleaseBackground" as const, group: 1, token: 2 } },
 { at: 2, kind: "canonical" as const, event: { kind: "collectionClaimBackground" as const, group: 2, token: 3, active: true, capacity: 1 } },
 { at: 3, kind: "canonical" as const, event: { kind: "collectionExpireBackground" as const, group: 1, token: 1, elapsed: 5, lifetime: 5 } },
 { at: 4, kind: "canonical" as const, event: { kind: "collectionClaimBackground" as const, group: 2, token: 3, active: true, capacity: 1 } },
 ];
 const run = complete({ inputs });
 expect(run.observations[1]!.after.collection.claims).toEqual([{ group: 1, owner: 1 }]);
 expect(run.observations[2]!.commands[0]?.kind).toBe("collectionBackgroundRefused");
 expect(run.projection.collection.claims).toEqual([{ group: 2, owner: 3 }]);
 expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
});
it("expired prospective invocation releases capacity and permits later edits", () => {
 const run = complete({ inputs: [0, 8].map(at => ({ ...edits[0]!, at })), outcome: "clear", lifecycles: { permits: { adviceeLimit: 1, residentLimit: 1, holdMs: 5, lifetimeMs: 3 } } });
 expect(run.observations.filter(o => o.commands.some(c => c.kind === "permitIssued"))).toHaveLength(2);
 expect(run.projection.admissions.flatMap(a => a.permits)).toEqual([]);
 expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
});
it("permit consumption at its inclusive deadline remains valid", () => {
 const run = complete({ inputs: [edits[0]!], outcome: "clear", lifecycles: { permits: { adviceeLimit: 1, residentLimit: 1, holdMs: 2, lifetimeMs: 2 } } });
 expect(run.observations.some(o => o.commands.some(c => c.kind === "permitConsumed"))).toBe(true);
});
it("quiet closure waits for held collector ownership and resets after activity", () => {
 const inputs = [
 edits[0]!, { ...edits[0]!, at: 12 },
 { at: 8, kind: "canonical" as const, event: { kind: "collectionClaimBackground" as const, group: 1, token: 99, active: true, capacity: 1 } },
 { at: 25, kind: "canonical" as const, event: { kind: "collectionExpireBackground" as const, group: 1, token: 99, elapsed: 17, lifetime: 17 } },
 ];
 const run = complete({ inputs, outcome: "clear", lifecycles: { permits: { adviceeLimit: 2, residentLimit: 2 }, quietWindowMs: 10 } });
 const closure = run.observations.find(o => o.commands.some(c => c.kind === "quietRoundExpired"));
 expect(closure?.time).toBe(35);
 expect(run.observations.some(o => o.time === 12 && o.event.kind === "quietRoundReset")).toBe(true);
 expect(run.projection.rounds).toEqual([]);
 expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
});
it("quiet closure waits for output leases and retained advice to settle", () => {
 const run = complete({ inputs: [edits[0]!], outcome: "finding", adviceLifetime: 60, outputProfile: { outcome: "certain", delayMs: 40, leaseMs: 50 }, lifecycles: { permits: { adviceeLimit: 2, residentLimit: 2 }, quietWindowMs: 10 } });
 const closure = run.observations.find(o => o.commands.some(c => c.kind === "quietRoundExpired"));
 expect(closure?.time).toBeGreaterThanOrEqual(77);
 expect(run.projection.rounds).toEqual([]);
});
it("identical evaluation labels remain isolated by resident partition", () => {
 const run = createRun({ retention: 10000, sessions: [{ agent: "a" }, { agent: "b" }], inputs: ["a", "b"].map(agent => ({ at: 0, kind: "edit" as const, agent, generation: 0, recurring: false, revision: 1, bytes: 10, unitBytes: [5], evaluationInputs: ["same-complete-prepared-identity"] })), outcome: "clear", lifecycles: { reuse: { entryLimit: 8, byteLimit: 100 } } });
 expect(run.capacityMetadata.deliveryGroups).toEqual([{ partition: 1, group: 1 }, { partition: 2, group: 2 }]);
 run.applyControl({ kind: "suspendArrivals", suspended: true });
 expect(run.advance({ maxEvents: 1000 }).reason).toBe("idle");
 expect(run.observations.filter(o => o.commands.some(c => c.kind === "jevRequestIssued"))).toHaveLength(2);
 expect(new Set(run.projection.reuse.cache.map(c => c.partition))).toEqual(new Set([1, 2]));
 expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
});
it("changed import profiles generate distinct complete evaluation identities", () => {
 const run = createRun({ retention: 10000, outcome: "clear", session: { editIntervalMs: 10, variationMs: 0, editsPerTask: 8, taskPauseMs: 100 }, lifecycles: { reuse: { entryLimit: 8, byteLimit: 10000 } }, jevDelay: 1 });
 run.advance({ untilTime: 18, maxEvents: 1000 });
 const first = run.observations.find(o => o.event.kind === "reuseRoute");
 run.applyControl({ kind: "fileTrees", profile: { ...run.exportReplay().config.fileTrees!, minFiles: 3, maxFiles: 3 } });
 run.advance({ untilTime: 28, maxEvents: 1000 });
 const second = run.observations.filter(o => o.event.kind === "reuseRoute")[1];
 expect(first?.event.kind).toBe("reuseRoute"); expect(second?.event.kind).toBe("reuseRoute");
 if (first?.event.kind === "reuseRoute" && second?.event.kind === "reuseRoute") expect(second.event.id).not.toBe(first.event.id);
 expect(run.observations.filter(o => o.commands.some(c => c.kind === "jevRequestIssued"))).toHaveLength(2);
 expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
});
it("a superseded joined member cannot retain the current owner's finding", () => {
 const inputs = [
 { at: 0, kind: "edit" as const, bytes: 10, unitBytes: [5], evaluationInputs: ["same"], revisionSubject: "owner-root", revisionInput: "owner" },
 { at: 0, kind: "edit" as const, bytes: 10, unitBytes: [5], evaluationInputs: ["same"], revisionSubject: "member-root", revisionInput: "old" },
 { at: 3, kind: "edit" as const, bytes: 10, unitBytes: [5], evaluationInputs: ["changed"], revisionSubject: "member-root", revisionInput: "new" },
 ];
 const run = complete({ inputs, outcome: "finding", lifecycles: { reuse: { entryLimit: 2, byteLimit: 100 } } });
 expect(run.observations.some(o => o.commands.some(c => c.kind === "revisionStale"))).toBe(true);
 expect(run.observations.filter(o => o.commands.some(c => c.kind === "retainFinding"))).toHaveLength(2);
 expect(run.observations.filter(o => o.commands.some(c => c.kind === "jevRequestIssued"))).toHaveLength(2);
 expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
});
it("a refused changed revision cannot supersede an accepted active evaluation", () => {
 const run = complete({
  inputs: [
   { at: 0, kind: "edit", bytes: 10, unitBytes: [5], revisionSubject: "root", revisionInput: "accepted" },
   { at: 10, kind: "canonical", event: { kind: "issuePermit", partition: 1, lifetime: 1, tool: 999, started: 10, deadline: 40, now: 10, minimumStarted: 0, facts: { clockValid: true, hookWindow: 30, startedUpper: 10, nowLower: 10, adviceePermitLimit: 1, residentPermitLimit: 1 } } },
   { at: 12, kind: "edit", bytes: 10, unitBytes: [5], revisionSubject: "root", revisionInput: "refused-change" },
   { at: 40, kind: "canonical", event: { kind: "releasePermit", partition: 1, lifetime: 1, token: 2 } },
  ],
  outcome: "finding", jevDelay: 30, lifecycles: { permits: { adviceeLimit: 1, residentLimit: 1 } },
 });
 expect(run.observations.some(o => o.time === 12 && o.rejection)).toBe(true);
 expect(run.observations.filter(o => o.event.kind === "revisionRegister")).toHaveLength(1);
 expect(run.observations.some(o => o.commands.some(c => c.kind === "revisionStale"))).toBe(false);
 expect(run.observations.filter(o => o.commands.some(c => c.kind === "retainFinding"))).toHaveLength(1);
 const firstIssue = run.observations.find(o => o.event.kind === "issuePermit")!;
 expect(firstIssue.after.rounds).toEqual([]);
 const consumed = run.observations.find(o => o.commands.some(c => c.kind === "permitConsumed"))!;
 expect(consumed.after.rounds).toHaveLength(1);
 expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
});
it("checked cache clear releases every cached ledger charge and permits fresh evaluation", () => {
 const run = complete({
  inputs: [
   ...["first", "second"].map((identity, index) => ({ at: index * 10, kind: "edit" as const, bytes: 10, unitBytes: [5], evaluationInputs: [identity] })),
   { at: 30, kind: "canonical", event: { kind: "cacheClear" } },
  ], outcome: "clear", lifecycles: { reuse: { entryLimit: 2, byteLimit: 100 } },
 });
 const cleared = run.observations.find(o => o.event.kind === "cacheClear")!;
 expect(cleared.before.reuse.cache).toHaveLength(2);
 expect(cleared.commands.some(c => c.kind === "cacheDiscarded" && c.ids.length === 2)).toBe(true);
 expect(run.projection.reuse.cache).toEqual([]);
 expect(run.projection.charges).toEqual([]);
 expect(run.projection.global).toEqual({ items: 0, bytes: 0 });
 expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
 run.schedule({ at: run.now, kind: "edit", bytes: 10, unitBytes: [5], evaluationInputs: ["first"] });
 expect(run.advance({ maxEvents: 1000 }).reason).toBe("idle");
 expect(run.observations.filter(o => o.commands.some(c => c.kind === "jevRequestIssued"))).toHaveLength(3);
 expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
});
it("concurrent cache commits release a reservation refused by the shared one-entry ceiling", () => {
 const run = complete({ inputs: ["a", "b"].map(identity => ({ at: 0, kind: "edit" as const, bytes: 10, unitBytes: [5], evaluationInputs: [identity] })), outcome: "clear", lifecycles: { reuse: { entryLimit: 1, byteLimit: 20 } } });
 expect(run.observations.filter(o => o.commands.some(c => c.kind === "jevRequestIssued"))).toHaveLength(2);
 const refused = run.observations.find(o => o.event.kind === "cacheCommit" && o.commands.some(c => c.kind === "reuseRefused"));
 expect(refused).toBeDefined();
 expect(run.projection.reuse.cache).toHaveLength(1);
 const retained = run.projection.charges.filter(charge => charge.purpose === "storedResult");
 expect(retained.map(charge => charge.id)).toEqual(run.projection.reuse.cache.map(entry => entry.reservation));
 expect(retained.reduce((bytes, charge) => bytes + charge.bytes, 0)).toBe(run.projection.reuse.cache.reduce((bytes, entry) => bytes + entry.bytes, 0));
 expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
 run.schedule({ at: run.now, kind: "canonical", event: { kind: "cacheClear" } });
 expect(run.advance({ maxEvents: 1000 }).reason).toBe("idle");
 expect(run.projection.global).toEqual({ items: 0, bytes: 0 });
 expect(run.projection.charges).toEqual([]);
 expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
});
it("effective permit limits preserve partition scope and the exact historical boundary", () => {
 const issue = (partition: number, local: number, at: number) => ({ at, kind: "canonical" as const, event: { kind: "issuePermit" as const, partition, lifetime: 1, tool: partition, started: at, deadline: at + 10, now: at, minimumStarted: 0, facts: { clockValid: true, hookWindow: 10, startedUpper: at, nowLower: at, adviceePermitLimit: local, residentPermitLimit: 4 } } });
 const run = complete({ inputs: [issue(1, 2, 1), issue(2, 3, 2)] });
 expect(run.observations[0]!.capacityMetadata.permits).toEqual({ residentLimit: 4, adviceeLimits: [{ partition: 1, limit: 2 }] });
 expect(run.observations[1]!.capacityMetadata.permits).toEqual({ residentLimit: 4, adviceeLimits: [{ partition: 1, limit: 2 }, { partition: 2, limit: 3 }] });
 expect(run.observations[0]!.capacityMetadata.permits?.adviceeLimit).toBeUndefined();
 const unknownPartition = run.capacityMetadata.permits?.adviceeLimits?.find(scope => scope.partition === 3)?.limit ?? run.capacityMetadata.permits?.adviceeLimit;
 expect(unknownPartition).toBeUndefined();
 expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
 const configured = complete({ lifecycles: { permits: { adviceeLimit: 7, residentLimit: 8 } }, inputs: [issue(1, 2, 1), issue(2, 3, 2)] });
 expect(configured.capacityMetadata.permits).toEqual({ adviceeLimit: 7, residentLimit: 4, adviceeLimits: [{ partition: 1, limit: 2 }, { partition: 2, limit: 3 }] });
 expect(configured.observations[0]!.capacityMetadata.permits?.adviceeLimits).toEqual([{ partition: 1, limit: 2 }]);
 expect(restoreReplay(configured.exportReplay()).observations).toEqual(configured.observations);
});
it("the original two-agent late-join case drains with the default history retention", () => {
 const run = createRun({ seed: 7, outcome: "clear", jevDelay: 1,
  sessions: [1, 2].map(seed => ({ agent: `agent-${seed}`, seed, editIntervalMs: 1, variationMs: 0, editsPerTask: 1024, bytes: 10 })),
  lifecycles: { permits: { adviceeLimit: 2, residentLimit: 4, holdMs: 1 }, reuse: { entryLimit: 2, byteLimit: 100 } },
 });
 run.advance({ untilTime: 60, maxEvents: 5000 });
 run.applyControl({ kind: "suspendArrivals", suspended: true });
 expect(run.advance({ untilTime: 1000, maxEvents: 10000 }).reason).toBe("idle");
 expect(run.projection.work).toEqual([]);
 expect(run.projection.dispatch.queued).toEqual([]);
 expect(run.projection.dispatch.running).toEqual([]);
 expect(run.projection.reuse.claims).toEqual([]);
 expect(run.projection.dispatch.requests).toEqual([]);
 expect(run.observations.filter(observation => observation.rejection)).toEqual([]);
 const retained = run.projection.charges.filter(charge => charge.purpose === "storedResult");
 expect(retained.map(charge => charge.id).sort()).toEqual(run.projection.reuse.cache.map(entry => entry.reservation).sort());
 expect(run.projection.global.bytes).toBe(run.projection.reuse.cache.reduce((bytes, entry) => bytes + entry.bytes, 0));
 expect(run.observations).toHaveLength(1000);
 expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
});
it("unavailable owner results terminate joined work without leaving a fulfilled claim", () => {
 const run = complete({ inputs: [0, 0].map(at => ({ at, kind: "edit" as const, bytes: 10, unitBytes: [5], evaluationInputs: ["same"] })), environment: { currentWork: true, credentialReady: false }, lifecycles: { reuse: { entryLimit: 2, byteLimit: 100 } } });
 expect(run.observations.some(o => o.commands.some(c => c.kind === "reuseJoinClaimed" || c.kind === "reuseJoinPending"))).toBe(true);
 expect(run.projection.work).toEqual([]);
 expect(run.projection.reuse.claims).toEqual([]);
 expect(run.projection.dispatch.requests).toEqual([]);
 expect(run.projection.charges).toEqual([]);
 expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
});
