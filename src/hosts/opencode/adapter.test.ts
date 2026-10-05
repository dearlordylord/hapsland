import { execFileSync } from "../../../scripts/test-harness/process.mjs"
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as Effect from "effect/Effect"
import { afterEach, describe, expect, it } from "vitest"
import { adaptOpenCodeDirectEvent } from "./adapter.ts"
import { MAX_SOURCE_BYTES } from "../../direct-event/capture.ts"

const dirs: string[] = []
const fixture = () => {
  const cwd = mkdtempSync(join(tmpdir(), "hapsland-opencode-adapter-"))
  dirs.push(cwd)
  execFileSync("git", ["init", "-q", cwd])
  mkdirSync(join(cwd, "src"))
  return cwd
}
const adapt = (value: unknown) => Effect.runPromise(adaptOpenCodeDirectEvent(value))
const event = (cwd: string, tool: string, args: unknown, metadata: unknown) => ({
  cwd,
  input: { tool, args, sessionID: "ses-1", callID: "call-1" },
  output: { title: "Edited file", output: "Applied", attachments: [], metadata }
})
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("OpenCode 1.14.44 direct event adaptation", () => {
  it("selects a direct edit with tool-call advicee and current file evidence", async () => {
    const cwd = fixture()
    writeFileSync(join(cwd, "src", "item.ts"), "export interface Item { value: number }\n")
    const result = await adapt(
      event(
        cwd,
        "edit",
        {
          filePath: "src/item.ts",
          oldString: "export interface Item { value: string }",
          newString: "export interface Item { value: number }",
          replaceAll: false
        },
        { diff: "fixture diff", truncated: false }
      )
    )
    expect(result?.advicee).toEqual({
      host: "opencode",
      hostVersion: "1.14.44",
      sessionId: "ses-1",
      turnId: null,
      toolUseId: "call-1",
      subagentId: null
    })
    expect(result?.candidates).toEqual([
      { operation: "update", path: "src/item.ts", addedLines: ["export interface Item { value: number }"] }
    ])
  })

  it("selects a successful write and rejects unsupported or unattributed events", async () => {
    const cwd = fixture()
    const content = "export type Item = { value: number };\n"
    writeFileSync(join(cwd, "src", "item.ts"), content)
    const write = event(cwd, "write", { filePath: "src/item.ts", content }, { exists: false, truncated: false })
    expect((await adapt(write))?.candidates[0]?.operation).toBe("add")
    expect(await adapt({ ...write, input: { ...write.input, tool: "bash" } })).toBeUndefined()
    expect(await adapt({ ...write, input: { ...write.input, callID: "" } })).toBeUndefined()
    expect(
      await adapt(event(cwd, "write", { filePath: "src/item.ts", content: "wrong" }, { exists: false }))
    ).toBeUndefined()
    expect(
      await adapt(event(cwd, "edit", { filePath: "../escape.ts", oldString: "x", newString: "y" }, { diff: "x" }))
    ).toBeUndefined()
  })

  it("rejects oversized and symlinked files before reading source", async () => {
    const cwd = fixture()
    const content = "export interface Item { value: number }\n"
    const outside = mkdtempSync(join(tmpdir(), "hapsland-opencode-outside-"))
    dirs.push(outside)
    writeFileSync(join(outside, "outside.ts"), content)
    symlinkSync(join(outside, "outside.ts"), join(cwd, "src", "link.ts"))
    expect(await adapt(event(cwd, "write", { filePath: "src/link.ts", content }, { exists: false }))).toBeUndefined()
    writeFileSync(join(cwd, "src", "large.ts"), "x".repeat(MAX_SOURCE_BYTES + 1))
    expect(
      await adapt(
        event(cwd, "write", { filePath: "src/large.ts", content: "x".repeat(MAX_SOURCE_BYTES + 1) }, { exists: false })
      )
    ).toBeUndefined()
    writeFileSync(join(cwd, "src", "item.ts"), content)
    expect(
      await adapt(
        event(cwd, "write", { filePath: "src/item.ts", content }, { exists: false, diff: "x".repeat(256_001) })
      )
    ).toBeUndefined()
  })

  it("rejects a file that changes between descriptor reads", async () => {
    const cwd = fixture()
    const path = join(cwd, "src", "item.ts")
    const content = "export interface Item { value: number }\n"
    writeFileSync(path, content)
    const write = event(cwd, "write", { filePath: "src/item.ts", content }, { exists: false })
    const result = await Effect.runPromise(
      adaptOpenCodeDirectEvent(write, {
        betweenReads: () =>
          Effect.sync(() => {
            writeFileSync(path, "export interface Item { value: string }\n")
          })
      })
    )
    expect(result).toBeUndefined()
  })

  it("skips existing-file Write even when unchanged roots are present", async () => {
    const cwd = fixture()
    const content = "export interface Changed { value: number }\nexport interface Unchanged { label: string }\n"
    writeFileSync(join(cwd, "src", "item.ts"), content)
    expect(await adapt(event(cwd, "write", { filePath: "src/item.ts", content }, { exists: true }))).toBeUndefined()
  })

  it("attributes only unique changed whole lines from an Edit", async () => {
    const cwd = fixture()
    const old = "export interface Changed { value: string }"
    const changed = "export interface Changed { value: number }"
    const unchanged = "export interface Unchanged { label: string }"
    writeFileSync(join(cwd, "src", "item.ts"), `${changed}\n${unchanged}\n`)
    const result = await adapt(
      event(
        cwd,
        "edit",
        {
          filePath: "src/item.ts",
          oldString: `${old}\n${unchanged}`,
          newString: `${changed}\n${unchanged}`,
          replaceAll: false
        },
        { diff: "fixture" }
      )
    )
    expect(result?.candidates[0]?.addedLines).toEqual([changed])
    writeFileSync(join(cwd, "src", "item.ts"), `${changed}\n${changed}\n${unchanged}\n`)
    expect(
      await adapt(
        event(
          cwd,
          "edit",
          { filePath: "src/item.ts", oldString: old, newString: changed, replaceAll: false },
          { diff: "fixture" }
        )
      )
    ).toBeUndefined()
  })
})

it("rejects malformed and oversized envelopes before source capture", async () => {
  const cwd = fixture()
  const content = "export type Item = number;\n"
  writeFileSync(join(cwd, "src", "item.ts"), content)
  const base = event(cwd, "write", { filePath: "src/item.ts", content }, { exists: false })
  const invalid = [
    null,
    [],
    {},
    { ...base, cwd: "" },
    { ...base, input: null },
    { ...base, output: [] },
    { ...base, input: { ...base.input, args: [] } },
    { ...base, input: { ...base.input, sessionID: "" } },
    { ...base, input: { ...base.input, args: { filePath: "", content } } },
    { ...base, input: { ...base.input, args: { filePath: "x".repeat(16_385), content } } },
    { ...base, output: { ...base.output, metadata: null } },
    { ...base, output: { ...base.output, output: "" } },
    { ...base, output: { ...base.output, title: "" } },
    { ...base, output: { ...base.output, output: "x".repeat(256_001) } },
    { ...base, output: { ...base.output, title: "x".repeat(16_385) } },
    { ...base, output: { ...base.output, isError: true } },
    { ...base, output: { ...base.output, error: true } },
    { ...base, output: { ...base.output, metadata: { exists: false, truncated: true } } },
    { ...base, output: { ...base.output, metadata: { exists: false, filediff: "x".repeat(256_001) } } },
    event(cwd, "edit", { filePath: "src/item.ts", oldString: null, newString: content }, { diff: "x" }),
    event(cwd, "edit", { filePath: "src/item.ts", oldString: "old", newString: null }, { diff: "x" }),
    event(cwd, "write", { filePath: "src/item.ts", content: null }, { exists: false })
  ]
  let captured = false
  for (const value of invalid) {
    expect(
      await Effect.runPromise(
        adaptOpenCodeDirectEvent(value, {
          betweenReads: () =>
            Effect.sync(() => {
              captured = true
            })
        })
      )
    ).toBeUndefined()
  }
  expect(captured).toBe(false)
})

it("requires attributable edit text and diff metadata while accepting filediff", async () => {
  const cwd = fixture()
  const before = "export type Item = string;"
  const after = "export type Item = number;"
  writeFileSync(join(cwd, "src", "item.ts"), after + "\n")
  const args = { filePath: "src/item.ts", oldString: before, newString: after }
  expect((await adapt(event(cwd, "edit", args, { filediff: "checked" })))?.candidates).toEqual([
    { operation: "update", path: "src/item.ts", addedLines: [after] }
  ])
  for (const invalid of [
    event(cwd, "edit", args, {}),
    event(cwd, "edit", { ...args, replaceAll: "yes" }, { diff: "checked" }),
    event(cwd, "edit", { ...args, oldString: "" }, { diff: "checked" }),
    event(cwd, "edit", { ...args, newString: "" }, { diff: "checked" }),
    event(cwd, "edit", { ...args, oldString: after }, { diff: "checked" }),
    event(cwd, "edit", { ...args, newString: "absent" }, { diff: "checked" }),
    event(cwd, "edit", { ...args, oldString: " \n", newString: "\n" }, { diff: "checked" })
  ])
    expect(await adapt(invalid)).toBeUndefined()
})
