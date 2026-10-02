import { spawn } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
const invokeDemo = async (cli, cwd, env, request, expectedExit, label) => {
  const result = await run(cli, ["--demo"], {
    cwd,
    env,
    input: JSON.stringify(request),
    timeoutMs: 20_000,
  });
  const output = parse(result, label, expectedExit);
  expect(output.version === 1 && output.operation === "demo", `${label} did not use demo-v1`);
  return output;
};

const runMaskedSetup = (cli, cwd, env, requestPath, marker) => new Promise((resolveRun, rejectRun) => {
  const command = `${quote(cli)} --setup < ${quote(requestPath)}`;
  const terminal = process.platform === "darwin"
    ? ["python3", [join(projectRoot, "scripts/pty-bridge.py"), "/bin/sh", "-c", command]]
    : ["script", ["-qefc", command, "/dev/null"]];
  const child = spawn(terminal[0], terminal[1], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
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
      const expectedExit = 6;
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

const runGuidedPilot = (cli, cwd, env, codexHome, codexExecutable, answers, commandOverride, expectedExit = 0) => new Promise((resolveRun, rejectRun) => {
  const command = commandOverride ?? `${quote(cli)} setup codex --codex-home=${quote(codexHome)} --codex-executable=${quote(codexExecutable)}`;
  const terminal = process.platform === "darwin"
    ? ["python3", [join(projectRoot, "scripts/pty-bridge.py"), "/bin/sh", "-c", command]]
    : ["script", ["-qefc", command, "/dev/null"]];
  const child = spawn(terminal[0], terminal[1], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  let answered = 0;
  const timer = setTimeout(() => { child.kill("SIGKILL"); rejectRun(new Error("guided pilot timed out")); }, 20_000);
  const observe = (chunk) => {
    output += chunk;
    while (answered < answers.length && output.includes(answers[answered].prompt)) {
      child.stdin.write(`${answers[answered].value}\n`);
      answered += 1;
    }
  };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", observe);
  child.stderr.on("data", observe);
  child.once("error", (cause) => { clearTimeout(timer); rejectRun(cause); });
  child.once("close", (code) => {
    clearTimeout(timer);
    try {
      expect(code === expectedExit, `terminal command exited ${code} instead of ${expectedExit}`);
      expect(answered === answers.length, `guided pilot answered ${answered} of ${answers.length} prompts`);
      resolveRun(output);
    } catch (cause) { rejectRun(cause); }
  });
});

const temporary = await mkdtemp(join(tmpdir(), "review-setup-package-"));
try {
  const artifacts = join(temporary, "artifacts");
  const installation = join(temporary, "installation");
  const repository = join(temporary, "repository");
  const codexHome = join(temporary, "codex-home");
  const stateRoot = join(temporary, "state");
  const publicHome = join(temporary, "home");
  const capturePath = join(stateRoot, "provider-calls.jsonl");
  await mkdir(artifacts, { recursive: true });
  await mkdir(installation, { recursive: true });
  await mkdir(repository, { recursive: true });
  await mkdir(codexHome, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  await mkdir(publicHome, { recursive: true });

  let result = await run("npm", ["pack", "--pack-destination", artifacts], {
    cwd: projectRoot,
    timeoutMs: 120_000,
  });
  expect(result.code === 0, `npm pack failed: ${result.stderr || result.stdout}`);
  const artifact = (await readdir(artifacts)).find((entry) => entry.endsWith(".tgz"));
  expect(artifact !== undefined, "npm pack did not produce a tarball");
  const archiveContents = await run("tar", ["-tzf", join(artifacts, artifact)], { cwd: temporary });
  expect(archiveContents.code === 0, "packed archive could not be listed");
  expect(!archiveContents.stdout.split("\n").some((entry) => entry.startsWith("package/dist/native/")),
    "packed archive contains a build-machine native helper");
  expect(archiveContents.stdout.includes(`package/native/prebuilt/${process.platform}-${process.arch}/credential-secret-service`),
    "packed archive lacks the selected platform's credential helper");
  const packedManifest = await run("tar", ["-xOf", join(artifacts, artifact), "package/package.json"], { cwd: temporary });
  expect(packedManifest.code === 0 && !Object.hasOwn(JSON.parse(packedManifest.stdout).scripts ?? {}, "postinstall"),
    "packed archive still depends on a postinstall script");
  result = await run("npm", ["install", "--ignore-scripts=true", "--prefer-offline", "--omit=dev", "--prefix", installation, join(artifacts, artifact)], {
    cwd: temporary,
    timeoutMs: 120_000,
  });
  expect(result.code === 0, `packed install failed: ${result.stderr || result.stdout}`);
  const cli = join(installation, "node_modules", ".bin", "hapsland");

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
    HOME: publicHome,
    REVIEW_STATE_PATH: join(stateRoot, "consent"),
    REVIEW_USER_CONFIG_PATH: join(stateRoot, "user.jsonc"),
    REVIEW_CREDENTIAL_STATE_PATH: join(stateRoot, "credential-state.json"),
    REVIEW_CONTROL_JSON: JSON.stringify({ capturePath }),
  };
  for (const name of ["TYPESAFE_API_KEY", "OPENAI_API_KEY"]) delete baseEnvironment[name];

  const foreignHelper = join(temporary, "foreign-credential-helper");
  await writeFile(foreignHelper, Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x00, 0x00, 0x00, 0x00]), { mode: 0o700 });
  await chmod(foreignHelper, 0o700);
  const unavailableHelper = await invokeSetup(cli, repository, {
    ...baseEnvironment,
    REVIEW_CREDENTIAL_HELPER: foreignHelper,
  }, baseRequest, 6, "foreign native credential helper");
  expect(unavailableHelper.stages.some((entry) =>
    entry.stage === "credential" && entry.status === "pending"),
  "unexecutable credential helper did not produce a bounded setup result");

  const handoff = await invokeSetup(cli, repository, baseEnvironment, baseRequest, 6, "noninteractive handoff");
  expect(handoff.status === "needs-user-action", "missing secret or installation approval did not need user action");
  expect(handoff.actions.some((action) => action.code === "provide-credential"), "missing secret handoff was absent");
  expect(handoff.actions.length <= 4, "noninteractive handoff was unbounded");
  const installationProposal = handoff.stages.find((stage) => stage.stage === "installation")?.observed?.proposal;
  expect(Array.isArray(installationProposal?.changes) && installationProposal.changes.every((change) =>
    typeof change.file === "string" && typeof change.beforeDigest === "string" && typeof change.afterDigest === "string"),
  "setup omitted exact installation paths or before/after digests");
  expect(typeof installationProposal?.ownedChanges?.runtime?.entrypoint === "string" &&
    typeof installationProposal?.ownedChanges?.runtime?.executable === "string" &&
    typeof installationProposal?.ownedChanges?.hook?.matcher === "string" &&
    typeof installationProposal?.ownedChanges?.hook?.handlers?.[0]?.command === "string" &&
    typeof installationProposal?.ownedChanges?.hook?.handlers?.[0]?.timeout === "number" &&
    typeof installationProposal?.ownedChanges?.ownership?.file === "string",
  "setup omitted exact owned runtime, hook, or ownership changes");
  const installProposalDigest = actionDigest(handoff, "approve-installation", "installProposalDigest");
  expect(typeof installProposalDigest === "string", "installation approval was absent");

  const authorizedRequest = { ...baseRequest, installProposalDigest };
  const authorizedEnvironment = { ...baseEnvironment, TYPESAFE_API_KEY: "package-setup-environment-secret" };
  const interrupted = await invokeSetup(cli, repository, {
    ...authorizedEnvironment,
    REVIEW_INSTALL_FAIL_AFTER_WRITES: "1",
  }, authorizedRequest, 5, "interrupted setup");
  expect(interrupted.status === "partial", "interrupted setup did not expose partial completion");
  expect(actionDigest(interrupted, "resume-installation", "installProposalDigest") === installProposalDigest, "resume changed the approved installation digest");

  const resumed = await invokeSetup(cli, repository, authorizedEnvironment, authorizedRequest, 6, "resumed setup");
  expect(resumed.stages.some((stage) => stage.stage === "installation" && stage.status === "complete"), "installation did not resume");
  expect(resumed.stages.some((stage) => stage.stage === "repository" && stage.status === "complete"), "file settings were not loaded");
  const repeated = await invokeSetup(cli, repository, authorizedEnvironment, authorizedRequest, 6, "repeated setup");
  expect(!JSON.stringify([interrupted, resumed, repeated]).includes("package-setup-environment-secret"), "setup disclosed the environment credential");
  expect(repeated.stages.some((stage) => stage.stage === "installation" && stage.summary.includes("already installed")), "repeat setup did not reuse installation");
  expect(repeated.stages.some((stage) => stage.stage === "repository" && stage.summary.includes("file settings loaded")), "repeat setup did not reload file settings");
  const hooks = JSON.parse(await readFile(join(codexHome, "hooks.json"), "utf8"));
  expect(hooks.hooks.PostToolUse.length === 1, "repeat setup duplicated the owned hook");

  const demoPreview = await invokeDemo(cli, repository, {
    ...authorizedEnvironment,
    REVIEW_DEMO_STATE_PATH: join(stateRoot, "demos"),
  }, {
    version: 1,
    operation: "demo",
    selection: "preview",
    codexHome,
    codexExecutable,
  }, 0, "offline first-review demo preview");
  expect(demoPreview.status === "preview" && demoPreview.liveSelected === false &&
    demoPreview.paidVerificationPerformed === false, "demo preview was not offline");
  expect(demoPreview.demo?.syntheticOnly === true && demoPreview.demo.disposableRoot !== repository &&
    demoPreview.demo.disclosure?.deliberatelyFlawed === true &&
    demoPreview.demo.disclosure?.repairPrescribed === false &&
    typeof demoPreview.demo.disclosure?.source === "string", "demo did not disclose its separate synthetic input");
  expect(demoPreview.budget?.sourceBytes === 4_096 && demoPreview.budget?.providerCalls === 2 &&
    demoPreview.budget?.timeMs === 180_000, "demo preview changed its declared budgets");
  const mismatchedDemo = await invokeDemo(cli, repository, {
    ...authorizedEnvironment,
    REVIEW_DEMO_STATE_PATH: join(stateRoot, "demos"),
  }, {
    version: 1,
    operation: "demo",
    selection: "live",
    demoId: demoPreview.demo.id,
    selectionDigest: "0".repeat(64),
    codexHome,
    codexExecutable,
  }, 4, "mismatched disposable-root selection");
  expect(mismatchedDemo.status === "proposal-mismatch" && mismatchedDemo.providerCalls === 0 &&
    mismatchedDemo.paidVerificationPerformed === false, "mismatched demo selection crossed the live boundary");
  const cancelledDemo = await invokeDemo(cli, repository, {
    ...authorizedEnvironment,
    REVIEW_DEMO_STATE_PATH: join(stateRoot, "demos"),
  }, {
    version: 1,
    operation: "demo",
    selection: "cancel",
    demoId: demoPreview.demo.id,
  }, 0, "cancelled first-review demo");
  expect(cancelledDemo.status === "cleaned" && cancelledDemo.cleaned === true && cancelledDemo.providerCalls === 0,
    "cancelled demo did not clean up offline");
  await access(demoPreview.demo.disposableRoot).then(
    () => { throw new Error("cancelled demo retained its disposable root"); },
    () => undefined,
  );
  await writeFile(join(stateRoot, "user.jsonc"), JSON.stringify({ version: 1, excludes: ["**/*"] }));

  const partialHome = join(temporary, "partial-codex-home");
  await mkdir(partialHome, { recursive: true });
  const partialDisabledRequest = {
    ...baseRequest,
    scope: { cwd: repository, review: "disabled" },
    credential: "skip",
    codexHome: partialHome,
  };
  const partialPreview = await invokeSetup(cli, repository, authorizedEnvironment, partialDisabledRequest, 6, "partial-disable preview");
  const partialDigest = actionDigest(partialPreview, "approve-installation", "installProposalDigest");
  expect(typeof partialDigest === "string", "partial-disable preview omitted installation approval");
  const partialDisabled = await invokeSetup(cli, repository, {
    ...authorizedEnvironment,
    REVIEW_INSTALL_FAIL_AFTER_WRITES: "1",
  }, { ...partialDisabledRequest, installProposalDigest: partialDigest }, 5, "partial installation disable");
  expect(partialDisabled.stages.some((stage) => stage.stage === "installation" && stage.status === "partial"), "partial installation was not reported");
  expect(partialDisabled.stages.some((stage) => stage.stage === "repository" && stage.status === "complete"), "user exclude-all was not preserved during partial installation");

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

  const pilotRepository = join(temporary, "pilot-repository");
  const pilotHome = join(temporary, "pilot-codex-home");
  await mkdir(pilotRepository);
  await mkdir(pilotHome);
  result = await run("git", ["init", "--quiet", pilotRepository], { cwd: temporary });
  expect(result.code === 0, "guided pilot fixture repository initialization failed");
  const pilotVault = join(stateRoot, "pilot-vault");
  const pilotState = join(stateRoot, "pilot-consent");
  const pilotEnvironment = {
    ...interactiveEnvironment,
    TEST_SECRET_VAULT: pilotVault,
    REVIEW_STATE_PATH: pilotState,
    REVIEW_USER_CONFIG_PATH: join(stateRoot, "pilot-user.jsonc"),
    REVIEW_CREDENTIAL_STATE_PATH: join(stateRoot, "pilot-credential-state.json"),
  };
  const pilotMarker = "package-guided-pilot-secret";
  const pilotCodexExecutable = process.env.REVIEW_PILOT_CODEX_EXECUTABLE ?? codexExecutable;
  const declinedPilot = await runGuidedPilot(cli, pilotRepository, pilotEnvironment, pilotHome, pilotCodexExecutable, [
    { prompt: "Install these entries", value: "y" },
    { prompt: "Jev API key:", value: pilotMarker },
  ]);
  expect(declinedPilot.includes(`Jev key saved in ${process.platform === "darwin" ? "Keychain" : "Secret Service"}`),
    "guided login did not confirm credential storage");
  expect(declinedPilot.includes("No paid verification or review was sent"), "guided login overstated verification");
  expect(!declinedPilot.includes(pilotMarker), "guided credential appeared in terminal output");
  expect(await readFile(pilotVault, "utf8") === pilotMarker, "guided credential was not saved");
  const approvedPilot = await runGuidedPilot(cli, pilotRepository, pilotEnvironment, pilotHome, pilotCodexExecutable, []);
  expect(approvedPilot.includes("Offline readiness: unknown"), "guided pilot overstated native trust");
  expect(approvedPilot.includes("native trust or hook review prompt"), "guided pilot omitted trust handoff");
  expect(!approvedPilot.includes(pilotMarker), "guided rerun disclosed saved credential");
  const pilotHooks = JSON.parse(await readFile(join(pilotHome, "hooks.json"), "utf8"));
  expect(pilotHooks.hooks.PostToolUse.length === 1, "guided rerun duplicated the owned hook");
  const invalidLogin = await runGuidedPilot(cli, pilotRepository, pilotEnvironment, pilotHome, pilotCodexExecutable, [
    { prompt: "Jev API key:", value: "" },
  ], `${quote(cli)} --login`, 6);
  expect(invalidLogin.includes("Enter a nonempty Jev key"), "interactive invalid login omitted a concrete recovery step");

  await assertNoProviderCall(capturePath);
  process.stdout.write(`${JSON.stringify({
    version: 1,
    operation: "setup-package-conformance",
    status: "passed",
    providerCalls: 0,
    journeys: ["noninteractive-handoff", "interruption-resume", "idempotent-repeat", "offline-first-review-demo", "disabled-completion", "interactive-masked-terminal", "guided-pilot"],
  })}\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
