import { configuredRules } from "@hapsland/build-tooling/test-support/default-rules"
import { describe, expect, it } from "vitest"
import * as Effect from "effect/Effect"
import { mkdtemp, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { adaptClaudeDirectEvent } from "@hapsland/native-observation/direct-event/adapter"
import { makeReviewGitFixture as makeGitFixture } from "@hapsland/build-tooling/test-support/test-fixtures"
import { decodeResidentRequest } from "@hapsland/resident-transport/resident/protocol"
import { MAX_SOURCE_BYTES } from "@hapsland/native-observation/direct-event/capture"
import { prepareObservation } from "@hapsland/review-execution/direct-event/pipeline"
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "@hapsland/review-definition/runtime/review-config"

const base = (root: string, path: string) => ({
  hook_event_name: "PostToolUse",
  cwd: root,
  session_id: "session-a",
  tool_use_id: "tool-a",
  tool_name: "Edit",
  tool_input: { file_path: path, old_string: "value: string", new_string: "value: number", replace_all: false },
  tool_response: {
    filePath: path,
    oldString: "value: string",
    newString: "value: number",
    originalFile: "export interface Item { value: string }\n",
    replaceAll: false,
    userModified: false
  }
})

describe("Claude Code 2.1.218 direct adapter", () => {
  it("discovers an edited target in another Git working copy independently of cwd", async () => {
    const cwd = await makeGitFixture()
    const targetRoot = await makeGitFixture()
    const path = join(targetRoot, "types.ts")
    await writeFile(path, "export interface Item { value: number }\n")
    expect(await Effect.runPromise(adaptClaudeDirectEvent(base(cwd, path)))).toMatchObject({
      root: targetRoot,
      candidates: [{ path: "types.ts", operation: "update" }]
    })
  })
  it("reviews only the declaration changed by a verified Edit", async () => {
    const root = await makeGitFixture()
    const path = join(root, "types.ts")
    const original = "interface A { value: string }\ninterface B { count: string }\n"
    const expected = "interface A { value: string }\ninterface B { count: number }\n"
    await writeFile(path, expected)
    const event = {
      ...base(root, path),
      tool_input: { file_path: path, old_string: "count: string", new_string: "count: number", replace_all: false },
      tool_response: {
        filePath: path,
        oldString: "count: string",
        newString: "count: number",
        originalFile: original,
        replaceAll: false,
        userModified: false
      }
    }
    const observation = await Effect.runPromise(adaptClaudeDirectEvent(event))
    expect(observation?.verifiedPostEditHunks?.hunks).toHaveLength(1)
    if (observation === undefined) throw new Error("fixture observation missing")
    const prepared = await Effect.runPromise(
      prepareObservation(observation, {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules: configuredRules
      })
    )
    expect(
      prepared.outcomes
        .filter((item) => item.status === "ready")
        .map((item) => (item.status === "ready" ? item.prepared.input.declaration.name : ""))
    ).toEqual(["B"])
  })
  it.each(["Edit", "Write"])("attributes a %s Update when its replacement line already exists", async (toolName) => {
    const root = await makeGitFixture()
    const path = join(root, "types.ts")
    const original = "interface A {\n  value: string\n}\ninterface B {\n  value: number\n}\n"
    const expected = "interface A {\n  value: number\n}\ninterface B {\n  value: number\n}\n"
    await writeFile(path, expected)
    const event =
      toolName === "Edit"
        ? {
            ...base(root, path),
            tool_input: {
              file_path: path,
              old_string: "value: string",
              new_string: "value: number",
              replace_all: false
            },
            tool_response: {
              filePath: path,
              oldString: "value: string",
              newString: "value: number",
              originalFile: original,
              replaceAll: false,
              userModified: false
            }
          }
        : {
            ...base(root, path),
            tool_name: "Write",
            tool_input: { file_path: path, content: expected },
            tool_response: { filePath: path, content: expected, originalFile: original, userModified: false }
          }
    const observation = await Effect.runPromise(adaptClaudeDirectEvent(event))
    expect(observation?.candidates[0]?.addedLines).toEqual([])
    expect(observation?.verifiedPostEditHunks?.hunks).toHaveLength(1)
    if (observation === undefined) throw new Error("fixture observation missing")
    const prepared = await Effect.runPromise(
      prepareObservation(observation, {
        controlledWriter: true,
        advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
        rules: configuredRules
      })
    )
    expect(
      prepared.outcomes
        .filter((item) => item.status === "ready")
        .map((item) => (item.status === "ready" ? item.prepared.input.declaration.name : ""))
    ).toEqual(["A"])
  })
  it("bounds replace_all attribution before materializing frequent-token hunks", async () => {
    const root = await makeGitFixture()
    const path = join(root, "many.ts")
    const original = "a".repeat(65)
    await writeFile(path, "b".repeat(65))
    const event = {
      ...base(root, path),
      tool_input: { file_path: path, old_string: "a", new_string: "b", replace_all: true },
      tool_response: {
        filePath: path,
        oldString: "a",
        newString: "b",
        originalFile: original,
        replaceAll: true,
        userModified: false
      }
    }
    expect(await Effect.runPromise(adaptClaudeDirectEvent(event))).toBeUndefined()
    await writeFile(path, "b".repeat(64))
    const accepted = { ...event, tool_response: { ...event.tool_response, originalFile: "a".repeat(64) } }
    expect((await Effect.runPromise(adaptClaudeDirectEvent(accepted)))?.verifiedPostEditHunks?.hunks).toHaveLength(64)
  })
  it("selects configured files before the first source read", async () => {
    const root = await makeGitFixture()
    await writeFile(join(root, ".hapsland.jsonc"), '{"version":1,"excludes":["excluded.ts"]}\n')
    const userConfigPath = join(root, "user-selection.jsonc")
    await writeFile(userConfigPath, '{"version":1,"excludes":["user-excluded.ts"]}\n')
    await writeFile(join(root, ".gitignore"), "ignored.ts\n")
    const reads: string[] = []
    const options = {
      userConfigPath,
      captureHooks: {
        sourceRead: (path: string) => {
          reads.push(path)
        }
      }
    }
    const eventFor = async (name: string) => {
      const path = join(root, name)
      const content = "export type Item = string;\n"
      await writeFile(path, content)
      return {
        ...base(root, path),
        tool_name: "Write",
        tool_input: { file_path: path, content },
        tool_response: { filePath: path, content, originalFile: null, userModified: false }
      }
    }
    for (const name of ["excluded.ts", "user-excluded.ts", ".env.local", "ignored.ts"]) {
      expect(await Effect.runPromise(adaptClaudeDirectEvent(await eventFor(name), options))).toBeUndefined()
      expect(reads, name).toEqual([])
    }
    expect(
      (await Effect.runPromise(adaptClaudeDirectEvent(await eventFor("allowed.ts"), options)))?.candidates
    ).toMatchObject([{ path: "allowed.ts" }])
    expect(reads).toEqual(["allowed.ts", "allowed.ts"])
  })

  it("attributes a completed Edit to the exact tool call and carries the changed line", async () => {
    const root = await makeGitFixture()
    const path = join(root, "item.ts")
    await writeFile(path, "export interface Item { value: number }\n")
    const event = base(root, path)
    const observation = await Effect.runPromise(adaptClaudeDirectEvent(event))
    expect(observation).toMatchObject({
      root,
      advicee: {
        host: "claude-code",
        hostVersion: "2.1.218",
        sessionId: "session-a",
        turnId: null,
        toolUseId: "tool-a",
        subagentId: null
      },
      candidates: [{ operation: "update", path: "item.ts", addedLines: ["export interface Item { value: number }"] }]
    })
    const admission = {
      requestRoute: "shared",
      operation: "admit",
      lifetime: "lifetime",
      observation,
      controlledWriter: true,
      dispatch: { statePath: "/tmp/state", userConfigPath: null, credential: null, controlled: null }
    }
    expect(decodeResidentRequest(JSON.stringify({ ...admission, composed: true }))?.operation).toBe("admit")
    expect(decodeResidentRequest(JSON.stringify(admission))).toBeUndefined()
    expect(await Effect.runPromise(adaptClaudeDirectEvent({ ...event, tool_use_id: "" }))).toBeUndefined()
    expect(await Effect.runPromise(adaptClaudeDirectEvent({ ...event, turn_id: "invented" }))).toBeUndefined()
  })

  it("accepts a completed Write and rejects mismatched or failed file state", async () => {
    const root = await makeGitFixture()
    const path = join(root, "item.ts")
    const content = "export type Item = { value: number };\n"
    await writeFile(path, content)
    const event = {
      ...base(root, path),
      tool_name: "Write",
      tool_input: { file_path: path, content },
      tool_response: { filePath: path, content, originalFile: null, userModified: false }
    }
    expect((await Effect.runPromise(adaptClaudeDirectEvent(event)))?.candidates).toEqual([
      { operation: "add", path: "item.ts", addedLines: ["export type Item = { value: number };", ""] }
    ])
    expect(
      await Effect.runPromise(
        adaptClaudeDirectEvent({ ...event, tool_response: { ...event.tool_response, userModified: true } })
      )
    ).toBeUndefined()
    await writeFile(path, "different")
    expect(await Effect.runPromise(adaptClaudeDirectEvent(event))).toBeUndefined()
  })

  it("rejects targets outside Git, symlink, and oversized source before an adapter read", async () => {
    const root = await makeGitFixture()
    const other = await mkdtemp(join(tmpdir(), "haps-outside-"))
    const outside = join(other, "other.ts")
    const content = "export type Item = string;\n"
    await writeFile(outside, content)
    const eventFor = (path: string, text = content) => ({
      ...base(root, path),
      tool_name: "Write",
      tool_input: { file_path: path, content: text },
      tool_response: { filePath: path, content: text, originalFile: null, userModified: false }
    })
    expect(await Effect.runPromise(adaptClaudeDirectEvent(eventFor(outside)))).toBeUndefined()
    const linked = join(root, "linked.ts")
    await symlink(outside, linked)
    expect(await Effect.runPromise(adaptClaudeDirectEvent(eventFor(linked)))).toBeUndefined()
    const oversized = join(root, "oversized.ts")
    const large = `export type Huge = "${"x".repeat(MAX_SOURCE_BYTES)}";\n`
    await writeFile(oversized, large)
    expect(await Effect.runPromise(adaptClaudeDirectEvent(eventFor(oversized, large)))).toBeUndefined()
    expect(await Effect.runPromise(adaptClaudeDirectEvent(eventFor(oversized, content)))).toBeUndefined()
  })

  it("rejects replace-all expansion beyond the source bound", async () => {
    const root = await makeGitFixture()
    const path = join(root, "item.ts")
    await writeFile(path, "updated")
    const event = base(root, path)
    expect(
      await Effect.runPromise(
        adaptClaudeDirectEvent({
          ...event,
          tool_input: { file_path: path, old_string: "x", new_string: "z".repeat(1_000), replace_all: true },
          tool_response: {
            filePath: path,
            oldString: "x",
            newString: "z".repeat(1_000),
            originalFile: "x".repeat(1_000),
            replaceAll: true,
            userModified: false
          }
        })
      )
    ).toBeUndefined()
  })
})
