import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import { afterEach, describe, expect, it } from "vitest";
import { adaptOpenCodeDirectEvent } from "./adapter.ts";

const dirs: string[] = [];
const fixture = () => {
  const cwd = mkdtempSync(join(tmpdir(), "hapsland-opencode-adapter-"));
  dirs.push(cwd);
  execFileSync("git", ["init", "-q", cwd]);
  mkdirSync(join(cwd, "src"));
  return cwd;
};
const adapt = (value: unknown) => Effect.runPromise(adaptOpenCodeDirectEvent(value));
const event = (cwd: string, tool: string, args: unknown, metadata: unknown) => ({
  cwd, input: { tool, args, sessionID: "ses-1", callID: "call-1" },
  output: { title: "Edited file", output: "Applied", attachments: [], metadata },
});
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("OpenCode 1.14.44 direct event adaptation", () => {
  it("selects a direct edit with tool-call recipient and current file evidence", async () => {
    const cwd = fixture();
    writeFileSync(join(cwd, "src", "item.ts"), "export interface Item { value: number }\n");
    const result = await adapt(event(cwd, "edit", {
      filePath: "src/item.ts", oldString: "export interface Item { value: string }", newString: "export interface Item { value: number }", replaceAll: false,
    }, { diff: "fixture diff", truncated: false }));
    expect(result?.recipient).toEqual({ host: "opencode", hostVersion: "1.14.44", sessionId: "ses-1",
      turnId: null, toolUseId: "call-1", agentId: null });
    expect(result?.candidates).toEqual([{ operation: "update", path: "src/item.ts", addedLines: ["export interface Item { value: number }"] }]);
  });

  it("selects a successful write and rejects unsupported or unattributed events", async () => {
    const cwd = fixture();
    const content = "export type Item = { value: number };\n";
    writeFileSync(join(cwd, "src", "item.ts"), content);
    const write = event(cwd, "write", { filePath: "src/item.ts", content }, { exists: false, truncated: false });
    expect((await adapt(write))?.candidates[0]?.operation).toBe("add");
    expect(await adapt({ ...write, input: { ...write.input, tool: "bash" } })).toBeUndefined();
    expect(await adapt({ ...write, input: { ...write.input, callID: "" } })).toBeUndefined();
    expect(await adapt(event(cwd, "write", { filePath: "src/item.ts", content: "wrong" }, { exists: false }))).toBeUndefined();
    expect(await adapt(event(cwd, "edit", { filePath: "../escape.ts", oldString: "x", newString: "y" }, { diff: "x" }))).toBeUndefined();
  });

  it("rejects oversized and symlinked files before reading source", async () => {
    const cwd = fixture();
    const content = "export interface Item { value: number }\n";
    const outside = mkdtempSync(join(tmpdir(), "hapsland-opencode-outside-"));
    dirs.push(outside);
    writeFileSync(join(outside, "outside.ts"), content);
    symlinkSync(join(outside, "outside.ts"), join(cwd, "src", "link.ts"));
    expect(await adapt(event(cwd, "write", { filePath: "src/link.ts", content }, { exists: false }))).toBeUndefined();
    writeFileSync(join(cwd, "src", "large.ts"), "x".repeat(256_001));
    expect(await adapt(event(cwd, "write", { filePath: "src/large.ts", content: "x".repeat(256_001) },
      { exists: false }))).toBeUndefined();
    writeFileSync(join(cwd, "src", "item.ts"), content);
    expect(await adapt(event(cwd, "write", { filePath: "src/item.ts", content },
      { exists: false, diff: "x".repeat(256_001) }))).toBeUndefined();
  });

  it("rejects a file that changes between descriptor reads", async () => {
    const cwd = fixture();
    const path = join(cwd, "src", "item.ts");
    const content = "export interface Item { value: number }\n";
    writeFileSync(path, content);
    const write = event(cwd, "write", { filePath: "src/item.ts", content }, { exists: false });
    const result = await Effect.runPromise(adaptOpenCodeDirectEvent(write, {
      betweenReads: async () => { writeFileSync(path, "export interface Item { value: string }\n"); },
    }));
    expect(result).toBeUndefined();
  });

  it("skips existing-file Write even when unchanged roots are present", async () => {
    const cwd = fixture();
    const content = "export interface Changed { value: number }\nexport interface Unchanged { label: string }\n";
    writeFileSync(join(cwd, "src", "item.ts"), content);
    expect(await adapt(event(cwd, "write", { filePath: "src/item.ts", content },
      { exists: true }))).toBeUndefined();
  });

  it("attributes only unique changed whole lines from an Edit", async () => {
    const cwd = fixture();
    const old = "export interface Changed { value: string }";
    const changed = "export interface Changed { value: number }";
    const unchanged = "export interface Unchanged { label: string }";
    writeFileSync(join(cwd, "src", "item.ts"), `${changed}\n${unchanged}\n`);
    const result = await adapt(event(cwd, "edit", { filePath: "src/item.ts",
      oldString: `${old}\n${unchanged}`, newString: `${changed}\n${unchanged}`, replaceAll: false }, { diff: "fixture" }));
    expect(result?.candidates[0]?.addedLines).toEqual([changed]);
    writeFileSync(join(cwd, "src", "item.ts"), `${changed}\n${changed}\n${unchanged}\n`);
    expect(await adapt(event(cwd, "edit", { filePath: "src/item.ts",
      oldString: old, newString: changed, replaceAll: false }, { diff: "fixture" }))).toBeUndefined();
  });
});
