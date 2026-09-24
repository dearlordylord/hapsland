import assert from "node:assert/strict";
import test from "node:test";
import { summarizeVisibility } from "./visibility.mjs";

test("records a unique rule acknowledgement and a later changed file separately", () => {
  const hooks = [
    { at: 1_100, exposure: { candidates: [{ path: "src/types.ts", status: "analyzed", sourceHash: "before", units: [{ status: "ready" }] }] } },
    { at: 1_200, findings: [{ path: "src/types.ts", declaration: "EndRecord", ruleId: "r2_meaningless_combinations" }] },
    { at: 1_400, exposure: { candidates: [{ path: "src/types.ts", status: "analyzed", sourceHash: "after", units: [{ status: "ready" }] }] } },
  ];
  const hostEvents = [{ atMs: 300, mentionedRuleIds: ["r2_meaningless_combinations"] }];
  const result = summarizeVisibility(hooks, hostEvents, 1_000);
  assert.equal(result.submittedFindingCount, 1);
  assert.deepEqual(result.acknowledgedRuleIds, ["r2_meaningless_combinations"]);
  assert.equal(result.findingVisibility[0].status, "specific-rule-acknowledged");
  assert.deepEqual(result.editsAfterAdvice, [{ path: "src/types.ts", declaration: "EndRecord",
    ruleId: "r2_meaningless_combinations", editedAtMs: 400 }]);
  assert.deepEqual(result.exposureCounts, { analyzed: 2, "unit-ready": 2 });
});

test("keeps duplicate-rule findings and unchanged edits unproven", () => {
  const hooks = [
    { at: 1_100, exposure: { candidates: [{ path: "src/types.ts", status: "analyzed", sourceHash: "same", units: [] }] } },
    { at: 1_200, findings: [
      { path: "src/types.ts", declaration: "A", ruleId: "r2_meaningless_combinations" },
      { path: "src/types.ts", declaration: "B", ruleId: "r2_meaningless_combinations" },
    ] },
    { at: 1_400, exposure: { candidates: [{ path: "src/types.ts", status: "analyzed", sourceHash: "same", units: [] }] } },
  ];
  const hostEvents = [{ atMs: 300, mentionedRuleIds: ["r2_meaningless_combinations"] }];
  const result = summarizeVisibility(hooks, hostEvents, 1_000);
  assert.deepEqual(result.findingVisibility.map((item) => item.status), ["unproven", "unproven"]);
  assert.deepEqual(result.findingVisibility.map((item) => item.limitation), ["same-rule-multiple-findings", "same-rule-multiple-findings"]);
  assert.deepEqual(result.editsAfterAdvice, []);
});

test("requires a model event after submission for visibility", () => {
  const hooks = [{ at: 1_200, findings: [{ path: "a.ts", declaration: "A", ruleId: "r4_duplicate_encoding" }] }];
  const hostEvents = [{ atMs: 100, mentionedRuleIds: ["r4_duplicate_encoding"] }];
  const result = summarizeVisibility(hooks, hostEvents, 1_000);
  assert.equal(result.findingVisibility[0].status, "unproven");
  assert.deepEqual(result.acknowledgedRuleIds, []);
});
