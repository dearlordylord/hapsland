import { afterEach, describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readActivity } from "../activity/status.ts";
import { Consent } from "../runtime/consent.ts";
import { encodeClaudeHostOutputLine, type ClaudeHostOutput } from "./claude-output.ts";
import { configuredRules } from "../policy/rules.ts";
import { makeGitFixture, put } from "./test-fixtures.ts";
import { ensureResident, residentRequest } from "../resident/client.ts";
import { residentPaths } from "../resident/paths.ts";

const roots: Array<string> = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    try {
      const owner = JSON.parse(readFileSync(join(root, "runtime", "owner.json"), "utf8")) as { pid: number };
      process.kill(owner.pid, "SIGTERM");
    } catch { /* no resident owner */ }
    rmSync(root, { recursive: true, force: true });
  }
});

const enable = (root: string, statePath: string) => Effect.runPromise(Effect.gen(function* () {
  const consent = yield* Consent.Service;
  const proposal = yield* consent.preview(root, "jev", "https://api.typesafe.ai/v1/systemone");
  yield* consent.enable(proposal);
}).pipe(Effect.provide(Consent.layer({ statePath }))));

describe("Claude synchronous hook CLI", { timeout: 30_000 }, () => {
  it("returns quietly when the admitted review finishes clear", async () => {
    const root = await makeGitFixture();
    roots.push(root);
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const path = await put(root, "type.ts", "type ClearCount = number\n");
    const started = performance.now();
    const result = spawnSync(process.execPath, ["src/cli.ts", "--claude-hook", "--controlled", "--controlled-writer"], {
      cwd: process.cwd(),
      input: JSON.stringify({
        hook_event_name: "PostToolUse", tool_name: "Write", cwd: root,
        session_id: "clear-session", tool_use_id: "clear-tool",
        tool_input: { file_path: path, content: "type ClearCount = number\n" },
        tool_response: { filePath: path, content: "type ClearCount = number\n", originalFile: null, userModified: false },
      }),
      encoding: "utf8", timeout: 7_000,
      env: { ...process.env, REVIEW_STATE_PATH: statePath, REVIEW_RESIDENT_DIR: join(root, "runtime"),
        REVIEW_CONTROL_JSON: JSON.stringify({ answers: Object.fromEntries(configuredRules.map((rule) => [
          rule.id, { _tag: "Probability", probability: 0 },
        ])) }),
      },
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({});
    expect(performance.now() - started).toBeLessThan(3_900);
  });

  it("writes resident-selected advisory or block output exactly and keeps unsupported events quiet", async () => {
    const root = await makeGitFixture();
    roots.push(root);
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const path = await put(root, "type.ts", "type OrderCount = number\n");
    const event = {
      hook_event_name: "PostToolUse", tool_name: "Write", cwd: root,
      session_id: "session", tool_use_id: "tool-one",
      tool_input: { file_path: path, content: "type OrderCount = number\n" },
      tool_response: { filePath: path, content: "type OrderCount = number\n", originalFile: null, userModified: false },
    };
    const env = {
      ...process.env,
      REVIEW_STATE_PATH: statePath,
      REVIEW_RESIDENT_DIR: join(root, "runtime"),
      REVIEW_CONTROL_JSON: JSON.stringify({ answers: Object.fromEntries(configuredRules.map((rule) => [
        rule.id, { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
      ])) }),
    };
    const invoke = (input: unknown, selectedEnv: NodeJS.ProcessEnv = env) => spawnSync(process.execPath, ["src/cli.ts", "--claude-hook", "--controlled", "--controlled-writer"], {
      cwd: process.cwd(), input: JSON.stringify(input), encoding: "utf8", env: selectedEnv, timeout: 7_000,
    });
    const result = invoke(event);
    expect(result.status).toBe(0);
    const advice = JSON.parse(result.stdout) as {
      hookSpecificOutput?: { hookEventName: string; additionalContext: string };
      decision?: string;
    };
    expect(advice).toMatchObject({ hookSpecificOutput: {
      hookEventName: "PostToolUse", additionalContext: expect.stringContaining("OrderCount"),
    } });
    expect(result.stdout).toBe(encodeClaudeHostOutputLine(advice as ClaudeHostOutput));
    expect(advice.decision).toBeUndefined();
    expect(advice.hookSpecificOutput?.additionalContext).toContain("Please repair each finding");
    expect(advice.hookSpecificOutput?.additionalContext).toContain("r6_bare_domain_value");
    expect(Buffer.byteLength(result.stdout, "utf8")).toBeLessThanOrEqual(2 * 1024);

    const userConfigPath = await put(root, "user-config.jsonc", '{"version":1,"claudeFeedbackMode":"block-current-findings"}');
    const blockResult = invoke({ ...event, tool_use_id: "tool-two" }, {
      ...env,
      REVIEW_USER_CONFIG_PATH: userConfigPath,
    });
    expect(blockResult.status).toBe(0);
    const block = JSON.parse(blockResult.stdout) as { decision?: string; reason?: string };
    expect(block).toMatchObject({
      decision: "block",
      reason: expect.stringContaining("r6_bare_domain_value"),
    });
    expect(block.reason).toContain("Repair the listed finding(s)");
    expect(blockResult.stdout).toBe(`${JSON.stringify(block)}\n`);
    expect(Object.keys(block).sort()).toEqual(["decision", "reason"]);
    expect(Buffer.byteLength(blockResult.stdout, "utf8")).toBeLessThanOrEqual(2 * 1024);

    const unsupported = invoke({ ...event, tool_name: "Bash" });
    expect(unsupported.status).toBe(0);
    expect(JSON.parse(unsupported.stdout)).toEqual({});
  });

  it("returns a quiet result within the hook budget when evaluation is slow", async () => {
    const root = await makeGitFixture();
    roots.push(root);
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const path = await put(root, "type.ts", "type OrderCount = number\n");
    const started = performance.now();
    const result = spawnSync(process.execPath, ["src/cli.ts", "--claude-hook", "--controlled", "--controlled-writer"], {
      cwd: process.cwd(),
      input: JSON.stringify({
        hook_event_name: "PostToolUse", tool_name: "Write", cwd: root,
        session_id: "slow-session", tool_use_id: "slow-tool",
        tool_input: { file_path: path, content: "type OrderCount = number\n" },
        tool_response: { filePath: path, content: "type OrderCount = number\n", originalFile: null, userModified: false },
      }),
      encoding: "utf8", timeout: 7_000,
      env: { ...process.env, REVIEW_STATE_PATH: statePath, REVIEW_RESIDENT_DIR: join(root, "runtime"),
        REVIEW_CONTROL_JSON: JSON.stringify({ delayMs: 10_000, answers: Object.fromEntries(configuredRules.map((rule) => [
          rule.id, { _tag: "Probability", probability: 0.9 },
        ])) }),
      },
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({});
    expect(performance.now() - started).toBeLessThan(5_000);
  });

  it("does not acknowledge a Claude lease when stdout reports a write error", async () => {
    const root = await makeGitFixture();
    roots.push(root);
    const statePath = join(root, "consent");
    await enable(root, statePath);
    const path = await put(root, "type.ts", "type OrderCount = number\n");
    const userConfigPath = await put(root, "user-config.jsonc", '{"version":1,"claudeFeedbackMode":"block-current-findings"}');
    const ackGatePath = join(root, "ack-gate");
    const ackEnteredPath = `${ackGatePath}.entered`;
    const activityPath = join(root, "failed-writer-activity.jsonl");
    const env = {
      ...process.env,
      REVIEW_STATE_PATH: statePath,
      REVIEW_RESIDENT_DIR: join(root, "runtime"),
      REVIEW_USER_CONFIG_PATH: userConfigPath,
      REVIEW_ACTIVITY_PATH: activityPath,
      REVIEW_RESIDENT_ACK_RESPONSE_GATE_PATH: ackGatePath,
      REVIEW_CONTROL_JSON: JSON.stringify({ answers: Object.fromEntries(configuredRules.map((rule) => [
        rule.id, { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
      ])) }),
    };
    const event = {
      hook_event_name: "PostToolUse", tool_name: "Write", cwd: root,
      session_id: "failed-writer-session", tool_use_id: "failed-writer-tool",
      tool_input: { file_path: path, content: "type OrderCount = number\n" },
      tool_response: { filePath: path, content: "type OrderCount = number\n", originalFile: null, userModified: false },
    };
    writeFileSync(`${ackGatePath}.enabled`, "enabled\n");
    const child = spawn(process.execPath, ["src/cli.ts", "--claude-hook", "--controlled", "--controlled-writer"], {
      cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"], env,
    });
    const completed = new Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("Claude hook did not exit within its output deadline"));
      }, 7_000);
      child.once("error", (cause) => {
        clearTimeout(timer);
        reject(cause);
      });
      child.once("close", (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });
    });
    child.stdout.destroy();
    child.stdin.end(JSON.stringify(event));
    let result: { readonly code: number | null; readonly signal: NodeJS.Signals | null };
    try {
      result = await completed;
    } finally {
      writeFileSync(`${ackGatePath}.release`, "release\n");
    }

    const acknowledgeWasRequested = existsSync(ackEnteredPath);
    expect(result.signal).toBeNull();
    expect(result.code).toBe(0);
    expect(acknowledgeWasRequested).toBe(false);
    const paths = residentPaths(join(root, "runtime"));
    const owner = await ensureResident(paths);
    const stats = await residentRequest(paths, {
      version: 1,
      operation: "stats",
      lifetime: owner.lifetime,
    });
    expect(stats).toMatchObject({ status: "stats", pendingFindingBatches: 1 });
    const activity = readActivity({
      statePath: activityPath,
      root,
      sessionId: event.session_id,
      resident: { available: true, lifetime: owner.lifetime },
    });
    expect(activity.submission).toEqual({ status: "none", findings: 0 });
  });
});
