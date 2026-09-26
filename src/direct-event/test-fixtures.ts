import { execFile } from "node:child_process";
import { mkdtemp, mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import type { DirectAdvicee } from "./model.ts";

const execFileAsync = promisify(execFile);

export const makeGitFixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "product-direct-event-"));
  await execFileAsync("git", ["init", "-q", root]);
  await execFileAsync("git", ["-C", root, "config", "user.email", "test@example.invalid"]);
  await execFileAsync("git", ["-C", root, "config", "user.name", "Test"]);
  return realpath(root);
};

export const put = async (root: string, path: string, value: string | Uint8Array) => {
  const target = join(root, path);
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, value);
  return target;
};

export const advicee = (overrides: Partial<Extract<DirectAdvicee, { host: "codex-cli" }>> = {}): DirectAdvicee => ({
  host: "codex-cli",
  hostVersion: "0.155.1",
  sessionId: "session",
  turnId: "turn",
  toolUseId: "tool-use",
  agentId: null,
  ...overrides,
});

export const addEvent = (
  root: string,
  paths: ReadonlyArray<string> = ["type.ts"],
  overrides: Readonly<Record<string, unknown>> = {},
) => ({
  hook_event_name: "PostToolUse",
  tool_name: "apply_patch",
  session_id: "session",
  turn_id: "turn",
  tool_use_id: "tool-use",
  cwd: root,
  tool_input: {
    command: `*** Begin Patch\n${paths.map((path) => `*** Add File: ${path}\n+type OrderCount = number`).join("\n")}\n*** End Patch`,
  },
  tool_response: {},
  ...overrides,
});

export const updateEvent = (
  root: string,
  path: string,
  addedLines: ReadonlyArray<string>,
  overrides: Readonly<Record<string, unknown>> = {},
) => addEvent(root, [path], {
  tool_input: {
    command: [
      "*** Begin Patch",
      `*** Update File: ${path}`,
      "@@",
      ...addedLines.map((line) => `+${line}`),
      "*** End Patch",
    ].join("\n"),
  },
  ...overrides,
});
