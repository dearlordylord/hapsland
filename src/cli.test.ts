import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { configuredRules } from "./policy/rules.ts";

const roots: Array<string> = [];
// Each case launches the real TypeScript subprocess; concurrent evaluation-suite
// compilation can make that bounded process startup exceed Vitest's 5 s default.
const SUBPROCESS_TEST_TIMEOUT = 30_000;
const makeTemporaryDirectory = (prefix: string): string =>
  realpathSync(mkdtempSync(join(tmpdir(), prefix)));
afterEach(() => {
  for (const root of roots.splice(0)) {
    try {
      const owner = JSON.parse(readFileSync(join(root, "runtime", "owner.json"), "utf8")) as { pid: number };
      process.kill(owner.pid, "SIGTERM");
    } catch {
      // Most tests do not start a resident.
    }
    rmSync(root, { recursive: true, force: true });
  }
});

const initializeRepository = (root: string, requestedStatePath?: string) => {
  execFileSync("git", ["init", "--quiet", root]);
  return requestedStatePath ?? join(root, ".consent-state.json");
};

describe("JSON subprocess contract", { timeout: SUBPROCESS_TEST_TIMEOUT }, () => {
  it("rejects mixed installation host fields and accepts the host-omitted Codex v1 form", () => {
    const root = makeTemporaryDirectory("review-install-schema-");
    roots.push(root);
    const invoke = (request: unknown) => spawnSync(process.execPath, ["src/cli.ts", "--install-preview"], {
      cwd: process.cwd(), input: JSON.stringify(request), encoding: "utf8", timeout: 10_000,
    });
    for (const mixed of [
      { version: 1, operation: "install-preview", host: "claude", claudeHome: root, codexHome: root },
      { version: 1, operation: "install-preview", host: "opencode", opencodeConfigHome: root, claudeHome: root },
      { version: 1, operation: "install-preview", claudeHome: root },
    ]) {
      const result = invoke(mixed);
      expect(result.status).toBe(2);
      expect(JSON.parse(result.stdout)).toMatchObject({ error: { code: "invalid_request" } });
    }
    const codex = invoke({ version: 1, operation: "install-preview", codexHome: root });
    expect(JSON.parse(codex.stdout).operation).toBe("install-preview");
    expect(JSON.parse(codex.stdout).error).toBeUndefined();
  });

  it("reviews a completed edit and reserves stdout for one protocol response", () => {
    const root = makeTemporaryDirectory("review-cli-");
    roots.push(root);
    const statePath = initializeRepository(root);
    mkdirSync(join(root, "src"));
    const content = "export type Counter = { count: number };\n";
    const path = join(root, "src/counter.ts");
    writeFileSync(path, content);
    const input = {
      version: 1,
      event: {
        id: "subprocess-1",
        kind: "successful-edit",
        host: "test",
        cwd: root,
        paths: ["src/counter.ts"],
      },
    };
    const child = spawnSync(process.execPath, ["src/cli.ts", "--controlled-reviewer"], {
      cwd: process.cwd(),
      input: JSON.stringify(input),
      encoding: "utf8",
      env: { ...process.env, REVIEW_CONTROL_JSON: "{}", REVIEW_STATE_PATH: statePath },
    });

    expect(child.status).toBe(0);
    expect(child.stderr).toBe("");
    expect(child.stdout.trim().split("\n")).toHaveLength(1);
    const output = JSON.parse(child.stdout) as {
      results: Array<{ status: string; snapshot?: { contentHash: string } }>;
    };
    expect(output.results[0]).toMatchObject({
      status: "reviewed",
      snapshot: {
        contentHash: createHash("sha256").update(content).digest("hex"),
      },
    });
    expect(readFileSync(path, "utf8")).toBe(content);
  });

  const checkNativeControlledWriterAdd = (hostVersion: "0.155.1" | "0.156.0") => {
    const root = makeTemporaryDirectory("r-");
    roots.push(root);
    const statePath = initializeRepository(root);
    const path = join(root, "pinned.ts");
    writeFileSync(path, "type OrderCount = number\n");
    const pinned = JSON.parse(readFileSync(
      join(process.cwd(), "evidence/codex/0.155.1/post-tool-use-file-create.json"),
      "utf8",
    )) as Record<string, unknown>;
    const input = {
      ...pinned,
      cwd: root,
      session_id: "direct-session",
      turn_id: "direct-turn",
      tool_use_id: "direct-tool",
      tool_input: {
        command: "*** Begin Patch\n*** Add File: pinned.ts\n+type OrderCount = number\n*** End Patch",
      },
    };
    const capturePath = join(root, "resident-backend-calls.txt");
    const control = JSON.stringify({
      answers: Object.fromEntries(configuredRules.map((rule) => [
        rule.id,
        { _tag: "Probability", probability: 0.9 },
      ])),
      capturePath,
    });
    const residentDirectory = join(root, "runtime");
    const residentEnv = {
      ...process.env,
      REVIEW_CONTROL_JSON: control,
      REVIEW_STATE_PATH: statePath,
      REVIEW_RESIDENT_DIR: residentDirectory,
    };
    const child = spawnSync(process.execPath, [
      "src/cli.ts",
      "--codex-hook",
      "--controlled-writer",
      "--controlled-reviewer",
      `--codex-version=${hostVersion}`,
    ], {
      cwd: process.cwd(),
      input: JSON.stringify(input),
      encoding: "utf8",
      env: residentEnv,
    });

    expect(child.status).toBe(0);
    expect(child.stderr).toBe("");
    expect(JSON.parse(child.stdout)).toEqual({});
    const bash = {
      ...input,
      tool_name: "Bash",
      turn_id: "later-turn",
      tool_use_id: "later-tool",
      tool_input: { command: "true" },
    };
    let later = spawnSync(process.execPath, ["src/cli.ts", "--codex-hook", "--controlled-reviewer", `--codex-version=${hostVersion}`], {
      cwd: process.cwd(), input: JSON.stringify(bash), encoding: "utf8", env: residentEnv,
    });
    for (let attempt = 0; attempt < 20 && JSON.parse(later.stdout).hookSpecificOutput === undefined; attempt++) {
      later = spawnSync(process.execPath, ["src/cli.ts", "--codex-hook", "--controlled-reviewer", `--codex-version=${hostVersion}`], {
        cwd: process.cwd(), input: JSON.stringify(bash), encoding: "utf8", env: residentEnv,
      });
    }
    expect(later.status).toBe(0);
    const output = JSON.parse(later.stdout) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };
    expect(output.hookSpecificOutput.hookEventName).toBe("PostToolUse");
    expect(output.hookSpecificOutput.additionalContext).toContain("pinned.ts");
    expect(output.hookSpecificOutput.additionalContext).toContain("Advisory direct-event review");
    expect(later.stdout).not.toContain("submission attempted");
    expect(readFileSync(capturePath, "utf8").trim().split("\n")).toHaveLength(1);
    expect(readFileSync(path, "utf8")).toBe("type OrderCount = number\n");
  };

  it("routes a native controlled-writer Codex Add through direct-event stdout", () => {
    checkNativeControlledWriterAdd("0.155.1");
  });

  it("routes a native controlled-writer Codex 0.156.0 Add through direct-event stdout", () => {
    checkNativeControlledWriterAdd("0.156.0");
  });

  it("claims unsupported native apply_patch events without legacy review work", () => {
    const root = makeTemporaryDirectory("r-");
    roots.push(root);
    const source = join(root, "existing.ts");
    writeFileSync(source, "type Existing = number\n");
    execFileSync("git", ["init", "--quiet", root]);
    // If these events fell through to legacy preflight, this malformed config
    // would produce an operational message rather than the required quiet object.
    writeFileSync(join(root, ".review.jsonc"), "{ malformed");
    const capturePath = join(root, "backend-called.txt");
    const residentDirectory = join(root, "runtime");
    const base = {
      session_id: "unsupported-session",
      turn_id: "unsupported-turn",
      transcript_path: null,
      cwd: root,
      hook_event_name: "PostToolUse",
      model: "gpt-test",
      permission_mode: "default",
      tool_name: "apply_patch",
      tool_response: "Success",
      tool_use_id: "unsupported-tool",
    };
    const events = [
      { ...base, tool_input: { command: "not a native patch" } },
      { ...base, session_id: "", tool_input: {
        command: "*** Begin Patch\n*** Add File: missing-id.ts\n+x\n*** End Patch",
      } },
      { ...base, tool_input: { command: "*** Begin Patch\n*** Delete File: existing.ts\n*** End Patch" } },
      { ...base, tool_input: { command: "*** Begin Patch\n*** Add File: existing.ts\n*** Move to: moved.ts\n+x\n*** End Patch" } },
      { ...base, tool_input: {
        command: `*** Begin Patch\n*** Add File: huge.ts\n+${"x".repeat(65_536)}\n*** End Patch`,
      } },
      { ...base, tool_input: { command: "*** Begin Patch\n*** Frobnicate File: odd.ts\n+x\n*** End Patch" } },
      { ...base, tool_input: { command: "*** Begin Patch\n*** Add File:\n+x\n*** End Patch" } },
      { ...base, tool_input: { command: "*** Begin Patch\n*** Add File: raw.ts\ntype Raw = number\n*** End Patch" } },
      { ...base, tool_input: { command: "*** Begin Patch\n*** Rename File: existing.ts\n+x\n*** End Patch" } },
    ];
    for (const event of events) {
      const child = spawnSync(process.execPath, [
        "src/cli.ts",
        "--codex-hook",
        "--controlled-writer",
        "--controlled-reviewer",
      ], {
        cwd: process.cwd(),
        input: JSON.stringify(event),
        encoding: "utf8",
        env: {
          ...process.env,
          REVIEW_CONTROL_JSON: JSON.stringify({ capturePath }),
          REVIEW_STATE_PATH: join(root, "consent"),
          REVIEW_RESIDENT_DIR: residentDirectory,
        },
      });
      expect(child.status).toBe(0);
      expect(child.stderr).toBe("");
      expect(JSON.parse(child.stdout)).toEqual({});
      expect(readFileSync(source, "utf8")).toBe("type Existing = number\n");
      expect(existsSync(capturePath)).toBe(false);
    }
  });

  it("returns a bounded protocol error for malformed input", () => {
    const child = spawnSync(process.execPath, ["src/cli.ts", "--controlled-reviewer"], {
      cwd: process.cwd(),
      input: '{"version":2,"unexpected":true}',
      encoding: "utf8",
    });
    const output = JSON.parse(child.stdout) as { error: { code: string; message: string } };
    expect(output.error.code).toBe("invalid_request");
    expect(output.error.message.length).toBeLessThanOrEqual(300);
  });

  it("does not emit duplicate advice for the same event and snapshot", () => {
    const root = makeTemporaryDirectory("review-cli-dedupe-");
    roots.push(root);
    const statePath = initializeRepository(root);
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src/example.ts"),
      "export type Delivery = { email?: string; phone?: string };\n",
    );
    const input = JSON.stringify({
      version: 1,
      event: {
        id: `dedupe-${root}`,
        kind: "successful-edit",
        host: "test",
        cwd: root,
        paths: ["src/example.ts"],
      },
    });
    const control = JSON.stringify({
      answers: Object.fromEntries(
        configuredRules.map((rule) => [
          rule.id,
          { _tag: "Probability", probability: 0.9 },
        ]),
      ),
    });
    const invoke = () =>
      spawnSync(process.execPath, ["src/cli.ts", "--controlled-reviewer"], {
        cwd: process.cwd(),
        input,
        encoding: "utf8",
        env: { ...process.env, REVIEW_CONTROL_JSON: control, REVIEW_STATE_PATH: statePath },
      });

    const first = JSON.parse(invoke().stdout) as { advice: Array<unknown> };
    const second = JSON.parse(invoke().stdout) as { advice: Array<unknown> };
    expect(first.advice.length).toBeGreaterThan(0);
    expect(second.advice).toEqual([]);
  });

  it("preserves the completed edit and reports unavailable without credentials", () => {
    const root = makeTemporaryDirectory("review-cli-no-credential-");
    roots.push(root);
    const statePath = initializeRepository(root);
    const credentialStatePath = join(root, "credential-state.json");
    // Removing the environment key alone still permits saved-keychain lookup.
    writeFileSync(credentialStatePath, JSON.stringify({
      version: 1,
      generation: 0,
      savedUseSuspended: true,
    }));
    mkdirSync(join(root, "src"));
    const content = "export type Counter = { count: number };\n";
    const path = join(root, "src/counter.ts");
    writeFileSync(path, content);
    const input = JSON.stringify({
      version: 1,
      event: {
        id: "missing-credential-1",
        kind: "successful-edit",
        host: "test",
        cwd: root,
        paths: ["src/counter.ts"],
      },
    });
    const environment = { ...process.env };
    delete environment.TYPESAFE_API_KEY;
    const child = spawnSync(process.execPath, ["src/cli.ts"], {
      cwd: process.cwd(),
      input,
      encoding: "utf8",
      env: {
        ...environment,
        REVIEW_STATE_PATH: statePath,
        REVIEW_CREDENTIAL_STATE_PATH: credentialStatePath,
      },
    });

    expect(child.status).toBe(0);
    expect(child.stderr).toBe("");
    expect(JSON.parse(child.stdout).results[0]).toMatchObject({
      status: "unavailable",
      path: "src/counter.ts",
    });
    expect(readFileSync(path, "utf8")).toBe(content);
  });

  it("reviews by default and leaves retired grant files untouched", () => {
    const root = makeTemporaryDirectory("review-cli-default-");
    roots.push(root);
    const statePath = initializeRepository(root);
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/example.ts"), "export type Example = string;\n");
    writeFileSync(statePath, "legacy-grant-sentinel\n");
    const request = (id: string) => JSON.stringify({ version: 1,
      event: { id, kind: "successful-edit", host: "test", cwd: root, paths: ["src/example.ts"] } });
    const runReview = (id: string) => JSON.parse(spawnSync(process.execPath,
      ["src/cli.ts", "--controlled-reviewer"], { cwd: process.cwd(), input: request(id),
        encoding: "utf8", env: { ...process.env, REVIEW_STATE_PATH: statePath } }).stdout);
    expect(runReview("default").results[0]).toMatchObject({ status: "reviewed" });
    for (const operation of ["enable", "enable-confirm", "disable"] as const) {
      const result = spawnSync(process.execPath, ["src/cli.ts", `--${operation}`], {
        cwd: process.cwd(), input: JSON.stringify({ version: 1, operation, cwd: root,
          ...(operation === "enable-confirm" ? { proposalDigest: "0".repeat(64) } : {}) }),
        encoding: "utf8", env: { ...process.env, REVIEW_STATE_PATH: statePath },
      });
      expect(JSON.parse(result.stdout)).toMatchObject({ status: "retired" });
    }
    expect(readFileSync(statePath, "utf8")).toBe("legacy-grant-sentinel\n");
    expect(runReview("after-retired-operation").results[0]).toMatchObject({ status: "reviewed" });
    writeFileSync(join(root, ".review.jsonc"), '{"version":1,"consent":true}');
    expect(runReview("invalid-project-consent").results[0]).toMatchObject({
      status: "unavailable", code: "invalid_configuration",
    });
  });

  it("keeps user exclude-all effective when a project supplies includes", () => {
    const root = makeTemporaryDirectory("review-cli-exclude-all-");
    roots.push(root);
    const statePath = initializeRepository(root);
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/example.ts"), "export type Example = string;\n");
    const userConfig = join(root, "user.jsonc");
    writeFileSync(userConfig, '{"version":1,"excludes":["**/*"]}');
    writeFileSync(join(root, ".review.jsonc"), '{"version":1,"includes":["src/**"]}');
    const result = spawnSync(process.execPath, ["src/cli.ts", "--controlled-reviewer"], {
      cwd: process.cwd(), encoding: "utf8",
      input: JSON.stringify({ version: 1, event: { id: "user-exclude-all", kind: "successful-edit",
        host: "test", cwd: root, paths: ["src/example.ts"] } }),
      env: { ...process.env, REVIEW_STATE_PATH: statePath, REVIEW_USER_CONFIG_PATH: userConfig },
    });
    expect(JSON.parse(result.stdout).results[0]).toMatchObject({ status: "skipped", code: "excluded" });
    const doctor = spawnSync(process.execPath, ["src/cli.ts", "--doctor"], {
      cwd: process.cwd(), encoding: "utf8",
      input: JSON.stringify({ version: 1, operation: "doctor", cwd: root }),
      env: { ...process.env, REVIEW_USER_CONFIG_PATH: userConfig },
    });
    expect(JSON.parse(doctor.stdout).checks).toContainEqual(expect.objectContaining({
      stage: "file-selection", status: "missing", observed: "user file settings exclude all files",
    }));
    writeFileSync(userConfig, '{"version":1}');
    writeFileSync(join(root, ".review.jsonc"), '{"version":1,"excludes":["**/*"]}');
    const projectDoctor = spawnSync(process.execPath, ["src/cli.ts", "--doctor"], {
      cwd: process.cwd(), encoding: "utf8",
      input: JSON.stringify({ version: 1, operation: "doctor", cwd: root }),
      env: { ...process.env, REVIEW_USER_CONFIG_PATH: userConfig },
    });
    expect(JSON.parse(projectDoctor.stdout).checks).toContainEqual(expect.objectContaining({
      stage: "file-selection", status: "missing", observed: "effective file settings exclude all files",
    }));
  });

  it("applies file settings independently in distinct working trees", () => {
    const first = makeTemporaryDirectory("review-cli-policy-first-");
    const second = makeTemporaryDirectory("review-cli-policy-second-");
    roots.push(first, second);
    initializeRepository(first);
    initializeRepository(second);
    for (const root of [first, second]) {
      mkdirSync(join(root, "src"));
      writeFileSync(join(root, "src/example.ts"), "export type Example = string;\n");
    }
    writeFileSync(join(first, ".review.jsonc"), '{"version":1,"excludes":["src/**"]}');
    const review = (root: string) => JSON.parse(spawnSync(process.execPath,
      ["src/cli.ts", "--controlled-reviewer"], {
        cwd: process.cwd(), encoding: "utf8",
        input: JSON.stringify({ version: 1, event: { id: "independent-worktree", kind: "successful-edit",
          host: "test", cwd: root, paths: ["src/example.ts"] } }),
      }).stdout).results[0];
    expect(review(first)).toMatchObject({ status: "skipped", code: "excluded" });
    expect(review(second)).toMatchObject({ status: "reviewed" });
  });

  it("inspects credential presence without exposing the value", () => {
    const root = makeTemporaryDirectory("review-cli-credential-");
    roots.push(root);
    const statePath = initializeRepository(root);
    const secret = "CREDENTIAL-SENTINEL";
    const child = spawnSync(process.execPath, ["src/cli.ts", "--inspect-credentials"], {
      cwd: process.cwd(),
      input: JSON.stringify({ version: 1, operation: "credentials", cwd: root }),
      encoding: "utf8",
      env: {
        ...process.env,
        REVIEW_STATE_PATH: statePath,
        TYPESAFE_API_KEY: secret,
      },
    });
    expect(JSON.parse(child.stdout)).toEqual({
      version: 1,
      operation: "credentials",
      credentialEnvVar: "TYPESAFE_API_KEY",
      present: true,
      source: "environment",
      status: "present",
    });
    expect(child.stdout).not.toContain(secret);
  }, 20_000);
});
