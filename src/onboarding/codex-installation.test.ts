import { createInstallationPackageFixture, installationPackageDeclaration } from "../test-support/installation-package.ts";
import { ConfigProvider, Effect } from "effect";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { inspectCodexInstallation, installCodexIntegration, previewCodexInstallation, uninstallCodexIntegration } from "./codex-installation.ts";

const runInstallation = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect.pipe(
  Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ preserveEmptyStrings: true }))),
));

const roots: Array<string> = [];
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

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

const localPackage = (root: string, version: string, residentProtocol = 1) => {
  const packageRoot = join(root, `review-tool-${version}`);
  const dist = join(packageRoot, "dist");
  mkdirSync(join(dist, "resident"), { recursive: true });
  writeFileSync(join(packageRoot, "package.json"), `${JSON.stringify({
    name: "realtime-review-prototype",
    version,
    type: "module",
  }, null, 2)}\n`);
  writeFileSync(join(packageRoot, "package-runtime.json"), `${JSON.stringify({
    schemaVersion: 1,
    runtime: { name: "node", version: process.version.slice(1) },
    codex: { compatibleVersions: ["0.155.1", "0.156.0"] },
    profiles: [{ operatingSystem: process.platform, architecture: process.arch }],
    residentProtocol,
  }, null, 2)}\n`);
  const entrypoint = join(dist, "cli.js");
  writeFileSync(entrypoint, [
    "import { appendFileSync } from 'node:fs';",
    `appendFileSync(process.env.REVIEW_VERSION_LOG, ${JSON.stringify(`${version}\n`)});`,
    "process.stdin.resume();",
  ].join("\n"));
  writeFileSync(join(dist, "parser-main.js"), "process.stdin.resume();\n");
  writeFileSync(join(dist, "resident", "main.js"), "process.stdin.resume();\n");
  return entrypoint;
};

const invoke = (
  operation: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
) => {
  const fixtureEnvironment = env.REVIEW_INSTALL_ENTRYPOINT !== undefined || typeof operation.codexHome !== "string"
    ? env : { ...env, REVIEW_INSTALL_ENTRYPOINT: createInstallationPackageFixture(dirname(operation.codexHome)) };
  const child = spawnSync(process.execPath, ["src/cli.ts", `--${String(operation.operation)}`], {
    cwd: process.cwd(),
    input: JSON.stringify({ version: 1, ...operation }),
    encoding: "utf8",
    env: fixtureEnvironment,
    timeout: 45_000,
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

const refreshJournalDigests = (journal: Record<string, unknown>, home: string) => {
  const changes = journal.mutations as Array<Record<string, unknown>>;
  for (const change of changes) {
    const afterContent = change.afterContent;
    change.afterDigest = afterContent === null
      ? sha256("installation-v1:missing")
      : sha256(`installation-v1:file\0${String(afterContent)}`);
  }
  journal.proposalDigest = sha256(stableJson({
    version: 1,
    operation: journal.operation,
    adapter: "codex",
    home,
    changes: changes.map(({ path, beforeDigest, afterDigest, description }) => ({
      path,
      beforeDigest,
      afterDigest,
      description,
    })),
  }));
  return String(journal.proposalDigest);
};

const currentLockGeneration = (lockPath: string) => {
  const names = readdirSync(join(lockPath, "generations")).filter((name) => /^\d{16}$/.test(name)).sort();
  const name = names.at(-1);
  if (name === undefined) return undefined;
  const target = readlinkSync(join(lockPath, "generations", name));
  const ownerDirectory = join(lockPath, target.replace("../", ""));
  return {
    number: BigInt(name),
    name,
    ownerDirectory,
    record: JSON.parse(readFileSync(join(ownerDirectory, "record.json"), "utf8")) as { pid: number; owner: string },
  };
};

const waitFor = async <A>(read: () => A | undefined, timeout = 5_000): Promise<A> => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = read();
    if (value !== undefined) return value;
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
  throw new Error("timed out waiting for controlled lock state");
};

const spawnOperation = (operation: Record<string, unknown>, env: NodeJS.ProcessEnv) => {
  const child = spawn(process.execPath, ["src/cli.ts", `--${String(operation.operation)}`], {
    cwd: process.cwd(),
    env: env.REVIEW_INSTALL_ENTRYPOINT !== undefined || typeof operation.codexHome !== "string"
      ? env : { ...env, REVIEW_INSTALL_ENTRYPOINT: createInstallationPackageFixture(dirname(operation.codexHome)) },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const closed = new Promise<number | null>((resolveClosed) => {
    child.once("close", (code) => resolveClosed(code));
  });
  child.stdin.end(JSON.stringify({ version: 1, ...operation }));
  return { child, closed };
};

describe("public Codex installation operations", { timeout: 30_000 }, () => {
  it.each(["REVIEW_INSTALL_RUNTIME", "REVIEW_INSTALL_ENTRYPOINT", "REVIEW_INSTALL_CONTROLLED", "REVIEW_INSTALL_FAIL_AFTER_WRITES"])("rejects empty %s before installation state is written", async (key) => {
    const { home, bin } = fixture();
    const result = await Effect.runPromise(installCodexIntegration({ codexHome: home, codexExecutable: bin }).pipe(
      Effect.result,
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ [key]: "" }, { preserveEmptyStrings: true }))),
    ));
    expect(result).toMatchObject({ _tag: "Failure", failure: { reason: "Codex installation configuration is invalid" } });
    expect(readdirSync(home)).toEqual([]);
  });

  it("rejects an empty configured Codex home before inspecting ambient registration", async () => {
    const { bin } = fixture();
    const result = await Effect.runPromise(previewCodexInstallation({ codexExecutable: bin }).pipe(
      Effect.result,
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ CODEX_HOME: "" }, { preserveEmptyStrings: true }))),
    ));
    expect(result).toMatchObject({ _tag: "Failure", failure: { reason: "Codex installation configuration is invalid" } });
  });

  it("rejects Linux x64 against the production arm64 declaration before mutation", () => {
    const test = fixture();
    const runtime = join(test.root, "synthetic-x64-runtime");
    writeFileSync(runtime, `#!/bin/sh\nprintf '%s' '${JSON.stringify({ version: "v24.20.0", platform: "linux", architecture: "x64" })}'\n`, { mode: 0o700 });
    const result = invoke({ operation: "install-preview", codexHome: test.home, codexExecutable: test.bin }, {
      ...process.env, REVIEW_INSTALL_RUNTIME: runtime, REVIEW_INSTALL_ENTRYPOINT: join(process.cwd(), "src/cli.ts"),
    });
    expect(result).toMatchObject({ status: "unsupported", host: { compatibility: { runtime: { supported: false, checks: {
      node: { ready: true }, platform: { ready: false, observed: "linux" }, architecture: { ready: false, observed: "x64", required: "arm64" },
    } } } } });
    expect(readdirSync(test.home)).toEqual([]);
  });

  it("accepts matching synthetic runtime/package profiles independently of release support", () => {
    const test = fixture();
    const entrypoint = createInstallationPackageFixture(test.root);
    const declaration = { ...installationPackageDeclaration(), profiles: [{ operatingSystem: "linux", architecture: "x64" }] };
    writeFileSync(join(dirname(dirname(entrypoint)), "package-runtime.json"), JSON.stringify(declaration));
    const runtime = join(test.root, "synthetic-x64-runtime");
    writeFileSync(runtime, `#!/bin/sh\nprintf '%s' '${JSON.stringify({ version: process.version, platform: "linux", architecture: "x64" })}'\n`, { mode: 0o700 });
    const result = invoke({ operation: "install-preview", codexHome: test.home, codexExecutable: test.bin }, {
      ...process.env, REVIEW_INSTALL_RUNTIME: runtime, REVIEW_INSTALL_ENTRYPOINT: entrypoint,
    });
    expect(result).toMatchObject({ status: "preview", host: { compatibility: { runtime: { supported: true, checks: {
      node: { ready: true }, platform: { ready: true, observed: "linux" }, architecture: { ready: true, observed: "x64" },
    } } } } });
    expect(readdirSync(test.home)).toEqual([]);
  });

  it("inspects the pinned hook runtime when the caller uses another Node path", async () => {
    const test = fixture();
    previewAndInstall(test.home, test.bin);
    const previousRuntime = process.env.REVIEW_INSTALL_RUNTIME;
    const previousEntrypoint = process.env.REVIEW_INSTALL_ENTRYPOINT;
    try {
      process.env.REVIEW_INSTALL_RUNTIME = "/bin/true";
      process.env.REVIEW_INSTALL_ENTRYPOINT = join(process.cwd(), "src/cli.ts");
      expect(await runInstallation(inspectCodexInstallation({ codexHome: test.home, codexExecutable: test.bin }))).toMatchObject({
        status: "installed",
        installed: true,
      });
    } finally {
      if (previousRuntime === undefined) delete process.env.REVIEW_INSTALL_RUNTIME;
      else process.env.REVIEW_INSTALL_RUNTIME = previousRuntime;
      if (previousEntrypoint === undefined) delete process.env.REVIEW_INSTALL_ENTRYPOINT;
      else process.env.REVIEW_INSTALL_ENTRYPOINT = previousEntrypoint;
    }
  });
  it("accepts Codex 0.156.0 and binds its version into the owned hook", () => {
    const { root, home, bin } = fixture();
    writeFileSync(bin, "#!/bin/sh\nprintf 'codex-cli 0.156.0\\n'\n", { mode: 0o700 });
    const entrypoint = localPackage(root, "0.0.0");
    const environment = { ...process.env, REVIEW_INSTALL_ENTRYPOINT: entrypoint };
    const preview = invoke({ operation: "install-preview", codexHome: home, codexExecutable: bin }, environment);
    expect(preview.status).toBe("preview");
    const proposal = preview.proposal as { digest: string; ownedChanges: { hook: { handlers: Array<{ command: string }> } } };
    expect(proposal.ownedChanges.hook.handlers[0]?.command).toContain("--codex-version=0.156.0");
    expect(invoke({ operation: "install", codexHome: home, codexExecutable: bin, proposalDigest: proposal.digest }, environment).status).toBe("installed");
    expect(readFileSync(join(home, "hooks.json"), "utf8")).toContain("--codex-version=0.156.0");
  });
  it.each(["Stop", "SubagentStop"] as const)("rejects a locally modified owned %s hook", async (event) => {
    const { home, bin } = fixture();
    previewAndInstall(home, bin);
    const path = join(home, "hooks.json");
    const settings = JSON.parse(readFileSync(path, "utf8")) as { hooks: Record<typeof event, Array<{ hooks: Array<{ timeout: number }> }>> };
    settings.hooks[event][0]!.hooks[0]!.timeout = 3;
    writeFileSync(path, JSON.stringify(settings));
    expect((await runInstallation(uninstallCodexIntegration({ codexHome: home, codexExecutable: bin }))).status).toBe("conflict");
  });
  it("updates an older owned installation to add SubagentStop", () => {
    const { root, home, bin } = fixture();
    const environment = { ...process.env, REVIEW_INSTALL_ENTRYPOINT: localPackage(root, "1.0.0") };
    previewAndInstall(home, bin, environment);
    const hooksPath = join(home, "hooks.json");
    const previous = JSON.parse(readFileSync(hooksPath, "utf8")) as { hooks: Record<string, unknown> };
    delete previous.hooks.SubagentStop;
    writeFileSync(hooksPath, JSON.stringify(previous));
    const recordPath = join(home, ".realtime-review-tool", "installation-v1.json");
    const record = JSON.parse(readFileSync(recordPath, "utf8")) as { composedFingerprints: { subagentStop?: string } };
    delete record.composedFingerprints.subagentStop;
    writeFileSync(recordPath, JSON.stringify(record));
    const request = { codexHome: home, codexExecutable: bin };
    const preview = invoke({ ...request, operation: "update-preview" }, environment);
    expect(preview.status).toBe("preview");
    const proposalDigest = (preview.proposal as { digest: string }).digest;
    expect(invoke({ ...request, operation: "update", proposalDigest }, environment).status).toBe("updated");
    expect(readFileSync(hooksPath, "utf8")).toContain("SubagentStop");
  });

  it("previews exact changes, quotes paths, installs idempotently, and preserves unrelated configuration", () => {
    const { root, home, bin } = fixture();
    const quotedEntrypoint = join(root, "packaged path 'quoted'", "cli.js");
    mkdirSync(join(root, "packaged path 'quoted'"), { recursive: true });
    writeFileSync(quotedEntrypoint, "#!/usr/bin/env node\n");
    writeFileSync(join(dirname(quotedEntrypoint), "parser-main.js"), "#!/usr/bin/env node\n");
    mkdirSync(join(dirname(quotedEntrypoint), "resident"));
    writeFileSync(join(dirname(quotedEntrypoint), "resident", "main.js"), "#!/usr/bin/env node\n");
    writeFileSync(join(root, "package.json"), readFileSync(join(process.cwd(), "package.json"), "utf8"));
    writeFileSync(join(root, "package-runtime.json"), JSON.stringify(installationPackageDeclaration()));
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
    expect(preview).toMatchObject({ version: 1, status: "preview" });
    expect(preview).not.toHaveProperty("sourceEgressAuthorized");
    expect(JSON.stringify(preview.pending)).not.toContain("enable each repository");
    expect(JSON.stringify(preview.pending)).toContain("file includes/excludes");
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
          handlers: [{ type: "command", timeout: 10 }, { type: "command", timeout: 25, async: true }],
        },
        ownership: { file: join(home, ".realtime-review-tool", "installation-v1.json"), version: 1, adapter: "codex" },
      },
    });
    const previewCommand = ((preview.proposal as {
      ownedChanges: { hook: { handlers: Array<{ command: string }> } };
    }).ownedChanges.hook.handlers[0]?.command);
    expect(previewCommand).toBe(
      `${shellQuote(process.execPath)} ${shellQuote(quotedEntrypoint)} --codex-hook --controlled-writer --composed-edit-hook --review-tool-owned=codex-v1`,
    );
    expect(JSON.stringify((preview.proposal as { ownedChanges: unknown }).ownedChanges)).not.toContain("keep me");
    expect(readFileSync(join(home, "config.toml"), "utf8")).not.toContain("hooks = true");
    expect(existsSync(join(home, ".realtime-review-tool", "installation-v1.json"))).toBe(false);

    const digest = (preview.proposal as { digest: string }).digest;
    const installed = invoke({ operation: "install", codexHome: home, codexExecutable: bin, proposalDigest: digest }, installEnvironment);
    expect(installed).toMatchObject({ version: 1, status: "installed" });
    expect(installed).not.toHaveProperty("sourceEgressAuthorized");
    expect(JSON.stringify(installed.pending)).not.toContain("enable a canonical repository");
    expect(JSON.stringify(installed.pending)).toContain("file settings");
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
    expect(uninstallPreview).toMatchObject({ status: "preview", remaining: expect.arrayContaining(["old grant files", "credentials"]) });
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
    for (const replacement of ["hooks = false"] as const) {
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
      version: 1,
      operation: "install",
      status: "partial",
      error: {
        code: "recovery_conflict",
        message: expect.stringContaining("preexisting Codex hooks feature changed"),
      },
      recovery: { proposalDigest: digest, completedFiles: 1, totalFiles: 2 },
      completed: ["append the owned PostToolUse adapter hook"],
      pending: [expect.stringContaining("preserve the current files")],
    });
    expect(readFileSync(configPath, "utf8")).toBe(modified);
    expect(existsSync(join(home, ".realtime-review-tool", "journal-v1.json"))).toBe(true);
  });

  it("previews and applies an explicit local-package update while preserving reusable state", () => {
    const { root, home, bin } = fixture();
    const firstEntrypoint = localPackage(root, "1.0.0");
    const secondEntrypoint = localPackage(root, "1.1.0");
    const independentLog = join(root, "independent.log");
    const versionLog = join(root, "versions.log");
    const independentEntrypoint = join(root, "independent.mjs");
    writeFileSync(independentEntrypoint, "import { appendFileSync } from 'node:fs';\nappendFileSync(process.env.REVIEW_INDEPENDENT_LOG, 'observed\\n');\n");
    const independent = {
      matcher: "^Bash$",
      hooks: [{ type: "command", command: `${shellQuote(process.execPath)} ${shellQuote(independentEntrypoint)}`, timeout: 5 }],
    };
    writeFileSync(join(home, "config.toml"), "# user setting\nmodel = 'gpt-6'\n");
    writeFileSync(join(home, "hooks.json"), `${JSON.stringify({ hooks: { PostToolUse: [independent] } }, null, 2)}\n`);
    writeFileSync(join(home, "grant.json"), "repository-grant\n");
    writeFileSync(join(home, "credential-reference"), "native-store-reference\n");
    const firstEnvironment = { ...process.env, REVIEW_INSTALL_ENTRYPOINT: firstEntrypoint };
    previewAndInstall(home, bin, firstEnvironment);
    const beforeConfig = readFileSync(join(home, "config.toml"), "utf8");

    const targetEnvironment = { ...process.env, REVIEW_INSTALL_ENTRYPOINT: secondEntrypoint };
    const preview = invoke({ operation: "update-preview", codexHome: home, codexExecutable: bin }, targetEnvironment);
    expect(preview).toMatchObject({
      version: 1,
      operation: "update-preview",
      status: "preview",
      automaticUpdate: false,
      proposal: {
        current: { packageVersion: "1.0.0", entrypoint: firstEntrypoint, residentProtocol: 1 },
        target: { packageVersion: "1.1.0", entrypoint: secondEntrypoint, residentProtocol: 1 },
        changes: [
          { file: join(home, ".realtime-review-tool", "installation-v1.json"), description: "record the target packaged runtime" },
          { file: join(home, "hooks.json"), description: "replace only the owned PostToolUse adapter hook" },
        ],
      },
      trust: { modified: false, status: "renewal-required" },
      restart: { required: true, processesStopped: false },
      preserved: expect.arrayContaining(["old grant files", "credentials", "independent hooks", "in-flight work"]),
    });
    expect(readFileSync(join(home, "hooks.json"), "utf8")).toContain("review-tool-1.0.0/dist/cli.js");

    const digest = (preview.proposal as { digest: string }).digest;
    const updated = invoke({ operation: "update", codexHome: home, codexExecutable: bin, proposalDigest: digest }, targetEnvironment);
    expect(updated).toMatchObject({
      operation: "update",
      status: "updated",
      trust: { modified: false, status: "renewal-required", bypassUsed: false },
      restart: { required: true, processesStopped: false },
    });
    const hooks = JSON.parse(readFileSync(join(home, "hooks.json"), "utf8")) as {
      hooks: { PreToolUse: Array<{ matcher: string; hooks: Array<{ command: string }> }>;
        PostToolUse: Array<{ matcher: string; hooks: Array<{ command: string }> }> };
    };
    expect(hooks.hooks.PostToolUse[0]).toEqual(independent);
    expect(hooks.hooks.PostToolUse[1]?.hooks[0]?.command).toContain("review-tool-1.1.0/dist/cli.js");
    expect(hooks.hooks.PostToolUse[1]?.hooks[1]?.command).toContain("--composed-background-hook");
    expect(JSON.stringify(hooks.hooks.PreToolUse)).toContain("exec ");
    expect(JSON.stringify(hooks.hooks.PreToolUse)).toContain("--composed-before-edit-hook");
    expect(JSON.stringify(hooks.hooks)).toContain("--composed-stop-hook");
    expect(JSON.stringify(hooks.hooks)).toContain("--composed-prompt-hook");
    expect(JSON.stringify(hooks.hooks)).toContain("SubagentStop");
    expect(readFileSync(join(home, "config.toml"), "utf8")).toBe(beforeConfig);
    expect(readFileSync(join(home, "grant.json"), "utf8")).toBe("repository-grant\n");
    expect(readFileSync(join(home, "credential-reference"), "utf8")).toBe("native-store-reference\n");
    for (const group of hooks.hooks.PostToolUse) {
      for (const handler of group.hooks) {
        const run = spawnSync(handler.command, {
          shell: true,
          input: "{}",
          encoding: "utf8",
          env: { ...process.env, REVIEW_VERSION_LOG: versionLog, REVIEW_INDEPENDENT_LOG: independentLog },
        });
        expect(run.status).toBe(0);
      }
    }
    expect(readFileSync(versionLog, "utf8")).toBe("1.1.0\n1.1.0\n");
    expect(readFileSync(independentLog, "utf8")).toBe("observed\n");

    const repeatPreview = invoke({ operation: "update-preview", codexHome: home, codexExecutable: bin }, targetEnvironment);
    expect(repeatPreview).toMatchObject({ status: "preview", alreadyCurrent: true, restart: { required: false } });
    expect(invoke({
      operation: "update",
      codexHome: home,
      codexExecutable: bin,
      proposalDigest: (repeatPreview.proposal as { digest: string }).digest,
    }, targetEnvironment)).toMatchObject({ status: "already-current" });

    const uninstallPreview = invoke({ operation: "uninstall", codexHome: home });
    expect(invoke({
      operation: "uninstall",
      codexHome: home,
      proposalDigest: (uninstallPreview.proposal as { digest: string }).digest,
    })).toMatchObject({ status: "uninstalled" });
    expect(JSON.parse(readFileSync(join(home, "hooks.json"), "utf8"))).toEqual({ hooks: { PostToolUse: [independent] } });
  });

  it("retains the previous working hook on partial update and resumes with an exact recovery request", () => {
    const { root, home, bin } = fixture();
    const firstEntrypoint = localPackage(root, "1.0.0");
    const secondEntrypoint = localPackage(root, "1.1.0");
    previewAndInstall(home, bin, { ...process.env, REVIEW_INSTALL_ENTRYPOINT: firstEntrypoint });
    const targetEnvironment = { ...process.env, REVIEW_INSTALL_ENTRYPOINT: secondEntrypoint };
    const preview = invoke({ operation: "update-preview", codexHome: home, codexExecutable: bin }, targetEnvironment);
    const digest = (preview.proposal as { digest: string }).digest;
    const partial = invoke(
      { operation: "update", codexHome: home, codexExecutable: bin, proposalDigest: digest },
      { ...targetEnvironment, REVIEW_INSTALL_FAIL_AFTER_WRITES: "1" },
    );
    expect(partial).toMatchObject({
      status: "partial",
      recovery: {
        proposalDigest: digest,
        completedFiles: 1,
        totalFiles: 2,
        command: {
          executable: "hapsland",
          arguments: ["--update"],
          request: { version: 1, operation: "update", codexHome: home, proposalDigest: digest },
        },
      },
      completed: ["record the target packaged runtime"],
    });
    expect(readFileSync(join(home, "hooks.json"), "utf8")).toContain("review-tool-1.0.0/dist/cli.js");
    expect(readFileSync(join(home, "hooks.json"), "utf8")).not.toContain("review-tool-1.1.0/dist/cli.js");

    const resumed = invoke(
      { operation: "update", codexHome: home, codexExecutable: bin, proposalDigest: digest },
      targetEnvironment,
    );
    expect(resumed).toMatchObject({ status: "updated", resumed: true });
    expect(readFileSync(join(home, "hooks.json"), "utf8")).toContain("review-tool-1.1.0/dist/cli.js");
  });

  it("preserves a concurrent independent-hook edit during update recovery", () => {
    const { root, home, bin } = fixture();
    const firstEntrypoint = localPackage(root, "1.0.0");
    const secondEntrypoint = localPackage(root, "1.1.0");
    previewAndInstall(home, bin, { ...process.env, REVIEW_INSTALL_ENTRYPOINT: firstEntrypoint });
    const targetEnvironment = { ...process.env, REVIEW_INSTALL_ENTRYPOINT: secondEntrypoint };
    const preview = invoke({ operation: "update-preview", codexHome: home, codexExecutable: bin }, targetEnvironment);
    const digest = (preview.proposal as { digest: string }).digest;
    expect(invoke(
      { operation: "update", codexHome: home, codexExecutable: bin, proposalDigest: digest },
      { ...targetEnvironment, REVIEW_INSTALL_FAIL_AFTER_WRITES: "1" },
    ).status).toBe("partial");
    const hooksPath = join(home, "hooks.json");
    const concurrent = JSON.parse(readFileSync(hooksPath, "utf8")) as { hooks: { PostToolUse: Array<unknown> } };
    concurrent.hooks.PostToolUse.unshift({ matcher: "^Read$", hooks: [{ type: "command", command: "new-user-hook" }] });
    const concurrentContent = `${JSON.stringify(concurrent, null, 2)}\n`;
    writeFileSync(hooksPath, concurrentContent);

    const recovery = invoke(
      { operation: "update", codexHome: home, codexExecutable: bin, proposalDigest: digest },
      targetEnvironment,
    );
    expect(recovery).toMatchObject({
      status: "partial",
      error: { code: "recovery_conflict", message: expect.stringContaining("concurrent change detected") },
    });
    expect(readFileSync(hooksPath, "utf8")).toBe(concurrentContent);
  });

  it("rejects missing or malformed target package metadata before update mutation", () => {
    for (const corruption of ["missing-runtime", "malformed-runtime", "missing-protocol", "missing-version"] as const) {
      const { root, home, bin } = fixture();
      const firstEntrypoint = localPackage(root, `1.0.0-${corruption}`);
      const targetEntrypoint = localPackage(root, `1.1.0-${corruption}`);
      previewAndInstall(home, bin, { ...process.env, REVIEW_INSTALL_ENTRYPOINT: firstEntrypoint });
      const packageRoot = dirname(dirname(targetEntrypoint));
      if (corruption === "missing-runtime") rmSync(join(packageRoot, "package-runtime.json"));
      if (corruption === "malformed-runtime") writeFileSync(join(packageRoot, "package-runtime.json"), "{\n");
      if (corruption === "missing-protocol") {
        writeFileSync(join(packageRoot, "package-runtime.json"), '{"schemaVersion":1}\n');
      }
      if (corruption === "missing-version") writeFileSync(join(packageRoot, "package.json"), '{"type":"module"}\n');
      const beforeHooks = readFileSync(join(home, "hooks.json"), "utf8");
      const beforeOwnership = readFileSync(join(home, ".realtime-review-tool", "installation-v1.json"), "utf8");
      const targetEnvironment = { ...process.env, REVIEW_INSTALL_ENTRYPOINT: targetEntrypoint };

      for (const operation of ["update-preview", "update"] as const) {
        const result = invoke({
          operation,
          codexHome: home,
          codexExecutable: bin,
          ...(operation === "update" ? { proposalDigest: "0".repeat(64) } : {}),
        }, targetEnvironment);
        expect(result).toMatchObject({
          operation,
          status: "conflict",
          error: { code: "target_package_metadata_invalid" },
          completed: [],
        });
      }
      expect(readFileSync(join(home, "hooks.json"), "utf8")).toBe(beforeHooks);
      expect(readFileSync(join(home, ".realtime-review-tool", "installation-v1.json"), "utf8")).toBe(beforeOwnership);
      expect(existsSync(join(home, ".realtime-review-tool", "journal-v1.json"))).toBe(false);
    }
  });

  it("rejects a self-consistent altered journal that would drop an unrelated hook", () => {
    const { root, home, bin } = fixture();
    const firstEntrypoint = localPackage(root, "1.0.0-tamper");
    const targetEntrypoint = localPackage(root, "1.1.0-tamper");
    const independent = { matcher: "^Read$", hooks: [{ type: "command", command: "keep-user-hook" }] };
    writeFileSync(join(home, "hooks.json"), `${JSON.stringify({ hooks: { PostToolUse: [independent] } }, null, 2)}\n`);
    previewAndInstall(home, bin, { ...process.env, REVIEW_INSTALL_ENTRYPOINT: firstEntrypoint });
    const targetEnvironment = { ...process.env, REVIEW_INSTALL_ENTRYPOINT: targetEntrypoint };
    const preview = invoke({ operation: "update-preview", codexHome: home, codexExecutable: bin }, targetEnvironment);
    const originalDigest = (preview.proposal as { digest: string }).digest;
    expect(invoke(
      { operation: "update", codexHome: home, codexExecutable: bin, proposalDigest: originalDigest },
      { ...targetEnvironment, REVIEW_INSTALL_FAIL_AFTER_WRITES: "1" },
    ).status).toBe("partial");
    const hooksPath = join(home, "hooks.json");
    const beforeHooks = readFileSync(hooksPath, "utf8");
    const journalPath = join(home, ".realtime-review-tool", "journal-v1.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as Record<string, unknown>;
    const mutations = journal.mutations as Array<Record<string, unknown>>;
    const hooksMutation = mutations.find((change) => change.path === hooksPath);
    expect(hooksMutation).toBeDefined();
    const altered = JSON.parse(String(hooksMutation?.afterContent)) as { hooks: { PostToolUse: Array<unknown> } };
    altered.hooks.PostToolUse = altered.hooks.PostToolUse.filter((group) => JSON.stringify(group).includes("--review-tool-owned=codex-v1"));
    if (hooksMutation !== undefined) hooksMutation.afterContent = `${JSON.stringify(altered, null, 2)}\n`;
    const alteredDigest = refreshJournalDigests(journal, home);
    writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);

    const result = invoke(
      { operation: "update", codexHome: home, codexExecutable: bin, proposalDigest: alteredDigest },
      targetEnvironment,
    );
    expect(result).toMatchObject({
      status: "partial",
      error: { code: "recovery_conflict", message: expect.stringContaining("preserve the exact unrelated hook state") },
    });
    expect(readFileSync(hooksPath, "utf8")).toBe(beforeHooks);
    expect(readFileSync(hooksPath, "utf8")).toContain("keep-user-hook");
  });

  it("binds recovery to the exact target package version", () => {
    const { root, home, bin } = fixture();
    const firstEntrypoint = localPackage(root, "1.0.0-binding");
    const targetEntrypoint = localPackage(root, "1.1.0-binding");
    previewAndInstall(home, bin, { ...process.env, REVIEW_INSTALL_ENTRYPOINT: firstEntrypoint });
    const targetEnvironment = { ...process.env, REVIEW_INSTALL_ENTRYPOINT: targetEntrypoint };
    const preview = invoke({ operation: "update-preview", codexHome: home, codexExecutable: bin }, targetEnvironment);
    const digest = (preview.proposal as { digest: string }).digest;
    expect(invoke(
      { operation: "update", codexHome: home, codexExecutable: bin, proposalDigest: digest },
      { ...targetEnvironment, REVIEW_INSTALL_FAIL_AFTER_WRITES: "1" },
    ).status).toBe("partial");
    writeFileSync(join(dirname(dirname(targetEntrypoint)), "package.json"), `${JSON.stringify({
      name: "realtime-review-prototype",
      version: "1.1.1-binding",
      type: "module",
    }, null, 2)}\n`);
    const beforeHooks = readFileSync(join(home, "hooks.json"), "utf8");

    const result = invoke(
      { operation: "update", codexHome: home, codexExecutable: bin, proposalDigest: digest },
      targetEnvironment,
    );
    expect(result).toMatchObject({
      status: "partial",
      error: { code: "recovery_conflict", message: expect.stringContaining("exact target package") },
    });
    expect(readFileSync(join(home, "hooks.json"), "utf8")).toBe(beforeHooks);
  });

  it("serializes multiple stale reclaimers, a replacement owner, and a third contender", async () => {
    const { root, home, bin } = fixture();
    const firstEntrypoint = localPackage(root, "1.0.0-killed-lock");
    const targetEntrypoint = localPackage(root, "1.1.0-killed-lock");
    previewAndInstall(home, bin, { ...process.env, REVIEW_INSTALL_ENTRYPOINT: firstEntrypoint });
    const targetEnvironment = { ...process.env, REVIEW_INSTALL_ENTRYPOINT: targetEntrypoint };
    const preview = invoke({ operation: "update-preview", codexHome: home, codexExecutable: bin }, targetEnvironment);
    const digest = (preview.proposal as { digest: string }).digest;
    expect(invoke(
      { operation: "update", codexHome: home, codexExecutable: bin, proposalDigest: digest },
      { ...targetEnvironment, REVIEW_INSTALL_FAIL_AFTER_WRITES: "1" },
    ).status).toBe("partial");
    const operation = { operation: "update", codexHome: home, codexExecutable: bin, proposalDigest: digest };
    const lockPath = join(home, ".realtime-review-tool", "installation.lock");
    const baseline = currentLockGeneration(lockPath)?.number ?? 0n;
    const owner = spawnOperation(operation, { ...targetEnvironment, REVIEW_INSTALL_TEST_HOLD_LOCK_MS: "10000" });
    const deadGeneration = await waitFor(() => {
      const current = currentLockGeneration(lockPath);
      return current !== undefined && current.number > baseline && current.record.pid === owner.child.pid ? current : undefined;
    });
    const liveResult = invoke(
      operation,
      targetEnvironment,
    );
    expect(liveResult).toMatchObject({ status: "conflict", error: { message: expect.stringContaining("1500ms") } });
    owner.child.kill("SIGKILL");
    await owner.closed;
    await new Promise((resolveWait) => setTimeout(resolveWait, 5_100));

    const contenderEnvironment = { ...targetEnvironment, REVIEW_INSTALL_TEST_HOLD_LOCK_MS: "10000" };
    const first = spawnOperation(operation, contenderEnvironment);
    const second = spawnOperation(operation, contenderEnvironment);
    const replacement = await waitFor(() => {
      const current = currentLockGeneration(lockPath);
      return current !== undefined && current.number > deadGeneration.number ? current : undefined;
    });
    expect([first.child.pid, second.child.pid]).toContain(replacement.record.pid);
    expect(existsSync(join(lockPath, "generations", deadGeneration.name))).toBe(true);
    expect(existsSync(deadGeneration.ownerDirectory)).toBe(true);
    expect(existsSync(join(deadGeneration.ownerDirectory, "reclaimed"))).toBe(true);

    const third = invoke(operation, targetEnvironment);
    expect(third).toMatchObject({ status: "conflict", error: { message: expect.stringContaining("1500ms") } });
    expect(currentLockGeneration(lockPath)?.record.pid).toBe(replacement.record.pid);

    const replacementProcess = first.child.pid === replacement.record.pid ? first : second;
    const losingProcess = replacementProcess === first ? second : first;
    await losingProcess.closed;
    replacementProcess.child.kill("SIGKILL");
    await replacementProcess.closed;
    await new Promise((resolveWait) => setTimeout(resolveWait, 5_100));

    const resumed = invoke(operation, targetEnvironment);
    expect(resumed).toMatchObject({ status: "updated", resumed: true });
    expect(existsSync(lockPath)).toBe(true);
    expect(existsSync(join(home, ".realtime-review-tool", "journal-v1.json"))).toBe(false);
  }, 30_000);

  it("bounds lock acquisition and reports no mutation", () => {
    const { home, bin } = fixture();
    const preview = invoke({ operation: "install-preview", codexHome: home, codexExecutable: bin });
    const lockPath = join(home, ".realtime-review-tool", "installation.lock");
    const owner = randomUUID();
    const ownerDirectory = join(lockPath, "owners", owner);
    mkdirSync(ownerDirectory, { recursive: true });
    mkdirSync(join(lockPath, "generations"), { recursive: true });
    writeFileSync(join(ownerDirectory, "record.json"), `${JSON.stringify({
      version: 1,
      pid: process.pid,
      createdAt: new Date(Date.now() - 10_000).toISOString(),
      owner,
    })}\n`);
    symlinkSync(`../owners/${owner}`, join(lockPath, "generations", "0000000000000001"));
    const result = invoke({
      operation: "install",
      codexHome: home,
      codexExecutable: bin,
      proposalDigest: (preview.proposal as { digest: string }).digest,
    });
    expect(result).toMatchObject({ status: "conflict", error: { message: expect.stringContaining("1500ms") } });
    expect(existsSync(join(home, "hooks.json"))).toBe(false);
  });

  it("compacts high generation history and stale orphans while retaining a live contender", () => {
    const { home, bin } = fixture();
    const preview = invoke({ operation: "install-preview", codexHome: home, codexExecutable: bin });
    const lockPath = join(home, ".realtime-review-tool", "installation.lock");
    const ownersPath = join(lockPath, "owners");
    const generationsPath = join(lockPath, "generations");
    mkdirSync(ownersPath, { recursive: true });
    mkdirSync(generationsPath, { recursive: true });
    const writeOwner = (owner: string, released: boolean) => {
      const ownerDirectory = join(ownersPath, owner);
      mkdirSync(ownerDirectory);
      writeFileSync(join(ownerDirectory, "record.json"), `${JSON.stringify({
        version: 1,
        pid: process.pid,
        createdAt: new Date(Date.now() - 10_000).toISOString(),
        owner,
      })}\n`);
      if (released) writeFileSync(join(ownerDirectory, "released"), "\n");
      return ownerDirectory;
    };
    const base = 9_000_000_000_000_000n;
    for (let index = 0; index < 12; index += 1) {
      const owner = randomUUID();
      writeOwner(owner, true);
      symlinkSync(`../owners/${owner}`, join(generationsPath, String(base + BigInt(index)).padStart(16, "0")));
    }
    const releasedOrphan = writeOwner(randomUUID(), true);
    const liveOrphan = writeOwner(randomUUID(), false);

    const installed = invoke({
      operation: "install",
      codexHome: home,
      codexExecutable: bin,
      proposalDigest: (preview.proposal as { digest: string }).digest,
    });
    expect(installed.status).toBe("installed");
    expect(readdirSync(generationsPath).filter((name) => /^\d{16}$/.test(name))).toHaveLength(8);
    expect(readdirSync(ownersPath)).toHaveLength(9);
    expect(existsSync(releasedOrphan)).toBe(false);
    expect(existsSync(liveOrphan)).toBe(true);
    expect(currentLockGeneration(lockPath)?.number).toBe(base + 12n);
  });
});

describe("Codex update and explicit reinstall journeys", { timeout: 30_000 }, () => {
  it.each(["PostToolUse", "PreToolUse", "Stop", "SubagentStop", "UserPromptSubmit", "foreground", "background", "feature"])("updates deleted Codex %s without losing settings", (missing) => {
    const { root, home, bin } = fixture();
    const entrypoint = localPackage(root, "0.1.0");
    const environment = { ...process.env, REVIEW_INSTALL_RUNTIME: process.execPath, REVIEW_INSTALL_ENTRYPOINT: entrypoint };
    const request = { codexHome: home, codexExecutable: bin };
    writeFileSync(join(home, "config.toml"), 'model = "user-model"\n');
    const preview = invoke({ ...request, operation: "install-preview" }, environment);
    invoke({ ...request, operation: "install", proposalDigest: (preview.proposal as { digest: string }).digest }, environment);
    const hooks = JSON.parse(readFileSync(join(home, "hooks.json"), "utf8"));
    if (missing === "foreground" || missing === "background") hooks.hooks.PostToolUse[0].hooks.splice(missing === "foreground" ? 0 : 1, 1);
    else if (missing === "feature") writeFileSync(join(home, "config.toml"), 'model = "user-model"\n');
    else delete hooks.hooks[missing];
    writeFileSync(join(home, "hooks.json"), JSON.stringify(hooks));
    const diagnosis = invoke({ ...request, operation: "doctor", cwd: root }, environment);
    expect(diagnosis.checks).toEqual(expect.arrayContaining([expect.objectContaining({ stage: "configuration-ownership", status: "conflict" })]));
    const update = invoke({ ...request, operation: "update-preview" }, environment);
    expect(update.status).toBe("preview");
    invoke({ ...request, operation: "update", proposalDigest: (update.proposal as { digest: string }).digest }, environment);
    expect(readFileSync(join(home, "config.toml"), "utf8")).toContain('model = "user-model"');
    const repeated = invoke({ ...request, operation: "update-preview" }, environment);
    expect(repeated).toMatchObject({ alreadyCurrent: true, proposal: { changes: [] } });
  });

  it("explicit Codex reinstall preserves independent handlers and resumes an interrupted replacement", () => {
    const { root, home, bin } = fixture();
    const entrypoint = localPackage(root, "0.1.0");
    const environment = { ...process.env, REVIEW_INSTALL_RUNTIME: process.execPath, REVIEW_INSTALL_ENTRYPOINT: entrypoint };
    const request = { codexHome: home, codexExecutable: bin };
    const preview = invoke({ ...request, operation: "install-preview" }, environment);
    invoke({ ...request, operation: "install", proposalDigest: (preview.proposal as { digest: string }).digest }, environment);
    const hooks = JSON.parse(readFileSync(join(home, "hooks.json"), "utf8"));
    hooks.hooks.PostToolUse[0].hooks[0].timeout = 99;
    hooks.hooks.PostToolUse[0].hooks.push({ type: "command", command: "independent-handler" });
    hooks.hooks.Stop.push(structuredClone(hooks.hooks.Stop[0]));
    writeFileSync(join(home, "hooks.json"), JSON.stringify(hooks));
    const reinstall = { ...request, reinstall: true };
    const proposal = invoke({ ...reinstall, operation: "install-preview" }, environment);
    const digest = (proposal.proposal as { digest: string }).digest;
    const interrupted = invoke({ ...reinstall, operation: "install", proposalDigest: digest }, { ...environment, REVIEW_INSTALL_FAIL_AFTER_WRITES: "1" });
    expect(interrupted.status).toBe("partial");
    expect(invoke({ ...reinstall, operation: "install", proposalDigest: digest }, environment).status).toBe("installed");
    expect(readFileSync(join(home, "hooks.json"), "utf8")).toContain("independent-handler");
    expect(invoke({ ...request, operation: "install-preview" }, environment)).toMatchObject({ installed: true });
  });

  it("reinstall replaces a damaged journal only after approval, backs it up, and preserves current user edits", () => {
    const { root, home, bin } = fixture();
    const entrypoint = localPackage(root, "0.1.0");
    const environment = { ...process.env, REVIEW_INSTALL_RUNTIME: process.execPath, REVIEW_INSTALL_ENTRYPOINT: entrypoint };
    const request = { codexHome: home, codexExecutable: bin };
    const preview = invoke({ ...request, operation: "install-preview" }, environment);
    invoke({ ...request, operation: "install", proposalDigest: (preview.proposal as { digest: string }).digest }, environment);
    const journalDirectory = join(home, ".realtime-review-tool");
    const journal = join(journalDirectory, "journal-v1.json");
    writeFileSync(journal, "damaged interrupted journal");
    const hooksPath = join(home, "hooks.json");
    const hooks = JSON.parse(readFileSync(hooksPath, "utf8")); hooks.currentUserEdit = true;
    writeFileSync(hooksPath, JSON.stringify(hooks));
    const reinstall = { ...request, reinstall: true };
    const proposal = invoke({ ...reinstall, operation: "install-preview" }, environment);
    expect(proposal.status).toBe("preview");
    expect(readFileSync(journal, "utf8")).toBe("damaged interrupted journal");
    const applied = invoke({ ...reinstall, operation: "install", proposalDigest: (proposal.proposal as { digest: string }).digest }, environment);
    expect(applied.status).toBe("installed");
    expect(existsSync(journal)).toBe(false);
    const backup = readdirSync(journalDirectory).find(name => name.includes("reinstall-backup"));
    expect(backup).toBeDefined();
    expect(readFileSync(join(journalDirectory, backup!), "utf8")).toBe("damaged interrupted journal");
    expect(JSON.parse(readFileSync(hooksPath, "utf8")).currentUserEdit).toBe(true);
  });


  it("resumes reinstall after restoring a deleted preexisting hooks feature and removes only the restored feature", () => {
    const { root, home, bin } = fixture();
    const entrypoint = localPackage(root, "0.1.0");
    const environment = { ...process.env, REVIEW_INSTALL_RUNTIME: process.execPath, REVIEW_INSTALL_ENTRYPOINT: entrypoint };
    const request = { codexHome: home, codexExecutable: bin };
    const configPath = join(home, "config.toml");
    writeFileSync(configPath, 'model = "user-model"\n[features]\nhooks = true\n');
    previewAndInstall(home, bin, environment);
    writeFileSync(configPath, 'model = "user-model"\n');
    const reinstall = { ...request, reinstall: true };
    const preview = invoke({ ...reinstall, operation: "install-preview" }, environment);
    const digest = (preview.proposal as { digest: string }).digest;
    expect(invoke({ ...reinstall, operation: "install", proposalDigest: digest }, {
      ...environment, REVIEW_INSTALL_FAIL_AFTER_WRITES: "1",
    }).status).toBe("partial");
    expect(invoke({ ...reinstall, operation: "install", proposalDigest: digest }, environment).status).toBe("installed");
    expect(readFileSync(configPath, "utf8")).toContain("hooks = true");
    const removal = invoke({ ...request, operation: "uninstall" }, environment);
    expect(invoke({ ...request, operation: "uninstall", proposalDigest: (removal.proposal as { digest: string }).digest }, environment).status).toBe("uninstalled");
    expect(readFileSync(configPath, "utf8")).toContain('model = "user-model"');
    expect(readFileSync(configPath, "utf8")).not.toContain("hooks = true");
  });
});
