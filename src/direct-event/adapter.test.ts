import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { adaptCodexAdd, MAX_CODEX_CANDIDATES, MAX_CODEX_COMMAND_BYTES } from "./adapter.ts";
import { addEvent, makeGitFixture } from "./test-fixtures.ts";

describe("direct-event Codex Add adapter", () => {
  it("preserves the complete explicit recipient and canonical Git root", async () => {
    const root = await makeGitFixture();
    const event = addEvent(root, ["a.ts"], { agent_id: "child" });
    const result = await Effect.runPromise(adaptCodexAdd(event));
    expect(result).toMatchObject({
      root,
      recipient: {
        host: "codex-cli",
        hostVersion: "0.155.1",
        sessionId: "session",
        turnId: "turn",
        toolUseId: "tool-use",
        agentId: "child",
      },
      candidates: [{ operation: "add", path: "a.ts" }],
    });
    const parent = await Effect.runPromise(adaptCodexAdd(addEvent(root)));
    expect(parent?.recipient.agentId).toBeNull();
  });

  it("adapts the pinned Codex 0.155.1 native event fixture", async () => {
    const root = await makeGitFixture();
    const encoded = await readFile(
      join(process.cwd(), "evidence/codex/0.155.1/post-tool-use-file-create.json"),
      "utf8",
    );
    const fixture = JSON.parse(encoded) as Record<string, unknown>;
    const native = {
      ...fixture,
      cwd: root,
      session_id: "pinned-session",
      turn_id: "pinned-turn",
      tool_use_id: "pinned-tool",
      tool_input: {
        command: "*** Begin Patch\n*** Add File: pinned.ts\n+type Pinned = number\n*** End Patch",
      },
    };
    expect(await Effect.runPromise(adaptCodexAdd(native))).toMatchObject({
      root,
      recipient: {
        sessionId: "pinned-session",
        turnId: "pinned-turn",
        toolUseId: "pinned-tool",
        agentId: null,
      },
      candidates: [{ operation: "add", path: "pinned.ts" }],
    });
  });

  it("quietly rejects missing identity, failure, unsupported operations, and bounds", async () => {
    const root = await makeGitFixture();
    const cases = [
      addEvent(root, ["a.ts"], { session_id: "" }),
      addEvent(root, ["a.ts"], { tool_response: { success: false } }),
      addEvent(root, ["a.ts"], { tool_input: { command: "*** Begin Patch\n*** Update File: a.ts\n+x\n*** End Patch" } }),
      addEvent(root, Array.from({ length: MAX_CODEX_CANDIDATES + 1 }, (_, index) => `${index}.ts`)),
      addEvent(root, ["a.ts"], { tool_input: { command: `*** Begin Patch\n*** Add File: a.ts\n+${"x".repeat(MAX_CODEX_COMMAND_BYTES)}\n*** End Patch` } }),
    ];
    for (const value of cases) expect(await Effect.runPromise(adaptCodexAdd(value))).toBeUndefined();
  });
});
