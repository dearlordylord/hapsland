import assert from "node:assert/strict";
import { createServer } from "vite";
import reviewFixture from "../../../conformance/canonical-review-v1.json" with { type: "json" };

const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const replay = await server.ssrLoadModule("/src/canonical-replay.ts");
  const flow = await server.ssrLoadModule("/src/production-flow-projection.ts");
  const history = replay.SHOWCASE_SCENARIO.events.map((event) => ({ event, origin: "guided" }));
  const steps = replay.replayCanonical(history, history.length, replay.SHOWCASE_SCENARIO.limits).steps;
  const evidenceAt = (index) => flow.projectFlowStep(steps[index - 1]).evidence;
  const has = (index, source, from, to, identity) => evidenceAt(index).some((item) =>
    item.source === source && item.from === from && item.to === to &&
    (identity === undefined || item.identity === identity));

  assert.ok(has(5, "state", "admission", "queued", "dispatch:2"),
    "a second queued edit is evidenced by its dispatch ID");
  assert.ok(has(10, "state", "queued", "preparation", "dispatch:2"),
    "the same dispatch ID crosses from waiting queue to running preparation");
  assert.ok(has(8, "state", "preparation", "units", "work:4"),
    "a prepared work item's child review unit has an explicit parent link");
  assert.ok(has(18, "command", "authorization", "effect"),
    "Jev request issue is displayed as permission");
  assert.ok(!has(18, "native fact", "authorization", "effect"),
    "request issue does not claim an observed attempt");
  assert.ok(has(19, "state", "authorization", "effect", "request:7"),
    "the observed request start moves its stable request ID");
  assert.ok(has(24, "command", "outcomes", "advice"),
    "a finding's retain command is visible");
  assert.ok(!steps[23].after.collection.ready.includes(10),
    "retain command does not assert stored advice");
  assert.ok(has(25, "native fact", "outcomes", "advice"),
    "later native readiness visibly brings advice to the pending-advice square");
  assert.ok(steps[24].after.collection.ready.includes(10));
  assert.ok(!flow.projectFlowStep(steps[7]).changedSquares.includes("observation"),
    "preparing one item does not highlight an unrelated queued observation");
  assert.ok(flow.projectFlowStep(steps[16]).explanation.length > 0,
    "decision-only steps have an explanation without invented movement");

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

  const edges = new Set(flow.CONNECTIONS.map(({ from, to }) => `${from}:${to}`));
  for (const [index, step] of steps.entries()) {
    const projected = flow.projectFlowStep(step);
    for (const item of projected.evidence) assert.ok(edges.has(`${item.from}:${item.to}`),
      `step ${index + 1}: evidence has a visible connection`);
  }
  const refusedHistory = [{ event: { kind: "startReview", partition: 1, lifetime: 1, round: 1, operation: 999 }, origin: "manual" }];
  const refused = replay.replayCanonical(refusedHistory, 1).steps[0];
  assert.ok(refused.rejection);
  assert.deepEqual(flow.projectFlowStep(refused).evidence, [], "rejected step cannot light an arrow");
  assert.deepEqual(flow.projectFlowStep(refused).changedSquares, [], "rejected step cannot move an item");
  console.log(`Checked inferred and declared flow evidence over ${steps.length} showcase steps and a rejection.`);
} finally {
  await server.close();
}
