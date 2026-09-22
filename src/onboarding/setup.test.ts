import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const roots: Array<string> = [];
const setupEntrypoint = () => process.env.REVIEW_SETUP_ENTRYPOINT ?? join(process.cwd(), "src", "cli.ts");

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "review-setup-"));
  roots.push(root);
  const repository = join(root, "repository");
  const codexHome = join(root, "codex-home");
  const codexExecutable = join(root, "codex");
  mkdirSync(repository);
  mkdirSync(codexHome);
  execFileSync("git", ["init", "--quiet", repository]);
  writeFileSync(codexExecutable, "#!/bin/sh\nprintf 'codex-cli 0.155.1\\n'\n", { mode: 0o700 });
  chmodSync(codexExecutable, 0o700);
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    REVIEW_STATE_PATH: join(root, "consent"),
    REVIEW_CREDENTIAL_STATE_PATH: join(root, "credential-state.json"),
    TYPESAFE_API_KEY: "setup-environment-secret",
  };
  return { root, repository, codexHome, codexExecutable, environment };
};

type SetupOutput = {
  readonly status: string;
  readonly providerCalls: number;
  readonly stages: ReadonlyArray<{ readonly stage: string; readonly status: string; readonly summary: string }>;
  readonly actions: ReadonlyArray<{
    readonly code: string;
    readonly authorization?: { readonly installProposalDigest?: string; readonly consentProposalDigest?: string };
  }>;
};

const invoke = (
  fixtureValue: ReturnType<typeof fixture>,
  request: Record<string, unknown>,
  environment: NodeJS.ProcessEnv = fixtureValue.environment,
) => {
  const child = spawnSync(process.execPath, [setupEntrypoint(), "--setup"], {
    cwd: fixtureValue.repository,
    env: environment,
    input: JSON.stringify({
      version: 1,
      operation: "setup",
      host: "codex",
      scope: { cwd: fixtureValue.repository, review: "enabled" },
      credential: "environment",
      codexHome: fixtureValue.codexHome,
      codexExecutable: fixtureValue.codexExecutable,
      ...request,
    }),
    encoding: "utf8",
    timeout: 10_000,
  });
  expect(child.stderr).toBe("");
  const output = JSON.parse(child.stdout) as SetupOutput;
  const expectedExit = output.status === "needs-user-action"
    ? 6
    : output.status === "partial"
      ? 5
      : output.status === "conflict"
        ? 4
        : output.status === "unsupported"
          ? 3
          : 0;
  expect(child.status).toBe(expectedExit);
  expect(output.providerCalls).toBe(0);
  expect(`${child.stdout}${child.stderr}`).not.toContain("setup-environment-secret");
  return output;
};

const authorization = (output: SetupOutput) => ({
  installProposalDigest: output.actions.find((action) => action.code === "approve-installation")
    ?.authorization?.installProposalDigest,
  consentProposalDigest: output.actions.find((action) => action.code === "approve-repository-consent")
    ?.authorization?.consentProposalDigest,
});

describe("public resumable setup operation", { timeout: 30_000 }, () => {
  it("installs and enables from exact approvals, then reuses completed steps without duplicate hooks or consent", () => {
    const test = fixture();
    const preview = invoke(test, {});
    expect(preview.status).toBe("needs-user-action");
    expect(preview.stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: "compatibility", status: "complete" }),
      expect.objectContaining({ stage: "installation", status: "pending" }),
      expect.objectContaining({ stage: "credential", status: "complete" }),
      expect.objectContaining({ stage: "repository", status: "pending" }),
      expect.objectContaining({ stage: "execution-context", status: "unknown" }),
    ]));
    const approvals = authorization(preview);
    expect(approvals.installProposalDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(approvals.consentProposalDigest).toMatch(/^[a-f0-9]{64}$/);

    const installed = invoke(test, approvals);
    expect(installed.status).toBe("needs-user-action");
    expect(installed.stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: "installation", status: "complete" }),
      expect.objectContaining({ stage: "repository", status: "complete" }),
      expect.objectContaining({ stage: "host-trust", status: "unknown" }),
    ]));

    const repeated = invoke(test, approvals);
    expect(repeated.stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: "installation", summary: expect.stringContaining("already installed") }),
      expect.objectContaining({ stage: "repository", summary: expect.stringContaining("consent remains valid") }),
    ]));
    const hooks = JSON.parse(readFileSync(join(test.codexHome, "hooks.json"), "utf8")) as {
      hooks: { PostToolUse: ReadonlyArray<unknown> };
    };
    expect(hooks.hooks.PostToolUse).toHaveLength(1);
    const grantFile = readdirSync(join(test.root, "consent")).find((name) => name.endsWith(".json"));
    if (grantFile === undefined) throw new Error("expected the approved repository grant");
    expect(readFileSync(join(test.root, "consent", grantFile), "utf8"))
      .not.toContain("setup-environment-secret");
  });

  it("resumes an interrupted owned installation with the same approval", () => {
    const test = fixture();
    const preview = invoke(test, {});
    const approvals = authorization(preview);
    const interrupted = invoke(test, approvals, {
      ...test.environment,
      REVIEW_INSTALL_FAIL_AFTER_WRITES: "1",
    });
    expect(interrupted.status).toBe("partial");
    expect(interrupted.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "resume-installation",
        authorization: { installProposalDigest: approvals.installProposalDigest },
      }),
    ]));
    expect(existsSync(join(test.codexHome, ".realtime-review-tool", "journal-v1.json"))).toBe(true);

    const resumed = invoke(test, approvals);
    expect(resumed.stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: "installation", status: "complete" }),
      expect.objectContaining({ stage: "repository", status: "complete" }),
    ]));
    expect(existsSync(join(test.codexHome, ".realtime-review-tool", "journal-v1.json"))).toBe(false);
  });

  it("completes with review disabled and no credential", () => {
    const test = fixture();
    const preview = invoke(test, {
      scope: { cwd: test.repository, review: "disabled" },
      credential: "skip",
    });
    const installProposalDigest = authorization(preview).installProposalDigest;
    const completed = invoke(test, {
      scope: { cwd: test.repository, review: "disabled" },
      credential: "skip",
      installProposalDigest,
    });
    expect(completed.status).toBe("completed");
    expect(completed.stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: "credential", status: "skipped" }),
      expect.objectContaining({ stage: "repository", status: "complete", summary: expect.stringContaining("disabled") }),
      expect.objectContaining({ stage: "execution-context", status: "unknown" }),
    ]));
    expect(existsSync(join(test.root, "consent"))).toBe(false);
  });

  it("bounds noninteractive missing-secret and consent handoffs", () => {
    const test = fixture();
    const environment = { ...test.environment };
    delete environment.TYPESAFE_API_KEY;
    const output = invoke(test, {}, environment);
    expect(output.status).toBe("needs-user-action");
    expect(output.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "provide-credential" }),
      expect.objectContaining({ code: "approve-repository-consent" }),
    ]));
    expect(output.actions.length).toBeLessThanOrEqual(4);
  });

  it.skipIf(process.platform !== "linux")("uses the masked terminal path during interactive resume", async () => {
    const test = fixture();
    const preview = invoke(test, {});
    const approvals = authorization(preview);
    invoke(test, approvals);

    const helper = join(test.root, "secret-helper.mjs");
    const vault = join(test.root, "vault");
    writeFileSync(helper, `#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const operation = process.argv[2]; const vault = process.env.TEST_SECRET_VAULT;
if (operation === "get") process.stdout.write(existsSync(vault) ? '{"status":"present"}\\n' + readFileSync(vault) : '{"status":"missing"}\\n');
else if (operation === "set") { const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk); writeFileSync(vault, Buffer.concat(chunks), {mode:0o600}); console.log('{"status":"stored"}'); }
else if (operation === "probe") console.log('{"status":"available"}');
`);
    chmodSync(helper, 0o700);
    const requestPath = join(test.root, "setup-request.json");
    writeFileSync(requestPath, JSON.stringify({
      version: 1,
      operation: "setup",
      host: "codex",
      scope: { cwd: test.repository, review: "enabled" },
      credential: "saved",
      codexHome: test.codexHome,
      codexExecutable: test.codexExecutable,
      interactive: true,
    }));
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    const entrypoint = setupEntrypoint();
    const command = `${quote(process.execPath)} ${quote(entrypoint)} --setup < ${quote(requestPath)}`;
    const environment: NodeJS.ProcessEnv = {
      ...test.environment,
      REVIEW_CREDENTIAL_HELPER: helper,
      TEST_SECRET_VAULT: vault,
    };
    delete environment.TYPESAFE_API_KEY;
    const child = spawn("script", ["-qfec", command, "/dev/null"], {
      cwd: test.repository,
      env: environment,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const marker = "interactive-setup-secret";
    let output = "";
    let supplied = false;
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
      if (!supplied && output.includes("Jev API key:")) {
        supplied = true;
        child.stdin.write(`${marker}\n`);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    const exit = await new Promise<number | null>((resolveExit, rejectExit) => {
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        rejectExit(new Error(`interactive setup timed out: ${output}`));
      }, 5_000);
      child.once("exit", (code) => { clearTimeout(timeout); resolveExit(code); });
      child.once("error", rejectExit);
    });
    expect(exit).toBe(6);
    expect(supplied).toBe(true);
    expect(output).not.toContain(marker);
    expect(readFileSync(vault, "utf8")).toBe(marker);
    const encoded = output.split(/\r?\n/).find((line) => line.startsWith('{"version":1,"operation":"setup"'));
    if (encoded === undefined) throw new Error(`setup JSON was not emitted: ${output}`);
    const result = JSON.parse(encoded) as SetupOutput;
    expect(result.stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: "credential", status: "complete" }),
      expect.objectContaining({ stage: "host-trust", status: "unknown" }),
    ]));
    expect(result.providerCalls).toBe(0);
  }, 10_000);
});
