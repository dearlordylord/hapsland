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
  profiles: ReadonlyArray<{ operatingSystem: string; architecture: string; descriptorFacility: string }>;
  requiredCommands: ReadonlyArray<string>;
};
const checks: Array<Check> = [];
const add = (name: string, ready: boolean, observed: string, required: string, action?: string) => {
  checks.push({ name, status: ready ? "ready" : "unsupported", observed, required, ...(ready || action === undefined ? {} : { action }) });
};
add("runtime", process.version === `v${declaration.runtime.version}`, process.version, `Node ${declaration.runtime.version}`, `install and invoke Node ${declaration.runtime.version}`);
const profile = declaration.profiles.find(({ operatingSystem, architecture }) =>
  operatingSystem === process.platform && architecture === process.arch
);
const supported = declaration.profiles.map(({ operatingSystem, architecture }) => `${operatingSystem}/${architecture}`).join(", ");
add("platform-profile", profile !== undefined, `${process.platform}/${process.arch}`, supported, `use one of the tested profiles: ${supported}`);

for (const command of declaration.requiredCommands) {
  try {
    const observed = execFileSync(command, ["--version"], { encoding: "utf8", timeout: 2_000, stdio: ["ignore", "pipe", "pipe"] }).trim().split("\n")[0] ?? command;
    add(command, true, observed, `${command} available`);
  } catch {
    add(command, false, "unavailable", `${command} available`, `install ${command} and ensure it is on PATH`);
  }
}

const descriptorFacility = profile?.descriptorFacility;
add(
  "stable-capture-facility",
  descriptorFacility !== undefined && existsSync(descriptorFacility),
  descriptorFacility !== undefined && existsSync(descriptorFacility) ? descriptorFacility : "unavailable",
  descriptorFacility ?? "descriptor facility for a tested profile",
  profile === undefined
    ? `use one of the tested profiles: ${supported}`
    : `make ${descriptorFacility} available; path-only source reads are unsupported`,
);

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
