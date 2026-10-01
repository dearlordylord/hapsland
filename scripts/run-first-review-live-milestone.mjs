import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { createInterface } from "node:readline/promises";
import {
  requireCleanInstallationPreview,
  requireCreatedInstallation,
} from "./first-review-live-runner-policy.mjs";
import { stopScopedResident } from "./first-review-resident-cleanup.mjs";

const projectRoot = resolve(new URL("../", import.meta.url).pathname);
const explicitLive = process.argv.includes("--live");
const writeEvidence = process.argv.includes("--write-evidence");
const registryArtifact = process.argv.includes("--registry-artifact");
const releaseManifest = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
const expectedSha256 = process.argv.find((argument) => argument.startsWith("--expected-sha256="))?.slice("--expected-sha256=".length);
if (registryArtifact && !/^[0-9a-f]{64}$/.test(expectedSha256 ?? "")) {
  throw new Error("registry live milestone requires --expected-sha256=REVIEWED_ARCHIVE_SHA256");
}
const supervisedTrust = process.argv.includes("--supervised-trust");
const testSandboxBypass = process.argv.includes("--test-sandbox-bypass");
const codexHome = process.env.REVIEW_LIVE_CODEX_HOME;

const run = (command, args, options = {}) => new Promise((resolveRun, reject) => {
  const child = spawn(command, args, {
    cwd: options.cwd ?? projectRoot,
    env: options.env ?? process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  const timer = setTimeout(() => child.kill("SIGTERM"), options.timeoutMs ?? 10_000);
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (value) => { stdout += value; });
  child.stderr.on("data", (value) => { stderr += value; });
  child.once("error", reject);
  child.once("close", (code, signal) => {
    clearTimeout(timer);
    resolveRun({ code, signal, stdout, stderr });
  });
  if (options.input === undefined) child.stdin.end();
  else child.stdin.end(`${JSON.stringify(options.input)}\n`);
});

const requireExit = (result, label, expected = [0]) => {
  if (!expected.includes(result.code)) {
    throw new Error(`${label} exited ${String(result.code)} (${result.signal ?? "no signal"})`);
  }
  return result;
};

const parseJson = (result, label) => {
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${label} did not return JSON`);
  }
};

if (!explicitLive) {
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    status: "not-run",
    reason: "pass --live to explicitly select the bounded synthetic milestone",
    providerCalls: 0,
  }, null, 2)}\n`);
  process.exit(0);
}
if (codexHome === undefined) {
  throw new Error("live milestone requires REVIEW_LIVE_CODEX_HOME");
}

const runnerRoot = await mkdtemp(join(tmpdir(), "review-first-live-runner-"));
const installPrefix = join(runnerRoot, "installed-release");
const stateRoot = join(runnerRoot, "state");
const runnerEnv = {
  ...process.env,
  ...(testSandboxBypass ? { REVIEW_DEMO_TEST_SANDBOX_BYPASS: "1" } : {}),
  REVIEW_STATE_PATH: join(stateRoot, "consent"),
  REVIEW_ACTIVITY_PATH: join(stateRoot, "activity"),
  REVIEW_DEMO_STATE_PATH: join(stateRoot, "demo.json"),
  REVIEW_RESIDENT_DIR: join(stateRoot, "resident"),
};

let cli;
let preview;
let live;
let artifactSha256;
let codexVersion;
let installed = false;

const invoke = async (input, timeoutMs = 10_000, expected = [0]) => {
  const result = requireExit(await run(cli, ["--demo"], {
    env: runnerEnv,
    input,
    timeoutMs,
  }), `installed CLI ${input.selection}`, expected);
  return { ...result, output: parseJson(result, `installed CLI ${input.selection}`) };
};

try {
  await mkdir(installPrefix, { recursive: true });
  const packResult = requireExit(await run("npm", registryArtifact
    ? ["pack", `${releaseManifest.name}@${releaseManifest.version}`, "--json", "--ignore-scripts=true", "--registry=https://registry.npmjs.org/", "--pack-destination", runnerRoot]
    : ["pack", "--json", "--pack-destination", runnerRoot], {
    timeoutMs: 120_000,
  }), "npm pack");
  const packEntries = parseJson(packResult, "npm pack");
  const tarballName = packEntries[0]?.filename;
  if (typeof tarballName !== "string") throw new Error("npm pack did not identify its tarball");
  const tarballPath = join(runnerRoot, tarballName);
  artifactSha256 = createHash("sha256").update(await readFile(tarballPath)).digest("hex");
  if (registryArtifact && artifactSha256 !== expectedSha256) {
    throw new Error(`registry archive SHA-256 differs from reviewed artifact: ${artifactSha256}`);
  }

  requireExit(await run("npm", ["install", "--global=false", "--legacy-peer-deps", "--ignore-scripts=true", "--prefer-offline", "--omit=dev", "--bin-links=true", "--prefix", installPrefix, tarballPath], {
    timeoutMs: 120_000,
  }), "packed release installation");
  const invokedCli = join(installPrefix, "node_modules", ".bin", "hapsland");
  cli = await realpath(invokedCli);
  const installedPackageRoot = await realpath(join(installPrefix, "node_modules", "@hapsland", "hapsland"));
  const resolvedCli = await realpath(cli);
  if (resolvedCli !== installedPackageRoot && !resolvedCli.startsWith(`${installedPackageRoot}${sep}`)) {
    throw new Error("invoked CLI does not resolve inside the installed packed artifact");
  }
  const packageManifest = JSON.parse(await readFile(resolve(dirname(resolvedCli), "../package.json"), "utf8"));
  if (packageManifest.name !== "@hapsland/hapsland") {
    throw new Error("installed CLI package identity did not match the packed release");
  }

  const versionResult = requireExit(await run("codex", ["--version"], { timeoutMs: 10_000 }), "codex --version");
  codexVersion = versionResult.stdout.trim();
  if (codexVersion.length === 0) throw new Error("codex --version returned an empty version");

  const installPreviewRun = requireExit(await run(cli, ["--install-preview"], {
    env: runnerEnv,
    input: { version: 1, operation: "install-preview", codexHome, codexExecutable: "codex" },
  }), "installed CLI install preview");
  const installPreview = parseJson(installPreviewRun, "installed CLI install preview");
  const installDigest = requireCleanInstallationPreview(installPreview);
  const installRun = requireExit(await run(cli, ["--install"], {
    env: runnerEnv,
    input: {
      version: 1,
      operation: "install",
      codexHome,
      codexExecutable: "codex",
      proposalDigest: installDigest,
    },
  }), "installed CLI install");
  const installResult = parseJson(installRun, "installed CLI install");
  requireCreatedInstallation(installResult);
  installed = true;

  preview = await invoke({
    version: 1,
    operation: "demo",
    selection: "preview",
    codexHome,
    codexExecutable: "codex",
  });
  if (preview.output?.status !== "preview") throw new Error("installed release did not produce an offline demo preview");
  if (preview.output.paidVerificationPerformed !== false ||
      preview.output.budget?.sourceBytes !== 4_096 ||
      preview.output.budget?.providerCalls !== 2 ||
      preview.output.budget?.timeMs !== 180_000) {
    throw new Error("demo preview did not preserve the declared offline budget contract");
  }

  if (supervisedTrust) {
    if (!process.stdin.isTTY) throw new Error("supervised native trust requires a terminal");
    const disposableRoot = preview.output.demo?.disposableRoot;
    if (typeof disposableRoot !== "string") throw new Error("demo preview omitted its disposable root");
    const trustBefore = await readFile(join(codexHome, "config.toml"), "utf8").catch(() => "");
    process.stderr.write(`Complete Codex's native repository and hook trust review in another terminal:\n  CODEX_HOME=${codexHome} codex --no-alt-screen -C ${disposableRoot}\nThen press Enter here to run the declared live demo, or Ctrl-C to cancel.\n`);
    const terminal = createInterface({ input: process.stdin, output: process.stderr });
    try { await terminal.question("Native trust completed? "); }
    finally { terminal.close(); }
    const trustedConfig = await readFile(join(codexHome, "config.toml"), "utf8");
    const hookHash = /trusted_hash = "(sha256:[0-9a-f]{64})"/u.exec(trustedConfig)?.[1];
    const previousHookHash = /trusted_hash = "(sha256:[0-9a-f]{64})"/u.exec(trustBefore)?.[1];
    if (!trustedConfig.includes(`[projects."${disposableRoot}"]`) ||
        !trustedConfig.includes(`[hooks.state."${join(codexHome, "hooks.json")}:post_tool_use:0:0"]`) ||
        hookHash === undefined || hookHash === previousHookHash) {
      throw new Error("native repository and exact hook-definition trust were not persisted");
    }
  }

  live = await invoke({
    version: 1,
    operation: "demo",
    selection: "live",
    demoId: preview.output.demo.id,
    selectionDigest: preview.output.authorization.selectionDigest,
    codexHome,
    codexExecutable: "codex",
  }, 195_000, [0, 6]);
} finally {
  let cleanupFailure;
  const retainCleanupFailure = (cause) => { cleanupFailure ??= cause; };
  if (preview?.output?.demo?.id !== undefined && live?.output?.cleanup?.disposableRootRemoved !== true && cli !== undefined) {
    await invoke({
      version: 1,
      operation: "demo",
      selection: "cancel",
      demoId: preview.output.demo.id,
    }).catch(retainCleanupFailure);
  }
  if (installed && cli !== undefined) {
    await (async () => {
      const uninstallPreviewRun = requireExit(await run(cli, ["--uninstall"], {
        env: runnerEnv,
        input: { version: 1, operation: "uninstall", codexHome },
      }), "installed CLI uninstall preview");
      const uninstallPreview = parseJson(uninstallPreviewRun, "installed CLI uninstall preview");
      if (uninstallPreview.status !== "preview" || typeof uninstallPreview.proposal?.digest !== "string") {
        throw new Error("installed CLI did not produce a scoped uninstall preview");
      }
      const uninstallRun = requireExit(await run(cli, ["--uninstall"], {
        env: runnerEnv,
        input: {
          version: 1,
          operation: "uninstall",
          codexHome,
          proposalDigest: uninstallPreview.proposal.digest,
        },
      }), "installed CLI uninstall");
      const uninstallResult = parseJson(uninstallRun, "installed CLI uninstall");
      if (uninstallResult.status !== "uninstalled") {
        throw new Error("installed CLI did not complete scoped uninstall");
      }
    })().catch(retainCleanupFailure);
  }
  await stopScopedResident(stateRoot).catch(retainCleanupFailure);
  await rm(runnerRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(retainCleanupFailure);
  if (cleanupFailure !== undefined) throw cleanupFailure;
}

const result = live?.output;
const evidence = {
  schemaVersion: 1,
  recordedAt: new Date().toISOString(),
  milestone: "installed-product-first-review",
  environment: {
    codex: codexVersion,
    node: process.version,
    operatingSystem: process.platform,
    architecture: process.arch,
  },
  package: {
    source: registryArtifact ? "npm-registry-installation" : "runner-packed-release-installation",
    artifactSha256,
    cliResolvedInsideInstalledArtifact: true,
  },
  selection: {
    explicitLive: true,
    syntheticOnly: preview.output.demo.syntheticOnly === true,
    deliberatelyFlawed: preview.output.demo.disclosure.deliberatelyFlawed === true,
    repairPrescribed: preview.output.demo.disclosure.repairPrescribed === true,
    exactDisposableSelection: typeof preview.output.authorization.selectionDigest === "string",
    supervisedNativeTrust: supervisedTrust,
    hostSandboxMode: testSandboxBypass ? "test-bypass" : "workspace-write",
    hostModel: process.env.REVIEW_DEMO_TEST_CODEX_MODEL ?? "Codex default",
    budgets: preview.output.budget,
  },
  setup: preview.output.setup,
  reviewLatencyMs: result?.reviewLatencyMs ?? null,
  status: result?.status ?? "incomplete",
  stages: result?.evidence ?? {
    completion: "incomplete",
    submission: "unavailable",
    modelReaction: "unavailable",
    modelReactionSource: "unavailable",
    deliveredFindingCorrelation: false,
    repair: "not-validated",
    followUpReview: "unavailable",
  },
  cleanup: result?.cleanup ?? { disposableRootRemoved: false },
  retained: { source: false, providerResponse: false, credential: false, paths: false, digests: false },
};

if (writeEvidence) {
  const directory = resolve(projectRoot, "evidence/first-review");
  await mkdir(directory, { recursive: true });
  const version = /^codex-cli (\d+\.\d+\.\d+)$/.exec(codexVersion ?? "")?.[1];
  if (version === undefined) throw new Error("installed first-review Codex version is unavailable");
  await writeFile(resolve(directory, `live-installed-codex-${version}-supervised.json`), `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
}
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
if (evidence.status !== "passed") process.exitCode = 1;
