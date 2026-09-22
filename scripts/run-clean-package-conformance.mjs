import { spawn } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const executeRealCodex = process.argv.includes("--real-codex");
const writeEvidence = process.argv.includes("--write-evidence");
const outputPath = join(root, `evidence/package/clean-${process.platform}-node-24.20.0-${process.arch}.json`);
const run = (command, args, options = {}) => new Promise((resolveRun, reject) => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  const timer = setTimeout(() => child.kill("SIGTERM"), options.timeoutMs ?? 120_000);
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.once("error", reject);
  child.once("close", (code, signal) => {
    clearTimeout(timer);
    resolveRun({ code, signal, stdout, stderr });
  });
  if (options.input !== undefined) child.stdin.end(options.input);
});
const mustRun = async (command, args, options = {}) => {
  const result = await run(command, args, options);
  if (result.code !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.code}): ${result.stderr || result.stdout}`);
  return result;
};
const parseJson = (text, label) => {
  try { return JSON.parse(text); } catch { throw new Error(`${label} did not return JSON`); }
};
const jsonLines = (text) => text.split("\n").filter(Boolean).map((line) => parseJson(line, "JSONL record"));
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

class TerminalScreen {
  constructor(rows, columns) {
    this.rows = rows;
    this.columns = columns;
    this.cells = Array.from({ length: rows }, () => Array(columns).fill(" "));
    this.row = 0;
    this.column = 0;
    this.saved = [0, 0];
    this.pending = "";
  }

  text() {
    return this.cells.map((row) => row.join("").trimEnd()).join("\n");
  }

  feed(chunk) {
    const input = this.pending + chunk;
    this.pending = "";
    let offset = 0;
    while (offset < input.length) {
      const character = input[offset];
      if (character === "\u001b") {
        if (offset + 1 >= input.length) {
          this.pending = input.slice(offset);
          break;
        }
        const kind = input[offset + 1];
        if (kind === "[") {
          let end = offset + 2;
          while (end < input.length && !/[@-~]/.test(input[end])) end += 1;
          if (end === input.length) {
            this.pending = input.slice(offset);
            break;
          }
          this.#csi(input.slice(offset + 2, end), input[end]);
          offset = end + 1;
          continue;
        }
        if (kind === "]") {
          let end = offset + 2;
          while (end < input.length && input[end] !== "\u0007" && !(input[end] === "\u001b" && input[end + 1] === "\\")) end += 1;
          if (end === input.length) {
            this.pending = input.slice(offset);
            break;
          }
          offset = input[end] === "\u0007" ? end + 1 : end + 2;
          continue;
        }
        if (kind === "7") this.saved = [this.row, this.column];
        else if (kind === "8") [this.row, this.column] = this.saved;
        else if (kind === "D") this.#lineFeed();
        else if (kind === "E") { this.column = 0; this.#lineFeed(); }
        offset += 2;
        continue;
      }
      if (character === "\r") this.column = 0;
      else if (character === "\n") this.#lineFeed();
      else if (character === "\b") this.column = Math.max(0, this.column - 1);
      else if (character === "\t") this.column = Math.min(this.columns - 1, (Math.floor(this.column / 8) + 1) * 8);
      else if (character >= " " && character !== "\u007f") this.#write(character);
      offset += 1;
    }
  }

  #blankRow() {
    return Array(this.columns).fill(" ");
  }

  #lineFeed() {
    if (this.row === this.rows - 1) {
      this.cells.shift();
      this.cells.push(this.#blankRow());
    } else this.row += 1;
  }

  #write(character) {
    this.cells[this.row][this.column] = character;
    if (this.column === this.columns - 1) {
      this.column = 0;
      this.#lineFeed();
    } else this.column += 1;
  }

  #csi(rawParameters, final) {
    const parameters = rawParameters.replace(/^[?!>]/, "").split(";").map((value) => value === "" ? 0 : Number(value));
    const first = parameters[0] || 1;
    if (final === "H" || final === "f") {
      this.row = Math.max(0, Math.min(this.rows - 1, (parameters[0] || 1) - 1));
      this.column = Math.max(0, Math.min(this.columns - 1, (parameters[1] || 1) - 1));
    } else if (final === "A") this.row = Math.max(0, this.row - first);
    else if (final === "B") this.row = Math.min(this.rows - 1, this.row + first);
    else if (final === "C") this.column = Math.min(this.columns - 1, this.column + first);
    else if (final === "D") this.column = Math.max(0, this.column - first);
    else if (final === "E") { this.row = Math.min(this.rows - 1, this.row + first); this.column = 0; }
    else if (final === "F") { this.row = Math.max(0, this.row - first); this.column = 0; }
    else if (final === "G") this.column = Math.max(0, Math.min(this.columns - 1, first - 1));
    else if (final === "d") this.row = Math.max(0, Math.min(this.rows - 1, first - 1));
    else if (final === "J") this.#eraseDisplay(parameters[0] || 0);
    else if (final === "K") this.#eraseLine(parameters[0] || 0);
    else if (final === "X") this.cells[this.row].fill(" ", this.column, Math.min(this.columns, this.column + first));
    else if (final === "S") {
      for (let count = 0; count < first; count += 1) {
        this.cells.shift();
        this.cells.push(this.#blankRow());
      }
    } else if (final === "T") {
      for (let count = 0; count < first; count += 1) {
        this.cells.pop();
        this.cells.unshift(this.#blankRow());
      }
    } else if (final === "s") this.saved = [this.row, this.column];
    else if (final === "u") [this.row, this.column] = this.saved;
  }

  #eraseDisplay(mode) {
    if (mode === 2 || mode === 3) this.cells = Array.from({ length: this.rows }, () => this.#blankRow());
    else if (mode === 0) {
      this.cells[this.row].fill(" ", this.column);
      for (let row = this.row + 1; row < this.rows; row += 1) this.cells[row].fill(" ");
    } else if (mode === 1) {
      for (let row = 0; row < this.row; row += 1) this.cells[row].fill(" ");
      this.cells[this.row].fill(" ", 0, this.column + 1);
    }
  }

  #eraseLine(mode) {
    if (mode === 0) this.cells[this.row].fill(" ", this.column);
    else if (mode === 1) this.cells[this.row].fill(" ", 0, this.column + 1);
    else if (mode === 2) this.cells[this.row].fill(" ");
  }
}

const establishNativeTrust = (codexHome, repository, env) => new Promise((resolveTrust, rejectTrust) => {
  const command = `stty rows 24 cols 80; exec ${quote("codex")} --no-alt-screen -C ${quote(repository)}`;
  const scriptArguments = process.platform === "darwin"
    ? ["-q", "/dev/null", "/bin/sh", "-c", command]
    : ["-qefc", command, "/dev/null"];
  const child = spawn("script", scriptArguments, {
    cwd: repository,
    env: { ...env, CODEX_HOME: codexHome, TERM: "xterm-256color" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const screen = new TerminalScreen(24, 80);
  let repositorySelected = false;
  let hookSelected = false;
  let hookChoiceSelected = false;
  let repositoryPersisted = false;
  let hookPersisted = false;
  let trusted = false;
  let terminalInitialized = false;
  let terminalProbe = "";
  const trustPoll = setInterval(() => {
    void readFile(join(codexHome, "config.toml"), "utf8").then((config) => {
      repositoryPersisted = config.includes('trust_level = "trusted"');
      hookPersisted = config.includes("trusted_hash");
      if (trusted || !repositoryPersisted || !hookPersisted) return;
      trusted = true;
      child.kill("SIGTERM");
    }).catch(() => undefined);
  }, 100);
  const timer = setTimeout(() => {
    child.kill("SIGTERM");
    rejectTrust(new Error(`Codex native repository/hook trust review timed out (repository prompt: ${repositorySelected ? "accepted" : "not observed"}; repository trust: ${repositoryPersisted ? "persisted" : "missing"}; hook prompt: ${hookSelected ? "observed" : "not observed"}; trust-all choice: ${hookChoiceSelected ? "confirmed" : "not confirmed"}; hook trust: ${hookPersisted ? "persisted" : "missing"})`));
  }, 30_000);
  const observe = (chunk) => {
    screen.feed(chunk);
    terminalProbe = `${terminalProbe}${chunk}`.slice(-32);
    if (!terminalInitialized && terminalProbe.includes("\u001b[6n")) {
      terminalInitialized = true;
      child.stdin.write("\u001b[24;80R\u001b]10;rgb:ffff/ffff/ffff\u001b\\\u001b]11;rgb:0000/0000/0000\u001b\\\u001b[?1;2c\u001b[?0u");
    }
    const rendered = screen.text();
    if (!repositorySelected && rendered.includes("Do you trust the contents of this directory")) {
      repositorySelected = true;
      setTimeout(() => child.stdin.write("\r"), 100);
    }
    if (!hookSelected && rendered.includes("Hooks need review")) {
      hookSelected = true;
      // Trust is selection 2 and requires a separate explicit confirmation.
      setTimeout(() => child.stdin.write("2"), 100);
    }
    if (hookSelected && !hookChoiceSelected && rendered.includes("› 2. Trust all and continue")) {
      hookChoiceSelected = true;
      setTimeout(() => child.stdin.write("\r"), 100);
    }
  };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", observe);
  child.once("error", (cause) => {
    clearTimeout(timer);
    clearInterval(trustPoll);
    rejectTrust(cause);
  });
  child.once("close", () => {
    clearTimeout(timer);
    clearInterval(trustPoll);
    if (!trusted) rejectTrust(new Error("Codex native repository/hook trust review did not persist trust"));
    else resolveTrust();
  });
});

const temporary = await mkdtemp(join(tmpdir(), "review-package-conformance-"));
let residentPid;
try {
  const artifacts = join(temporary, "artifacts");
  const installation = join(temporary, "installation");
  const repository = join(temporary, "repository");
  const state = join(temporary, "state", "consent");
  const runtime = join(temporary, "state", "resident");
  const calls = join(temporary, "state", "controlled-calls.txt");
  const outcomes = join(temporary, "state", "controlled-outcomes.jsonl");
  await mkdir(artifacts, { recursive: true });
  await mkdir(installation, { recursive: true });
  await mkdir(repository, { recursive: true });
  await mustRun("npm", ["pack", "--pack-destination", artifacts], { cwd: root });
  const artifactEntries = await (await import("node:fs/promises")).readdir(artifacts);
  const artifactName = artifactEntries.find((entry) => entry.endsWith(".tgz"));
  if (artifactName === undefined) throw new Error("npm pack did not produce a tarball");
  const tarball = join(artifacts, artifactName);
  await mustRun("npm", ["install", "--prefer-offline", "--omit=dev", "--prefix", installation, tarball], { cwd: temporary, timeoutMs: 120_000 });
  const packageDirectory = join(installation, "node_modules", "realtime-review-prototype");
  const binDirectory = join(installation, "node_modules", ".bin");
  const cli = join(binDirectory, "review-tool");
  const parser = join(binDirectory, "review-tool-parser");
  const doctor = join(binDirectory, "review-tool-doctor");
  const doctorSource = join(packageDirectory, "dist", "package-doctor.js");
  const installedManifest = parseJson(await readFile(join(packageDirectory, "package.json"), "utf8"), "installed manifest");
  // npm can return ELSPROBLEMS for tree-sitter's optional peer layout even
  // when the exact production dependencies are installed and loadable. The
  // JSON tree remains authoritative for the dev-dependency exclusion below;
  // parser loading is checked through the packaged entry point afterward.
  const productionTree = await run("npm", ["ls", "--all", "--omit=dev", "--json"], { cwd: installation });
  if (productionTree.stdout.trim().length === 0) throw new Error("npm ls did not return a production dependency tree");
  const dependencyTree = parseJson(productionTree.stdout, "production dependency tree");
  for (const forbidden of ["typescript", "vitest", "@types/bun"]) {
    if (dependencyTree.dependencies?.[forbidden] !== undefined) throw new Error(`development dependency installed: ${forbidden}`);
  }

  const doctorRun = await mustRun(doctor, [], { cwd: temporary });
  const doctorResult = parseJson(doctorRun.stdout, "package doctor");
  if (doctorResult.status !== "ready") throw new Error("package doctor did not report ready");
  const missingCommands = await run(process.execPath, [doctorSource], { cwd: temporary, env: { ...process.env, PATH: join(temporary, "missing-path") } });
  const missingCommandDiagnosis = parseJson(missingCommands.stdout, "package doctor missing-command diagnosis");
  if (missingCommands.code !== 1 || !["git"].every((name) => missingCommandDiagnosis.checks.some((check) => check.name === name && check.status === "unsupported" && typeof check.action === "string"))) {
    throw new Error("package doctor did not provide actionable missing-command diagnoses");
  }
  const parserRun = await mustRun(parser, [], {
    cwd: temporary,
    input: JSON.stringify({ path: "fixture.ts", source: "export interface Delivery { id: string; destination: string }" }),
  });
  const parserResult = parseJson(parserRun.stdout, "packaged parser");
  if (parserResult.status !== "analyzed") throw new Error("packaged parser did not analyze the fixture");

  await mustRun("git", ["init", "--quiet", "--initial-branch=master"], { cwd: repository });
  await mustRun("git", ["config", "user.name", "Package Fixture"], { cwd: repository });
  await mustRun("git", ["config", "user.email", "fixture@example.invalid"], { cwd: repository });
  await writeFile(join(repository, "README.md"), "synthetic package fixture\n", { mode: 0o600 });
  await mustRun("git", ["add", "README.md"], { cwd: repository });
  await mustRun("git", ["commit", "--quiet", "-m", "fixture"], { cwd: repository });
  const answers = Object.fromEntries([
    "r1_inferred_case", "r2_meaningless_combinations", "r3_split_correlations",
    "r4_duplicate_encoding", "r5_absence_confusion", "r6_bare_domain_value",
    "r7_name_wider_than_type", "r8_name_claims_resource", "r9_body_reaches_undeclared",
  ].map((id) => [id, { _tag: "Probability", probability: 0.91 }]));
  const env = {
    ...process.env,
    REVIEW_STATE_PATH: state,
    REVIEW_RESIDENT_DIR: runtime,
    REVIEW_CONTROL_JSON: JSON.stringify({ answers, capturePath: calls, outcomePath: outcomes }),
  };
  for (const key of ["OPENAI_API_KEY", "TYPESAFE_API_KEY"]) delete env[key];
  const preview = await mustRun(cli, ["--enable"], {
    cwd: temporary, env, input: JSON.stringify({ version: 1, operation: "enable", cwd: repository }),
  });
  const digest = parseJson(preview.stdout, "consent preview").proposal?.digest;
  if (typeof digest !== "string") throw new Error("consent preview omitted its digest");
  await mustRun(cli, ["--enable-confirm"], {
    cwd: temporary, env, input: JSON.stringify({ version: 1, operation: "enable-confirm", cwd: repository, proposalDigest: digest }),
  });
  const source = "export interface Delivery { id: string; destination: string }\n";
  await writeFile(join(repository, "profile.ts"), source, { mode: 0o600 });
  const addEvent = {
    hook_event_name: "PostToolUse", tool_name: "apply_patch", session_id: "package-session",
    turn_id: "package-turn", tool_use_id: "package-add", cwd: repository,
    tool_input: { command: `*** Begin Patch\n*** Add File: profile.ts\n+${source.trim()}\n*** End Patch` }, tool_response: {},
  };
  await mustRun(cli, ["--codex-hook", "--controlled", "--controlled-writer"], { cwd: temporary, env, input: JSON.stringify(addEvent) });
  let hookOutput = {};
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    const collect = await mustRun(cli, ["--codex-hook", "--controlled", "--controlled-writer"], {
      cwd: temporary, env, input: JSON.stringify({ ...addEvent, tool_name: "Bash", tool_use_id: `package-collect-${attempt}`, tool_input: { command: "printf package-ready" } }),
    });
    hookOutput = parseJson(collect.stdout, "packaged hook output");
    if (hookOutput.hookSpecificOutput?.additionalContext !== undefined) break;
  }
  const submissions = (await readFile(calls, "utf8")).trim().split("\n").filter(Boolean).length;
  if (submissions !== 1) throw new Error(`expected one controlled backend submission, observed ${submissions}`);
  if (hookOutput.hookSpecificOutput?.hookEventName !== "PostToolUse") throw new Error("packaged hook did not return review advice");
  const owner = parseJson(await readFile(join(runtime, "owner.json"), "utf8"), "resident owner");
  residentPid = owner.pid;

  let realCodex = { status: "not-requested" };
  let realCodexFailure;
  if (executeRealCodex) {
    let realCodexStage = "host-version";
    let codexVersion = "unavailable";
    try {
    codexVersion = (await mustRun("codex", ["--version"], { cwd: temporary })).stdout.trim();
    const codexHome = join(temporary, "codex-home");
    await mkdir(codexHome, { mode: 0o700 });
    try {
      if (process.env.CODEX_AUTH_JSON !== undefined) {
        parseJson(process.env.CODEX_AUTH_JSON, "CODEX_AUTH_JSON");
        await writeFile(join(codexHome, "auth.json"), process.env.CODEX_AUTH_JSON, { mode: 0o600 });
      } else {
        await copyFile(join(process.env.HOME ?? "", ".codex", "auth.json"), join(codexHome, "auth.json"));
        await chmod(join(codexHome, "auth.json"), 0o600);
      }
    } catch {
      throw new Error("real Codex fixture requested but isolated host authentication is unavailable; provide CODEX_AUTH_JSON or ~/.codex/auth.json");
    }
    await writeFile(join(codexHome, "config.toml"), "[features]\nhooks = true\n", { mode: 0o600 });
    await writeFile(join(codexHome, "hooks.json"), `${JSON.stringify({ hooks: { PostToolUse: [{ matcher: "^(apply_patch|Bash)$", hooks: [{ type: "command", command: `${quote(cli)} --codex-hook --controlled --controlled-writer`, timeout: 20 }] }] } }, null, 2)}\n`, { mode: 0o600 });
    realCodexStage = "native-repository-and-hook-trust";
    await establishNativeTrust(codexHome, repository, env);
    const trustedConfig = await readFile(join(codexHome, "config.toml"), "utf8");
    if (!trustedConfig.includes('trust_level = "trusted"') || !trustedConfig.includes("[hooks.state.") || !trustedConfig.includes("trusted_hash")) {
      throw new Error("Codex native trust review did not retain repository and exact hook-definition trust");
    }
    const before = submissions;
    const outcomesBefore = jsonLines(await readFile(outcomes, "utf8").catch(() => "")).length;
    const codexEnv = { ...env, CODEX_HOME: codexHome };
    realCodexStage = "host-execution";
    const host = await run("codex", [
      "exec", "--ephemeral", "--json",
      "--dangerously-bypass-approvals-and-sandbox", "--ignore-rules", "-C", repository,
      "Use apply_patch exactly once to add installed.ts containing one exported interface named Installed with fields id:string and destination:string. Then use Bash exactly once to run `printf installed-package-ready`. Do not inspect files or make other tool calls.",
    ], { cwd: repository, env: codexEnv, timeoutMs: 120_000 });
    const after = (await readFile(calls, "utf8")).trim().split("\n").filter(Boolean).length;
    let realHostOutcomes = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      realHostOutcomes = jsonLines(await readFile(outcomes, "utf8").catch(() => "")).slice(outcomesBefore);
      if (realHostOutcomes.some(({ outcome }) => outcome === "completed-findings")) break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
    const completed = realHostOutcomes.filter(({ outcome }) => outcome === "completed-findings");
    const providerSubmissions = after - before;
    realCodex = {
      status: host.code === 0 && providerSubmissions === 1 && completed.length === 1 ? "passed" : "failed",
      codexVersion,
      hostExitCode: host.code,
      hookTrust: {
        status: "persisted-exact-definition",
        flow: "native-interactive-review",
        synchronization: "rendered-screen-state",
        repositoryTrustSeeded: false,
        bypassFlag: false,
      },
      reviewSubmission: {
        status: providerSubmissions === 1 ? "observed" : "failed",
        controlledBackendSubmissions: providerSubmissions,
      },
      reviewCompletion: {
        status: completed.length === 1 ? "completed-findings" : "unproved",
        terminalOutcomes: completed.length,
        correlation: "resident-native-event-identity",
      },
    };
    if (realCodex.status !== "passed") {
      realCodexStage = "terminal-review-assertion";
      throw new Error("real Codex fixture did not satisfy the source-free terminal assertions");
    }
    } catch (cause) {
      realCodexFailure = cause;
      realCodex = {
        status: "failed",
        codexVersion,
        repeatability: "not-established",
        failedAttempt: {
          stage: realCodexStage,
          sanitized: true,
          repositoryTrustSeeded: false,
          bypassFlag: false,
        },
      };
    }
  }

  const evidence = {
    schemaVersion: 1,
    recordedAt: new Date().toISOString(),
    package: { name: installedManifest.name, version: installedManifest.version, artifact: basename(tarball) },
    environment: { node: process.version, operatingSystem: process.platform, architecture: process.arch },
    isolation: { temporaryInstallation: true, developmentDependencies: false, checkoutPathUsedAtRuntime: false, retainedSyntheticSource: false },
    entryPoints: { cli: "passed", parser: "passed", resident: "passed", hook: "passed" },
    review: { backend: "controlled-offline", submissions, adviceReturned: true },
    realCodex,
    transientPackageDownloadPerEdit: false,
    verdict: executeRealCodex
      ? realCodex.status === "passed" ? "clean-package-and-real-host-passed" : "clean-package-passed-real-host-failed"
      : "clean-package-passed-real-host-not-requested",
  };
  if (writeEvidence) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  }
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  if (realCodexFailure !== undefined) throw realCodexFailure;
} finally {
  if (typeof residentPid === "number") {
    try { process.kill(residentPid, "SIGTERM"); } catch {}
  }
  await rm(temporary, { recursive: true, force: true });
}
