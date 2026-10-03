import { strict as assert } from "node:assert";
import { createRun, restoreReplay, DEFAULT_FILE_TREE_PROFILE, type RunConfig, type RunStructuralFrame } from "./index.ts";

// Frozen caller inputs match the original delay8 directed case. They contain
// no allocated scope, operation, request, callback or output capture.
export const originalWaitingStopConfig = {
  seed: 7, retention: 1000, preparationDelay: 2, jevDelay: 8,
  finishDeadline: 8, outcome: "clear",
  fileTrees: { ...DEFAULT_FILE_TREE_PROFILE, minFiles: 1, maxFiles: 1, maxImports: 0,
    minSourceBytes: 100, maxSourceBytes: 100, minTreeBytes: 20, maxTreeBytes: 20 },
  inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5] }, { at: 3, kind: "finish" }],
} satisfies RunConfig;
export const originalWaitingStopBoundaries = [3, 10, 20] as const;

/** Actual source points, including physical delivery and registration. Replay
 * uses the ordinary exported configuration, not a recorded native event feed. */
export function originalWaitingStopPublic() {
  const run = createRun(originalWaitingStopConfig);
  const frames: RunStructuralFrame[] = [];
  const unsubscribe = run.subscribeStructural(frame => frames.push(frame));
  const boundaries = originalWaitingStopBoundaries.map(endpoint => {
    const result = run.advance({ untilTime: endpoint, maxEvents: 100 });
    if (result.reason === "eventLimit") throw new Error("original Stop boundary exhausted its budget");
    const restored = restoreReplay(JSON.parse(JSON.stringify(run.exportReplay())));
    assert.deepEqual(restored.observe(), run.observe(), "ordinary Stop replay boundary");
    assert.deepEqual(restored.runtimeSnapshot(), run.runtimeSnapshot(), "ordinary replay full source state and queue");
    if (endpoint === 3) {
      const started = run.observations.find(frame => frame.event.kind === "jevRequestStarted");
      assert.equal(started?.time, 2, "original physical request starts after preparation");
      const waiting = run.observations.find(frame => frame.event.kind === "stopPolled");
      assert.equal(waiting?.time, 3, "original Stop starts at the caller boundary");
      assert.equal(waiting?.commands.some(command => command.kind === "waitForWork"), true);
      assert.equal(run.observations.some(frame => frame.event.kind === "finishReserve"), false);
    } else if (endpoint === 10) {
      const ready = run.observations.find(frame => frame.commands.some(command => command.kind === "finishReady"));
      assert.equal(ready?.time, 10, "real settlement wakes Stop before original cutoff11");
      assert.equal(run.observations.some(frame => frame.event.kind === "finishAuthorize"), false);
      assert.equal(run.observations.some(frame => frame.event.kind === "stopGroupEnded" && frame.time === 10), true);
    } else {
      assert.deepEqual(run.projection.dispatch.requests, [], "original request physically settles");
      assert.deepEqual(run.projection.global, { items: 0, bytes: 0 }, "original work charge is released");
    }
    return { endpoint, budget: 100, consumed: result.events, runtime: run.runtimeSnapshot(),
      observation: run.observe(), restored: restored.observe() };
  });
  unsubscribe();
  return { input: originalWaitingStopConfig, frames, boundaries, endpoint: run.runtimeSnapshot(), observation: run.observe() };
}
