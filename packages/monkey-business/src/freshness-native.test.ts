import { expect, it } from "vitest";
import { createRun, restoreReplay, DEFAULT_FILE_TREE_PROFILE, type Observation } from "./index.ts";
import { runFreshnessNative, runFreshnessEmitted } from "../../monkey-business-bend/conformance/freshness-runner.mjs";

// Original edits use Engine.edit_attempt and Engine.freshness_admitted at
// actual admission, then the shared freshness fence. Native input never comes from JS.
const expected = (changed: boolean) => [
  // Shared issuance uses the actual owner allocator, also exercised independently
  // by createRun below: operation/request are3/4, then7/8.
  [12, 7, 1, 1, 1, 3, 4, changed ? 0 : 1],
  ...(!changed ? [[18, 7]] : []),
  [12, 10, 1, 1, 1, 7, 8, 1],
  [18, 10],
  [32, 10, changed ? 1 : 2, changed ? 5 : 10, 0, 0, 0],
];
function nativeMilestones(rows: number[][]): number[][] {
  return rows.flatMap(row => row[0] === 12 ? [[...row.slice(0, 7), row[9]!]]
    : row[0] === 18 ? [row.slice(0, 2)] : row[0] === 32 ? [row] : []);
}
function publicMilestones(frames: readonly Observation[]): number[][] {
  return frames.flatMap(frame => frame.event.kind === "jevRequestSettled" ? [[12, frame.time,
    frame.event.partition, frame.event.lifetime, frame.event.round, frame.event.operation,
    frame.event.request, Number(frame.event.currentWork)]]
    : frame.event.kind === "submissionTerminal" ? [[18, frame.time]] : []);
}

it.each([false, true])("compares original %s changed source with independent stale-delivery milestones", changed => {
  const fixture = new URL(`../../monkey-business-bend/conformance/freshness-${changed ? "changed" : "same"}.bend`, import.meta.url);
  const native = runFreshnessNative(fixture);
  expect(runFreshnessEmitted(fixture)).toEqual(native);
  expect(native.some(row => row[0] === 98)).toBe(false);
  expect(nativeMilestones(native)).toEqual(expected(changed));
  const run = createRun({ seed: 7, retention: 1000, preparationDelay: 2, jevDelay: 5,
    outcome: "finding", adviceLifetime: 600000,
    fileTrees: { ...DEFAULT_FILE_TREE_PROFILE, minFiles: 2, maxFiles: 2, maxImports: 1, maxDepth: 1,
      deniedPercent: 0, minSourceBytes: 100, maxSourceBytes: 100, minTreeBytes: 20, maxTreeBytes: 20 },
    inputs: [
      { at: 0, kind: "edit", bytes: 10, unitBytes: [5], revisionSubject: "root", revisionInput: "old" },
      { at: 3, kind: "edit", bytes: 10, unitBytes: [5], revisionSubject: "root", revisionInput: changed ? "new" : "old" },
    ],
  });
  expect(run.advance({ untilTime: 12, maxEvents: 120 }).reason).not.toBe("eventLimit");
  const final = run.projection;
  const snapshot = [32, run.now, final.global.items, final.global.bytes,
    final.dispatch.running.length, final.dispatch.requests.length, final.collection.leases.length];
  expect([...publicMilestones(run.observations), snapshot]).toEqual(expected(changed));
  const old = run.observations.find(frame => frame.event.kind === "jevRequestSettled"
    && frame.event.operation === 3)!;
  if (changed) expect(old.commands).toEqual([{ kind: "jevObservationIgnored" }]);
  else expect(old.commands).toContainEqual({ kind: "retainFinding" });
  expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe());
  // Full immutable Frame.before/after export and callback receipt trace parity
  // remain a named central adapter ABI gap; compact milestones do not claim it.
}, 30000);
