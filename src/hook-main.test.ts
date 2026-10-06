import { mkdtempSync, existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "vitest"
import { spawnSync } from "../scripts/test-harness/process.mjs"
import { bunExecutable } from "@hapsland/runtime-environment/runtime/bun-runtime"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
const invoke = (flags: ReadonlyArray<string>, input: string, control = "malformed") => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-hook-root-"))
  roots.push(root)
  const runtime = join(root, "runtime")
  const child = spawnSync(bunExecutable(), ["packages/hook-entry/src/hook-main.ts", ...flags], {
    cwd: process.cwd(),
    input,
    encoding: "utf8",
    env: { ...process.env, REVIEW_RESIDENT_DIR: runtime, REVIEW_CONTROL_JSON: control }
  })
  expect(child.status).toBe(0)
  expect(child.stderr).toBe("")
  expect(existsSync(runtime)).toBe(false)
  return child.stdout.trim()
}
it("refuses administration flags without reading or dispatching input", () => {
  expect(invoke(["--codex-hook", "--login"], "malformed")).toBe("")
})
it("quiets retired channels before input or controlled-option decoding", () => {
  expect(invoke(["--codex-hook", "--controlled-reviewer"], "malformed")).toBe("{}")
  expect(invoke(["--opencode-hook", "--controlled-reviewer"], "malformed")).toBe("")
})
it("cannot select administrative dispatch through native JSON", () => {
  expect(
    invoke(
      ["--codex-hook", "--composed-edit-hook"],
      JSON.stringify({ version: 1, operation: "credentials", cwd: process.cwd() })
    )
  ).toBe("{}")
})
it("keeps malformed Claude input bounded and protocol-shaped", () => {
  expect(invoke(["--claude-hook", "--composed-edit-hook"], "malformed")).toBe("{}")
})
it("preserves malformed Pi input response", () => {
  expect(JSON.parse(invoke(["--pi-hook"], "malformed"))).toMatchObject({
    version: 1,
    error: { code: "invalid_request" }
  })
})
it("refuses unsupported Codex versions before reading input", () => {
  expect(invoke(["--codex-hook", "--composed-edit-hook", "--codex-version=unknown"], "malformed")).toBe("")
})
