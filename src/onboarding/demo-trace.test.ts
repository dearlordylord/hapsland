import { afterEach, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DirectAdvicee } from "../direct-event/model.ts";
import { demoSourceHash, readDemoTrace, recordDemoTrace } from "./demo-trace.ts";
const roots: string[] = [];
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "demo-trace-"));
  roots.push(root);
  const budgetPath = join(root, "budget.json");
  writeFileSync(budgetPath, JSON.stringify({ root }));
  writeFileSync(join(root, "session.ts"), "type SyntheticCount = number\n");
  const advicee: DirectAdvicee = {
    host: "claude-code",
    hostVersion: "2.1.218",
    sessionId: "fixture-session",
    turnId: null,
    toolUseId: "tool",
    subagentId: null,
  };
  return { root, budgetPath, advicee };
};
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
it("records bounded source-free metadata for the owned session", () => {
  const { root, budgetPath, advicee } = fixture();
  recordDemoTrace(budgetPath, root, advicee, {
    kind: "delivery",
    state: "findings",
    ruleIds: Array.from({ length: 20 }, (_, i) => `r${i}`),
  });
  const sourceHash = demoSourceHash(root);
  if (sourceHash === undefined) throw new Error("fixture source was not captured");
  recordDemoTrace(budgetPath, root, advicee, { kind: "terminal", sourceHash, state: "clear" });
  const entries = readDemoTrace(budgetPath, advicee.sessionId);
  expect(entries).toHaveLength(2);
  expect(entries.find((entry) => entry.kind === "delivery")?.ruleIds).toHaveLength(16);
  expect(entries.every((entry) => entry.sourceHash === demoSourceHash(root))).toBe(true);
  for (const name of readdirSync(`${budgetPath}.trace`))
    expect(readFileSync(join(`${budgetPath}.trace`, name), "utf8")).not.toContain("SyntheticCount");
  expect(readDemoTrace(budgetPath, "other-session")).toEqual([]);
});
it("fails quietly for missing evidence, an unowned root or invalid terminal identity", () => {
  const { root, budgetPath, advicee } = fixture();
  for (const path of [undefined, null, join(root, "missing")]) recordDemoTrace(path, root, advicee, { kind: "edit" });
  recordDemoTrace(budgetPath, `${root}-other`, advicee, { kind: "edit" });
  recordDemoTrace(budgetPath, root, advicee, { kind: "terminal", sourceHash: "invalid" });
  expect(readDemoTrace(budgetPath, advicee.sessionId)).toEqual([]);
  expect(demoSourceHash(`${root}-other`)).toBeUndefined();
});
it("rejects malformed trace fields and sorts valid entries by recorded time", () => {
  const { root, budgetPath, advicee } = fixture();
  const directory = `${budgetPath}.trace`;
  mkdirSync(directory);
  const valid = { version: 1, sessionId: advicee.sessionId, at: 20, kind: "edit", sourceHash: "a".repeat(64) };
  const invalids = [
    { version: 2 },
    { at: 1.5 },
    { kind: "other" },
    { sourceHash: "A".repeat(64) },
    { ruleIds: ["invalid space"] },
    { state: "other" },
  ];
  for (const [index, invalid] of invalids.entries())
    writeFileSync(join(directory, `${index}.json`), JSON.stringify({ ...valid, ...invalid }));
  writeFileSync(join(directory, "malformed.json"), "{");
  writeFileSync(join(directory, "ignored.txt"), JSON.stringify(valid));
  writeFileSync(join(directory, "later.json"), JSON.stringify(valid));
  writeFileSync(join(directory, "earlier.json"), JSON.stringify({ ...valid, at: 10 }));
  expect(readDemoTrace(budgetPath, advicee.sessionId).map((entry) => entry.at)).toEqual([10, 20]);
});
