import { runClient } from "../test-support/client-runtime.ts";
import { afterEach, describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { spawn, spawnSync } from "node:child_process";
import { createConnection, createServer } from "node:net";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readActivity } from "../activity/status.ts";
import { encodeClaudeHostOutputLine, type ClaudeHostOutput } from "./claude-output.ts";
import { configuredRules } from "../policy/rules.ts";
import { makeGitFixture, put } from "./test-fixtures.ts";
import { ensureResidentEffect as ensureResident, residentRequestEffect as residentRequest } from "../resident/client.ts";
import { residentPaths } from "../resident/paths.ts";
import { encodeCurrentResidentRequest } from "../resident/protocol.ts";
import { MAX_COMBINED_RESPONSE_BYTES } from "../resident/collection.ts";

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

const preClaudeEdit = (event: Readonly<Record<string, unknown>>, env: NodeJS.ProcessEnv) =>
  spawnSync(process.execPath, ["src/cli.ts", "--composed-before-edit-hook", "--composed-host=claude-code"], {
    cwd: process.cwd(), input: JSON.stringify({ ...event, hook_event_name: "PreToolUse" }),
    encoding: "utf8", timeout: 7_000, env,
  });

const CLAUDE_EDIT_FLAGS = ["src/cli.ts", "--claude-hook", "--controlled-reviewer",
  "--controlled-writer", "--composed-edit-hook"] as const;

const waitForFile = async (path: string, timeoutMs = 3_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`fixture gate was not reached: ${path}`);
};

describe("Claude synchronous hook CLI", { timeout: 30_000 }, () => {
  it("returns a current finding through the installed composed edit hooks", async () => {
    const root = await makeGitFixture();
    roots.push(root);
    const statePath = join(root, "consent");
    const path = await put(root, "type.ts", "type OrderCount = number\n");
    const event = {
      tool_name: "Write", cwd: root, session_id: "installed-session", tool_use_id: "installed-tool",
      tool_input: { file_path: path, content: "type OrderCount = number\n" },
      tool_response: { filePath: path, content: "type OrderCount = number\n", originalFile: null, userModified: false },
    };
    const env = { ...process.env, REVIEW_STATE_PATH: statePath,
      REVIEW_RESIDENT_DIR: join(root, "runtime"),
      REVIEW_CONTROL_JSON: JSON.stringify({ answers: Object.fromEntries(configuredRules.map((rule) => [
        rule.id, { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
      ])) }),
    };
    const invoke = (flags: ReadonlyArray<string>, hookEventName: string) => spawnSync(process.execPath,
      ["src/cli.ts", ...flags], { cwd: process.cwd(), input: JSON.stringify({ ...event, hook_event_name: hookEventName }),
        encoding: "utf8", timeout: 7_000, env });
    const obsoleteDirect = invoke(["--claude-hook", "--controlled-reviewer", "--controlled-writer"], "PostToolUse");
    expect(obsoleteDirect.status).toBe(0);
    expect(JSON.parse(obsoleteDirect.stdout)).toEqual({});
    const before = invoke(["--composed-before-edit-hook", "--composed-host=claude-code"], "PreToolUse");
    expect(before.status).toBe(0);
    expect(JSON.parse(before.stdout)).toEqual({});
    const after = invoke(["--claude-hook", "--controlled-reviewer", "--controlled-writer", "--composed-edit-hook"], "PostToolUse");
    expect(after.status).toBe(0);
    expect(JSON.parse(after.stdout)).toMatchObject({ hookSpecificOutput: {
      hookEventName: "PostToolUse", additionalContext: expect.stringContaining("OrderCount"),
    } });
    expect(Buffer.byteLength(after.stdout, "utf8")).toBeLessThanOrEqual(MAX_COMBINED_RESPONSE_BYTES);
  });

  it("returns quietly when the admitted review finishes clear", async () => {
    const root = await makeGitFixture();
    roots.push(root);
    const statePath = join(root, "consent");
    const path = await put(root, "type.ts", "type ClearCount = number\n");
    const event = {
      hook_event_name: "PostToolUse", tool_name: "Write", cwd: root,
      session_id: "clear-session", tool_use_id: "clear-tool",
      tool_input: { file_path: path, content: "type ClearCount = number\n" },
      tool_response: { filePath: path, content: "type ClearCount = number\n", originalFile: null, userModified: false },
    };
    const env = { ...process.env, REVIEW_STATE_PATH: statePath, REVIEW_RESIDENT_DIR: join(root, "runtime"),
      REVIEW_CONTROL_JSON: JSON.stringify({ answers: Object.fromEntries(configuredRules.map((rule) => [
        rule.id, { _tag: "Probability", probability: 0 },
      ])) }),
    };
    expect(preClaudeEdit(event, env).status).toBe(0);
    const started = performance.now();
    const result = spawnSync(process.execPath, CLAUDE_EDIT_FLAGS, {
      cwd: process.cwd(),
      input: JSON.stringify(event),
      encoding: "utf8", timeout: 7_000,
      env,
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({});
    expect(performance.now() - started).toBeLessThan(3_900);
  });

  it("returns quietly when the installed edit hook yields no review units", async () => {
    const root = await makeGitFixture();
    roots.push(root);
    const statePath = join(root, "consent");
    const path = await put(root, "excluded.ts", "type ExcludedCount = number\n");
    await put(root, ".review.jsonc", '{"version":1,"excludes":["excluded.ts"]}\n');
    const event = {
      hook_event_name: "PostToolUse", tool_name: "Write", cwd: root,
      session_id: "no-units-session", tool_use_id: "no-units-tool",
      tool_input: { file_path: path, content: "type ExcludedCount = number\n" },
      tool_response: { filePath: path, content: "type ExcludedCount = number\n", originalFile: null, userModified: false },
    };
    const env = { ...process.env, REVIEW_STATE_PATH: statePath, REVIEW_RESIDENT_DIR: join(root, "runtime"),
      REVIEW_CONTROL_JSON: JSON.stringify({ answers: Object.fromEntries(configuredRules.map((rule) => [
        rule.id, { _tag: "Probability", probability: 0.9 },
      ])) }),
    };
    expect(preClaudeEdit(event, env).status).toBe(0);
    const result = spawnSync(process.execPath, CLAUDE_EDIT_FLAGS, {
      cwd: process.cwd(), input: JSON.stringify(event), encoding: "utf8", timeout: 7_000, env,
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({});
    expect(readFileSync(path, "utf8")).toBe("type ExcludedCount = number\n");
  });

  it("writes resident-selected advisory or block output exactly and keeps unsupported events quiet", async () => {
    const root = await makeGitFixture();
    roots.push(root);
    const statePath = join(root, "consent");
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
    const invoke = (input: typeof event, selectedEnv: NodeJS.ProcessEnv = env) => {
      if (input.tool_name === "Write") expect(preClaudeEdit(input, selectedEnv).status).toBe(0);
      return spawnSync(process.execPath, CLAUDE_EDIT_FLAGS, {
        cwd: process.cwd(), input: JSON.stringify(input), encoding: "utf8", env: selectedEnv, timeout: 7_000,
      });
    };
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
    expect(Buffer.byteLength(result.stdout, "utf8")).toBeLessThanOrEqual(MAX_COMBINED_RESPONSE_BYTES);

    const userConfigPath = await put(root, "user-config.jsonc", '{"version":1,"claudeFeedbackMode":"block-current-findings"}');
    const blockResult = invoke({ ...event, session_id: "block-session", tool_use_id: "tool-two" }, {
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
    expect(Buffer.byteLength(blockResult.stdout, "utf8")).toBeLessThanOrEqual(MAX_COMBINED_RESPONSE_BYTES);

    await put(root, ".review.jsonc", '{"version":1,"claudeFeedbackMode":"advisory"}');
    const narrowedResult = invoke({ ...event, session_id: "narrowed-session", tool_use_id: "tool-three" }, {
      ...env, REVIEW_USER_CONFIG_PATH: userConfigPath,
    });
    expect(narrowedResult.status).toBe(0);
    expect(JSON.parse(narrowedResult.stdout)).toMatchObject({ hookSpecificOutput: {
      additionalContext: expect.stringContaining("OrderCount"),
    } });
    expect(JSON.parse(narrowedResult.stdout)).not.toHaveProperty("decision", "block");

    const unsupported = invoke({ ...event, tool_name: "Bash" });
    expect(unsupported.status).toBe(0);
    expect(JSON.parse(unsupported.stdout)).toEqual({});
  });

  it("rejects a selected block after the user revokes opt-in at final IPC handoff", async () => {
    const root = await makeGitFixture();
    roots.push(root);
    const statePath = join(root, "consent");
    const path = await put(root, "type.ts", "type RevokedCount = number\n");
    const userConfigPath = await put(root, "user-config.jsonc", '{"version":1,"claudeFeedbackMode":"block-current-findings"}');
    const gate = join(root, "advice-response-gate");
    const event = {
      hook_event_name: "PostToolUse", tool_name: "Write", cwd: root,
      session_id: "revoked-session", tool_use_id: "revoked-tool",
      tool_input: { file_path: path, content: "type RevokedCount = number\n" },
      tool_response: { filePath: path, content: "type RevokedCount = number\n", originalFile: null, userModified: false },
    };
    const env = { ...process.env, REVIEW_STATE_PATH: statePath,
      REVIEW_USER_CONFIG_PATH: userConfigPath, REVIEW_RESIDENT_DIR: join(root, "runtime"),
      REVIEW_RESIDENT_COLLECT_ADVICE_RESPONSE_GATE_PATH: gate,
      REVIEW_CONTROL_JSON: JSON.stringify({ answers: Object.fromEntries(configuredRules.map((rule) => [
        rule.id, { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
      ])) }),
    };
    expect(preClaudeEdit(event, env).status).toBe(0);
    writeFileSync(`${gate}.enabled`, "enabled\n");
    const child = spawn(process.execPath, CLAUDE_EDIT_FLAGS, { cwd: process.cwd(), env,
      stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    const completed = new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Claude hook did not exit")); }, 7_000);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("close", (code) => { clearTimeout(timer); resolve(code); });
    });
    child.stdin.end(JSON.stringify(event));
    try {
      await waitForFile(`${gate}.entered`);
      writeFileSync(userConfigPath, '{"version":1,"claudeFeedbackMode":"advisory"}');
      writeFileSync(`${gate}.release`, "release\n");
      expect(await completed, stderr).toBe(0);
      expect(JSON.parse(stdout)).not.toHaveProperty("decision", "block");
      expect(readFileSync(path, "utf8")).toBe("type RevokedCount = number\n");
      const paths = residentPaths(join(root, "runtime"));
      const owner = await runClient(ensureResident(paths));
      const stats = await runClient(residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: owner.lifetime }));
      expect(stats).toMatchObject({ status: "stats", pendingAdvice: 1 });
    } finally {
      writeFileSync(`${gate}.release`, "release\n");
      if (child.exitCode === null) child.kill();
    }
  });

  it("rejects selected advice when credential authority changes at final IPC handoff", async () => {
    const root = await makeGitFixture();
    roots.push(root);
    const statePath = join(root, "consent");
    const path = await put(root, "type.ts", "type CredentialCount = number\n");
    const credentialStatePath = await put(root, "credential-state.json", '{"version":1,"generation":1,"savedUseSuspended":false}');
    const gate = join(root, "advice-response-gate");
    const event = {
      hook_event_name: "PostToolUse", tool_name: "Write", cwd: root,
      session_id: "credential-session", tool_use_id: "credential-tool",
      tool_input: { file_path: path, content: "type CredentialCount = number\n" },
      tool_response: { filePath: path, content: "type CredentialCount = number\n", originalFile: null, userModified: false },
    };
    const env = { ...process.env, REVIEW_STATE_PATH: statePath,
      REVIEW_RESIDENT_DIR: join(root, "runtime"),
      REVIEW_RESIDENT_COLLECT_ADVICE_RESPONSE_GATE_PATH: gate,
      REVIEW_CREDENTIAL_STATE_PATH: credentialStatePath, TYPESAFE_API_KEY: "synthetic-credential-marker",
      REVIEW_CONTROL_JSON: JSON.stringify({ requireCredential: true,
        answers: Object.fromEntries(configuredRules.map((rule) => [
          rule.id, { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
        ])) }),
    };
    expect(preClaudeEdit(event, env).status).toBe(0);
    writeFileSync(`${gate}.enabled`, "enabled\n");
    const child = spawn(process.execPath, CLAUDE_EDIT_FLAGS, { cwd: process.cwd(), env,
      stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    const completed = new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Claude hook did not exit")); }, 7_000);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("close", (code) => { clearTimeout(timer); resolve(code); });
    });
    child.stdin.end(JSON.stringify(event));
    try {
      await waitForFile(`${gate}.entered`);
      writeFileSync(credentialStatePath, '{"version":1,"generation":2,"savedUseSuspended":false}');
      writeFileSync(`${gate}.release`, "release\n");
      expect(await completed, stderr).toBe(0);
      expect(JSON.parse(stdout)).toEqual({});
      expect(readFileSync(path, "utf8")).toBe("type CredentialCount = number\n");
    } finally {
      writeFileSync(`${gate}.release`, "release\n");
      if (child.exitCode === null) child.kill();
    }
  });

  it("retires selected advice when source changes before the installed hook response", async () => {
    const root = await makeGitFixture();
    roots.push(root);
    const statePath = join(root, "consent");
    const path = await put(root, "type.ts", "type StaleCount = number\n");
    const gate = join(root, "advice-response-gate");
    const event = {
      hook_event_name: "PostToolUse", tool_name: "Write", cwd: root,
      session_id: "stale-session", tool_use_id: "stale-tool",
      tool_input: { file_path: path, content: "type StaleCount = number\n" },
      tool_response: { filePath: path, content: "type StaleCount = number\n", originalFile: null, userModified: false },
    };
    const env = { ...process.env, REVIEW_STATE_PATH: statePath,
      REVIEW_RESIDENT_DIR: join(root, "runtime"),
      REVIEW_RESIDENT_COLLECT_ADVICE_RESPONSE_GATE_PATH: gate,
      REVIEW_CONTROL_JSON: JSON.stringify({ answers: Object.fromEntries(configuredRules.map((rule) => [
        rule.id, { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
      ])) }),
    };
    expect(preClaudeEdit(event, env).status).toBe(0);
    writeFileSync(`${gate}.enabled`, "enabled\n");
    const child = spawn(process.execPath, CLAUDE_EDIT_FLAGS, { cwd: process.cwd(), env,
      stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    const completed = new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Claude hook did not exit")); }, 7_000);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("close", (code) => { clearTimeout(timer); resolve(code); });
    });
    child.stdin.end(JSON.stringify(event));
    try {
      await waitForFile(`${gate}.entered`);
      writeFileSync(path, "type StaleCount = string\n");
      writeFileSync(`${gate}.release`, "release\n");
      expect(await completed, stderr).toBe(0);
      expect(JSON.parse(stdout)).toEqual({});
      expect(readFileSync(path, "utf8")).toBe("type StaleCount = string\n");
      const paths = residentPaths(join(root, "runtime"));
      const owner = await runClient(ensureResident(paths));
      const stats = await runClient(residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: owner.lifetime }));
      expect(stats).toMatchObject({ status: "stats", pendingAdvice: 0 });
    } finally {
      writeFileSync(`${gate}.release`, "release\n");
      if (child.exitCode === null) child.kill();
    }
  });

  it("batches ready findings from two installed edits in the later edit response", async () => {
    const root = await makeGitFixture();
    roots.push(root);
    const statePath = join(root, "consent");
    const event = (path: string, name: string, toolUseId: string) => ({
      hook_event_name: "PostToolUse", tool_name: "Write", cwd: root,
      session_id: "batch-session", tool_use_id: toolUseId,
      tool_input: { file_path: path, content: `type ${name} = number\n` },
      tool_response: { filePath: path, content: `type ${name} = number\n`, originalFile: null, userModified: false },
    });
    const acceptedPath = join(root, "admission-accepted");
    const baseEnv = { ...process.env, REVIEW_STATE_PATH: statePath,
      REVIEW_RESIDENT_DIR: join(root, "runtime"),
      REVIEW_RESIDENT_ADMISSION_ACCEPTED_PATH: acceptedPath,
      REVIEW_CONTROL_JSON: JSON.stringify({ answers: Object.fromEntries(configuredRules.map((rule) => [
        rule.id, { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
      ])) }),
    };
    const delayedEnv = { ...baseEnv, REVIEW_CONTROL_JSON: JSON.stringify({ delayMs: 7_000,
      answers: JSON.parse(baseEnv.REVIEW_CONTROL_JSON).answers }) };
    const first = event(await put(root, "first.ts", "type FirstCount = number\n"), "FirstCount", "batch-first");
    const second = event(await put(root, "second.ts", "type SecondCount = number\n"), "SecondCount", "batch-second");
    const runDelayed = (input: typeof first) => new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, CLAUDE_EDIT_FLAGS, { cwd: process.cwd(), env: delayedEnv,
        stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Claude edit hook exceeded its deadline")); }, 7_000);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("close", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
      child.stdin.end(JSON.stringify(input));
    });
    expect(preClaudeEdit(first, delayedEnv).status).toBe(0);
    const firstPending = runDelayed(first);
    await waitForFile(acceptedPath);
    expect(preClaudeEdit(second, delayedEnv).status).toBe(0);
    const secondPending = runDelayed(second);
    const [firstResult, secondResult] = await Promise.all([firstPending, secondPending]);
    expect(firstResult.code, firstResult.stderr).toBe(0);
    expect(secondResult.code, secondResult.stderr).toBe(0);
    expect(JSON.parse(firstResult.stdout)).toEqual({});
    expect(JSON.parse(secondResult.stdout)).toEqual({});
    const paths = residentPaths(join(root, "runtime"));
    const owner = await runClient(ensureResident(paths));
    const deadline = Date.now() + 15_000;
    let pendingAdvice = 0;
    let lastStats: unknown;
    while (Date.now() < deadline && pendingAdvice < 2) {
      const stats = await runClient(residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: owner.lifetime }));
      lastStats = stats;
      pendingAdvice = stats.status === "stats" ? stats.pendingAdvice : 0;
      if (pendingAdvice < 2) await new Promise<void>((resolve) => setTimeout(resolve, 20));
    }
    expect(pendingAdvice, JSON.stringify(lastStats)).toBeGreaterThanOrEqual(2);
    const third = event(await put(root, "third.ts", "type ThirdCount = number\n"), "ThirdCount", "batch-third");
    expect(preClaudeEdit(third, baseEnv).status).toBe(0);
    const thirdResult = spawnSync(process.execPath, CLAUDE_EDIT_FLAGS, {
      cwd: process.cwd(), input: JSON.stringify(third), encoding: "utf8", timeout: 7_000, env: baseEnv,
    });
    expect(thirdResult.status).toBe(0);
    const output = JSON.parse(thirdResult.stdout) as { hookSpecificOutput?: { additionalContext: string } };
    expect(output.hookSpecificOutput?.additionalContext).toContain("FirstCount");
    expect(output.hookSpecificOutput?.additionalContext).toContain("SecondCount");
  });

  it("bounds the encoded installed response for multiple review units", async () => {
    const root = await makeGitFixture();
    roots.push(root);
    const statePath = join(root, "consent");
    const names = Array.from({ length: 6 }, (_, index) => `Count${"X".repeat(200)}${index}`);
    const source = `${names.map((name) => `type ${name} = number`).join("\n")}\n`;
    const path = await put(root, "type.ts", source);
    const event = {
      hook_event_name: "PostToolUse", tool_name: "Write", cwd: root,
      session_id: "multi-unit-session", tool_use_id: "multi-unit-tool",
      tool_input: { file_path: path, content: source },
      tool_response: { filePath: path, content: source, originalFile: null, userModified: false },
    };
    const env = { ...process.env, REVIEW_STATE_PATH: statePath,
      REVIEW_RESIDENT_DIR: join(root, "runtime"),
      REVIEW_CONTROL_JSON: JSON.stringify({ answers: Object.fromEntries(configuredRules.map((rule) => [
        rule.id, { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
      ])) }),
    };
    expect(preClaudeEdit(event, env).status).toBe(0);
    const result = spawnSync(process.execPath, CLAUDE_EDIT_FLAGS, {
      cwd: process.cwd(), input: JSON.stringify(event), encoding: "utf8", timeout: 7_000, env,
    });
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout) as { hookSpecificOutput?: { additionalContext: string } };
    const context = output.hookSpecificOutput?.additionalContext ?? "";
    const findingCount = [...context.matchAll(/\[r6_bare_domain_value/g)].length;
    expect(findingCount).toBeGreaterThan(0);
    expect(Buffer.byteLength(result.stdout, "utf8")).toBeLessThanOrEqual(MAX_COMBINED_RESPONSE_BYTES);
    expect(readFileSync(path, "utf8")).toBe(source);
  });

  it("submits six ready findings in one encoded Claude background response", async () => {
    const root = await makeGitFixture();
    roots.push(root);
    const statePath = join(root, "consent");
    const source = Array.from({ length: 6 }, (_, index) => `type Count${index} = number`).join("\n") + "\n";
    const path = await put(root, "type.ts", source);
    const event = {
      hook_event_name: "PostToolUse", tool_name: "Write", cwd: root,
      session_id: "six-findings-session", tool_use_id: "six-findings-tool",
      tool_input: { file_path: path, content: source },
      tool_response: { filePath: path, content: source, originalFile: null, userModified: false },
    };
    const backendGate = join(root, "release-backend");
    const env = { ...process.env, REVIEW_STATE_PATH: statePath,
      REVIEW_RESIDENT_DIR: join(root, "runtime"),
      REVIEW_RESIDENT_BACKEND_GATE_PATH: backendGate,
      REVIEW_CONTROL_JSON: JSON.stringify({ answers: Object.fromEntries(configuredRules.map((rule) => [
        rule.id, { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
      ])) }),
    };
    expect(preClaudeEdit(event, env).status).toBe(0);
    const edit = spawnSync(process.execPath, CLAUDE_EDIT_FLAGS, {
      cwd: process.cwd(), input: JSON.stringify(event), encoding: "utf8", timeout: 7_000, env,
    });
    expect(edit.status).toBe(0);
    expect(JSON.parse(edit.stdout)).toEqual({});
    writeFileSync(backendGate, "release\n");
    const paths = residentPaths(join(root, "runtime"));
    const owner = await runClient(ensureResident(paths));
    const deadline = Date.now() + 15_000;
    let ready = false;
    let lastStats: unknown;
    while (Date.now() < deadline && !ready) {
      const stats = await runClient(residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: owner.lifetime }));
      lastStats = stats;
      ready = stats.status === "stats" && stats.pendingAdvice === 6 && stats.queued === 0 && stats.running === 0;
      if (!ready) await new Promise<void>((resolve) => setTimeout(resolve, 20));
    }
    expect(ready, JSON.stringify(lastStats)).toBe(true);
    const background = spawnSync(process.execPath,
      ["src/cli.ts", "--controlled-reviewer", "--composed-background-hook", "--composed-host=claude-code"], {
        cwd: process.cwd(), input: JSON.stringify(event), encoding: "utf8", timeout: 7_000, env,
      });
    expect(background.status).toBe(0);
    const output = JSON.parse(background.stdout) as { hookSpecificOutput?: { additionalContext: string } };
    const context = output.hookSpecificOutput?.additionalContext ?? "";
    expect([...context.matchAll(/\[r6_bare_domain_value/g)]).toHaveLength(6);
    for (let index = 0; index < 6; index++) expect(context).toContain(`Count${index}`);
    expect(Buffer.byteLength(background.stdout, "utf8")).toBeLessThanOrEqual(MAX_COMBINED_RESPONSE_BYTES);
    expect(readFileSync(path, "utf8")).toBe(source);
  });

  it("delivers a finding while another unit fails and records both facts", async () => {
    const root = await makeGitFixture();
    roots.push(root);
    const statePath = join(root, "consent");
    const activityPath = join(root, "activity.jsonl");
    const source = "type GoodCount = number\ntype FailedCount = number\n";
    const path = await put(root, "type.ts", source);
    const event = {
      hook_event_name: "PostToolUse", tool_name: "Write", cwd: root,
      session_id: "mixed-session", tool_use_id: "mixed-tool",
      tool_input: { file_path: path, content: source },
      tool_response: { filePath: path, content: source, originalFile: null, userModified: false },
    };
    const env = { ...process.env, REVIEW_STATE_PATH: statePath,
      REVIEW_ACTIVITY_PATH: activityPath, REVIEW_RESIDENT_DIR: join(root, "runtime"),
      REVIEW_CONTROL_JSON: JSON.stringify({ failureOnSourceIncludes: "FailedCount",
        answers: Object.fromEntries(configuredRules.map((rule) => [
          rule.id, { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
        ])) }),
    };
    expect(preClaudeEdit(event, env).status).toBe(0);
    const result = spawnSync(process.execPath, CLAUDE_EDIT_FLAGS, {
      cwd: process.cwd(), input: JSON.stringify(event), encoding: "utf8", timeout: 7_000, env,
    });
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout) as { hookSpecificOutput?: { additionalContext: string } };
    expect(output.hookSpecificOutput?.additionalContext).toContain("GoodCount");
    expect(output.hookSpecificOutput?.additionalContext).not.toContain("FailedCount");
    const paths = residentPaths(join(root, "runtime"));
    const owner = await runClient(ensureResident(paths));
    const deadline = Date.now() + 3_000;
    let activity = readActivity({ statePath: activityPath, root,
      sessionId: event.session_id, resident: { available: true, lifetime: owner.lifetime } });
    while (Date.now() < deadline && activity.counts.unavailable === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      activity = readActivity({ statePath: activityPath, root,
        sessionId: event.session_id, resident: { available: true, lifetime: owner.lifetime } });
    }
    expect(activity.findings).toBeGreaterThan(0);
    expect(activity.counts.unavailable).toBeGreaterThan(0);
    expect(readFileSync(path, "utf8")).toBe(source);
  });

  it("does not turn a lost resident's pending Claude work into clear or submitted advice", async () => {
    const root = await makeGitFixture();
    roots.push(root);
    const statePath = join(root, "consent");
    const event = (path: string, name: string, toolUseId: string) => ({
      hook_event_name: "PostToolUse", tool_name: "Write", cwd: root,
      session_id: "restart-session", tool_use_id: toolUseId,
      tool_input: { file_path: path, content: `type ${name} = number\n` },
      tool_response: { filePath: path, content: `type ${name} = number\n`, originalFile: null, userModified: false },
    });
    const baseEnv = { ...process.env, REVIEW_STATE_PATH: statePath,
      REVIEW_RESIDENT_DIR: join(root, "runtime"),
      REVIEW_CONTROL_JSON: JSON.stringify({ answers: Object.fromEntries(configuredRules.map((rule) => [
        rule.id, { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
      ])) }),
    };
    const first = event(await put(root, "first.ts", "type LostCount = number\n"), "LostCount", "lost-tool");
    const delayedEnv = { ...baseEnv, REVIEW_CONTROL_JSON: JSON.stringify({ delayMs: 10_000,
      answers: JSON.parse(baseEnv.REVIEW_CONTROL_JSON).answers }) };
    expect(preClaudeEdit(first, delayedEnv).status).toBe(0);
    const firstResult = spawnSync(process.execPath, CLAUDE_EDIT_FLAGS, {
      cwd: process.cwd(), input: JSON.stringify(first), encoding: "utf8", timeout: 7_000, env: delayedEnv,
    });
    expect(firstResult.status).toBe(0);
    expect(JSON.parse(firstResult.stdout)).toEqual({});
    const paths = residentPaths(join(root, "runtime"));
    const oldOwner = await runClient(ensureResident(paths));
    process.kill(oldOwner.pid, "SIGKILL");
    const newOwner = await runClient(ensureResident(paths));
    expect(newOwner.lifetime).not.toBe(oldOwner.lifetime);
    const stale = await runClient(residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: newOwner.lifetime }));
    expect(stale).toMatchObject({ status: "stats", pendingAdvice: 0 });
    const second = event(await put(root, "second.ts", "type FreshCount = number\n"), "FreshCount", "fresh-tool");
    expect(preClaudeEdit(second, baseEnv).status).toBe(0);
    const secondResult = spawnSync(process.execPath, CLAUDE_EDIT_FLAGS, {
      cwd: process.cwd(), input: JSON.stringify(second), encoding: "utf8", timeout: 7_000, env: baseEnv,
    });
    expect(secondResult.status).toBe(0);
    expect(JSON.parse(secondResult.stdout)).toMatchObject({ hookSpecificOutput: {
      additionalContext: expect.stringContaining("FreshCount"),
    } });
    expect(secondResult.stdout).not.toContain("LostCount");
  });

  it("accepts only the current IPC frame at the installed resident socket", async () => {
    const root = await makeGitFixture();
    roots.push(root);
    const statePath = join(root, "consent");
    const path = await put(root, "type.ts", "type ProtocolCount = number\n");
    const event = {
      hook_event_name: "PostToolUse", tool_name: "Write", cwd: root,
      session_id: "protocol-session", tool_use_id: "protocol-tool",
      tool_input: { file_path: path, content: "type ProtocolCount = number\n" },
      tool_response: { filePath: path, content: "type ProtocolCount = number\n", originalFile: null, userModified: false },
    };
    const env = { ...process.env, REVIEW_STATE_PATH: statePath, REVIEW_RESIDENT_DIR: join(root, "runtime") };
    expect(preClaudeEdit(event, env).status).toBe(0);
    const paths = residentPaths(join(root, "runtime"));
    const owner = await runClient(ensureResident(paths));
    const raw = (frame: string) => new Promise<unknown>((resolve, reject) => {
      const socket = createConnection(paths.socket);
      let response = "";
      socket.once("error", reject);
      socket.on("data", (chunk: Buffer) => { response += chunk.toString("utf8"); });
      socket.once("end", () => {
        try { resolve(JSON.parse(response.trim())); } catch (error) { reject(error); }
      });
      socket.once("connect", () => socket.write(`${frame}\n`));
    });
    expect(await raw(encodeCurrentResidentRequest({ requestRoute: "shared", operation: "hello" })))
      .toMatchObject({ version: 1, status: "ready", lifetime: owner.lifetime });
    for (const frame of ['{"version":1,', JSON.stringify({ operation: "hello" }),
      JSON.stringify({ version: 1, requestRoute: "shared", operation: "hello" })]) {
      expect(await raw(frame)).toEqual({ version: 1, status: "unsupported" });
    }
  });

  it.each([
    ["unversioned advice", JSON.stringify({ status: "advice", token: "forged-token",
      findingCount: 1, output: { hookSpecificOutput: {
        hookEventName: "PostToolUse", additionalContext: "forged advice",
      } } })],
    ["malformed response", '{"version":1,"status":'],
  ])("treats a %s from the resident socket as unavailable in the installed hook", async (_case, reply) => {
    const root = await makeGitFixture();
    roots.push(root);
    const statePath = join(root, "consent");
    const activityPath = join(root, "activity");
    const path = await put(root, "type.ts", "type ProtocolCount = number\n");
    const event = {
      hook_event_name: "PostToolUse", tool_name: "Write", cwd: root,
      session_id: "response-session", tool_use_id: "response-tool",
      tool_input: { file_path: path, content: "type ProtocolCount = number\n" },
      tool_response: { filePath: path, content: "type ProtocolCount = number\n", originalFile: null, userModified: false },
    };
    const paths = residentPaths(join(root, "runtime"));
    mkdirSync(paths.directory, { recursive: true, mode: 0o700 });
    const operations: string[] = [];
    const versions: number[] = [];
    const fakeResident = createServer((socket) => {
      let frame = "";
      socket.on("data", (chunk: Buffer) => {
        frame += chunk.toString("utf8");
        const newline = frame.indexOf("\n");
        if (newline < 0) return;
        const request = JSON.parse(frame.slice(0, newline)) as { operation: string; version: number; ticketed?: boolean };
        operations.push(request.operation);
        versions.push(request.version);
        const response = request.operation === "hello"
          ? JSON.stringify({ version: 1, status: "ready", lifetime: "fake-lifetime", pid: process.pid })
          : request.operation === "admit" && request.ticketed === true
            ? JSON.stringify({ version: 1, status: "accepted",
                ticket: { nonce: "fake-ticket", lifetime: "fake-lifetime" } })
            : request.operation === "collect"
              ? reply
              : JSON.stringify({ version: 1, status: "unsupported" });
        socket.end(`${response}\n`);
      });
    });
    await new Promise<void>((resolve, reject) => {
      fakeResident.once("error", reject);
      fakeResident.listen(paths.socket, resolve);
    });
    chmodSync(paths.socket, 0o600);
    try {
      const env = { ...process.env, REVIEW_STATE_PATH: statePath,
        REVIEW_ACTIVITY_PATH: activityPath, REVIEW_RESIDENT_DIR: paths.directory };
      const child = spawn(process.execPath, CLAUDE_EDIT_FLAGS, { cwd: process.cwd(), env,
        stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
      const completed = new Promise<number | null>((resolve, reject) => {
        const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("installed hook did not exit")); }, 7_000);
        child.once("error", (error) => { clearTimeout(timer); reject(error); });
        child.once("close", (code) => { clearTimeout(timer); resolve(code); });
      });
      child.stdin.end(JSON.stringify(event));
      expect(await completed, stderr).toBe(0);
      expect(JSON.parse(stdout)).toEqual({});
      expect(stdout).not.toContain("forged advice");
      expect(operations).toContain("collect");
      expect(versions.every((version) => version === 1)).toBe(true);
      expect(operations).not.toContain("begin-submission");
      expect(operations).not.toContain("acknowledge");
      expect(operations).not.toContain("finalize");
      const activity = readActivity({ statePath: activityPath, root,
        sessionId: event.session_id, resident: { available: true, lifetime: "fake-lifetime" } });
      expect(activity.counts.clear).toBe(0);
      expect(activity.counts.submitted).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) => fakeResident.close((error) =>
        error === undefined ? resolve() : reject(error)));
    }
  });

  it("fences one finding across concurrent installed edit, background, and Stop collectors", async () => {
    const root = await makeGitFixture();
    roots.push(root);
    const statePath = join(root, "consent");
    const path = await put(root, "type.ts", "type ConcurrentCount = number\n");
    const edit = {
      hook_event_name: "PostToolUse", tool_name: "Write", cwd: root,
      session_id: "concurrent-session", tool_use_id: "concurrent-tool",
      tool_input: { file_path: path, content: "type ConcurrentCount = number\n" },
      tool_response: { filePath: path, content: "type ConcurrentCount = number\n", originalFile: null, userModified: false },
    };
    const acceptedPath = join(root, "admission-accepted");
    const env = { ...process.env, REVIEW_STATE_PATH: statePath,
      REVIEW_RESIDENT_DIR: join(root, "runtime"), REVIEW_RESIDENT_ADMISSION_ACCEPTED_PATH: acceptedPath,
      REVIEW_CONTROL_JSON: JSON.stringify({ delayMs: 1_200,
        answers: Object.fromEntries(configuredRules.map((rule) => [
          rule.id, { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
        ])) }),
    };
    expect(preClaudeEdit(edit, env).status).toBe(0);
    const run = (flags: ReadonlyArray<string>, input: unknown, timeoutMs: number) =>
      new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn(process.execPath, ["src/cli.ts", ...flags], { cwd: process.cwd(), env,
          stdio: ["pipe", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
        child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
        const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("collector exceeded deadline")); }, timeoutMs);
        child.once("error", (error) => { clearTimeout(timer); reject(error); });
        child.once("close", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
        child.stdin.end(JSON.stringify(input));
      });
    const editResult = run(CLAUDE_EDIT_FLAGS.slice(1), edit, 7_000);
    await waitForFile(acceptedPath);
    const backgroundResult = run(["--controlled-reviewer", "--composed-background-hook", "--composed-host=claude-code"], edit, 23_000);
    const stopResult = run(["--controlled-reviewer", "--composed-stop-hook", "--composed-host=claude-code"], {
      hook_event_name: "Stop", cwd: root, session_id: edit.session_id, stop_hook_active: false,
    }, 7_000);
    const [sync, background, stop] = await Promise.all([editResult, backgroundResult, stopResult]);
    for (const result of [sync, background, stop]) expect(result.code, result.stderr).toBe(0);
    const outputs = [sync, background, stop].map((result) => result.stdout.trim() === ""
      ? {} : JSON.parse(result.stdout) as Record<string, unknown>);
    const containsFinding = (output: Record<string, unknown> | undefined) =>
      JSON.stringify(output ?? {}).includes("ConcurrentCount");
    expect(outputs.filter(containsFinding).length).toBeGreaterThanOrEqual(1);
    expect(outputs.filter(containsFinding).length).toBeLessThanOrEqual(2);
    expect([outputs[0], outputs[1]].filter(containsFinding).length).toBeLessThanOrEqual(1);
    for (const result of [sync, background, stop]) {
      expect(Buffer.byteLength(result.stdout, "utf8")).toBeLessThanOrEqual(MAX_COMBINED_RESPONSE_BYTES);
    }
    expect(readFileSync(path, "utf8")).toBe("type ConcurrentCount = number\n");
  }, 40_000);

  it("returns quietly at the edit budget and offers slow advice to background", async () => {
    const root = await makeGitFixture();
    roots.push(root);
    const statePath = join(root, "consent");
    const path = await put(root, "type.ts", "type OrderCount = number\n");
    const event = {
      hook_event_name: "PostToolUse", tool_name: "Write", cwd: root,
      session_id: "slow-session", tool_use_id: "slow-tool",
      tool_input: { file_path: path, content: "type OrderCount = number\n" },
      tool_response: { filePath: path, content: "type OrderCount = number\n", originalFile: null, userModified: false },
    };
    const env = { ...process.env, REVIEW_STATE_PATH: statePath, REVIEW_RESIDENT_DIR: join(root, "runtime"),
      REVIEW_CONTROL_JSON: JSON.stringify({ delayMs: 10_000, answers: Object.fromEntries(configuredRules.map((rule) => [
        rule.id, { _tag: "Probability", probability: 0.9 },
      ])) }),
    };
    expect(preClaudeEdit(event, env).status).toBe(0);
    const started = performance.now();
    const result = spawnSync(process.execPath, CLAUDE_EDIT_FLAGS, {
      cwd: process.cwd(),
      input: JSON.stringify(event),
      encoding: "utf8", timeout: 7_000,
      env,
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({});
    expect(performance.now() - started).toBeLessThan(5_000);
    const background = spawnSync(process.execPath,
      ["src/cli.ts", "--controlled-reviewer", "--composed-background-hook", "--composed-host=claude-code"], {
        cwd: process.cwd(), input: JSON.stringify(event), encoding: "utf8", timeout: 22_000, env,
      });
    expect(background.status).toBe(0);
    expect(JSON.parse(background.stdout)).toMatchObject({ hookSpecificOutput: {
      hookEventName: "PostToolUse", additionalContext: expect.stringContaining("OrderCount"),
    } });
    expect(readFileSync(path, "utf8")).toBe("type OrderCount = number\n");
  });

  it("waits for unfinished admitted work and offers its finding at Stop", async () => {
    const root = await makeGitFixture();
    roots.push(root);
    const statePath = join(root, "consent");
    const path = await put(root, "type.ts", "type StopCount = number\n");
    const event = {
      hook_event_name: "PostToolUse", tool_name: "Write", cwd: root,
      session_id: "stop-session", tool_use_id: "stop-tool",
      tool_input: { file_path: path, content: "type StopCount = number\n" },
      tool_response: { filePath: path, content: "type StopCount = number\n", originalFile: null, userModified: false },
    };
    const env = { ...process.env, REVIEW_STATE_PATH: statePath, REVIEW_RESIDENT_DIR: join(root, "runtime"),
      REVIEW_CONTROL_JSON: JSON.stringify({ delayMs: 5_000,
        answers: Object.fromEntries(configuredRules.map((rule) => [
          rule.id, { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
        ])) }),
    };
    expect(preClaudeEdit(event, env).status).toBe(0);
    const edit = spawnSync(process.execPath, CLAUDE_EDIT_FLAGS, {
      cwd: process.cwd(), input: JSON.stringify(event), encoding: "utf8", timeout: 7_000, env,
    });
    expect(edit.status).toBe(0);
    expect(JSON.parse(edit.stdout)).toEqual({});
    const stop = spawnSync(process.execPath,
      ["src/cli.ts", "--controlled-reviewer", "--composed-stop-hook", "--composed-host=claude-code"], {
        cwd: process.cwd(), encoding: "utf8", timeout: 7_000, env,
        input: JSON.stringify({ hook_event_name: "Stop", cwd: root, session_id: event.session_id,
          stop_hook_active: false }),
      });
    expect(stop.status).toBe(0);
    expect(JSON.parse(stop.stdout)).toMatchObject({ decision: "block", reason: expect.stringContaining("StopCount") });
    expect(Buffer.byteLength(stop.stdout, "utf8")).toBeLessThanOrEqual(MAX_COMBINED_RESPONSE_BYTES);
    expect(readFileSync(path, "utf8")).toBe("type StopCount = number\n");
  });

  it("does not acknowledge a Claude lease when stdout reports a write error", async () => {
    const root = await makeGitFixture();
    roots.push(root);
    const statePath = join(root, "consent");
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
    expect(preClaudeEdit(event, env).status).toBe(0);
    const child = spawn(process.execPath, CLAUDE_EDIT_FLAGS, {
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
    const owner = await runClient(ensureResident(paths));
    const stats = await runClient(residentRequest(paths, {
      requestRoute: "shared",
      operation: "stats",
      lifetime: owner.lifetime,
    }));
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
