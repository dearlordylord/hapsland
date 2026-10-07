import { expect, it } from "vitest"
import * as Effect from "effect/Effect"
import { writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { makeGitFixture } from "@hapsland/build-tooling/test-support/test-fixtures"
import { adaptPiDirectEvent, adaptPiHookIdentity } from "@hapsland/native-observation/direct-event/pi-adapter"
import { MAX_SOURCE_BYTES } from "@hapsland/native-observation/direct-event/capture"
import { analyzeFunctionFile } from "@hapsland/source-analysis/direct-event/function-analyzer"
import { selectEditedRoots } from "@hapsland/native-observation/direct-event/edit-attribution"
import { verifyCodexPostEditHunks } from "@hapsland/native-observation/direct-event/codex-patch-hunks"

const fixture = async () => {
  const root = await makeGitFixture()
  await writeFile(join(root, "a.ts"), "function revised() {}\n")
  return {
    root,
    event: {
      cwd: root,
      session_id: "session",
      tool_use_id: "tool",
      host_version: "1.0.0",
      tool_name: "edit",
      isError: false,
      input: { path: "a.ts", edits: [{ oldText: "old", newText: "revised" }] },
      details: { patch: "--- a.ts\n+++ a.ts\n@@ -1,1 +1,1 @@\n-function old() {}\n+function revised() {}\n" }
    }
  }
}
it("captures Pi patch coordinates with main-thread identity and current content hash", async () => {
  const { root, event } = await fixture()
  const result = await Effect.runPromise(adaptPiDirectEvent(event))
  expect(result).toMatchObject({
    root,
    advicee: { host: "pi", hostVersion: "1.0.0", turnId: null, subagentId: null },
    candidates: [{ operation: "update", path: "a.ts", addedLines: ["function revised() {}"] }],
    verifiedPostEditHunks: { hunks: [{ location: { start: { line: 1, column: 1 }, end: { line: 1, column: 22 } } }] }
  })
  expect(result?.verifiedPostEditHunks?.contentHash).toHaveLength(64)
  expect(await Effect.runPromise(adaptPiHookIdentity(event))).toMatchObject({ root, advicee: { toolUseId: "tool" } })
})
it("rejects unsupported identities, operations, errors, input shapes and oversized evidence", async () => {
  const { event } = await fixture()
  const variants = [
    null,
    { ...event, host_version: "2.0.0" },
    { ...event, agent_id: null },
    { ...event, parentToolCallId: undefined },
    { ...event, tool_name: "write" },
    { ...event, isError: true },
    { ...event, input: { path: "a.ts", edits: [] } },
    { ...event, input: { path: "a.ts", edits: [{ oldText: "", newText: "x" }] } },
    { ...event, input: { path: "a.ts", edits: [{ oldText: "é", newText: "x" }] } },
    { ...event, details: { patch: "x".repeat(MAX_SOURCE_BYTES + 1) } }
  ]
  for (const value of variants) expect(await Effect.runPromise(adaptPiDirectEvent(value))).toBeUndefined()
})
it("rejects forged post-images, malformed counts and unrelated paths", async () => {
  const { event } = await fixture()
  for (const patch of [
    event.details.patch.replace("+function revised", "+function forged"),
    event.details.patch.replace("+1,1", "+1,2"),
    event.details.patch.replace("--- a.ts", "--- b.ts"),
    event.details.patch.replace("@@ -1,1 +1,1 @@", "@@ -1,1 +2,1 @@"),
    "display diff"
  ]) {
    expect(await Effect.runPromise(adaptPiDirectEvent({ ...event, details: { patch } }))).toBeUndefined()
  }
})
it("selects cwd-relative paths and rejects unselected or nonASCII current source", async () => {
  const { root, event } = await fixture()
  await mkdir(join(root, "nested"))
  await writeFile(join(root, "nested", "a.ts"), "function revised() {}\r\n")
  expect(await Effect.runPromise(adaptPiDirectEvent({ ...event, cwd: join(root, "nested") }))).toMatchObject({
    candidates: [{ path: "nested/a.ts" }]
  })
  await writeFile(join(root, "a.ts"), "function revised() {}\n// é\n")
  expect(await Effect.runPromise(adaptPiDirectEvent(event))).toBeUndefined()
  expect(
    await Effect.runPromise(adaptPiDirectEvent({ ...event, input: { ...event.input, path: "../a.ts" } }))
  ).toBeUndefined()
})
it("preserves separate native patch coordinates including repeated post-image text", async () => {
  const { root, event } = await fixture()
  await writeFile(join(root, "a.ts"), "function revised() {}\nunchanged\nfunction revised() {}\n")
  const patch =
    "--- a.ts\n+++ a.ts\n@@ -1,1 +1,1 @@\n-function old() {}\n+function revised() {}\n@@ -3,1 +3,1 @@\n-function other() {}\n+function revised() {}\n"
  const result = await Effect.runPromise(
    adaptPiDirectEvent({
      ...event,
      input: {
        ...event.input,
        edits: [
          { oldText: "old", newText: "revised" },
          { oldText: "other", newText: "revised" }
        ]
      },
      details: { patch }
    })
  )
  expect(result?.verifiedPostEditHunks?.hunks.map((hunk) => hunk.location.start.line)).toEqual([1, 3])
  expect(
    await Effect.runPromise(adaptPiDirectEvent({ ...event, details: { patch: patch.replace("-3,1", "-4,1") } }))
  ).toBeUndefined()
})
it("accepts native no-newline evidence while rejecting an unsupported deletion-only edit", async () => {
  const { root, event } = await fixture()
  await writeFile(join(root, "a.ts"), "function revised() {}")
  const patch =
    "--- a.ts\n+++ a.ts\n@@ -1,1 +1,1 @@\n-function old() {}\n\\ No newline at end of file\n+function revised() {}\n\\ No newline at end of file\n"
  expect(await Effect.runPromise(adaptPiDirectEvent({ ...event, details: { patch } }))).toBeDefined()
  await writeFile(join(root, "a.ts"), "")
  expect(
    await Effect.runPromise(
      adaptPiDirectEvent({ ...event, details: { patch: "--- a.ts\n+++ a.ts\n@@ -1,1 +0,0 @@\n-function old() {}\n" } })
    )
  ).toBeUndefined()
})
it("uses the successful native patch rather than replacement text to locate changes", async () => {
  const { event } = await fixture()
  expect(
    await Effect.runPromise(
      adaptPiDirectEvent({ ...event, input: { ...event.input, edits: [{ oldText: "unrelated", newText: "revised" }] } })
    )
  ).toMatchObject({ verifiedPostEditHunks: { hunks: [{ location: { start: { line: 1, column: 1 } } }] } })
})
it("accepts multiline native replacements with normalized CRLF input and terminal newline", async () => {
  const { root, event } = await fixture()
  await writeFile(join(root, "a.ts"), "function revised() {\r\n  return 2;\r\n}\r\n")
  const patch =
    "--- a.ts\n+++ a.ts\n@@ -1,3 +1,3 @@\n-function old() {\n-  return 1;\n+function revised() {\n+  return 2;\n }\n"
  const result = await Effect.runPromise(
    adaptPiDirectEvent({
      ...event,
      details: { patch },
      input: {
        path: "a.ts",
        edits: [
          {
            oldText: "function old() {\r\n  return 1;\r\n}\r\n",
            newText: "function revised() {\r\n  return 2;\r\n}\r\n"
          }
        ]
      }
    })
  )
  expect(result?.verifiedPostEditHunks?.hunks.map((hunk) => hunk.location.start.line)).toEqual([1, 2])
})

// Two distant changes in one function produce two native hunks, regardless of replacement grouping.
it("attributes the same patch for whole-function and targeted replacements", async () => {
  const { root, event } = await fixture()
  const before =
    'export function buildOptions() {\n  return {\n    timeoutMs: 1000,\n    cache: true,\n    strict: true,\n    trace: false,\n    debug: false,\n    locale: "en",\n    region: "eu",\n    mode: "safe",\n    format: "json",\n    compress: true,\n    secure: true,\n    retries: 3,\n  };\n}\n'
  const after =
    'export function buildOptions() {\n  return {\n    timeoutMs: 2000,\n    cache: true,\n    strict: true,\n    trace: false,\n    debug: false,\n    locale: "en",\n    region: "eu",\n    mode: "safe",\n    format: "json",\n    compress: true,\n    secure: true,\n    retries: 5,\n  };\n}\n'
  const patch =
    '--- options.ts\n+++ options.ts\n@@ -1,7 +1,7 @@\n export function buildOptions() {\n   return {\n-    timeoutMs: 1000,\n+    timeoutMs: 2000,\n     cache: true,\n     strict: true,\n     trace: false,\n     debug: false,\n@@ -10,7 +10,7 @@\n     mode: "safe",\n     format: "json",\n     compress: true,\n     secure: true,\n-    retries: 3,\n+    retries: 5,\n   };\n }\n'
  await writeFile(join(root, "a.ts"), after)
  const whole = await Effect.runPromise(
    adaptPiDirectEvent({
      ...event,
      input: { path: "a.ts", edits: [{ oldText: before, newText: after }] },
      details: { patch: patch.replaceAll("options.ts", "a.ts") }
    })
  )
  expect(whole?.verifiedPostEditHunks?.hunks.map((hunk) => hunk.location.start.line)).toEqual([3, 14])
  const targeted = await Effect.runPromise(
    adaptPiDirectEvent({
      ...event,
      input: {
        path: "a.ts",
        edits: [
          { oldText: "timeoutMs: 1000", newText: "timeoutMs: 2000" },
          { oldText: "retries: 3", newText: "retries: 5" }
        ]
      },
      details: { patch: patch.replaceAll("options.ts", "a.ts") }
    })
  )
  expect(targeted).toEqual(whole)
  const declarations = [...analyzeFunctionFile("a.ts", after)!.functions.values()].map((fact) => ({
    path: "a.ts",
    kind: "function" as const,
    name: fact.artifact.name,
    location: fact.location
  }))
  const selected = selectEditedRoots(
    { path: "a.ts", operation: "update", source: after },
    whole!.verifiedPostEditHunks!.hunks,
    declarations
  )
  expect(selected.selected.map((root) => root.name)).toEqual(["buildOptions"])
  expect(selected.ambiguous).toEqual([])
})

it("keeps adjacent Pi functions individually attributable", async () => {
  const { root, event } = await fixture()
  const before = "function a() { return 1 }\nfunction b() { return 1 }\n"
  const after = "function a() { return 2 }\nfunction b() { return 2 }\n"
  const patch =
    "--- a.ts\n+++ a.ts\n@@ -1,2 +1,2 @@\n-function a() { return 1 }\n-function b() { return 1 }\n+function a() { return 2 }\n+function b() { return 2 }\n"
  await writeFile(join(root, "a.ts"), after)
  const observation = await Effect.runPromise(
    adaptPiDirectEvent({
      ...event,
      input: { path: "a.ts", edits: [{ oldText: before, newText: after }] },
      details: { patch }
    })
  )
  const declarations = [...analyzeFunctionFile("a.ts", after)!.functions.values()].map((fact) => ({
    path: "a.ts",
    kind: "function" as const,
    name: fact.artifact.name,
    location: fact.location
  }))
  const selected = selectEditedRoots(
    { path: "a.ts", operation: "update", source: after },
    observation!.verifiedPostEditHunks!.hunks,
    declarations
  )
  expect(selected.selected.map((root) => root.name)).toEqual(["a", "b"])
  expect(selected.ambiguous).toEqual([])
})

it("uses Pi coordinates where Codex requires unique matching text", async () => {
  const { root, event } = await fixture()
  await writeFile(join(root, "a.ts"), "function revised() {}\nfunction revised() {}\n")
  const observation = await Effect.runPromise(adaptPiDirectEvent(event))
  expect(observation?.verifiedPostEditHunks?.hunks.map((hunk) => hunk.location.start.line)).toEqual([1])
  const codex = "*** Begin Patch\n*** Update File: a.ts\n@@\n-function old() {}\n+function revised() {}\n*** End Patch"
  expect(verifyCodexPostEditHunks(codex, "a.ts", "function revised() {}\nfunction revised() {}\n")).toBeUndefined()
})

it("does not fall back to text search when native Pi coordinates disagree", async () => {
  const { root, event } = await fixture()
  await writeFile(join(root, "a.ts"), "unrelated\nfunction revised() {}\n")
  expect(await Effect.runPromise(adaptPiDirectEvent(event))).toBeUndefined()
})

it("rejects a no-newline marker on an intermediate post-image line", async () => {
  const { root, event } = await fixture()
  await writeFile(join(root, "a.ts"), "c\nd")
  const patch = "--- a.ts\n+++ a.ts\n@@ -1,2 +1,2 @@\n-a\n-b\n+c\n\\ No newline at end of file\n+d\n"
  expect(await Effect.runPromise(adaptPiDirectEvent({ ...event, details: { patch } }))).toBeUndefined()
})

it("rejects malformed unified envelopes, headers, bodies, and counts", async () => {
  const { event } = await fixture()
  for (const patch of [
    event.details.patch.trimEnd(),
    event.details.patch.replace("+++ a.ts", "+++ other.ts"),
    event.details.patch.replace("@@ -1,1 +1,1 @@", "@@ -9007199254740992 +1 @@"),
    event.details.patch.replace("@@ -1,1 +1,1 @@", "@@ -1,2 +1,1 @@"),
    event.details.patch.replace("@@ -1,1 +1,1 @@", "@@ -1 +1 @@"),
    event.details.patch.replace("-function old() {}", "?function old() {}"),
    event.details.patch.replace("-function old() {}", "\\ No newline at end of file"),
    event.details.patch.replace("+function revised() {}", "+function revised() {}\n\\ No newline at end of file")
  ]) {
    const result = await Effect.runPromise(adaptPiDirectEvent({ ...event, details: { patch } }))
    if (patch.includes("@@ -1 +1 @@")) expect(result).toBeDefined()
    else expect(result).toBeUndefined()
  }
})

it("bounds added-line evidence independently of replacement grouping", async () => {
  const { root, event } = await fixture()
  const after = Array.from({ length: 65 }, (_, index) => `value${index}`).join("\n") + "\n"
  await writeFile(join(root, "a.ts"), after)
  const patch = `--- a.ts\n+++ a.ts\n@@ -1,1 +1,65 @@\n-old\n${after
    .split("\n")
    .slice(0, -1)
    .map((line) => `+${line}`)
    .join("\n")}\n`
  expect(await Effect.runPromise(adaptPiDirectEvent({ ...event, details: { patch } }))).toBeUndefined()
})

it("rejects an intermediate no-newline marker even when a final marker follows", async () => {
  const { root, event } = await fixture()
  await writeFile(join(root, "a.ts"), "c\nd")
  const patch =
    "--- a.ts\n+++ a.ts\n@@ -1,2 +1,2 @@\n-a\n-b\n+c\n\\ No newline at end of file\n+d\n\\ No newline at end of file\n"
  expect(await Effect.runPromise(adaptPiDirectEvent({ ...event, details: { patch } }))).toBeUndefined()
})

it("enforces the aggregate added-line bound across separate native hunks", async () => {
  const { root, event } = await fixture()
  const after = Array.from({ length: 65 }, (_, index) => `value${index}`).join("\n") + "\n"
  await writeFile(join(root, "a.ts"), after)
  const hunks = Array.from(
    { length: 65 },
    (_, index) => `@@ -${index + 1} +${index + 1} @@\n-old${index}\n+value${index}\n`
  )
  const bounded = await Effect.runPromise(
    adaptPiDirectEvent({ ...event, details: { patch: `--- a.ts\n+++ a.ts\n${hunks.slice(0, 64).join("")}` } })
  )
  expect(bounded?.verifiedPostEditHunks?.hunks).toHaveLength(64)
  expect(
    await Effect.runPromise(
      adaptPiDirectEvent({ ...event, details: { patch: `--- a.ts\n+++ a.ts\n${hunks.join("")}` } })
    )
  ).toBeUndefined()
})
