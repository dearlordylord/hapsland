import { spawn, type ChildProcess } from "node:child_process";
import { execFileSync } from "../../scripts/test-harness/process.mjs";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect } from "vitest";
import { configuredRules } from "../policy/rules.ts";
import { pathToFileURL } from "node:url";
import { residentRequestEffect } from "../resident/client.ts";
import { residentPaths } from "../resident/paths.ts";
import { runClient } from "./client-runtime.ts";
import type { ResidentResponse } from "../resident/protocol.ts";

let createPiExtension: typeof import("../pi/extension.ts")["createPiExtension"];
export let installedCli: string;
export let installedCommand: readonly string[];
let fixtureMode: "source" | "installed";
let packageRoot: string | undefined;
export const setupInstalledPi = async (mode: "source" | "installed" = "installed") => {
  fixtureMode = mode;
  if (mode === "source") {
    installedCli = join(process.cwd(), "src/cli.ts");
    installedCommand = [process.execPath, "--experimental-strip-types", installedCli];
    createPiExtension = (await import("../pi/extension.ts")).createPiExtension;
    return;
  }
  packageRoot = mkdtempSync(join(tmpdir(), "hapsland-pi-installed-package-"));
  const artifacts = join(packageRoot, "artifacts");
  mkdirSync(artifacts);
  execFileSync("npm", ["run", "build"], { cwd: process.cwd(), stdio: "pipe", timeout: 120_000 });
  const packed = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts=true", "--json", "--pack-destination", artifacts], { encoding: "utf8", timeout: 120_000 })) as { filename: string }[];
  const installation = join(packageRoot, "installation");
  execFileSync("npm", ["install", "--global=false", "--legacy-peer-deps", "--ignore-scripts=true", "--prefer-offline", "--omit=dev", "--prefix", installation, join(artifacts, packed[0]!.filename)], { cwd: packageRoot, stdio: "pipe", timeout: 120_000 });
  const installed = join(installation, "node_modules/@hapsland/hapsland");
  installedCli = join(installed, "dist/cli.js");
  installedCommand = [join(installation, "node_modules/.bin/hapsland")];
  const extension = await import(/* @vite-ignore */ pathToFileURL(join(installed, "dist/pi/extension.js")).href);
  createPiExtension = extension.createPiExtension;
};
export const cleanupInstalledPi = () => {
  if (packageRoot !== undefined) rmSync(packageRoot, { recursive: true, force: true });
  packageRoot = undefined;
};

type Handler = (event: any, context: any) => Promise<any>;
const roots: string[] = [];
const preparedResidents = new Map<string, ChildProcess>();
const residentMains = new Map<string, string>();
const fixtureOwnerPid = (path: string): number | undefined => {
  try {
    const { pid } = JSON.parse(readFileSync(path, "utf8")) as { pid: number };
    return Number.isInteger(pid) && pid > 1 && pid !== process.pid ? pid : undefined;
  } catch { return undefined; }
};
const linuxFixtureProcess = (pid: number, main: string, directory: string) => {
  const args = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0");
  return args.length === 4 && args[3] === "" && realpathSync(args[1]!) === realpathSync(main) && realpathSync(args[2]!) === realpathSync(directory);
};
const fixtureProcessRunning = (pid: number, main: string, directory: string): boolean => {
  try {
    if (process.platform === "linux") return linuxFixtureProcess(pid, main, directory);
    const command = execFileSync("ps", ["-ww", "-p", String(pid), "-o", "command="], { encoding: "utf8", timeout: 1_000, stdio: ["ignore", "pipe", "ignore"] }).trim();
    return [main, realpathSync(main)].some(entry =>
      [directory, realpathSync(directory)].some(root => command.endsWith(`node ${entry} ${root}`)));
  } catch { return false; }
};
const signalFixtureProcess = (pid: number, signal: NodeJS.Signals) => {
  try { process.kill(pid, signal); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
};
const waitForFixtureExit = async (pid: number, main: string, directory: string) => {
  const deadline = Date.now() + 3_000;
  while (fixtureProcessRunning(pid, main, directory) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};
const stopFixtureProcess = async (pid: number, main: string, directory: string) => {
  if (!fixtureProcessRunning(pid, main, directory)) return;
  signalFixtureProcess(pid, "SIGTERM");
  await waitForFixtureExit(pid, main, directory);
  if (!fixtureProcessRunning(pid, main, directory)) return;
  signalFixtureProcess(pid, "SIGKILL");
  await waitForFixtureExit(pid, main, directory);
  if (fixtureProcessRunning(pid, main, directory)) throw new Error("Pi fixture resident did not terminate");
};
const stopPreparedResident = async (child: ChildProcess) => {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>(resolve => {
    const timer = setTimeout(() => child.kill("SIGKILL"), 3_000);
    child.once("close", () => { clearTimeout(timer); resolve(); });
    child.kill("SIGTERM");
  });
};
export const cleanupPiFixtures = async () => {
  for (const root of roots.splice(0)) {
    const prepared = preparedResidents.get(root);
    preparedResidents.delete(root);
    if (prepared !== undefined) await stopPreparedResident(prepared);
    const directory = join(root, "runtime");
    const main = residentMains.get(root)!;
    // The lock owner exists before the server publishes its endpoint owner.
    const pids = new Set([fixtureOwnerPid(join(directory, "owner.json")), fixtureOwnerPid(join(directory, "owner.lock", "owner.json"))]);
    for (const pid of pids) if (pid !== undefined) await stopFixtureProcess(pid, main, directory);
    residentMains.delete(root);
    rmSync(root, { recursive: true, force: true });
  }
};

const waitForResidentStats = async (root: string, ready: (stats: Extract<ResidentResponse, { status: "stats" }>) => boolean) => {
  const paths = residentPaths(join(root, "runtime"));
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const owner = JSON.parse(readFileSync(paths.owner, "utf8")) as { lifetime: string };
      const stats = await runClient(residentRequestEffect(paths, { requestRoute: "shared", operation: "stats", lifetime: owner.lifetime }));
      if (stats.status === "stats" && ready(stats)) return;
    } catch { /* The exact fixture resident may still be starting. */ }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error("Pi fixture resident did not reach the required IPC state");
};

export const fixture = (gated = false, control: Record<string, unknown> = {}, options: { commandFactory?: (cli: string, root: string) => readonly string[]; env?: NodeJS.ProcessEnv } = {}) => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-pi-boundary-"));
  roots.push(root);
  residentMains.set(root, join(dirname(installedCli), "resident", fixtureMode === "source" ? "main.ts" : "main.js"));
  execFileSync("git", ["init", "--quiet", root]);
  const capturePath = join(root, "backend-calls");
  const handlers = new Map<string, Handler>();
  const environment = () => ({
    ...process.env,
    REVIEW_RESIDENT_DIR: join(root, "runtime"),
    REVIEW_STATE_PATH: join(root, "state"),
    REVIEW_USER_CONFIG_PATH: join(root, "user.json"),
    ...(gated ? { REVIEW_RESIDENT_BACKEND_GATE_PATH: join(root, "backend.gate"), REVIEW_RESIDENT_CONTROLLED: "1" } : {}),
    REVIEW_CONTROL_JSON: JSON.stringify({ capturePath, answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0.9 }])), ...control }),
    ...options.env,
  });
  const reload = () => {
    handlers.clear();
    createPiExtension({
      ...(options.commandFactory !== undefined ? { command: options.commandFactory(installedCli, root) } : fixtureMode === "source" ? { command: installedCommand } : {}),
      env: environment(),
    })({ on: (name: string, handler: Handler) => { handlers.set(name, handler); } });
  };
  reload();
  const context = { cwd: root, sessionManager: { getSessionId: () => "pi-boundary-session" } };
  const call = async (name: string, event: unknown, ctx = context) => {
    const handler = handlers.get(name);
    expect(handler, `registered ${name} handler`).toBeDefined();
    return handler!(event, ctx);
  };
  const prepareResident = async () => {
    // Opt-in healthy-resident precondition for lifecycle witnesses. Cold-start
    // and refusal tests still exercise their original first-event startup.
    const directory = join(root, "runtime");
    const command = fixtureMode === "source"
      ? [process.execPath, join(dirname(installedCli), "resident", "main.ts"), directory]
      : [join(dirname(installedCommand[0]!), "hapsland-resident"), directory];
    const child = spawn(command[0]!, command.slice(1), { env: environment(), stdio: "ignore" });
    preparedResidents.set(root, child);
    await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
    await waitForResidentStats(root, () => true);
  };
  const waitForWork = (count: number) => waitForResidentStats(root, stats => stats.queued + stats.running === count);
  return { root, capturePath, call, context, reload, prepareResident, waitForWork };
};

export const input = { path: "type.ts", edits: [{ oldText: "type Count = string", newText: "type OrderCount = number" }] };
export const before = { toolName: "edit", toolCallId: "native-edit-1", input };
export const result = {
  ...before, isError: false,
  content: [{ type: "text", text: "Successfully replaced text in type.ts." }],
  structuredContent: { nativeEditCount: 1 },
  details: { patch: "--- type.ts\n+++ type.ts\n@@ -1 +1 @@\n-type Count = string\n+type OrderCount = number\n" },
};
