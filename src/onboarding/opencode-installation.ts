import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { renderOpenCodePlugin } from "../hosts/opencode/plugin.ts";
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
  return { home, runtime, entrypoint, compatibility, paths: paths(home), plugin: renderOpenCodePlugin(runtime, entrypoint) };
};
type Kind = "install" | "update" | "uninstall";
const plan = (kind: Kind, request: OpenCodeInstallationRequest) => {
  const input = inputs(request);
  const beforePlugin = read(input.paths.plugin);
  const beforeRecord = read(input.paths.ownership);
  const ownership = record(beforeRecord);
  if (ownership !== undefined && (ownership.home !== input.home || beforePlugin === undefined || digest(beforePlugin) !== ownership.pluginDigest)) {
    throw new Error("owned OpenCode plugin is missing or locally modified");
  }
  if (beforePlugin !== undefined && ownership === undefined) throw new Error("OpenCode plugin path is already occupied");
  if (kind === "install" && ownership !== undefined) throw new Error("OpenCode integration already installed; use update");
  if (kind === "update" && ownership === undefined) throw new Error("OpenCode integration is not installed");
  const afterPlugin = kind === "uninstall" ? undefined : input.plugin;
  const afterRecord = kind === "uninstall" ? undefined : `${JSON.stringify({ version: 1, adapter: ADAPTER,
    home: input.home, pluginDigest: digest(input.plugin), runtime: input.runtime, entrypoint: input.entrypoint } satisfies OwnedRecord, null, 2)}\n`;
  const proposalDigest = digest(JSON.stringify([kind, input.home, digest(beforePlugin ?? "<missing>"),
    digest(beforeRecord ?? "<missing>"), digest(afterPlugin ?? "<missing>"), digest(afterRecord ?? "<missing>")]));
  return { input, beforePlugin, beforeRecord, afterPlugin, afterRecord, proposalDigest,
    noChange: beforePlugin === afterPlugin && beforeRecord === afterRecord };
};
const conflict = (operation: string, cause: unknown) => ({ version: 1 as const, operation, status: "conflict" as const,
  error: { message: message(cause) } });
const preview = (kind: Kind, request: OpenCodeInstallationRequest) => {
  const operation = kind === "uninstall" ? "uninstall-preview" : `${kind}-preview`;
  try {
    const next = plan(kind, request);
    if (kind !== "uninstall" && !next.input.compatibility.supported) return { version: 1 as const, operation,
      status: "unsupported" as const, host: { adapter: ADAPTER, compatibility: next.input.compatibility } };
    return { version: 1 as const, operation, status: "preview" as const,
      host: { adapter: ADAPTER, home: next.input.home, compatibility: next.input.compatibility },
      proposal: { digest: next.proposalDigest, changes: [
        ...(next.beforePlugin === next.afterPlugin ? [] : [{ path: next.input.paths.plugin, description: "owned global plugin" }]),
        ...(next.beforeRecord === next.afterRecord ? [] : [{ path: next.input.paths.ownership, description: "ownership record" }]),
      ], ownedChanges: { plugin: next.input.paths.plugin, hook: "tool.execute.after", tools: ["edit", "write"],
        timeoutMilliseconds: 4500 } },
      installed: kind !== "uninstall", sourceEgressAuthorized: false,
      trust: { status: "host-owned", guidance: "OpenCode controls plugin loading; repository source egress needs separate consent." },
      unsupported: ["existing-file write", "edit without unique changed whole lines", "OpenCode --pure",
        "shell writes", "file.edited", "OpenCode v2"],
      pending: ["apply this proposal digest", "enable source egress for each repository separately"] };
  } catch (cause) { return conflict(operation, cause); }
};
const apply = (kind: Kind, request: OpenCodeInstallationRequest) => {
  try {
    const input = inputs(request);
    if (kind !== "uninstall" && !input.compatibility.supported) return { version: 1 as const,
      operation: kind, status: "unsupported" as const, host: input.compatibility };
    mkdirSync(dirname(input.paths.lock), { recursive: true, mode: 0o700 });
    try { mkdirSync(input.paths.lock); } catch { throw new Error("OpenCode installation is locked"); }
    try {
      const next = plan(kind, request);
      if (request.proposalDigest === undefined) return preview(kind, request);
      if (request.proposalDigest !== next.proposalDigest) return { version: 1 as const, operation: kind,
        status: "proposal-mismatch" as const, error: { message: "OpenCode configuration changed since preview" } };
      if (next.noChange) return { version: 1 as const, operation: kind, status: "already-current" as const };
      try {
        if (kind === "uninstall") {
          atomicInstallationFile(input.paths.plugin, undefined);
          atomicInstallationFile(input.paths.ownership, undefined);
        } else {
          atomicInstallationFile(input.paths.ownership, next.afterRecord);
          atomicInstallationFile(input.paths.plugin, next.afterPlugin);
        }
      } catch (cause) {
        if (read(input.paths.plugin) === next.beforePlugin) atomicInstallationFile(input.paths.ownership, next.beforeRecord);
        throw cause;
      }
      return { version: 1 as const, operation: kind, status: "complete" as const, sourceEgressAuthorized: false };
    } finally { rmSync(input.paths.lock, { recursive: true, force: true }); }
  } catch (cause) { return conflict(kind, cause); }
};
export const previewOpenCodeInstallation = (request: OpenCodeInstallationRequest) => preview("install", request);
export const installOpenCodeIntegration = async (request: OpenCodeInstallationRequest) => apply("install", request);
export const previewOpenCodeUpdate = (request: OpenCodeInstallationRequest) => preview("update", request);
export const updateOpenCodeIntegration = async (request: OpenCodeInstallationRequest) => apply("update", request);
export const uninstallOpenCodeIntegration = async (request: OpenCodeInstallationRequest) =>
  request.proposalDigest === undefined ? preview("uninstall", request) : apply("uninstall", request);
export const inspectOpenCodeInstallation = (request: OpenCodeInstallationRequest) => {
  try {
    const next = plan("uninstall", request);
    return { version: 1 as const, operation: "inspect-installation" as const, status: "ready" as const,
      installed: next.beforeRecord !== undefined };
  } catch (cause) { return conflict("inspect-installation", cause); }
};
export const diagnoseOpenCodeIntegration = (request: OpenCodeInstallationRequest) => {
  const input = inputs(request);
  const inspection = inspectOpenCodeInstallation(request);
  const checks = [
    { stage: "host", status: input.compatibility.host.observed === PROFILE ? "ready" : "unsupported", observed: input.compatibility.host },
    { stage: "runtime", status: input.compatibility.runtime.observed === "v24.20.0" ? "ready" : "unsupported", observed: input.compatibility.runtime },
    { stage: "configuration-ownership", status: inspection.status === "conflict" ? "conflict" : inspection.installed ? "ready" : "missing", observed: inspection },
    { stage: "plugin-loading", status: "unknown", observed: "OpenCode host-owned; --pure disables plugins" },
    { stage: "repository-egress-consent", status: "unknown", observed: "inspect separate repository consent state" },
  ];
  return { version: 1 as const, operation: "doctor" as const,
    status: checks.some((check) => ["conflict", "unsupported", "missing"].includes(check.status)) ? "not-ready" as const : "unknown" as const,
    offline: true as const, readOnly: true as const, providerCalls: 0 as const, checks };
};
