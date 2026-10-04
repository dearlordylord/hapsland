import { DEFAULT_CHILD_TIMEOUT_MS } from "../../scripts/test-harness/policy.mjs";
import { createInstallationPackageFixture } from "../test-support/installation-package.ts";
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
import { spawn } from "node:child_process";
import { execFileSync, spawnSync } from "../../scripts/test-harness/process.mjs";
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
    REVIEW_INSTALL_ENTRYPOINT: createInstallationPackageFixture(root),
    REVIEW_STATE_PATH: join(root, "consent"),
    REVIEW_USER_CONFIG_PATH: join(root, "user.jsonc"),
    REVIEW_CREDENTIAL_STATE_PATH: join(root, "credential-state.json"),
    TYPESAFE_API_KEY: "setup-environment-secret",
  };
  return { root, repository, codexHome, codexExecutable, environment };
};

type SetupOutput = {
  readonly status: string;
  readonly providerCalls: number;
  readonly stages: ReadonlyArray<{ readonly stage: string; readonly status: string; readonly summary: string; readonly observed?: unknown }>;
  readonly actions: ReadonlyArray<{
    readonly code: string;
    readonly action: string;
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
      ...(request.host === "claude" ? {} : { codexHome: fixtureValue.codexHome, codexExecutable: fixtureValue.codexExecutable }),
      ...request,
    }),
    encoding: "utf8",
    timeout: DEFAULT_CHILD_TIMEOUT_MS,
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
});

const installDisabled = (test: ReturnType<typeof fixture>) => {
  writeFileSync(join(test.root, "user.jsonc"), '{"version":1,"excludes":["**/*"]}');
  const request = { scope: { cwd: test.repository, review: "disabled" }, credential: "skip" };
  const preview = invoke(test, request);
  const installProposalDigest = authorization(preview).installProposalDigest;
  const completed = invoke(test, { ...request, installProposalDigest });
  expect(completed.status).toBe("completed");
};

const credentialHelper = (test: ReturnType<typeof fixture>, setStatus: string) => {
  const helper = join(test.root, `credential-${setStatus}.mjs`);
  writeFileSync(helper, `#!/usr/bin/env node
const operation = process.argv[2];
if (operation === "get") console.log('{"status":"missing"}');
else if (operation === "set") { for await (const chunk of process.stdin) void chunk; console.log(JSON.stringify({status:${JSON.stringify(setStatus)}})); }
else if (operation === "probe") console.log('{"status":"available"}');
`);
  chmodSync(helper, 0o700);
  return helper;
};

const invokeMaskedSetup = async (
  test: ReturnType<typeof fixture>,
  environment: NodeJS.ProcessEnv,
  credential: string,
) => {
  const requestPath = join(test.root, `masked-${credential.length}-${Date.now()}.json`);
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
  const command = `${quote(process.execPath)} ${quote(setupEntrypoint())} --setup < ${quote(requestPath)}`;
  const child = spawn("script", ["-qfec", command, "/dev/null"], {
    cwd: test.repository,
    env: environment,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  let supplied = false;
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
    if (!supplied && output.includes("Jev API key:")) {
      supplied = true;
      child.stdin.write(`${credential}\n`);
    }
  });
  child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
  const exit = await new Promise<number | null>((resolveExit, rejectExit) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      rejectExit(new Error(`interactive setup timed out: ${output}`));
    }, DEFAULT_CHILD_TIMEOUT_MS);
    child.once("exit", (code) => { clearTimeout(timeout); resolveExit(code); });
    child.once("error", rejectExit);
  });
  expect(exit).toBe(6);
  expect(supplied).toBe(true);
  if (credential.length > 0) expect(output).not.toContain(credential);
  const encoded = output.split(/\r?\n/).find((line) => line.startsWith('{"version":1,"operation":"setup"'));
  if (encoded === undefined) throw new Error(`setup JSON was not emitted: ${output}`);
  return JSON.parse(encoded) as SetupOutput;
};

describe("public resumable setup operation", () => {
  it("installs with exact approval and effective file settings without a repository grant", () => {
    const test = fixture();
    const preview = invoke(test, {});
    expect(preview.status).toBe("needs-user-action");
    expect(preview.stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: "compatibility", status: "complete" }),
      expect.objectContaining({ stage: "installation", status: "pending" }),
      expect.objectContaining({ stage: "credential", status: "complete" }),
      expect.objectContaining({ stage: "repository", status: "complete" }),
      expect.objectContaining({ stage: "execution-context", status: "unknown" }),
    ]));
    const approvals = authorization(preview);
    expect(approvals.installProposalDigest).toMatch(/^[a-f0-9]{64}$/);
    const installationStage = preview.stages.find((stage) => stage.stage === "installation");
    expect(installationStage?.observed).toMatchObject({
      proposal: {
        digest: approvals.installProposalDigest,
        changes: expect.arrayContaining([
          expect.objectContaining({ file: expect.any(String), beforeDigest: expect.any(String), afterDigest: expect.any(String) }),
        ]),
        ownedChanges: {
          runtime: { executable: expect.any(String), args: expect.any(Array) },
          hook: {
            file: join(test.codexHome, "hooks.json"),
            matcher: "^(apply_patch|Edit|Write|Bash)$",
            handlers: [expect.objectContaining({ command: expect.any(String), timeout: 10 }), expect.objectContaining({ command: expect.any(String), timeout: 25, async: true })],
          },
          ownership: { file: join(test.codexHome, ".realtime-review-tool", "installation-v1.json") },
        },
      },
    });

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
      expect.objectContaining({ stage: "repository", summary: expect.stringContaining("file settings loaded") }),
    ]));
    const hooks = JSON.parse(readFileSync(join(test.codexHome, "hooks.json"), "utf8")) as {
      hooks: { PostToolUse: ReadonlyArray<unknown> };
    };
    expect(hooks.hooks.PostToolUse).toHaveLength(1);
    expect(existsSync(join(test.root, "consent"))).toBe(false);
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

    const pending = invoke(test, {});
    expect(pending.stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: "installation", status: "partial", observed: expect.objectContaining({
        recovery: expect.any(Object),
        proposal: expect.objectContaining({ digest: approvals.installProposalDigest, changes: expect.any(Array), ownedChanges: expect.any(Object) }),
      }) }),
    ]));

    const resumed = invoke(test, approvals);
    expect(resumed.stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: "installation", status: "complete" }),
      expect.objectContaining({ stage: "repository", status: "complete" }),
    ]));
    expect(existsSync(join(test.codexHome, ".realtime-review-tool", "journal-v1.json"))).toBe(false);
  });

  it("asks for user exclude-all when review disabled is requested", () => {
    const test = fixture();
    const pending = invoke(test, { scope: { cwd: test.repository, review: "disabled" }, credential: "skip" });
    expect(pending.stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: "repository", status: "pending" }),
    ]));
    expect(pending.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "exclude-all-files" }),
    ]));
  });

  it("completes with review disabled and no credential", () => {
    const test = fixture();
    writeFileSync(join(test.root, "user.jsonc"), '{"version":1,"excludes":["**/*"]}');
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
      expect.objectContaining({ stage: "repository", status: "complete", summary: expect.stringContaining("exclude all files") }),
      expect.objectContaining({ stage: "execution-context", status: "unknown" }),
    ]));
    expect(existsSync(join(test.root, "consent"))).toBe(false);
  });

  it("bounds noninteractive missing-secret handoff", () => {
    const test = fixture();
    const environment = { ...test.environment };
    delete environment.TYPESAFE_API_KEY;
    const output = invoke(test, {}, environment);
    expect(output.status).toBe("needs-user-action");
    expect(output.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "provide-credential" }),
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
      }, DEFAULT_CHILD_TIMEOUT_MS);
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
  });

  it("reports cancelled masked input without falling back to stale missing state", () => {
    const test = fixture();
    installDisabled(test);
    const environment: NodeJS.ProcessEnv = {
      ...test.environment,
      REVIEW_CREDENTIAL_HELPER: credentialHelper(test, "unavailable"),
    };
    delete environment.TYPESAFE_API_KEY;
    const result = invoke(test, { credential: "saved", interactive: true }, environment);
    expect(result.stages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        stage: "credential",
        status: "pending",
        observed: expect.objectContaining({ status: "cancelled", previousCredentialPreserved: true }),
      }),
    ]));
    expect(result.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "credential-entry-cancelled", action: expect.stringContaining("hapsland --login") }),
    ]));
  });

  it.skipIf(process.platform !== "linux")("reports invalid, unavailable, and indeterminate interactive storage outcomes", async () => {
    const cases = [
      { helperStatus: "unavailable", input: "", expectedStatus: "invalid", code: "replace-invalid-credential" },
      { helperStatus: "unavailable", input: "unavailable-secret", expectedStatus: "unavailable", code: "recover-credential-storage" },
      { helperStatus: "indeterminate", input: "indeterminate-secret", expectedStatus: "indeterminate", code: "reconcile-credential-lifecycle" },
    ] as const;
    for (const fixtureCase of cases) {
      const test = fixture();
      installDisabled(test);
      const environment: NodeJS.ProcessEnv = {
        ...test.environment,
        REVIEW_CREDENTIAL_HELPER: credentialHelper(test, fixtureCase.helperStatus),
      };
      delete environment.TYPESAFE_API_KEY;
      const result = await invokeMaskedSetup(test, environment, fixtureCase.input);
      expect(result.stages).toEqual(expect.arrayContaining([
        expect.objectContaining({
          stage: "credential",
          status: "pending",
          observed: expect.objectContaining({
            status: fixtureCase.expectedStatus,
            ...(fixtureCase.expectedStatus === "indeterminate"
              ? { savedCredentialUse: "suspended" }
              : { previousCredentialPreserved: true }),
          }),
        }),
      ]));
      const recovery = result.actions.find((action) => action.code === fixtureCase.code);
      expect(recovery?.action).toContain("hapsland --login");
      if (fixtureCase.expectedStatus === "indeterminate") {
        expect(recovery?.action).toContain("hapsland --logout");
      }
    }
  });
});

describe("setup repository failures", () => {
  it("reports an undiscoverable scope without claiming credential readiness", () => {
    const test = fixture();
    const output = invoke(test, { scope: { cwd: test.root, review: "enabled" } });
    expect(output.status).toBe("unsupported");
    expect(output.stages.find(stage => stage.stage === "credential")?.status).toBe("unknown");
    expect(output.stages.find(stage => stage.stage === "repository")?.status).toBe("unsupported");
    expect(output.actions.some(action => action.code === "select-repository")).toBe(true);
    expect(output.actions.some(action => action.code === "provide-credential")).toBe(false);
  });

  it("reports invalid review configuration as a conflict without requesting a credential", () => {
    const test = fixture();
    writeFileSync(join(test.root, "user.jsonc"), '{"version":1,"includes":42}');
    const output = invoke(test, {});
    expect(output.status).toBe("conflict");
    expect(output.stages.find(stage => stage.stage === "credential")?.status).toBe("unknown");
    expect(output.stages.find(stage => stage.stage === "repository")?.status).toBe("conflict");
    expect(output.actions.some(action => action.code === "repair-repository-configuration")).toBe(true);
    expect(output.actions.some(action => action.code === "provide-credential")).toBe(false);
  });
});

describe("Claude setup shares the resumable credential and repository workflow", () => {
  it("requires digest approval, preserves independent hooks, and supports repeated setup", () => {
    const test = fixture();
    const claudeHome = join(test.root, "claude-home"); mkdirSync(claudeHome);
    const claudeExecutable = join(test.root, "claude");
    writeFileSync(claudeExecutable, "#!/bin/sh\nprintf '2.1.218\\n'\n", { mode: 0o700 });
    const independent = { hooks: { Stop: [{ hooks: [{ type: "command", command: "independent-stop" }] }] }, permissions: { allow: ["Read"] } };
    writeFileSync(join(claudeHome, "settings.json"), JSON.stringify(independent));
    const request = { host: "claude", claudeHome, claudeExecutable };
    const preview = invoke(test, request);
    expect(preview.stages.find(stage => stage.stage === "installation")?.status).toBe("pending");
    expect(readFileSync(join(claudeHome, "settings.json"), "utf8")).toBe(JSON.stringify(independent));
    const applied = invoke(test, { ...request, ...authorization(preview) });
    expect(applied.stages.find(stage => stage.stage === "installation")?.status).toBe("complete");
    expect(applied.stages.find(stage => stage.stage === "credential")?.status).toBe("complete");
    expect(applied.actions.find(action => action.code === "complete-native-trust")?.action).toContain("Claude Code");
    const settings = JSON.parse(readFileSync(join(claudeHome, "settings.json"), "utf8"));
    expect(settings.hooks.Stop[0]).toEqual(independent.hooks.Stop[0]);
    expect(settings.permissions).toEqual(independent.permissions);
    const repeated = invoke(test, request);
    expect(repeated.stages.find(stage => stage.stage === "installation")?.status).toBe("complete");
    expect(repeated.actions.some(action => action.code === "approve-installation")).toBe(false);
    const targetEntrypoint = join(test.root, "next-cli.js"); writeFileSync(targetEntrypoint, "// next installed entrypoint\n");
    const targetEnvironment = { ...test.environment, REVIEW_INSTALL_ENTRYPOINT: targetEntrypoint };
    const targetPreview = invoke(test, request, targetEnvironment);
    expect(targetPreview.stages.find(stage => stage.stage === "installation")?.status).toBe("pending");
    expect(readFileSync(join(claudeHome, "settings.json"), "utf8")).not.toContain(targetEntrypoint);
    const targetApplied = invoke(test, { ...request, ...authorization(targetPreview) }, targetEnvironment);
    expect(targetApplied.stages.find(stage => stage.stage === "installation")?.status).toBe("complete");
    expect(readFileSync(join(claudeHome, "settings.json"), "utf8")).toContain(targetEntrypoint);

  });
  it("rejects an unsupported Claude profile before writing hooks", () => {
    const test = fixture();
    const claudeHome = join(test.root, "claude-home");
    const claudeExecutable = join(test.root, "claude");
    writeFileSync(claudeExecutable, "#!/bin/sh\nprintf '1.0.0\\n'\n", { mode: 0o700 });
    const output = invoke(test, { host: "claude", claudeHome, claudeExecutable });
    expect(output.status).toBe("unsupported");
    expect(existsSync(join(claudeHome, "settings.json"))).toBe(false);
  });
});
