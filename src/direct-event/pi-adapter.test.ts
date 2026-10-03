import { expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { makeGitFixture } from "./test-fixtures.ts";
import { adaptPiDirectEvent, adaptPiHookIdentity } from "./pi-adapter.ts";
import { MAX_SOURCE_BYTES } from "./capture.ts";

const fixture = async () => {
  const root = await makeGitFixture();
  await writeFile(join(root, "a.ts"), "function revised() {}\n");
  return { root, event: { cwd: root, session_id: "session", tool_use_id: "tool", host_version: "1.0.0",
    tool_name: "edit", isError: false, input: { path: "a.ts", edits: [{ oldText: "old", newText: "revised" }] },
    details: { patch: "--- a.ts\n+++ a.ts\n@@ -1,1 +1,1 @@\n-function old() {}\n+function revised() {}\n" } } };
};
it("captures Pi patch coordinates with main-thread identity and current content hash", async () => {
  const { root, event } = await fixture();
  const result = await Effect.runPromise(adaptPiDirectEvent(event));
  expect(result).toMatchObject({ root, advicee: { host: "pi", hostVersion: "1.0.0", turnId: null, subagentId: null },
    candidates: [{ operation: "update", path: "a.ts", addedLines: ["function revised() {}"] }],
    verifiedPostEditHunks: { hunks: [{ location: { start: { line: 1, column: 1 }, end: { line: 1, column: 22 } } }] } });
  expect(result?.verifiedPostEditHunks?.contentHash).toHaveLength(64);
  expect(await Effect.runPromise(adaptPiHookIdentity(event))).toMatchObject({ root, advicee: { toolUseId: "tool" } });
});
it("rejects unsupported identities, operations, errors, input shapes and oversized evidence", async () => {
  const { event } = await fixture();
  const variants = [null, { ...event, host_version: "2.0.0" }, { ...event, agent_id: null },
    { ...event, parentToolCallId: undefined }, { ...event, tool_name: "write" }, { ...event, isError: true },
    { ...event, input: { path: "a.ts", edits: [] } },
    { ...event, input: { path: "a.ts", edits: [{ oldText: "", newText: "x" }] } },
    { ...event, input: { path: "a.ts", edits: [{ oldText: "é", newText: "x" }] } },
    { ...event, details: { patch: "x".repeat(MAX_SOURCE_BYTES + 1) } }];
  for (const value of variants) expect(await Effect.runPromise(adaptPiDirectEvent(value))).toBeUndefined();
});
it("rejects forged post-images, malformed counts and unrelated paths", async () => {
  const { event } = await fixture();
  for (const patch of [event.details.patch.replace("+function revised", "+function forged"),
    event.details.patch.replace("+1,1", "+1,2"), event.details.patch.replace("--- a.ts", "--- b.ts"),
    event.details.patch.replace("@@ -1,1 +1,1 @@", "@@ -1,1 +2,1 @@"), "display diff"]) {
    expect(await Effect.runPromise(adaptPiDirectEvent({ ...event, details: { patch } }))).toBeUndefined();
  }
});
it("selects cwd-relative paths and rejects unselected or nonASCII current source", async () => {
  const { root, event } = await fixture();
  await mkdir(join(root, "nested"));
  await writeFile(join(root, "nested", "a.ts"), "function revised() {}\r\n");
  expect(await Effect.runPromise(adaptPiDirectEvent({ ...event, cwd: join(root, "nested") })))
    .toMatchObject({ candidates: [{ path: "nested/a.ts" }] });
  await writeFile(join(root, "a.ts"), "function revised() {}\n// é\n");
  expect(await Effect.runPromise(adaptPiDirectEvent(event))).toBeUndefined();
  expect(await Effect.runPromise(adaptPiDirectEvent({ ...event, input: { ...event.input, path: "../a.ts" } }))).toBeUndefined();
});
it("preserves separate native patch coordinates including repeated post-image text", async () => {
  const { root, event } = await fixture();
  await writeFile(join(root, "a.ts"), "function revised() {}\nunchanged\nfunction revised() {}\n");
  const patch = "--- a.ts\n+++ a.ts\n@@ -1,1 +1,1 @@\n-function old() {}\n+function revised() {}\n@@ -3,1 +3,1 @@\n-function other() {}\n+function revised() {}\n";
  const result = await Effect.runPromise(adaptPiDirectEvent({ ...event, input: { ...event.input, edits: [{ oldText: "old", newText: "revised" }, { oldText: "other", newText: "revised" }] }, details: { patch } }));
  expect(result?.verifiedPostEditHunks?.hunks.map((hunk) => hunk.location.start.line)).toEqual([1, 3]);
  expect(await Effect.runPromise(adaptPiDirectEvent({ ...event, details: { patch: patch.replace("-3,1", "-4,1") } }))).toBeUndefined();
});
it("accepts native no-newline evidence while rejecting an unsupported deletion-only edit", async () => {
  const { root, event } = await fixture();
  await writeFile(join(root, "a.ts"), "function revised() {}");
  const patch = "--- a.ts\n+++ a.ts\n@@ -1,1 +1,1 @@\n-function old() {}\n\\ No newline at end of file\n+function revised() {}\n\\ No newline at end of file\n";
  expect(await Effect.runPromise(adaptPiDirectEvent({ ...event, details: { patch } }))).toBeDefined();
  await writeFile(join(root, "a.ts"), "");
  expect(await Effect.runPromise(adaptPiDirectEvent({ ...event, details: {
    patch: "--- a.ts\n+++ a.ts\n@@ -1,1 +0,0 @@\n-function old() {}\n",
  } }))).toBeUndefined();
});
it("rejects a current-source matching patch unrelated to native input", async () => {
  const { event } = await fixture();
  expect(await Effect.runPromise(adaptPiDirectEvent({ ...event, input: {
    ...event.input, edits: [{ oldText: "unrelated", newText: "revised" }],
  } }))).toBeUndefined();
});
it("accepts multiline native replacements with normalized CRLF input and terminal newline", async () => {
  const { root, event } = await fixture();
  await writeFile(join(root, "a.ts"), "function revised() {\r\n  return 2;\r\n}\r\n");
  const patch = "--- a.ts\n+++ a.ts\n@@ -1,3 +1,3 @@\n-function old() {\n-  return 1;\n+function revised() {\n+  return 2;\n }\n";
  const result = await Effect.runPromise(adaptPiDirectEvent({ ...event, details: { patch }, input: {
    path: "a.ts", edits: [{ oldText: "function old() {\r\n  return 1;\r\n}\r\n", newText: "function revised() {\r\n  return 2;\r\n}\r\n" }],
  } }));
  expect(result?.verifiedPostEditHunks?.hunks.map((hunk) => hunk.location.start.line)).toEqual([1, 2]);
});
