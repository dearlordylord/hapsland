import { Effect } from "effect";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { atomicInstallationFile } from "./atomic-installation-file.ts";

const PROFILE = "1.14.44";
const ADAPTER = "opencode";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const message = (cause: unknown) => cause instanceof Error ? cause.message : "installation failed";

export interface OpenCodeInstallationRequest {
  readonly opencodeConfigHome?: string;
  readonly opencodeExecutable?: string;
  readonly proposalDigest?: string;
}

type OwnedRecord = { version: 1; adapter: "opencode"; home: string; pluginDigest: string; runtime: string; entrypoint: string };
const paths = (home: string) => ({
  plugin: join(home, "plugins", "hapsland.mjs"),
  ownership: join(home, ".realtime-review-tool", "opencode-installation-v1.json"),
  lock: join(home, ".realtime-review-tool", "opencode-installation.lock"),
});
const read = (path: string): string | undefined => {
  try {
    if (!statSync(path).isFile()) throw new Error(`not a regular file: ${path}`);
    return readFileSync(path, "utf8");
  } catch (cause) {
    if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT") return undefined;
    throw cause;
  }
};
const record = (content: string | undefined): OwnedRecord | undefined => {
  if (content === undefined) return undefined;
  let value: unknown;
  try { value = JSON.parse(content); } catch { throw new Error("OpenCode ownership record is malformed"); }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("OpenCode ownership record is malformed");
  const r = value as Record<string, unknown>;
  if (r.version !== 1 || r.adapter !== ADAPTER || typeof r.home !== "string" ||
      typeof r.pluginDigest !== "string" || typeof r.runtime !== "string" || typeof r.entrypoint !== "string") {
    throw new Error("OpenCode ownership record has an unsupported shape");
  }
  return r as OwnedRecord;
};
const inputs = (request: OpenCodeInstallationRequest) => {
  const home = resolve(request.opencodeConfigHome ?? join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "opencode"));
  const runtime = resolve(process.env.REVIEW_INSTALL_RUNTIME ?? process.execPath);
  const entrypoint = resolve(process.env.REVIEW_INSTALL_ENTRYPOINT ?? process.argv[1] ?? "dist/cli.js");
  const hostRun = spawnSync(request.opencodeExecutable ?? "opencode", ["--version"], { encoding: "utf8", timeout: 2_000 });
  const observed = hostRun.status === 0 ? hostRun.stdout.trim() : "unavailable";
  const runtimeRun = spawnSync(runtime, ["-e", "process.stdout.write(process.version)"], { encoding: "utf8", timeout: 2_000 });
  const runtimeObserved = runtimeRun.status === 0 ? runtimeRun.stdout.trim() : "unavailable";
  const compatibility = { supported: observed === PROFILE && runtimeObserved === "v24.20.0" && existsSync(entrypoint),
    host: { observed, required: PROFILE }, runtime: { observed: runtimeObserved, required: "v24.20.0" },
    entrypoint: { path: entrypoint, ready: existsSync(entrypoint) } };
  return { home, compatibility, paths: paths(home) };
};
const planUninstall = (request: OpenCodeInstallationRequest) => {
  const input = inputs(request);
  const beforePlugin = read(input.paths.plugin);
  const beforeRecord = read(input.paths.ownership);
  const ownership = record(beforeRecord);
  if (ownership !== undefined && (ownership.home !== input.home || beforePlugin === undefined || digest(beforePlugin) !== ownership.pluginDigest)) {
    throw new Error("owned OpenCode plugin is missing or locally modified");
  }
  if (beforePlugin !== undefined && ownership === undefined) throw new Error("OpenCode plugin path is already occupied");
  const proposalDigest = digest(JSON.stringify(["uninstall", input.home, digest(beforePlugin ?? "<missing>"),
    digest(beforeRecord ?? "<missing>"), digest("<missing>"), digest("<missing>")]));
  return { input, beforePlugin, beforeRecord, proposalDigest,
    noChange: beforePlugin === undefined && beforeRecord === undefined };
};
const conflict = (operation: string, cause: unknown) => ({ version: 1 as const, operation, status: "conflict" as const,
  error: { message: message(cause) } });
const unsupported = (operation: string) => ({
  version: 1 as const, operation, status: "unsupported" as const,
  host: { adapter: ADAPTER },
  error: { message: "OpenCode review is unavailable until its pre-edit permit lifecycle is implemented." },
});
const previewUninstall = (request: OpenCodeInstallationRequest) => {
  const operation = "uninstall-preview";
  try {
    const next = planUninstall(request);
    return { version: 1 as const, operation, status: "preview" as const,
      host: { adapter: ADAPTER, home: next.input.home, compatibility: next.input.compatibility },
      proposal: { digest: next.proposalDigest, changes: [
        ...(next.beforePlugin === undefined ? [] : [{ path: next.input.paths.plugin, description: "owned global plugin" }]),
        ...(next.beforeRecord === undefined ? [] : [{ path: next.input.paths.ownership, description: "ownership record" }]),
      ], ownedChanges: { plugin: next.input.paths.plugin, hook: "tool.execute.after", tools: ["edit", "write"],
        timeoutMilliseconds: 4500 } },
      installed: false,
      trust: { status: "host-owned", guidance: "OpenCode controls plugin loading; effective file settings and credentials govern review." },
      unsupported: ["existing-file write", "edit without unique changed whole lines", "OpenCode --pure",
        "shell writes", "file.edited", "OpenCode v2"],
      pending: ["apply this proposal digest to remove the owned integration"] };
  } catch (cause) { return conflict(operation, cause); }
};
const applyUninstall = (request: OpenCodeInstallationRequest) => {
  try {
    const input = inputs(request);
    mkdirSync(dirname(input.paths.lock), { recursive: true, mode: 0o700 });
    try { mkdirSync(input.paths.lock); } catch { throw new Error("OpenCode installation is locked"); }
    try {
      const next = planUninstall(request);
      if (request.proposalDigest === undefined) return previewUninstall(request);
      if (request.proposalDigest !== next.proposalDigest) return { version: 1 as const, operation: "uninstall" as const,
        status: "proposal-mismatch" as const, error: { message: "OpenCode configuration changed since preview" } };
      if (next.noChange) return { version: 1 as const, operation: "uninstall" as const, status: "already-current" as const };
      try {
        atomicInstallationFile(input.paths.plugin, undefined);
        atomicInstallationFile(input.paths.ownership, undefined);
      } catch (cause) {
        if (read(input.paths.plugin) === next.beforePlugin) atomicInstallationFile(input.paths.ownership, next.beforeRecord);
        throw cause;
      }
      return { version: 1 as const, operation: "uninstall" as const, status: "complete" as const };
    } finally { rmSync(input.paths.lock, { recursive: true, force: true }); }
  } catch (cause) { return conflict("uninstall", cause); }
};
export const previewOpenCodeInstallation = (_request: OpenCodeInstallationRequest) => unsupported("install-preview");
export const installOpenCodeIntegration = Effect.fn("OpenCodeInstallation.install")((_request: OpenCodeInstallationRequest) => Effect.succeed(unsupported("install")));
export const previewOpenCodeUpdate = (_request: OpenCodeInstallationRequest) => unsupported("update-preview");
export const updateOpenCodeIntegration = Effect.fn("OpenCodeInstallation.update")((_request: OpenCodeInstallationRequest) => Effect.succeed(unsupported("update")));
export const uninstallOpenCodeIntegration = Effect.fn("OpenCodeInstallation.uninstall")((request: OpenCodeInstallationRequest) =>
  Effect.sync(() => request.proposalDigest === undefined ? previewUninstall(request) : applyUninstall(request)));
export const inspectOpenCodeInstallation = (request: OpenCodeInstallationRequest) => {
  try {
    const next = planUninstall(request);
    return { version: 1 as const, operation: "inspect-installation" as const, status: "ready" as const,
      installed: next.beforeRecord !== undefined };
  } catch (cause) { return conflict("inspect-installation", cause); }
};
export const diagnoseOpenCodeIntegration = (request: OpenCodeInstallationRequest) => {
  const input = inputs(request);
  const inspection = inspectOpenCodeInstallation(request);
  const checks = [
    { stage: "pre-edit-permit", status: "unsupported", observed: "OpenCode has no supported pre-edit permit lifecycle; review hooks are inactive" },
    { stage: "host", status: input.compatibility.host.observed === PROFILE ? "ready" : "unsupported", observed: input.compatibility.host },
    { stage: "runtime", status: input.compatibility.runtime.observed === "v24.20.0" ? "ready" : "unsupported", observed: input.compatibility.runtime },
    { stage: "configuration-ownership", status: inspection.status === "conflict" ? "conflict" : inspection.installed ? "ready" : "missing", observed: inspection },
    { stage: "plugin-loading", status: "unknown", observed: "OpenCode host-owned; --pure disables plugins" },
    { stage: "file-selection", status: "unknown", observed: "inspect effective file settings" },
  ];
  return { version: 1 as const, operation: "doctor" as const,
    status: checks.some((check) => ["conflict", "unsupported", "missing"].includes(check.status)) ? "not-ready" as const : "unknown" as const,
    offline: true as const, readOnly: true as const, providerCalls: 0 as const, checks };
};
