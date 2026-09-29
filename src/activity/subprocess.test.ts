import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: Array<string> = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const waitFor = (predicate: () => boolean, timeoutMs = 5_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
  throw new Error("timed out waiting for subprocess state");
};

describe("production resident activity subprocess", { timeout: 30_000 }, () => {
  it("reports a controlled native event as pending, then restarted/lost after resident death", () => {
    const root = mkdtempSync(join(tmpdir(), "resident-activity-subprocess-"));
    roots.push(root);
    const repository = join(root, "repository");
    const state = join(root, "consent");
    const runtime = join(root, "runtime");
    const activity = join(root, "activity");
    const gate = join(root, "backend-release");
    execFileSync("git", ["init", "--quiet", "--initial-branch=master", repository]);
    execFileSync("git", ["-C", repository, "config", "user.name", "Activity Fixture"]);
    execFileSync("git", ["-C", repository, "config", "user.email", "fixture@example.invalid"]);
    writeFileSync(join(repository, "README.md"), "fixture\n");
    execFileSync("git", ["-C", repository, "add", "README.md"]);
    execFileSync("git", ["-C", repository, "commit", "--quiet", "-m", "fixture"]);
    const environment = {
      ...process.env,
      REVIEW_STATE_PATH: state,
      REVIEW_RESIDENT_DIR: runtime,
      REVIEW_ACTIVITY_PATH: activity,
      REVIEW_RESIDENT_BACKEND_GATE_PATH: gate,
      REVIEW_CONTROL_JSON: "{}",
    };
    const source = "export interface PendingReview { id: string }\n";
    writeFileSync(join(repository, "pending.ts"), source);
    const event = {
      hook_event_name: "PostToolUse",
      tool_name: "apply_patch",
      session_id: "restart-session",
      turn_id: "turn-1",
      tool_use_id: "tool-1",
      cwd: repository,
      tool_input: {
        command: `*** Begin Patch\n*** Add File: pending.ts\n+${source.trim()}\n*** End Patch`,
      },
      tool_response: {},
    };
    const before = spawnSync(process.execPath, ["src/cli.ts", "--composed-before-edit-hook", "--composed-host=codex-cli", "--controlled-reviewer"], {
      cwd: process.cwd(),
      env: environment,
      input: JSON.stringify({ ...event, hook_event_name: "PreToolUse" }),
      encoding: "utf8",
      timeout: 15_000,
    });
    expect(before.status).toBe(0);
    expect(JSON.parse(before.stdout)).toEqual({});
    const hook = spawnSync(process.execPath, ["src/cli.ts", "--codex-hook", "--controlled-reviewer", "--controlled-writer", "--composed-edit-hook"], {
      cwd: process.cwd(),
      env: environment,
      input: JSON.stringify(event),
      encoding: "utf8",
      timeout: 15_000,
    });
    expect(hook.status).toBe(0);
    expect(JSON.parse(hook.stdout)).toEqual({});
    const readStatus = () => {
      const result = spawnSync(process.execPath, ["src/cli.ts", "--status"], {
        cwd: process.cwd(),
        env: environment,
        input: JSON.stringify({ version: 1, operation: "status", cwd: repository, sessionId: "restart-session" }),
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      return JSON.parse(result.stdout) as { activitySource: string; activity: { kind: string } };
    };
    expect(readStatus()).toMatchObject({ activitySource: "resident-v1", activity: { kind: "pending" } });
    const owner = JSON.parse(readFileSync(join(runtime, "owner.json"), "utf8")) as { pid: number };
    process.kill(owner.pid, "SIGTERM");
    waitFor(() => !existsSync(join(runtime, "owner.json")));
    expect(readStatus()).toMatchObject({
      activitySource: "resident-v1",
      activity: { kind: "restarted/lost" },
    });
  });
});
