import { prepareTestPackage, type TestPackage } from "../test-support/test-package.ts";
import { cleanupOwnedResident } from "../../scripts/test-harness/cleanup-owned-resident.mjs";
import { runClient } from "../test-support/client-runtime.ts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { execFile, spawn } from "node:child_process";
import { spawnSync } from "../../scripts/test-harness/process.mjs";
import { DEFAULT_CHILD_TIMEOUT_MS, FIXTURE_READY_TIMEOUT_MS } from "../../scripts/test-harness/policy.mjs";
import { createConnection, createServer } from "node:net";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readActivity } from "../activity/status.ts";
import { configuredRules } from "../policy/rules.ts";
import { makeGitFixture, put } from "./test-fixtures.ts";
import { residentRequestEffect as residentRequest } from "../resident/client.ts";
import { residentPaths } from "../resident/paths.ts";
import { encodeCurrentResidentRequest } from "../resident/protocol.ts";
import { MAX_COMBINED_RESPONSE_BYTES } from "../resident/collection.ts";

let installed: TestPackage;
beforeAll(() => { installed = prepareTestPackage(); }, 240_000);
afterAll(() => { if (roots.length === 0) installed?.cleanup(); });
const roots: Array<string> = [];
afterEach(async () => {
  const failures: unknown[] = [];
  for (const root of [...roots]) {
    try {
      await cleanupOwnedResident(join(root, "runtime"), [installed.resident]);
      rmSync(root, { recursive: true, force: true });
      roots.splice(roots.indexOf(root), 1);
    } catch (error) { failures.push(error); }
  }
  if (failures.length > 0) throw new AggregateError(failures, "Retaining uncertain Claude fixture ownership");
});
const cliArgs = (flags: readonly string[]) => [...installed.cli.args, ...flags];
const observeResident = async (paths: ReturnType<typeof residentPaths>) => {
  const response = await runClient(residentRequest(paths, { requestRoute: "shared", operation: "hello" }));
  if (response.status !== "ready") throw new Error("installed resident observer did not receive ready");
  return response;
};

const preClaudeEdit = (event: Readonly<Record<string, unknown>>, env: NodeJS.ProcessEnv) =>
  spawnSync(installed.cli.executable, cliArgs(["--composed-before-edit-hook", "--composed-host=claude-code"]), {
    cwd: process.cwd(), input: JSON.stringify({ ...event, hook_event_name: "PreToolUse" }),
    encoding: "utf8", timeout: DEFAULT_CHILD_TIMEOUT_MS, env,
  });

const preClaudeEditAsync = (event: Readonly<Record<string, unknown>>, env: NodeJS.ProcessEnv) =>
  new Promise<void>((resolve, reject) => {
    const child = execFile(installed.cli.executable, cliArgs(["--composed-before-edit-hook", "--composed-host=claude-code"]), {
      cwd: process.cwd(), timeout: DEFAULT_CHILD_TIMEOUT_MS, killSignal: "SIGKILL", env,
    }, error => error === null ? resolve() : reject(error));
    child.stdin!.end(JSON.stringify({ ...event, hook_event_name: "PreToolUse" }));
  });

// Start the physical installed resident with the complete gate environment.
// Source observers only read IPC; they never launch a second source resident.
const prepareResident = async (env: NodeJS.ProcessEnv) => {
  const paths = residentPaths(env.REVIEW_RESIDENT_DIR!);
  try { return await observeResident(paths); } catch { /* no live installed resident yet */ }
  const child = spawn(installed.resident.executable, [...installed.resident.args, paths.directory], {
    cwd: process.cwd(), env, detached: true, stdio: "ignore",
  });
  let startupFailure: Error | undefined;
  child.once("error", error => { startupFailure = error; });
  child.once("exit", (code, signal) => {
    startupFailure = new Error(`fixture phase=installed resident exited before readiness: code=${code} signal=${signal}`);
  });
  child.unref();
  const deadline = Date.now() + FIXTURE_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (startupFailure !== undefined) throw startupFailure;
    try { return await observeResident(paths); } catch { /* wait for the owned listener */ }
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("fixture phase=installed resident readiness exceeded preparation bound");
};

const CLAUDE_EDIT_FLAGS = [ "--claude-hook", "--controlled-reviewer",
  "--controlled-writer", "--composed-edit-hook"] as const;

const waitForFile = async (path: string, timeoutMs = FIXTURE_READY_TIMEOUT_MS): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`fixture gate was not reached: ${path}`);
};

// Keep diagnostic receipts source-free: they distinguish a quiet refusal from
// admitted work without recording hook payloads or controlled request bodies.
const controlledFixtureEvidence = (root: string) => {
  const records = (name: string): Record<string, unknown>[] => {
    const path = join(root, name);
    return existsSync(path)
      ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line))
      : [];
  };
  return {
    requests: records("request-summary.jsonl").length,
    outcomes: records("controlled-outcomes.jsonl").map(record => record.outcome),
  };
};
const cliExitEvidence = (result: { status: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; error?: Error }) => ({
  status: result.status,
  signal: result.signal,
  errorCode: (result.error as NodeJS.ErrnoException | undefined)?.code,
  stdoutBytes: Buffer.byteLength(result.stdout),
  emptyObject: result.stdout.trim() === "{}",
  stderrBytes: Buffer.byteLength(result.stderr),
});

describe("Claude synchronous hook CLI", () => {
  it("exits quietly when unsupported hook input meets closed stdout", async () => {
    const child = spawn(installed.cli.executable, cliArgs(CLAUDE_EDIT_FLAGS), {
      cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"], env: installed.environment,
    });
    child.stderr.resume();
    const completed = new Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>((resolve, reject) => {
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("quiet hook did not exit")); }, DEFAULT_CHILD_TIMEOUT_MS);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("close", (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
    });
    child.stdout.destroy();
    child.stdin.end("{}");
    expect(await completed).toEqual({ code: 0, signal: null });
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
    const env = { ...installed.environment, REVIEW_STATE_PATH: statePath,
      REVIEW_USER_CONFIG_PATH: userConfigPath, REVIEW_RESIDENT_DIR: join(root, "runtime"),
      REVIEW_RESIDENT_COLLECT_ADVICE_RESPONSE_GATE_PATH: gate,
      REVIEW_CONTROL_JSON: JSON.stringify({ answers: Object.fromEntries(configuredRules.map((rule) => [
        rule.id, { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
      ])) }),
    };
    await prepareResident(env);
    expect(preClaudeEdit(event, env).status).toBe(0);
    writeFileSync(`${gate}.enabled`, "enabled\n");
    const child = spawn(installed.cli.executable, cliArgs(CLAUDE_EDIT_FLAGS), { cwd: process.cwd(), env,
      stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    const completed = new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Claude hook did not exit")); }, DEFAULT_CHILD_TIMEOUT_MS);
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
      const owner = await observeResident(paths);
      const stats = await runClient(residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: owner.lifetime }));
      expect(stats).toMatchObject({ status: "stats", pendingAdvice: 1 });
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
    const baseEnv = { ...installed.environment, REVIEW_STATE_PATH: statePath,
      REVIEW_RESIDENT_DIR: join(root, "runtime"),
      REVIEW_RESIDENT_ADMISSION_ACCEPTED_PATH: acceptedPath,
      REVIEW_CONTROL_JSON: JSON.stringify({ answers: Object.fromEntries(configuredRules.map((rule) => [
        rule.id, { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
      ])) }),
    };
    const delayedEnv = { ...baseEnv, REVIEW_CONTROL_JSON: JSON.stringify({ delayMs: 7_000,
      answers: JSON.parse(baseEnv.REVIEW_CONTROL_JSON).answers }) };
    await prepareResident(delayedEnv);
    const first = event(await put(root, "first.ts", "type FirstCount = number\n"), "FirstCount", "batch-first");
    const second = event(await put(root, "second.ts", "type SecondCount = number\n"), "SecondCount", "batch-second");
    const runDelayed = (input: typeof first) => new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(installed.cli.executable, cliArgs(CLAUDE_EDIT_FLAGS), { cwd: process.cwd(), env: delayedEnv,
        stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Claude edit hook exceeded its deadline")); }, DEFAULT_CHILD_TIMEOUT_MS);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("close", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
      child.stdin.end(JSON.stringify(input));
    });
    await prepareResident(delayedEnv);
    expect(preClaudeEdit(first, delayedEnv).status).toBe(0);
    const firstPending = runDelayed(first);
    await waitForFile(acceptedPath);
    await preClaudeEditAsync(second, delayedEnv);
    const secondPending = runDelayed(second);
    const [firstResult, secondResult] = await Promise.all([firstPending, secondPending]);
    expect(firstResult.code, firstResult.stderr).toBe(0);
    expect(secondResult.code, secondResult.stderr).toBe(0);
    expect(JSON.parse(firstResult.stdout)).toEqual({});
    expect(JSON.parse(secondResult.stdout)).toEqual({});
    const paths = residentPaths(join(root, "runtime"));
    const owner = await observeResident(paths);
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
    await prepareResident(baseEnv);
    expect(preClaudeEdit(third, baseEnv).status).toBe(0);
    const thirdResult = spawnSync(installed.cli.executable, cliArgs(CLAUDE_EDIT_FLAGS), {
      cwd: process.cwd(), input: JSON.stringify(third), encoding: "utf8", timeout: DEFAULT_CHILD_TIMEOUT_MS, env: baseEnv,
    });
    expect(thirdResult.status).toBe(0);
    const output = JSON.parse(thirdResult.stdout) as { hookSpecificOutput?: { additionalContext: string } };
    expect(output.hookSpecificOutput?.additionalContext).toContain("FirstCount");
    expect(output.hookSpecificOutput?.additionalContext).toContain("SecondCount");
  });

  it("submits one ready finding through the installed Stop command", async () => {
    const root = await makeGitFixture();
    roots.push(root);
    const statePath = join(root, "consent");
    const source = Array.from({ length: 1 }, (_, index) => `type Count${index} = number`).join("\n") + "\n";
    const path = await put(root, "type.ts", source);
    const event = {
      hook_event_name: "PostToolUse", tool_name: "Write", cwd: root,
      session_id: "six-findings-session", tool_use_id: "six-findings-tool",
      tool_input: { file_path: path, content: source },
      tool_response: { filePath: path, content: source, originalFile: null, userModified: false },
    };
    const backendGate = join(root, "release-backend");
    const env = { ...installed.environment, REVIEW_STATE_PATH: statePath,
      REVIEW_RESIDENT_DIR: join(root, "runtime"),
      REVIEW_RESIDENT_BACKEND_GATE_PATH: backendGate,
      REVIEW_CONTROL_JSON: JSON.stringify({ requestSummaryPath: join(root, "request-summary.jsonl"),
        outcomePath: join(root, "controlled-outcomes.jsonl"), answers: Object.fromEntries(configuredRules.map((rule) => [
        rule.id, { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
      ])) }),
    };
    const owner = await prepareResident(env);
    expect(preClaudeEdit(event, env).status).toBe(0);
    const edit = spawnSync(installed.cli.executable, cliArgs(CLAUDE_EDIT_FLAGS), {
      cwd: process.cwd(), input: JSON.stringify(event), encoding: "utf8", timeout: DEFAULT_CHILD_TIMEOUT_MS, env,
    });
    expect(edit.status, JSON.stringify(cliExitEvidence(edit))).toBe(0);
    expect(JSON.parse(edit.stdout)).toEqual({});
    writeFileSync(backendGate, "release\n");
    const paths = residentPaths(join(root, "runtime"));
    const deadline = Date.now() + 15_000;
    let ready = false;
    let lastStats: unknown;
    while (Date.now() < deadline && !ready) {
      try {
        const stats = await runClient(residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: owner.lifetime }));
        lastStats = stats;
        ready = stats.status === "stats" && stats.pendingAdvice === 1 && stats.queued === 0 && stats.running === 0;
      } catch (error) {
        lastStats = { observerError: error instanceof Error ? error.name : "unknown" };
      }
      if (!ready) await new Promise<void>((resolve) => setTimeout(resolve, 20));
    }
    expect(ready, JSON.stringify({ stats: lastStats, edit: cliExitEvidence(edit), ...controlledFixtureEvidence(root) })).toBe(true);
    const stop = spawnSync(installed.cli.executable,
      cliArgs([ "--controlled-reviewer", "--composed-stop-hook", "--composed-host=claude-code"]), {
        cwd: process.cwd(), encoding: "utf8", timeout: DEFAULT_CHILD_TIMEOUT_MS, env,
        input: JSON.stringify({ hook_event_name: "Stop", cwd: root, session_id: event.session_id, stop_hook_active: false }),
      });
    expect(stop.status).toBe(0);
    const output = JSON.parse(stop.stdout) as { decision?: string; reason?: string };
    expect(output.decision, JSON.stringify(output)).toBe("block");
    const context = output.reason ?? "";
    expect([...context.matchAll(/A domain value appears to use an overly broad primitive type\./g)]).toHaveLength(1);
    for (let index = 0; index < 1; index++) expect(context).toContain(`Count${index}`);
    expect(Buffer.byteLength(stop.stdout, "utf8")).toBeLessThanOrEqual(MAX_COMBINED_RESPONSE_BYTES);
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
    const baseEnv = { ...installed.environment, REVIEW_STATE_PATH: statePath,
      REVIEW_RESIDENT_DIR: join(root, "runtime"),
      REVIEW_CONTROL_JSON: JSON.stringify({ answers: Object.fromEntries(configuredRules.map((rule) => [
        rule.id, { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
      ])) }),
    };
    const first = event(await put(root, "first.ts", "type LostCount = number\n"), "LostCount", "lost-tool");
    const delayedEnv = { ...baseEnv, REVIEW_CONTROL_JSON: JSON.stringify({ delayMs: 10_000,
      answers: JSON.parse(baseEnv.REVIEW_CONTROL_JSON).answers }) };
    await prepareResident(delayedEnv);
    expect(preClaudeEdit(first, delayedEnv).status).toBe(0);
    const firstResult = spawnSync(installed.cli.executable, cliArgs(CLAUDE_EDIT_FLAGS), {
      cwd: process.cwd(), input: JSON.stringify(first), encoding: "utf8", timeout: DEFAULT_CHILD_TIMEOUT_MS, env: delayedEnv,
    });
    expect(firstResult.status).toBe(0);
    expect(JSON.parse(firstResult.stdout)).toEqual({});
    const paths = residentPaths(join(root, "runtime"));
    const oldOwner = await observeResident(paths);
    await cleanupOwnedResident(paths.directory, [installed.resident]);
    const newOwner = await prepareResident(baseEnv);
    expect(newOwner.lifetime).not.toBe(oldOwner.lifetime);
    const stale = await runClient(residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: newOwner.lifetime }));
    expect(stale).toMatchObject({ status: "stats", pendingAdvice: 0 });
    const second = event(await put(root, "second.ts", "type FreshCount = number\n"), "FreshCount", "fresh-tool");
    await prepareResident(baseEnv);
    expect(preClaudeEdit(second, baseEnv).status).toBe(0);
    const secondResult = spawnSync(installed.cli.executable, cliArgs(CLAUDE_EDIT_FLAGS), {
      cwd: process.cwd(), input: JSON.stringify(second), encoding: "utf8", timeout: DEFAULT_CHILD_TIMEOUT_MS, env: baseEnv,
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
    const env = { ...installed.environment, REVIEW_STATE_PATH: statePath, REVIEW_RESIDENT_DIR: join(root, "runtime") };
    await prepareResident(env);
    expect(preClaudeEdit(event, env).status).toBe(0);
    const paths = residentPaths(join(root, "runtime"));
    const owner = await observeResident(paths);
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
        const request = JSON.parse(frame.slice(0, newline)) as { operation: string; version: number };
        operations.push(request.operation);
        versions.push(request.version);
        const response = request.operation === "hello"
          ? JSON.stringify({ version: 1, status: "ready", lifetime: "fake-lifetime", pid: process.pid })
          : request.operation === "admit-and-collect"
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
      const env = { ...installed.environment, REVIEW_STATE_PATH: statePath,
        REVIEW_ACTIVITY_PATH: activityPath, REVIEW_RESIDENT_DIR: paths.directory };
      const child = spawn(installed.cli.executable, cliArgs(CLAUDE_EDIT_FLAGS), { cwd: process.cwd(), env,
        stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
      const completed = new Promise<number | null>((resolve, reject) => {
        const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("installed hook did not exit")); }, DEFAULT_CHILD_TIMEOUT_MS);
        child.once("error", (error) => { clearTimeout(timer); reject(error); });
        child.once("close", (code) => { clearTimeout(timer); resolve(code); });
      });
      child.stdin.end(JSON.stringify(event));
      expect(await completed, stderr).toBe(0);
      expect(JSON.parse(stdout)).toEqual({});
      expect(stdout).not.toContain("forged advice");
      expect(operations).toContain("admit-and-collect");
      expect(operations).not.toContain("admit");
      expect(operations).not.toContain("collect");
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

  it("returns quietly at the edit budget without a Claude background delivery", async () => {
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
    const env = { ...installed.environment, REVIEW_STATE_PATH: statePath, REVIEW_RESIDENT_DIR: join(root, "runtime"),
      REVIEW_CONTROL_JSON: JSON.stringify({ delayMs: 10_000, answers: Object.fromEntries(configuredRules.map((rule) => [
        rule.id, { _tag: "Probability", probability: 0.9 },
      ])) }),
    };
    await prepareResident(env);
    expect(preClaudeEdit(event, env).status).toBe(0);
    const started = performance.now();
    const result = spawnSync(installed.cli.executable, cliArgs(CLAUDE_EDIT_FLAGS), {
      cwd: process.cwd(),
      input: JSON.stringify(event),
      encoding: "utf8", timeout: DEFAULT_CHILD_TIMEOUT_MS,
      env,
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({});
    expect(performance.now() - started).toBeLessThan(5_000);
    const background = spawnSync(installed.cli.executable,
      cliArgs([ "--controlled-reviewer", "--composed-background-hook", "--composed-host=claude-code"]), {
        cwd: process.cwd(), input: JSON.stringify(event), encoding: "utf8", timeout: DEFAULT_CHILD_TIMEOUT_MS, env,
      });
    expect(background.status).toBe(0);
    expect(background.stdout).toBe("");
    expect(readFileSync(path, "utf8")).toBe("type OrderCount = number\n");
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
      ...installed.environment,
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
    await prepareResident(env);
    expect(preClaudeEdit(event, env).status).toBe(0);
    const child = spawn(installed.cli.executable, cliArgs(CLAUDE_EDIT_FLAGS), {
      cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"], env,
    });
    let writerStderr = "";
    child.stderr.on("data", (chunk: Buffer) => { writerStderr = (writerStderr + chunk.toString("utf8")).slice(-1_024); });
    const completed = new Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("Claude hook did not exit within its output deadline"));
      }, DEFAULT_CHILD_TIMEOUT_MS);
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
    expect(result.code, JSON.stringify({ stderrHasEPIPE: writerStderr.includes("EPIPE") })).toBe(0);
    expect(acknowledgeWasRequested).toBe(false);
    const paths = residentPaths(join(root, "runtime"));
    const owner = await observeResident(paths);
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
