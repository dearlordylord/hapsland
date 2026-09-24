import { afterEach, describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Consent } from "../runtime/consent.ts";
import { configuredRules } from "../policy/rules.ts";
import { makeGitFixture, put } from "./test-fixtures.ts";

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
  it("hands ready advice through additionalContext and keeps unsupported events quiet", async () => {
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
    const invoke = (input: unknown) => spawnSync(process.execPath, ["src/cli.ts", "--claude-hook", "--controlled", "--controlled-writer"], {
      cwd: process.cwd(), input: JSON.stringify(input), encoding: "utf8", env, timeout: 7_000,
    });
    const result = invoke(event);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ hookSpecificOutput: {
      hookEventName: "PostToolUse", additionalContext: expect.stringContaining("OrderCount"),
    } });
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
});
