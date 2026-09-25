import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { atomicInstallationFile } from "./atomic-installation-file.ts";

const MARKER = "--review-tool-owned=claude-v1";
const PROFILE = "2.1.218";
const OWNERSHIP_VERSION = 1;
type JsonObject = Record<string, unknown>;

export interface ClaudeInstallationRequest {
  readonly claudeHome?: string;
  readonly claudeExecutable?: string;
  readonly proposalDigest?: string;
}

interface OwnedRecord {
  readonly version: 1;
  readonly adapter: "claude";
  readonly home: string;
  readonly hookDigest: string;
  readonly command: string;
}

const object = (value: unknown): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const canonical = (value: unknown): string => Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : object(value)
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : JSON.stringify(value);
const encode = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const error = (cause: unknown) => cause instanceof Error ? cause.message : "installation failed";

const paths = (home: string) => ({
  settings: join(home, "settings.json"),
  ownership: join(home, ".realtime-review-tool", "claude-installation-v1.json"),
  lock: join(home, ".realtime-review-tool", "claude-installation.lock"),
});

const file = (path: string): string | undefined => {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile()) throw new Error(`configuration is not a regular file: ${path}`);
    return readFileSync(path, "utf8");
  } catch (cause) {
    if (object(cause) && cause.code === "ENOENT") return undefined;
    throw cause;
  }
};

const parseObject = (content: string | undefined, label: string): JsonObject => {
  if (content === undefined) return {};
  try {
    const value: unknown = JSON.parse(content);
    if (object(value)) return value;
  } catch { /* reported below */ }
  throw new Error(`${label} must contain a JSON object`);
};

const readRecord = (path: string): OwnedRecord | undefined => {
  const content = file(path);
  if (content === undefined) return undefined;
  const value = parseObject(content, "Claude ownership record");
  if (value.version !== OWNERSHIP_VERSION || value.adapter !== "claude" || typeof value.home !== "string" ||
      typeof value.hookDigest !== "string" || typeof value.command !== "string") {
    throw new Error("Claude ownership record has an unsupported shape");
  }
  return value as unknown as OwnedRecord;
};

const countMarker = (value: unknown): number => typeof value === "string"
  ? value.includes(MARKER) ? 1 : 0
  : Array.isArray(value) ? value.reduce<number>((sum, item) => sum + countMarker(item), 0)
    : object(value) ? Object.values(value).reduce<number>((sum, item) => sum + countMarker(item), 0) : 0;

const groups = (settings: JsonObject): ReadonlyArray<unknown> => {
  if (settings.hooks === undefined) return [];
  if (!object(settings.hooks)) throw new Error("Claude settings hooks must be an object");
  const post = settings.hooks.PostToolUse;
  if (post === undefined) return [];
  if (!Array.isArray(post)) throw new Error("Claude settings PostToolUse must be an array");
  return post;
};

const owned = (settings: JsonObject): { index: number; group: unknown } | undefined => {
  if (countMarker(settings) > 1) throw new Error("duplicate owned Claude hook markers require reconciliation");
  const found = groups(settings).map((group, index) => ({ group, index })).find(({ group }) => countMarker(group) === 1);
  if (countMarker(settings) === 1 && found === undefined) throw new Error("owned Claude marker is outside PostToolUse");
  return found;
};

const withGroups = (settings: JsonObject, next: ReadonlyArray<unknown>): JsonObject => {
  const hooks = { ...(settings.hooks as JsonObject | undefined) };
  if (next.length === 0) delete hooks.PostToolUse;
  else hooks.PostToolUse = next;
  const result = { ...settings };
  if (Object.keys(hooks).length === 0) delete result.hooks;
  else result.hooks = hooks;
  return result;
};

const host = (request: ClaudeInstallationRequest) => {
  const executable = request.claudeExecutable ?? "claude";
  const run = spawnSync(executable, ["--version"], { encoding: "utf8", timeout: 2_000 });
  const observed = run.status === 0 ? run.stdout.trim() : "unavailable";
  return { supported: observed === PROFILE || observed === `${PROFILE} (Claude Code)`, observed, required: `Claude Code ${PROFILE}` };
};

const inputs = (request: ClaudeInstallationRequest) => {
  const home = resolve(request.claudeHome ?? join(homedir(), ".claude"));
  const runtime = resolve(process.env.REVIEW_INSTALL_RUNTIME ?? process.execPath);
  let entrypoint = resolve(process.env.REVIEW_INSTALL_ENTRYPOINT ?? process.argv[1] ?? "dist/cli.js");
  try { entrypoint = realpathSync(entrypoint); } catch { /* readiness reports missing path */ }
  const command = `${quote(runtime)} ${quote(entrypoint)} --claude-hook --controlled-writer ${MARKER}`;
  const group = { matcher: "Edit|Write", hooks: [{ type: "command", command, timeout: 5 }] };
  return { home, runtime, entrypoint, command, group, paths: paths(home), host: host(request) };
};

const ready = (input: ReturnType<typeof inputs>) => {
  const runtime = spawnSync(input.runtime, ["-e", "process.stdout.write(process.version)"], { encoding: "utf8", timeout: 2_000 });
  const version = runtime.status === 0 ? runtime.stdout.trim() : "unavailable";
  let entrypointReady = false;
  try { entrypointReady = statSync(input.entrypoint).isFile(); } catch { /* reported as unavailable */ }
  return {
    supported: input.host.supported && version === "v24.20.0" && entrypointReady,
    host: input.host,
    runtime: { observed: version, required: "v24.20.0" },
    entrypoint: { path: input.entrypoint, ready: entrypointReady },
  };
};

type Kind = "install" | "update" | "uninstall";
const plan = (kind: Kind, request: ClaudeInstallationRequest) => {
  const input = inputs(request);
  const beforeSettings = file(input.paths.settings);
  const beforeRecord = file(input.paths.ownership);
  const settings = parseObject(beforeSettings, "Claude settings.json");
  const record = readRecord(input.paths.ownership);
  const current = owned(settings);
  if (record?.home !== undefined && record.home !== input.home) throw new Error("Claude ownership record belongs to another home");
  if (current !== undefined && record === undefined) throw new Error("owned Claude hook has no ownership record");
  if (record !== undefined && (current === undefined || digest(canonical(current.group)) !== record.hookDigest)) {
    throw new Error("owned Claude hook is missing or locally modified");
  }
  if (kind === "install" && record !== undefined) throw new Error("Claude integration already installed; use update");
  if (kind === "update" && record === undefined) throw new Error("Claude integration is not installed");
  const nextGroups = [...groups(settings)];
  if (kind === "uninstall") {
    if (current !== undefined) nextGroups.splice(current.index, 1);
  } else if (current === undefined) nextGroups.push(input.group);
  else nextGroups[current.index] = input.group;
  const afterSettings = kind === "uninstall" && record === undefined
    ? beforeSettings
    : encode(withGroups(settings, nextGroups));
  const afterRecord = kind === "uninstall" ? undefined : encode({
    version: OWNERSHIP_VERSION, adapter: "claude", home: input.home,
    hookDigest: digest(canonical(input.group)), command: input.command,
  } satisfies OwnedRecord);
  const proposalDigest = digest(canonical({ version: 1, adapter: "claude", operation: kind, home: input.home,
    beforeSettings: digest(beforeSettings ?? "<missing>"), beforeRecord: digest(beforeRecord ?? "<missing>"),
    afterSettings: digest(afterSettings ?? "<missing>"), afterRecord: digest(afterRecord ?? "<missing>") }));
  return { input, beforeSettings, beforeRecord, afterSettings, afterRecord, proposalDigest,
    noChange: beforeSettings === afterSettings && beforeRecord === afterRecord };
};

const resultError = (operation: string, cause: unknown, home?: string) => ({
  version: 1 as const, operation, status: "conflict" as const, home, error: { message: error(cause) },
});

const preview = (kind: Kind, request: ClaudeInstallationRequest) => {
  const operation = kind === "install" ? "install-preview" : kind === "update" ? "update-preview" : "uninstall";
  try {
    const input = inputs(request);
    const compatibility = ready(input);
    if (kind !== "uninstall" && !compatibility.supported) return {
      version: 1 as const, operation, status: "unsupported" as const, host: { adapter: "claude", home: input.home, compatibility },
    };
    const next = plan(kind, request);
    return { version: 1 as const, operation, status: "preview" as const,
      host: { adapter: "claude", home: input.home, compatibility },
      proposal: { digest: next.proposalDigest, changes: [
        ...(next.beforeSettings === next.afterSettings ? [] : [{ path: input.paths.settings, description: "owned PostToolUse hook" }]),
        ...(next.beforeRecord === next.afterRecord ? [] : [{ path: input.paths.ownership, description: "Claude ownership record" }]),
      ], ownedChanges: { event: "PostToolUse", matcher: "Edit|Write", command: input.command, timeoutSeconds: 5,
        ownershipRecord: input.paths.ownership } },
      installed: kind !== "uninstall", sourceEgressAuthorized: false,
      trust: { status: "native-confirmation-required", guidance: "Claude Code owns workspace trust and hook approval; open the repository normally and review native prompts." },
      pending: ["apply this proposal digest", "enable source egress for each repository separately"] };
  } catch (cause) { return resultError(operation, cause, request.claudeHome); }
};

const apply = (kind: Kind, request: ClaudeInstallationRequest) => {
  const operation = kind;
  try {
    const input = inputs(request);
    if (kind !== "uninstall" && !ready(input).supported) return { version: 1 as const, operation, status: "unsupported" as const, host: input.host };
    mkdirSync(dirname(input.paths.lock), { recursive: true, mode: 0o700 });
    try { mkdirSync(input.paths.lock); } catch { throw new Error("Claude installation is locked; retry after the other operation completes"); }
    try {
      const next = plan(kind, request);
      if (request.proposalDigest === undefined) return preview(kind, request);
      if (request.proposalDigest !== next.proposalDigest) return {
        version: 1 as const, operation, status: "proposal-mismatch" as const,
        error: { message: "Claude settings changed since preview; obtain a new proposal" },
      };
      if (next.noChange) return { version: 1 as const, operation, status: "already-current" as const };
      // Settings is applied last so a failed record write cannot enable a new hook.
      try {
        atomicInstallationFile(input.paths.ownership, next.afterRecord);
        atomicInstallationFile(input.paths.settings, next.afterSettings);
      } catch (cause) {
        try {
          if (file(input.paths.settings) === next.beforeSettings) atomicInstallationFile(input.paths.ownership, next.beforeRecord);
        } catch { /* preserve the original error and expose the partial state to inspection */ }
        throw cause;
      }
      return { version: 1 as const, operation, status: "complete" as const,
        sourceEgressAuthorized: false, trust: { status: "native-confirmation-required" } };
    } finally { rmSync(input.paths.lock, { recursive: true, force: true }); }
  } catch (cause) { return resultError(operation, cause, request.claudeHome); }
};

export const previewClaudeInstallation = (request: ClaudeInstallationRequest) => preview("install", request);
export const installClaudeIntegration = async (request: ClaudeInstallationRequest) => apply("install", request);
export const previewClaudeUpdate = (request: ClaudeInstallationRequest) => preview("update", request);
export const updateClaudeIntegration = async (request: ClaudeInstallationRequest) => apply("update", request);
export const uninstallClaudeIntegration = async (request: ClaudeInstallationRequest) =>
  request.proposalDigest === undefined ? preview("uninstall", request) : apply("uninstall", request);

export const inspectClaudeInstallation = (request: ClaudeInstallationRequest) => {
  try {
    const input = inputs(request);
    const settings = parseObject(file(input.paths.settings), "Claude settings.json");
    const record = readRecord(input.paths.ownership);
    const current = owned(settings);
    if (record === undefined && current === undefined) return { version: 1 as const, operation: "inspect-installation", status: "ready" as const, installed: false };
    if (record === undefined || current === undefined || record.home !== input.home || digest(canonical(current.group)) !== record.hookDigest) {
      throw new Error("owned Claude hook and ownership record disagree");
    }
    return { version: 1 as const, operation: "inspect-installation", status: "ready" as const, installed: true };
  } catch (cause) { return resultError("inspect-installation", cause, request.claudeHome); }
};

export const diagnoseClaudeIntegration = (request: ClaudeInstallationRequest) => {
  const input = inputs(request);
  const compatibility = ready(input);
  const inspection = inspectClaudeInstallation(request);
  const checks = [
    { stage: "host", status: compatibility.host.supported ? "ready" : "unsupported", observed: compatibility.host },
    { stage: "runtime", status: compatibility.runtime.observed === compatibility.runtime.required ? "ready" : "unsupported", observed: compatibility.runtime },
    { stage: "configuration-ownership", status: inspection.status === "conflict" ? "conflict" : inspection.installed ? "ready" : "missing", observed: inspection },
    { stage: "native-trust", status: "unknown", observed: "Claude Code workspace trust and hook approval are host-owned" },
    { stage: "repository-egress-consent", status: "unknown", observed: "inspect the separate repository consent state" },
  ];
  return { version: 1 as const, operation: "doctor" as const,
    status: checks.some((check) => check.status === "conflict" || check.status === "unsupported" || check.status === "missing") ? "not-ready" as const : "unknown" as const,
    offline: true as const, readOnly: true as const, providerCalls: 0 as const, checks };
};
