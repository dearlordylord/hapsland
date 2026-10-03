import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";
import { configuredRules } from "../policy/rules.ts";
import { pathToFileURL } from "node:url";

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
export const cleanupPiFixtures = () => {
  for (const root of roots.splice(0)) {
    try {
      const owner = JSON.parse(readFileSync(join(root, "runtime", "owner.json"), "utf8")) as { pid: number };
      process.kill(owner.pid, "SIGTERM");
    } catch { /* A refused event need not start the resident. */ }
    rmSync(root, { recursive: true, force: true });
  }
};

export const fixture = (gated = false, control: Record<string, unknown> = {}, options: { commandFactory?: (cli: string, root: string) => readonly string[]; env?: NodeJS.ProcessEnv } = {}) => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-pi-boundary-"));
  roots.push(root);
  execFileSync("git", ["init", "--quiet", root]);
  const capturePath = join(root, "backend-calls");
  const handlers = new Map<string, Handler>();
  const reload = () => {
    handlers.clear();
    createPiExtension({
      ...(options.commandFactory !== undefined ? { command: options.commandFactory(installedCli, root) } : fixtureMode === "source" ? { command: installedCommand } : {}),
      env: {
        ...process.env,
        REVIEW_RESIDENT_DIR: join(root, "runtime"),
        REVIEW_STATE_PATH: join(root, "state"),
        REVIEW_USER_CONFIG_PATH: join(root, "user.json"),
        ...(gated ? { REVIEW_RESIDENT_BACKEND_GATE_PATH: join(root, "backend.gate"), REVIEW_RESIDENT_CONTROLLED: "1" } : {}),
        REVIEW_CONTROL_JSON: JSON.stringify({ capturePath, answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0.9 }])), ...control }),
        ...options.env,
      },
    })({ on: (name: string, handler: Handler) => { handlers.set(name, handler); } });
  };
  reload();
  const context = { cwd: root, sessionManager: { getSessionId: () => "pi-boundary-session" } };
  const call = async (name: string, event: unknown, ctx = context) => {
    const handler = handlers.get(name);
    expect(handler, `registered ${name} handler`).toBeDefined();
    return handler!(event, ctx);
  };
  return { root, capturePath, call, context, reload };
};

export const input = { path: "type.ts", edits: [{ oldText: "type Count = string", newText: "type OrderCount = number" }] };
export const before = { toolName: "edit", toolCallId: "native-edit-1", input };
export const result = {
  ...before, isError: false,
  content: [{ type: "text", text: "Successfully replaced text in type.ts." }],
  structuredContent: { nativeEditCount: 1 },
  details: { patch: "--- type.ts\n+++ type.ts\n@@ -1 +1 @@\n-type Count = string\n+type OrderCount = number\n" },
};

