import { describe, expect, it } from "vitest"
import * as Effect from "effect/Effect"
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  adaptCodexDirectEvent,
  adaptComposedHookIdentity,
  MAX_CODEX_CANDIDATES,
  MAX_CODEX_COMMAND_BYTES
} from "@hapsland/native-observation/direct-event/adapter"
import { addEvent, makeGitFixture, put } from "@hapsland/build-tooling/test-support/test-fixtures"

describe("direct-event Codex Add adapter", () => {
  it("uses an explicit native directory for relative targets at both edit boundaries", async () => {
    const caller = await makeGitFixture()
    const target = await makeGitFixture()
    await put(target, "type.ts", "type OrderCount = number\n")
    const ordinary = addEvent(caller)
    const event = { ...ordinary, tool_input: { ...ordinary.tool_input, workdir: target } }
    expect(await Effect.runPromise(adaptCodexDirectEvent(event))).toMatchObject({
      root: target,
      candidates: [{ operation: "add", path: "type.ts" }]
    })
    expect(
      await Effect.runPromise(
        adaptComposedHookIdentity({ ...event, hook_event_name: "PreToolUse" }, "codex-cli", "PreToolUse")
      )
    ).toMatchObject({ editRoots: [target] })
    expect(
      await Effect.runPromise(adaptCodexDirectEvent({ ...event, tool_input: { ...event.tool_input, cwd: caller } }))
    ).toBeUndefined()
    expect(
      await Effect.runPromise(
        adaptComposedHookIdentity(
          { ...event, hook_event_name: "PreToolUse", tool_input: { ...event.tool_input, cwd: caller } },
          "codex-cli",
          "PreToolUse"
        )
      )
    ).toBeUndefined()
    expect(
      await Effect.runPromise(
        adaptComposedHookIdentity(
          {
            hook_event_name: "PreToolUse",
            tool_name: "Write",
            cwd: target,
            session_id: "claude",
            tool_use_id: "write",
            tool_input: { file_path: join(target, "type.ts") }
          },
          "claude-code",
          "PreToolUse"
        )
      )
    ).toMatchObject({ root: target, advicee: { host: "claude-code", sessionId: "claude" }, editRoots: [target] })
  })
  it("maps background and Stop identities for both hosts without inferring a child", async () => {
    const root = await makeGitFixture()
    const codex = await Effect.runPromise(
      adaptComposedHookIdentity(
        { hook_event_name: "Stop", cwd: root, session_id: "codex", turn_id: "turn" },
        "codex-cli",
        "Stop"
      )
    )
    expect(codex).toMatchObject({ root, advicee: { host: "codex-cli", sessionId: "codex", subagentId: null } })
    const claude = await Effect.runPromise(
      adaptComposedHookIdentity(
        {
          hook_event_name: "PostToolUse",
          tool_name: "Write",
          cwd: root,
          session_id: "claude",
          tool_use_id: "tool",
          agent_id: "child"
        },
        "claude-code",
        "PostToolUse",
        undefined,
        "2.1.293"
      )
    )
    expect(claude).toMatchObject({
      root,
      advicee: {
        host: "claude-code",
        hostVersion: "2.1.293",
        sessionId: "claude",
        toolUseId: "tool",
        subagentId: "child"
      }
    })
    expect(
      await Effect.runPromise(
        adaptComposedHookIdentity(
          {
            hook_event_name: "PostToolUse",
            tool_name: "Write",
            cwd: root,
            session_id: "claude",
            tool_use_id: "tool",
            agent_id: ""
          },
          "claude-code",
          "PostToolUse"
        )
      )
    ).toBeUndefined()
    for (const host of ["codex-cli", "claude-code"] as const) {
      const edit = {
        hook_event_name: "PostToolUse",
        tool_name: host === "codex-cli" ? "apply_patch" : "Write",
        cwd: root,
        session_id: "session",
        tool_use_id: "tool",
        agent_type: "child"
      }
      expect(await Effect.runPromise(adaptComposedHookIdentity(edit, host, "PostToolUse"))).toBeUndefined()
      expect(
        await Effect.runPromise(
          adaptComposedHookIdentity({ ...edit, hook_event_name: "PreToolUse" }, host, "PreToolUse")
        )
      ).toBeUndefined()
      expect(
        await Effect.runPromise(adaptComposedHookIdentity({ ...edit, hook_event_name: "Stop" }, host, "Stop"))
      ).toBeUndefined()
    }
  })
  it("uses Codex Bash only as a background delivery opportunity", async () => {
    const root = await makeGitFixture()
    const event = {
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      cwd: root,
      session_id: "codex",
      turn_id: "turn",
      tool_use_id: "check"
    }
    expect(await Effect.runPromise(adaptComposedHookIdentity(event, "codex-cli", "PostToolUse"))).toMatchObject({
      root,
      advicee: { host: "codex-cli", sessionId: "codex", toolUseId: "check" }
    })
    expect(
      await Effect.runPromise(
        adaptComposedHookIdentity({ ...event, hook_event_name: "PreToolUse" }, "codex-cli", "PreToolUse")
      )
    ).toBeUndefined()
    expect(await Effect.runPromise(adaptCodexDirectEvent(event))).toBeUndefined()
    expect(await Effect.runPromise(adaptComposedHookIdentity(event, "claude-code", "PostToolUse"))).toBeUndefined()
  })
  it("requires an explicit child identity on SubagentStop for both hosts", async () => {
    const root = await makeGitFixture()
    for (const host of ["codex-cli", "claude-code"] as const) {
      const event = { hook_event_name: "SubagentStop", cwd: root, session_id: "session", turn_id: "turn" }
      expect(await Effect.runPromise(adaptComposedHookIdentity(event, host, "SubagentStop"))).toBeUndefined()
      expect(
        await Effect.runPromise(adaptComposedHookIdentity({ ...event, agent_id: "" }, host, "SubagentStop"))
      ).toBeUndefined()
      expect(
        await Effect.runPromise(adaptComposedHookIdentity({ ...event, agent_id: "child" }, host, "SubagentStop"))
      ).toMatchObject({ root, advicee: { host, sessionId: "session", subagentId: "child" } })
      expect(
        await Effect.runPromise(adaptComposedHookIdentity({ ...event, agent_id: "child" }, host, "Stop"))
      ).toBeUndefined()
    }
  })
  it.each(["0.156.0", "0.160.0", "0.161.0"])("preserves the selected %s host identity", async (version) => {
    const root = await makeGitFixture()
    const result = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root), version))
    expect(result?.advicee.hostVersion).toBe(version)
  })
  it("preserves the complete explicit advicee and canonical Git root", async () => {
    const root = await makeGitFixture()
    const event = addEvent(root, ["a.ts"], { agent_id: "child" })
    const result = await Effect.runPromise(adaptCodexDirectEvent(event))
    expect(result).toMatchObject({
      root,
      advicee: {
        host: "codex-cli",
        hostVersion: "0.155.1",
        sessionId: "session",
        turnId: "turn",
        toolUseId: "tool-use",
        subagentId: "child"
      },
      candidates: [{ operation: "add", path: "a.ts" }]
    })
    const parent = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    expect(parent?.advicee.subagentId).toBeNull()
  })

  it("normalizes an absolute patch path through the event cwd alias", async () => {
    const root = await makeGitFixture()
    const aliasParent = await mkdtemp(join(tmpdir(), "direct-event-alias-"))
    const alias = join(aliasParent, "checkout")
    await symlink(root, alias)
    try {
      const result = await Effect.runPromise(
        adaptCodexDirectEvent(
          addEvent(alias, ["ignored.ts"], {
            tool_input: {
              command: `*** Begin Patch\n*** Add File: ${join(alias, "installed.ts")}\n+export interface Installed { id: string }\n*** End Patch`
            }
          })
        )
      )
      expect(result?.root).toBe(root)
      expect(result?.candidates).toEqual([
        { operation: "add", path: "installed.ts", addedLines: ["export interface Installed { id: string }"] }
      ])
    } finally {
      await rm(aliasParent, { recursive: true, force: true })
    }
  })

  it("adapts the pinned Codex 0.155.1 native event fixture", async () => {
    const root = await makeGitFixture()
    const encoded = await readFile(
      new URL("../test-support/fixtures/codex/0.155.1/post-tool-use-file-create.json", import.meta.url),
      "utf8"
    )
    const fixture = JSON.parse(encoded) as Record<string, unknown>
    const native = {
      ...fixture,
      cwd: root,
      session_id: "pinned-session",
      turn_id: "pinned-turn",
      tool_use_id: "pinned-tool",
      tool_input: { command: "*** Begin Patch\n*** Add File: pinned.ts\n+type Pinned = number\n*** End Patch" }
    }
    expect(await Effect.runPromise(adaptCodexDirectEvent(native))).toMatchObject({
      root,
      advicee: { sessionId: "pinned-session", turnId: "pinned-turn", toolUseId: "pinned-tool", subagentId: null },
      candidates: [{ operation: "add", path: "pinned.ts" }]
    })
  })

  it("accepts one trailing newline after the native patch terminator", async () => {
    const root = await makeGitFixture()
    const command = "*** Begin Patch\n*** Add File: trailing.ts\n+type Trailing = string\n*** End Patch\n"
    const result = await Effect.runPromise(
      adaptCodexDirectEvent(addEvent(root, ["ignored.ts"], { tool_input: { command } }))
    )
    expect(result?.candidates).toEqual([
      { operation: "add", path: "trailing.ts", addedLines: ["type Trailing = string"] }
    ])
    expect(
      await Effect.runPromise(
        adaptCodexDirectEvent(addEvent(root, ["ignored.ts"], { tool_input: { command: `${command}\n` } }))
      )
    ).toBeUndefined()
  })

  it("quietly rejects missing identity, failure, and bounds", async () => {
    const root = await makeGitFixture()
    const cases = [
      addEvent(root, ["a.ts"], { session_id: "" }),
      addEvent(root, ["a.ts"], { tool_response: { success: false } }),
      addEvent(root, ["../outside.ts"]),
      addEvent(
        root,
        Array.from({ length: MAX_CODEX_CANDIDATES + 1 }, (_, index) => `${index}.ts`)
      ),
      addEvent(root, ["a.ts"], {
        tool_input: {
          command: `*** Begin Patch\n*** Add File: a.ts\n+${"x".repeat(MAX_CODEX_COMMAND_BYTES)}\n*** End Patch`
        }
      })
    ]
    for (const value of cases) expect(await Effect.runPromise(adaptCodexDirectEvent(value))).toBeUndefined()
  })

  it("rejects NUL-bearing target paths before root discovery", async () => {
    const root = await makeGitFixture()
    expect(await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["unsafe\0.ts"])))).toBeUndefined()
  })

  it.each([
    ["unknown control", "*** Begin Patch\n*** Frobnicate File: a.ts\n+x\n*** End Patch"],
    ["malformed header", "*** Begin Patch\n*** Add File:\n+x\n*** End Patch"],
    ["unmarked body", "*** Begin Patch\n*** Add File: a.ts\ntype A = number\n*** End Patch"],
    ["nested begin", "*** Begin Patch\n*** Add File: a.ts\n*** Begin Patch\n*** End Patch"],
    ["duplicate path", "*** Begin Patch\n*** Add File: a.ts\n+x\n*** Add File: a.ts\n+y\n*** End Patch"],
    ["rename", "*** Begin Patch\n*** Rename File: a.ts\n+x\n*** End Patch"],
    ["early end", "*** Begin Patch\n*** Add File: a.ts\n+x\n*** End Patch\n+y\n*** End Patch"]
  ])("rejects strict Add grammar violation: %s", async (_label, command) => {
    const root = await makeGitFixture()
    expect(
      await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts"], { tool_input: { command } })))
    ).toBeUndefined()
  })

  it("adapts Add, Update, Delete and move sections independently", async () => {
    const root = await makeGitFixture()
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
      "*** End Patch"
    ].join("\n")
    const result = await Effect.runPromise(
      adaptCodexDirectEvent(addEvent(root, ["ignored.ts"], { tool_input: { command } }))
    )
    expect(result?.candidates).toEqual([
      { operation: "add", path: "add.ts", addedLines: ["type Add = number"] },
      { operation: "update", path: "update.ts", addedLines: ["type Update = number"] },
      { operation: "delete", path: "delete.ts", addedLines: [] },
      { operation: "move", path: "old.ts", addedLines: [], moveTo: "new.ts" }
    ])
  })

  it("consumes an ordinary move body while retaining an independent Add", async () => {
    const root = await makeGitFixture()
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
      "*** End Patch"
    ].join("\n")
    const result = await Effect.runPromise(
      adaptCodexDirectEvent(addEvent(root, ["ignored.ts"], { tool_input: { command } }))
    )
    expect(result?.candidates).toEqual([
      { operation: "move", path: "old.ts", addedLines: [], moveTo: "new.ts" },
      { operation: "add", path: "good.ts", addedLines: ["type Good = number"] }
    ])
  })

  it("accepts exactly 64 KiB and rejects one byte above", async () => {
    const root = await makeGitFixture()
    const prefix = "*** Begin Patch\n*** Add File: a.ts\n+"
    const suffix = "\n*** End Patch"
    const atLimit = `${prefix}${"x".repeat(MAX_CODEX_COMMAND_BYTES - Buffer.byteLength(prefix + suffix))}${suffix}`
    expect(Buffer.byteLength(atLimit)).toBe(MAX_CODEX_COMMAND_BYTES)
    expect(
      await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["a.ts"], { tool_input: { command: atLimit } })))
    ).toBeDefined()
    expect(
      await Effect.runPromise(
        adaptCodexDirectEvent(addEvent(root, ["a.ts"], { tool_input: { command: `${atLimit}x` } }))
      )
    ).toBeUndefined()
  })

  it("accepts exactly sixteen named candidates", async () => {
    const root = await makeGitFixture()
    const paths = Array.from({ length: MAX_CODEX_CANDIDATES }, (_, index) => `${index}.ts`)
    expect((await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, paths))))?.candidates).toHaveLength(16)
  })
})
