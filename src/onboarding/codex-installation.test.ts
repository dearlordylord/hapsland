import { createInstallationPackageFixture, installationPackageDeclaration } from "../test-support/installation-package.ts";
import { ConfigProvider, Effect, Schema } from "effect";
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
import { spawn } from "node:child_process";
import { spawnSync } from "../../scripts/test-harness/process.mjs";
import { afterEach, describe, expect, it } from "vitest";
import { inspectCodexInstallation, installCodexIntegration, previewCodexInstallation, previewCodexUpdate, uninstallCodexIntegration, updateCodexIntegration } from "./codex-installation.ts";

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
  writeFileSync(bin, "#!/bin/sh\nif [ \"$1\" = features ]; then printf 'hooks stable true\\n'; exit 0; fi\nprintf 'codex-cli 0.155.1\\n'\n", { mode: 0o700 });
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
    codex: { testedVersions: ["0.155.1", "0.156.0"] },
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

const invokeCli = (
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

// Installation semantics run in-process; CLI framing remains covered by cli.test.ts
// and the runtime-profile canaries below. Contention still uses independent processes.
const invoke = async (operation: Record<string, unknown>, env: NodeJS.ProcessEnv = process.env) => {
  if (operation.operation === "doctor") return invokeCli(operation, env);
  const environment = env.REVIEW_INSTALL_ENTRYPOINT !== undefined || typeof operation.codexHome !== "string"
    ? env : { ...env, REVIEW_INSTALL_ENTRYPOINT: createInstallationPackageFixture(dirname(operation.codexHome)) };
  const request = operation as import("./codex-installation.ts").InstallationRequest;
  const operations = {
    "install-preview": previewCodexInstallation, install: installCodexIntegration,
    "update-preview": previewCodexUpdate, update: updateCodexIntegration, uninstall: uninstallCodexIntegration,
  };
  const operationName = operation.operation as keyof typeof operations;
  return await Effect.runPromise(operations[operationName](request).pipe(
    Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(environment, { preserveEmptyStrings: true }))),
  )) as unknown as Record<string, unknown>;
};

const previewAndInstall = async (home: string, bin: string, env: NodeJS.ProcessEnv = process.env) => {
  const preview = (await invoke({ operation: "install-preview", codexHome: home, codexExecutable: bin }, env));
  expect(preview.status).toBe("preview");
  const digest = (preview.proposal as { digest: string }).digest;
  const installed = (await invoke({ operation: "install", codexHome: home, codexExecutable: bin, proposalDigest: digest }, env));
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

describe("public Codex installation operations", async () => {
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

  it("rejects Linux x64 against the production arm64 declaration before mutation", async () => {
    const test = fixture();
    const runtime = join(test.root, "synthetic-x64-runtime");
    writeFileSync(runtime, `#!/bin/sh\nprintf '%s' '${JSON.stringify({ version: "v24.20.0", platform: "linux", architecture: "x64" })}'\n`, { mode: 0o700 });
    const result = (await invokeCli({ operation: "install-preview", codexHome: test.home, codexExecutable: test.bin }, {
      ...process.env, REVIEW_INSTALL_RUNTIME: runtime, REVIEW_INSTALL_ENTRYPOINT: join(process.cwd(), "src/cli.ts"),
    }));
    expect(result).toMatchObject({ status: "unsupported", host: { compatibility: { runtime: { supported: false, checks: {
      engine: { ready: true, required: "v24.20.0" }, platform: { ready: false, observed: "linux" }, architecture: { ready: false, observed: "x64", required: "arm64" },
    } } } } });
    expect(readdirSync(test.home)).toEqual([]);
  });

  it("accepts source Node against matching profiles even when package distribution declares Bun", async () => {
    const test = fixture();
    const entrypoint = createInstallationPackageFixture(test.root);
    const declaration = { ...installationPackageDeclaration(), runtime: { name: "bun", version: "1.3.14" }, profiles: [{ operatingSystem: "linux", architecture: "x64" }] };
    writeFileSync(join(dirname(dirname(entrypoint)), "package-runtime.json"), JSON.stringify(declaration));
    const runtime = join(test.root, "synthetic-x64-runtime");
    writeFileSync(runtime, `#!/bin/sh\nprintf '%s' '${JSON.stringify({ version: process.version, platform: "linux", architecture: "x64" })}'\n`, { mode: 0o700 });
    const result = (await invokeCli({ operation: "install-preview", codexHome: test.home, codexExecutable: test.bin }, {
      ...process.env, REVIEW_INSTALL_RUNTIME: runtime, REVIEW_INSTALL_ENTRYPOINT: entrypoint,
    }));
    expect(result).toMatchObject({ status: "preview", host: { compatibility: { runtime: { supported: true, checks: {
      engine: { ready: true, observed: "v24.20.0", required: "v24.20.0" }, platform: { ready: true, observed: "linux" }, architecture: { ready: true, observed: "x64" },
    } } } } });
    expect(readdirSync(test.home)).toEqual([]);
  });

  it("inspects the pinned hook runtime when the caller uses another Node path", async () => {
    const test = fixture();
    (await previewAndInstall(test.home, test.bin));
    const previousRuntime = process.env.REVIEW_INSTALL_RUNTIME;
    const previousEntrypoint = process.env.REVIEW_INSTALL_ENTRYPOINT;
    try {
      process.env.REVIEW_INSTALL_RUNTIME = "/bin/true";
      // Keep the selected fixture package metadata constant; vary only the caller runtime.
      process.env.REVIEW_INSTALL_ENTRYPOINT = createInstallationPackageFixture(test.root);
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
  it.each(["0.156.0", "0.160.0", "0.161.0"])("accepts Codex %s and binds its version into the owned hook", async (hostVersion) => {
    const { root, home, bin } = fixture();
    writeFileSync(bin, `#!/bin/sh\nif [ \"$1\" = features ]; then printf 'hooks stable true\\n'; exit 0; fi\nprintf 'codex-cli ${hostVersion}\\n'\n`, { mode: 0o700 });
    const entrypoint = localPackage(root, "0.0.0");
    const environment = { ...process.env, REVIEW_INSTALL_ENTRYPOINT: entrypoint };
    const preview = (await invoke({ operation: "install-preview", codexHome: home, codexExecutable: bin }, environment));
    expect(preview.status).toBe("preview");
    const proposal = preview.proposal as { digest: string; ownedChanges: { hook: { handlers: Array<{ command: string }> } } };
    expect(proposal.ownedChanges.hook.handlers[0]?.command).toContain(`--codex-version=${hostVersion}`);
    expect((await invoke({ operation: "install", codexHome: home, codexExecutable: bin, proposalDigest: proposal.digest }, environment)).status).toBe("installed");
    expect(readFileSync(join(home, "hooks.json"), "utf8")).toContain(`--codex-version=${hostVersion}`);
  });
  it("refuses a version-only executable without the lifecycle hooks capability", async () => {
    const { root, home, bin } = fixture();
    writeFileSync(bin, "#!/bin/sh\nprintf 'codex-cli 0.160.0\\n'\n", { mode: 0o700 });
    const entrypoint = localPackage(root, "0.0.0");
    const preview = await invoke({ operation: "install-preview", codexHome: home, codexExecutable: bin },
      { ...process.env, REVIEW_INSTALL_ENTRYPOINT: entrypoint });
    expect(preview.status).toBe("unsupported");
    expect(preview.host).toMatchObject({ compatibility: { codex: { hooksAvailable: false } } });
    expect(existsSync(join(home, "hooks.json"))).toBe(false);
  });
  it.each(["Stop", "SubagentStop"] as const)("rejects a locally modified owned %s hook", async (event) => {
    const { home, bin } = fixture();
    (await previewAndInstall(home, bin));
    const path = join(home, "hooks.json");
    const settings = JSON.parse(readFileSync(path, "utf8")) as { hooks: Record<typeof event, Array<{ hooks: Array<{ timeout: number }> }>> };
    settings.hooks[event][0]!.hooks[0]!.timeout = 3;
    writeFileSync(path, JSON.stringify(settings));
    expect((await runInstallation(uninstallCodexIntegration({ codexHome: home, codexExecutable: bin }))).status).toBe("conflict");
  });
  it("updates an older owned installation to add SubagentStop", async () => {
    const { root, home, bin } = fixture();
    const environment = { ...process.env, REVIEW_INSTALL_ENTRYPOINT: localPackage(root, "1.0.0") };
    (await previewAndInstall(home, bin, environment));
    const hooksPath = join(home, "hooks.json");
    const previous = JSON.parse(readFileSync(hooksPath, "utf8")) as { hooks: Record<string, unknown> };
    delete previous.hooks.SubagentStop;
    writeFileSync(hooksPath, JSON.stringify(previous));
    const recordPath = join(home, ".hapsland", "installation-v1.json");
    const record = JSON.parse(readFileSync(recordPath, "utf8")) as { composedFingerprints: { subagentStop?: string } };
    delete record.composedFingerprints.subagentStop;
    writeFileSync(recordPath, JSON.stringify(record));
    const request = { codexHome: home, codexExecutable: bin };
    const preview = (await invoke({ ...request, operation: "update-preview" }, environment));
    expect(preview.status).toBe("preview");
    const proposalDigest = (preview.proposal as { digest: string }).digest;
    expect((await invoke({ ...request, operation: "update", proposalDigest }, environment)).status).toBe("updated");
    expect(readFileSync(hooksPath, "utf8")).toContain("SubagentStop");
  });

  it("previews exact changes, quotes paths, installs idempotently, and preserves unrelated configuration", async () => {
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

    const preview = (await invoke({ operation: "install-preview", codexHome: home, codexExecutable: bin }, installEnvironment));
    expect(preview).toMatchObject({ version: 1, status: "preview" });
    expect(preview).not.toHaveProperty("sourceEgressAuthorized");
    expect(JSON.stringify(preview.pending)).not.toContain("enable each repository");
    expect(JSON.stringify(preview.pending)).toContain("file includes/excludes");
    expect(preview.proposal).toMatchObject({
      ownedChanges: {
        runtime: {
          executable: process.execPath,
          args: [quotedEntrypoint],
          parser: { executable: process.execPath, args: [join(dirname(quotedEntrypoint), "parser-main.js")] },
          resident: { executable: process.execPath, args: [join(dirname(quotedEntrypoint), "resident", "main.js")] },
          observed: { version: process.version, platform: process.platform, architecture: process.arch },
        },
        feature: { file: join(home, "config.toml"), table: "features", key: "hooks", value: true },
        hook: {
          file: join(home, "hooks.json"),
          event: "PostToolUse",
          matcher: "^(apply_patch|Edit|Write|Bash)$",
          handlers: [{ type: "command", timeout: 10 }, { type: "command", timeout: 25, async: true }],
        },
        ownership: { file: join(home, ".hapsland", "installation-v1.json"), version: 1, adapter: "codex" },
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
    expect(existsSync(join(home, ".hapsland", "installation-v1.json"))).toBe(false);

    const digest = (preview.proposal as { digest: string }).digest;
    const installed = (await invoke({ operation: "install", codexHome: home, codexExecutable: bin, proposalDigest: digest }, installEnvironment));
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

    const repeatPreview = (await invoke({ operation: "install-preview", codexHome: home, codexExecutable: bin }, installEnvironment));
    expect(repeatPreview).toMatchObject({ status: "preview", installed: true });
    expect((repeatPreview.proposal as { changes: Array<unknown> }).changes).toEqual([]);
    const repeat = (await invoke({
      operation: "install",
      codexHome: home,
      codexExecutable: bin,
      proposalDigest: (repeatPreview.proposal as { digest: string }).digest,
    }, installEnvironment));
    expect(repeat.status).toBe("already-installed");
  });

  it("edits quoted feature tables without matching table text inside multiline strings", async () => {
    const { home, bin } = fixture();
    const original = `message = """
[features]
hooks = false
"""

["features"] # quoted table name
responses_websockets_v2 = true
`;
    writeFileSync(join(home, "config.toml"), original);
    (await previewAndInstall(home, bin));
    const installed = readFileSync(join(home, "config.toml"), "utf8");
    expect(installed).toContain(`message = """
[features]
hooks = false
"""`);
    expect(installed).toContain(`["features"] # quoted table name
hooks = true
responses_websockets_v2 = true`);
    const uninstallPreview = (await invoke({ operation: "uninstall", codexHome: home }));
    (await invoke({
      operation: "uninstall",
      codexHome: home,
      proposalDigest: (uninstallPreview.proposal as { digest: string }).digest,
    }));
    expect(readFileSync(join(home, "config.toml"), "utf8")).toBe(original);
  });

  it("rejects unsupported hosts and malformed, duplicate, or modified owned configuration", async () => {
    const unsupported = fixture();
    writeFileSync(unsupported.bin, "#!/bin/sh\nif [ \"$1\" = features ]; then printf 'hooks stable true\\n'; exit 0; fi\nprintf 'codex-cli invalid\\n'\n", { mode: 0o700 });
    const unsupportedPreview = (await invoke({ operation: "install-preview", codexHome: unsupported.home, codexExecutable: unsupported.bin }));
    expect(unsupportedPreview.status).toBe("unsupported");
    const unsupportedInstall = (await invoke({
      operation: "install",
      codexHome: unsupported.home,
      codexExecutable: unsupported.bin,
      proposalDigest: "0".repeat(64),
    }));
    expect(unsupportedInstall.status).toBe("unsupported");
    expect(existsSync(join(unsupported.home, "hooks.json"))).toBe(false);

    const malformed = fixture();
    writeFileSync(join(malformed.home, "hooks.json"), "{broken");
    expect((await invoke({ operation: "install-preview", codexHome: malformed.home, codexExecutable: malformed.bin }))).toMatchObject({
      status: "conflict",
      error: { code: "configuration_conflict" },
    });
    const malformedToml = fixture();
    writeFileSync(join(malformedToml.home, "config.toml"), "[features\nhooks = true\n");
    expect((await invoke({ operation: "install-preview", codexHome: malformedToml.home, codexExecutable: malformedToml.bin }))).toMatchObject({ status: "conflict" });
    const unreadableShape = fixture();
    mkdirSync(join(unreadableShape.home, "config.toml"));
    expect((await invoke({ operation: "install-preview", codexHome: unreadableShape.home, codexExecutable: unreadableShape.bin }))).toMatchObject({
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
    expect((await invoke({ operation: "install-preview", codexHome: duplicate.home, codexExecutable: duplicate.bin }))).toMatchObject({ status: "conflict" });

    const modified = fixture();
    (await previewAndInstall(modified.home, modified.bin));
    const hooksPath = join(modified.home, "hooks.json");
    const hooksText = readFileSync(hooksPath, "utf8").replace("timeout\": 10", "timeout\": 9");
    writeFileSync(hooksPath, hooksText);
    expect((await invoke({ operation: "install-preview", codexHome: modified.home, codexExecutable: modified.bin }))).toMatchObject({
      status: "conflict",
      error: { message: expect.stringContaining("locally modified") },
    });
  });

  it("exposes partial completion and resumes the journal without stale overwrite", async () => {
    const { home, bin } = fixture();
    writeFileSync(join(home, "config.toml"), "model = 'gpt-6'\n");
    const preview = (await invoke({ operation: "install-preview", codexHome: home, codexExecutable: bin }));
    const digest = (preview.proposal as { digest: string }).digest;
    const partial = (await invoke(
      { operation: "install", codexHome: home, codexExecutable: bin, proposalDigest: digest },
      { ...process.env, REVIEW_INSTALL_FAIL_AFTER_WRITES: "1" },
    ));
    expect(partial).toMatchObject({ status: "partial", recovery: { proposalDigest: digest, completedFiles: 1 } });
    expect(existsSync(join(home, ".hapsland", "journal-v1.json"))).toBe(true);

    const resumed = (await invoke({ operation: "install", codexHome: home, codexExecutable: bin, proposalDigest: digest }));
    expect(resumed).toMatchObject({ status: "installed", resumed: true });
    expect(existsSync(join(home, ".hapsland", "journal-v1.json"))).toBe(false);

    const concurrent = fixture();
    const concurrentPreview = (await invoke({ operation: "install-preview", codexHome: concurrent.home, codexExecutable: concurrent.bin }));
    const concurrentDigest = (concurrentPreview.proposal as { digest: string }).digest;
    expect((await invoke(
      { operation: "install", codexHome: concurrent.home, codexExecutable: concurrent.bin, proposalDigest: concurrentDigest },
      { ...process.env, REVIEW_INSTALL_FAIL_AFTER_WRITES: "1" },
    )).status).toBe("partial");
    const unrelatedHooks = `${JSON.stringify({ hooks: { SessionStart: [{ matcher: "*", hooks: [] }] } }, null, 2)}\n`;
    writeFileSync(join(concurrent.home, "hooks.json"), unrelatedHooks);
    const conflicted = (await invoke({ operation: "install", codexHome: concurrent.home, codexExecutable: concurrent.bin, proposalDigest: concurrentDigest }));
    expect(conflicted).toMatchObject({
      status: "partial",
      error: {
        code: "recovery_conflict",
        message: expect.stringContaining("no stale content was restored"),
      },
    });
    expect(readFileSync(join(concurrent.home, "hooks.json"), "utf8")).toBe(unrelatedHooks);

    const completedChange = fixture();
    const completedPreview = (await invoke({ operation: "install-preview", codexHome: completedChange.home, codexExecutable: completedChange.bin }));
    const completedDigest = (completedPreview.proposal as { digest: string }).digest;
    expect((await invoke(
      { operation: "install", codexHome: completedChange.home, codexExecutable: completedChange.bin, proposalDigest: completedDigest },
      { ...process.env, REVIEW_INSTALL_FAIL_AFTER_WRITES: "1" },
    )).status).toBe("partial");
    const completedConfig = `${readFileSync(join(completedChange.home, "config.toml"), "utf8")}# unrelated later edit\n`;
    writeFileSync(join(completedChange.home, "config.toml"), completedConfig);
    expect((await invoke({
      operation: "install",
      codexHome: completedChange.home,
      codexExecutable: completedChange.bin,
      proposalDigest: completedDigest,
    }))).toMatchObject({
      status: "partial",
      error: { code: "recovery_conflict", message: expect.stringContaining("completed journal step changed") },
    });
    expect(readFileSync(join(completedChange.home, "config.toml"), "utf8")).toBe(completedConfig);
  });

  it("rejects missing runtime or packaged entrypoint before creating installation state", async () => {
    const missingRuntime = fixture();
    const runtimeResult = (await invoke(
      { operation: "install-preview", codexHome: missingRuntime.home, codexExecutable: missingRuntime.bin },
      { ...process.env, REVIEW_INSTALL_RUNTIME: join(missingRuntime.root, "missing-node") },
    ));
    expect(runtimeResult).toMatchObject({
      status: "unsupported",
      host: { compatibility: { runtime: { checks: { runtime: { ready: false, observed: "missing" } } } } },
    });
    expect(existsSync(join(missingRuntime.home, ".hapsland"))).toBe(false);

    const nonRuntime = fixture();
    const trueResult = (await invoke(
      { operation: "install-preview", codexHome: nonRuntime.home, codexExecutable: nonRuntime.bin },
      { ...process.env, REVIEW_INSTALL_RUNTIME: "/bin/true" },
    ));
    expect(trueResult).toMatchObject({
      status: "unsupported",
      host: { compatibility: { runtime: { checks: {
        runtime: { ready: true },
        engine: { ready: false, observed: "not-a-supported-runtime" },
      } } } },
    });
    expect(existsSync(join(nonRuntime.home, ".hapsland"))).toBe(false);

    const missingEntrypoint = fixture();
    const entrypointEnvironment = { ...process.env, REVIEW_INSTALL_ENTRYPOINT: join(missingEntrypoint.root, "missing-cli.js") };
    const preview = (await invoke(
      { operation: "install-preview", codexHome: missingEntrypoint.home, codexExecutable: missingEntrypoint.bin },
      entrypointEnvironment,
    ));
    expect(preview).toMatchObject({
      status: "unsupported",
      host: { compatibility: { runtime: { checks: { entrypoint: { ready: false, observed: "missing" } } } } },
    });
    const install = (await invoke(
      { operation: "install", codexHome: missingEntrypoint.home, codexExecutable: missingEntrypoint.bin, proposalDigest: "0".repeat(64) },
      entrypointEnvironment,
    ));
    expect(install.status).toBe("unsupported");
    expect(existsSync(join(missingEntrypoint.home, ".hapsland"))).toBe(false);
    expect(existsSync(join(missingEntrypoint.home, "hooks.json"))).toBe(false);

    const missingCompanions = fixture();
    const loneEntrypoint = join(missingCompanions.root, "dist", "cli.js");
    mkdirSync(dirname(loneEntrypoint), { recursive: true });
    writeFileSync(loneEntrypoint, "#!/usr/bin/env node\n");
    const companions = (await invoke(
      { operation: "install-preview", codexHome: missingCompanions.home, codexExecutable: missingCompanions.bin },
      { ...process.env, REVIEW_INSTALL_ENTRYPOINT: loneEntrypoint },
    ));
    expect(companions).toMatchObject({
      status: "unsupported",
      host: { compatibility: { runtime: { checks: {
        entrypoint: { ready: true },
        parser: { ready: false, observed: "missing" },
        resident: { ready: false, observed: "missing" },
      } } } },
    });
  });

  it("uninstalls only owned state and preserves hooks, rules, grants, and preexisting feature settings", async () => {
    const { home, bin } = fixture();
    const config = "[features]\nhooks = true\n\n[review]\nrules = ['user-rule']\n";
    const independent = { matcher: "^Bash$", hooks: [{ type: "command", command: "independent-hook", timeout: 5 }] };
    writeFileSync(join(home, "config.toml"), config);
    writeFileSync(join(home, "hooks.json"), `${JSON.stringify({ hooks: { PostToolUse: [independent] } }, null, 2)}\n`);
    writeFileSync(join(home, "grant.json"), "repository-grant\n");
    (await previewAndInstall(home, bin));

    const uninstallPreview = (await invoke({ operation: "uninstall", codexHome: home }));
    expect(uninstallPreview).toMatchObject({ status: "preview", remaining: expect.arrayContaining(["old grant files", "credentials"]) });
    const uninstalled = (await invoke({
      operation: "uninstall",
      codexHome: home,
      proposalDigest: (uninstallPreview.proposal as { digest: string }).digest,
    }));
    expect(uninstalled.status).toBe("uninstalled");
    expect(readFileSync(join(home, "config.toml"), "utf8")).toBe(config);
    expect(JSON.parse(readFileSync(join(home, "hooks.json"), "utf8"))).toEqual({ hooks: { PostToolUse: [independent] } });
    expect(readFileSync(join(home, "grant.json"), "utf8")).toBe("repository-grant\n");
    expect(existsSync(join(home, ".hapsland", "installation-v1.json"))).toBe(false);
  });

  it("conflicts and preserves a locally modified owned feature value", async () => {
    for (const replacement of ["hooks = false"] as const) {
      const { home, bin } = fixture();
      (await previewAndInstall(home, bin));
      const configPath = join(home, "config.toml");
      const modified = readFileSync(configPath, "utf8").replace("hooks = true", replacement);
      writeFileSync(configPath, modified);
      const result = (await invoke({ operation: "uninstall", codexHome: home }));
      expect(result).toMatchObject({
        status: "conflict",
        error: { message: expect.stringContaining("feature value was locally modified") },
      });
      expect(readFileSync(configPath, "utf8")).toBe(modified);
      expect(readFileSync(join(home, "hooks.json"), "utf8")).toContain("--review-tool-owned=codex-v1");
    }
  });

  it("rechecks a preexisting hooks feature before journal recovery", async () => {
    const { home, bin } = fixture();
    const configPath = join(home, "config.toml");
    writeFileSync(configPath, "[features]\nhooks = true\n");
    const preview = (await invoke({ operation: "install-preview", codexHome: home, codexExecutable: bin }));
    const digest = (preview.proposal as { digest: string }).digest;
    expect((await invoke(
      { operation: "install", codexHome: home, codexExecutable: bin, proposalDigest: digest },
      { ...process.env, REVIEW_INSTALL_FAIL_AFTER_WRITES: "1" },
    )).status).toBe("partial");
    const modified = "[features]\nhooks = false\n";
    writeFileSync(configPath, modified);
    const recovery = (await invoke({ operation: "install", codexHome: home, codexExecutable: bin, proposalDigest: digest }));
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
    expect(existsSync(join(home, ".hapsland", "journal-v1.json"))).toBe(true);
  });

  it("previews and applies an explicit local-package update while preserving reusable state", async () => {
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
    (await previewAndInstall(home, bin, firstEnvironment));
    const beforeConfig = readFileSync(join(home, "config.toml"), "utf8");

    const targetEnvironment = { ...process.env, REVIEW_INSTALL_ENTRYPOINT: secondEntrypoint };
    const preview = (await invoke({ operation: "update-preview", codexHome: home, codexExecutable: bin }, targetEnvironment));
    expect(preview).toMatchObject({
      version: 1,
      operation: "update-preview",
      status: "preview",
      automaticUpdate: false,
      proposal: {
        current: { packageVersion: "1.0.0", args: [firstEntrypoint], residentProtocol: 1 },
        target: { packageVersion: "1.1.0", args: [secondEntrypoint], residentProtocol: 1 },
        changes: [
          { file: join(home, ".hapsland", "installation-v1.json"), description: "record the target packaged runtime" },
          { file: join(home, "hooks.json"), description: "replace only the owned PostToolUse adapter hook" },
        ],
      },
      trust: { modified: false, status: "renewal-required" },
      restart: { required: true, processesStopped: false },
      preserved: expect.arrayContaining(["old grant files", "credentials", "independent hooks", "in-flight work"]),
    });
    expect(readFileSync(join(home, "hooks.json"), "utf8")).toContain("review-tool-1.0.0/dist/cli.js");

    const digest = (preview.proposal as { digest: string }).digest;
    const updated = (await invoke({ operation: "update", codexHome: home, codexExecutable: bin, proposalDigest: digest }, targetEnvironment));
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

    const repeatPreview = (await invoke({ operation: "update-preview", codexHome: home, codexExecutable: bin }, targetEnvironment));
    expect(repeatPreview).toMatchObject({ status: "preview", alreadyCurrent: true, restart: { required: false } });
    expect((await invoke({
      operation: "update",
      codexHome: home,
      codexExecutable: bin,
      proposalDigest: (repeatPreview.proposal as { digest: string }).digest,
    }, targetEnvironment))).toMatchObject({ status: "already-current" });

    const uninstallPreview = (await invoke({ operation: "uninstall", codexHome: home }));
    expect((await invoke({
      operation: "uninstall",
      codexHome: home,
      proposalDigest: (uninstallPreview.proposal as { digest: string }).digest,
    }))).toMatchObject({ status: "uninstalled" });
    expect(JSON.parse(readFileSync(join(home, "hooks.json"), "utf8"))).toEqual({ hooks: { PostToolUse: [independent] } });
  });

  it("retains the previous working hook on partial update and resumes with an exact recovery request", async () => {
    const { root, home, bin } = fixture();
    const firstEntrypoint = localPackage(root, "1.0.0");
    const secondEntrypoint = localPackage(root, "1.1.0");
    (await previewAndInstall(home, bin, { ...process.env, REVIEW_INSTALL_ENTRYPOINT: firstEntrypoint }));
    const targetEnvironment = { ...process.env, REVIEW_INSTALL_ENTRYPOINT: secondEntrypoint };
    const preview = (await invoke({ operation: "update-preview", codexHome: home, codexExecutable: bin }, targetEnvironment));
    const digest = (preview.proposal as { digest: string }).digest;
    const partial = (await invoke(
      { operation: "update", codexHome: home, codexExecutable: bin, proposalDigest: digest },
      { ...targetEnvironment, REVIEW_INSTALL_FAIL_AFTER_WRITES: "1" },
    ));
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

    const resumed = (await invoke(
      { operation: "update", codexHome: home, codexExecutable: bin, proposalDigest: digest },
      targetEnvironment,
    ));
    expect(resumed).toMatchObject({ status: "updated", resumed: true });
    expect(readFileSync(join(home, "hooks.json"), "utf8")).toContain("review-tool-1.1.0/dist/cli.js");
  });

  it("preserves a concurrent independent-hook edit during update recovery", async () => {
    const { root, home, bin } = fixture();
    const firstEntrypoint = localPackage(root, "1.0.0");
    const secondEntrypoint = localPackage(root, "1.1.0");
    (await previewAndInstall(home, bin, { ...process.env, REVIEW_INSTALL_ENTRYPOINT: firstEntrypoint }));
    const targetEnvironment = { ...process.env, REVIEW_INSTALL_ENTRYPOINT: secondEntrypoint };
    const preview = (await invoke({ operation: "update-preview", codexHome: home, codexExecutable: bin }, targetEnvironment));
    const digest = (preview.proposal as { digest: string }).digest;
    expect((await invoke(
      { operation: "update", codexHome: home, codexExecutable: bin, proposalDigest: digest },
      { ...targetEnvironment, REVIEW_INSTALL_FAIL_AFTER_WRITES: "1" },
    )).status).toBe("partial");
    const hooksPath = join(home, "hooks.json");
    const concurrent = JSON.parse(readFileSync(hooksPath, "utf8")) as { hooks: { PostToolUse: Array<unknown> } };
    concurrent.hooks.PostToolUse.unshift({ matcher: "^Read$", hooks: [{ type: "command", command: "new-user-hook" }] });
    const concurrentContent = `${JSON.stringify(concurrent, null, 2)}\n`;
    writeFileSync(hooksPath, concurrentContent);

    const recovery = (await invoke(
      { operation: "update", codexHome: home, codexExecutable: bin, proposalDigest: digest },
      targetEnvironment,
    ));
    expect(recovery).toMatchObject({
      status: "partial",
      error: { code: "recovery_conflict", message: expect.stringContaining("concurrent change detected") },
    });
    expect(readFileSync(hooksPath, "utf8")).toBe(concurrentContent);
  });

  it.each(["missing-runtime", "malformed-runtime", "missing-protocol", "missing-version"] as const)(
    "rejects %s target package metadata before update mutation", async (corruption) => {
      const { root, home, bin } = fixture();
      const firstEntrypoint = localPackage(root, `1.0.0-${corruption}`);
      const targetEntrypoint = localPackage(root, `1.1.0-${corruption}`);
      (await previewAndInstall(home, bin, { ...process.env, REVIEW_INSTALL_ENTRYPOINT: firstEntrypoint }));
      const packageRoot = dirname(dirname(targetEntrypoint));
      if (corruption === "missing-runtime") rmSync(join(packageRoot, "package-runtime.json"));
      if (corruption === "malformed-runtime") writeFileSync(join(packageRoot, "package-runtime.json"), "{\n");
      if (corruption === "missing-protocol") {
        writeFileSync(join(packageRoot, "package-runtime.json"), '{"schemaVersion":1}\n');
      }
      if (corruption === "missing-version") writeFileSync(join(packageRoot, "package.json"), '{"type":"module"}\n');
      const beforeHooks = readFileSync(join(home, "hooks.json"), "utf8");
      const beforeOwnership = readFileSync(join(home, ".hapsland", "installation-v1.json"), "utf8");
      const targetEnvironment = { ...process.env, REVIEW_INSTALL_ENTRYPOINT: targetEntrypoint };

      for (const operation of ["update-preview", "update"] as const) {
        const result = (await invoke({
          operation,
          codexHome: home,
          codexExecutable: bin,
          ...(operation === "update" ? { proposalDigest: "0".repeat(64) } : {}),
        }, targetEnvironment));
        expect(result).toMatchObject({
          operation,
          status: "conflict",
          error: { code: "target_package_metadata_invalid" },
          completed: [],
        });
      }
      expect(readFileSync(join(home, "hooks.json"), "utf8")).toBe(beforeHooks);
      expect(readFileSync(join(home, ".hapsland", "installation-v1.json"), "utf8")).toBe(beforeOwnership);
      expect(existsSync(join(home, ".hapsland", "journal-v1.json"))).toBe(false);
    },
  );

  it("rejects a self-consistent altered journal that would drop an unrelated hook", async () => {
    const { root, home, bin } = fixture();
    const firstEntrypoint = localPackage(root, "1.0.0-tamper");
    const targetEntrypoint = localPackage(root, "1.1.0-tamper");
    const independent = { matcher: "^Read$", hooks: [{ type: "command", command: "keep-user-hook" }] };
    writeFileSync(join(home, "hooks.json"), `${JSON.stringify({ hooks: { PostToolUse: [independent] } }, null, 2)}\n`);
    (await previewAndInstall(home, bin, { ...process.env, REVIEW_INSTALL_ENTRYPOINT: firstEntrypoint }));
    const targetEnvironment = { ...process.env, REVIEW_INSTALL_ENTRYPOINT: targetEntrypoint };
    const preview = (await invoke({ operation: "update-preview", codexHome: home, codexExecutable: bin }, targetEnvironment));
    const originalDigest = (preview.proposal as { digest: string }).digest;
    expect((await invoke(
      { operation: "update", codexHome: home, codexExecutable: bin, proposalDigest: originalDigest },
      { ...targetEnvironment, REVIEW_INSTALL_FAIL_AFTER_WRITES: "1" },
    )).status).toBe("partial");
    const hooksPath = join(home, "hooks.json");
    const beforeHooks = readFileSync(hooksPath, "utf8");
    const journalPath = join(home, ".hapsland", "journal-v1.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as Record<string, unknown>;
    const mutations = journal.mutations as Array<Record<string, unknown>>;
    const hooksMutation = mutations.find((change) => change.path === hooksPath);
    expect(hooksMutation).toBeDefined();
    const altered = JSON.parse(String(hooksMutation?.afterContent)) as { hooks: { PostToolUse: Array<unknown> } };
    altered.hooks.PostToolUse = altered.hooks.PostToolUse.filter((group) => JSON.stringify(group).includes("--review-tool-owned=codex-v1"));
    if (hooksMutation !== undefined) hooksMutation.afterContent = `${JSON.stringify(altered, null, 2)}\n`;
    const alteredDigest = refreshJournalDigests(journal, home);
    writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);

    const result = (await invoke(
      { operation: "update", codexHome: home, codexExecutable: bin, proposalDigest: alteredDigest },
      targetEnvironment,
    ));
    expect(result).toMatchObject({
      status: "partial",
      error: { code: "recovery_conflict", message: expect.stringContaining("preserve the exact unrelated hook state") },
    });
    expect(readFileSync(hooksPath, "utf8")).toBe(beforeHooks);
    expect(readFileSync(hooksPath, "utf8")).toContain("keep-user-hook");
  });

  it("binds recovery to the exact target package version", async () => {
    const { root, home, bin } = fixture();
    const firstEntrypoint = localPackage(root, "1.0.0-binding");
    const targetEntrypoint = localPackage(root, "1.1.0-binding");
    (await previewAndInstall(home, bin, { ...process.env, REVIEW_INSTALL_ENTRYPOINT: firstEntrypoint }));
    const targetEnvironment = { ...process.env, REVIEW_INSTALL_ENTRYPOINT: targetEntrypoint };
    const preview = (await invoke({ operation: "update-preview", codexHome: home, codexExecutable: bin }, targetEnvironment));
    const digest = (preview.proposal as { digest: string }).digest;
    expect((await invoke(
      { operation: "update", codexHome: home, codexExecutable: bin, proposalDigest: digest },
      { ...targetEnvironment, REVIEW_INSTALL_FAIL_AFTER_WRITES: "1" },
    )).status).toBe("partial");
    writeFileSync(join(dirname(dirname(targetEntrypoint)), "package.json"), `${JSON.stringify({
      name: "realtime-review-prototype",
      version: "1.1.1-binding",
      type: "module",
    }, null, 2)}\n`);
    const beforeHooks = readFileSync(join(home, "hooks.json"), "utf8");

    const result = (await invoke(
      { operation: "update", codexHome: home, codexExecutable: bin, proposalDigest: digest },
      targetEnvironment,
    ));
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
    (await previewAndInstall(home, bin, { ...process.env, REVIEW_INSTALL_ENTRYPOINT: firstEntrypoint }));
    const targetEnvironment = { ...process.env, REVIEW_INSTALL_ENTRYPOINT: targetEntrypoint };
    const preview = (await invoke({ operation: "update-preview", codexHome: home, codexExecutable: bin }, targetEnvironment));
    const digest = (preview.proposal as { digest: string }).digest;
    expect((await invoke(
      { operation: "update", codexHome: home, codexExecutable: bin, proposalDigest: digest },
      { ...targetEnvironment, REVIEW_INSTALL_FAIL_AFTER_WRITES: "1" },
    )).status).toBe("partial");
    const operation = { operation: "update", codexHome: home, codexExecutable: bin, proposalDigest: digest };
    const lockPath = join(home, ".hapsland", "installation.lock");
    const baseline = currentLockGeneration(lockPath)?.number ?? 0n;
    const owner = spawnOperation(operation, { ...targetEnvironment, REVIEW_INSTALL_TEST_HOLD_LOCK_MS: "10000" });
    const deadGeneration = await waitFor(() => {
      const current = currentLockGeneration(lockPath);
      return current !== undefined && current.number > baseline && current.record.pid === owner.child.pid ? current : undefined;
    });
    const liveResult = (await invoke(
      operation,
      targetEnvironment,
    ));
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

    const third = (await invoke(operation, targetEnvironment));
    expect(third).toMatchObject({ status: "conflict", error: { message: expect.stringContaining("1500ms") } });
    expect(currentLockGeneration(lockPath)?.record.pid).toBe(replacement.record.pid);

    const replacementProcess = first.child.pid === replacement.record.pid ? first : second;
    const losingProcess = replacementProcess === first ? second : first;
    await losingProcess.closed;
    replacementProcess.child.kill("SIGKILL");
    await replacementProcess.closed;
    await new Promise((resolveWait) => setTimeout(resolveWait, 5_100));

    const resumed = (await invoke(operation, targetEnvironment));
    expect(resumed).toMatchObject({ status: "updated", resumed: true });
    expect(existsSync(lockPath)).toBe(true);
    expect(existsSync(join(home, ".hapsland", "journal-v1.json"))).toBe(false);
  });

  it("bounds lock acquisition and reports no mutation", async () => {
    const { home, bin } = fixture();
    const preview = (await invoke({ operation: "install-preview", codexHome: home, codexExecutable: bin }));
    const lockPath = join(home, ".hapsland", "installation.lock");
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
    const result = (await invoke({
      operation: "install",
      codexHome: home,
      codexExecutable: bin,
      proposalDigest: (preview.proposal as { digest: string }).digest,
    }));
    expect(result).toMatchObject({ status: "conflict", error: { message: expect.stringContaining("1500ms") } });
    expect(existsSync(join(home, "hooks.json"))).toBe(false);
  });

  it("compacts high generation history and stale orphans while retaining a live contender", async () => {
    const { home, bin } = fixture();
    const preview = (await invoke({ operation: "install-preview", codexHome: home, codexExecutable: bin }));
    const lockPath = join(home, ".hapsland", "installation.lock");
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

    const installed = (await invoke({
      operation: "install",
      codexHome: home,
      codexExecutable: bin,
      proposalDigest: (preview.proposal as { digest: string }).digest,
    }));
    expect(installed.status).toBe("installed");
    expect(readdirSync(generationsPath).filter((name) => /^\d{16}$/.test(name))).toHaveLength(8);
    expect(readdirSync(ownersPath)).toHaveLength(9);
    expect(existsSync(releasedOrphan)).toBe(false);
    expect(existsSync(liveOrphan)).toBe(true);
    expect(currentLockGeneration(lockPath)?.number).toBe(base + 12n);
  });
});

describe("Codex update and explicit reinstall journeys", async () => {
  it.each(["groups", "foreground"] as const)("repairs missing Codex %s without losing settings", async (damage) => {
    const { root, home, bin } = fixture();
    const entrypoint = localPackage(root, "0.1.0");
    const environment = { ...process.env, REVIEW_INSTALL_RUNTIME: process.execPath, REVIEW_INSTALL_ENTRYPOINT: entrypoint };
    const request = { codexHome: home, codexExecutable: bin };
    writeFileSync(join(home, "config.toml"), 'model = "user-model"\n');
    const preview = (await invoke({ ...request, operation: "install-preview" }, environment));
    (await invoke({ ...request, operation: "install", proposalDigest: (preview.proposal as { digest: string }).digest }, environment));
    const hooks = JSON.parse(readFileSync(join(home, "hooks.json"), "utf8"));
    const original = structuredClone(hooks);
    if (damage === "groups") {
      for (const event of ["PostToolUse", "PreToolUse", "Stop", "SubagentStop", "UserPromptSubmit"]) delete hooks.hooks[event];
    } else {
      hooks.hooks.PostToolUse[0].hooks.splice(0, 1);
    }
    writeFileSync(join(home, "hooks.json"), JSON.stringify(hooks));
    const diagnosis = (await invoke({ ...request, operation: "doctor", cwd: root }, environment));
    expect(diagnosis.checks).toEqual(expect.arrayContaining([expect.objectContaining({ stage: "configuration-ownership", status: "conflict" })]));
    const update = (await invoke({ ...request, operation: "update-preview" }, environment));
    expect(update.status).toBe("preview");
    (await invoke({ ...request, operation: "update", proposalDigest: (update.proposal as { digest: string }).digest }, environment));
    expect(JSON.parse(readFileSync(join(home, "hooks.json"), "utf8"))).toEqual(original);
    expect(readFileSync(join(home, "config.toml"), "utf8")).toContain('model = "user-model"');
    const repeated = (await invoke({ ...request, operation: "update-preview" }, environment));
    expect(repeated).toMatchObject({ alreadyCurrent: true, proposal: { changes: [] } });
  });

  it("reinstall replaces a damaged journal only after approval, backs it up, and preserves current user edits", async () => {
    const { root, home, bin } = fixture();
    const entrypoint = localPackage(root, "0.1.0");
    const environment = { ...process.env, REVIEW_INSTALL_RUNTIME: process.execPath, REVIEW_INSTALL_ENTRYPOINT: entrypoint };
    const request = { codexHome: home, codexExecutable: bin };
    const preview = (await invoke({ ...request, operation: "install-preview" }, environment));
    (await invoke({ ...request, operation: "install", proposalDigest: (preview.proposal as { digest: string }).digest }, environment));
    const journalDirectory = join(home, ".hapsland");
    const journal = join(journalDirectory, "journal-v1.json");
    writeFileSync(journal, "damaged interrupted journal");
    const hooksPath = join(home, "hooks.json");
    const hooks = JSON.parse(readFileSync(hooksPath, "utf8")); hooks.currentUserEdit = true;
    writeFileSync(hooksPath, JSON.stringify(hooks));
    const reinstall = { ...request, reinstall: true };
    const proposal = (await invoke({ ...reinstall, operation: "install-preview" }, environment));
    expect(proposal.status).toBe("preview");
    expect(readFileSync(journal, "utf8")).toBe("damaged interrupted journal");
    const applied = (await invoke({ ...reinstall, operation: "install", proposalDigest: (proposal.proposal as { digest: string }).digest }, environment));
    expect(applied.status).toBe("installed");
    expect(existsSync(journal)).toBe(false);
    const backup = readdirSync(journalDirectory).find(name => name.includes("reinstall-backup"));
    expect(backup).toBeDefined();
    expect(readFileSync(join(journalDirectory, backup!), "utf8")).toBe("damaged interrupted journal");
    expect(JSON.parse(readFileSync(hooksPath, "utf8")).currentUserEdit).toBe(true);
  });


  it("resumes reinstall after restoring a deleted preexisting hooks feature and removes only the restored feature", async () => {
    const { root, home, bin } = fixture();
    const entrypoint = localPackage(root, "0.1.0");
    const environment = { ...process.env, REVIEW_INSTALL_RUNTIME: process.execPath, REVIEW_INSTALL_ENTRYPOINT: entrypoint };
    const request = { codexHome: home, codexExecutable: bin };
    const configPath = join(home, "config.toml");
    writeFileSync(configPath, 'model = "user-model"\n[features]\nhooks = true\n');
    (await previewAndInstall(home, bin, environment));
    writeFileSync(configPath, 'model = "user-model"\n');
    const reinstall = { ...request, reinstall: true };
    const preview = (await invoke({ ...reinstall, operation: "install-preview" }, environment));
    const digest = (preview.proposal as { digest: string }).digest;
    expect((await invoke({ ...reinstall, operation: "install", proposalDigest: digest }, {
      ...environment, REVIEW_INSTALL_FAIL_AFTER_WRITES: "1",
    })).status).toBe("partial");
    expect((await invoke({ ...reinstall, operation: "install", proposalDigest: digest }, environment)).status).toBe("installed");
    expect(readFileSync(configPath, "utf8")).toContain("hooks = true");
    const removal = (await invoke({ ...request, operation: "uninstall" }, environment));
    expect((await invoke({ ...request, operation: "uninstall", proposalDigest: (removal.proposal as { digest: string }).digest }, environment)).status).toBe("uninstalled");
    expect(readFileSync(configPath, "utf8")).toContain('model = "user-model"');
    expect(readFileSync(configPath, "utf8")).not.toContain("hooks = true");
  });
});

it.each([
  { name: "version", patch: { version: 2 } },
  { name: "operation", patch: { operation: "repair" } },
  { name: "mutation", patch: { mutations: [{ path: 42 }] } },
  { name: "completed index", patch: { completed: [0] } },
])("rejects a malformed recovery journal $name without changing configuration", async ({ patch }) => {
  const { home, bin } = fixture();
  const directory = join(home, ".hapsland");
  mkdirSync(directory);
  const journalPath = join(directory, "journal-v1.json");
  const journal = JSON.stringify({ version: 1, operation: "install", proposalDigest: "digest", mutations: [], completed: [], ...patch });
  const config = "model = 'user-choice'\n";
  writeFileSync(journalPath, journal);
  writeFileSync(join(home, "config.toml"), config);
  expect(await runFixtureInstallation(home, inspectCodexInstallation({ codexHome: home, codexExecutable: bin }))).toMatchObject({
    status: "conflict", error: { message: "recovery journal is malformed; inspect it before making further changes" },
  });
  expect(readFileSync(journalPath, "utf8")).toBe(journal);
  expect(readFileSync(join(home, "config.toml"), "utf8")).toBe(config);
});

it.each(["install", "update"])("reports invalid ownership during %s without starting a journal", async (operation) => {
  const { home, bin } = fixture();
  const directory = join(home, ".hapsland");
  mkdirSync(directory);
  const ownership = JSON.stringify({ version: 2 });
  writeFileSync(join(directory, "installation-v1.json"), ownership);
  expect(await runFixtureInstallation(home, (operation === "install" ? installCodexIntegration : updateCodexIntegration)({ codexHome: home, codexExecutable: bin, proposalDigest: "0".repeat(64) }))).toMatchObject({
    status: "conflict", error: { message: "installation ownership record has an unsupported shape or version" },
  });
  expect(readFileSync(join(directory, "installation-v1.json"), "utf8")).toBe(ownership);
  expect(existsSync(join(directory, "journal-v1.json"))).toBe(false);
});

it("resumes an interrupted uninstall using only its original approved digest", async () => {
  const { root, home, bin } = fixture();
  const entrypoint = createInstallationPackageFixture(root);
  const request = { codexHome: home, codexExecutable: bin };
  const run = <A, E>(effect: Effect.Effect<A, E>, failAfter = "-1") => Effect.runPromise(effect.pipe(
    Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({
      REVIEW_INSTALL_ENTRYPOINT: entrypoint, REVIEW_INSTALL_FAIL_AFTER_WRITES: failAfter,
    }))),
  ));
  const config = "model = 'user-choice'\n";
  writeFileSync(join(home, "config.toml"), config);
  const preview = await run(previewCodexInstallation(request));
  const installDigest = readProposalDigest(preview);
  expect(await run(installCodexIntegration({ ...request, proposalDigest: installDigest }))).toMatchObject({ status: "installed" });
  const removal = await run(uninstallCodexIntegration(request));
  const digest = readProposalDigest(removal);
  expect(await run(uninstallCodexIntegration({ ...request, proposalDigest: digest }), "1")).toMatchObject({
    status: "partial", recovery: { completedFiles: 1, proposalDigest: digest },
  });
  expect(await run(uninstallCodexIntegration(request))).toMatchObject({
    status: "partial", proposal: { digest }, recovery: { operation: "uninstall" },
  });
  expect(await run(uninstallCodexIntegration({ ...request, proposalDigest: "wrong" }))).toMatchObject({
    status: "conflict", error: { message: "another journaled operation requires recovery before uninstall" },
  });
  expect(await run(uninstallCodexIntegration({ ...request, proposalDigest: digest }))).toMatchObject({ status: "uninstalled", resumed: true });
  expect(existsSync(join(home, ".hapsland", "journal-v1.json"))).toBe(false);
  expect(existsSync(join(home, ".hapsland", "installation-v1.json"))).toBe(false);
  expect(readFileSync(join(home, "config.toml"), "utf8")).toContain(config);
  expect(readFileSync(join(home, "config.toml"), "utf8")).not.toContain("hooks = true");
});

const readProposalDigest = (value: unknown) => Schema.decodeUnknownSync(Schema.Struct({
  proposal: Schema.Struct({ digest: Schema.String }),
}))(value).proposal.digest;

const runFixtureInstallation = <A, E>(home: string, effect: Effect.Effect<A, E>) => Effect.runPromise(effect.pipe(
  Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({
    REVIEW_INSTALL_ENTRYPOINT: createInstallationPackageFixture(dirname(home)),
  }))),
));
