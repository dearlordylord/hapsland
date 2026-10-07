import { connectDefaultRuleFixture } from "@hapsland/build-tooling/test-support/default-rules"
import { execFileAsync } from "../../scripts/test-harness/process.mjs"
import { mkdtemp, mkdir, realpath, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { DirectAdvicee } from "@hapsland/native-observation/direct-event/observation"

export const makeGitFixture = async () => {
  // These fixtures place the resident socket under `root/runtime`. macOS
  // limits AF_UNIX socket paths to 104 bytes, so keep the temporary root short
  // enough that nested runtime paths remain bindable after realpath canonicalization.
  const root = await mkdtemp(join(tmpdir(), "haps-"))
  await execFileAsync("git", ["init", "-q", root])
  await execFileAsync("git", ["-C", root, "config", "user.email", "test@example.invalid"])
  await execFileAsync("git", ["-C", root, "config", "user.name", "Test"])
  return realpath(root)
}

/** Review fixtures explicitly connect their editable default source. */
export const makeReviewGitFixture = async () => {
  const root = await makeGitFixture()
  connectDefaultRuleFixture(root)
  return root
}

export const put = async (root: string, path: string, value: string | Uint8Array) => {
  const target = join(root, path)
  await mkdir(join(target, ".."), { recursive: true })
  await writeFile(target, value)
  return target
}

/** Track generated source in one Git operation so real parsing avoids repeated untracked scans. */
export const stageFiles = async (root: string, paths: ReadonlyArray<string>) => {
  await execFileAsync("git", ["-C", root, "add", "--", ...paths])
}

export const advicee = (overrides: Partial<Extract<DirectAdvicee, { host: "codex-cli" }>> = {}): DirectAdvicee => ({
  host: "codex-cli",
  hostVersion: "0.155.1",
  sessionId: "session",
  turnId: "turn",
  toolUseId: "tool-use",
  subagentId: null,
  ...overrides
})

export const addEvent = (
  root: string,
  paths: ReadonlyArray<string> = ["type.ts"],
  overrides: Readonly<Record<string, unknown>> = {}
) => ({
  hook_event_name: "PostToolUse",
  tool_name: "apply_patch",
  session_id: "session",
  turn_id: "turn",
  tool_use_id: "tool-use",
  cwd: root,
  tool_input: {
    command: `*** Begin Patch\n${paths.map((path) => `*** Add File: ${path}\n+type OrderCount = number`).join("\n")}\n*** End Patch`
  },
  tool_response: {},
  ...overrides
})

export const updateEvent = (
  root: string,
  path: string,
  addedLines: ReadonlyArray<string>,
  overrides: Readonly<Record<string, unknown>> = {}
) =>
  addEvent(root, [path], {
    tool_input: {
      command: [
        "*** Begin Patch",
        `*** Update File: ${path}`,
        "@@",
        ...addedLines.map((line) => `+${line}`),
        "*** End Patch"
      ].join("\n")
    },
    tool_response: { success: true },
    ...overrides
  })
