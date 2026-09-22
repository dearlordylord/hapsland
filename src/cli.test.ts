import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
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
  const statePath = requestedStatePath ?? join(root, ".consent-state.json");
  const preview = spawnSync(process.execPath, ["src/cli.ts", "--enable"], {
    cwd: process.cwd(),
    input: JSON.stringify({ version: 1, operation: "enable", cwd: root }),
    encoding: "utf8",
    env: { ...process.env, REVIEW_STATE_PATH: statePath },
  });
  expect(preview.status).toBe(0);
  const proposal = JSON.parse(preview.stdout) as {
    proposal: { digest: string };
  };
  expect(proposal).toMatchObject({ status: "preview" });
  const enabled = spawnSync(process.execPath, ["src/cli.ts", "--enable-confirm"], {
    cwd: process.cwd(),
    input: JSON.stringify({
      version: 1,
      operation: "enable-confirm",
      cwd: root,
      proposalDigest: proposal.proposal.digest,
    }),
    encoding: "utf8",
    env: { ...process.env, REVIEW_STATE_PATH: statePath },
  });
  expect(enabled.status).toBe(0);
  expect(JSON.parse(enabled.stdout)).toMatchObject({ status: "enabled" });
  return statePath;
};

describe("JSON subprocess contract", { timeout: SUBPROCESS_TEST_TIMEOUT }, () => {
  it("reviews a completed edit and reserves stdout for one protocol response", () => {
    const root = mkdtempSync(join(tmpdir(), "review-cli-"));
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
    const child = spawnSync(process.execPath, ["src/cli.ts", "--controlled"], {
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

  it("routes a native controlled-writer Codex Add through direct-event stdout", () => {
    const root = mkdtempSync(join(tmpdir(), "review-cli-direct-add-"));
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
      "--controlled",
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
    let later = spawnSync(process.execPath, ["src/cli.ts", "--codex-hook", "--controlled"], {
      cwd: process.cwd(), input: JSON.stringify(bash), encoding: "utf8", env: residentEnv,
    });
    for (let attempt = 0; attempt < 20 && JSON.parse(later.stdout).hookSpecificOutput === undefined; attempt++) {
      later = spawnSync(process.execPath, ["src/cli.ts", "--codex-hook", "--controlled"], {
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
  });

  it("claims unsupported native apply_patch events without legacy review work", () => {
    const root = mkdtempSync(join(tmpdir(), "review-cli-direct-unsupported-"));
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
      { ...base, tool_input: { command: "*** Begin Patch\n*** Update File: existing.ts\n+changed\n*** End Patch" } },
      { ...base, tool_input: { command: "*** Begin Patch\n*** Delete File: existing.ts\n*** End Patch" } },
      { ...base, tool_input: { command: "*** Begin Patch\n*** Add File: existing.ts\n*** Move to: moved.ts\n+x\n*** End Patch" } },
      { ...base, tool_input: {
        command: `*** Begin Patch\n*** Add File: huge.ts\n+${"x".repeat(65_536)}\n*** End Patch`,
      } },
      { ...base, tool_input: { command: "*** Begin Patch\n*** Frobnicate File: odd.ts\n+x\n*** End Patch" } },
      { ...base, tool_input: { command: "*** Begin Patch\n*** Add File:\n+x\n*** End Patch" } },
      { ...base, tool_input: { command: "*** Begin Patch\n*** Add File: raw.ts\ntype Raw = number\n*** End Patch" } },
      { ...base, tool_input: { command: "*** Begin Patch\n*** Add File: mixed.ts\n+x\n*** Update File: existing.ts\n+y\n*** End Patch" } },
      { ...base, tool_input: { command: "*** Begin Patch\n*** Rename File: existing.ts\n+x\n*** End Patch" } },
    ];
    for (const event of events) {
      const child = spawnSync(process.execPath, [
        "src/cli.ts",
        "--codex-hook",
        "--controlled-writer",
        "--controlled",
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
    const child = spawnSync(process.execPath, ["src/cli.ts", "--controlled"], {
      cwd: process.cwd(),
      input: '{"version":2,"unexpected":true}',
      encoding: "utf8",
    });
    const output = JSON.parse(child.stdout) as { error: { code: string; message: string } };
    expect(output.error.code).toBe("invalid_request");
    expect(output.error.message.length).toBeLessThanOrEqual(300);
  });

  it("does not emit duplicate advice for the same event and snapshot", () => {
    const root = mkdtempSync(join(tmpdir(), "review-cli-dedupe-"));
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
      spawnSync(process.execPath, ["src/cli.ts", "--controlled"], {
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
    const root = mkdtempSync(join(tmpdir(), "review-cli-no-credential-"));
    roots.push(root);
    const statePath = initializeRepository(root);
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
      env: { ...environment, REVIEW_STATE_PATH: statePath },
    });

    expect(child.status).toBe(0);
    expect(child.stderr).toBe("");
    expect(JSON.parse(child.stdout).results[0]).toMatchObject({
      status: "unavailable",
      path: "src/counter.ts",
    });
    expect(readFileSync(path, "utf8")).toBe(content);
  });

  it("reuses a grant, ignores project authorization, and revokes future dispatch", () => {
    const root = mkdtempSync(join(tmpdir(), "review-cli-consent-"));
    roots.push(root);
    const statePath = initializeRepository(root);
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/example.ts"), "export type Example = string;\n");
    const previewAfterProjectAuth = spawnSync(process.execPath, ["src/cli.ts", "--enable"], {
      cwd: process.cwd(),
      input: JSON.stringify({ version: 1, operation: "enable", cwd: root }),
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    expect(JSON.parse(previewAfterProjectAuth.stdout)).toMatchObject({ status: "preview" });
    const proposalAfterProjectAuth = JSON.parse(previewAfterProjectAuth.stdout) as {
      proposal: { digest: string };
    };
    const enableAfterProjectAuth = spawnSync(process.execPath, ["src/cli.ts", "--enable-confirm"], {
      cwd: process.cwd(),
      input: JSON.stringify({
        version: 1,
        operation: "enable-confirm",
        cwd: root,
        proposalDigest: proposalAfterProjectAuth.proposal.digest,
      }),
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    expect(JSON.parse(enableAfterProjectAuth.stdout)).toMatchObject({ status: "enabled" });

    const request = (id: string) =>
      JSON.stringify({
        version: 1,
        event: {
          id,
          kind: "successful-edit",
          host: "test",
          cwd: root,
          paths: ["src/example.ts"],
        },
      });
    const approved = spawnSync(process.execPath, ["src/cli.ts", "--controlled"], {
      cwd: process.cwd(),
      input: request("approved"),
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    expect(JSON.parse(approved.stdout).results[0]).toMatchObject({ status: "reviewed" });

    const disabledBeforeProjectAuth = spawnSync(process.execPath, ["src/cli.ts", "--disable"], {
      cwd: process.cwd(),
      input: JSON.stringify({ version: 1, operation: "disable", cwd: root }),
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    expect(JSON.parse(disabledBeforeProjectAuth.stdout)).toMatchObject({ status: "disabled" });
    writeFileSync(join(root, ".review.jsonc"), '{ "version": 1, "consent": true }');
    const projectAuthorization = spawnSync(process.execPath, ["src/cli.ts", "--controlled"], {
      cwd: process.cwd(),
      input: request("project-authorization"),
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    expect(JSON.parse(projectAuthorization.stdout).results[0]).toMatchObject({
      status: "skipped",
      code: "missing_consent",
    });
    const previewAgain = spawnSync(process.execPath, ["src/cli.ts", "--enable"], {
      cwd: process.cwd(),
      input: JSON.stringify({ version: 1, operation: "enable", cwd: root }),
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    expect(JSON.parse(previewAgain.stdout)).toMatchObject({ status: "preview" });
    const proposalAgain = JSON.parse(previewAgain.stdout) as {
      proposal: { digest: string };
    };
    const enableAgain = spawnSync(process.execPath, ["src/cli.ts", "--enable-confirm"], {
      cwd: process.cwd(),
      input: JSON.stringify({
        version: 1,
        operation: "enable-confirm",
        cwd: root,
        proposalDigest: proposalAgain.proposal.digest,
      }),
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    expect(JSON.parse(enableAgain.stdout)).toMatchObject({
      backend: { destination: "https://api.typesafe.ai/v1/systemone" },
      projectAuthorizationIgnored: true,
    });
    const approvedAgain = spawnSync(process.execPath, ["src/cli.ts", "--controlled"], {
      cwd: process.cwd(),
      input: request("approved-again"),
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    expect(JSON.parse(approvedAgain.stdout).results[0]).toMatchObject({ status: "reviewed" });

    const disabled = spawnSync(process.execPath, ["src/cli.ts", "--disable"], {
      cwd: process.cwd(),
      input: JSON.stringify({ version: 1, operation: "disable", cwd: root }),
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    expect(JSON.parse(disabled.stdout)).toMatchObject({ status: "disabled" });
    const revoked = spawnSync(process.execPath, ["src/cli.ts", "--controlled"], {
      cwd: process.cwd(),
      input: request("revoked"),
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    expect(JSON.parse(revoked.stdout).results[0]).toMatchObject({
      status: "skipped",
      code: "missing_consent",
    });
  }, 20_000);

  it("previews exact consent scope without writing and rejects a mismatched confirmation", () => {
    const root = mkdtempSync(join(tmpdir(), "review-cli-consent-preview-"));
    roots.push(root);
    execFileSync("git", ["init", "--quiet", root]);
    const statePath = join(root, ".consent-state.json");
    const preview = spawnSync(process.execPath, ["src/cli.ts", "--enable"], {
      cwd: process.cwd(),
      input: JSON.stringify({ version: 1, operation: "enable", cwd: root }),
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    const previewOutput = JSON.parse(preview.stdout) as {
      status: string;
      proposal: {
        digest: string;
        repository: { canonicalRoot: string };
        backend: { id: string; destination: string };
        scope: string;
      };
    };
    expect(previewOutput).toMatchObject({
      status: "preview",
      proposal: {
        repository: { canonicalRoot: root },
        backend: {
          id: "jev",
          destination: "https://api.typesafe.ai/v1/systemone",
        },
        scope: "repository-wide eligible source files",
      },
    });
    expect(existsSync(statePath)).toBe(false);

    const mismatch = spawnSync(process.execPath, ["src/cli.ts", "--enable-confirm"], {
      cwd: process.cwd(),
      input: JSON.stringify({
        version: 1,
        operation: "enable-confirm",
        cwd: root,
        proposalDigest: "0".repeat(64),
      }),
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    expect(JSON.parse(mismatch.stdout)).toMatchObject({ status: "proposal-mismatch" });
    expect(existsSync(statePath)).toBe(false);
  });

  it("retains unrelated well-formed grants without reusing or revoking them", () => {
    const root = mkdtempSync(join(tmpdir(), "review-cli-unrelated-grant-"));
    roots.push(root);
    execFileSync("git", ["init", "--quiet", root]);
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/example.ts"), "export type Unrelated = string;\n");
    const statePath = join(root, ".consent-state");
    mkdirSync(statePath);
    const unrelatedBackend = "other-review-backend";
    const unrelatedDestination = "https://other-review.invalid/v1/review";
    const unrelatedFile = createHash("sha256")
      .update(`${root}\0${unrelatedBackend}\0${unrelatedDestination}`)
      .digest("hex");
    writeFileSync(
      join(statePath, `${unrelatedFile}.json`),
      JSON.stringify({
        version: 1,
        grant: {
          root,
          backend: unrelatedBackend,
          destination: unrelatedDestination,
        },
      }),
    );

    const request = JSON.stringify({
      version: 1,
      event: {
        id: "unrelated-grant",
        kind: "successful-edit",
        host: "test",
        cwd: root,
        paths: ["src/example.ts"],
      },
    });
    const before = spawnSync(process.execPath, ["src/cli.ts", "--controlled"], {
      cwd: process.cwd(),
      input: request,
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    expect(JSON.parse(before.stdout).results[0]).toMatchObject({
      status: "skipped",
      code: "missing_consent",
    });

    const preview = spawnSync(process.execPath, ["src/cli.ts", "--enable"], {
      cwd: process.cwd(),
      input: JSON.stringify({ version: 1, operation: "enable", cwd: root }),
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    const proposal = JSON.parse(preview.stdout) as { proposal: { digest: string } };
    const enabled = spawnSync(process.execPath, ["src/cli.ts", "--enable-confirm"], {
      cwd: process.cwd(),
      input: JSON.stringify({
        version: 1,
        operation: "enable-confirm",
        cwd: root,
        proposalDigest: proposal.proposal.digest,
      }),
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    expect(JSON.parse(enabled.stdout)).toMatchObject({ status: "enabled" });

    const status = () =>
      JSON.parse(
        spawnSync(process.execPath, ["src/cli.ts", "--status"], {
          cwd: process.cwd(),
          input: JSON.stringify({ version: 1, operation: "status", cwd: root }),
          encoding: "utf8",
          env: { ...process.env, REVIEW_STATE_PATH: statePath },
        }).stdout,
      ) as { grants: Array<{ backend: string; destination: string; scope: string }> };
    expect(status().grants).toEqual(
      expect.arrayContaining([
        { backend: unrelatedBackend, destination: unrelatedDestination, scope: expect.any(String) },
        {
          backend: "jev",
          destination: "https://api.typesafe.ai/v1/systemone",
          scope: expect.any(String),
        },
      ]),
    );

    const disabled = spawnSync(process.execPath, ["src/cli.ts", "--disable"], {
      cwd: process.cwd(),
      input: JSON.stringify({ version: 1, operation: "disable", cwd: root }),
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    expect(JSON.parse(disabled.stdout)).toMatchObject({ status: "disabled" });
    expect(status().grants).toEqual([
      { backend: unrelatedBackend, destination: unrelatedDestination, scope: expect.any(String) },
    ]);
  }, 20_000);

  it("does not inherit consent across working trees", () => {
    const first = mkdtempSync(join(tmpdir(), "review-cli-root-a-"));
    const second = mkdtempSync(join(tmpdir(), "review-cli-root-b-"));
    roots.push(first, second);
    const statePath = initializeRepository(first);
    execFileSync("git", ["init", "--quiet", second]);
    mkdirSync(join(second, "src"));
    writeFileSync(join(second, "src/example.ts"), "export type Other = string;\n");
    const child = spawnSync(process.execPath, ["src/cli.ts", "--controlled"], {
      cwd: process.cwd(),
      input: JSON.stringify({
        version: 1,
        event: {
          id: "other-root",
          kind: "successful-edit",
          host: "test",
          cwd: second,
          paths: ["src/example.ts"],
        },
      }),
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    expect(JSON.parse(child.stdout).results[0]).toMatchObject({
      status: "skipped",
      code: "missing_consent",
    });
    expect(child.stdout).not.toContain("Other");
  });

  it("does not inherit a grant when a repository root moves", () => {
    const original = mkdtempSync(join(tmpdir(), "review-cli-moved-original-"));
    const movedParent = mkdtempSync(join(tmpdir(), "review-cli-moved-parent-"));
    const moved = join(movedParent, "moved");
    const stateParent = mkdtempSync(join(tmpdir(), "review-cli-moved-state-"));
    roots.push(original, movedParent, stateParent);
    const statePath = join(stateParent, "consent");
    initializeRepository(original, statePath);
    renameSync(original, moved);
    mkdirSync(join(moved, "src"));
    writeFileSync(join(moved, "src/example.ts"), "export type Moved = string;\n");
    const child = spawnSync(process.execPath, ["src/cli.ts", "--controlled"], {
      cwd: process.cwd(),
      input: JSON.stringify({
        version: 1,
        event: {
          id: "moved-root",
          kind: "successful-edit",
          host: "test",
          cwd: moved,
          paths: ["src/example.ts"],
        },
      }),
      encoding: "utf8",
      env: {
        ...process.env,
        REVIEW_CONTROL_JSON: JSON.stringify({ capturePath: join(stateParent, "calls.log") }),
        REVIEW_STATE_PATH: statePath,
      },
    });
    expect(JSON.parse(child.stdout).results[0]).toMatchObject({
      status: "skipped",
      code: "missing_consent",
    });
    expect(existsSync(join(stateParent, "calls.log"))).toBe(false);
    expect(child.stdout).not.toContain("Moved");
  });

  it("does not inherit a grant into a separate Git worktree and makes no provider call", () => {
    const source = mkdtempSync(join(tmpdir(), "review-cli-worktree-source-"));
    const worktree = mkdtempSync(join(tmpdir(), "review-cli-worktree-target-"));
    const stateParent = mkdtempSync(join(tmpdir(), "review-cli-worktree-state-"));
    roots.push(source, worktree, stateParent);
    rmSync(worktree, { recursive: true, force: true });
    execFileSync("git", ["init", "--quiet", source]);
    execFileSync("git", ["-C", source, "-c", "user.email=test@example.invalid", "-c", "user.name=test", "commit", "--quiet", "--allow-empty", "-m", "init"]);
    execFileSync("git", ["-C", source, "worktree", "add", "--quiet", worktree, "HEAD"]);
    const statePath = join(stateParent, "consent");
    const preview = spawnSync(process.execPath, ["src/cli.ts", "--enable"], {
      cwd: process.cwd(),
      input: JSON.stringify({ version: 1, operation: "enable", cwd: source }),
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    const proposal = JSON.parse(preview.stdout) as { proposal: { digest: string } };
    spawnSync(process.execPath, ["src/cli.ts", "--enable-confirm"], {
      cwd: process.cwd(),
      input: JSON.stringify({
        version: 1,
        operation: "enable-confirm",
        cwd: source,
        proposalDigest: proposal.proposal.digest,
      }),
      encoding: "utf8",
      env: { ...process.env, REVIEW_STATE_PATH: statePath },
    });
    mkdirSync(join(worktree, "src"), { recursive: true });
    writeFileSync(join(worktree, "src/example.ts"), "export type Worktree = string;\n");
    const calls = join(stateParent, "calls.log");
    const child = spawnSync(process.execPath, ["src/cli.ts", "--controlled"], {
      cwd: process.cwd(),
      input: JSON.stringify({
        version: 1,
        event: {
          id: "separate-worktree",
          kind: "successful-edit",
          host: "test",
          cwd: worktree,
          paths: ["src/example.ts"],
        },
      }),
      encoding: "utf8",
      env: {
        ...process.env,
        REVIEW_CONTROL_JSON: JSON.stringify({ capturePath: calls }),
        REVIEW_STATE_PATH: statePath,
      },
    });
    expect(JSON.parse(child.stdout).results[0]).toMatchObject({
      status: "skipped",
      code: "missing_consent",
    });
    expect(existsSync(calls)).toBe(false);
    expect(child.stdout).not.toContain("Worktree");
  }, 20_000);

  it("inspects credential presence without exposing the value", () => {
    const root = mkdtempSync(join(tmpdir(), "review-cli-credential-"));
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
    });
    expect(child.stdout).not.toContain(secret);
  }, 20_000);
});
