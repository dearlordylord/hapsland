import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const run = (command, args, options = {}) => new Promise((resolveRun, rejectRun) => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs ?? 120_000);
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.once("error", rejectRun);
  child.once("close", (code, signal) => {
    clearTimeout(timer);
    resolveRun({ code, signal, stdout, stderr });
  });
  if (options.input !== undefined) child.stdin.end(options.input);
});

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};
const parse = (result, label, expectedExit) => {
  expect(result.code === expectedExit, `${label} exited ${result.code}: ${result.stderr || result.stdout}`);
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${label} did not return versioned JSON: ${result.stdout}`);
  }
};
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const actionDigest = (output, code, field) =>
  output.actions.find((action) => action.code === code)?.authorization?.[field];
const assertNoProviderCall = async (capturePath) => {
  try {
    const contents = await readFile(capturePath, "utf8");
    throw new Error(`setup unexpectedly performed provider work: ${contents.length} captured bytes`);
  } catch (cause) {
    if (cause?.code !== "ENOENT") throw cause;
  }
};
const invokeSetup = async (cli, cwd, env, request, expectedExit, label) => {
  const result = await run(cli, ["--setup"], {
    cwd,
    env,
    input: JSON.stringify(request),
    timeoutMs: 20_000,
  });
  const output = parse(result, label, expectedExit);
  expect(output.version === 1 && output.operation === "setup", `${label} did not use setup-v1`);
  expect(output.providerCalls === 0 && output.paidVerificationPerformed === false, `${label} claimed provider work`);
  return output;
};

const runMaskedSetup = (cli, cwd, env, requestPath, marker) => new Promise((resolveRun, rejectRun) => {
  const command = `${quote(cli)} --setup < ${quote(requestPath)}`;
  const scriptArgs = process.platform === "darwin"
    ? ["-q", "/dev/null", "/bin/sh", "-c", command]
    : ["-qefc", command, "/dev/null"];
  const child = spawn("script", scriptArgs, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  let supplied = false;
  const timer = setTimeout(() => {
    child.kill("SIGKILL");
    rejectRun(new Error(`masked packaged setup timed out: ${output}`));
  }, 10_000);
  const observe = (chunk) => {
    output += chunk;
    if (!supplied && output.includes("Jev API key:")) {
      supplied = true;
      child.stdin.write(`${marker}\n`);
    }
  };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", observe);
  child.stderr.on("data", observe);
  child.once("error", (cause) => {
    clearTimeout(timer);
    rejectRun(cause);
  });
  child.once("close", (code) => {
    clearTimeout(timer);
    try {
      const expectedExit = process.platform === "darwin" ? 0 : 6;
      expect(code === expectedExit, `masked packaged setup exited ${code}: ${output}`);
      expect(supplied, "masked packaged setup never requested terminal input");
      expect(!output.includes(marker), "masked packaged setup echoed the credential");
      const encoded = output.split(/\r?\n/).find((line) => line.startsWith('{"version":1,"operation":"setup"'));
      expect(encoded !== undefined, `masked packaged setup omitted JSON: ${output}`);
      resolveRun(JSON.parse(encoded));
    } catch (cause) {
      rejectRun(cause);
    }
  });
});

const temporary = await mkdtemp(join(tmpdir(), "review-setup-package-"));
try {
  const artifacts = join(temporary, "artifacts");
  const installation = join(temporary, "installation");
  const repository = join(temporary, "repository");
  const codexHome = join(temporary, "codex-home");
  const stateRoot = join(temporary, "state");
  const capturePath = join(stateRoot, "provider-calls.jsonl");
  await mkdir(artifacts, { recursive: true });
  await mkdir(installation, { recursive: true });
  await mkdir(repository, { recursive: true });
  await mkdir(codexHome, { recursive: true });
  await mkdir(stateRoot, { recursive: true });

  let result = await run("npm", ["pack", "--pack-destination", artifacts], {
    cwd: projectRoot,
    timeoutMs: 120_000,
  });
  expect(result.code === 0, `npm pack failed: ${result.stderr || result.stdout}`);
  const artifact = (await readdir(artifacts)).find((entry) => entry.endsWith(".tgz"));
  expect(artifact !== undefined, "npm pack did not produce a tarball");
  result = await run("npm", ["install", "--prefer-offline", "--omit=dev", "--prefix", installation, join(artifacts, artifact)], {
    cwd: temporary,
    timeoutMs: 120_000,
  });
  expect(result.code === 0, `packed install failed: ${result.stderr || result.stdout}`);
  const cli = join(installation, "node_modules", ".bin", "review-tool");

  result = await run("git", ["init", "--quiet", repository], { cwd: temporary });
  expect(result.code === 0, `fixture repository initialization failed: ${result.stderr}`);
  const codexExecutable = join(temporary, "codex");
  await writeFile(codexExecutable, "#!/bin/sh\nprintf 'codex-cli 0.155.1\\n'\n", { mode: 0o700 });
  await chmod(codexExecutable, 0o700);
  const baseRequest = {
    version: 1,
    operation: "setup",
    host: "codex",
    scope: { cwd: repository, review: "enabled" },
    credential: "environment",
    codexHome,
    codexExecutable,
  };
  const baseEnvironment = {
    ...process.env,
    REVIEW_STATE_PATH: join(stateRoot, "consent"),
    REVIEW_CREDENTIAL_STATE_PATH: join(stateRoot, "credential-state.json"),
    REVIEW_CONTROL_JSON: JSON.stringify({ capturePath }),
  };
  for (const name of ["TYPESAFE_API_KEY", "OPENAI_API_KEY"]) delete baseEnvironment[name];

  const handoff = await invokeSetup(cli, repository, baseEnvironment, baseRequest, 6, "noninteractive handoff");
  expect(handoff.status === "needs-user-action", "missing secret/consent did not need user action");
  expect(handoff.actions.some((action) => action.code === "provide-credential"), "missing secret handoff was absent");
  expect(handoff.actions.some((action) => action.code === "approve-repository-consent"), "consent handoff was absent");
  expect(handoff.actions.length <= 4, "noninteractive handoff was unbounded");
  const installProposalDigest = actionDigest(handoff, "approve-installation", "installProposalDigest");
  const consentProposalDigest = actionDigest(handoff, "approve-repository-consent", "consentProposalDigest");
  expect(typeof installProposalDigest === "string" && typeof consentProposalDigest === "string", "setup approvals were absent");

  const authorizedRequest = { ...baseRequest, installProposalDigest, consentProposalDigest };
  const authorizedEnvironment = { ...baseEnvironment, TYPESAFE_API_KEY: "package-setup-environment-secret" };
  const interrupted = await invokeSetup(cli, repository, {
    ...authorizedEnvironment,
    REVIEW_INSTALL_FAIL_AFTER_WRITES: "1",
  }, authorizedRequest, 5, "interrupted setup");
  expect(interrupted.status === "partial", "interrupted setup did not expose partial completion");
  expect(actionDigest(interrupted, "resume-installation", "installProposalDigest") === installProposalDigest, "resume changed the approved installation digest");

  const resumed = await invokeSetup(cli, repository, authorizedEnvironment, authorizedRequest, 6, "resumed setup");
  expect(resumed.stages.some((stage) => stage.stage === "installation" && stage.status === "complete"), "installation did not resume");
  expect(resumed.stages.some((stage) => stage.stage === "repository" && stage.status === "complete"), "repository consent was not completed");
  const repeated = await invokeSetup(cli, repository, authorizedEnvironment, authorizedRequest, 6, "repeated setup");
  expect(!JSON.stringify([interrupted, resumed, repeated]).includes("package-setup-environment-secret"), "setup disclosed the environment credential");
  expect(repeated.stages.some((stage) => stage.stage === "installation" && stage.summary.includes("already installed")), "repeat setup did not reuse installation");
  expect(repeated.stages.some((stage) => stage.stage === "repository" && stage.summary.includes("consent remains valid")), "repeat setup did not reuse consent");
  const hooks = JSON.parse(await readFile(join(codexHome, "hooks.json"), "utf8"));
  expect(hooks.hooks.PostToolUse.length === 1, "repeat setup duplicated the owned hook");

  const disabled = await invokeSetup(cli, repository, authorizedEnvironment, {
    ...baseRequest,
    scope: { cwd: repository, review: "disabled" },
    credential: "skip",
  }, 0, "disabled setup");
  expect(disabled.status === "completed", "setup did not complete with repository review disabled");
  expect(disabled.stages.some((stage) => stage.stage === "execution-context" && stage.status === "unknown"), "disabled setup overstated execution-context readiness");

  const helper = join(temporary, "secret-helper.mjs");
  const vault = join(stateRoot, "vault");
  await writeFile(helper, `#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const operation = process.argv[2]; const vault = process.env.TEST_SECRET_VAULT;
if (operation === "get") process.stdout.write(existsSync(vault) ? '{"status":"present"}\\n' + readFileSync(vault) : '{"status":"missing"}\\n');
else if (operation === "set") { const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk); writeFileSync(vault, Buffer.concat(chunks), {mode:0o600}); console.log('{"status":"stored"}'); }
else if (operation === "probe") console.log('{"status":"available"}');
`, { mode: 0o700 });
  await chmod(helper, 0o700);
  const requestPath = join(temporary, "interactive-setup.json");
  await writeFile(requestPath, JSON.stringify({
    ...baseRequest,
    credential: "saved",
    consentProposalDigest,
    interactive: true,
  }));
  const interactiveEnvironment = {
    ...baseEnvironment,
    REVIEW_CREDENTIAL_HELPER: helper,
    TEST_SECRET_VAULT: vault,
  };
  const marker = "package-interactive-setup-secret";
  const interactive = await runMaskedSetup(cli, repository, interactiveEnvironment, requestPath, marker);
  expect(interactive.providerCalls === 0 && interactive.paidVerificationPerformed === false, "interactive setup performed provider work");
  expect(interactive.stages.some((stage) => stage.stage === "credential" && stage.status === "complete"), "interactive setup did not store the credential");
  expect(interactive.stages.some((stage) => stage.stage === "host-trust" && stage.status === "unknown"), "interactive setup overstated native trust");
  expect(await readFile(vault, "utf8") === marker, "masked credential was not passed to owned storage");

  await assertNoProviderCall(capturePath);
  process.stdout.write(`${JSON.stringify({
    version: 1,
    operation: "setup-package-conformance",
    status: "passed",
    providerCalls: 0,
    journeys: ["noninteractive-handoff", "interruption-resume", "idempotent-repeat", "disabled-completion", "interactive-masked-terminal"],
  })}\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
