#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type Check = {
  readonly name: string;
  readonly status: "ready" | "unsupported";
  readonly observed: string;
  readonly required: string;
  readonly action?: string;
};

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const declaration = JSON.parse(readFileSync(join(packageRoot, "package-runtime.json"), "utf8")) as {
  runtime: { name: string; version: string };
  operatingSystem: string;
  architecture: string;
};
const checks: Array<Check> = [];
const add = (name: string, ready: boolean, observed: string, required: string, action?: string) => {
  checks.push({ name, status: ready ? "ready" : "unsupported", observed, required, ...(ready || action === undefined ? {} : { action }) });
};
add("runtime", process.version === `v${declaration.runtime.version}`, process.version, `Node ${declaration.runtime.version}`, `install and invoke Node ${declaration.runtime.version}`);
add("operating-system", process.platform === declaration.operatingSystem, process.platform, declaration.operatingSystem, `run the package on ${declaration.operatingSystem}`);
add("architecture", process.arch === declaration.architecture, process.arch, declaration.architecture, `install the ${declaration.architecture} package on a ${declaration.architecture} host`);

for (const command of ["git", "flock"] as const) {
  try {
    const observed = execFileSync(command, ["--version"], { encoding: "utf8", timeout: 2_000, stdio: ["ignore", "pipe", "pipe"] }).trim().split("\n")[0] ?? command;
    add(command, true, observed, `${command} available`);
  } catch {
    add(command, false, "unavailable", `${command} available`, `install ${command} and ensure it is on PATH`);
  }
}

const procFd = "/proc/self/fd";
add("stable-capture-facility", existsSync(procFd), existsSync(procFd) ? procFd : "unavailable", procFd, "mount procfs at /proc; path-only source reads are unsupported");

const resident = join(packageRoot, "dist", "resident", "main.js");
try {
  accessSync(resident, constants.R_OK);
  add("resident-entry", true, resident, "readable packaged resident entry");
} catch {
  add("resident-entry", false, "unavailable", "readable packaged resident entry", "reinstall the package; dist/resident/main.js is missing or unreadable");
}

try {
  const { analyzeTypeFile } = await import("./direct-event/analyzer.ts");
  const parser = analyzeTypeFile("doctor.ts", "export interface Doctor { ready: boolean }");
  add("parser", parser.status === "analyzed", parser.status, "packaged TypeScript parser loads and analyzes", "reinstall the package for this exact OS/architecture; verify tree-sitter runtime dependencies were installed");
} catch (cause) {
  const code = typeof cause === "object" && cause !== null && "code" in cause ? String(cause.code) : "load-failed";
  add("parser", false, code, "packaged TypeScript parser loads and analyzes", "reinstall the package with lifecycle scripts enabled so tree-sitter can select or compile a compatible native module");
}

const ready = checks.every(({ status }) => status === "ready");
process.stdout.write(`${JSON.stringify({ schemaVersion: 1, status: ready ? "ready" : "unsupported", checks })}\n`);
process.exitCode = ready ? 0 : 1;
