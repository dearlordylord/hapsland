import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, chmod, copyFile, cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDeclaration = JSON.parse(await readFile(join(root, "package-runtime.json"), "utf8"));
const executeRealCodex = process.argv.includes("--real-codex");
const writeEvidence = process.argv.includes("--write-evidence");
const registryArtifact = process.argv.includes("--registry-artifact");
const expectedSha256 = process.argv.find((argument) => argument.startsWith("--expected-sha256="))?.slice("--expected-sha256=".length);
if (registryArtifact && !/^[0-9a-f]{64}$/.test(expectedSha256 ?? "")) {
  throw new Error("registry conformance requires --expected-sha256=REVIEWED_ARCHIVE_SHA256");
}
const exerciseSecretService = !process.argv.includes("--skip-credential-lifecycle") && (process.argv.includes("--secret-service") || process.platform === "darwin");
const exerciseCredentialFixture = process.argv.includes("--credential-fixture");
const exerciseCredentialLifecycle = exerciseSecretService || exerciseCredentialFixture;
if (process.version !== `v${runtimeDeclaration.runtime.version}`) {
  throw new Error(`package conformance requires Node v${runtimeDeclaration.runtime.version}; found ${process.version}. Select the pinned Node version before running this command.`);
}
let selectedCodexVersion;
if (executeRealCodex) {
  const profile = runtimeDeclaration.profiles.find((item) =>
    item.operatingSystem === process.platform && item.architecture === process.arch);
  if (profile === undefined) throw new Error(`authenticated real Codex validation has no target profile for ${process.platform}/${process.arch}`);
  const result = await new Promise((resolveRun, reject) => {
    const child = spawn("codex", ["--version"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolveRun({ code, version: stdout.trim() }));
  });
  const compatible = process.platform === "linux" ? ["0.155.1"] : ["0.156.0"];
  selectedCodexVersion = /^codex-cli (\d+\.\d+\.\d+)$/.exec(result.version)?.[1];
  if (result.code !== 0 || !compatible.includes(selectedCodexVersion)) {
    throw new Error(`authenticated real Codex validation requires ${compatible.map((version) => `codex-cli ${version}`).join(" or ")}; found ${result.version || "unavailable"}. Select a declared Codex CLI version before running this command.`);
  }
}
const outputPath = join(root, `evidence/package/clean-${process.platform}-node-24.20.0-${process.arch}${executeRealCodex ? `-real-codex-${selectedCodexVersion}` : ""}.json`);
const run = (command, args, options = {}) => new Promise((resolveRun, reject) => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    shell: options.shell ?? false,
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
  if (result.code !== 0) {
    const output = [result.stdout, result.stderr].filter((value) => value.trim().length > 0).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed (${result.code}):${output.length > 0 ? `\n${output}` : " no command output"}`);
  }
  return result;
};
const parseJson = (text, label) => {
  try { return JSON.parse(text); } catch { throw new Error(`${label} did not return JSON`); }
};
const jsonLines = (text) => text.split("\n").filter(Boolean).map((line) => parseJson(line, "JSONL record"));
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const progress = (stage) => process.stderr.write(`[package-conformance] ${stage}\n`);
const snapshotJsonDirectory = async (path) => {
  const names = (await readdir(path)).filter((name) => name.endsWith(".json")).sort();
  return Promise.all(names.map(async (name) => ({ name, content: await readFile(join(path, name), "utf8") })));
};
const readActivityMarkers = async (path) => {
  const directories = await readdir(path, { withFileTypes: true }).catch(() => []);
  const records = [];
  for (const directory of directories.filter((entry) => entry.isDirectory())) {
    const files = await readdir(join(path, directory.name)).catch(() => []);
    for (const file of files.filter((name) => name.endsWith(".json"))) {
      try { records.push(parseJson(await readFile(join(path, directory.name, file), "utf8"), "activity marker")); }
      catch { /* Ignore partial or malformed source-free activity records. */ }
    }
  }
  return records;
};

const installLocalPackageVariant = async ({
  sourcePackage,
  temporary,
  version,
  residentProtocol,
}) => {
  const variantRoot = join(temporary, `package-${version}`);
  const artifacts = join(variantRoot, "artifacts");
  const installation = join(variantRoot, "installation");
  const packageSource = join(variantRoot, "source");
  await mkdir(artifacts, { recursive: true });
  await mkdir(installation, { recursive: true });
  await cp(sourcePackage, packageSource, { recursive: true });
  const manifest = parseJson(await readFile(join(packageSource, "package.json"), "utf8"), "variant manifest");
  await writeFile(join(packageSource, "package.json"), `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);
  const runtime = parseJson(await readFile(join(packageSource, "package-runtime.json"), "utf8"), "variant runtime declaration");
  await writeFile(join(packageSource, "package-runtime.json"), `${JSON.stringify({ ...runtime, residentProtocol }, null, 2)}\n`);
  // This is a repack of an installed artifact, which intentionally lacks the
  // TypeScript build inputs. The primary source package below runs prepack.
  await mustRun("npm", ["pack", "--ignore-scripts=true", "--pack-destination", artifacts], { cwd: packageSource });
  const artifactName = (await readdir(artifacts)).find((entry) => entry.endsWith(".tgz"));
  if (artifactName === undefined) throw new Error(`npm pack did not produce the ${version} tarball`);
  const tarball = join(artifacts, artifactName);
  await mustRun("npm", ["install", "--global=false", "--legacy-peer-deps", "--ignore-scripts=true", "--prefer-offline", "--omit=dev", "--bin-links=true", "--prefix", installation, tarball], {
    cwd: temporary,
    timeoutMs: 120_000,
  });
  return {
    version,
    residentProtocol,
    tarball,
    cli: join(installation, "node_modules", ".bin", "hapsland"),
  };
};

const runInstalledHooks = async (codexHome, event, options) => {
  const configuration = parseJson(await readFile(join(codexHome, "hooks.json"), "utf8"), "installed hooks configuration");
  const groups = configuration.hooks?.[event.hook_event_name];
  if (!Array.isArray(groups)) throw new Error(`installed ${event.hook_event_name} hooks are unavailable`);
  const outputs = [];
  for (const group of groups) {
    if (typeof group.matcher === "string" && !new RegExp(group.matcher).test(event.tool_name ?? "")) continue;
    if (!Array.isArray(group.hooks)) throw new Error("installed hook group is malformed");
    for (const handler of group.hooks) {
      if (handler?.type !== "command" || typeof handler.command !== "string") {
        throw new Error("installed command hook is malformed");
      }
      const result = await mustRun(handler.command, [], {
        cwd: options.cwd,
        env: options.env,
        input: JSON.stringify(event),
        shell: true,
      });
      if (result.stdout.trim().length > 0) outputs.push(parseJson(result.stdout, "installed hook output"));
    }
  }
  return outputs;
};

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
  if (!process.stdin.isTTY) {
    rejectTrust(new Error("native Codex trust review requires a terminal; rerun real-host conformance from a TTY"));
    return;
  }
  const command = `stty rows 24 cols 80; exec ${quote("codex")} --no-alt-screen -C ${quote(repository)}`;
  const scriptArguments = process.platform === "darwin"
    ? ["-q", "/dev/null", "/bin/sh", "-c", command]
    : ["-qefc", command, "/dev/null"];
  const child = spawn("script", scriptArguments, {
    cwd: repository,
    env: { ...env, CODEX_HOME: codexHome, TERM: "xterm-256color" },
    stdio: ["inherit", "pipe", "pipe"],
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
    const finalScreen = screen.text().replaceAll(repository, "<repository>").replaceAll(codexHome, "<codex-home>").slice(-500);
    rejectTrust(new Error(`Codex native repository/hook trust review timed out (repository prompt: ${repositorySelected ? "accepted" : "not observed"}; repository trust: ${repositoryPersisted ? "persisted" : "missing"}; hook prompt: ${hookSelected ? "observed" : "not observed"}; trust-all choice: ${hookChoiceSelected ? "confirmed" : "not confirmed"}; hook trust: ${hookPersisted ? "persisted" : "missing"}; screen=${JSON.stringify(finalScreen)})`));
  }, 30_000);
  const observe = (chunk) => {
    screen.feed(chunk);
    terminalProbe = `${terminalProbe}${chunk}`.slice(-32);
    if (!terminalInitialized && terminalProbe.includes("\u001b[6n")) {
      terminalInitialized = true;
      progress("codex-terminal-query-response-needed");
    }
    const rendered = screen.text();
    if (!repositorySelected && (
      rendered.includes("Do you trust the contents of this directory") ||
      rendered.includes("Trust this folder?")
    )) {
      repositorySelected = true;
      progress("native-repository-trust-ready");
    }
    if (!hookSelected && rendered.includes("Hooks need review")) {
      hookSelected = true;
      progress("native-hook-trust-review-ready");
    }
    if (hookSelected && !hookChoiceSelected && rendered.includes("› 2. Trust all and continue")) {
      hookChoiceSelected = true;
      progress("native-hook-trust-all-confirmation-ready");
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
  child.once("close", (code, signal) => {
    clearTimeout(timer);
    clearInterval(trustPoll);
    if (!trusted) rejectTrust(new Error(`Codex native repository/hook trust review did not persist trust (exit=${code ?? "signal"}; signal=${signal ?? "none"}; repository-prompt=${repositorySelected}; hook-prompt=${hookSelected}; trust-choice=${hookChoiceSelected}; repository-persisted=${repositoryPersisted}; hook-persisted=${hookPersisted})`));
    else resolveTrust();
  });
});

const temporary = await mkdtemp(join(tmpdir(), "review-package-conformance-"));
let residentPid;
let separateRuntime;
let testKeychainPath;
let secondaryTestKeychainPath;
let previousDefaultKeychain;
try {
  if (process.platform === "darwin" && exerciseSecretService) {
    const previous = await mustRun("security", ["default-keychain", "-d", "user"], { cwd: temporary });
    previousDefaultKeychain = previous.stdout.trim().replace(/^\"|\"$/g, "");
    testKeychainPath = join(temporary, "review-integration.keychain-db");
    secondaryTestKeychainPath = join(temporary, "review-integration-secondary.keychain-db");
    await mustRun("security", ["create-keychain", "-p", "review-integration-test", testKeychainPath], { cwd: temporary });
    await mustRun("security", ["create-keychain", "-p", "review-integration-test", secondaryTestKeychainPath], { cwd: temporary });
    await mustRun("security", ["default-keychain", "-s", testKeychainPath], { cwd: temporary });
    await mustRun("security", ["unlock-keychain", "-p", "review-integration-test", testKeychainPath], { cwd: temporary });
    await mustRun("security", ["unlock-keychain", "-p", "review-integration-test", secondaryTestKeychainPath], { cwd: temporary });
    await mustRun("security", ["set-keychain-settings", "-lut", "21600", testKeychainPath], { cwd: temporary });
    await mustRun("security", ["set-keychain-settings", "-lut", "21600", secondaryTestKeychainPath], { cwd: temporary });
    await mustRun("security", ["list-keychains", "-d", "user", "-s", testKeychainPath, secondaryTestKeychainPath], { cwd: temporary });
    process.env.REVIEW_TEST_KEYCHAIN_PATH = testKeychainPath;
  }
  progress("pack-and-install");
  const artifacts = join(temporary, "artifacts");
  const installation = join(temporary, "installation");
  const repository = join(temporary, "repository");
  const state = join(temporary, "state", "consent");
  // Darwin's sockaddr_un path bound is substantially shorter than Linux's.
  // The product default is short enough, while this deeply nested fixture is
  // not, so keep the isolated resident endpoint in its own temporary root.
  const runtime = process.platform === "darwin"
    ? (separateRuntime = await mkdtemp(join(tmpdir(), "review-resident-")))
    : join(temporary, "state", "resident");
  const calls = join(temporary, "state", "controlled-calls.txt");
  const outcomes = join(temporary, "state", "controlled-outcomes.jsonl");
  const activity = join(temporary, "state", "activity");
  const codexHome = join(temporary, "codex home 'quoted'");
  const independentLog = join(temporary, "state", "independent-hook.jsonl");
  await mkdir(artifacts, { recursive: true });
  await mkdir(installation, { recursive: true });
  await mkdir(repository, { recursive: true });
  const sourceManifest = parseJson(await readFile(join(root, "package.json"), "utf8"), "source manifest");
  if (sourceManifest.scripts?.prepack !== "npm run build" || sourceManifest.scripts?.postinstall !== undefined) {
    throw new Error("source package must build before packing without an install-time lifecycle script");
  }
  await mustRun("npm", registryArtifact
    ? ["pack", "@hapsland/hapsland@0.1.0", "--ignore-scripts=true", "--registry=https://registry.npmjs.org/", "--pack-destination", artifacts]
    : ["pack", "--ignore-scripts=false", "--foreground-scripts", "--pack-destination", artifacts], { cwd: root });
  const artifactEntries = await (await import("node:fs/promises")).readdir(artifacts);
  const artifactName = artifactEntries.find((entry) => entry.endsWith(".tgz"));
  if (artifactName === undefined) throw new Error("npm pack did not produce a tarball");
  const tarball = join(artifacts, artifactName);
  const artifactSha256 = createHash("sha256").update(await readFile(tarball)).digest("hex");
  if (registryArtifact && artifactSha256 !== expectedSha256) {
    throw new Error(`registry archive SHA-256 differs from reviewed artifact: ${artifactSha256}`);
  }
  // Force the local layout expected by this fixture. An effective global
  // install silently places package bins under prefix/bin instead.
  await mustRun("npm", ["install", "--global=false", "--legacy-peer-deps", "--ignore-scripts=true", "--prefer-offline", "--omit=dev", "--bin-links=true", "--prefix", installation, tarball], { cwd: temporary, timeoutMs: 120_000 });
  const packageDirectory = join(installation, "node_modules", sourceManifest.name);
  const binDirectory = join(installation, "node_modules", ".bin");
  const cli = join(binDirectory, "hapsland");
  let activeCli = cli;
  const parser = join(binDirectory, "hapsland-parser");
  const doctor = join(binDirectory, "hapsland-doctor");
  const doctorSource = join(packageDirectory, "dist", "package-doctor.js");
  for (const [name, path] of [["hapsland", cli], ["hapsland-parser", parser], ["hapsland-doctor", doctor]]) {
    try {
      await access(path);
    } catch {
      const [prefixEntries, binEntries, packageEntries] = await Promise.all([
        readdir(installation).catch(() => []),
        readdir(binDirectory).catch(() => []),
        readdir(packageDirectory).catch(() => []),
      ]);
      throw new Error(`packed installation is missing ${name}; npm did not create a usable package bin link (prefix: ${prefixEntries.join(", ") || "empty"}; .bin: ${binEntries.slice(0, 20).join(", ") || "empty"}; package: ${packageEntries.slice(0, 20).join(", ") || "empty"})`);
    }
  }
  const installedManifest = parseJson(await readFile(join(packageDirectory, "package.json"), "utf8"), "installed manifest");
  for (const documentation of ["README.md", "docs/codex-installation.md", "docs/claude-installation.md",
    "docs/opencode-installation.md", "docs/npm-quickstart.md", "docs/status.md", "docs/installed-release-compatibility.md"]) {
    const contents = await readFile(join(packageDirectory, documentation), "utf8");
    if (contents.trim().length === 0) throw new Error(`packaged documentation is empty: ${documentation}`);
  }
  const targetPackage = await installLocalPackageVariant({
    sourcePackage: packageDirectory,
    temporary,
    version: "0.0.1-local",
    residentProtocol: 1,
  });
  const incompatiblePackage = await installLocalPackageVariant({
    sourcePackage: packageDirectory,
    temporary,
    version: "0.0.2-incompatible-local",
    residentProtocol: 2,
  });
  // npm can return ELSPROBLEMS for tree-sitter's optional peer layout even
  // when the exact production dependencies are installed and loadable. The
  // JSON tree remains authoritative for the dev-dependency exclusion below;
  // parser loading is checked through the packaged entry point afterward.
  const productionTree = await run("npm", ["ls", "--global=false", "--all", "--omit=dev", "--json"], { cwd: installation });
  if (productionTree.stdout.trim().length === 0) throw new Error("npm ls did not return a production dependency tree");
  const dependencyTree = parseJson(productionTree.stdout, "production dependency tree");
  for (const forbidden of ["typescript", "vitest", "@types/bun"]) {
    if (dependencyTree.dependencies?.[forbidden] !== undefined) throw new Error(`development dependency installed: ${forbidden}`);
  }

  const wrongNodeDirectory = join(temporary, "wrong-node-path");
  await mkdir(wrongNodeDirectory);
  await writeFile(join(wrongNodeDirectory, "node"), "#!/bin/sh\nexit 91\n", { mode: 0o700 });
  const launcherEnvironment = { ...process.env, PATH: `${wrongNodeDirectory}:${process.env.PATH ?? ""}` };
  const doctorRun = await mustRun(doctor, [], { cwd: temporary, env: launcherEnvironment });
  const doctorResult = parseJson(doctorRun.stdout, "package doctor");
  if (doctorResult.status !== "ready") throw new Error("package doctor did not report ready");
  if (doctorResult.checks.find((check) => check.name === "runtime")?.observed !== process.version) {
    throw new Error("package doctor used the shell's Node instead of the packaged runtime");
  }
  await mustRun(cli, ["--help"], { cwd: temporary, env: launcherEnvironment });
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

  progress("create-isolated-repository");
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
    REVIEW_USER_CONFIG_PATH: join(temporary, "state", "user.jsonc"),
    REVIEW_RESIDENT_DIR: runtime,
    REVIEW_CONTROL_JSON: JSON.stringify({
      answers,
      capturePath: calls,
      outcomePath: outcomes,
      ...(exerciseCredentialLifecycle ? { requireCredential: true } : {}),
    }),
    REVIEW_ACTIVITY_PATH: activity,
    REVIEW_INSTALL_CONTROLLED: "1",
  };
  for (const key of ["OPENAI_API_KEY", "TYPESAFE_API_KEY"]) delete env[key];
  const credentialLifecycle = join(temporary, "state", "credential-state.json");
  await mkdir(join(temporary, "state"), { recursive: true, mode: 0o700 });
  env.REVIEW_CREDENTIAL_STATE_PATH = credentialLifecycle;
  if (exerciseCredentialFixture) {
    if (process.platform !== "linux") throw new Error("the deterministic credential fixture is Linux-only");
    const helper = join(temporary, "credential-helper.mjs");
    const vault = join(temporary, "state", "credential-vault");
    await writeFile(helper, `#!/usr/bin/env node
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
const operation = process.argv[2]; const vault = process.env.TEST_SECRET_VAULT;
if (operation === "probe") console.log('{"version":1,"status":"available"}');
else if (operation === "get") {
  if (!existsSync(vault)) console.log('{"version":1,"status":"missing"}');
  else { const value=readFileSync(vault); console.log(JSON.stringify({version:1,status:"present",length:value.length})); process.stdout.write(value); }
} else if (operation === "set") {
  const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk);
  writeFileSync(vault, Buffer.concat(chunks), {mode:0o600}); console.log('{"version":1,"status":"stored"}');
} else if (operation === "delete") {
  const existed=existsSync(vault); rmSync(vault,{force:true}); console.log(JSON.stringify({version:1,status:existed?"deleted":"missing"}));
}
`, { mode: 0o700 });
    await chmod(helper, 0o700);
    env.REVIEW_CREDENTIAL_HELPER = helper;
    env.TEST_SECRET_VAULT = vault;
  }
  const syntheticCredential = "package-secret-marker-never-retained";
  let credentialEvidence = { status: "not-requested" };
  if (exerciseCredentialLifecycle) {
    const loginStarted = Date.now();
    const loginRun = await mustRun(cli, ["--login", "--credential-stdin"], {
      cwd: temporary, env, input: `${syntheticCredential}\n`,
    });
    const loginResult = parseJson(loginRun.stdout, "packaged credential login");
    if (loginResult.status !== "stored" || loginResult.paidVerificationPerformed !== false ||
        `${loginRun.stdout}${loginRun.stderr}`.includes(syntheticCredential)) {
      throw new Error("packaged credential login did not store safely without paid verification");
    }
    const lookupStarted = Date.now();
    const credentialInspection = await mustRun(cli, ["--inspect-credentials"], {
      cwd: repository, env, input: JSON.stringify({ version: 1, operation: "credentials", cwd: repository }),
    });
    const credentialResult = parseJson(credentialInspection.stdout, "packaged credential inspection");
    if (credentialResult.present !== true || credentialResult.source !== "saved" ||
        credentialInspection.stdout.includes(syntheticCredential)) {
      throw new Error("packaged CLI did not reuse the saved credential in a new process");
    }
    let defaultKeychainIsolation = "not-applicable";
    if (process.platform === "darwin") {
      if (secondaryTestKeychainPath === undefined) throw new Error("secondary Keychain fixture is unavailable");
      const secondaryCredential = `${syntheticCredential}-secondary`;
      const replacementCredential = `${syntheticCredential}-replacement`;
      const addSecondary = await run("security", [
        "add-generic-password", "-a", "default", "-s", "dev.typesafe.realtime-review-tool",
        "-w", secondaryCredential, secondaryTestKeychainPath,
      ], { cwd: temporary, env });
      if (addSecondary.code !== 0) throw new Error("secondary Keychain fixture credential could not be created");
      const helper = join(packageDirectory, "native", "prebuilt", `${process.platform}-${process.arch}`, "credential-secret-service");
      const beforeReplacement = await mustRun(helper, ["get"], { cwd: temporary, env });
      if (!beforeReplacement.stdout.endsWith(syntheticCredential) || beforeReplacement.stdout.includes(secondaryCredential)) {
        throw new Error("native lookup escaped the selected default Keychain");
      }
      const replacement = await mustRun(cli, ["--login", "--credential-stdin"], {
        cwd: temporary, env, input: `${replacementCredential}\n`,
      });
      if (parseJson(replacement.stdout, "default Keychain replacement").status !== "stored") {
        throw new Error("default Keychain replacement failed");
      }
      const afterReplacement = await mustRun(helper, ["get"], { cwd: temporary, env });
      const secondaryAfterReplacement = await mustRun("security", [
        "find-generic-password", "-a", "default", "-s", "dev.typesafe.realtime-review-tool",
        "-w", secondaryTestKeychainPath,
      ], { cwd: temporary, env });
      if (!afterReplacement.stdout.endsWith(replacementCredential) ||
          secondaryAfterReplacement.stdout.trim() !== secondaryCredential) {
        throw new Error("native replacement touched a duplicate in another Keychain");
      }
      defaultKeychainIsolation = "lookup-and-replacement-passed";
    }
    credentialEvidence = {
      status: exerciseCredentialFixture ? "controlled-helper" : process.platform === "darwin" ? "actual-keychain" : "actual-secret-service",
      loginMs: Date.now() - loginStarted,
      separateProcessLookupMs: Date.now() - lookupStarted,
      defaultKeychainIsolation,
    };
  }
  await mkdir(codexHome, { recursive: true, mode: 0o700 });
  const fakeCodex = join(temporary, "codex-cli-fixture");
  await writeFile(fakeCodex, "#!/bin/sh\nprintf 'codex-cli 0.155.1\\n'\n", { mode: 0o700 });
  await chmod(fakeCodex, 0o700);
  const independentHook = join(temporary, "independent-hook.mjs");
  await writeFile(independentHook, `import { appendFileSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
const event = JSON.parse(readFileSync(0, "utf8"));
const input = event?.tool_input && typeof event.tool_input === "object" ? event.tool_input : {};
const command = typeof input.command === "string" ? input.command : "";
const record = { observed: true, sessionId: typeof event?.session_id === "string" ? event.session_id : null, hookEventName: typeof event?.hook_event_name === "string" ? event.hook_event_name : null, toolName: typeof event?.tool_name === "string" ? event.tool_name : null, payloadKeys: Object.keys(event ?? {}).sort(), toolInputKeys: Object.keys(input).sort(), commandBytes: Buffer.byteLength(command), commandEndsWithNewline: command.endsWith("\\n"), parserAccepted: false, observationAccepted: false, candidateOperation: null, targetMatches: false, candidateAbsolute: false, candidateLexicallyWithinRoot: false, candidateRealpathWithinRoot: false, canonicalRootAliasesCandidateParent: false, pathEligible: false, captureAvailable: false, analysisStatus: "not-run", diagnosticError: null, patchStart: command.startsWith("*** Begin Patch\\n"), patchEnd: command.trimEnd().endsWith("*** End Patch"), patchHeaders: command.split("\\n").filter((line) => /^\\*\\*\\* (Add|Update|Delete) File: /.test(line)).length };
try {
  if (command.length > 0 && process.env.REVIEW_ADAPTER_MODULE !== undefined) {
    const adapter = await import(pathToFileURL(process.env.REVIEW_ADAPTER_MODULE).href);
    record.parserAccepted = adapter.nativeDirectCandidates(command) !== undefined;
    const Effect = await import(pathToFileURL(process.env.REVIEW_EFFECT_MODULE).href);
    const adapted = await Effect.runPromise(adapter.adaptCodexDirectEvent(event, "0.156.0"));
    record.observationAccepted = adapted !== undefined;
    if (adapted !== undefined) {
      const candidate = adapted.candidates[0];
      record.candidateOperation = candidate?.operation ?? null;
      record.targetMatches = candidate?.path === "installed.ts" || candidate?.path.endsWith("/installed.ts") === true;
      if (candidate !== undefined) {
        const candidatePath = candidate.path;
        const root = adapted.root;
        record.candidateAbsolute = isAbsolute(candidatePath);
        const lexical = resolve(root, candidatePath);
        const lexicalRelative = relative(root, lexical);
        record.candidateLexicallyWithinRoot = lexicalRelative !== ".." && !lexicalRelative.startsWith(".." + sep) && !isAbsolute(lexicalRelative);
        try {
          const canonicalRoot = realpathSync(root);
          const canonicalCandidate = realpathSync(lexical);
          const canonicalRelative = relative(canonicalRoot, canonicalCandidate);
          record.candidateRealpathWithinRoot = canonicalRelative !== ".." && !canonicalRelative.startsWith(".." + sep) && !isAbsolute(canonicalRelative);
          record.canonicalRootAliasesCandidateParent = canonicalRoot !== root && canonicalCandidate.startsWith(canonicalRoot + sep);
        } catch {}
        const selection = await import(pathToFileURL(process.env.REVIEW_SELECTION_MODULE).href);
        const eligible = await Effect.runPromise(selection.eligibleNamedPath(root, candidatePath, undefined, adapted.rootIdentity));
        record.pathEligible = eligible !== undefined;
        if (eligible !== undefined && candidate.operation === "add") {
          const capture = await import(pathToFileURL(process.env.REVIEW_CAPTURE_MODULE).href);
          const captured = await Effect.runPromise(capture.captureStable(root, eligible, {}, adapted.rootIdentity));
          record.captureAvailable = captured !== undefined;
          if (captured !== undefined) {
            const analyzer = await import(pathToFileURL(process.env.REVIEW_ANALYZER_MODULE).href);
            record.analysisStatus = analyzer.analyzeTypeFile(candidatePath, captured.text).status;
          }
        }
      }
    }
  }
} catch (error) {
  record.diagnosticError = error instanceof Error ? error.name : "unknown";
}
const response = event?.tool_response && typeof event.tool_response === "object" ? event.tool_response : {};
record.responseKeys = Object.keys(response).sort();
record.responseFailed = response.success === false || response.is_error === true;
record.controlledInstall = process.env.REVIEW_INSTALL_CONTROLLED === "1";
record.controlledReviewConfigured = process.env.REVIEW_CONTROL_JSON !== undefined;
record.residentConfigured = process.env.REVIEW_RESIDENT_DIR !== undefined;
appendFileSync(process.env.INDEPENDENT_HOOK_LOG, JSON.stringify(record) + "\\n");
`, { mode: 0o600 });
  await writeFile(join(codexHome, "config.toml"), "# independent setting\nmodel_reasoning_effort = 'medium'\n", { mode: 0o600 });
  await writeFile(join(codexHome, "hooks.json"), `${JSON.stringify({
    description: "independent fixture hook",
    hooks: { PostToolUse: [{ matcher: "^(apply_patch|Bash)$", hooks: [{ type: "command", command: `${quote(process.execPath)} ${quote(independentHook)}`, timeout: 10 }] }] },
  }, null, 2)}\n`, { mode: 0o600 });
  const installPreviewRun = await mustRun(cli, ["--install-preview"], {
    cwd: temporary,
    env,
    input: JSON.stringify({ version: 1, operation: "install-preview", codexHome, codexExecutable: fakeCodex }),
  });
  const installPreview = parseJson(installPreviewRun.stdout, "installation preview");
  const ownedPreview = installPreview.proposal?.ownedChanges;
  const runtimePackage = process.platform === "darwin" ? "node-bin-darwin-arm64" : "node-linux-arm64";
  const runtimePaths = [
    join(installation, "node_modules", runtimePackage, "bin", "node"),
    join(packageDirectory, "node_modules", runtimePackage, "bin", "node"),
  ];
  const packagedRuntimes = [...runtimePaths, ...await Promise.all(runtimePaths.map((path) => realpath(path).catch(() => path)))];
  const previewChecks = {
    preview: installPreview.status === "preview",
    fileSelection: !("sourceEgressAuthorized" in installPreview),
    changes: Array.isArray(installPreview.proposal?.changes),
    runtime: packagedRuntimes.includes(ownedPreview?.runtime?.executable),
    entrypoint: typeof ownedPreview?.runtime?.entrypoint === "string",
    featureKey: ownedPreview?.feature?.key === "hooks",
    featureValue: ownedPreview?.feature?.value === true,
    matcher: ownedPreview?.hook?.matcher === "^(apply_patch|Edit|Write|Bash)$",
    timeout: ownedPreview?.hook?.handlers?.[0]?.timeout === 10,
    ownership: ownedPreview?.hook?.handlers?.[0]?.command?.includes("--review-tool-owned=codex-v1") === true,
  };
  const failedPreviewChecks = Object.entries(previewChecks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failedPreviewChecks.length > 0) {
    const runtimeLocation = typeof ownedPreview?.runtime?.executable === "string"
      ? relative(installation, ownedPreview.runtime.executable)
      : "missing";
    throw new Error(`packaged installation preview did not expose exact source-free changes: ${failedPreviewChecks.join(", ")} (runtime relative to installation: ${runtimeLocation})`);
  }
  const installRun = await mustRun(cli, ["--install"], {
    cwd: temporary,
    env,
    input: JSON.stringify({ version: 1, operation: "install", codexHome, codexExecutable: fakeCodex, proposalDigest: installPreview.proposal.digest }),
  });
  const installResult = parseJson(installRun.stdout, "installation result");
  if (installResult.status !== "installed" || "sourceEgressAuthorized" in installResult) {
    throw new Error("packaged installation retained a retired repository grant field");
  }
  const installedDoctorRun = await mustRun(cli, ["--doctor"], {
    cwd: temporary,
    env,
    input: JSON.stringify({ version: 1, operation: "doctor", cwd: repository, codexHome, codexExecutable: fakeCodex }),
  });
  const installedDoctor = parseJson(installedDoctorRun.stdout, "installed integration doctor");
  if (installedDoctor.offline !== true || installedDoctor.readOnly !== true || installedDoctor.providerCalls !== 0 ||
      !installedDoctor.checks?.some((check) => check.stage === "configuration-ownership" && check.status === "ready") ||
      !installedDoctor.checks?.some((check) => check.stage === "file-selection" && check.status === "ready") ||
      (exerciseCredentialLifecycle && !installedDoctor.checks?.some((check) =>
        check.stage === "credential-accessibility" && check.status === "ready" &&
        check.observed?.savedCredentialAccessibility === "present"))) {
    throw new Error("packaged installed-integration doctor did not expose independent readiness stages");
  }
  const repeatPreviewRun = await mustRun(cli, ["--install-preview"], {
    cwd: temporary,
    env,
    input: JSON.stringify({ version: 1, operation: "install-preview", codexHome, codexExecutable: fakeCodex }),
  });
  const repeatPreview = parseJson(repeatPreviewRun.stdout, "repeat installation preview");
  const repeatInstallRun = await mustRun(cli, ["--install"], {
    cwd: temporary,
    env,
    input: JSON.stringify({ version: 1, operation: "install", codexHome, codexExecutable: fakeCodex, proposalDigest: repeatPreview.proposal.digest }),
  });
  if (parseJson(repeatInstallRun.stdout, "repeat installation").status !== "already-installed") {
    throw new Error("packaged repeated installation was not idempotent");
  }
  await mkdir(state, { recursive: true, mode: 0o700 });
  const consentBeforeUpdate = await snapshotJsonDirectory(state);
  progress("exercise-local-package-update");
  const hooksBeforeIncompatible = await readFile(join(codexHome, "hooks.json"), "utf8");
  const incompatiblePreviewRun = await run(incompatiblePackage.cli, ["--update-preview"], {
    cwd: temporary,
    env,
    input: JSON.stringify({ version: 1, operation: "update-preview", codexHome, codexExecutable: fakeCodex }),
  });
  const incompatiblePreview = parseJson(incompatiblePreviewRun.stdout, "incompatible update preview");
  if (incompatiblePreviewRun.code !== 4 || incompatiblePreview.status !== "conflict" ||
      !incompatiblePreview.error?.message?.includes("protocol 1 is incompatible with target protocol 2") ||
      await readFile(join(codexHome, "hooks.json"), "utf8") !== hooksBeforeIncompatible) {
    throw new Error("incompatible local package update did not preserve the installed version");
  }
  const updatePreviewRun = await mustRun(targetPackage.cli, ["--update-preview"], {
    cwd: temporary,
    env,
    input: JSON.stringify({ version: 1, operation: "update-preview", codexHome, codexExecutable: fakeCodex }),
  });
  const updatePreview = parseJson(updatePreviewRun.stdout, "update preview");
  if (updatePreview.status !== "preview" || updatePreview.proposal?.current?.packageVersion !== installedManifest.version ||
      updatePreview.proposal?.target?.packageVersion !== targetPackage.version || updatePreview.restart?.required !== true ||
      updatePreview.trust?.status !== "renewal-required" || updatePreview.trust?.modified !== false) {
    throw new Error("local package update preview did not expose runtime, hook, trust, and restart changes");
  }
  const partialUpdateRun = await run(targetPackage.cli, ["--update"], {
    cwd: temporary,
    env: { ...env, REVIEW_INSTALL_FAIL_AFTER_WRITES: "1" },
    input: JSON.stringify({
      version: 1,
      operation: "update",
      codexHome,
      codexExecutable: fakeCodex,
      proposalDigest: updatePreview.proposal.digest,
    }),
  });
  const partialUpdate = parseJson(partialUpdateRun.stdout, "partial update");
  const hooksAfterPartial = await readFile(join(codexHome, "hooks.json"), "utf8");
  if (partialUpdateRun.code !== 5 || partialUpdate.status !== "partial" ||
      partialUpdate.recovery?.command?.request?.proposalDigest !== updatePreview.proposal.digest ||
      hooksAfterPartial !== hooksBeforeIncompatible) {
    throw new Error("partial local package update did not retain the previous working hook and exact recovery request");
  }
  const updateRun = await mustRun(targetPackage.cli, ["--update"], {
    cwd: temporary,
    env,
    input: JSON.stringify({
      version: 1,
      operation: "update",
      codexHome,
      codexExecutable: fakeCodex,
      proposalDigest: updatePreview.proposal.digest,
    }),
  });
  const updateResult = parseJson(updateRun.stdout, "update result");
  const hooksAfterUpdate = await readFile(join(codexHome, "hooks.json"), "utf8");
  if (updateResult.status !== "updated" || updateResult.resumed !== true ||
      updateResult.restart?.required !== true || updateResult.restart?.processesStopped !== false ||
      !hooksAfterUpdate.includes(updatePreview.proposal.target.entrypoint)) {
    throw new Error("compatible local package update did not complete from the target package");
  }
  activeCli = targetPackage.cli;
  if (JSON.stringify(await snapshotJsonDirectory(state)) !== JSON.stringify(consentBeforeUpdate)) {
    throw new Error("local package update changed old grant files");
  }
  const source = "export interface Delivery { id: string; destination: string }\n";
  await writeFile(join(repository, "profile.ts"), source, { mode: 0o600 });
  const addEvent = {
    hook_event_name: "PostToolUse", tool_name: "apply_patch", session_id: "package-session",
    turn_id: "package-turn", tool_use_id: "package-add", cwd: repository,
    tool_input: { command: `*** Begin Patch\n*** Add File: profile.ts\n+${source.trim()}\n*** End Patch` }, tool_response: {},
  };
  progress("capture-and-resident-review");
  const installedHostEnvironment = { ...env, INDEPENDENT_HOOK_LOG: independentLog };
  await runInstalledHooks(codexHome, { ...addEvent, hook_event_name: "PreToolUse" },
    { cwd: temporary, env: installedHostEnvironment });
  await runInstalledHooks(codexHome, addEvent, { cwd: temporary, env: installedHostEnvironment });
  const ownerAfterAdmission = await readFile(join(runtime, "owner.json"), "utf8").catch(() => undefined);
  if (ownerAfterAdmission === undefined) {
    const diagnostic = await readFile(join(runtime, "owner.lock.startup-error"), "utf8").catch(() => "no resident diagnostic was produced");
    throw new Error(`packaged resident did not publish its endpoint: ${diagnostic.slice(-2_048)}`);
  }
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await readFile(calls, "utf8").catch(() => "")) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  const stopOutputs = await runInstalledHooks(codexHome, {
    ...addEvent, hook_event_name: "Stop", stop_hook_active: false,
  }, { cwd: temporary, env: installedHostEnvironment });
  const hookOutput = stopOutputs.find((output) => output.decision === "block") ?? {};
  let submissions = (await readFile(calls, "utf8")).trim().split("\n").filter(Boolean).length;
  if (submissions !== 1) throw new Error(`expected one controlled backend submission, observed ${submissions}`);
  if (hookOutput.decision !== "block" || typeof hookOutput.reason !== "string") {
    throw new Error(`packaged Stop hook did not return review advice; outputs=${JSON.stringify(stopOutputs.map((output) => ({
      keys: Object.keys(output), decision: output.decision ?? null,
    })))}`);
  }
  await runInstalledHooks(codexHome, { ...addEvent, tool_name: "Bash", tool_use_id: "package-independent-check",
    tool_input: { command: "printf package-ready" } }, { cwd: temporary, env: installedHostEnvironment });
  if (exerciseCredentialLifecycle) {
    const firstOwner = parseJson(ownerAfterAdmission, "first resident owner");
    process.kill(firstOwner.pid, "SIGTERM");
    let oldResidentExited = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { process.kill(firstOwner.pid, 0); }
      catch { oldResidentExited = true; break; }
      await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    }
    if (!oldResidentExited) throw new Error("old resident did not exit before credential restart probe");
    let oldOwnerReleased = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const retainedOwner = await readFile(join(runtime, "owner.json"), "utf8").catch(() => undefined);
      if (retainedOwner === undefined) { oldOwnerReleased = true; break; }
      const retained = parseJson(retainedOwner, "retained resident owner");
      if (retained.pid !== firstOwner.pid || retained.lifetime !== firstOwner.lifetime) {
        oldOwnerReleased = true;
        break;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    }
    if (!oldOwnerReleased) throw new Error("old resident owner lifetime remained active after process exit");
    const credentialRestartGate = join(temporary, "state", "hold-credential-restart-evaluation");
    const credentialRestartEnvironment = {
      ...env,
      REVIEW_RESIDENT_BACKEND_GATE_PATH: credentialRestartGate,
    };
    const restartSource = "export interface Restarted { id: string; destination: string }\n";
    await writeFile(join(repository, "restarted.ts"), restartSource, { mode: 0o600 });
    const restartEvent = {
      ...addEvent,
      tool_use_id: "package-restart-add",
      tool_input: { command: `*** Begin Patch\n*** Add File: restarted.ts\n+${restartSource.trim()}\n*** End Patch` },
    };
    await mustRun(activeCli, ["--codex-hook", "--controlled-reviewer", "--controlled-writer"], {
      cwd: temporary, env: credentialRestartEnvironment, input: JSON.stringify(restartEvent),
    });
    let replacementOwner;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const encoded = await readFile(join(runtime, "owner.json"), "utf8").catch(() => undefined);
      if (encoded !== undefined) {
        const candidate = parseJson(encoded, "replacement resident owner");
        if (candidate.pid !== firstOwner.pid && candidate.lifetime !== firstOwner.lifetime) {
          replacementOwner = candidate;
          break;
        }
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    }
    if (replacementOwner === undefined) {
      throw new Error("fresh resident identity was not established before the second controlled submission");
    }
    await writeFile(credentialRestartGate, "continue\n", { mode: 0o600 });
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      await mustRun(activeCli, ["--codex-hook", "--controlled-reviewer", "--controlled-writer"], {
        cwd: temporary, env: credentialRestartEnvironment,
        input: JSON.stringify({ ...restartEvent, tool_name: "Bash", tool_use_id: `package-restart-collect-${attempt}`, tool_input: { command: "printf package-restart-ready" } }),
      });
      submissions = (await readFile(calls, "utf8")).trim().split("\n").filter(Boolean).length;
      if (submissions === 2) break;
    }
    if (submissions !== 2) throw new Error("restarted resident did not reuse the persistent native credential");
    credentialEvidence = {
      ...credentialEvidence,
      residentRestartPersistence: "passed-distinct-pid-and-lifetime",
      residentControlledTransportResolution: "passed",
    };
    const logoutRun = await mustRun(activeCli, ["--logout"], { cwd: temporary, env });
    const logoutResult = parseJson(logoutRun.stdout, "packaged credential logout");
    if (logoutResult.status !== "logged-out" || logoutResult.grantsPreserved !== true ||
        logoutResult.sentRequestsRecalled !== false || logoutRun.stdout.includes(syntheticCredential)) {
      throw new Error("packaged credential logout did not revoke saved use safely");
    }
    if (process.platform === "darwin") {
      if (secondaryTestKeychainPath === undefined) throw new Error("secondary Keychain fixture is unavailable");
      const secondaryAfterLogout = await mustRun("security", [
        "find-generic-password", "-a", "default", "-s", "dev.typesafe.realtime-review-tool",
        "-w", secondaryTestKeychainPath,
      ], { cwd: temporary, env });
      if (secondaryAfterLogout.stdout.trim() !== `${syntheticCredential}-secondary`) {
        throw new Error("native logout touched a duplicate in another Keychain");
      }
      credentialEvidence = { ...credentialEvidence, defaultKeychainIsolation: "lookup-replacement-logout-passed" };
    }
    const loggedOutSource = "export interface LoggedOut { id: string; destination: string }\n";
    await writeFile(join(repository, "logged-out.ts"), loggedOutSource, { mode: 0o600 });
    const loggedOutEvent = {
      ...addEvent,
      session_id: "package-logged-out-session",
      turn_id: "package-logged-out-turn",
      tool_use_id: "package-logged-out",
      tool_input: { command: `*** Begin Patch\n*** Add File: logged-out.ts\n+${loggedOutSource.trim()}\n*** End Patch` },
    };
    await mustRun(activeCli, ["--codex-hook", "--controlled-reviewer", "--controlled-writer"], {
      cwd: temporary, env, input: JSON.stringify(loggedOutEvent),
    });
    // File settings still select this edit. Give the resident enough time to
    // attempt it, then prove the missing credential stopped provider egress.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      await mustRun(activeCli, ["--codex-hook", "--controlled-reviewer", "--controlled-writer"], {
        cwd: temporary, env,
        input: JSON.stringify({ ...loggedOutEvent, tool_name: "Bash", tool_use_id: `package-logged-out-collect-${attempt}`, tool_input: { command: "printf package-logged-out" } }),
      });
    }
    const submissionsAfterLogout = (await readFile(calls, "utf8")).trim().split("\n").filter(Boolean).length;
    if (submissionsAfterLogout !== submissions) {
      throw new Error("logged-out credential dispatched a provider request for an otherwise eligible file");
    }
    credentialEvidence = { ...credentialEvidence, logoutBeforeFutureDispatch: "passed" };
  }
  const activityRun = await mustRun(activeCli, ["--status"], {
    cwd: temporary,
    env,
    input: JSON.stringify({ version: 1, operation: "status", cwd: repository, sessionId: "package-session" }),
  });
  const activityStatus = parseJson(activityRun.stdout, "packaged resident activity");
  if (activityStatus.activitySource !== "resident-v1" || activityStatus.activity?.kind !== "submitted" ||
      activityStatus.activity?.submission?.findings < 1 ||
      activityStatus.activity?.modelReaction?.status !== "unavailable") {
    throw new Error(`packaged status did not distinguish submission from unavailable model-reaction evidence: ${JSON.stringify({
      source: activityStatus.activitySource, kind: activityStatus.activity?.kind,
      submission: activityStatus.activity?.submission, reaction: activityStatus.activity?.modelReaction,
    })}`);
  }
  const independentObservationsAfterUpdate = jsonLines(await readFile(independentLog, "utf8")).length;
  if (independentObservationsAfterUpdate < 2) {
    throw new Error("independent hook was not observed through the updated installed host configuration");
  }
  await writeFile(env.REVIEW_USER_CONFIG_PATH, JSON.stringify({ version: 1, excludes: ["**/*"] }));
  await writeFile(join(repository, "disabled.ts"), "export interface Disabled { id: string }\n", { mode: 0o600 });
  await runInstalledHooks(codexHome, {
      ...addEvent,
      tool_use_id: "package-disabled",
      tool_input: { command: "*** Begin Patch\n*** Add File: disabled.ts\n+export interface Disabled { id: string }\n*** End Patch" },
    }, { cwd: temporary, env: installedHostEnvironment });
  await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  const submissionsAfterDisable = (await readFile(calls, "utf8")).trim().split("\n").filter(Boolean).length;
  if (submissionsAfterDisable !== submissions) throw new Error("disabled repository dispatched a provider request");
  await rm(env.REVIEW_USER_CONFIG_PATH, { force: true });
  if (exerciseCredentialLifecycle) {
    await mustRun(activeCli, ["--login", "--credential-stdin"], {
      cwd: temporary, env, input: `${syntheticCredential}\n`,
    });
  }
  const owner = parseJson(await readFile(join(runtime, "owner.json"), "utf8"), "resident owner");
  try { process.kill(owner.pid, "SIGTERM"); } catch {}
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await readFile(join(runtime, "owner.json"), "utf8").catch(() => undefined) === undefined) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }

  progress("installed-activity-restart");
  const restartEnvironment = {
    ...env,
    REVIEW_RESIDENT_BACKEND_GATE_PATH: join(temporary, "state", "hold-restart-evaluation"),
  };
  const restartSource = "export interface RestartPending { id: string }\n";
  await writeFile(join(repository, "restart-pending.ts"), restartSource, { mode: 0o600 });
  const restartEvent = {
    ...addEvent,
    session_id: "package-restart-session",
    turn_id: "package-restart-turn",
    tool_use_id: "package-restart-add",
    tool_input: {
      command: `*** Begin Patch\n*** Add File: restart-pending.ts\n+${restartSource.trim()}\n*** End Patch`,
    },
  };
  await mustRun(activeCli, ["--codex-hook", "--controlled-reviewer", "--controlled-writer"], {
    cwd: temporary,
    env: restartEnvironment,
    input: JSON.stringify(restartEvent),
  });
  const pendingStatus = parseJson((await mustRun(activeCli, ["--status"], {
    cwd: temporary,
    env: restartEnvironment,
    input: JSON.stringify({ version: 1, operation: "status", cwd: repository, sessionId: "package-restart-session" }),
  })).stdout, "packaged pending activity");
  if (pendingStatus.activitySource !== "resident-v1" || pendingStatus.activity?.kind !== "pending" ||
      pendingStatus.activity?.modelReaction?.status !== "unavailable") {
    throw new Error("packaged status did not report pending activity before restart");
  }
  const pendingOwner = parseJson(await readFile(join(runtime, "owner.json"), "utf8"), "pending resident owner");
  try { process.kill(pendingOwner.pid, "SIGTERM"); } catch {}
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await readFile(join(runtime, "owner.json"), "utf8").catch(() => undefined) === undefined) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
  const lostStatus = parseJson((await mustRun(activeCli, ["--status"], {
    cwd: temporary,
    env,
    input: JSON.stringify({ version: 1, operation: "status", cwd: repository, sessionId: "package-restart-session" }),
  })).stdout, "packaged restarted activity");
  if (lostStatus.activitySource !== "resident-v1" || lostStatus.activity?.kind !== "restarted/lost" ||
      lostStatus.activity?.modelReaction?.status !== "unavailable") {
    throw new Error("packaged status did not report restarted/lost after resident death");
  }
  const packagedActivity = {
    submitted: {
      instrumentation: activityStatus.activitySource,
      kind: activityStatus.activity.kind,
      submission: activityStatus.activity.submission.status,
      modelReaction: activityStatus.activity.modelReaction.status,
    },
    restart: {
      before: pendingStatus.activity.kind,
      after: lostStatus.activity.kind,
      modelReaction: lostStatus.activity.modelReaction.status,
    },
  };

  let realCodex = { status: "not-requested" };
  let realCodexFailure;
  if (executeRealCodex) {
    progress("real-codex-host");
    let realCodexStage = "host-version";
    let codexVersion = "unavailable";
    try {
    codexVersion = (await mustRun("codex", ["--version"], { cwd: temporary })).stdout.trim();
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
    realCodexStage = "native-repository-and-hook-trust";
    await establishNativeTrust(codexHome, repository, { ...env, INDEPENDENT_HOOK_LOG: independentLog });
    const trustedConfig = await readFile(join(codexHome, "config.toml"), "utf8");
    if (!trustedConfig.includes('trust_level = "trusted"') || !trustedConfig.includes("[hooks.state.") || !trustedConfig.includes("trusted_hash")) {
      throw new Error("Codex native trust review did not retain repository and exact hook-definition trust");
    }
    const before = submissions;
    const outcomesBefore = jsonLines(await readFile(outcomes, "utf8").catch(() => "")).length;
    const activityBefore = await readActivityMarkers(activity);
    const independentBefore = jsonLines(await readFile(independentLog, "utf8").catch(() => "")).length;
    const codexEnv = {
      ...env,
      CODEX_HOME: codexHome,
      INDEPENDENT_HOOK_LOG: independentLog,
      REVIEW_ADAPTER_MODULE: join(packageDirectory, "dist", "direct-event", "adapter.js"),
      REVIEW_EFFECT_MODULE: join(installation, "node_modules", "effect", "dist", "Effect.js"),
      REVIEW_SELECTION_MODULE: join(packageDirectory, "dist", "direct-event", "selection.js"),
      REVIEW_CAPTURE_MODULE: join(packageDirectory, "dist", "direct-event", "capture.js"),
      REVIEW_ANALYZER_MODULE: join(packageDirectory, "dist", "direct-event", "analyzer.js"),
    };
    realCodexStage = "host-execution";
    const host = await run("codex", [
      "exec", "--ephemeral", "--json",
      "--dangerously-bypass-approvals-and-sandbox", "--ignore-rules", "-C", repository,
      "Use apply_patch exactly once to add installed.ts containing one exported interface named Installed with fields id:string and destination:string. Then use Bash exactly once to run `printf installed-package-ready`. Do not inspect files or make other tool calls.",
    ], { cwd: repository, env: codexEnv, timeoutMs: 120_000 });
    const codexEvents = jsonLines(host.stdout);
    const eventTypes = codexEvents.map((event) => typeof event.type === "string" ? event.type : "unknown");
    const toolTypes = codexEvents.flatMap((event) => {
      const item = typeof event.item === "object" && event.item !== null ? event.item : undefined;
      return typeof item?.type === "string" ? [item.type] : [];
    });
    let realHostOutcomes = [];
    let after = before;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      realHostOutcomes = jsonLines(await readFile(outcomes, "utf8").catch(() => "")).slice(outcomesBefore);
      after = (await readFile(calls, "utf8")).trim().split("\n").filter(Boolean).length;
      if (realHostOutcomes.some(({ outcome }) => outcome === "completed-findings")) break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    const completed = realHostOutcomes.filter(({ outcome }) => outcome === "completed-findings");
    const providerSubmissions = after - before;
    const independentEventRecords = jsonLines(await readFile(independentLog, "utf8").catch(() => "")).slice(independentBefore);
    const independentObservations = independentEventRecords.length;
    const nativeSessionId = independentEventRecords.find(({ toolName }) => toolName === "apply_patch")?.sessionId;
    const hostStatusRun = typeof nativeSessionId === "string"
      ? await run(activeCli, ["--status"], {
          cwd: temporary, env: codexEnv,
          input: JSON.stringify({ version: 1, operation: "status", cwd: repository, sessionId: nativeSessionId }),
        })
      : undefined;
    const hostStatus = hostStatusRun?.code === 0 ? parseJson(hostStatusRun.stdout, "real host session status") : undefined;
    const hostActivity = hostStatus?.activity;
    const activityStages = (await readActivityMarkers(activity)).slice(activityBefore.length)
      .map(({ kind, stage }) => kind === "submission" ? "submitted" : typeof stage === "string" ? stage : "unknown");
    const independentEvents = jsonLines(await readFile(independentLog, "utf8").catch(() => "")).slice(independentBefore)
      .map(({ hookEventName, toolName, payloadKeys, toolInputKeys, commandBytes, commandEndsWithNewline, parserAccepted, observationAccepted, candidateOperation, targetMatches, candidateAbsolute, candidateLexicallyWithinRoot, candidateRealpathWithinRoot, canonicalRootAliasesCandidateParent, pathEligible, captureAvailable, analysisStatus, diagnosticError, patchStart, patchEnd, patchHeaders, responseKeys, responseFailed, controlledInstall, controlledReviewConfigured, residentConfigured }) => ({
        hookEventName, toolName, payloadKeys, toolInputKeys, commandBytes, commandEndsWithNewline, parserAccepted, observationAccepted, candidateOperation, targetMatches, candidateAbsolute, candidateLexicallyWithinRoot, candidateRealpathWithinRoot, canonicalRootAliasesCandidateParent, pathEligible, captureAvailable, analysisStatus, diagnosticError, patchStart, patchEnd, patchHeaders,
        responseKeys, responseFailed, controlledInstall, controlledReviewConfigured, residentConfigured,
      }));
    realCodex = {
      status: host.code === 0 && providerSubmissions === 1 && completed.length === 1 && independentObservations >= 2 ? "passed" : "failed",
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
      hostEvents: { types: [...new Set(eventTypes)].sort(), toolItemTypes: [...new Set(toolTypes)].sort() },
      activityStages: [...new Set(activityStages)].sort(),
      hostActivity: hostActivity === undefined ? { status: "unavailable" } : {
        status: hostActivity.kind,
        counts: hostActivity.counts,
        categories: Object.keys(hostActivity.categories ?? {}).sort(),
        readiness: hostStatus.readiness?.status ?? "unknown",
      },
      independentHook: { status: independentObservations >= 2 ? "observed" : "failed", observations: independentObservations },
      nativeHookEventShape: independentEvents,
    };
    if (realCodex.status !== "passed") {
      realCodexStage = "terminal-review-assertion";
      throw new Error(`real Codex fixture did not satisfy source-free assertions (host=${host.code}, submissions=${providerSubmissions}, completions=${completed.length}, independent=${independentObservations}, activity=${[...new Set(activityStages)].join(",")}, events=${[...new Set(eventTypes)].join(",")}, tools=${[...new Set(toolTypes)].join(",")})`);
    }
    } catch (cause) {
      realCodexFailure = cause;
      realCodex = {
        ...(typeof realCodex === "object" ? realCodex : {}),
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

  if (exerciseSecretService) {
    const finalLogout = await mustRun(activeCli, ["--logout"], { cwd: temporary, env });
    if (parseJson(finalLogout.stdout, "final credential logout").status !== "logged-out") {
      throw new Error("final installed credential logout failed");
    }
    await mustRun(activeCli, ["--login", "--credential-stdin"], {
      cwd: temporary, env, input: `${syntheticCredential}\n`,
    });
    const installedHelper = join(packageDirectory, "native", "prebuilt", `${process.platform}-${process.arch}`, "credential-secret-service");
    if (process.platform === "linux") {
      await mustRun(installedHelper, ["lock"], { cwd: temporary, env });
    } else if (process.platform === "darwin") {
      const keychainPath = process.env.REVIEW_TEST_KEYCHAIN_PATH;
      if (keychainPath === undefined) {
        throw new Error("macOS credential conformance requires REVIEW_TEST_KEYCHAIN_PATH");
      }
      await mustRun("security", ["unlock-keychain", "-p", "review-integration-test", keychainPath], { cwd: temporary, env });
      await mustRun("security", [
        "delete-generic-password", "-a", "default", "-s", "dev.typesafe.realtime-review-tool", keychainPath,
      ], { cwd: temporary, env });
      const restrictedAdd = await run("security", [
        "add-generic-password",
        "-a", "default",
        "-s", "dev.typesafe.realtime-review-tool",
        "-w", `${syntheticCredential}-restricted-native-probe`,
        // An explicit empty trusted-application entry creates an item whose
        // secret access requires user interaction. The installed helper must
        // fail that request through kSecUseAuthenticationUIFail.
        "-T", "",
        keychainPath,
      ], { cwd: temporary, env });
      if (restrictedAdd.code !== 0) throw new Error("restricted native Keychain fixture could not be created");
    } else {
      throw new Error(`native credential conformance is unsupported on ${process.platform}`);
    }
    const lockedStarted = Date.now();
    const lockedRun = await run(activeCli, ["--inspect-credentials"], {
      cwd: repository, env,
      input: JSON.stringify({ version: 1, operation: "credentials", cwd: repository }),
      timeoutMs: 5_000,
    });
    const lockedResult = parseJson(lockedRun.stdout, "locked credential inspection");
    if (!(["locked", "interaction-required", "timed-out"].includes(lockedResult.status)) || lockedRun.code !== 6) {
      throw new Error(`installed credential inspection did not report a noninteractive native access denial (status=${lockedResult.status}, exit=${lockedRun.code})`);
    }
    const lockedLookupMs = Date.now() - lockedStarted;
    let inaccessibleEvidence = {};
    if (process.platform === "linux") {
      const unreachableStarted = Date.now();
      const unreachableRun = await run(activeCli, ["--inspect-credentials"], {
        cwd: repository,
        env: { ...env, DBUS_SESSION_BUS_ADDRESS: "unix:path=/nonexistent/review-secret-service" },
        input: JSON.stringify({ version: 1, operation: "credentials", cwd: repository }),
        timeoutMs: 5_000,
      });
      const unreachableResult = parseJson(unreachableRun.stdout, "unreachable credential inspection");
      if (unreachableResult.status !== "unavailable" || unreachableRun.code !== 6) {
        throw new Error("installed credential inspection did not report unreachable storage");
      }
      inaccessibleEvidence = {
        inaccessibleLookupMs: Date.now() - unreachableStarted,
        inaccessibleOutcome: "unavailable-bounded",
      };
    }
    credentialEvidence = {
      ...credentialEvidence,
      residentControlledTransportResolution: "passed",
      logoutBeforeFutureDispatch: "passed",
      restrictedNativeLookupMs: lockedLookupMs,
      restrictedNativeOutcome: lockedResult.status === "timed-out"
        ? "timed-out-helper-terminated"
        : `${lockedResult.status}-immediate-status`,
      ...inaccessibleEvidence,
      secretRetainedInEvidence: false,
    };
  }
  const finalOwner = parseJson(await readFile(join(runtime, "owner.json"), "utf8").catch(() => "null"), "final resident owner");
  if (typeof finalOwner?.pid === "number") residentPid = finalOwner.pid;

  const uninstallPreviewRun = await mustRun(activeCli, ["--uninstall"], {
    cwd: temporary, env, input: JSON.stringify({ version: 1, operation: "uninstall", codexHome }),
  });
  const uninstallPreview = parseJson(uninstallPreviewRun.stdout, "uninstall preview");
  if (uninstallPreview.status !== "preview") throw new Error("packaged uninstall did not preview owned removal");
  const uninstallRun = await mustRun(activeCli, ["--uninstall"], {
    cwd: temporary,
    env,
    input: JSON.stringify({ version: 1, operation: "uninstall", codexHome, proposalDigest: uninstallPreview.proposal.digest }),
  });
  const uninstallResult = parseJson(uninstallRun.stdout, "uninstall result");
  const hooksAfterUninstall = parseJson(await readFile(join(codexHome, "hooks.json"), "utf8"), "hooks after uninstall");
  const configAfterUninstall = await readFile(join(codexHome, "config.toml"), "utf8");
  if (uninstallResult.status !== "uninstalled" || hooksAfterUninstall.description !== "independent fixture hook" ||
      hooksAfterUninstall.hooks?.PostToolUse?.length !== 1 || !configAfterUninstall.includes("hooks = true") ||
      !configAfterUninstall.includes("model_reasoning_effort = 'medium'")) {
    throw new Error("scoped uninstall did not preserve independent Codex configuration");
  }

  const evidence = {
    schemaVersion: 1,
    recordedAt: new Date().toISOString(),
    package: { name: installedManifest.name, version: installedManifest.version, artifact: basename(tarball), source: registryArtifact ? "npm-registry" : "local-pack", sha256: artifactSha256 },
    environment: { node: process.version, operatingSystem: process.platform, architecture: process.arch },
    ...(process.env.GITHUB_RUN_ID === undefined ? {} : {
      continuousIntegration: {
        provider: "github-actions",
        runId: process.env.GITHUB_RUN_ID,
        commit: process.env.GITHUB_SHA ?? "unavailable",
      },
    }),
    isolation: { temporaryInstallation: true, developmentDependencies: false, checkoutPathUsedAtRuntime: false, retainedSyntheticSource: false },
    entryPoints: { cli: "passed", parser: "passed", resident: "passed", hook: "passed" },
    installation: {
      preview: "passed",
      installed: "passed",
      idempotent: "passed",
      scopedUninstall: "passed",
      customQuotedHome: true,
      independentHookPreserved: true,
      fileSelection: "effective-settings",
      disableDispatchGate: "passed",
      update: {
        fromVersion: installedManifest.version,
        toVersion: targetPackage.version,
        preview: "passed",
        protocolIncompatibility: "rejected-before-write",
        partialRecovery: "resumed",
        previousHookRetainedOnPartialFailure: true,
        oldGrantFilesPreserved: true,
        credentialState: exerciseSecretService ? "preserved-external-native-store" : exerciseCredentialFixture ? "preserved-controlled-helper" : "not-configured",
        trustRecordsModified: false,
        processesStopped: false,
        controlledReviewAfterUpdate: "passed",
        independentHookAfterUpdate: "passed",
      },
    },
    review: { backend: "controlled-offline", submissions, adviceReturned: true, activity: packagedActivity },
    credentialLifecycle: credentialEvidence,
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
  progress("passed");
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  if (realCodexFailure !== undefined) throw realCodexFailure;
} finally {
  if (typeof residentPid === "number") {
    try { process.kill(residentPid, "SIGTERM"); } catch {}
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try { process.kill(residentPid, 0); }
      catch { break; }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
  if (previousDefaultKeychain !== undefined) {
    await run("security", ["default-keychain", "-s", previousDefaultKeychain], { cwd: temporary });
  }
  if (testKeychainPath !== undefined) {
    await run("security", ["delete-keychain", testKeychainPath], { cwd: temporary });
    delete process.env.REVIEW_TEST_KEYCHAIN_PATH;
  }
  if (secondaryTestKeychainPath !== undefined) {
    await run("security", ["delete-keychain", secondaryTestKeychainPath], { cwd: temporary });
  }
  await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => undefined);
  if (separateRuntime !== undefined) {
    await rm(separateRuntime, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => undefined);
  }
}
