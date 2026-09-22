import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const roots: Array<string> = [];
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

afterEach(() => {
  delete process.env.REVIEW_INSTALL_FAIL_AFTER_WRITES;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "review install 'quoted path' "));
  roots.push(root);
  const home = join(root, "custom codex home 'one'");
  const bin = join(root, "fake codex");
  mkdirSync(home, { recursive: true });
  writeFileSync(bin, "#!/bin/sh\nprintf 'codex-cli 0.155.1\\n'\n", { mode: 0o700 });
  chmodSync(bin, 0o700);
  return { root, home, bin };
};

const invoke = (
  operation: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
) => {
  const child = spawnSync(process.execPath, ["src/cli.ts", `--${String(operation.operation)}`], {
    cwd: process.cwd(),
    input: JSON.stringify({ version: 1, ...operation }),
    encoding: "utf8",
    env,
    timeout: 10_000,
  });
  expect(child.stderr).toBe("");
  const output = JSON.parse(child.stdout) as Record<string, unknown>;
  const expectedExit = output.status === "unsupported"
    ? 3
    : output.status === "conflict" || output.status === "proposal-mismatch"
      ? 4
      : output.status === "partial"
        ? 5
        : 0;
  expect(child.status).toBe(expectedExit);
  return output;
};

const previewAndInstall = (home: string, bin: string, env: NodeJS.ProcessEnv = process.env) => {
  const preview = invoke({ operation: "install-preview", codexHome: home, codexExecutable: bin }, env);
  expect(preview.status).toBe("preview");
  const digest = (preview.proposal as { digest: string }).digest;
  const installed = invoke({ operation: "install", codexHome: home, codexExecutable: bin, proposalDigest: digest }, env);
  return { preview, digest, installed };
};

describe("public Codex installation operations", { timeout: 30_000 }, () => {
  it("previews exact changes, quotes paths, installs idempotently, and preserves unrelated configuration", () => {
    const { root, home, bin } = fixture();
    const quotedEntrypoint = join(root, "packaged path 'quoted'", "cli.js");
    mkdirSync(join(root, "packaged path 'quoted'"), { recursive: true });
    writeFileSync(quotedEntrypoint, "#!/usr/bin/env node\n");
    writeFileSync(join(dirname(quotedEntrypoint), "parser-main.js"), "#!/usr/bin/env node\n");
    mkdirSync(join(dirname(quotedEntrypoint), "resident"));
    writeFileSync(join(dirname(quotedEntrypoint), "resident", "main.js"), "#!/usr/bin/env node\n");
    const installEnvironment = {
      ...process.env,
      REVIEW_INSTALL_ENTRYPOINT: quotedEntrypoint,
    };
    const independent = { type: "command", command: "independent-hook", timeout: 3 };
    writeFileSync(join(home, "config.toml"), "# keep this comment\nmodel = 'gpt-6'\n\n[features]\nresponses_websockets_v2 = true\n");
    writeFileSync(join(home, "hooks.json"), `${JSON.stringify({
      description: "keep me",
      hooks: { PostToolUse: [{ matcher: "^Bash$", hooks: [independent] }] },
      custom: { order: ["first", "second"] },
    }, null, 2)}\n`);

    const preview = invoke({ operation: "install-preview", codexHome: home, codexExecutable: bin }, installEnvironment);
    expect(preview).toMatchObject({ version: 1, status: "preview", sourceEgressAuthorized: false });
    expect(preview.proposal).toMatchObject({
      ownedChanges: {
        runtime: {
          executable: process.execPath,
          entrypoint: quotedEntrypoint,
          nodeVersion: process.version,
          platform: process.platform,
          architecture: process.arch,
        },
        feature: { file: join(home, "config.toml"), table: "features", key: "hooks", value: true },
        hook: {
          file: join(home, "hooks.json"),
          event: "PostToolUse",
          matcher: "^(apply_patch|Edit|Write|Bash)$",
          handlers: [{ type: "command", timeout: 10 }],
        },
        ownership: { file: join(home, ".realtime-review-tool", "installation-v1.json"), version: 1, adapter: "codex" },
      },
    });
    const previewCommand = ((preview.proposal as {
      ownedChanges: { hook: { handlers: Array<{ command: string }> } };
    }).ownedChanges.hook.handlers[0]?.command);
    expect(previewCommand).toBe(
      `${shellQuote(process.execPath)} ${shellQuote(quotedEntrypoint)} --codex-hook --controlled-writer --review-tool-owned=codex-v1`,
    );
    expect(JSON.stringify((preview.proposal as { ownedChanges: unknown }).ownedChanges)).not.toContain("keep me");
    expect(readFileSync(join(home, "config.toml"), "utf8")).not.toContain("hooks = true");
    expect(existsSync(join(home, ".realtime-review-tool", "installation-v1.json"))).toBe(false);

    const digest = (preview.proposal as { digest: string }).digest;
    const installed = invoke({ operation: "install", codexHome: home, codexExecutable: bin, proposalDigest: digest }, installEnvironment);
    expect(installed).toMatchObject({ version: 1, status: "installed", sourceEgressAuthorized: false });
    const config = readFileSync(join(home, "config.toml"), "utf8");
    expect(config).toContain("# keep this comment");
    expect(config).toContain("responses_websockets_v2 = true");
    expect(config).toContain("hooks = true");
    const hooks = JSON.parse(readFileSync(join(home, "hooks.json"), "utf8")) as {
      description: string;
      custom: { order: Array<string> };
      hooks: { PostToolUse: Array<{ hooks: Array<{ command: string }> }> };
    };
    expect(hooks.description).toBe("keep me");
    expect(hooks.custom.order).toEqual(["first", "second"]);
    expect(hooks.hooks.PostToolUse[0]?.hooks[0]).toEqual(independent);
    expect(hooks.hooks.PostToolUse[1]?.hooks[0]?.command).toContain("'\\''");
    expect(hooks.hooks.PostToolUse[1]?.hooks[0]?.command).toContain("--review-tool-owned=codex-v1");

    const repeatPreview = invoke({ operation: "install-preview", codexHome: home, codexExecutable: bin }, installEnvironment);
    expect(repeatPreview).toMatchObject({ status: "preview", installed: true });
    expect((repeatPreview.proposal as { changes: Array<unknown> }).changes).toEqual([]);
    const repeat = invoke({
      operation: "install",
      codexHome: home,
      codexExecutable: bin,
      proposalDigest: (repeatPreview.proposal as { digest: string }).digest,
    }, installEnvironment);
    expect(repeat.status).toBe("already-installed");
  });

  it("edits quoted feature tables without matching table text inside multiline strings", () => {
    const { home, bin } = fixture();
    const original = `message = """
[features]
hooks = false
"""

["features"] # quoted table name
responses_websockets_v2 = true
`;
    writeFileSync(join(home, "config.toml"), original);
    previewAndInstall(home, bin);
    const installed = readFileSync(join(home, "config.toml"), "utf8");
    expect(installed).toContain(`message = """
[features]
hooks = false
"""`);
    expect(installed).toContain(`["features"] # quoted table name
hooks = true
responses_websockets_v2 = true`);
    const uninstallPreview = invoke({ operation: "uninstall", codexHome: home });
    invoke({
      operation: "uninstall",
      codexHome: home,
      proposalDigest: (uninstallPreview.proposal as { digest: string }).digest,
    });
    expect(readFileSync(join(home, "config.toml"), "utf8")).toBe(original);
  });

  it("rejects unsupported hosts and malformed, duplicate, or modified owned configuration", () => {
    const unsupported = fixture();
    writeFileSync(unsupported.bin, "#!/bin/sh\nprintf 'codex-cli 9.9.9\\n'\n", { mode: 0o700 });
    const unsupportedPreview = invoke({ operation: "install-preview", codexHome: unsupported.home, codexExecutable: unsupported.bin });
    expect(unsupportedPreview.status).toBe("unsupported");
    const unsupportedInstall = invoke({
      operation: "install",
      codexHome: unsupported.home,
      codexExecutable: unsupported.bin,
      proposalDigest: "0".repeat(64),
    });
    expect(unsupportedInstall.status).toBe("unsupported");
    expect(existsSync(join(unsupported.home, "hooks.json"))).toBe(false);

    const malformed = fixture();
    writeFileSync(join(malformed.home, "hooks.json"), "{broken");
    expect(invoke({ operation: "install-preview", codexHome: malformed.home, codexExecutable: malformed.bin })).toMatchObject({
      status: "conflict",
      error: { code: "configuration_conflict" },
    });
    const malformedToml = fixture();
    writeFileSync(join(malformedToml.home, "config.toml"), "[features\nhooks = true\n");
    expect(invoke({ operation: "install-preview", codexHome: malformedToml.home, codexExecutable: malformedToml.bin })).toMatchObject({ status: "conflict" });
    const unreadableShape = fixture();
    mkdirSync(join(unreadableShape.home, "config.toml"));
    expect(invoke({ operation: "install-preview", codexHome: unreadableShape.home, codexExecutable: unreadableShape.bin })).toMatchObject({
      status: "conflict",
      error: { message: expect.stringContaining("unreadable") },
    });

    const duplicate = fixture();
    writeFileSync(join(duplicate.home, "hooks.json"), JSON.stringify({
      hooks: { PostToolUse: [
        { matcher: "x", hooks: [{ command: "tool --review-tool-owned=codex-v1" }] },
        { matcher: "y", hooks: [{ command: "tool --review-tool-owned=codex-v1" }] },
      ] },
    }));
    expect(invoke({ operation: "install-preview", codexHome: duplicate.home, codexExecutable: duplicate.bin })).toMatchObject({ status: "conflict" });

    const modified = fixture();
    previewAndInstall(modified.home, modified.bin);
    const hooksPath = join(modified.home, "hooks.json");
    const hooksText = readFileSync(hooksPath, "utf8").replace("timeout\": 10", "timeout\": 9");
    writeFileSync(hooksPath, hooksText);
    expect(invoke({ operation: "install-preview", codexHome: modified.home, codexExecutable: modified.bin })).toMatchObject({
      status: "conflict",
      error: { message: expect.stringContaining("locally modified") },
    });
  });

  it("exposes partial completion and resumes the journal without stale overwrite", () => {
    const { home, bin } = fixture();
    writeFileSync(join(home, "config.toml"), "model = 'gpt-6'\n");
    const preview = invoke({ operation: "install-preview", codexHome: home, codexExecutable: bin });
    const digest = (preview.proposal as { digest: string }).digest;
    const partial = invoke(
      { operation: "install", codexHome: home, codexExecutable: bin, proposalDigest: digest },
      { ...process.env, REVIEW_INSTALL_FAIL_AFTER_WRITES: "1" },
    );
    expect(partial).toMatchObject({ status: "partial", recovery: { proposalDigest: digest, completedFiles: 1 } });
    expect(existsSync(join(home, ".realtime-review-tool", "journal-v1.json"))).toBe(true);

    const resumed = invoke({ operation: "install", codexHome: home, codexExecutable: bin, proposalDigest: digest });
    expect(resumed).toMatchObject({ status: "installed", resumed: true });
    expect(existsSync(join(home, ".realtime-review-tool", "journal-v1.json"))).toBe(false);

    const concurrent = fixture();
    const concurrentPreview = invoke({ operation: "install-preview", codexHome: concurrent.home, codexExecutable: concurrent.bin });
    const concurrentDigest = (concurrentPreview.proposal as { digest: string }).digest;
    expect(invoke(
      { operation: "install", codexHome: concurrent.home, codexExecutable: concurrent.bin, proposalDigest: concurrentDigest },
      { ...process.env, REVIEW_INSTALL_FAIL_AFTER_WRITES: "1" },
    ).status).toBe("partial");
    const unrelatedHooks = `${JSON.stringify({ hooks: { SessionStart: [{ matcher: "*", hooks: [] }] } }, null, 2)}\n`;
    writeFileSync(join(concurrent.home, "hooks.json"), unrelatedHooks);
    const conflicted = invoke({ operation: "install", codexHome: concurrent.home, codexExecutable: concurrent.bin, proposalDigest: concurrentDigest });
    expect(conflicted).toMatchObject({
      status: "partial",
      error: {
        code: "recovery_conflict",
        message: expect.stringContaining("no stale content was restored"),
      },
    });
    expect(readFileSync(join(concurrent.home, "hooks.json"), "utf8")).toBe(unrelatedHooks);

    const completedChange = fixture();
    const completedPreview = invoke({ operation: "install-preview", codexHome: completedChange.home, codexExecutable: completedChange.bin });
    const completedDigest = (completedPreview.proposal as { digest: string }).digest;
    expect(invoke(
      { operation: "install", codexHome: completedChange.home, codexExecutable: completedChange.bin, proposalDigest: completedDigest },
      { ...process.env, REVIEW_INSTALL_FAIL_AFTER_WRITES: "1" },
    ).status).toBe("partial");
    const completedConfig = `${readFileSync(join(completedChange.home, "config.toml"), "utf8")}# unrelated later edit\n`;
    writeFileSync(join(completedChange.home, "config.toml"), completedConfig);
    expect(invoke({
      operation: "install",
      codexHome: completedChange.home,
      codexExecutable: completedChange.bin,
      proposalDigest: completedDigest,
    })).toMatchObject({
      status: "partial",
      error: { code: "recovery_conflict", message: expect.stringContaining("completed journal step changed") },
    });
    expect(readFileSync(join(completedChange.home, "config.toml"), "utf8")).toBe(completedConfig);
  });

  it("rejects missing runtime or packaged entrypoint before creating installation state", () => {
    const missingRuntime = fixture();
    const runtimeResult = invoke(
      { operation: "install-preview", codexHome: missingRuntime.home, codexExecutable: missingRuntime.bin },
      { ...process.env, REVIEW_INSTALL_RUNTIME: join(missingRuntime.root, "missing-node") },
    );
    expect(runtimeResult).toMatchObject({
      status: "unsupported",
      host: { compatibility: { runtime: { checks: { runtime: { ready: false, observed: "missing" } } } } },
    });
    expect(existsSync(join(missingRuntime.home, ".realtime-review-tool"))).toBe(false);

    const nonRuntime = fixture();
    const trueResult = invoke(
      { operation: "install-preview", codexHome: nonRuntime.home, codexExecutable: nonRuntime.bin },
      { ...process.env, REVIEW_INSTALL_RUNTIME: "/bin/true" },
    );
    expect(trueResult).toMatchObject({
      status: "unsupported",
      host: { compatibility: { runtime: { checks: {
        runtime: { ready: true },
        node: { ready: false, observed: "not-a-supported-node-runtime" },
      } } } },
    });
    expect(existsSync(join(nonRuntime.home, ".realtime-review-tool"))).toBe(false);

    const missingEntrypoint = fixture();
    const entrypointEnvironment = { ...process.env, REVIEW_INSTALL_ENTRYPOINT: join(missingEntrypoint.root, "missing-cli.js") };
    const preview = invoke(
      { operation: "install-preview", codexHome: missingEntrypoint.home, codexExecutable: missingEntrypoint.bin },
      entrypointEnvironment,
    );
    expect(preview).toMatchObject({
      status: "unsupported",
      host: { compatibility: { runtime: { checks: { entrypoint: { ready: false, observed: "missing" } } } } },
    });
    const install = invoke(
      { operation: "install", codexHome: missingEntrypoint.home, codexExecutable: missingEntrypoint.bin, proposalDigest: "0".repeat(64) },
      entrypointEnvironment,
    );
    expect(install.status).toBe("unsupported");
    expect(existsSync(join(missingEntrypoint.home, ".realtime-review-tool"))).toBe(false);
    expect(existsSync(join(missingEntrypoint.home, "hooks.json"))).toBe(false);

    const missingCompanions = fixture();
    const loneEntrypoint = join(missingCompanions.root, "dist", "cli.js");
    mkdirSync(dirname(loneEntrypoint), { recursive: true });
    writeFileSync(loneEntrypoint, "#!/usr/bin/env node\n");
    const companions = invoke(
      { operation: "install-preview", codexHome: missingCompanions.home, codexExecutable: missingCompanions.bin },
      { ...process.env, REVIEW_INSTALL_ENTRYPOINT: loneEntrypoint },
    );
    expect(companions).toMatchObject({
      status: "unsupported",
      host: { compatibility: { runtime: { checks: {
        entrypoint: { ready: true },
        parser: { ready: false, observed: "missing" },
        resident: { ready: false, observed: "missing" },
      } } } },
    });
  });

  it("uninstalls only owned state and preserves hooks, rules, grants, and preexisting feature settings", () => {
    const { home, bin } = fixture();
    const config = "[features]\nhooks = true\n\n[review]\nrules = ['user-rule']\n";
    const independent = { matcher: "^Bash$", hooks: [{ type: "command", command: "independent-hook", timeout: 5 }] };
    writeFileSync(join(home, "config.toml"), config);
    writeFileSync(join(home, "hooks.json"), `${JSON.stringify({ hooks: { PostToolUse: [independent] } }, null, 2)}\n`);
    writeFileSync(join(home, "grant.json"), "repository-grant\n");
    previewAndInstall(home, bin);

    const uninstallPreview = invoke({ operation: "uninstall", codexHome: home });
    expect(uninstallPreview).toMatchObject({ status: "preview", remaining: expect.arrayContaining(["repository grants", "credentials"]) });
    const uninstalled = invoke({
      operation: "uninstall",
      codexHome: home,
      proposalDigest: (uninstallPreview.proposal as { digest: string }).digest,
    });
    expect(uninstalled.status).toBe("uninstalled");
    expect(readFileSync(join(home, "config.toml"), "utf8")).toBe(config);
    expect(JSON.parse(readFileSync(join(home, "hooks.json"), "utf8"))).toEqual({ hooks: { PostToolUse: [independent] } });
    expect(readFileSync(join(home, "grant.json"), "utf8")).toBe("repository-grant\n");
    expect(existsSync(join(home, ".realtime-review-tool", "installation-v1.json"))).toBe(false);
  });

  it("conflicts and preserves a locally modified owned feature value", () => {
    for (const replacement of ["hooks = false", "# hooks = true"] as const) {
      const { home, bin } = fixture();
      previewAndInstall(home, bin);
      const configPath = join(home, "config.toml");
      const modified = readFileSync(configPath, "utf8").replace("hooks = true", replacement);
      writeFileSync(configPath, modified);
      const result = invoke({ operation: "uninstall", codexHome: home });
      expect(result).toMatchObject({
        status: "conflict",
        error: { message: expect.stringContaining("feature value was locally modified") },
      });
      expect(readFileSync(configPath, "utf8")).toBe(modified);
      expect(readFileSync(join(home, "hooks.json"), "utf8")).toContain("--review-tool-owned=codex-v1");
    }
  });

  it("rechecks a preexisting hooks feature before journal recovery", () => {
    const { home, bin } = fixture();
    const configPath = join(home, "config.toml");
    writeFileSync(configPath, "[features]\nhooks = true\n");
    const preview = invoke({ operation: "install-preview", codexHome: home, codexExecutable: bin });
    const digest = (preview.proposal as { digest: string }).digest;
    expect(invoke(
      { operation: "install", codexHome: home, codexExecutable: bin, proposalDigest: digest },
      { ...process.env, REVIEW_INSTALL_FAIL_AFTER_WRITES: "1" },
    ).status).toBe("partial");
    const modified = "[features]\nhooks = false\n";
    writeFileSync(configPath, modified);
    const recovery = invoke({ operation: "install", codexHome: home, codexExecutable: bin, proposalDigest: digest });
    expect(recovery).toMatchObject({
      status: "conflict",
      error: { message: expect.stringContaining("preexisting Codex hooks feature changed") },
    });
    expect(readFileSync(configPath, "utf8")).toBe(modified);
  });

  it("bounds lock acquisition and reports no mutation", () => {
    const { home, bin } = fixture();
    const preview = invoke({ operation: "install-preview", codexHome: home, codexExecutable: bin });
    const lockDirectory = join(home, ".realtime-review-tool");
    mkdirSync(lockDirectory, { recursive: true });
    writeFileSync(join(lockDirectory, "installation.lock"), "busy\n");
    const result = invoke({
      operation: "install",
      codexHome: home,
      codexExecutable: bin,
      proposalDigest: (preview.proposal as { digest: string }).digest,
    });
    expect(result).toMatchObject({ status: "conflict", error: { message: expect.stringContaining("1500ms") } });
    expect(existsSync(join(home, "hooks.json"))).toBe(false);
  });
});
