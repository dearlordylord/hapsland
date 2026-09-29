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

  it("rejects the retired whole-file review request without invoking Jev", () => {
    const root = makeTemporaryDirectory("review-retired-");
    roots.push(root);
    initializeRepository(root);
    const capturePath = join(root, "backend-called.txt");
    const input = { version: 1, event: { id: "old", kind: "successful-edit", host: "test",
      cwd: root, paths: ["example.ts"] } };
    const child = spawnSync(process.execPath, ["src/cli.ts", "--controlled-reviewer"], {
      cwd: process.cwd(), input: JSON.stringify(input), encoding: "utf8",
      env: { ...process.env, REVIEW_CONTROL_JSON: JSON.stringify({ capturePath }) },
    });
    expect(child.status).toBe(2);
    expect(JSON.parse(child.stdout)).toMatchObject({ error: { code: "invalid_request" } });
    expect(existsSync(capturePath)).toBe(false);
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
    expect(existsSync(capturePath)).toBe(false);
    expect(existsSync(residentDirectory)).toBe(false);
    expect(readFileSync(path, "utf8")).toBe("type OrderCount = number\n");
  };

  it("keeps the retired Codex 0.155.1 entry point quiet", () => {
    checkNativeControlledWriterAdd("0.155.1");
  });

  it("keeps the retired Codex 0.156.0 entry point quiet", () => {
    checkNativeControlledWriterAdd("0.156.0");
  });

  it("quiets retired native hooks before decoding input or reviewer settings", () => {
    const root = makeTemporaryDirectory("review-retired-hook-");
    roots.push(root);
    for (const flags of [["--codex-hook"], ["--opencode-hook"], ["--opencode-hook", "--composed-edit-hook"]]) {
      const child = spawnSync(process.execPath, ["src/cli.ts", ...flags, "--controlled-reviewer"], {
        cwd: process.cwd(), input: "malformed JSON", encoding: "utf8",
        env: { ...process.env, REVIEW_CONTROL_JSON: "malformed", REVIEW_RESIDENT_DIR: join(root, "runtime") },
      });
      expect(child.status).toBe(0);
      expect(child.stderr).toBe("");
      expect(child.stdout.trim()).toBe(flags.includes("--codex-hook") ? "{}" : "");
      expect(existsSync(join(root, "runtime"))).toBe(false);
    }
  });

  it("keeps unsupported native apply_patch events quiet", () => {
    const root = makeTemporaryDirectory("r-");
    roots.push(root);
    const source = join(root, "existing.ts");
    writeFileSync(source, "type Existing = number\n");
    execFileSync("git", ["init", "--quiet", root]);
    // Malformed configuration must not start review for unsupported events.
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
      input: '{"version":null,"unexpected":true}',
      encoding: "utf8",
    });
    const output = JSON.parse(child.stdout) as { error: { code: string; message: string } };
    expect(output.error.code).toBe("invalid_request");
    expect(output.error.message.length).toBeLessThanOrEqual(300);
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
