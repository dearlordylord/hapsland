import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adaptCodexAdd, MAX_CODEX_CANDIDATES, MAX_CODEX_COMMAND_BYTES } from "./adapter.ts";
import { addEvent, makeGitFixture } from "./test-fixtures.ts";

describe("direct-event Codex Add adapter", () => {
  it("preserves the selected 0.156.0 host identity", async () => {
    const root = await makeGitFixture();
    const result = await Effect.runPromise(adaptCodexAdd(addEvent(root), "0.156.0"));
    expect(result?.recipient.hostVersion).toBe("0.156.0");
  });
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

  it("normalizes an absolute patch path through the event cwd alias", async () => {
    const root = await makeGitFixture();
    const aliasParent = await mkdtemp(join(tmpdir(), "direct-event-alias-"));
    const alias = join(aliasParent, "checkout");
    await symlink(root, alias);
    try {
      const result = await Effect.runPromise(adaptCodexAdd(addEvent(alias, ["ignored.ts"], {
        tool_input: {
          command: `*** Begin Patch\n*** Add File: ${join(alias, "installed.ts")}\n+export interface Installed { id: string }\n*** End Patch`,
        },
      })));
      expect(result?.root).toBe(root);
      expect(result?.candidates).toEqual([{
        operation: "add",
        path: "installed.ts",
        addedLines: ["export interface Installed { id: string }"],
      }]);
    } finally {
      await rm(aliasParent, { recursive: true, force: true });
    }
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

  it("accepts one trailing newline after the native patch terminator", async () => {
    const root = await makeGitFixture();
    const command = "*** Begin Patch\n*** Add File: trailing.ts\n+type Trailing = string\n*** End Patch\n";
    const result = await Effect.runPromise(adaptCodexAdd(addEvent(root, ["ignored.ts"], {
      tool_input: { command },
    })));
    expect(result?.candidates).toEqual([
      { operation: "add", path: "trailing.ts", addedLines: ["type Trailing = string"] },
    ]);
    expect(await Effect.runPromise(adaptCodexAdd(addEvent(root, ["ignored.ts"], {
      tool_input: { command: `${command}\n` },
    })))).toBeUndefined();
  });

  it("quietly rejects missing identity, failure, and bounds", async () => {
    const root = await makeGitFixture();
    const cases = [
      addEvent(root, ["a.ts"], { session_id: "" }),
      addEvent(root, ["a.ts"], { tool_response: { success: false } }),
      addEvent(root, Array.from({ length: MAX_CODEX_CANDIDATES + 1 }, (_, index) => `${index}.ts`)),
      addEvent(root, ["a.ts"], { tool_input: { command: `*** Begin Patch\n*** Add File: a.ts\n+${"x".repeat(MAX_CODEX_COMMAND_BYTES)}\n*** End Patch` } }),
    ];
    for (const value of cases) expect(await Effect.runPromise(adaptCodexAdd(value))).toBeUndefined();
  });

  it.each([
    ["unknown control", "*** Begin Patch\n*** Frobnicate File: a.ts\n+x\n*** End Patch"],
    ["malformed header", "*** Begin Patch\n*** Add File:\n+x\n*** End Patch"],
    ["unmarked body", "*** Begin Patch\n*** Add File: a.ts\ntype A = number\n*** End Patch"],
    ["nested begin", "*** Begin Patch\n*** Add File: a.ts\n*** Begin Patch\n*** End Patch"],
    ["duplicate path", "*** Begin Patch\n*** Add File: a.ts\n+x\n*** Add File: a.ts\n+y\n*** End Patch"],
    ["rename", "*** Begin Patch\n*** Rename File: a.ts\n+x\n*** End Patch"],
    ["early end", "*** Begin Patch\n*** Add File: a.ts\n+x\n*** End Patch\n+y\n*** End Patch"],
  ])("rejects strict Add grammar violation: %s", async (_label, command) => {
    const root = await makeGitFixture();
    expect(await Effect.runPromise(adaptCodexAdd(addEvent(root, ["a.ts"], {
      tool_input: { command },
    })))).toBeUndefined();
  });

  it("adapts Add, Update, Delete and move sections independently", async () => {
    const root = await makeGitFixture();
    const command = [
      "*** Begin Patch",
      "*** Add File: add.ts",
      "+type Add = number",
      "*** Update File: update.ts",
      "@@",
      "-type Update = string",
      "+type Update = number",
      "*** Delete File: delete.ts",
      "*** Update File: old.ts",
      "*** Move to: new.ts",
      "*** End Patch",
    ].join("\n");
    const result = await Effect.runPromise(adaptCodexAdd(addEvent(root, ["ignored.ts"], {
      tool_input: { command },
    })));
    expect(result?.candidates).toEqual([
      { operation: "add", path: "add.ts", addedLines: ["type Add = number"] },
      { operation: "update", path: "update.ts", addedLines: ["type Update = number"] },
      { operation: "delete", path: "delete.ts", addedLines: [] },
      { operation: "move", path: "old.ts", addedLines: [] },
    ]);
  });

  it("consumes an ordinary move body while retaining an independent Add", async () => {
    const root = await makeGitFixture();
    const command = [
      "*** Begin Patch",
      "*** Update File: old.ts",
      "*** Move to: new.ts",
      "@@",
      "-type Old = string",
      "+type Old = number",
      " unchanged",
      "*** Add File: good.ts",
      "+type Good = number",
      "*** End Patch",
    ].join("\n");
    const result = await Effect.runPromise(adaptCodexAdd(addEvent(root, ["ignored.ts"], {
      tool_input: { command },
    })));
    expect(result?.candidates).toEqual([
      { operation: "move", path: "old.ts", addedLines: [] },
      { operation: "add", path: "good.ts", addedLines: ["type Good = number"] },
    ]);
  });

  it("accepts exactly 64 KiB and rejects one byte above", async () => {
    const root = await makeGitFixture();
    const prefix = "*** Begin Patch\n*** Add File: a.ts\n+";
    const suffix = "\n*** End Patch";
    const atLimit = `${prefix}${"x".repeat(MAX_CODEX_COMMAND_BYTES - Buffer.byteLength(prefix + suffix))}${suffix}`;
    expect(Buffer.byteLength(atLimit)).toBe(MAX_CODEX_COMMAND_BYTES);
    expect(await Effect.runPromise(adaptCodexAdd(addEvent(root, ["a.ts"], {
      tool_input: { command: atLimit },
    })))).toBeDefined();
    expect(await Effect.runPromise(adaptCodexAdd(addEvent(root, ["a.ts"], {
      tool_input: { command: `${atLimit}x` },
    })))).toBeUndefined();
  });

  it("accepts exactly sixteen named candidates", async () => {
    const root = await makeGitFixture();
    const paths = Array.from({ length: MAX_CODEX_CANDIDATES }, (_, index) => `${index}.ts`);
    expect((await Effect.runPromise(adaptCodexAdd(addEvent(root, paths))))?.candidates).toHaveLength(16);
  });
});
