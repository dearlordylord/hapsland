import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { adaptClaudeDirectEvent } from "./adapter.ts";
import { makeGitFixture } from "./test-fixtures.ts";
import { decodeResidentRequest } from "../resident/protocol.ts";

const base = (root: string, path: string) => ({
  hook_event_name: "PostToolUse",
  cwd: root,
  session_id: "session-a",
  tool_use_id: "tool-a",
  tool_name: "Edit",
  tool_input: { file_path: path, old_string: "value: string", new_string: "value: number", replace_all: false },
  tool_response: {
    filePath: path, oldString: "value: string", newString: "value: number",
    originalFile: "export interface Item { value: string }\n", replaceAll: false, userModified: false,
  },
});

describe("Claude Code 2.1.218 direct adapter", () => {
  it("attributes a completed Edit to the exact tool call and carries the changed line", async () => {
    const root = await makeGitFixture();
    const path = join(root, "item.ts");
    await writeFile(path, "export interface Item { value: number }\n");
    const event = base(root, path);
    const observation = await Effect.runPromise(adaptClaudeDirectEvent(event));
    expect(observation).toMatchObject({
      root,
      advicee: { host: "claude-code", hostVersion: "2.1.218", sessionId: "session-a", turnId: null, toolUseId: "tool-a", agentId: null },
      candidates: [{ operation: "update", path: "item.ts", addedLines: ["export interface Item { value: number }"] }],
    });
    expect(decodeResidentRequest(JSON.stringify({
      version: 1, operation: "admit", lifetime: "lifetime", observation, controlledWriter: true,
      dispatch: { statePath: "/tmp/state", userConfigPath: null, credential: null, controlled: null },
    }))?.operation).toBe("admit");
    expect(await Effect.runPromise(adaptClaudeDirectEvent({ ...event, tool_use_id: "" }))).toBeUndefined();
    expect(await Effect.runPromise(adaptClaudeDirectEvent({ ...event, turn_id: "invented" }))).toBeUndefined();
  });

  it("accepts a completed Write and rejects mismatched or failed file state", async () => {
    const root = await makeGitFixture();
    const path = join(root, "item.ts");
    const content = "export type Item = { value: number };\n";
    await writeFile(path, content);
    const event = {
      ...base(root, path), tool_name: "Write",
      tool_input: { file_path: path, content },
      tool_response: { filePath: path, content, originalFile: null, userModified: false },
    };
    expect((await Effect.runPromise(adaptClaudeDirectEvent(event)))?.candidates).toEqual([{
      operation: "add", path: "item.ts", addedLines: ["export type Item = { value: number };", ""],
    }]);
    expect(await Effect.runPromise(adaptClaudeDirectEvent({
      ...event, tool_response: { ...event.tool_response, userModified: true },
    }))).toBeUndefined();
    await writeFile(path, "different");
    expect(await Effect.runPromise(adaptClaudeDirectEvent(event))).toBeUndefined();
  });

  it("rejects outside, symlink, and oversized source before an adapter read", async () => {
    const root = await makeGitFixture();
    const other = await makeGitFixture();
    const outside = join(other, "other.ts");
    const content = "export type Item = string;\n";
    await writeFile(outside, content);
    const eventFor = (path: string, text = content) => ({
      ...base(root, path), tool_name: "Write",
      tool_input: { file_path: path, content: text },
      tool_response: { filePath: path, content: text, originalFile: null, userModified: false },
    });
    expect(await Effect.runPromise(adaptClaudeDirectEvent(eventFor(outside)))).toBeUndefined();
    const linked = join(root, "linked.ts");
    await symlink(outside, linked);
    expect(await Effect.runPromise(adaptClaudeDirectEvent(eventFor(linked)))).toBeUndefined();
    const oversized = join(root, "oversized.ts");
    const large = `export type Huge = "${"x".repeat(32_768)}";\n`;
    await writeFile(oversized, large);
    expect(await Effect.runPromise(adaptClaudeDirectEvent(eventFor(oversized, large)))).toBeUndefined();
    expect(await Effect.runPromise(adaptClaudeDirectEvent(eventFor(oversized, content)))).toBeUndefined();
  });

  it("rejects replace-all expansion beyond the source bound", async () => {
    const root = await makeGitFixture();
    const path = join(root, "item.ts");
    await writeFile(path, "updated");
    const event = base(root, path);
    expect(await Effect.runPromise(adaptClaudeDirectEvent({
      ...event,
      tool_input: { file_path: path, old_string: "x", new_string: "z".repeat(1_000), replace_all: true },
      tool_response: {
        filePath: path, oldString: "x", newString: "z".repeat(1_000),
        originalFile: "x".repeat(1_000), replaceAll: true, userModified: false,
      },
    }))).toBeUndefined();
  });
});
