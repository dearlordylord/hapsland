import assert from "node:assert/strict";
import { createServer } from "vite";
import reviewFixture from "../../../conformance/canonical-review-v1.json" with { type: "json" };

const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const replay = await server.ssrLoadModule("/src/canonical-replay.ts");
  const flow = await server.ssrLoadModule("@hapsland/agent-flow-projection");
  const view = await server.ssrLoadModule("/src/production-flow-presentation.ts");
  const history = replay.SHOWCASE_SCENARIO.events.map((event) => ({ event, origin: "guided" }));
  const steps = replay.replayCanonical(history, history.length, replay.SHOWCASE_SCENARIO.limits).steps;
  const evidenceAt = (index) => flow.projectFlowStep(steps[index - 1]).evidence;
  const has = (index, source, from, to, identity) => evidenceAt(index).some((item) =>
    item.source === source && item.from === from && item.to === to &&
    (identity === undefined || item.identity === identity));

  assert.ok(has(1, "native fact", "observation", "admission"),
    "the pre-edit permit request enters the checked admission boundary without opening a round");
  assert.equal(steps[0].after.rounds.length, 0);
  assert.ok(has(2, "native fact", "observation", "admission"),
    "the accepted edit crosses admission while Bend opens the round");
  assert.ok(steps[1].commands.some((command) => command.kind === "roundStarted"));
  assert.ok(steps[2].commands.some((command) => command.kind === "observationAdmitted"));
  assert.deepEqual(steps[2].after.work.map((work) => [work.operation, work.kind]), [[1, "awaitingSourceRead"]]);
  assert.equal(steps[2].after.charges.length, 0,
    "observation admission creates queued source work without a review capacity charge");
  assert.ok(has(3, "state", "admission", "sourcePending", "work:1"),
    "checked admission places new work in its own waiting-source stage");
  assert.ok(has(9, "state", "sourcePending", "preparation", "work:1"),
    "source work moves from the waiting stage only when reading starts");
  assert.ok(has(4, "state", "sourcePending", "scheduling", "work:1"),
    "the waiting source work is linked to scheduling without leaving its state");
  assert.equal(steps[3].after.dispatch.running.filter((entry) => entry.preparation).length, 1,
    "the first preparation job starts immediately inside scheduling");
  assert.ok(!evidenceAt(4).some((item) => item.to === "preparation"),
    "starting a job does not claim that source reading began");
  assert.ok(!evidenceAt(4).some((item) => item.from === "admission"),
    "dispatch scheduling does not invent an admission or capacity transition");
  assert.equal(steps[3].after.work.find((work) => work.operation === 1)?.kind, "awaitingSourceRead",
    "a running dispatch does not yet mean source reading began");
  assert.ok(has(8, "state", "sourcePending", "scheduling", "work:2"),
    "the second source job enters scheduling while the first runs");
  assert.equal(steps[7].after.dispatch.queued.length, 0);
  assert.ok(has(19, "state", "units", "scheduling", "work:4"));
  assert.ok(has(8, "state", "sourcePending", "scheduling", "work:2"),
    "the second job starts while preparation capacity remains");
  assert.ok(has(11, "state", "preparation", "units", "work:4"),
    "a prepared work item's child review unit has an explicit parent link");
  assert.deepEqual(flow.projectFlowStep(steps[11]).sourceCompletion,
    { observation: 1, linkedReviews: [{ operation: 4, kind: "reviewing" }], jobRunning: true },
    "source completion is derived from checked removal, surviving child review, and source-job state");
  assert.deepEqual(evidenceAt(12), [], "source completion does not invent a destination arrow");
  assert.ok(has(21, "command", "authorization", "effect"),
    "Jev request issue is displayed as permission");
  assert.ok(!has(21, "native fact", "authorization", "effect"),
    "request issue does not claim an observed attempt");
  assert.ok(has(22, "state", "authorization", "effect", "request:8"),
    "the observed request start moves its stable request ID");
  assert.ok(!has(27, "command", "outcomes", "advice"),
    "a retain command does not claim advice is ready");
  assert.ok(!steps[26].after.collection.ready.includes(4),
    "retain command does not assert stored advice");
  assert.ok(has(28, "state", "outcomes", "advice", "work:4"),
    "Bend links the ready advice to checked finding work");
  assert.ok(steps[27].after.collection.ready.includes(4));
  assert.ok(!has(30, "command", "outcomes", "advice"),
    "the second finding waits for readiness without lighting the ready route");
  assert.deepEqual(flow.findingLineage(steps[29].after).find((item) => item.operation === 6)?.unfinished.map((item) => item.operation), [7],
    "the second finding names the unfinished sibling review from the same edit");
  assert.deepEqual(flow.findingLineage(steps[35].after).find((item) => item.operation === 6)?.unfinished, [],
    "the clear removes a blocker but does not create advice");
  assert.equal(flow.findingLineage(steps[35].after).find((item) => item.operation === 6)?.ready, false);
  assert.equal(flow.findingLineage(steps[37].after).find((item) => item.operation === 6)?.ready, true,
    "the later collectionReady transition marks the existing finding ready");
  assert.ok(!flow.projectFlowStep(steps[10]).changedStages.includes("observation"),
    "preparing one item does not highlight an unrelated queued observation");
  assert.equal(steps[35].event.kind, "jevRequestSettled");
  assert.equal(steps[35].event.outcome, "clear");
  assert.ok(!steps[35].after.work.some((work) => work.operation === 7),
    "a clear result completes the third review item without pending advice");
  assert.ok(!steps[35].after.charges.some((charge) => charge.id === 5),
    "a clear result releases the third item's charge");
  assert.ok(!has(36, "command", "outcomes", "advice"),
    "clear does not issue a retain-finding command");
  assert.ok(has(38, "state", "outcomes", "advice", "work:6"),
    "the second finding becomes ready only after its sibling review clears");
  assert.ok(has(40, "state", "advice", "collection", "advice:4"),
    "a new lease is linked to its ready advice even while readiness remains visible");
  assert.ok(steps[39].after.collection.ready.includes(4),
    "lease creation does not invent removal of the ready advice");
  assert.ok(has(59, "state", "round", "round", "round:1"),
    "checked retirement marks the round's end");
  assert.ok(steps.every((step) => step.rejection === undefined), "the complete showcase is accepted");
  const settled = steps.at(-1).after;
  assert.deepEqual({ rounds: settled.rounds, work: settled.work, charges: settled.charges,
    ready: settled.collection.ready, leases: settled.collection.leases,
    slots: settled.delivery.slots, batches: settled.delivery.submissions.batches },
  { rounds: [], work: [], charges: [], ready: [], leases: [], slots: [], batches: [] },
  "the default replay ends with no round-owned work, advice, or output slot");

  const outputCase = replay.CANONICAL_SCENARIOS.find((scenario) => scenario.name === "unknown output is reoffered at Stop");
  assert.ok(outputCase);
  const outputHistory = outputCase.events.map((event) => ({ event, origin: "guided" }));
  const outputSteps = replay.replayCanonical(outputHistory, outputHistory.length, outputCase.limits).steps;
  assert.ok(flow.projectFlowStep(outputSteps[3]).evidence.some((item) =>
    item.from === "delivery" && item.to === "round" && item.source === "native fact"),
  "a recorded host output fact with a checked round change lights output → round");
  const staleCase = reviewFixture.traces.find((trace) => trace.name === "stale completed finding never becomes pending advice");
  assert.ok(staleCase);
  const staleHistory = staleCase.events.map(({ expect: _expect, ...event }) => ({ event, origin: "guided" }));
  const staleSteps = replay.replayCanonical(staleHistory, staleHistory.length).steps;
  assert.ok(flow.projectFlowStep(staleSteps[11]).evidence.some((item) =>
    item.from === "jev" && item.to === "outcomes" && item.source === "external fact"),
  "an observed stale Jev result retains its external boundary even when Bend retires it");

  const edges = new Set(view.CONNECTIONS.map(({ from, to }) => `${from}:${to}`));
  for (const [index, step] of steps.entries()) {
    const projected = flow.projectFlowStep(step);
    for (const item of projected.evidence) assert.ok(edges.has(`${item.from}:${item.to}`),
      `step ${index + 1}: evidence has a visible connection`);
  }
  const refusedHistory = [{ event: { kind: "startReview", partition: 1, lifetime: 1, round: 1, operation: 999 }, origin: "manual" }];
  const refused = replay.replayCanonical(refusedHistory, 1).steps[0];
  assert.ok(refused.rejection);
  assert.deepEqual(flow.projectFlowStep(refused).evidence, [], "rejected step cannot light an arrow");
  assert.deepEqual(flow.projectFlowStep(refused).changedStages, [], "rejected step cannot move an item");
  console.log(`Checked inferred and declared flow evidence over ${steps.length} showcase steps and a rejection.`);
} finally {
  await server.close();
}
