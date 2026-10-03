import { expect, it } from "vitest";
import { createRun, restoreReplay, DEFAULT_FILE_TREE_PROFILE, type Run } from "./index.ts";
import type { OutputAttemptControl } from "./output-controls.ts";
import { decodeOutputNativeBoundary, outputPublicBoundary } from "./output-native-boundary.ts";
import { runWorkloadNative, runWorkloadEmitted } from "../../monkey-business-bend/conformance/workload-native-runner.mjs";

const snapshot = (run: Run) => run.observe();
const settings = (outcome: "certain" | "uncertain" | "failed", delayMs = 5, leaseMs = 10) => ({
  seed: 7, retention: 1000, preparationDelay: 2, jevDelay: 5,
  session: { editIntervalMs: 1000000, variationMs: 0, editsPerTask: 1000 },
  fileTrees: { ...DEFAULT_FILE_TREE_PROFILE, minFiles: 1, maxFiles: 1, maxImports: 0,
    minSourceBytes: 100, maxSourceBytes: 100, minTreeBytes: 20, maxTreeBytes: 20 },
  inputs: [{ at: 0, kind: "edit" as const, bytes: 10, unitBytes: [5], outcome: "finding" as const }],
  outputProfile: { outcome, delayMs, leaseMs },
});
const replay = (run: Run) => expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe());
const reach = (run: Run, condition: () => boolean) => {
  for (let fuel = 0; fuel < 100 && !condition(); fuel++) run.step();
  expect(condition()).toBe(true);
};
const issued = (run: Run) => {
  const original=(target:OutputAttemptControl["target"])=>["outputTerminal","outputExpiry"].includes(target.effect.kind);
  reach(run, () => snapshot(run).callbackTargets.some(original));
  const target = snapshot(run).callbackTargets.find(original)!;
  expect(run.projection.delivery.submissions.batches[0]?.phase).toBe("authorized");
  expect(run.projection.collection.leases).toHaveLength(1);
  return target;
};

it("compares original authorized output scripts with native Bend and preserves early/mid/late ownership", () => {
  const fixture = new URL("../../monkey-business-bend/conformance/output-scenario-native.bend", import.meta.url);
  const nativeWords = runWorkloadNative(fixture), emittedWords = runWorkloadEmitted(fixture);
  expect(nativeWords).toEqual(emittedWords);
  const native = decodeOutputNativeBoundary(nativeWords), emitted = decodeOutputNativeBoundary(emittedWords);
  const cases = [
    { outcome: "certain", delayMs: 5 }, { outcome: "uncertain", delayMs: 5 },
    { outcome: "failed", delayMs: 5 }, { outcome: "certain", delayMs: 10 }, { outcome: "certain", delayMs: 11 },
  ] as const;
  for (const [index, selected] of cases.entries()) {
    // A healthy profile first authorizes output; failed here is an explicit
    // postauthorization fault, distinct from failed PRE output preparation.
    const run = createRun(settings("certain", selected.delayMs));
    const target = issued(run);
    expect(target.owner).toEqual({ partition: 1, lifetime: 1, round: 1, operation: 3 });
    const beforeControl = run.projection;
    run.applyControl({ kind: "outputAttempt", target, outcome: selected.outcome });
    const report = snapshot(run).outputReports.at(-1)!;
    const controls = [{ time: report.at, before: beforeControl, after: run.projection, control: report.control, result: report.result }];
    expect(snapshot(run).outputReports.at(-1)?.result).toBe("applied");
    const authorized = structuredClone(run.projection.delivery.submissions.batches[0]);
    run.applyControl({ kind: "outputProfile", outcome: "certain", delayMs: 0, leaseMs: 1 });
    expect(run.projection.delivery.submissions.batches[0]).toEqual(authorized);
    run.advance({ untilTime: 11, maxEvents: 100 });
    expect(run.projection.delivery.submissions.batches[0]?.phase).toBe("authorized");
    expect(run.projection.collection.leases).toHaveLength(1);
    run.advance({ untilTime: 20, maxEvents: 100 });
    const actual = outputPublicBoundary(run.observe(), controls);
    expect(native[index]).toEqual(actual);
    expect(emitted[index]).toEqual(actual);
    // Independent source literals pin both lanes before differential agreement:
    // one retained finding costs five bytes; no physical request/output lease
    // remains, while certainty/uncertainty still follows the original deadline.
    expect(native[index]).toMatchObject({ boundary: { endpoint: { projection: {
      global: { items: 1, bytes: 5 }, dispatch: { requests: [] }, collection: { leases: [] },
    } } }, controls: [{ time: 7, result: "applied" }], attempts: [] });
    expect(run.observations.find(frame => frame.event.kind === "jevRequestStarted")?.event)
      .toMatchObject({ partition: 1, lifetime: 1, round: 1, operation: 3, request: 4 });
    expect(run.projection.collection.leases).toEqual([]);
    expect(run.observations.filter(frame => frame.event.kind === "jevRequestStarted")).toHaveLength(1);
    expect(run.projection.delivery.submissions.batches[0]?.phase).toBe(selected.outcome === "certain" && selected.delayMs < 10 ? "submitted" : "uncertain");
    if(selected.outcome==="failed"){
      expect(snapshot(run).outputReports.at(-1)).toMatchObject({result:"applied",control:{target,outcome:"failed"}});
      expect(run.observations.filter(frame=>frame.event.kind==="submissionRelease")).toEqual([]);
    }
    if (selected.delayMs === 11) expect(run.observations.find(frame => frame.event.kind === "deliveryAcknowledgeCheck")?.time).toBe(18);
    replay(run);
  }
}, 30_000);

it.each(["certain", "uncertain"] as const)("allows exactly the accepted same-round Stop reoffer boundary for %s", outcome => {
  const run = createRun(settings(outcome, 0));
  run.advance({ untilTime: 18, maxEvents: 100 });
  const firstAdvice = run.observations.find(frame => frame.event.kind === "submissionTerminal")?.event;
  expect(firstAdvice?.kind).toBe("submissionTerminal");
  run.applyControl({ kind: "outputProfile", outcome: "certain", delayMs: 0, leaseMs: 10 });
  run.schedule({ at: 20, kind: "finish" });
  run.advance({ untilTime: 21, maxEvents: 100 });
  const terminal = run.observations.filter(frame => frame.event.kind === "finishTerminal");
  expect(terminal).toHaveLength(outcome === "uncertain" ? 1 : 0);
  if (outcome === "uncertain" && firstAdvice?.kind === "submissionTerminal")
    expect(terminal[0]?.event).toMatchObject({ selected: [firstAdvice.advice], outcome: "acknowledged" });
  run.schedule({ at: 22, kind: "finish" });
  run.advance({ untilTime: 30, maxEvents: 100 });
  expect(run.observations.filter(frame => frame.event.kind === "finishTerminal")).toHaveLength(terminal.length);
  expect(run.observations.filter(frame => frame.event.kind === "jevRequestStarted")).toHaveLength(1);
  replay(run);
});

it("targets one atomic Stop batch without rewriting membership or captured deadline", () => {
  const config = settings("uncertain", 0, 10);
  const run = createRun({ ...config, inputs: [{ ...config.inputs[0]!, unitBytes: [5, 7] }] });
  run.advance({ untilTime: 18, maxEvents: 150 });
  expect(run.projection.delivery.submissions.batches).toHaveLength(2);
  expect(run.projection.delivery.submissions.batches.every(batch => batch.phase === "uncertain")).toBe(true);
  run.applyControl({ kind: "outputProfile", outcome: "certain", delayMs: 5, leaseMs: 10 });
  run.schedule({ at: 20, kind: "finish" });
  reach(run, () => snapshot(run).callbackTargets.some(target => target.effect.kind === "finishTerminal"));
  const target = snapshot(run).callbackTargets.find(target => target.effect.kind === "finishTerminal")!;
  const authorization = run.observations.find(frame => frame.event.kind === "finishAuthorize");
  expect(authorization?.event.kind).toBe("finishAuthorize");
  if (authorization?.event.kind !== "finishAuthorize") throw new Error("missing actual batch authorization");
  const selected = [...authorization.event.selected];
  expect(selected).toHaveLength(2);
  expect(new Set(selected).size).toBe(2);
  expect(run.projection.collection.leases).toHaveLength(2);
  run.applyControl({ kind: "outputAttempt", target, outcome: "uncertain" });
  expect(snapshot(run).outputReports.at(-1)?.result).toBe("applied");
  run.applyControl({ kind: "outputProfile", outcome: "failed", delayMs: 0, leaseMs: 1 });
  run.advance({ untilTime: 24, maxEvents: 100 });
  expect(run.observations.filter(frame => frame.event.kind === "finishTerminal")).toEqual([]);
  expect(run.projection.collection.leases).toHaveLength(2);
  run.advance({ untilTime: 26, maxEvents: 100 });
  const terminals = run.observations.filter(frame => frame.event.kind === "finishTerminal");
  expect(terminals).toHaveLength(1);
  expect(terminals[0]?.event).toMatchObject({ selected, outcome: "unknown" });
  expect(run.projection.collection.leases).toEqual([]);
  run.applyControl({ kind: "outputAttempt", target, outcome: "certain" });
  expect(snapshot(run).outputReports.at(-1)?.result).toBe("notQueued");
  const missing = { ...target, originalOrder: target.originalOrder + 1000 };
  run.applyControl({ kind: "outputAttempt", target: missing, outcome: "certain" });
  expect(snapshot(run).outputReports.at(-1)?.result).toBe("missing");
  expect(run.observations.filter(frame => frame.event.kind === "jevRequestStarted")).toHaveLength(2);
  run.schedule({ at: 27, kind: "finish" });
  run.advance({ untilTime: 30, maxEvents: 100 });
  expect(run.observations.filter(frame => frame.event.kind === "finishTerminal")).toHaveLength(1);
  replay(run);
});

// Accepted known pre-output failure is distinct from an observed failed
// completion of a MAY-have-reached authorized attempt. The healthy issuance
// above deliberately cannot manufacture this provenance through outputAttempt.
it("known pre-output preparation failure releases the original lease without authorizing output",()=>{
 const run=createRun(settings("failed",5,10));run.advance({untilTime:20,maxEvents:100});
 expect(run.observations.some(frame=>frame.event.kind==="submissionBegin" && frame.event.authorizeNow===false)).toBe(true);
 expect(run.observations.some(frame=>frame.commands.some(command=>command.kind==="submissionAuthorized"))).toBe(false);
 expect(run.observations.some(frame=>frame.event.kind==="submissionRelease")).toBe(true);
 expect(run.observations.filter(frame=>frame.event.kind==="submissionTerminal")).toEqual([]);
 expect(run.projection.collection.leases).toEqual([]);replay(run);
});

// Expiry has an original environmental outputExpiry receipt; the actual
// SubmissionExpired-derived terminal(false) remains a separate observable
// Canonical feedback frame, not another mutable environmental completion.
it("does not reissue or rewrite the actual terminal derived from the original expiry check",()=>{
 const run=createRun(settings("certain",11,10));const target=issued(run);
 expect(target.effect.kind).toBe("outputExpiry");
 run.applyControl({kind:"outputAttempt",target,outcome:"certain"});
 run.advance({untilTime:20,maxEvents:100});
 expect(run.observations.filter(frame=>frame.event.kind==="submissionExpiryCheck")).toHaveLength(1);
 const terminals=run.observations.filter(frame=>frame.event.kind==="submissionTerminal");
 expect(terminals).toHaveLength(1);expect(terminals[0]!.event).toMatchObject({certain:false});
 expect(terminals[0]!.callbackReceipt).toBeUndefined();
 expect(run.projection.delivery.submissions.batches[0]!.phase).toBe("uncertain");
 run.applyControl({kind:"outputAttempt",target,outcome:"certain"});
 expect(snapshot(run).outputReports.at(-1)!.result).toBe("notQueued");replay(run);
});


it.each([{ at: 17, reorder: false }, { at: 18, reorder: false }, { at: 17, reorder: true }, { at: 18, reorder: true }])("retains the original lease after release/intervention at $at (reorder=$reorder)", ({ at, reorder }) => {
  const run = createRun(settings("certain", 5, 10));
  const target = issued(run);
  const original = run.observe().outputAttempts[0];
  expect(original).toMatchObject({ target, issuedAt: 7, dueAt: 12, delivery: "scheduled",
    capture: { started: 7, profile: { outcome: "certain", delayMs: 5, leaseMs: 10 } } });
  run.applyControl({ kind: "callback", action: "hold", target });
  expect(run.observe().outputAttempts[0]).toMatchObject({ dueAt: 12, delivery: "held" });
  run.applyControl({ kind: "outputProfile", outcome: "certain", delayMs: 0, leaseMs: 1000 });
  run.schedule({ at, kind: "task", task: 1, generation: 1, agent: run.agentScopes[0]!.agent, recurring: false });
  run.advance({ untilTime: at, maxEvents: 100 });
  expect(run.observe().now).toBe(at);
  expect(run.observations.filter(frame => frame.event.kind === "submissionTerminal")).toEqual([]);
  expect(run.observe().outputAttempts[0]?.capture).toEqual(original?.capture);
  run.applyControl({ kind: "callback", action: "release", target });
  if (reorder) run.applyControl({ kind: "callback", action: "reorder", target });
  run.applyControl({ kind: "outputAttempt", target, outcome: "certain" });
  expect(run.observe().now).toBe(at);
  run.advance({ untilTime: at, maxEvents: 100 });
  const expiry = run.observations.filter(frame => frame.event.kind === "submissionExpiryCheck");
  expect(expiry).toHaveLength(1);
  expect(expiry[0]).toMatchObject({ time: at, event: { elapsed: at - 7, lifetime: 10 },
    callbackReceipt: { target, issuedAt: 7, dueAt: 12, outputCapture: original?.capture } });
  const terminal = run.observations.filter(frame => frame.event.kind === "submissionTerminal");
  expect(terminal).toHaveLength(1);
  expect(terminal[0]).toMatchObject({ time: at, event: { certain: false } });
  expect(terminal[0]?.callbackReceipt).toBeUndefined();
  expect(run.projection.delivery.submissions.batches[0]?.phase).toBe("uncertain");
  expect(run.projection.collection.leases).toEqual([]);
  replay(run);
});

it("refuses every wrong original output identity atomically", () => {
  const run = createRun(settings("certain", 5, 10));
  const target = issued(run);
  const before = run.observe();
  const targets = [
    { ...target, owner: { ...target.owner, partition: target.owner.partition + 1 } },
    { ...target, owner: { ...target.owner, lifetime: target.owner.lifetime + 1 } },
    { ...target, owner: { ...target.owner, round: target.owner.round + 1 } },
    { ...target, owner: { ...target.owner, operation: target.owner.operation + 1 } },
    { ...target, originalOrder: target.originalOrder + 1 },
  ];
  for (const wrong of targets) {
    run.applyControl({ kind: "outputAttempt", target: wrong, outcome: "failed" });
    const after = run.observe();
    expect(after.outputReports.at(-1)?.result).toBe("missing");
    expect(after.projection).toEqual(before.projection);
    expect(after.outputAttempts).toEqual(before.outputAttempts);
    expect(after.eventCount).toBe(before.eventCount);
  }
  run.advance({ untilTime: 20, maxEvents: 100 });
  expect(run.projection.delivery.submissions.batches[0]?.phase).toBe("submitted");
  expect(run.observations.filter(frame => frame.event.kind === "submissionTerminal")).toHaveLength(1);
  replay(run);
});
