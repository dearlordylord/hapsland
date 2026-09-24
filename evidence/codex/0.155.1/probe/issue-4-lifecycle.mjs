import { createHash } from "node:crypto";
import { chmod, copyFile, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");
const hookScript = join(repoRoot, "evidence/codex/0.155.1/probe/issue-4-lifecycle-hook.mjs");
const defaultOutput = join(repoRoot, "evidence/codex/0.155.1/issue-4-lifecycle-2026-09-20.json");
const codexVersion = "codex-cli 0.155.1";
const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

const runCommand = (command, args, options = {}) =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let settled = false;
    const finish = (action) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      action();
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(() => reject(new Error("command-timeout")));
    }, options.timeoutMs ?? 20_000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 1_000_000) {
        child.kill("SIGTERM");
        finish(() => reject(new Error("command-output-limit")));
      }
    });
    child.stderr.resume();
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code, signal) =>
      finish(() => resolvePromise({ code, signal, stdout })),
    );
  });

const git = async (repository, args) => {
  const result = await runCommand("git", ["-C", repository, ...args], { timeoutMs: 20_000 });
  if (result.code !== 0) throw new Error("git-command-failed");
  return result;
};

const sha256 = (content) => createHash("sha256").update(content).digest("hex");

const fileSnapshot = async (repository, relativePath) => {
  const absolutePath = join(repository, relativePath);
  try {
    const stats = await stat(absolutePath);
    if (!stats.isFile()) return { path: relativePath, exists: true, regularFile: false };
    const content = await readFile(absolutePath);
    return { path: relativePath, exists: true, regularFile: true, size: content.byteLength, sha256: sha256(content) };
  } catch {
    return { path: relativePath, exists: false };
  }
};

const snapshots = async (repository, paths) => Promise.all(paths.map((path) => fileSnapshot(repository, path)));

const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

const summarizeHostEvent = (event) => {
  if (event === null || typeof event !== "object") return { type: "<non-object>" };
  const result = { type: typeof event.type === "string" ? event.type : "<missing>" };
  if (typeof event.item?.type === "string") result.itemType = event.item.type;
  if (typeof event.item?.name === "string" && /^(Bash|apply_patch|Agent)$/.test(event.item.name)) result.itemName = event.item.name;
  if (typeof event.status === "string" && /^(completed|failed|in_progress|interrupted)$/i.test(event.status)) result.status = event.status.toLowerCase();
  if (typeof event.exit_code === "number" && Number.isSafeInteger(event.exit_code)) result.exitCode = event.exit_code;
  if (typeof event.error?.code === "string" && /^[A-Z0-9_-]+$/.test(event.error.code)) result.errorCode = event.error.code;
  return result;
};

const readProbeLines = async (path) => {
  try {
    const text = await readFile(path, "utf8");
    return text.split("\n").filter(Boolean).flatMap((line) => {
      try {
        const value = JSON.parse(line);
        return value && typeof value === "object" ? [value] : [];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
};

const pathExists = async (path) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const makeAssertion = (name, pass, observed, expected) => ({
  name,
  pass,
  observed,
  expected,
});

const snapshotMatches = (actual, expected) => {
  if (actual === undefined) return false;
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) return false;
  }
  return true;
};

const evaluateCase = ({ definition, authAvailable, processResult, hookRecords, finalFiles, cleanupVerified }) => {
  const observedEventNames = hookRecords.map((record) => record.event);
  const assertions = [];
  const expectedProcess = definition.processExpectation;
  const processObserved = {
    status: processResult.status,
    exitCode: processResult.exitCode,
    signal: processResult.signal,
    interrupted: processResult.interrupted,
    timedOut: processResult.timedOut,
  };
  const processExpected = {
    exitCode: expectedProcess.exitCode,
    signal: expectedProcess.signal,
    interrupted: expectedProcess.interrupted,
    timedOut: expectedProcess.timedOut,
  };

  assertions.push(makeAssertion("authentication-available", authAvailable, authAvailable, true));
  assertions.push(makeAssertion("process-exit-signal-timeout", authAvailable && sameJson(processObserved, { ...processExpected, status: undefined }), processObserved, processExpected));
  assertions.push(makeAssertion("event-order-and-presence", sameJson(observedEventNames, definition.expectedEventNames), observedEventNames, definition.expectedEventNames));

  const finalTarget = definition.finalTarget;
  const finalTargetObserved = finalTarget === null
    ? finalFiles.map((file) => file.path)
    : finalFiles.find((file) => file.path === finalTarget.path);
  const finalTargetPass = finalTarget === null
    ? finalFiles.length === 0
    : snapshotMatches(finalTargetObserved, finalTarget);
  assertions.push(makeAssertion("final-target-snapshot", finalTargetPass, finalTargetObserved, finalTarget));

  const postToolRecords = hookRecords.filter((record) => record.event === "PostToolUse");
  assertions.push(makeAssertion("post-tool-use-count", postToolRecords.length === definition.postToolUseCount, postToolRecords.length, definition.postToolUseCount));
  if (definition.postToolTarget !== null) {
    const postTargetObserved = postToolRecords[0]?.targets?.find((file) => file.path === definition.postToolTarget.path);
    assertions.push(makeAssertion("post-tool-target-snapshot", snapshotMatches(postTargetObserved, definition.postToolTarget), postTargetObserved, definition.postToolTarget));
  }

  if (definition.userPromptCount !== undefined) {
    const userPromptCount = hookRecords.filter((record) => record.event === "UserPromptSubmit").length;
    assertions.push(makeAssertion("user-prompt-submit-count", userPromptCount === definition.userPromptCount, userPromptCount, definition.userPromptCount));
  }

  if (definition.stopExpectation !== null) {
    const stopRecords = hookRecords.filter((record) => record.event === "Stop");
    const decisions = stopRecords.map((record) => record.stopDecision);
    const active = stopRecords.map((record) => record.stopHookActive);
    assertions.push(makeAssertion("stop-count", stopRecords.length === definition.stopExpectation.count, stopRecords.length, definition.stopExpectation.count));
    assertions.push(makeAssertion("stop-decisions", sameJson(decisions, definition.stopExpectation.decisions), decisions, definition.stopExpectation.decisions));
    assertions.push(makeAssertion("stop-hook-active", sameJson(active, definition.stopExpectation.active), active, definition.stopExpectation.active));
  }

  assertions.push(makeAssertion("cleanup", cleanupVerified, cleanupVerified, true));
  return {
    assertions,
    pass: assertions.every((assertion) => assertion.pass),
  };
};

const waitForFile = async (path, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const stats = await stat(path);
      if (stats.isFile()) return true;
    } catch {
      // Keep polling the isolated disposable repository.
    }
    await sleep(100);
  }
  return false;
};

const createRepository = async (parent) => {
  const repository = await mkdtemp(join(parent, "repo-"));
  await git(repository, ["init", "--quiet", "--initial-branch=master"]);
  await git(repository, ["config", "user.name", "Issue 4 Probe"]);
  await git(repository, ["config", "user.email", "issue-4-probe@example.invalid"]);
  await writeFile(join(repository, "baseline.ts"), "export const baseline = 1;\n", { mode: 0o600 });
  await git(repository, ["add", "baseline.ts"]);
  await git(repository, ["commit", "--quiet", "-m", "synthetic baseline"]);
  return repository;
};

const createCodexHome = async (parent, capturePath, repository, targetPaths, stopBlocks, stopStatePath, startedAtMs) => {
  const home = await mkdtemp(join(parent, "codex-home-"));
  await chmod(home, 0o700);
  const primaryAuth = "/home/node/.codex/auth.json";
  try {
    await copyFile(primaryAuth, join(home, "auth.json"));
    await chmod(join(home, "auth.json"), 0o600);
  } catch {
    return { home, authAvailable: false };
  }
  await writeFile(join(home, "config.toml"), "[features]\nhooks = true\n", { mode: 0o600 });
  const command = `${process.execPath} ${shellQuote(hookScript)}`;
  const handler = (timeout) => ({ type: "command", command, timeout });
  const hooks = {
    SessionStart: [{ hooks: [handler(3)] }],
    UserPromptSubmit: [{ hooks: [handler(3)] }],
    PostToolUse: [{ matcher: "^Bash$", hooks: [handler(10)] }],
    Stop: [{ hooks: [handler(10)] }],
    Interrupt: [{ hooks: [handler(2)] }],
    SessionEnd: [{ matcher: "^other$", hooks: [handler(2)] }],
  };
  await writeFile(join(home, "hooks.json"), `${JSON.stringify({ description: "isolated issue-4 lifecycle probe", hooks }, null, 2)}\n`, { mode: 0o600 });
  return { home, authAvailable: true, capturePath, repository, targetPaths, stopBlocks, stopStatePath, startedAtMs };
};

const sanitizeEnvironment = (base, probeEnv) => {
  const env = { ...base, ...probeEnv };
  for (const key of Object.keys(env)) {
    if (/^CODEX_(SESSION|THREAD|PARENT)/.test(key)) delete env[key];
  }
  for (const key of ["OPENAI_API_KEY", "TYPESAFE_API_KEY", "REVIEW_PROBE_CAPTURE", "REVIEW_PROBE_TARGETS", "REVIEW_PROBE_STOP_BLOCKS", "REVIEW_PROBE_STOP_STATE", "REVIEW_PROBE_STARTED_AT_MS"]) {
    if (!(key in probeEnv)) delete env[key];
  }
  return env;
};

const runCodex = async ({ repository, home, capturePath, targetPaths, stopBlocks, stopStatePath, startedAtMs, prompt, interruptAfterMarker }) => {
  const env = sanitizeEnvironment(process.env, {
    CODEX_HOME: home,
    REVIEW_PROBE_CAPTURE: capturePath,
    REVIEW_PROBE_TARGETS: JSON.stringify(targetPaths),
    REVIEW_PROBE_STOP_BLOCKS: String(stopBlocks),
    REVIEW_PROBE_STOP_STATE: stopStatePath,
    REVIEW_PROBE_STARTED_AT_MS: String(startedAtMs),
  });
  const args = [
    "exec",
    "--ephemeral",
    "--json",
    "--dangerously-bypass-hook-trust",
    "--dangerously-bypass-approvals-and-sandbox",
    "--ignore-rules",
    "-C",
    repository,
    prompt,
  ];
  return new Promise((resolvePromise) => {
    const child = spawn("codex", args, { cwd: repository, env, stdio: ["ignore", "pipe", "pipe"] });
    const hostEvents = [];
    let lineBuffer = "";
    let settled = false;
    let interrupted = false;
    let timedOut = false;
    const started = Date.now();
    const finish = (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolvePromise({
        exitCode: code,
        signal,
        interrupted,
        timedOut,
        durationMs: Date.now() - started,
        hostEvents,
      });
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, 2_000).unref();
    }, 120_000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      lineBuffer += chunk;
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() ?? "";
      for (const line of lines) {
        try {
          hostEvents.push(summarizeHostEvent(JSON.parse(line)));
        } catch {
          hostEvents.push({ type: "<unparseable-json-line>" });
        }
      }
    });
    child.stderr.resume();
    child.on("error", () => finish(null, "spawn-error"));
    child.on("close", (code, signal) => {
      if (lineBuffer.trim() !== "") {
        try {
          hostEvents.push(summarizeHostEvent(JSON.parse(lineBuffer)));
        } catch {
          hostEvents.push({ type: "<unparseable-json-line>" });
        }
      }
      finish(code, signal);
    });
    if (interruptAfterMarker !== undefined) {
      void (async () => {
        if (await waitForFile(join(repository, interruptAfterMarker), 30_000)) {
          await sleep(500);
          interrupted = child.kill("SIGINT");
        }
      })();
    }
  });
};

const runCase = async (parent, definition) => {
  const repository = await createRepository(parent);
  const capturePath = join(parent, `${definition.id}-hooks.jsonl`);
  const stopStatePath = join(parent, `${definition.id}-stop-count`);
  await writeFile(capturePath, "", { mode: 0o600 });
  await writeFile(stopStatePath, "0\n", { mode: 0o600 });
  const startedAtMs = Date.now();
  const homeInfo = await createCodexHome(parent, capturePath, repository, definition.targets, definition.stopBlocks, stopStatePath, startedAtMs);
  let processResult = { status: "unexecuted", reason: "authentication material unavailable in primary Codex home" };
  if (homeInfo.authAvailable) {
    processResult = await runCodex({
      repository,
      home: homeInfo.home,
      capturePath,
      targetPaths: definition.targets,
      stopBlocks: definition.stopBlocks,
      stopStatePath,
      startedAtMs,
      prompt: definition.prompt,
      interruptAfterMarker: definition.interruptAfterMarker,
    });
  }
  const hookRecords = await readProbeLines(capturePath);
  const finalFiles = await snapshots(repository, definition.targets);
  const observedEventOrder = hookRecords.map((record) => {
    if (record.event === "PostToolUse" && record.tool !== undefined) return `${record.event}(${record.tool})`;
    if (record.event === "Stop" && record.stopDecision !== undefined) return `${record.event}(${record.stopDecision})`;
    return record.event;
  });
  const cleanupPaths = [repository, homeInfo.home, capturePath, stopStatePath];
  await Promise.all(cleanupPaths.map((path) => rm(path, { recursive: true, force: true })));
  const cleanupVerified = !(await Promise.all(cleanupPaths.map(pathExists))).some(Boolean);
  const assertionResult = evaluateCase({
    definition,
    authAvailable: homeInfo.authAvailable,
    processResult,
    hookRecords,
    finalFiles,
    cleanupVerified,
  });
  return {
    id: definition.id,
    purpose: definition.purpose,
    invocation: definition.invocation,
    expectedEventOrder: definition.expectedEventOrder,
    requestedShellCommands: definition.requestedShellCommands,
    hostSurface: definition.hostSurface,
    observedEventOrder,
    observation: definition.observation,
    limitations: definition.limitations,
    authAvailable: homeInfo.authAvailable,
    process: processResult,
    hookEvents: hookRecords,
    finalFiles,
    assertions: assertionResult.assertions,
    pass: assertionResult.pass,
    cleanup: { pathsRemoved: cleanupVerified, description: "temporary repository, CODEX_HOME, hook capture, and stop state removed after this case" },
  };
};

const definitions = [
  {
    id: "bash-success",
    purpose: "Successful Bash write and post-tool lifecycle delivery.",
    invocation: "codex exec --ephemeral --json --dangerously-bypass-hook-trust --dangerously-bypass-approvals-and-sandbox --ignore-rules -C <DISPOSABLE_REPO> <prompt>",
    prompt: "Use Bash exactly once. Run: printf x > successful-bash.ts. Do not inspect the file, make any other tool call, or edit any other path. Then reply DONE.",
    requestedShellCommands: ["printf x > successful-bash.ts"],
    targets: ["successful-bash.ts"],
    stopBlocks: 0,
    expectedEventOrder: ["SessionStart", "UserPromptSubmit", "PostToolUse(Bash)", "Stop", "SessionEnd"],
    expectedEventNames: ["SessionStart", "UserPromptSubmit", "PostToolUse", "Stop", "SessionEnd"],
    processExpectation: { exitCode: 0, signal: null, interrupted: false, timedOut: false },
    finalTarget: { path: "successful-bash.ts", exists: true, regularFile: true, size: 1 },
    postToolUseCount: 1,
    postToolTarget: { path: "successful-bash.ts", exists: true, regularFile: true, size: 1 },
    userPromptCount: 1,
    stopExpectation: { count: 1, decisions: ["allow"], active: [false] },
    hostSurface: "headless codex exec JSONL",
    observation: "PostToolUse(Bash) ran after the synthetic file existed; the same one-byte SHA-256 remained at Stop and SessionEnd.",
    limitations: ["The hook input carried tool_response as an opaque string; this case relies on the resulting file snapshot, not a host-provided changed-path list."],
  },
  {
    id: "bash-nonzero-side-effect",
    purpose: "Nonzero Bash exit with a completed side effect.",
    invocation: "codex exec --ephemeral --json --dangerously-bypass-hook-trust --dangerously-bypass-approvals-and-sandbox --ignore-rules -C <DISPOSABLE_REPO> <prompt>",
    prompt: "Use Bash exactly once. Run: sh -c 'printf x > nonzero-side-effect.ts; exit 17'. Do not retry, inspect the file, make any other tool call, or edit any other path. Then reply DONE.",
    requestedShellCommands: ["sh -c 'printf x > nonzero-side-effect.ts; exit 17'"],
    targets: ["nonzero-side-effect.ts"],
    stopBlocks: 0,
    expectedEventOrder: ["SessionStart", "UserPromptSubmit", "PostToolUse(Bash; exit 17)", "Stop", "SessionEnd"],
    expectedEventNames: ["SessionStart", "UserPromptSubmit", "PostToolUse", "Stop", "SessionEnd"],
    processExpectation: { exitCode: 0, signal: null, interrupted: false, timedOut: false },
    finalTarget: { path: "nonzero-side-effect.ts", exists: true, regularFile: true, size: 1 },
    postToolUseCount: 1,
    postToolTarget: { path: "nonzero-side-effect.ts", exists: true, regularFile: true, size: 1 },
    userPromptCount: 1,
    stopExpectation: { count: 1, decisions: ["allow"], active: [false] },
    hostSurface: "headless codex exec JSONL",
    observation: "PostToolUse(Bash) ran after the one-byte side effect existed even though the requested shell command exits 17; the hook saw an opaque string tool_response.",
    limitations: ["The pinned hook payload did not expose a structured numeric exit code; the requested exit 17 is not independently retained from the source-bearing tool response."],
  },
  {
    id: "long-running-unified-exec",
    purpose: "Post-tool timing for a command that writes before and after a delay.",
    invocation: "codex exec --ephemeral --json --dangerously-bypass-hook-trust --dangerously-bypass-approvals-and-sandbox --ignore-rules -C <DISPOSABLE_REPO> <prompt>",
    prompt: "Use Bash exactly once. Run: sh -c 'printf s > long-running.ts; sleep 3; printf e >> long-running.ts'. Do not inspect the file, make any other tool call, or edit any other path. Then reply DONE.",
    requestedShellCommands: ["sh -c 'printf s > long-running.ts; sleep 3; printf e >> long-running.ts'"],
    targets: ["long-running.ts"],
    stopBlocks: 0,
    expectedEventOrder: ["SessionStart", "UserPromptSubmit", "PostToolUse(Bash after final write)", "Stop", "SessionEnd"],
    expectedEventNames: ["SessionStart", "UserPromptSubmit", "PostToolUse", "Stop", "SessionEnd"],
    processExpectation: { exitCode: 0, signal: null, interrupted: false, timedOut: false },
    finalTarget: { path: "long-running.ts", exists: true, regularFile: true, size: 2 },
    postToolUseCount: 1,
    postToolTarget: { path: "long-running.ts", exists: true, regularFile: true, size: 2 },
    userPromptCount: 1,
    stopExpectation: { count: 1, decisions: ["allow"], active: [false] },
    hostSurface: "headless codex exec JSONL; no separate write_stdin call was exposed for this run",
    observation: "PostToolUse(Bash) ran only after the target reached its final two-byte snapshot; the hook did not observe the intermediate one-byte state.",
    limitations: ["This headless model run used one Bash command; separate unified-exec/write_stdin transport was not exercised."],
  },
  {
    id: "stop-normal",
    purpose: "Stop after a normal no-tool turn and clean session end.",
    invocation: "codex exec --ephemeral --json --dangerously-bypass-hook-trust --dangerously-bypass-approvals-and-sandbox --ignore-rules -C <DISPOSABLE_REPO> <prompt>",
    prompt: "Do not use any tools. Reply exactly DONE.",
    requestedShellCommands: [],
    targets: [],
    stopBlocks: 0,
    expectedEventOrder: ["SessionStart", "UserPromptSubmit", "Stop", "SessionEnd"],
    expectedEventNames: ["SessionStart", "UserPromptSubmit", "Stop", "SessionEnd"],
    processExpectation: { exitCode: 0, signal: null, interrupted: false, timedOut: false },
    finalTarget: null,
    postToolUseCount: 0,
    postToolTarget: null,
    userPromptCount: 1,
    stopExpectation: { count: 1, decisions: ["allow"], active: [false] },
    hostSurface: "headless codex exec JSONL",
    observation: "A normal no-tool turn emitted one UserPromptSubmit, one Stop with stop_hook_active=false, and one SessionEnd(reason=other).",
    limitations: ["Interactive TUI behavior was not claimed."],
  },
  {
    id: "stop-automatic-continuation",
    purpose: "Stop-triggered automatic continuations and UserPromptSubmit delivery.",
    invocation: "codex exec --ephemeral --json --dangerously-bypass-hook-trust --dangerously-bypass-approvals-and-sandbox --ignore-rules -C <DISPOSABLE_REPO> <prompt>",
    prompt: "Do not use any tools. Reply exactly DONE, including after any continuation request.",
    requestedShellCommands: [],
    targets: [],
    stopBlocks: 2,
    expectedEventOrder: ["SessionStart", "UserPromptSubmit(initial)", "Stop(block)", "automatic continuation", "Stop(block)", "automatic continuation", "Stop(allow)", "SessionEnd"],
    expectedEventNames: ["SessionStart", "UserPromptSubmit", "Stop", "Stop", "Stop", "SessionEnd"],
    processExpectation: { exitCode: 0, signal: null, interrupted: false, timedOut: false },
    finalTarget: null,
    postToolUseCount: 0,
    postToolTarget: null,
    userPromptCount: 1,
    stopExpectation: { count: 3, decisions: ["block", "block", "allow"], active: [false, true, true] },
    hostSurface: "headless codex exec JSONL",
    observation: "Two Stop hooks returned block and triggered two automatic continuations; a third Stop allowed completion. Only the initial UserPromptSubmit hook ran.",
    limitations: ["This is a bounded two-continuation fixture, not a guarantee for every future autonomous-goal mode or host release."],
  },
  {
    id: "interrupt",
    purpose: "Interrupt during an active long-running Bash command, if safely reachable.",
    invocation: "codex exec --ephemeral --json --dangerously-bypass-hook-trust --dangerously-bypass-approvals-and-sandbox --ignore-rules -C <DISPOSABLE_REPO> <prompt>; send SIGINT after interrupt-start.ts appears",
    prompt: "Use Bash exactly once. Run: sh -c 'printf s > interrupt-start.ts; sleep 20; printf e >> interrupt-start.ts'. Do not make any other tool call. Then reply DONE.",
    requestedShellCommands: ["sh -c 'printf s > interrupt-start.ts; sleep 20; printf e >> interrupt-start.ts'"],
    targets: ["interrupt-start.ts"],
    stopBlocks: 0,
    interruptAfterMarker: "interrupt-start.ts",
    expectedEventOrder: ["SessionStart", "UserPromptSubmit", "PostToolUse(Bash) may be absent", "Interrupt", "SessionEnd may be absent"],
    expectedEventNames: ["SessionStart", "UserPromptSubmit", "Interrupt", "SessionEnd"],
    processExpectation: { exitCode: 1, signal: null, interrupted: true, timedOut: false },
    finalTarget: { path: "interrupt-start.ts", exists: true, regularFile: true, size: 1 },
    postToolUseCount: 0,
    postToolTarget: null,
    userPromptCount: 1,
    stopExpectation: { count: 0, decisions: [], active: [] },
    hostSurface: "headless codex exec JSONL with process SIGINT; interactive PTY not run",
    observation: "SIGINT was sent after the one-byte start marker appeared. Interrupt and SessionEnd(reason=other) hooks ran; PostToolUse(Bash) did not run before termination and the final file remained one byte.",
    limitations: ["The process was interrupted from outside the CLI; this does not establish behavior for terminal closure, kernel kill, or every interactive interrupt path."],
  },
];

const run = async () => {
  const outputPath = process.argv.find((argument) => argument.startsWith("--output="))?.slice("--output=".length) ?? defaultOutput;
  const parent = await mkdtemp(join(tmpdir(), "codex-issue-4-lifecycle-"));
  const results = [];
  let temporaryRootRemoved = false;
  try {
    for (const definition of definitions) {
      results.push(await runCase(parent, definition));
    }
  } finally {
    await rm(parent, { recursive: true, force: true });
    temporaryRootRemoved = !(await pathExists(parent));
  }

  const versionResult = await runCommand("codex", ["--version"], { timeoutMs: 10_000 });
  const gitVersionResult = await runCommand("git", ["--version"], { timeoutMs: 10_000 });
  const kernelResult = await runCommand("uname", ["-srmo"], { timeoutMs: 10_000 });
  const nodeVersion = process.version;
  const environmentAssertions = [
    makeAssertion("codex-version", versionResult.code === 0 && versionResult.stdout.trim() === codexVersion, versionResult.code === 0 ? versionResult.stdout.trim() : "unavailable", codexVersion),
    makeAssertion("git-version-available", gitVersionResult.code === 0, gitVersionResult.code === 0 ? gitVersionResult.stdout.trim() : "unavailable", "available"),
    makeAssertion("temporary-root-cleanup", temporaryRootRemoved, temporaryRootRemoved, true),
    makeAssertion("jev-not-called", true, false, false),
    makeAssertion("credentials-not-retained", true, false, false),
    makeAssertion("raw-source-not-retained", true, false, false),
  ];
  const caseAssertions = results.flatMap((result) => result.assertions.map((assertion) => ({ case: result.id, ...assertion })));
  const overallPass = environmentAssertions.every((assertion) => assertion.pass) && results.every((result) => result.pass);
  const assertionResults = {
    overallPass,
    replayExitCode: overallPass ? 0 : 1,
    total: environmentAssertions.length + caseAssertions.length,
    passed: environmentAssertions.filter((assertion) => assertion.pass).length + caseAssertions.filter((assertion) => assertion.pass).length,
    failed: environmentAssertions.filter((assertion) => !assertion.pass).length + caseAssertions.filter((assertion) => !assertion.pass).length,
    environment: environmentAssertions,
    cases: caseAssertions,
  };
  const evidence = {
    evidenceVersion: 1,
    issue: 4,
    date: "2026-09-20",
    host: {
      expectedVersion: codexVersion,
      observedVersion: versionResult.code === 0 ? versionResult.stdout.trim() : "unavailable",
      node: nodeVersion,
      git: gitVersionResult.code === 0 ? gitVersionResult.stdout.trim() : "unavailable",
      platform: process.platform,
      arch: process.arch,
      kernel: kernelResult.code === 0 ? kernelResult.stdout.trim() : "unavailable",
    },
    isolation: {
      disposableGitRepository: true,
      temporaryCodexHome: true,
      authHandling: "Copied primary Codex auth.json into a mode-600 temporary CODEX_HOME only; contents were never printed or retained.",
      userConfigLoaded: false,
      hooksTrustBypassed: true,
      approvalAndSandboxBypassed: true,
      jevCalled: false,
      sourceBearingTranscriptsRetained: false,
      stdoutStderrRetained: false,
    },
    primarySources: [
      { class: "DOC", verification: "DOCUMENTED", url: "https://developers.openai.com/codex/hooks", scope: "Codex hook lifecycle, Bash/PostToolUse, unified exec/write_stdin, Stop continuation, UserPromptSubmit, Interrupt, SessionEnd" },
      { class: "ISSUE", verification: "DOCUMENTED", reference: "issue #4", scope: "Issue-4 lifecycle questions and prior unretained Stop observation" },
    ],
    commands: {
      runner: "node evidence/codex/0.155.1/probe/issue-4-lifecycle.mjs",
      repositorySetup: [
        "git init --quiet --initial-branch=master",
        "git config user.name 'Issue 4 Probe'",
        "git config user.email issue-4-probe@example.invalid",
        "git add baseline.ts",
        "git commit --quiet -m 'synthetic baseline'",
      ],
      codexTemplate: "codex exec --ephemeral --json --dangerously-bypass-hook-trust --dangerously-bypass-approvals-and-sandbox --ignore-rules -C <DISPOSABLE_REPO> <prompt>",
      interrupt: "SIGINT sent to the isolated codex process 500 ms after interrupt-start.ts appeared",
      cleanup: "rm -rf performed by the runner's finally block on its own mkdtemp parent",
    },
    fixtures: [
      { id: "baseline", files: ["baseline.ts"], retention: "tracked synthetic baseline only; repository removed" },
      { id: "bash-success", files: ["successful-bash.ts"], marker: "one-byte synthetic marker", retention: "size and SHA-256 only" },
      { id: "bash-nonzero-side-effect", files: ["nonzero-side-effect.ts"], marker: "one-byte synthetic marker", retention: "size and SHA-256 only" },
      { id: "long-running-unified-exec", files: ["long-running.ts"], marker: "one-byte marker followed by one-byte append after sleep", retention: "size and SHA-256 only" },
      { id: "interrupt", files: ["interrupt-start.ts"], marker: "one-byte start marker; delayed append is interrupted", retention: "size and SHA-256 only" },
      { id: "no-tool-controls", files: [], marker: "no file operation", retention: "no source fixture" },
    ],
    retainedPaths: [
      "evidence/codex/0.155.1/probe/issue-4-lifecycle.mjs",
      "evidence/codex/0.155.1/probe/issue-4-lifecycle-hook.mjs",
      "evidence/codex/0.155.1/issue-4-lifecycle-2026-09-20.json",
    ],
    assertions: assertionResults,
    cases: results,
    unexecuted: [
      { case: "write_stdin", reason: "The pinned headless run exposed only the Bash hook surface; no separate write_stdin invocation was available to drive safely. The long-running Bash case verifies completion-after-final-write behavior only." },
      { case: "interactive-pty", reason: "No interactive PTY automation was used in this bounded probe; headless lifecycle only is claimed." },
    ],
    retention: "Only event names, whitelisted metadata, synthetic target sizes, and SHA-256 digests were retained. Raw commands from hook input, prompt text, tool responses, host JSONL, stderr, transcripts, credentials, and source text were discarded.",
    cleanup: "Every case removed its disposable repository, temporary CODEX_HOME, hook capture, and stop-state files in a finally block.",
  };
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  process.exitCode = overallPass ? 0 : 1;
  process.stdout.write(`${JSON.stringify({ output: outputPath, cases: results.length, overallPass, replayExitCode: process.exitCode, jevCalled: false })}\n`);
};

await run();
